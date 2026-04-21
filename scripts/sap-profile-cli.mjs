#!/usr/bin/env node
/**
 * sc4sap Profile CLI — backend for the sap-option skill's multi-profile flows.
 *
 * All side effects (profile file writes, keychain updates, active-profile
 * pointer changes) live here so the skill markdown can stay declarative.
 *
 * Contracts:
 *   - JSON in / JSON out on stdin and stdout. Errors go to stderr and exit != 0.
 *   - Passwords are never accepted on the command line; pass them via stdin
 *     payload field `password`.
 *   - Exit codes: 0 ok, 1 usage, 2 validation, 3 not-found, 4 conflict,
 *     5 keychain, 9 unknown.
 *
 * Commands (subcommand is the first arg):
 *   list              — list all profiles with active marker
 *   show <alias>      — dump one profile (password never included)
 *   switch <alias>    — write active-profile.txt in cwd
 *   add               — read JSON from stdin: {alias, tier, host, client,
 *                       username, password, description?, language?,
 *                       systemType?, version?, abapRelease?, industry?,
 *                       activeModules?, copyFrom?} → create profile dir
 *   remove <alias>    — archive to .trash (user must confirm alias in skill)
 *   purge [--all]     — permanently delete .trash entries > 7 days old
 *   migrate           — read JSON from stdin: {alias, tier} → convert
 *                       <cwd>/.sc4sap/sap.env into
 *                       $SC4SAP_HOME_DIR/profiles/<alias>/ and archive source
 *   detect-legacy     — print JSON with legacy detection state (for
 *                       SessionStart banner)
 *   keychain-set      — read JSON from stdin: {service, account, password}
 *   keychain-delete   — read JSON from stdin: {service, account}
 *   validate [<alias>] — run sanity checks against one or all profiles.
 *                        Output: {errors: [...], warnings: [...]}.
 *   version           — print CLI version + plugin-declared feature version
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

// Polyfill `require` for ESM so @napi-rs/keyring (CJS) loads lazily without
// breaking pure-ESM execution paths.
globalThis.require ||= createRequire(import.meta.url);

const KEYCHAIN_SERVICE_DEFAULT = 'sc4sap';

const CLI_VERSION = '1.0.0';
// Multi-profile infrastructure was introduced here. Used by detect-legacy
// banner so the plugin can tell users what changed.
const MULTI_PROFILE_SINCE = '0.6.0';

function sc4sapHome() {
  return process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
}
function profilesDir() {
  return join(sc4sapHome(), 'profiles');
}
function trashDir() {
  return join(profilesDir(), '.trash');
}
function legacyFiles(cwd) {
  return {
    env: join(cwd, '.sc4sap', 'sap.env'),
    config: join(cwd, '.sc4sap', 'config.json'),
    pointer: join(cwd, '.sc4sap', 'active-profile.txt'),
  };
}

function die(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}
function jsonOut(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}
function formatDotenv(record) {
  const lines = [];
  for (const [k, v] of Object.entries(record)) {
    if (v == null) continue;
    lines.push(`${k}=${v}`);
  }
  return `${lines.join('\n')}\n`;
}

function normalizeTier(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'DEV' || s === 'QA' || s === 'PRD') return s;
  return null;
}

function loadKeyring() {
  try {
    return require('@napi-rs/keyring').Entry;
  } catch {
    return null;
  }
}
class KeychainUnavailableError extends Error {
  constructor() {
    super('@napi-rs/keyring not available on this platform.');
    this.code = 'ERR_KEYCHAIN_UNAVAILABLE';
  }
}
function keychainWrite(service, account, password) {
  const Entry = loadKeyring();
  if (!Entry) throw new KeychainUnavailableError();
  new Entry(service, account).setPassword(password);
}
function keychainDelete(service, account) {
  const Entry = loadKeyring();
  if (!Entry) throw new KeychainUnavailableError();
  return new Entry(service, account).deletePassword();
}

async function readStdinJson() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;
  if (!buf.trim()) return {};
  try {
    return JSON.parse(buf);
  } catch (e) {
    die(1, `Invalid JSON on stdin: ${e.message}`);
  }
}

function listProfiles() {
  const dir = profilesDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f !== '.trash' && statSync(join(dir, f)).isDirectory())
    .sort();
}
// Mask SAP_PASSWORD for display. Output must NEVER reveal a plaintext
// password. Accepted display values:
//   ""                                 — no password configured
//   "keychain:<service>/<account>"     — safe reference (no secret leaks)
//   "plaintext (masked)"               — a raw password sits in the env
//                                        file; surface the fact without
//                                        revealing the value so the user
//                                        knows to re-run `sap-option edit`.
function maskPasswordField(raw) {
  const v = String(raw || '');
  if (v === '') return '';
  if (v.startsWith('keychain:')) return v;
  return 'plaintext (masked)';
}

function readProfile(alias) {
  const envPath = join(profilesDir(), alias, 'sap.env');
  if (!existsSync(envPath)) return null;
  const env = parseDotenv(readFileSync(envPath, 'utf8'));
  return {
    alias,
    tier: normalizeTier(env.SAP_TIER) || 'DEV',
    host: env.SAP_URL || '',
    client: env.SAP_CLIENT || '',
    username: env.SAP_USERNAME || '',
    language: env.SAP_LANGUAGE || '',
    systemType: env.SAP_SYSTEM_TYPE || '',
    version: env.SAP_VERSION || '',
    abapRelease: env.ABAP_RELEASE || '',
    industry: env.SAP_INDUSTRY || '',
    activeModules: env.SAP_ACTIVE_MODULES || '',
    description: env.SAP_DESCRIPTION || '',
    passwordRef: maskPasswordField(env.SAP_PASSWORD),
  };
}
function readActiveAlias(cwd) {
  const p = legacyFiles(cwd).pointer;
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8').trim();
  return raw.length > 0 ? raw : null;
}

async function cmdList(cwd) {
  const profiles = listProfiles().map((alias) => readProfile(alias)).filter(Boolean);
  const active = readActiveAlias(cwd);
  jsonOut({ active, profiles });
}
async function cmdShow(cwd, alias) {
  if (!alias) die(1, 'show: alias required');
  const p = readProfile(alias);
  if (!p) die(3, `profile not found: ${alias}`);
  jsonOut({ active: readActiveAlias(cwd) === alias, ...p });
}
async function cmdSwitch(cwd, alias) {
  if (!alias) die(1, 'switch: alias required');
  if (!existsSync(join(profilesDir(), alias))) die(3, `profile not found: ${alias}`);
  const f = legacyFiles(cwd);
  mkdirSync(dirname(f.pointer), { recursive: true });
  writeFileSync(f.pointer, `${alias}\n`);
  jsonOut({ ok: true, active: alias });
}
async function cmdAdd() {
  const payload = await readStdinJson();
  const alias = String(payload.alias || '').trim();
  const tier = normalizeTier(payload.tier);
  if (!alias) die(2, 'add: alias required');
  if (!/^[A-Z0-9_-]+$/i.test(alias)) die(2, 'add: alias must match [A-Z0-9_-]');
  if (!tier) die(2, 'add: tier must be DEV | QA | PRD');
  const targetDir = join(profilesDir(), alias);
  if (existsSync(targetDir)) die(4, `profile already exists: ${alias}`);

  let base = {};
  if (payload.copyFrom) {
    const src = readProfile(String(payload.copyFrom));
    if (!src) die(3, `copyFrom profile not found: ${payload.copyFrom}`);
    base = {
      SAP_LANGUAGE: src.language,
      SAP_SYSTEM_TYPE: src.systemType,
      SAP_VERSION: src.version,
      ABAP_RELEASE: src.abapRelease,
      SAP_INDUSTRY: src.industry,
      SAP_ACTIVE_MODULES: src.activeModules,
    };
  }

  const service = String(payload.keychainService || KEYCHAIN_SERVICE_DEFAULT);
  const username = String(payload.username || '');
  const password = payload.password;
  let passwordRef = '';
  if (password) {
    const account = `${alias}/${username}`;
    try {
      keychainWrite(service, account, String(password));
      passwordRef = `keychain:${service}/${account}`;
    } catch (e) {
      die(5, `keychain write failed: ${e.message}`);
    }
  }

  const env = {
    SAP_URL: payload.host || '',
    SAP_CLIENT: payload.client || '',
    SAP_AUTH_TYPE: payload.authType || 'basic',
    SAP_USERNAME: username,
    SAP_PASSWORD: passwordRef,
    SAP_LANGUAGE: payload.language || base.SAP_LANGUAGE || 'EN',
    SAP_SYSTEM_TYPE: payload.systemType || base.SAP_SYSTEM_TYPE || 'onprem',
    SAP_VERSION: payload.version || base.SAP_VERSION || '',
    ABAP_RELEASE: payload.abapRelease || base.ABAP_RELEASE || '',
    SAP_INDUSTRY: payload.industry || base.SAP_INDUSTRY || '',
    SAP_ACTIVE_MODULES: payload.activeModules || base.SAP_ACTIVE_MODULES || '',
    SAP_TIER: tier,
    SAP_DESCRIPTION: payload.description || '',
  };

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, 'sap.env'), formatDotenv(env));
  const configJson = {
    sapVersion: env.SAP_VERSION,
    industry: env.SAP_INDUSTRY,
    activeModules: env.SAP_ACTIVE_MODULES.split(',').map((s) => s.trim()).filter(Boolean),
    tier,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(targetDir, 'config.json'), `${JSON.stringify(configJson, null, 2)}\n`);
  jsonOut({ ok: true, alias, tier, readonly: tier !== 'DEV' });
}

async function cmdRemove(cwd, alias) {
  if (!alias) die(1, 'remove: alias required');
  const src = join(profilesDir(), alias);
  if (!existsSync(src)) die(3, `profile not found: ${alias}`);
  if (readActiveAlias(cwd) === alias) die(4, `cannot remove active profile: switch first`);
  const ts = new Date().toISOString().replace(/[:]/g, '-').replace(/\..*/, '');
  const dest = join(trashDir(), `${alias}-${ts}`);
  mkdirSync(trashDir(), { recursive: true });
  renameSync(src, dest);
  jsonOut({ ok: true, archivedTo: dest });
}

