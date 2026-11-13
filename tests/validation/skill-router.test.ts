import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ROUTER = readFileSync(join(ROOT, 'common', 'skill-router.md'), 'utf8');
const DIGEST = (ROUTER.match(/<!-- skill-router:start -->\r?\n([\s\S]*?)\r?\n<!-- skill-router:end -->/) || [])[1] || '';

// Skills a user reaches from plain chat. Internal / wrapper skills are not routed.
const NOT_ROUTED = new Set(['trust-session', 'eco']);
const routable = readdirSync(join(ROOT, 'skills'))
  .filter((d) => existsSync(join(ROOT, 'skills', d, 'SKILL.md')) && !NOT_ROUTED.has(d));

describe('skill router digest', () => {
  it('exists and stays short (it is injected into every session)', () => {
    expect(DIGEST).toContain('[SC4SAP] Skill routing');
    expect(DIGEST.split(/\r?\n/).length).toBeLessThanOrEqual(30);
  });

  it.each(routable)('routes %s', (skill) => {
    expect(DIGEST).toMatch(new RegExp(`(→|·) ${skill}\\b`));
  });

  it('names only skills that exist', () => {
    // a skill name is followed by end of line, " ·" or " (" in the digest
    const named = [...DIGEST.matchAll(/(?:→|·) ([a-z][a-z-]+[a-z])(?= ·| \(|\r?$)/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThanOrEqual(routable.length);
    for (const n of named) expect(existsSync(join(ROOT, 'skills', n, 'SKILL.md')), n).toBe(true);
  });

  it('is injected by the SessionStart hook', () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'session-start.mjs')], {
      input: JSON.stringify({ cwd: tmpdir() }),
      encoding: 'utf8',
    });
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.additionalContext).toContain(DIGEST.split(/\r?\n/)[0]);
  });
});
