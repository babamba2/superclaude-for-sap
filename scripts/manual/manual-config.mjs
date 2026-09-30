// sc4sap:program-to-manual — cover and footer settings.
//
// The manual's author, team, company and confidentiality notice live in the
// active profile's config.json under "manual", so they are asked once and
// reused by every manual. A profile without the block can borrow another
// profile's values (read-only suggestion — the skill asks before saving).
//
// CLI
//   node manual-config.mjs get
//     → { found, manual, path, alias, source, suggestion?, suggestionFrom? }
//   node manual-config.mjs set [--author X] [--team X] [--company X] [--confidentiality X]
//     → merges the given keys into config.json "manual"; prints the result.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profilesDir, readActiveConfigJson, resolveConfigJsonPath } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync } from '../lib/atomic-write.mjs';

export const MANUAL_KEYS = ['author', 'team', 'company', 'confidentiality'];

const pick = (obj) => Object.fromEntries(
  MANUAL_KEYS.filter(k => typeof obj?.[k] === 'string' && obj[k].trim() !== '').map(k => [k, obj[k].trim()]),
);

function otherProfileBlock(activeAlias) {
  const dir = profilesDir();
  if (!existsSync(dir)) return null;
  for (const alias of readdirSync(dir)) {
    if (alias === activeAlias || alias.startsWith('.')) continue;
    const p = join(dir, alias, 'config.json');
    if (!existsSync(p)) continue;
    try {
      const manual = pick(JSON.parse(readFileSync(p, 'utf8')).manual);
      if (Object.keys(manual).length) return { alias, manual };
    } catch { /* unreadable profile — skip */ }
  }
  return null;
}

export function readManualConfig(cwd = process.cwd()) {
  const hit = readActiveConfigJson(cwd);
  const base = { path: hit?.path ?? null, alias: hit?.alias ?? null, source: hit?.source ?? null };
  const manual = pick(hit?.config?.manual);
  if (Object.keys(manual).length) return { found: true, manual, ...base };
  const other = otherProfileBlock(hit?.alias);
  return other
    ? { found: false, manual: {}, ...base, suggestion: other.manual, suggestionFrom: other.alias }
    : { found: false, manual: {}, ...base };
}

export function writeManualConfig(values, cwd = process.cwd()) {
  const hit = resolveConfigJsonPath(cwd);
  if (!hit) throw new Error('no config.json for the active profile — run /sc4sap:setup first');
  const config = JSON.parse(readFileSync(hit.path, 'utf8'));
  config.manual = { ...pick(config.manual), ...pick(values) };
  atomicWriteFileSync(hit.path, `${JSON.stringify(config, null, 2)}\n`);
  return { path: hit.path, manual: config.manual };
}

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const m = /^--(\w+)$/.exec(args[i]);
    if (!m || !MANUAL_KEYS.includes(m[1]) || args[i + 1] === undefined) {
      throw new Error(`unknown or incomplete option "${args[i]}" — use --${MANUAL_KEYS.join(' / --')} <value>`);
    }
    out[m[1]] = args[++i];
  }
  return out;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'get') console.log(JSON.stringify(readManualConfig(), null, 2));
    else if (cmd === 'set') console.log(JSON.stringify(writeManualConfig(parseFlags(rest)), null, 2));
    else {
      console.error('Usage: node manual-config.mjs get | set [--author X] [--team X] [--company X] [--confidentiality X]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`manual-config: ${e.message}`);
    process.exit(1);
  }
}
