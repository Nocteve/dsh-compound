import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture, CORPUS_DIRECTORY, inspect, LIMITS, readDraftInput, recall, sha256, validateDraft } from '../lib/memory.mjs';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/compound.mjs', import.meta.url));

async function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'dsh-compound-test-');
  const root = await mkdtemp(prefix);
  t.after(async () => {
    const absolute = path.resolve(root);
    assert.ok(absolute.startsWith(path.resolve(prefix)) && absolute !== path.resolve(os.tmpdir()));
    await rm(absolute, { recursive: true, force: true });
  });
  const workspace = path.join(root, 'workspace');
  const outside = path.join(root, 'outside');
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(workspace, 'src', 'login.js'), 'export const login = () => true;\n');
  await writeFile(path.join(outside, 'secret.js'), 'outside workspace\n');
  return { root, workspace, outside, corpus: path.join(workspace, CORPUS_DIRECTORY) };
}

function draft(overrides = {}) {
  return { id: 'login-timeout', title: '登录接口超时', tags: ['登录', 'timeout'], problem: '登录接口在请求后超时。', rootCause: '测试环境的超时配置不匹配。', resolution: '显式设置请求超时，并保留针对该情况的测试。', whenToUse: '调查登录失败或接口超时时。', verification: { command: 'node --test tests/login.test.js', result: 'User reports the regression case passed.' }, files: ['src/login.js'], ...overrides };
}

test('capture and inspect preserve structured evidence without executing commands', async t => {
  const { workspace, corpus } = await fixture(t);
  const captured = await capture({ workspace, draft: draft({ verification: { command: 'THIS MUST NEVER EXECUTE', result: 'self-reported only' } }) });
  assert.equal(captured.path, path.join(corpus, 'login-timeout.md'));
  assert.equal(captured.metadata.verification.executedByHelper, false);
  const inspected = await inspect({ workspace, id: 'login-timeout' });
  assert.equal(inspected.evidenceStatus, 'unchanged');
  assert.deepEqual(inspected.changedFiles, []);
  assert.equal(inspected.evidence.source, 'self-reported');
  assert.equal(inspected.digest, sha256(await readFile(captured.path)));
  assert.match(inspected.body, /self-reported/u);
  assert.deepEqual(await readdir(corpus), ['login-timeout.md']);
});

test('source edits become changed and deleted sources become missing', async t => {
  const { workspace } = await fixture(t);
  await capture({ workspace, draft: draft() });
  await writeFile(path.join(workspace, 'src/login.js'), 'changed code');
  const changed = await inspect({ workspace, id: 'login-timeout' });
  assert.equal(changed.evidenceStatus, 'changed');
  assert.deepEqual(changed.changedFiles, ['src/login.js']);
  await rm(path.join(workspace, 'src/login.js'));
  const missing = await recall({ workspace, query: '登录' });
  assert.equal(missing.results[0].evidenceStatus, 'missing');
});

test('Chinese ngrams match substrings without relying on spaces', async t => {
  const { workspace } = await fixture(t);
  await capture({ workspace, draft: draft() });
  await capture({ workspace, draft: draft({ id: 'cache-expiry', title: 'Cache expiry', tags: ['cache'], problem: 'Cache expires late', rootCause: 'Bad TTL', resolution: 'Fix TTL', whenToUse: 'Investigate cache expiry' }) });
  const result = await recall({ workspace, query: '为什么用户登录失败' });
  assert.equal(result.results[0].id, 'login-timeout');
  assert.ok(result.results[0].score > 0);
  assert.equal(result.retrievalMethod, 'deterministic-keyword-substring');
});

test('long Chinese queries retain matching terms at the end', async t => {
  const { workspace } = await fixture(t);
  await capture({ workspace, draft: draft({ id: 'connection-timeout', title: '连接超时', tags: ['connection'], problem: 'Connection timed out.', rootCause: 'Timeout setting.', resolution: 'Set the timeout.', whenToUse: 'Investigating timeouts.' }) });
  const query = '请帮我查看这个项目当前运行时出现的问题并结合之前保存的经验分析可能的原因我已经确认服务能够启动浏览器也可以正常打开页面但是用户在提交表单等待服务返回数据的过程中经常遇到连接超时';
  const result = await recall({ workspace, query });
  assert.equal(result.results[0].id, 'connection-timeout');
  assert.ok(result.results[0].score > 0);
});

