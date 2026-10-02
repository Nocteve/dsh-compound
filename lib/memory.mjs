import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const CORPUS_DIRECTORY = 'docs/solutions/dsh-compound';
export const LIMITS = Object.freeze({ recordBytes: 65536, inputBytes: 32768, sourceBytes: 8 * 1024 * 1024, files: 32, records: 500, scanBytes: 4 * 1024 * 1024, results: 10, warnings: 20 });
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const INTERNAL = new Set(['.git', '.hg', '.svn', '.codex', '.claude', '.agents', '.aws', '.ssh', '.gnupg', '.dsh', '.deepseek']);
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function textField(value, name, maximum = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail('INVALID_INPUT', `${name} must be a nonempty string of at most ${maximum} characters without control characters`);
  return value.trim();
}

export function validateId(value) {
  if (typeof value !== 'string' || value.length > 100 || !ID.test(value) || RESERVED.test(value)) fail('INVALID_ID', 'id must be a lowercase kebab-case slug of at most 100 characters');
  return value;
}

function relativePath(value) {
  if (typeof value !== 'string' || value.length > 512 || !value || /[\u0000-\u001f\u007f:*?"<>|]/u.test(value)) fail('UNSAFE_PATH', 'Evidence paths must be safe workspace-relative file paths');
  const normalized = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value)) fail('UNSAFE_PATH', 'Absolute evidence paths are not allowed');
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[. ]$/u.test(segment) || INTERNAL.has(segment.toLowerCase()) || RESERVED.test(segment))) fail('UNSAFE_PATH', 'Traversal, internal directories, and ambiguous path names are not allowed');
  if (normalized.toLowerCase() === CORPUS_DIRECTORY || normalized.toLowerCase().startsWith(`${CORPUS_DIRECTORY}/`)) fail('UNSAFE_PATH', 'A learning record cannot use the learning corpus as source evidence');
  return normalized;
}

export function validateDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) fail('INVALID_INPUT', 'Draft must be a JSON object');
  const tags = draft.tags;
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 12) fail('INVALID_INPUT', 'tags must contain 1–12 strings');
  if (!Array.isArray(draft.files) || draft.files.length < 1 || draft.files.length > LIMITS.files) fail('INVALID_INPUT', `files must contain 1–${LIMITS.files} workspace files`);
  const files = draft.files.map(relativePath);
  if (new Set(files.map(value => process.platform === 'win32' ? value.toLowerCase() : value)).size !== files.length) fail('INVALID_INPUT', 'Duplicate evidence paths are not allowed');
  return {
    id: validateId(draft.id), title: textField(draft.title, 'title', 160),
    tags: [...new Set(tags.map(tag => textField(tag, 'tag', 64)))],
    problem: textField(draft.problem, 'problem'), rootCause: textField(draft.rootCause, 'rootCause'),
    resolution: textField(draft.resolution, 'resolution'), whenToUse: textField(draft.whenToUse, 'whenToUse', 2000),
    verification: { command: textField(draft.verification?.command, 'verification.command', 2000), result: textField(draft.verification?.result, 'verification.result', 2000) }, files,
  };
}

async function workspaceRoot(workspace) {
  if (typeof workspace !== 'string' || !workspace.trim()) fail('INVALID_WORKSPACE', 'An explicit workspace directory is required');
  const absolute = path.resolve(workspace);
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || !info.isDirectory()) fail('UNSAFE_PATH', 'Workspace must be an existing directory, not a symbolic link');
  return realpath(absolute);
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Every component is checked, including junctions on Windows. This is a local
// file helper, not a sandbox against concurrent hostile filesystem changes.
async function checkedPath(root, relative, { directories = false, create = false } = {}) {
  const parts = relative.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (!inside(root, current)) fail('UNSAFE_PATH', 'Path is outside the workspace');
    let info;
    try { info = await lstat(current); } catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      try { await mkdir(current); } catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
      info = await lstat(current);
    }
    if (info.isSymbolicLink()) fail('UNSAFE_PATH', `Symbolic links are not allowed: ${relative}`);
    if (!inside(root, await realpath(current))) fail('UNSAFE_PATH', 'Resolved path is outside the workspace');
    if (index < parts.length - 1 || directories) {
      if (!info.isDirectory()) fail('UNSAFE_PATH', `Expected a directory: ${relative}`);
    } else if (!info.isFile()) fail('UNSAFE_PATH', `Expected a regular file: ${relative}`);
  }
  return current;
}

