// sc4sap — screen theme of the SAP screen mockups (program-to-spec / program-to-manual).
//
// Stored per SAP system in the active profile's config.json → "screenTheme",
// because the SAP GUI colour scheme is usually chosen per system (DEV blue,
// PRD pink, …). A document can still override it with its own "theme".
//
// CLI (used by /sc4sap:sap-option)
//   node screen-theme.mjs get
//     → { value, effective, source, path, alias, themes: [...] }
//   node screen-theme.mjs set <signature|signature-pink|modern|'{"base":"signature","page":"#DEE8F4"}'>
//   node screen-theme.mjs reset            → removes the key (default: signature)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveConfigJson, resolveConfigJsonPath } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync } from '../lib/atomic-write.mjs';
import { SCREEN_THEMES } from './screen-image-renderer.mjs';

export const THEME_NAMES = Object.keys(SCREEN_THEMES);
const PALETTE_KEYS = new Set(Object.keys(SCREEN_THEMES.signature).filter(k => k !== 'flat'));
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Normalised theme value, or throws with a message naming what is wrong. */
export function validateScreenTheme(input) {
  let value = input;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { value = JSON.parse(value); } catch { throw new Error('custom theme is not valid JSON'); }
  }
  if (typeof value === 'string') {
    const name = value.trim().toLowerCase();
    const alias = { default: 'signature', blue: 'signature', pink: 'signature-pink', legacy: 'modern' }[name] || name;
    if (!THEME_NAMES.includes(alias)) throw new Error(`unknown theme "${value}" — use ${THEME_NAMES.join(' / ')} or a { "base", … } object`);
    return alias;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('theme must be a name or an object');
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'base') {
      if (!THEME_NAMES.includes(v) || v === 'modern') throw new Error('"base" must be signature or signature-pink');
      out.base = v;
    } else if (PALETTE_KEYS.has(k)) {
      if (!HEX.test(String(v))) throw new Error(`"${k}" must be a #RRGGBB colour`);
      out[k] = String(v).toUpperCase();
    } else {
      throw new Error(`unknown palette key "${k}" — known: ${[...PALETTE_KEYS].join(', ')}`);
    }
  }
  if (!out.base) out.base = 'signature';
  return out;
}

export function getScreenTheme(cwd = process.cwd()) {
  const hit = readActiveConfigJson(cwd);
  const value = hit?.config?.screenTheme ?? null;
  return {
    value,
    effective: value ?? 'signature',
    source: value == null ? 'default' : 'config.json',
    path: hit?.path ?? null,
    alias: hit?.alias ?? null,
    themes: THEME_NAMES,
  };
}

export function setScreenTheme(input, cwd = process.cwd()) {
  const hit = resolveConfigJsonPath(cwd);
  if (!hit) throw new Error('no config.json for the active profile — run /sc4sap:setup first');
  const config = JSON.parse(readFileSync(hit.path, 'utf8'));
  const before = config.screenTheme ?? null;
  if (input === null) delete config.screenTheme;
  else config.screenTheme = validateScreenTheme(input);
  atomicWriteFileSync(hit.path, `${JSON.stringify(config, null, 2)}\n`);
  return { path: hit.path, before, after: config.screenTheme ?? null };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === 'get') console.log(JSON.stringify(getScreenTheme(), null, 2));
    else if (cmd === 'set' && arg) console.log(JSON.stringify(setScreenTheme(arg), null, 2));
    else if (cmd === 'reset') console.log(JSON.stringify(setScreenTheme(null), null, 2));
    else {
      console.error(`Usage: node screen-theme.mjs get | set <${THEME_NAMES.join('|')}|'{"base":"signature",…}'> | reset`);
      process.exit(2);
    }
  } catch (e) {
    console.error(`screen-theme: ${e.message}`);
    process.exit(1);
  }
}
