import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The PreToolUse hook run as Claude Code runs it: payload on stdin, profile from the cwd's pointer.
const HOOK = join(__dirname, '..', '..', 'scripts', 'hooks', 'tier-readonly-guard.mjs');
const root = mkdtempSync(join(tmpdir(), 'tier-guard-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function workspace(tier: string) {
  const home = join(root, `home-${tier}`);
  const ws = join(root, `ws-${tier}`);
  mkdirSync(join(home, 'profiles', `P-${tier}`), { recursive: true });
  writeFileSync(join(home, 'profiles', `P-${tier}`, 'sap.env'), `SAP_TIER=${tier}\n`);
  mkdirSync(join(ws, '.sc4sap'), { recursive: true });
  writeFileSync(join(ws, '.sc4sap', 'active-profile.txt'), `P-${tier}`);
  return { home, ws };
}
const spaces = { DEV: workspace('DEV'), QA: workspace('QA'), PRD: workspace('PRD') };

function decide(tier: 'DEV' | 'QA' | 'PRD', tool: string) {
  const { home, ws } = spaces[tier];
  const r = spawnSync(process.execPath, [HOOK], {
    cwd: ws,
    input: JSON.stringify({ tool_name: `mcp__plugin_sc4sap_sap__${tool}`, tool_input: {} }),
    env: { ...process.env, SC4SAP_HOME_DIR: home },
    encoding: 'utf8',
  });
  if (!r.stdout.trim()) return 'allow';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

describe('tier-readonly-guard', () => {
  it('blocks the form renders on QA and PRD, allows them on DEV', () => {
    for (const tool of ['RenderSmartForm', 'RenderAdobeForm']) {
      expect(decide('PRD', tool)).toBe('deny');
      expect(decide('QA', tool)).toBe('deny');
      expect(decide('DEV', tool)).toBe('allow');
    }
  });

  it('keeps GetStandardText on DEV profiles only', () => {
    expect(decide('PRD', 'GetStandardText')).toBe('deny');
    expect(decide('QA', 'GetStandardText')).toBe('deny');
    expect(decide('DEV', 'GetStandardText')).toBe('allow');
  });

  it('leaves the form reads alone everywhere', () => {
    for (const tool of ['GetAdobeFormContent', 'GetSmartFormContent']) {
      for (const tier of ['DEV', 'QA', 'PRD'] as const) expect(decide(tier, tool)).toBe('allow');
    }
  });

  it('keeps the existing matrix: mutations blocked on QA / PRD, RunUnitTest allowed on QA only', () => {
    expect(decide('PRD', 'CreateClass')).toBe('deny');
    expect(decide('QA', 'UpdateProgram')).toBe('deny');
    expect(decide('DEV', 'CreateClass')).toBe('allow');
    expect(decide('QA', 'RunUnitTest')).toBe('allow');
    expect(decide('PRD', 'RunUnitTest')).toBe('deny');
  });
});