async function boundedRead(filename, maximum) {
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail('UNSAFE_PATH', 'Expected a regular file');
    if (stat.size > maximum) fail('TOO_LARGE', `File exceeds ${maximum} bytes`);
    const bytes = Buffer.alloc(Math.min(stat.size + 1, maximum + 1));
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maximum || length > stat.size) fail('TOO_LARGE', 'File grew during bounded read; retry after writes finish');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function fingerprint(root, relative) {
  const filename = await checkedPath(root, relative);
  return sha256(await boundedRead(filename, LIMITS.sourceBytes));
}

export async function readDraftInput({ workspace, input }) {
  const root = await workspaceRoot(workspace);
  if (typeof input !== 'string' || !input) fail('INVALID_INPUT', 'An input JSON file is required');
  const filename = path.resolve(input);
  const lexicalRoot = path.resolve(workspace);
  const inputRoot = inside(lexicalRoot, filename) ? lexicalRoot : inside(root, filename) ? root : undefined;
  if (!inputRoot) fail('UNSAFE_PATH', 'Input JSON must be inside the selected workspace');
  const relative = relativePath(path.relative(inputRoot, filename));
  const checked = await checkedPath(root, relative);
  try { return JSON.parse((await boundedRead(checked, LIMITS.inputBytes)).toString('utf8').replace(/^\uFEFF/u, '')); }
  catch (error) { if (error instanceof SyntaxError) fail('INVALID_INPUT', 'Input file is not valid JSON'); throw error; }
}

function render(record) {
  const lines = [
    '---', `dsh_compound: ${JSON.stringify(record)}`, '---', '', `# ${record.title}`, '',
    '> Verification below is self-reported. This helper did not execute the command or verify correctness.', '',
    '## Problem', '', record.problem, '', '## Root cause', '', record.rootCause, '',
    '## Resolution', '', record.resolution, '', '## When to use', '', record.whenToUse, '',
    '## Reported verification', '', `Command: ${record.verification.command}`, '', `Result: ${record.verification.result}`, '',
    '## Source fingerprints', '', ...record.files.map(file => `- ${file.path} — SHA-256: ${file.sha256}`), '',
    'Matching hashes mean only that these files have not changed since capture; they do not prove the lesson is correct.', '',
  ];
  return lines.join('\n');
}

function parseRecord(bytes, expectedId) {
  const content = bytes.toString('utf8').replace(/^\uFEFF/u, '');
  const match = /^---\r?\ndsh_compound: (\{[^\r\n]*\})\r?\n---(?:\r?\n|$)/u.exec(content);
  if (!match) fail('MALFORMED_RECORD', 'Expected one dsh_compound JSON field in frontmatter');
  let record;
  try { record = JSON.parse(match[1]); } catch { fail('MALFORMED_RECORD', 'Invalid record JSON'); }
  if (record.schemaVersion !== 1 || record.id !== expectedId || !Array.isArray(record.files)) fail('MALFORMED_RECORD', 'Unsupported schema or mismatched record id');
  if (record.verification?.source !== 'self-reported' || record.verification?.executedByHelper !== false) fail('MALFORMED_RECORD', 'Record must identify verification as self-reported');
  validateDraft({ ...record, files: record.files.map(file => file?.path) });
  if (record.files.some(file => !DIGEST.test(file?.sha256 ?? ''))) fail('MALFORMED_RECORD', 'Invalid source fingerprint');
  for (const field of ['createdAt', 'updatedAt']) {
    if (typeof record[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record[field]) || !Number.isFinite(Date.parse(record[field]))) fail('MALFORMED_RECORD', 'Invalid record timestamp');
  }
  const body = content.slice(match[0].length).trim();
  const expectedBody = render(record).split('\n').slice(3).join('\n').trim();
  const contentStatus = body.replaceAll('\r\n', '\n') === expectedBody.replaceAll('\r\n', '\n') ? 'consistent' : 'modified';
  return { record, body, contentStatus, digest: sha256(bytes), bytes: bytes.length };
}

