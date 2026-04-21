#!/usr/bin/env node
// Standalone interactive editor for .sc4sap/sap.env — runs in its own
// terminal so Claude Code's session stays untouched.
//
// Usage (from any terminal, outside the Claude Code session):
//   node scripts/sap-option-tui.mjs                # default: cwd/.sc4sap/sap.env
//   node scripts/sap-option-tui.mjs --file <path>  # explicit path
//
// Design note: zero external deps. Uses readline for prompts and ANSI color
// codes for styling. Not a full-screen TUI (no alt-buffer) — it's a menu
// loop, which plays well across Windows Terminal / PowerShell / WSL / macOS.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolveSapEnvPath } from './lib/profile-resolve.mjs';

// ───── ANSI helpers ─────────────────────────────────────────────────────────
const NC = process.env.NO_COLOR === '1';
const c = (n) => (NC ? '' : `\x1b[${n}m`);
const C = { reset: c(0), dim: c(2), bold: c(1), red: c(31), green: c(32),
            yellow: c(33), blue: c(34), magenta: c(35), cyan: c(36), gray: c(90) };
const paint = (s, ...codes) => NC ? s : codes.join('') + s + C.reset;
const clear = () => process.stdout.write('\x1b[2J\x1b[H');

// ───── Managed keys & validation ────────────────────────────────────────────
const MANAGED = [
  { key: 'SAP_URL',                 group: 'Connection',  secret: false, validate: (v) => /^https?:\/\/[^ ]+$/.test(v) && !v.endsWith('/') || 'must start with http(s):// and not end with /' },
  { key: 'SAP_CLIENT',              group: 'Connection',  secret: false, validate: (v) => /^\d{3}$/.test(v) || 'must be exactly 3 digits' },
  { key: 'SAP_AUTH_TYPE',           group: 'Connection',  secret: false, validate: (v) => ['basic', 'xsuaa'].includes(v) || 'basic | xsuaa' },
  { key: 'SAP_USERNAME',            group: 'Connection',  secret: false },
  { key: 'SAP_PASSWORD',            group: 'Connection',  secret: true,  validate: (v) => v.length > 0 || 'cannot be empty' },
  { key: 'SAP_LANGUAGE',            group: 'Connection',  secret: false, validate: (v) => /^[A-Z]{2}$/.test(v) || '2-letter uppercase (EN/DE/KO/...)' },
  { key: 'SAP_SYSTEM_TYPE',         group: 'Connection',  secret: false, validate: (v) => ['onprem', 'cloud', 'legacy'].includes(v) || 'onprem | cloud | legacy' },
  { key: 'SAP_VERSION',             group: 'Connection',  secret: false, validate: (v) => ['S4', 'ECC'].includes(v) || 'S4 | ECC' },
  { key: 'ABAP_RELEASE',            group: 'Connection',  secret: false, validate: (v) => /^\d{3}$/.test(v) || '3-digit numeric (750/756/758/...)' },
  { key: 'TLS_REJECT_UNAUTHORIZED', group: 'Connection',  secret: false, validate: (v) => v === '0' || 'set to 0 (dev only) or unset' },
  { key: 'MCP_BLOCKLIST_PROFILE',   group: 'Blocklist',   secret: false, validate: (v) => ['minimal', 'standard', 'strict', 'off'].includes(v) || 'minimal | standard | strict | off' },
  { key: 'MCP_BLOCKLIST_EXTEND',    group: 'Blocklist',   secret: false },
  { key: 'MCP_ALLOW_TABLE',         group: 'Blocklist',   secret: false },
  { key: 'XSUAA_URL',               group: 'XSUAA',       secret: false },
  { key: 'XSUAA_CLIENT_ID',         group: 'XSUAA',       secret: false },
  { key: 'XSUAA_CLIENT_SECRET',     group: 'XSUAA',       secret: true  },
  { key: 'XSUAA_TOKEN_URL',         group: 'XSUAA',       secret: false },
];

