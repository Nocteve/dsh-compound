#!/usr/bin/env node
import { capture, inspect, readDraftInput, recall } from '../lib/memory.mjs';

const usage = `Usage:
  node bin/compound.mjs capture --workspace <root> --input <draft.json> [--replace <record-sha256>]
  node bin/compound.mjs recall --workspace <root> --query <text> [--limit <1-10>]
  node bin/compound.mjs inspect --workspace <root> --id <slug>

The draft JSON must be a regular file inside the selected workspace.
Verification command/result are self-reported; this helper never executes them.`;

try {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || !command) { process.stdout.write(`${usage}\n`); }
  else {
    const permitted = { capture: ['workspace', 'input', 'replace'], recall: ['workspace', 'query', 'limit'], inspect: ['workspace', 'id'] }[command];
    if (!permitted) throw Object.assign(new Error('Unknown command; use --help'), { code: 'INVALID_INPUT' });
    const options = {};
    for (let index = 0; index < arguments_.length; index += 2) {
      const flag = arguments_[index];
      const key = flag.startsWith('--') ? flag.slice(2) : '';
      const value = arguments_[index + 1];
      if (!permitted.includes(key) || Object.hasOwn(options, key) || value === undefined || value.startsWith('--')) throw Object.assign(new Error(`Invalid or duplicate option: ${flag}`), { code: 'INVALID_INPUT' });
      options[key] = value;
    }
    if (!options.workspace) throw Object.assign(new Error('--workspace is required'), { code: 'INVALID_INPUT' });
    let result;
    if (command === 'capture') result = await capture({ workspace: options.workspace, draft: await readDraftInput(options), replace: options.replace });
    if (command === 'recall') result = await recall({ ...options, limit: options.limit === undefined ? 5 : Number(options.limit) });
    if (command === 'inspect') result = await inspect(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.code ?? 'ERROR', message: error.message })}\n`);
  process.exitCode = 1;
}