async function readRecord(root, id) {
  validateId(id);
  const relative = `${CORPUS_DIRECTORY}/${id}.md`;
  const filename = await checkedPath(root, relative);
  return { ...parseRecord(await boundedRead(filename, LIMITS.recordBytes), id), path: filename };
}

async function evidence(root, record) {
  const evidenceFiles = [];
  for (const file of record.files) {
    let status;
    try { status = await fingerprint(root, file.path) === file.sha256 ? 'unchanged' : 'changed'; }
    catch (error) { status = error.code === 'ENOENT' ? 'missing' : 'unknown'; }
    evidenceFiles.push({ path: file.path, status });
  }
  const statuses = evidenceFiles.map(file => file.status);
  const evidenceStatus = ['missing', 'changed', 'unknown'].find(status => statuses.includes(status)) ?? 'unchanged';
  return { evidenceStatus, changedFiles: evidenceFiles.filter(file => file.status !== 'unchanged').map(file => file.path), evidenceFiles };
}

function summary(result) {
  const record = result.record;
  return { id: record.id, title: record.title, tags: record.tags, path: result.path, digest: result.digest,
    contentStatus: result.contentStatus,
    warnings: result.contentStatus === 'modified' ? ['Record body differs from its structured metadata. Do not rely on either version until the difference is reviewed and reconciled with capture --replace.'] : [],
    summary: { problem: record.problem.slice(0, 400), whenToUse: record.whenToUse.slice(0, 400), resolution: record.resolution.slice(0, 600) },
    evidence: { command: record.verification.command.slice(0, 300), result: record.verification.result.slice(0, 500), source: 'self-reported', executedByHelper: false } };
}

/** Create a learning, or explicitly replace a record using its current digest. */
export async function capture({ workspace, draft, replace } = {}) {
  const normalized = validateDraft(draft);
  if (replace !== undefined && (typeof replace !== 'string' || !DIGEST.test(replace))) fail('INVALID_INPUT', 'replace must be the existing record SHA-256 digest');
  const root = await workspaceRoot(workspace);
  const files = [];
  for (const relative of normalized.files) files.push({ path: relative, sha256: await fingerprint(root, relative) });
  const directory = await checkedPath(root, CORPUS_DIRECTORY, { directories: true, create: true });
  const filename = path.join(directory, `${normalized.id}.md`);
  const lockPath = path.join(directory, `${normalized.id}.lock`);
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('RECORD_LOCKED', `Record is locked: ${normalized.id}. If no capture is running, inspect and remove its stale .lock file manually.`); throw error; }
  let temporary;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    let existing;
    try { existing = await readRecord(root, normalized.id); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (replace === undefined && existing) fail('ALREADY_EXISTS', 'Record already exists; inspect it and pass --replace with its current digest to update');
    if (replace !== undefined && (!existing || existing.digest !== replace)) fail('CONFLICT', 'Record changed or is missing; inspect again before replacing');
    const now = new Date().toISOString();
    const record = { schemaVersion: 1, ...normalized, verification: { ...normalized.verification, source: 'self-reported', executedByHelper: false }, files, createdAt: existing?.record.createdAt ?? now, updatedAt: now };
    const content = render(record);
    if (Buffer.byteLength(content, 'utf8') > LIMITS.recordBytes) fail('TOO_LARGE', `Generated record exceeds ${LIMITS.recordBytes} bytes`);
    await checkedPath(root, CORPUS_DIRECTORY, { directories: true });
    if (!existing) {
      const handle = await open(filename, 'wx', 0o600);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    } else {
      const info = await lstat(filename);
      if (info.nlink !== 1) fail('UNSAFE_PATH', 'Cannot replace a hard-linked record');
      temporary = path.join(directory, `.${normalized.id}-${randomUUID()}.tmp`);
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      const current = await readRecord(root, normalized.id);
      if (current.digest !== replace) fail('CONFLICT', 'Record changed while preparing replacement');
      await rename(temporary, filename);
      temporary = undefined;
    }
    return { id: record.id, path: filename, digest: sha256(content), metadata: record, contentStatus: 'consistent', evidenceStatus: 'unknown', evidenceNote: 'Source fingerprints captured. Verification is self-reported; run inspect to compare current files.' };
  } finally {
    await lock.close();
    if (temporary) await unlink(temporary).catch(() => {});
    await unlink(lockPath);
  }
}