async function cmdPurge(all) {
  const dir = trashDir();
  if (!existsSync(dir)) {
    jsonOut({ ok: true, purged: [] });
    return;
  }
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const purged = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const ageMs = now - statSync(p).mtimeMs;
    if (all || ageMs > sevenDaysMs) {
      rmSync(p, { recursive: true, force: true });
      purged.push(name);
    }
  }
  jsonOut({ ok: true, purged });
}

async function cmdMigrate(cwd) {
  const payload = await readStdinJson();
  const alias = String(payload.alias || '').trim();
  const tier = normalizeTier(payload.tier);
  if (!alias) die(2, 'migrate: alias required');
  if (!tier) die(2, 'migrate: tier required');
  const f = legacyFiles(cwd);
  if (!existsSync(f.env)) die(3, `legacy sap.env not found at ${f.env}`);
  const targetDir = join(profilesDir(), alias);
  if (existsSync(targetDir)) die(4, `profile already exists: ${alias}`);

  const legacyEnv = parseDotenv(readFileSync(f.env, 'utf8'));
  const username = legacyEnv.SAP_USERNAME || '';
  const password = legacyEnv.SAP_PASSWORD || '';
  let passwordRef = '';
  if (password) {
    const service = KEYCHAIN_SERVICE_DEFAULT;
    const account = `${alias}/${username}`;
    try {
      keychainWrite(service, account, password);
      passwordRef = `keychain:${service}/${account}`;
    } catch (e) {
      // Fall back to plaintext if keychain is unavailable; warn via stderr.
      process.stderr.write(
        `[migrate] WARNING: keychain unavailable (${e.message}); storing password as plaintext in new profile.\n`,
      );
      passwordRef = password;
    }
  }

  const newEnv = { ...legacyEnv, SAP_PASSWORD: passwordRef, SAP_TIER: tier };
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, 'sap.env'), formatDotenv(newEnv));
  if (existsSync(f.config)) {
    cpSync(f.config, join(targetDir, 'config.json'));
  }

  // Archive legacy to sibling .legacy files (keep config.json in place for any
  // project-local references; migration does not delete the project artifact).
  renameSync(f.env, `${f.env}.legacy`);

  mkdirSync(dirname(f.pointer), { recursive: true });
  writeFileSync(f.pointer, `${alias}\n`);

  jsonOut({
    ok: true,
    alias,
    tier,
    profileDir: targetDir,
    archived: `${f.env}.legacy`,
    passwordStored: passwordRef.startsWith('keychain:') ? 'keychain' : (passwordRef ? 'plaintext-fallback' : 'none'),
  });
}

