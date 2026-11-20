import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The web app loads these config scripts at run time (its example documents draw a configuration document with
// them) from a copy of scripts/ only — no node_modules beside it (production, 2026-11-18). config/sap-reader.mjs
// imports the MCP SDK at its top, so no static import chain from these files may reach it: the functions that read
// SAP load it themselves (`await import('./sap-reader.mjs')`).
const SCRIPTS = join(__dirname, '..', '..', 'scripts');
const ENTRIES = ['config/build-config-doc.mjs', 'config/config-checks.mjs', 'config/config-doc-page.mjs'];
const STATIC_IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm;

/** The static import chain from `entry` to a file named `target`, or null. */
function chainTo(entry: string, target: string, seen = new Set<string>()): string[] | null {
  const file = resolve(entry);
  if (seen.has(file)) return null;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(STATIC_IMPORT)) {
    const spec = m[1]!;
    if (!spec.startsWith('.')) continue;
    const next = resolve(dirname(file), spec);
    if (next.endsWith(target)) return [file, next];
    const rest = chainTo(next, target, seen);
    if (rest) return [file, ...rest];
  }
  return null;
}

describe('config scripts the web loads: no static import of sap-reader (MCP SDK)', () => {
  for (const entry of ENTRIES) {
    it(entry, () => {
      expect(chainTo(join(SCRIPTS, entry), 'sap-reader.mjs')).toBeNull();
    });
  }

  it('the SAP-reading functions of ggb.mjs / cmod.mjs load sap-reader themselves', () => {
    for (const f of ['ggb.mjs', 'cmod.mjs']) {
      const src = readFileSync(join(SCRIPTS, 'config', f), 'utf8');
      expect(src).toMatch(/import\('\.\/sap-reader\.mjs'\)/);
    }
  });
});