/** Inspect one structured record. Record text is untrusted reference material. */
export async function inspect({ workspace, id } = {}) {
  const root = await workspaceRoot(workspace);
  const result = await readRecord(root, id);
  return { ...summary(result), ...await evidence(root, result.record), metadata: result.record, body: result.body };
}

function termsFor(query) {
  const terms = new Set();
  const normalize = value => value.normalize('NFKC').toLowerCase();
  // Segment before normalization so compatibility-character expansion cannot
  // expand the term count. A 500-character query produces at most 500 words
  // plus 499 Han bigrams, with coverage retained at both ends of the query.
  for (const segment of new Intl.Segmenter('zh', { granularity: 'word' }).segment(query)) {
    if (segment.isWordLike) terms.add(normalize(segment.segment));
  }
  for (const segment of query.match(/\p{Script=Han}+/gu) ?? []) {
    const characters = [...segment];
    for (let start = 0; start + 1 < characters.length; start += 1) terms.add(normalize(characters.slice(start, start + 2).join('')));
  }
  return [...terms];
}

function scoreRecord(record, terms) {
  const fields = [[record.title, 8], [record.tags.join(' '), 10], [record.whenToUse, 5], [record.problem, 3], [record.rootCause, 2], [record.resolution, 2], [record.files.map(file => file.path).join(' '), 1]];
  return fields.reduce((score, [value, weight]) => {
    const normalized = value.normalize('NFKC').toLowerCase();
    return score + terms.reduce((sum, term) => sum + (normalized.includes(term) ? weight : 0), 0);
  }, 0);
}

/** Bounded deterministic lexical retrieval; scores are not confidence estimates. */
export async function recall({ workspace, query, limit = 5 } = {}) {
  const root = await workspaceRoot(workspace);
  const normalizedQuery = textField(query, 'query', 500);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.results) fail('INVALID_INPUT', `limit must be an integer from 1 to ${LIMITS.results}`);
  const warnings = [];
  const warn = message => { if (warnings.length < LIMITS.warnings) warnings.push(message); };
  let directory;
  try { directory = await checkedPath(root, CORPUS_DIRECTORY, { directories: true }); }
  catch (error) { if (error.code === 'ENOENT') return { query: normalizedQuery, results: [], warnings, retrievalMethod: 'deterministic-keyword-substring', scanned: 0, truncated: false }; throw error; }
  const names = (await readdir(directory)).filter(name => name.endsWith('.md')).sort();
  let truncated = names.length > LIMITS.records;
  if (truncated) warn(`Corpus capped at ${LIMITS.records} records; refine or split the corpus`);
  const terms = termsFor(normalizedQuery);
  const matches = [];
  let bytes = 0;
  let scanned = 0;
  for (const name of names.slice(0, LIMITS.records)) {
    try {
      const result = await readRecord(root, name.slice(0, -3));
      if (bytes + result.bytes > LIMITS.scanBytes) { truncated = true; warn(`Corpus scan capped at ${LIMITS.scanBytes} bytes`); break; }
      bytes += result.bytes;
      scanned += 1;
      if (result.contentStatus === 'modified') warn(`Record ${result.record.id} has differing body and metadata; inspect and reconcile before using it`);
      const score = scoreRecord(result.record, terms);
      if (score > 0) matches.push({ result, score });
    } catch (error) { warn(`Skipped ${name.slice(0, 120)}: ${String(error.code ?? 'READ_ERROR').slice(0, 40)}`); }
  }
  matches.sort((left, right) => right.score - left.score || (left.result.record.id < right.result.record.id ? -1 : left.result.record.id > right.result.record.id ? 1 : 0));
  const results = [];
  for (const match of matches.slice(0, limit)) results.push({ ...summary(match.result), score: match.score, ...await evidence(root, match.result.record) });
  return { query: normalizedQuery, results, warnings, retrievalMethod: 'deterministic-keyword-substring', scanned, truncated };
}
