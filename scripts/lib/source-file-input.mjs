// Patch mode (MCP `source_file`): a Create* / Update* call may name a local source file instead of passing
// `source_code`. The MCP server reads that file; the plugin hooks that inspect uploaded source (blocklist scan,
// evidence ledger) must read the same file, or they would see no source at all.
//
// sourceTextOf(input) → { text, file } :
//   - `source_code` non-empty string       → { text: source_code, file: null }   ("" counts as absent)
//   - `source_file` absolute, readable     → { text: file content (BOM dropped), file }
//   - `source_file` relative / unreadable  → { text: null, file, error }   (callers fail closed)
//   - neither                              → { text: null, file: null }
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_PATCHES = 50;

// Keys that must not stand next to `source_patches` (any value, even ""): the full-source field of every
// patchable MCP tool, and source_file. The server refuses such a call; the hooks deny it / never record it
// as a plain source upload.
export const PATCH_EXCLUSIVE_KEYS = ['source_code', 'source_file', 'test_class_code', 'local_types_code', 'definitions_code', 'macros_code'];

/** Keys present next to `source_patches` that make the call a refused mix ([] when none or no patches). */
export function patchMixOf(input) {
  if (!input || typeof input !== 'object' || !Object.prototype.hasOwnProperty.call(input, 'source_patches')) return [];
  return PATCH_EXCLUSIVE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(input, k));
}

// Server-side patch (MCP `source_patches`): an Update* call may send only exact replacements
// `[{ old_string, new_string, replace_all? }]`; the server reads the current source and applies them.
// The hooks never see the full uploaded text, only the fragments.
//
// sourcePatchesOf(input) →
//   - no `source_patches`        → null
//   - well-formed (same rules as the server: array of 1–50, non-empty old_string, string new_string,
//     optional boolean replace_all) → { count, sha256, text }  — text = every new_string joined by \n,
//     sha256 = SHA-256 of the canonical JSON [{old_string,new_string,replace_all}] (key order fixed,
//     replace_all always a boolean), so the ledger proves what was sent
//   - malformed                  → { error }   (callers fail closed)
export function sourcePatchesOf(input) {
  const raw = input?.source_patches;
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SOURCE_PATCHES)
    return { error: `source_patches must be an array of 1–${MAX_SOURCE_PATCHES} patches` };
  const canon = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: `source_patches[${i}] must be an object` };
    if (typeof p.old_string !== 'string' || !p.old_string) return { error: `source_patches[${i}].old_string must be a non-empty string` };
    if (typeof p.new_string !== 'string') return { error: `source_patches[${i}].new_string must be a string` };
    if (p.replace_all !== undefined && typeof p.replace_all !== 'boolean') return { error: `source_patches[${i}].replace_all must be a boolean` };
    canon.push({ old_string: p.old_string, new_string: p.new_string, replace_all: p.replace_all === true });
  }
  return {
    count: canon.length,
    sha256: createHash('sha256').update(JSON.stringify(canon), 'utf8').digest('hex'),
    text: canon.map((p) => p.new_string).join('\n'),
  };
}

export function sourceTextOf(input) {
  // An empty source_code counts as absent: the MCP server then uploads source_file, so the hooks must read it too.
  if (typeof input?.source_code === 'string' && input.source_code.length > 0) return { text: input.source_code, file: null };
  const file = input?.source_file;
  if (typeof file !== 'string' || !file.trim()) return { text: null, file: null };
  if (!isAbsolute(file)) return { text: null, file, error: 'source_file must be an absolute path' };
  try {
    const st = statSync(file);
    if (!st.isFile()) return { text: null, file, error: 'source_file is not a file' };
    if (st.size > MAX_SOURCE_FILE_BYTES) return { text: null, file, error: 'source_file is too large' };
    return { text: readFileSync(file, 'utf8').replace(/^﻿/, ''), file };
  } catch {
    return { text: null, file, error: 'source_file cannot be read' };
  }
}