// ───── dotenv parse/write that preserves comments & order ──────────────────
function parseEnv(text) {
  const lines = text.split(/\r?\n/);
  const entries = lines.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return { kind: 'blank', raw };
    if (trimmed.startsWith('#')) {
      const m = trimmed.match(/^#\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/);
      if (m) return { kind: 'commented', key: m[1], value: m[2].trim(), raw };
      return { kind: 'comment', raw };
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return { kind: 'other', raw };
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return { kind: 'kv', key, value, raw };
  });
  return entries;
}

function serializeEnv(entries) {
  return entries.map((e) => {
    if (e.kind === 'kv') return `${e.key}=${e.value}`;
    if (e.kind === 'commented') return `# ${e.key}=${e.value}`;
    return e.raw;
  }).join('\n').replace(/\n+$/, '') + '\n';
}

function getValue(entries, key) {
  const e = entries.find((x) => (x.kind === 'kv' || x.kind === 'commented') && x.key === key);
  return e ? { value: e.value, commented: e.kind === 'commented' } : null;
}

function setValue(entries, key, value, { commentOut = false } = {}) {
  const idx = entries.findIndex((x) => (x.kind === 'kv' || x.kind === 'commented') && x.key === key);
  if (idx === -1) {
    entries.push({ kind: commentOut ? 'commented' : 'kv', key, value, raw: '' });
    return;
  }
  entries[idx] = { ...entries[idx], kind: commentOut ? 'commented' : 'kv', value };
}

// ───── Display table ────────────────────────────────────────────────────────
function mask(value, isSecret) {
  if (!isSecret || !value) return value;
  return `*** (${value.length} chars)`;
}

function renderTable(entries) {
  const groups = ['Connection', 'Blocklist', 'XSUAA'];
  const out = [];
  for (const g of groups) {
    const keys = MANAGED.filter((m) => m.group === g);
    out.push(paint(`\n  ${g}`, C.bold, C.cyan));
    for (const m of keys) {
      const got = getValue(entries, m.key);
      const label = m.key.padEnd(26);
      if (!got) {
        out.push(`    ${paint(label, C.gray)} ${paint('(not set)', C.dim)}`);
      } else if (got.commented) {
        out.push(`    ${paint(label, C.gray)} ${paint(mask(got.value, m.secret) + ' (commented)', C.dim)}`);
      } else {
        const v = mask(got.value, m.secret);
        out.push(`    ${paint(label, C.bold)} ${paint(v, C.green)}`);
      }
    }
  }
  return out.join('\n');
}

