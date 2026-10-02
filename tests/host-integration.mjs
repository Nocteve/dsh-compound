import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, readFile, realpath } from 'node:fs/promises';

// A real, built Harness checkout. No mock registry, model request or credentials.
const harnessRoot = process.argv[2];
if (!harnessRoot) throw new Error('Usage: node tests/host-integration.mjs <built-harness-checkout> [plugin-directory]');
const pluginRoot = await realpath(process.argv[3] ? resolve(process.argv[3]) : resolve(import.meta.dirname, '..'));
const hostRequire = createRequire(resolve(harnessRoot, 'packages/skill/skill/package.json'));
const { Context } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis')));
const { default: SkillRegistry, renderSkillContent } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-skill')));
const plugin = await import(pathToFileURL(resolve(pluginRoot, 'index.mjs')));
const ctx = new Context();
const registry = await ctx.plugin(SkillRegistry);
try {
  assert.deepEqual(await ctx.skills.list(), []);
  const loaded = await ctx.plugin(plugin);
  try {
    const skills = await ctx.skills.list();
    assert.deepEqual(skills.map(skill => skill.name), ['dsh-compound-capture', 'dsh-compound-recall']);
    for (const summary of skills) {
      const skill = await ctx.skills.get(summary.name);
      assert.equal(skill.provider, 'dsh-compound');
      assert.equal(skill.invocation.modelInvocable, true);
      assert.equal(skill.invocation.userInvocable, true);
      assert.equal(skill.resourceBase.kind, 'directory');
      assert.equal(resolve(skill.resourceBase.path), pluginRoot);
      await access(resolve(skill.resourceBase.path, 'bin/compound.mjs'));
      assert.ok(skill.content.includes('bin/compound.mjs'));
      assert.ok(renderSkillContent(skill).includes('compound.mjs'));
    }
  } finally {
    await loaded.dispose();
  }
  assert.deepEqual(await ctx.skills.list(), [], 'unload must remove skills');
  const reloaded = await ctx.plugin(plugin);
  assert.equal((await ctx.skills.list()).length, 2, 'reload must not duplicate skills');
  await reloaded.dispose();
  const host = JSON.parse(await readFile(resolve(harnessRoot, 'package.json'), 'utf8'));
  console.log(JSON.stringify({ passed: true, hostVersion: host.version, node: process.version,
    checks: ['real skill registry', 'resource resolution', 'model/user discovery', 'rendered content', 'unload', 'reload'],
    modelEfficacyEvaluated: false }, null, 2));
} finally {
  await registry.dispose();
}