test('ties are stable by id and recall limit is enforced', async t => {
  const { workspace } = await fixture(t);
  await capture({ workspace, draft: draft({ id: 'z-learning' }) });
  await capture({ workspace, draft: draft({ id: 'a-learning' }) });
  const result = await recall({ workspace, query: 'timeout', limit: 1 });
  assert.deepEqual(result.results.map(record => record.id), ['a-learning']);
  await assert.rejects(recall({ workspace, query: 'timeout', limit: 1000 }), { code: 'INVALID_INPUT' });
});

test('missing and empty corpora are read-only empty results', async t => {
  const { workspace, corpus } = await fixture(t);
  assert.deepEqual((await recall({ workspace, query: 'anything' })).results, []);
  assert.deepEqual(await readdir(workspace), ['src']);
  await mkdir(corpus, { recursive: true });
  assert.deepEqual((await recall({ workspace, query: 'anything' })).results, []);
});

test('malformed and oversized records are skipped with bounded warnings', async t => {
  const { workspace, corpus } = await fixture(t);
  await capture({ workspace, draft: draft() });
  await writeFile(path.join(corpus, 'bad-note.md'), 'not a record');
  await writeFile(path.join(corpus, 'oversized.md'), 'x'.repeat(LIMITS.recordBytes + 1));
  const result = await recall({ workspace, query: '登录' });
  assert.equal(result.results.length, 1);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings.join('\n'), /MALFORMED_RECORD/u);
  assert.match(result.warnings.join('\n'), /TOO_LARGE/u);
});

test('no overwrite by default; CAS updates only the inspected version', async t => {
  const { workspace, corpus } = await fixture(t);
  const first = await capture({ workspace, draft: draft() });
  await assert.rejects(capture({ workspace, draft: draft() }), { code: 'ALREADY_EXISTS' });
  await assert.rejects(capture({ workspace, draft: draft(), replace: '0'.repeat(64) }), { code: 'CONFLICT' });
  const updated = await capture({ workspace, draft: draft({ resolution: 'A revised resolution' }), replace: first.digest });
  assert.notEqual(updated.digest, first.digest);
  assert.equal(updated.metadata.createdAt, first.metadata.createdAt);
  await assert.rejects(capture({ workspace, draft: draft(), replace: first.digest }), { code: 'CONFLICT' });
  assert.equal((await inspect({ workspace, id: 'login-timeout' })).metadata.resolution, 'A revised resolution');
  assert.deepEqual(await readdir(corpus), ['login-timeout.md']);
});

