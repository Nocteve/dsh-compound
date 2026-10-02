import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Controlled fixture: this checks the helper's workflow, not an LLM's ability.
const packageRoot = path.resolve(import.meta.dirname, '..');
const demoRoot = path.join(packageRoot, '.demo');
await mkdir(demoRoot, { recursive: true });
const workspace = await mkdtemp(path.join(demoRoot, 'run-'));
await mkdir(path.join(workspace, 'src'));
await mkdir(path.join(workspace, 'tests'));
const source = path.join(workspace, 'src', 'settings.mjs');
const regression = `import assert from 'node:assert/strict';
import { parseSettings } from '../src/settings.mjs';
assert.deepEqual(parseSettings('{"mode":"local"}'), {mode:'local'});
assert.deepEqual(parseSettings('\\uFEFF{"mode":"local"}'), {mode:'local'});
assert.throws(() => parseSettings('{broken}'));
console.log('PASS: ordinary JSON, BOM-prefixed JSON, malformed JSON (3 assertions)');
`;
await writeFile(path.join(workspace, 'tests', 'settings.test.mjs'), regression);
await writeFile(source, 'export const parseSettings = text => JSON.parse(text);\n');
const check = () => spawnSync(process.execPath, ['tests/settings.test.mjs'], { cwd: workspace, encoding: 'utf8' });
const before = check();
assert.notEqual(before.status, 0, 'fixture must demonstrate the regression');
await writeFile(source, "export const parseSettings = text => JSON.parse(text.replace(/^\\uFEFF/, ''));\n");
const after = check();
assert.equal(after.status, 0, after.stderr);
const draft = {
  id: 'fixture-windows-json-bom', title: '受控示例：Windows 导出的 JSON 配置含 BOM',
  tags: ['Windows', 'JSON', 'BOM', '配置读取失败'],
  problem: '受控测试中，普通 JSON 读取通过，带 UTF-8 BOM 的相同配置读取失败。此记录仅演示工具链。',
  rootCause: 'JSON.parse 不接受字符串开头的 BOM。此夹具模拟含 BOM 的导出内容，没有观察真实生产环境。',
  resolution: '在解析边界只移除开头的 BOM，继续让格式错误的 JSON 报错。',
  whenToUse: '仅用于本受控夹具中同类 JSON 输入；真实项目需重新确认编码、解析链路及验证依据。',
  verification: { command: 'node tests/settings.test.mjs', result: after.stdout.trim() },
  files: ['src/settings.mjs', 'tests/settings.test.mjs'],
};
const input = path.join(workspace, 'draft.json');
await writeFile(input, `${JSON.stringify(draft, null, 2)}\n`);
const helper = (command, ...args) => {
  const result = spawnSync(process.execPath, [path.join(packageRoot, 'bin', 'compound.mjs'), command, '--workspace', workspace, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const saved = helper('capture', '--input', input);
const recall = helper('recall', '--query', 'Windows配置读取失败');
assert.equal(recall.results[0].id, draft.id);
assert.equal(recall.results[0].evidenceStatus, 'unchanged');
const other = helper('recall', '--query', 'postgres-deadlock');
assert.equal(other.results.length, 0);
await writeFile(source, (await readFile(source, 'utf8')) + '// Simulated later source change.\n');
const stale = helper('inspect', '--id', draft.id);
assert.equal(stale.evidenceStatus, 'changed');
const report = {
  kind: 'controlled-helper-demo', modelUsed: false,
  beforeFixExitCode: before.status, afterFixExitCode: after.status,
  observedVerification: after.stdout.trim(),
  captured: path.relative(workspace, saved.path).replaceAll('\\', '/'),
  chineseQueryMatched: recall.results.map(result => result.id),
  initialEvidenceStatus: recall.results[0].evidenceStatus,
  unrelatedQueryCount: other.results.length,
  afterSourceEdit: { evidenceStatus: stale.evidenceStatus, changedFiles: stale.changedFiles },
};
await writeFile(path.join(workspace, 'demo-result.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ workspace, ...report }, null, 2));
