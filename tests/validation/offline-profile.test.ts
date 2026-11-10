import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const CLI = join(ROOT, 'scripts', 'sap-profile-cli.mjs');
const BRIDGE = join(ROOT, 'bridge', 'mcp-server.cjs');

let home: string;
let project: string;

const run = (args: string[], stdin?: unknown, cwd = project) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input: stdin === undefined ? '' : JSON.stringify(stdin),
    env: { ...process.env, SC4SAP_HOME_DIR: home },
    encoding: 'utf8',
  });
const json = (r: { stdout: string }) => JSON.parse(r.stdout);
const envOf = (alias: string) => readFileSync(join(home, 'profiles', alias, 'sap.env'), 'utf8');
const configOf = (alias: string) => JSON.parse(readFileSync(join(home, 'profiles', alias, 'config.json'), 'utf8'));
const identity = { version: 'S4', abapRelease: '816', industry: 'other', activeModules: 'MM,SD' };

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'sc4sap-home-'));
  project = mkdtempSync(join(tmpdir(), 'sc4sap-proj-'));
  mkdirSync(join(project, '.sc4sap'), { recursive: true });
});
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

describe('sap-profile-cli — offline profiles', () => {
  it('creates an offline profile without connection fields', () => {
    const r = run(['add'], { alias: 'KR-OFF', connection: 'offline', country: 'KR', ...identity });
    expect(r.status, r.stderr).toBe(0);
    expect(json(r)).toMatchObject({ ok: true, alias: 'KR-OFF', tier: 'DEV', connection: 'offline', passwordStored: 'none' });
    const env = envOf('KR-OFF');
    expect(env).toMatch(/^SAP_CONNECTION=offline$/m);
    expect(env).toMatch(/^SAP_URL=$/m);
    expect(env).toMatch(/^SAP_COUNTRY=kr$/m);
    expect(configOf('KR-OFF')).toMatchObject({ connection: 'offline', country: 'kr', sapVersion: 'S4', activeModules: ['MM', 'SD'] });
  });

  it('rejects host / password on an offline profile and a bad connection value', () => {
    expect(run(['add'], { alias: 'X1', connection: 'offline', host: 'https://h:1', ...identity }).status).toBe(2);
    expect(run(['add'], { alias: 'X2', connection: 'offline', passwordPrompt: true, ...identity }).status).toBe(2);
    expect(run(['add'], { alias: 'X3', connection: 'maybe', tier: 'DEV', ...identity }).status).toBe(2);
    expect(existsSync(join(home, 'profiles', 'X1'))).toBe(false);
  });

  it('still requires the identity fields offline', () => {
    const r = run(['add'], { alias: 'X4', connection: 'offline', version: 'S4' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('identity field(s) missing');
  });

  it('online profiles keep requiring a tier and default to connection online', () => {
    expect(run(['add'], { alias: 'X5', host: 'https://h:1', ...identity }).status).toBe(2);
    const r = run(['add'], { alias: 'KR-DEV', tier: 'DEV', host: 'https://dev.example:44300', client: '100', username: 'U', ...identity });
    expect(r.status, r.stderr).toBe(0);
    expect(json(r).connection).toBe('online');
    expect(envOf('KR-DEV')).toMatch(/^SAP_CONNECTION=online$/m);
  });

  it('validate skips the connection checks for offline and lists the connection', () => {
    const v = json(run(['validate', 'KR-OFF']));
    expect(v.ok).toBe(true);
    expect(v.results[0]).toMatchObject({ connection: 'offline', errors: [] });
    const l = json(run(['list']));
    expect(l.profiles.find((p: { alias: string }) => p.alias === 'KR-OFF').connection).toBe('offline');
  });

  it('set-connection: online needs SAP_URL; offline ↔ online flips env + config', () => {
    const up = run(['set-connection', 'online', 'KR-OFF']);
    expect(up.status).toBe(2);
    expect(up.stderr).toContain('no SAP_URL');
    const down = json(run(['set-connection', 'offline', 'KR-DEV']));
    expect(down).toMatchObject({ ok: true, connection: 'offline', previous: 'online', restartNeeded: true });
    expect(configOf('KR-DEV').connection).toBe('offline');
    const back = json(run(['set-connection', 'online', 'KR-DEV']));
    expect(back).toMatchObject({ connection: 'online', previous: 'offline' });
    expect(envOf('KR-DEV')).toMatch(/^SAP_CONNECTION=online$/m);
    expect(run(['set-connection', 'sideways', 'KR-DEV']).status).toBe(1);
  });
});

describe('offline runtime — bridge, HUD, SessionStart', () => {
  it('bridge exits 0 without starting the server for an offline profile', () => {
    writeFileSync(join(project, '.sc4sap', 'active-profile.txt'), 'KR-OFF\n');
    const r = spawnSync(process.execPath, [BRIDGE], {
      cwd: project,
      env: { ...process.env, SC4SAP_HOME_DIR: home, SC4SAP_MCP_AUTOBUILD: '0' },
      encoding: 'utf8',
      timeout: 20000,
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('OFFLINE');
    expect(r.stderr).not.toContain('Config not found');
  });

  it('HUD profile and SessionStart reminder see the offline flag', async () => {
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const { activeProfile } = await import('../../scripts/hud/lib/sc4sap-status.mjs');
      const { offlineReminder } = await import('../../scripts/lib/offline-reminder.mjs');
      writeFileSync(join(project, '.sc4sap', 'active-profile.txt'), 'KR-OFF\n');
      expect(activeProfile(project)).toMatchObject({ alias: 'KR-OFF', offline: true });
      expect(offlineReminder(project)).toContain('KR-OFF" is OFFLINE');
      writeFileSync(join(project, '.sc4sap', 'active-profile.txt'), 'KR-DEV\n');
      expect(activeProfile(project)).toMatchObject({ alias: 'KR-DEV', offline: false });
      expect(offlineReminder(project)).toBeNull();
    } finally {
      delete process.env.SC4SAP_HOME_DIR;
    }
  });
});

describe('offline-mode rule coverage', () => {
  const rule = readFileSync(join(ROOT, 'common', 'offline-mode.md'), 'utf8');
  // Internal / redirect skills carry no user-facing offline behavior of their own.
  const exempt = new Set(['trust-session', 'mcp-setup', 'package-to-process']);
  const skills = readdirSync(join(ROOT, 'skills')).filter((s) => existsSync(join(ROOT, 'skills', s, 'SKILL.md')) && !exempt.has(s));

  it.each(skills)('%s points to the offline rule and is named in its class table', (skill) => {
    const md = readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    expect(md).toContain('../../common/offline-mode.md');
    expect(rule).toContain(`\`${skill}\``);
  });
});
