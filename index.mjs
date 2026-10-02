import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-compound';
export const inject = ['skills'];
const root = fileURLToPath(new URL('./', import.meta.url));
const names = ['dsh-compound-capture', 'dsh-compound-recall'];

// These two bundled files deliberately use single-line name/description fields.
// This is not a parser for third-party YAML or arbitrary installed skills.
function readSkill(skillName) {
  const url = new URL(`./skills/${skillName}/SKILL.md`, import.meta.url);
  const text = readFileSync(url, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(text);
  if (!match) throw new Error(`Invalid bundled skill frontmatter: ${skillName}`);
  const field = (key) => {
    const value = new RegExp(`^${key}: (.+)$`, 'm').exec(match[1])?.[1];
    if (!value) throw new Error(`Missing bundled skill ${key}: ${skillName}`);
    return value.startsWith('"') ? JSON.parse(value) : value;
  };
  if (field('name') !== skillName) throw new Error(`Bundled skill name mismatch: ${skillName}`);
  return {
    name: skillName,
    description: field('description'),
    source: 'runtime',
    provider: name,
    path: fileURLToPath(url),
    resourceBase: { kind: 'directory', path: root },
    invocation: { modelInvocable: true, userInvocable: true },
    content: match[2].trim(),
  };
}

// Read before registering, so a missing distribution file cannot partially load.
const definitions = names.map(readSkill);

export function apply(ctx) {
  // The host registry owns Cordis effects and removes these on plugin disposal.
  for (const definition of definitions) ctx.skills.register(definition);
}
