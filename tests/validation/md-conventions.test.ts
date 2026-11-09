import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Repo conventions for the prompt files Claude loads (skills, agents, rules).
// Mechanical checks only. "English-first" stays guidance in the workspace
// CLAUDE.md: Korean trigger phrases, approval tokens and ko output labels are
// legitimate, so a hard check would be wrong.

const ROOT = join(__dirname, '..', '..');
const PROMPT_DIRS = ['skills', 'agents', 'common', 'exceptions'];
const MAX_LINES = 200;

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = PROMPT_DIRS.flatMap((d) => mdFiles(join(ROOT, d)));
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

describe('Prompt MD conventions', () => {
  it('finds prompt MD files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it(`skill / agent / rule MDs are at most ${MAX_LINES} lines (split into a companion file)`, () => {
    const over = files
      .map((f) => ({ f: rel(f), n: readFileSync(f, 'utf-8').replace(/\r/g, '').split('\n').length }))
      .filter(({ n }) => n > MAX_LINES + 1) // +1: trailing newline
      .map(({ f, n }) => `${f} (${n})`);
    expect(over, 'files over the line limit').toEqual([]);
  });

  it('every subagent_type names a plugin agent with the "sc4sap:" prefix', () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf-8').split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/subagent_type\s*[:=]\s*["'`]([^"'`]+)["'`]/g)) {
          const v = m[1];
          if (v.startsWith('sap-') && !v.startsWith('sc4sap:')) bad.push(`${rel(f)}:${i + 1} ${v}`);
        }
      });
    }
    expect(bad, 'subagent_type without sc4sap: prefix').toEqual([]);
  });
});