// ───── Interactive loop ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const fileArgIdx = args.indexOf('--file');

  // Resolve the env path:
  //   1. --file <path> wins when supplied.
  //   2. Otherwise, consult the shared resolver which follows
  //      `<cwd>/.sc4sap/active-profile.txt` → `~/.sc4sap/profiles/<alias>/sap.env`
  //      (multi-profile) and falls back to the legacy project `sap.env`.
  let filePath;
  if (fileArgIdx >= 0) {
    filePath = path.resolve(args[fileArgIdx + 1]);
  } else {
    const hit = resolveSapEnvPath(process.cwd());
    filePath = hit?.path || path.resolve(process.cwd(), '.sc4sap', 'sap.env');
  }

  if (!fs.existsSync(filePath)) {
    console.error(paint(`\n  ✗ sap.env not found: ${filePath}`, C.red));
    console.error(paint('    Run `/sc4sap:setup` inside Claude Code first (or `/sc4sap:sap-option add` to register a profile), or pass --file <path>.\n', C.dim));
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output, terminal: true });
  const ask = (q) => rl.question(q);
  const askHidden = async (q) => {
    // Simple hidden input: temporarily disable echo by intercepting keypress.
    output.write(q);
    const original = input.isRaw;
    if (input.setRawMode) input.setRawMode(true);
    let buf = '';
    await new Promise((resolve) => {
      const onData = (chunk) => {
        const s = chunk.toString();
        for (const ch of s) {
          if (ch === '\n' || ch === '\r') { input.off('data', onData); resolve(); return; }
          if (ch === '\u0003') { process.exit(130); } // Ctrl+C
          if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
          buf += ch;
          output.write('*');
        }
      };
      input.on('data', onData);
    });
    if (input.setRawMode) input.setRawMode(original || false);
    output.write('\n');
    return buf;
  };

  let text = fs.readFileSync(filePath, 'utf8');
  let entries = parseEnv(text);
  let dirty = false;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      clear();
      console.log(paint('  sc4sap — sap.env option editor', C.bold, C.cyan));
      console.log(paint(`  ${filePath}`, C.dim));
      console.log(renderTable(entries));
      console.log();
      console.log(paint('  Commands:', C.dim));
      console.log(paint('    e <KEY>    edit a key         (e.g. e SAP_CLIENT)', C.dim));
      console.log(paint('    u <KEY>    unset / comment out                    ', C.dim));
      console.log(paint('    s          save & exit                            ', C.dim));
      console.log(paint('    q          quit without saving                    ', C.dim));
      const cmd = (await ask('\n  > ')).trim();

      if (!cmd) continue;
      if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
        if (dirty) {
          const ans = (await ask(paint('  Unsaved changes. Discard? (y/N) ', C.yellow))).trim().toLowerCase();
          if (ans !== 'y') continue;
        }
        break;
      }
      if (cmd === 's' || cmd === 'save') {
        if (!dirty) { console.log(paint('  (no changes)', C.dim)); await ask('  <enter> '); continue; }
        const bak = filePath + '.bak';
        fs.copyFileSync(filePath, bak);
        const tmp = filePath + '.tmp';
        fs.writeFileSync(tmp, serializeEnv(entries), 'utf8');
        fs.renameSync(tmp, filePath);
        console.log(paint(`  ✓ wrote ${filePath}`, C.green));
        console.log(paint(`  ✓ backup at ${bak}`, C.dim));
        console.log(paint('  Reconnect MCP (/mcp) in Claude Code to apply.', C.yellow));
        await ask('  <enter> ');
        break;
      }
      const m = cmd.match(/^(e|u)\s+([A-Z_][A-Z0-9_]*)$/i);
      if (!m) { console.log(paint('  unknown command', C.red)); await ask('  <enter> '); continue; }
      const action = m[1].toLowerCase();
      const key = m[2].toUpperCase();
      const meta = MANAGED.find((x) => x.key === key);
      if (!meta) {
        console.log(paint(`  ${key} is not a managed key. Skipping.`, C.yellow));
        await ask('  <enter> '); continue;
      }
      if (action === 'u') {
        setValue(entries, key, getValue(entries, key)?.value ?? '', { commentOut: true });
        dirty = true;
        continue;
      }
      // edit
      const cur = getValue(entries, key);
      console.log();
      if (cur) console.log(paint(`  current: ${mask(cur.value, meta.secret)}${cur.commented ? ' (commented)' : ''}`, C.dim));
      else     console.log(paint('  current: (not set)', C.dim));
      if (meta.validate) {
        const hint = meta.validate('__probe__');
        if (typeof hint === 'string') console.log(paint(`  format: ${hint}`, C.dim));
      }
      const newVal = meta.secret ? await askHidden('  new value: ') : (await ask('  new value: ')).trim();
      if (newVal === '' || newVal === '-') { continue; }
      if (meta.validate) {
        const res = meta.validate(newVal);
        if (res !== true) { console.log(paint(`  ✗ ${res}`, C.red)); await ask('  <enter> '); continue; }
      }
      if (key === 'MCP_BLOCKLIST_PROFILE' && newVal === 'off') {
        const confirm = (await ask(paint('  This disables ALL row-extraction guards. Type `I UNDERSTAND` to proceed: ', C.red))).trim();
        if (confirm !== 'I UNDERSTAND') { console.log(paint('  aborted', C.yellow)); await ask('  <enter> '); continue; }
      }
      setValue(entries, key, newVal);
      dirty = true;
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