test('concurrent captures cannot both replace the same digest', async t => {
  const { workspace } = await fixture(t);
  const first = await capture({ workspace, draft: draft() });
  const results = await Promise.allSettled([
    capture({ workspace, draft: draft({ resolution: 'Change one' }), replace: first.digest }),
    capture({ workspace, draft: draft({ resolution: 'Change two' }), replace: first.digest }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.ok(['RECORD_LOCKED', 'CONFLICT'].includes(failure.reason.code));
});

test('body-only manual edits are surfaced and can be reconciled with CAS', async t => {
  const { workspace } = await fixture(t);
  const first = await capture({ workspace, draft: draft() });
  const original = await readFile(first.path, 'utf8');
  await writeFile(first.path, original.replace('## Resolution\n\n', '## Resolution\n\nManual correction: the previous resolution was incomplete.\n\n'));
  const inspected = await inspect({ workspace, id: 'login-timeout' });
  assert.equal(inspected.contentStatus, 'modified');
  assert.equal(inspected.warnings.length, 1);
  assert.equal(inspected.evidenceStatus, 'unchanged');
  const recalled = await recall({ workspace, query: '登录' });
  assert.equal(recalled.results[0].contentStatus, 'modified');
  assert.match(recalled.warnings.join('\n'), /differing body and metadata/u);
  const fixed = await capture({ workspace, draft: draft({ resolution: 'The reviewed corrected resolution.' }), replace: inspected.digest });
  assert.equal(fixed.contentStatus, 'consistent');
  const reconciled = await inspect({ workspace, id: 'login-timeout' });
  assert.equal(reconciled.contentStatus, 'consistent');
  assert.deepEqual(reconciled.warnings, []);
  assert.match(reconciled.body, /The reviewed corrected resolution/u);
});

test('metadata-only manual edits are surfaced without blocking inspection', async t => {
  const { workspace } = await fixture(t);
  const first = await capture({ workspace, draft: draft() });
  const lines = (await readFile(first.path, 'utf8')).split('\n');
  const metadata = JSON.parse(lines[1].slice('dsh_compound: '.length));
  metadata.resolution = 'A different manually corrected resolution.';
  lines[1] = `dsh_compound: ${JSON.stringify(metadata)}`;
  await writeFile(first.path, lines.join('\n'));
  const result = await inspect({ workspace, id: 'login-timeout' });
  assert.equal(result.contentStatus, 'modified');
  assert.equal(result.metadata.resolution, metadata.resolution);
  assert.equal(result.warnings.length, 1);
});

test('stale locks are reported and are never silently removed', async t => {
  const { workspace, corpus } = await fixture(t);
  await mkdir(corpus, { recursive: true });
  await writeFile(path.join(corpus, 'login-timeout.lock'), 'stale');
  await assert.rejects(capture({ workspace, draft: draft() }), { code: 'RECORD_LOCKED' });
  assert.equal(await readFile(path.join(corpus, 'login-timeout.lock'), 'utf8'), 'stale');
});

test('draft validation rejects path traversal, internal paths, and unsafe ids', () => {
  for (const value of ['../outside/secret.js', 'src/../../secret.js', '/etc/passwd', 'C:\\secret.js', '\\\\host\\secret', 'src\\..\\secret', '.git/config', '.codex/config.toml', 'src/.ssh/key', 'src/evil:stream', 'docs/solutions/dsh-compound/other.md', 'src/NUL', 'src/file.']) {
    assert.throws(() => validateDraft(draft({ files: [value] })), { code: 'UNSAFE_PATH' });
  }
  for (const id of ['../escape', 'Upper', 'with_space', '-bad', 'con']) assert.throws(() => validateDraft(draft({ id })), { code: 'INVALID_ID' });
  assert.throws(() => validateDraft(draft({ files: [] })), { code: 'INVALID_INPUT' });
  assert.throws(() => validateDraft(draft({ rootCause: '' })), { code: 'INVALID_INPUT' });
});

test('evidence must be existing regular files with bounded size', async t => {
  const { workspace } = await fixture(t);
  await assert.rejects(capture({ workspace, draft: draft({ files: ['src'] }) }), { code: 'UNSAFE_PATH' });
  await assert.rejects(capture({ workspace, draft: draft({ files: ['missing.js'] }) }), { code: 'ENOENT' });
  await writeFile(path.join(workspace, 'huge.js'), Buffer.alloc(LIMITS.sourceBytes + 1));
  await assert.rejects(capture({ workspace, draft: draft({ files: ['huge.js'] }) }), { code: 'TOO_LARGE' });
});

test('source symlink escapes are rejected, or unknown after capture', async t => {
  const { workspace, outside } = await fixture(t);
  await capture({ workspace, draft: draft() });
  const target = path.join(workspace, 'src/login.js');
  await rm(target);
  try { await symlink(path.join(outside, 'secret.js'), target, 'file'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Platform does not permit file symlinks'); throw error; }
  await assert.rejects(capture({ workspace, draft: draft({ id: 'bad-source' }) }), { code: 'UNSAFE_PATH' });
  assert.equal((await inspect({ workspace, id: 'login-timeout' })).evidenceStatus, 'unknown');
});

test('symlink or junction corpus escapes are rejected before writes', async t => {
  const { workspace, outside } = await fixture(t);
  try { await symlink(outside, path.join(workspace, 'docs'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Platform does not permit directory links'); throw error; }
  await assert.rejects(capture({ workspace, draft: draft() }), { code: 'UNSAFE_PATH' });
  await assert.rejects(recall({ workspace, query: 'login' }), { code: 'UNSAFE_PATH' });
  assert.deepEqual(await readdir(outside), ['secret.js']);
});

test('symlink records are skipped instead of reading another workspace', async t => {
  const { workspace, outside, corpus } = await fixture(t);
  await mkdir(corpus, { recursive: true });
  try { await symlink(path.join(outside, 'secret.js'), path.join(corpus, 'escape.md'), 'file'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Platform does not permit file symlinks'); throw error; }
  const result = await recall({ workspace, query: 'secret' });
  assert.deepEqual(result.results, []);
  assert.match(result.warnings[0], /UNSAFE_PATH/u);
});

test('separate workspaces do not share a corpus', async t => {
  const { workspace, outside } = await fixture(t);
  await capture({ workspace, draft: draft() });
  assert.deepEqual((await recall({ workspace: outside, query: '登录' })).results, []);
  await assert.rejects(inspect({ workspace: outside, id: 'login-timeout' }), { code: 'ENOENT' });
});

test('draft input is bounded and must remain inside the workspace', async t => {
  const { workspace, outside } = await fixture(t);
  const input = path.join(workspace, 'draft.json');
  await writeFile(input, JSON.stringify(draft()));
  assert.equal((await readDraftInput({ workspace, input })).id, 'login-timeout');
  await assert.rejects(readDraftInput({ workspace, input: path.join(outside, 'secret.js') }), { code: 'UNSAFE_PATH' });
  await writeFile(input, 'bad json');
  await assert.rejects(readDraftInput({ workspace, input }), { code: 'INVALID_INPUT' });
});

test('UTF-8 BOM drafts and records remain readable while digests hash actual bytes', async t => {
  const { workspace } = await fixture(t);
  const input = path.join(workspace, 'bom-draft.json');
  await writeFile(input, `\uFEFF${JSON.stringify(draft())}`, 'utf8');
  const loaded = await readDraftInput({ workspace, input });
  const created = await capture({ workspace, draft: loaded });
  const original = await readFile(created.path, 'utf8');
  await writeFile(created.path, `\uFEFF${original}`, 'utf8');
  const inspected = await inspect({ workspace, id: loaded.id });
  assert.equal(inspected.contentStatus, 'consistent');
  assert.equal(inspected.digest, sha256(await readFile(created.path)));
  assert.notEqual(inspected.digest, created.digest);
  const recalled = await recall({ workspace, query: '登录' });
  assert.equal(recalled.results[0].id, loaded.id);
  assert.equal(recalled.results[0].digest, inspected.digest);
  assert.deepEqual(recalled.warnings, []);
});

test('draft input accepts a workspace whose ancestor is a junction', async t => {
  const { root, workspace } = await fixture(t);
  const alias = path.join(root, 'ancestor-alias');
  // Alias a separate ancestor, never the workspace directory itself.
  const realAncestor = path.join(root, 'real');
  const realWorkspace = path.join(realAncestor, 'project');
  await mkdir(realWorkspace, { recursive: true });
  await writeFile(path.join(realWorkspace, 'draft.json'), JSON.stringify(draft()));
  try { await symlink(realAncestor, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Platform does not permit directory links'); throw error; }
  const aliasWorkspace = path.join(alias, 'project');
  assert.equal((await readDraftInput({ workspace: aliasWorkspace, input: path.join(aliasWorkspace, 'draft.json') })).id, 'login-timeout');
  assert.equal((await readDraftInput({ workspace: aliasWorkspace, input: path.join(realWorkspace, 'draft.json') })).id, 'login-timeout');
  await assert.rejects(readDraftInput({ workspace, input: path.join(aliasWorkspace, 'draft.json') }), { code: 'UNSAFE_PATH' });
});

test('CLI capture, recall, inspect, and CAS expose JSON contracts', async t => {
  const { workspace } = await fixture(t);
  const input = path.join(workspace, 'draft.json');
  await writeFile(input, JSON.stringify(draft()));
  const run = async (...args) => JSON.parse((await execute(process.execPath, [cli, ...args], { windowsHide: true })).stdout);
  const created = await run('capture', '--workspace', workspace, '--input', input);
  assert.ok(created.digest);
  assert.equal((await run('recall', '--workspace', workspace, '--query', '登录失败', '--limit', '1')).results.length, 1);
  assert.equal((await run('inspect', '--workspace', workspace, '--id', 'login-timeout')).evidenceStatus, 'unchanged');
  await writeFile(input, JSON.stringify(draft({ resolution: 'CLI updated resolution' })));
  assert.notEqual((await run('capture', '--workspace', workspace, '--input', input, '--replace', created.digest)).digest, created.digest);
  await assert.rejects(execute(process.execPath, [cli, 'recall', '--workspace', workspace, '--query', 'x', '--limit', '0'], { windowsHide: true }), error => JSON.parse(error.stderr).error === 'INVALID_INPUT');
});