async function cmdDetectLegacy(cwd) {
  const f = legacyFiles(cwd);
  const legacyExists = existsSync(f.env);
  const pointerExists = existsSync(f.pointer);
  const profilesExist = existsSync(profilesDir()) && listProfiles().length > 0;
  const needsMigration = legacyExists && !pointerExists && !profilesExist;
  jsonOut({
    legacyEnv: legacyExists ? f.env : null,
    activePointer: pointerExists ? f.pointer : null,
    profilesDir: profilesExist ? profilesDir() : null,
    needsMigration,
    multiProfileSince: MULTI_PROFILE_SINCE,
  });
}

function validateProfile(p, otherProfiles) {
  const errors = [];
  const warnings = [];

  if (!['DEV', 'QA', 'PRD'].includes(p.tier)) {
    errors.push(`invalid tier "${p.tier}" (expected DEV | QA | PRD)`);
  }
  if (!/^https?:\/\/[^ ]+[^/]$/.test(p.host || '')) {
    if (!p.host) errors.push('missing SAP_URL');
    else if (/\/$/.test(p.host)) errors.push(`SAP_URL must not end with /: ${p.host}`);
    else errors.push(`SAP_URL must start with http(s)://: ${p.host}`);
  }
  if (p.client && !/^\d{3}$/.test(p.client)) {
    errors.push(`SAP_CLIENT must be 3 digits: ${p.client}`);
  }
  if (!p.username) warnings.push('SAP_USERNAME is empty');

  // Tier-vs-host sanity: PRD/QA profile with obvious dev/sbx/test host is suspicious.
  // Extract host from URL so we do not depend on scheme/port decoration.
  let hostOnly = (p.host || '').toLowerCase();
  try {
    hostOnly = new URL(p.host).hostname;
  } catch { /* leave as-is when URL is already invalid; upstream error will flag it */ }
  const hostRe = (words) => new RegExp(`(^|[.\\-])(${words})([.\\-]|$)`);
  if (p.tier === 'PRD' && hostRe('dev|sbx|sandbox|qas?|test').test(hostOnly)) {
    warnings.push(
      `tier=PRD but host looks non-prod: "${p.host}". Double-check the URL; production-safe enforcement depends on this field.`,
    );
  }
  if (p.tier === 'QA' && hostRe('prd|prod').test(hostOnly)) {
    warnings.push(
      `tier=QA but host looks like production: "${p.host}". If this is PRD, re-create the profile with tier=PRD.`,
    );
  }

  // Duplicate (host, client) detection. Compare on the full SAP_URL string
  // (not parsed hostname) so that port / path differences still count as
  // different logical systems.
  const rawHost = (p.host || '').toLowerCase();
  const dupes = otherProfiles.filter(
    (o) =>
      o.alias !== p.alias &&
      (o.host || '').toLowerCase() === rawHost &&
      String(o.client || '') === String(p.client || ''),
  );
  if (dupes.length > 0) {
    warnings.push(
      `duplicate (host, client) with: ${dupes.map((d) => d.alias).join(', ')}. The same SAP system is registered under more than one alias.`,
    );
  }

  // Password storage hint.
  if (p.passwordRef && !p.passwordRef.startsWith('keychain:')) {
    warnings.push(
      'SAP_PASSWORD is plaintext in sap.env — consider re-running `sap-option edit` to move it into the OS keychain.',
    );
  }

  return { alias: p.alias, tier: p.tier, errors, warnings };
}

async function cmdValidate(requestedAlias) {
  const aliases = requestedAlias ? [requestedAlias] : listProfiles();
  const all = listProfiles().map((a) => readProfile(a)).filter(Boolean);
  const results = [];
  for (const alias of aliases) {
    const p = readProfile(alias);
    if (!p) {
      results.push({ alias, errors: [`profile not found: ${alias}`], warnings: [] });
      continue;
    }
    results.push(validateProfile(p, all));
  }
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = results.reduce((n, r) => n + r.warnings.length, 0);
  jsonOut({ ok: errorCount === 0, errorCount, warningCount, results });
}

async function cmdKeychainSet() {
  const { service, account, password } = await readStdinJson();
  if (!service || !account || !password) die(2, 'keychain-set: service, account, password required');
  try {
    keychainWrite(service, account, String(password));
  } catch (e) {
    die(5, `keychain-set failed: ${e.message}`);
  }
  jsonOut({ ok: true });
}
async function cmdKeychainDelete() {
  const { service, account } = await readStdinJson();
  if (!service || !account) die(2, 'keychain-delete: service, account required');
  try {
    const removed = keychainDelete(service, account);
    jsonOut({ ok: true, removed });
  } catch (e) {
    die(5, `keychain-delete failed: ${e.message}`);
  }
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const cwd = process.cwd();
  try {
    switch (cmd) {
      case 'list': return await cmdList(cwd);
      case 'show': return await cmdShow(cwd, rest[0]);
      case 'switch': return await cmdSwitch(cwd, rest[0]);
      case 'add': return await cmdAdd();
      case 'remove': return await cmdRemove(cwd, rest[0]);
      case 'purge': return await cmdPurge(rest.includes('--all'));
      case 'migrate': return await cmdMigrate(cwd);
      case 'detect-legacy': return await cmdDetectLegacy(cwd);
      case 'keychain-set': return await cmdKeychainSet();
      case 'keychain-delete': return await cmdKeychainDelete();
      case 'validate': return await cmdValidate(rest[0]);
      case 'version':
        jsonOut({ cli: CLI_VERSION, multiProfileSince: MULTI_PROFILE_SINCE });
        return;
      default:
        die(1, `unknown subcommand: ${cmd || '(none)'}`);
    }
  } catch (e) {
    die(9, `error: ${e?.stack || e?.message || String(e)}`);
  }
}

main();
