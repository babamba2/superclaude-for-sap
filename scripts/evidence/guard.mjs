#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Evidence guard.
 *
 * Denies agent writes to the evidence ledger (`.sc4sap/evidence/`) and to
 * `receipt.json` files, so the receipt can only come from build-receipt.mjs; and to the
 * program-test run files the capture hook / pt.mjs write (state, captured rows and source,
 * generated harness, pt-receipt).
 *
 *   Write / Edit / MultiEdit / NotebookEdit → deny when the target path is protected.
 *   Bash / PowerShell → deny when the command names a protected path, unless the
 *   command only runs build-receipt.mjs or program-test/pt.mjs. Reading these files goes through Read.
 *
 * Limit: a determined agent could still write a script elsewhere and run it.
 * The guard stops the easy paths; the user's check in the TCode stays the final gate.
 * Fails open on parse errors.
 */

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdin } from '../lib/stdin.mjs';

// The one pt.mjs allowed to write program-test run files: this plugin's own copy, resolved from
// this file's location — a copy written elsewhere does not pass.
const GUARD_DIR = dirname(fileURLToPath(import.meta.url));
const PT_PATH = resolve(GUARD_DIR, '..', 'program-test', 'pt.mjs');
// The allow-listed md-to-html.mjs / build-receipt.mjs: this plugin's own copies, resolved the same way.
const MD_PATH = resolve(GUARD_DIR, '..', 'spec', 'md-to-html.mjs');
const BR_PATH = resolve(GUARD_DIR, 'build-receipt.mjs');
const normPath = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();
const WIN = process.platform === 'win32';
/** A Git Bash drive path (/c/Users/…) as Windows reads it (C:/Users/…); other paths unchanged. */
const nativePath = (p) => (WIN ? String(p).replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:') : String(p));
/** True when `script`, resolved against `base`, is exactly `target` (case-insensitive on Windows). */
const isPluginScript = (script, base, target) => {
  const key = (p) => { const r = resolve(p).replace(/\\/g, '/'); return WIN ? r.toLowerCase() : r; };
  return key(resolve(nativePath(base || process.cwd()), nativePath(script))) === key(target);
};

/** True when the command only runs the plugin's own pt.mjs (absolute, or relative to the cwd) with plain arguments. */
export function onlyPluginPt(cmd, cwd) {
  const m = String(cmd).match(/^\s*node\s+(?:"([^"]+)"|(\S+))((?:\s+[\w\-,.:\\/"]+)*)\s*$/);
  if (!m) return false;
  const script = m[1] ?? m[2];
  if (!/pt\.mjs$/i.test(script)) return false;
  return normPath(resolve(cwd || process.cwd(), script)) === normPath(PT_PATH);
}

const PROTECTED_BASE = /\.sc4sap[\\/]+(?:evidence(?:[\\/]|\b)|program[\\/]+[^\\/\s"']+[\\/]+receipt\.json|(?:work[\\/]+[^\\/\s"']+[\\/]+)?program[\\/]+[^\\/\s"']+[\\/]+test[\\/]+[^\\/\s"']+[\\/]+(?:state\.json|capture\.jsonl|fingerprints\.json|pt-receipt\.json|rows(?:[\\/]|\b)|src(?:[\\/]|\b)|ddic(?:[\\/]|\b)|harness(?:[\\/]|\b))|program-test[\\/]+active\.json)/i;
// A program-test run under any base folder (`pt.mjs init --base`, e.g. a web run's own output folder):
// program/<PROG>/test/<yyyymmdd-hhmmss>/<script- or hook-written file>.
const PROTECTED_RUN = /(?:^|[\\/])program[\\/]+[^\\/\s"']+[\\/]+test[\\/]+\d{8}-\d{6}[\\/]+(?:state\.json|capture\.jsonl|fingerprints\.json|pt-receipt\.json|rows(?:[\\/]|\b)|src(?:[\\/]|\b)|ddic(?:[\\/]|\b)|harness(?:[\\/]|\b))/i;
const PROTECTED = { test: (s) => PROTECTED_BASE.test(s) || PROTECTED_RUN.test(s) };
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

// ── the MCP server's masking key (profiles/<alias>/mask.key) ─────────────────
// Tokens of masked test-data reads are HMAC under this key; a model that could read it could
// test guessed values against the tokens. Defense in depth — the same OS user's shell can
// always reach a file the MCP server reads (residual risk accepted by the user for local,
// single-user CLI use). Denied:
//   - any tool input naming mask.key, also after removing quotes, backslashes, [ ] , + , ` , ^;
//   - Grep over a folder that holds the profile folders or sits inside one;
//   - shell commands naming the profiles folder (cd / pushd / Set-Location into it included),
//     unless they only move / delete, or read exactly <profile>/sap.env or config.json;
//   - shell commands reading the sc4sap home with a wildcard or recursively;
//   - links (ln / mklink / SymbolicLink / Junction) in commands naming the sc4sap home; a shell
//     whose cwd is inside the home climbing out of it;
//   - interpreter one-liners (node -e, python -c, powershell -c, bash -c, …) and encoded
//     PowerShell that reference the sc4sap home or the user's home folder.
// Allowed despite the above: only the two whole commands of allowListedCommand (below).
const MASK_KEY = /mask\.key/i;
const WIDE_READ = /[*?]|(?:^|\s)-[a-zA-Z]*[rR][a-zA-Z]*\b|-Recurse\b|\s\/s\b|\btar\b|\bzip\b|\brobocopy\b|\bxcopy\b/;
const MOVE_ONLY = /^\s*(?:rm|mv|mkdir|rmdir|Remove-Item|Move-Item|New-Item)\b/i;
const CHAINED = /;|&&|\|\||\||\$\(|`|\n|\r/;
const CD_LIKE = /(?:^|[;&|\s])(?:cd|pushd|Set-Location|sl|chdir)\s/i;
const SC4SAP_HOME_REF = /\.sc4sap(?:\/|\b)|SC4SAP_HOME_DIR/i;
const PROFILES_REF = /(?:\.sc4sap|SC4SAP_HOME_DIR)[^\s"']*?\/+profiles\b/i;
const EXACT_PROFILE_FILE = /(?:\.sc4sap|SC4SAP_HOME_DIR)[^\s"']*?\/+profiles\/+[\w.-]+\/+(?:sap\.env|config\.json)(?![\w.])/gi;
const INTERPRETER = /\b(?:node|nodejs|deno|bun)(?:\.exe)?\b[^|;&]*\s(?:-e|--eval|-p|--print|eval)\b|\bpython[0-9.]*(?:\.exe)?\b[^|;&]*\s-c\b|\b(?:perl|ruby|php)(?:\.exe)?\b[^|;&]*\s-[er]\b|\b(?:powershell|pwsh)(?:\.exe)?\b[^|;&]*\s-(?:c|command|e|ec|encodedcommand)\b|\b(?:bash|sh|zsh|dash)(?:\.exe)?\b[^|;&]*\s-c\b|\bcmd(?:\.exe)?\b[^|;&]*\s\/[ck]\b|\b(?:Invoke-Expression|iex)\b/i;
const HOME_REF = /\.sc4sap|sc4sap_home|homedir|USERPROFILE|\$\{?HOME\b|\$\{?env:HOME\b|%HOMEPATH%|HOMEDRIVE|~\/|Path\.home|expanduser|GetFolderPath|env\.HOME\b|env\[.HOME|environ\[.HOME|environ\.get\(.HOME|getenv\(.HOME/i;
// Decoding inside a command hides the path it reads (`cat $(echo <base64> | base64 -d)`).
const DECODE = /\bbase64\b[^|;&]*\s(?:-d|-D|--decode)\b|\bcertutil(?:\.exe)?\b[^|;&]*\s[-/]decode(?:hex)?\b|FromBase64String|\bopenssl\b[^|;&]*\b(?:base64|enc)\b[^|;&]*\s-d\b|\bxxd\b[^|;&]*\s-r\b/i;
const ENCODED_PS =/\b(?:powershell|pwsh)(?:\.exe)?\b[^|;&]*\s-(?:e|ec|encodedcommand)\b/i;
const GLOB_CHARS = /[*?[\]]/;
const DOT_DOT = /(?:^|[\\/\s"'=])\.\.(?:[\\/\s"']|$)/;
const PROFILES_WORD = /profiles/i;
const LINK = /(?:^|[\s;&|(])(?:ln|link|mklink|fsutil)(?:\.exe)?\s|SymbolicLink|Junction|HardLink|CreateSymbolicLink|symlink/i;
// a shell whose cwd is inside the home must not walk up from it (pwd | dirname, (Get-Item .).Parent, ~+)
const CLIMB = /\b(?:pwd|dirname|Split-Path|Get-Location|Get-Item|Resolve-Path|realpath|readlink|find|xargs)\b|\.Parent\b|\$PWD\b|~\+|\bgl\b|\bgi\b/i;

// ── allow-list: two plugin scripts on a program's state folder ──────────────
// The ONE exception to the home checks below. The WHOLE command (trimmed) must be, after an
// optional leading `cd <dir> && ` (<dir> without .sc4sap):
//   node <path>/scripts/spec/md-to-html.mjs <path>/.sc4sap/program/<NAME>/<file>.md
//   node <path>/scripts/evidence/build-receipt.mjs <NAME> [--also <list>] [--unit-test required]
// <path> = [A-Za-z0-9_:/.-], optionally in double quotes, no `..` segment, no `profiles`; no shell
// syntax anywhere (; | & $ ` { } \ * ? [ < > or a line break). The script, resolved against the
// hook's cwd and the optional `cd <dir>`, must be this plugin's own copy (MD_PATH / BR_PATH) — a
// same-named script elsewhere does not pass. No token is ever cut out of a command: anything else
// naming the sc4sap home goes through the checks unchanged.
const AL_TOK = String.raw`("[A-Za-z0-9_:/.-]+"|[A-Za-z0-9_:/.-]+)`;
const AL_CD = new RegExp(String.raw`^cd[ \t]+${AL_TOK}[ \t]+&&[ \t]+`);
const AL_MD = new RegExp(String.raw`^node[ \t]+${AL_TOK}[ \t]+${AL_TOK}$`);
const AL_BR = new RegExp(String.raw`^node[ \t]+${AL_TOK}[ \t]+[A-Z0-9_/]{1,40}(?:[ \t]+--also[ \t]+[A-Z0-9_/,]{1,400})?(?:[ \t]+--unit-test[ \t]+required)?$`);
const AL_FORBIDDEN = /[;|&$`{}\\*?[\]<>\r\n]/;
const MD_TARGET = /^(?:([A-Za-z0-9_:/.-]*)\/)?\.sc4sap\/program\/[A-Z0-9_/]{1,40}\/[A-Za-z0-9_.-]+\.md$/;
const unq = (t) => t.replace(/^"(.*)"$/, '$1');
const plainPath = (p) => !p.split('/').includes('..') && !PROFILES_WORD.test(p);
const scriptPath = (t, base, target) => { const p = unq(t); return plainPath(p) && !/\.sc4sap/i.test(p) && isPluginScript(p, base, target); };
/** True when the whole command is one of the two allow-listed plugin script calls. */
export function allowListedCommand(command, cwd) {
  let c = String(command).trim();
  let base = cwd || process.cwd();
  const cd = c.match(AL_CD);
  if (cd) {
    const dir = unq(cd[1]);
    const homeN = normPath(sc4sapHome());
    base = resolve(nativePath(base), nativePath(dir));
    if (!plainPath(dir) || /\.sc4sap/i.test(dir) || dir.toLowerCase().includes(homeN) || within(base, sc4sapHome()) || within(resolve(cwd || process.cwd(), dir), sc4sapHome())) return false;
    c = c.slice(cd[0].length);
  }
  if (AL_FORBIDDEN.test(c)) return false;
  const md = c.match(AL_MD);
  if (md && scriptPath(md[1], base, MD_PATH)) {
    const target = unq(md[2]).match(MD_TARGET);
    return !!target && plainPath(unq(md[2])) && !/\.sc4sap/i.test(target[1] || '');
  }
  const br = c.match(AL_BR);
  return !!br && scriptPath(br[1], base, BR_PATH);
}
const sc4sapHome = () => resolve(process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap'));
const within = (child, parent) => {
  const c = normPath(child);
  const p = normPath(parent).replace(/\/+$/, ''); // a root (C:/, /) keeps no trailing slash
  return c === p || c.startsWith(`${p}/`);
};
/** Text without the characters a shell drops or joins: quotes, [ ], +, `, ^ (backslashes kept as /). */
const flatten = (s) => String(s).replace(/["'`^[\]+]/g, '').replace(/\\/g, '/');
/** Same, backslashes removed (a shell reads mas\k.key as mask.key). */
const flattenNoBackslash = (s) => String(s).replace(/["'`^[\]+\\]/g, '');

// ── deny-only hardening (2026-11-23): home variables, globs, 8.3 names, recursive reads, links ──
// Each check below only adds refusals; nothing is cut out of a command.
const ANY = Symbol('any');
const slash = (p) => String(p).replace(/\\/g, '/');
/** Home folder written as a variable (${HOME}, %USERPROFILE%, $env:USERPROFILE, …) or a leading ~ → the real path. */
export function expandHome(s) {
  const home = slash(homedir());
  const drive = /^[a-zA-Z]:/.test(home) ? `${home.slice(0, 2)}/` : '/';
  const envDir = (name, fallback) => slash(process.env[name] || fallback);
  const V = (name) => String.raw`(?:\$\{?(?:env:)?${name}\}?|%${name}%)`; // $X ${X} $env:X ${env:X} %X%
  return String(s)
    // \\?\C:\…, \\.\C:\…, \\?\UNC\host\c$\…, \\host\c$\… (backslashes already /) → C:/…
    .replace(/(^|[\s=(,;|&])\/\/[?.]\/(?:UNC\/)?/gi, '$1//')
    .replace(/(^|[\s=(,;|&])\/\/([a-zA-Z]:)/g, '$1$2')
    .replace(/(^|[\s=(,;|&])\/\/[^/\s]+\/([a-zA-Z])\$(?=\/|\s|$)/g, '$1$2:')
    // Cygwin / Git Bash drive mounts
    .replace(/(^|[\s=(,;|&])(?:\/proc)?\/cygdrive\/([a-zA-Z])(?=\/|\s|$)/gi, '$1$2:')
    .replace(new RegExp(V('SC4SAP_HOME_DIR'), 'gi'), () => slash(sc4sapHome()))
    .replace(new RegExp(`${V('HOMEDRIVE')}${V('HOMEPATH')}`, 'gi'), () => home)
    .replace(new RegExp(V('HOMEDRIVE'), 'gi'), () => drive)
    .replace(new RegExp(V('HOMEPATH'), 'gi'), () => home.replace(/^[a-zA-Z]:/, ''))
    .replace(new RegExp(V('(?:USERPROFILE|HOME)') + String.raw`(?!\w)`, 'gi'), () => home)
    .replace(new RegExp(V('APPDATA'), 'gi'), () => envDir('APPDATA', `${home}/AppData/Roaming`))
    .replace(new RegExp(V('LOCALAPPDATA'), 'gi'), () => envDir('LOCALAPPDATA', `${home}/AppData/Local`))
    .replace(new RegExp(V('(?:TEMP|TMP)') + String.raw`(?!\w)`, 'gi'), () => envDir('TEMP', `${home}/AppData/Local/Temp`))
    .replace(new RegExp(V('PROFILE') + String.raw`(?!\w)`, 'gi'), () => `${home}/Documents/WindowsPowerShell/profile.ps1`)
    .replace(/(^|[\s=:(,;|&])~(?=[/\s;|&)]|$)/g, (_, p) => `${p}${home}`)
    // ~user → that user's home (the parent of this home + user)
    .replace(/(^|[\s=:(,;|&])~([A-Za-z0-9_.-]+)(?=[/\s;|&)]|$)/g, (_, p, u) => `${p}${slash(dirname(home))}/${u}`)
    .replace(/([^:/]|^)\/{2,}/g, '$1/');
}
/** Bash brace expansion ({a,b}, nested left to right), capped: the variants a shell could build. */
export function braceVariants(s, cap = 64) {
  let out = [String(s)];
  for (let round = 0; round < 8; round++) {
    let changed = false;
    const next = [];
    for (const v of out) {
      const m = v.match(/\{([^{}]*,[^{}]*)\}/);
      if (!m) { next.push(v); continue; }
      changed = true;
      for (const alt of m[1].split(',')) next.push(v.slice(0, m.index) + alt + v.slice(m.index + m[0].length));
    }
    out = next.slice(0, cap);
    if (!changed) break;
  }
  return out;
}
const SPLIT = /[\s;|&()<>,=]+/;
const isGlob = (t) => /[*?[]/.test(t);
const segRe = (seg) => {
  let re = '';
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if (ch === '[' && seg.indexOf(']', i + 2) > i) {
      const end = seg.indexOf(']', i + 2);
      let body = seg.slice(i + 1, end);
      if (body[0] === '!') body = `^${body.slice(1)}`;
      re += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
};
const segMatch = (t, c) => (c === ANY ? t.length > 0 : t === '**' || segRe(t).test(c));
/** True when the glob segments `ts` can name exactly the path `cs` (`**` = any run of folders). */
const globHits = (ts, cs) => {
  if (!ts.length) return !cs.length;
  if (ts[0] === '**') return globHits(ts.slice(1), cs) || (cs.length > 0 && globHits(ts, cs.slice(1)));
  return cs.length > 0 && segMatch(ts[0], cs[0]) && globHits(ts.slice(1), cs.slice(1));
};
const PROTECTED_NAMES = new Set(['.sc4sap', 'profiles', 'mask.key']);
const CHAIN = ['.sc4sap', 'profiles', ANY, 'mask.key'];
/** Absolute form of a path token (Git Bash /c/… → C:/…), resolved against `base`. */
const absOf = (tok, base) => {
  const t = nativePath(tok);
  return slash(resolve(nativePath(base), /^[a-zA-Z]:$/.test(t) ? `${t}/` : t));
};
const segsOf = (p) => slash(p).split('/').filter(Boolean).map((s) => (WIN ? s.toLowerCase() : s));
/** A glob token that can reach the files of a profile folder (or, for a tree tool, the home or a profile folder). */
const globReachesHome = (tok, bases, tree) => {
  const homeSegs = segsOf(sc4sapHome());
  const targets = (tree ? [[], ['profiles'], ['profiles', ANY], ['profiles', ANY, ANY]] : [['profiles', ANY, ANY]]).map((t) => [...homeSegs, ...t]);
  // anchored: the token resolved against each base
  for (const b of bases) if (targets.some((t) => globHits(segsOf(absOf(tok, b)), t))) return true;
  // unanchored (e.g. through a link): a run of ≥ 2 segments that spells ≥ 2 of .sc4sap / profiles / mask.key,
  // at least one of them by a pattern that is not a bare `*`
  const ts = slash(tok).split('/').filter(Boolean);
  for (let i = 0; i < ts.length; i++) {
    for (let j = 0; j < CHAIN.length; j++) {
      let named = 0;
      let shaped = false;
      let glob = false;
      for (let k = 0; i + k < ts.length && j + k < CHAIN.length; k++) {
        const t = ts[i + k];
        const c = CHAIN[j + k];
        if (!segMatch(t === '**' ? '*' : t, c)) break;
        if (isGlob(t)) glob = true;
        if (PROTECTED_NAMES.has(c)) { named++; if (t !== '*' && t !== '**') shaped = true; }
        if (k >= 1 && named >= 2 && shaped && glob) return true;
      }
    }
  }
  return false;
};
/** Windows 8.3 short name of .sc4sap / profiles / mask.key (SC4SAP~1, PROFIL~1, MASK~1.KEY, hashed SCA1B2~1). */
const SHORT_NAME = /(?:^|[\\/\s"'=:])\.?([A-Za-z0-9_$#!@%&{}()-]{1,6})~\d+(?:\.[A-Za-z0-9]{0,3})?(?=[\\/\s"';|&)]|$)/g;
export function shortNameHit(text) {
  for (const m of String(text).matchAll(SHORT_NAME)) {
    const base = m[1].toLowerCase();
    for (const name of ['sc4sap', 'profiles', 'mask']) {
      if (base.length >= 2 && (name.startsWith(base) || (name.startsWith(base.slice(0, 2)) && /^[0-9a-f]{4}$/i.test(base.slice(2))))) return true;
    }
  }
  return false;
}
// tools that read a whole tree: always, or with a recursion flag
const TREE_TOOL = /(?:^|[\s;&|(])(?:find|fd|rsync|7z|7za|7zr|zip|tar|robocopy|rg|ag|du|Compress-Archive)(?:\.exe)?(?=\s|$)|\b(?:EnumerateFiles|EnumerateFileSystemEntries|EnumerateDirectories|GetFiles|GetFileSystemEntries|GetDirectories)\b|Directory\]::|DirectoryInfo/i;
const FLAG_TREE_TOOL = /(?:^|[\s;&|(])(?:cp|scp|Copy-Item|cpi|copy|xcopy|grep|egrep|fgrep|Get-ChildItem|gci|dir)(?:\.exe)?(?=\s|$)/i;
const RECURSE_FLAG = /(?:^|\s)-[a-zA-Z]*[rRa][a-zA-Z]*(?=\s|$)|\s-Recurse\b|\s-Depth\b|\s-Include\b|\s\/[sSeE](?=\s|$)|\s--(?:recursive|archive|dereference-recursive|all)\b|AllDirectories/i;
// a path built at run time: variables, string joins, parent-folder walks
const VAR_USE = /\$(?!\?)[\w{(]|%\w+%/;
const JOIN = /\s-join\b|Join-Path|::Combine|\s-f\s|\.Parent\b|Split-Path|\bdirname\b|\brealpath\b/i;
const LINK_ANY = /(?:^|[\s;&|(])(?:ln|link|mklink|fsutil|subst|mount|New-PSDrive|ndr)(?:\.exe)?(?=\s|$)|SymbolicLink|Junction|HardLink|CreateSymbolicLink|symlink/i;
const CD_TARGET = /(?:^|[;&|\s(])(?:cd|pushd|Set-Location|sl|chdir)\s+([^\s;&|)]+)/gi;
// NAME=value (sh) or $NAME = value (PowerShell): later $NAME / ${NAME} uses get the value written in
const ASSIGN = /(?:^|[;&|\s(])\$?([A-Za-z_]\w*)\s*=\s*([^\s;&|]+)/g;
const inlineVars = (s) => {
  let out = s;
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const [, name, value] of [...out.matchAll(ASSIGN)]) {
      if (value.includes(`$${name}`)) continue;
      // uses only: `$h/x`, `${h}x` — not the assignment itself (`$h = …` in PowerShell)
      const use = new RegExp(String.raw`\$\{${name}\}|\$${name}(?!\w)(?!\s*=)`, 'g');
      const next = out.replace(use, value);
      if (next !== out) { out = next; changed = true; }
    }
    if (!changed) break;
  }
  return out;
};
/** Deny detail for shell commands that reach the home through variables, globs, recursion or links, else null. */
export function shellReachRefusal(raw, cwd) {
  for (const variant of new Set([String(raw), ...braceVariants(String(raw))])) {
    const r = reachOne(variant, raw, cwd);
    if (r) return r;
  }
  return null;
}
function reachOne(cmdText, raw, cwd) {
  const view = expandHome(inlineVars(cmdText.replace(/["'`^]/g, '').replace(/\\/g, '/')));
  // the key's name put together from variables (k=ma; …/${k}sk.key)
  if (MASK_KEY.test(view)) return 'the key file name built from variables';
  const base0 = cwd || process.cwd();
  const bases = [base0];
  for (const m of view.matchAll(CD_TARGET)) bases.push(absOf(m[1], base0));
  const home = sc4sapHome();
  const userHome = homedir();
  const toks = view.split(SPLIT).filter((t) => t && !t.startsWith('-'));
  // the fixed part of a path token: up to the folder before the first wildcard or variable
  const pathPart = (t) => { const i = t.search(/[*?[$%]/); return i < 0 ? t : t.slice(0, t.lastIndexOf('/', i) + 1) || '.'; };
  const pathy = (t) => /[/~.]|^[a-zA-Z]:/.test(t);
  // a path token that is the sc4sap home or one of its parent folders (the user's home, C:/, /)
  const ancestor = toks.some((t) => pathy(t) && bases.some((b) => within(home, absOf(pathPart(t), b))))
    || bases.some((b) => within(home, b));
  const inHome = toks.some((t) => pathy(t) && bases.some((b) => within(absOf(pathPart(t), b), home)));
  const underUser = toks.some((t) => pathy(t) && bases.some((b) => within(absOf(pathPart(t), b), userHome)));
  const tree = TREE_TOOL.test(view) || (FLAG_TREE_TOOL.test(view) && RECURSE_FLAG.test(view));
  if (toks.some((t) => isGlob(t) && globReachesHome(t, bases, tree))) return 'a wildcard that can match the sc4sap home or a profile folder';
  // a walk up from a folder inside the user's home (Split-Path $PROFILE, dirname, .Parent) counts as the home
  const reachesUp = ancestor || (underUser && JOIN.test(view) && /Split-Path|\.Parent|dirname|realpath/i.test(view));
  if (reachesUp && tree) return 'no recursive read, copy or archive of a folder that holds the sc4sap home';
  if (reachesUp && LINK_ANY.test(view)) return 'no link or drive alias to a folder that holds the sc4sap home';
  // a path next to the sc4sap home completed at run time ($x, ${x}, %x%, -join, Join-Path, 'a'+'b')
  // (a variable inside one path token that starts at the home; or a join next to such a token — not a lone ~ in prose)
  const varPath = toks.some((t) => VAR_USE.test(t) && pathy(pathPart(t)) && bases.some((b) => { const a = absOf(pathPart(t), b); return within(home, a) || within(a, home); }));
  const joined = (ancestor || inHome) && (/\s-join\b|Join-Path|::Combine/i.test(view) || /['"]\s*\+\s*['"]/.test(raw));
  if (varPath || joined) return 'no path next to the sc4sap folder built from variables or joins — write the one file out in plain text';
  return null;
}

/** Deny reason when a call would read the MCP server's masking key, else null. */
export function maskKeyRefusal(payload) {
  const tool = payload?.tool_name;
  const input = payload?.tool_input || {};
  const texts = ['file_path', 'notebook_path', 'path', 'pattern', 'glob', 'command'].map((k) => input[k]).filter((v) => typeof v === 'string');
  const reason = 'the sc4sap profile folders and the MCP masking key (profiles/<alias>/mask.key) are not read by the model';
  const keyNamed = (t) => MASK_KEY.test(t) || MASK_KEY.test(flatten(t)) || MASK_KEY.test(flattenNoBackslash(t));
  if (texts.some((t) => keyNamed(t) || braceVariants(t).some(keyNamed))) return reason;
  if (texts.some((t) => shortNameHit(t) || shortNameHit(flatten(t)))) return `${reason}; write the full folder names, not 8.3 short names`;
  if (tool === 'Grep') {
    // \\?\C:\…, \\host\c$\…, ~ and home variables written out before the folder test
    const given = typeof input.path === 'string' && input.path ? expandHome(slash(input.path)) : '.';
    const root = resolve(payload?.cwd || process.cwd(), nativePath(given));
    const profiles = join(sc4sapHome(), 'profiles');
    // a search root at or above the profile folders, or inside one of them
    if (within(profiles, root) || within(root, profiles)) return `${reason}; grep a single file such as config.json instead`;
  }
  if (SHELL_TOOLS.has(tool)) {
    const raw = String(input.command || '');
    const full = flatten(raw);
    const fullNb = flattenNoBackslash(raw);
    // the shell already sits in a profile folder (its working directory persists)
    if (payload?.cwd && within(resolve(payload.cwd), join(sc4sapHome(), 'profiles'))) return `${reason}; leave the profile folder first`;
    // a shell inside the sc4sap home (e.g. a program folder there) must not climb, name profiles,
    // build a path from variables / braces / substitutions, or make links
    if (payload?.cwd && within(resolve(payload.cwd), sc4sapHome())
      && (DOT_DOT.test(full) || DOT_DOT.test(fullNb) || PROFILES_WORD.test(full) || PROFILES_WORD.test(fullNb) || /[$`{]/.test(raw) || LINK.test(full) || LINK.test(fullNb) || CLIMB.test(full)))
      return `${reason}; leave the sc4sap folder first`;
    // the one exception: the whole command is an allow-listed plugin script call
    if (allowListedCommand(raw, payload?.cwd)) return null;
    const reach = shellReachRefusal(raw, payload?.cwd);
    if (reach) return `${reason}; ${reach}`;
    // the checks below run on the command as written and again with home variables / ~ written out
    for (const v of new Set([raw, ...braceVariants(raw)])) {
      const f = flatten(v);
      const fNb = flattenNoBackslash(v);
      const fIn = flatten(inlineVars(v));
      const detail = shellHomeChecks(f, fNb, v) || shellHomeChecks(expandHome(f), expandHome(fNb), v)
        || (fIn !== f && shellHomeChecks(expandHome(fIn), expandHome(flattenNoBackslash(inlineVars(v))), v));
      if (detail) return `${reason}; ${detail}`;
    }
  }
  return null;
}

/** The sc4sap-home checks on one view of a shell command; deny detail or null. */
function shellHomeChecks(full, fullNb, raw) {
  // the sc4sap home as written (.sc4sap / SC4SAP_HOME_DIR) or as its resolved path
  const homeN = normPath(sc4sapHome());
  const namesHome = (s) => SC4SAP_HOME_REF.test(s) || s.toLowerCase().includes(homeN);
  const cmd = full;
  if ((namesHome(full) || namesHome(fullNb)) && (LINK.test(full) || LINK.test(fullNb))) return 'no links to or inside the sc4sap folder';
  const lower = cmd.toLowerCase();
  const namesProfiles = (s) => PROFILES_REF.test(s) || s.toLowerCase().includes(`${homeN}/profiles`);
  const exactFiles = new RegExp(`${homeN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/profiles/+[\\w.-]+/+(?:sap\\.env|config\\.json)(?![\\w.])`, 'gi');
  if (ENCODED_PS.test(raw)) return 'encoded PowerShell cannot be checked';
  if (DECODE.test(raw) || DECODE.test(cmd)) return 'a decoded command or path cannot be checked — write it out in plain text';
  if (INTERPRETER.test(cmd) && (HOME_REF.test(cmd) || HOME_REF.test(raw) || lower.includes(homeN))) return 'no interpreter one-liner on the sc4sap / home folder';
  if (namesProfiles(cmd)) {
    const moveOnly = MOVE_ONLY.test(cmd) && !CHAINED.test(raw) && !CD_LIKE.test(cmd);
    const rest = cmd.replace(EXACT_PROFILE_FILE, '').replace(exactFiles, '');
    const exactFilesOnly = !namesProfiles(rest) && !CHAINED.test(raw) && !CD_LIKE.test(cmd) && !WIDE_READ.test(cmd);
    if (!moveOnly && !exactFilesOnly) return 'name the one file you need (sap.env / config.json)';
  } else if ((namesHome(cmd) || namesHome(fullNb)) && (PROFILES_WORD.test(cmd) || PROFILES_WORD.test(fullNb)) && !(MOVE_ONLY.test(cmd) && !CHAINED.test(raw))) {
    // the home and `profiles` split apart, e.g. D=~/.sc4sap; cat $D/profiles/S4-DEV/x
    return 'name the one file you need (sap.env / config.json)';
  }
  if (CD_LIKE.test(cmd) && namesHome(cmd)) return 'do not change into the sc4sap folder';
  if (namesHome(cmd) && (WIDE_READ.test(cmd) || GLOB_CHARS.test(raw)) && !MOVE_ONLY.test(cmd)) return 'no wildcard or recursive read in the sc4sap folder — name the one file you need';
  return null;
}

export function decide(payload) {
  const tool = payload?.tool_name;
  const input = payload?.tool_input || {};
  const keyRefusal = maskKeyRefusal(payload);
  if (keyRefusal) {
    // a near miss of the allow-list: say what the allowed shape is instead of a misleading key message
    if (SHELL_TOOLS.has(tool) && /(?:md-to-html|build-receipt)\.mjs/i.test(String(input.command || '')))
      return `${keyRefusal}. md-to-html.mjs / build-receipt.mjs pass only as the whole command \`[cd <dir> && ]node <plugin>/scripts/spec/md-to-html.mjs <project>/.sc4sap/program/<NAME>/<file>.md\` or \`[cd <dir> && ]node <plugin>/scripts/evidence/build-receipt.mjs <NAME> [--also <list>] [--unit-test required]\` — nothing before or after it (no ; | && echo $?)`;
    return keyRefusal;
  }
  if (FILE_TOOLS.has(tool)) {
    const p = String(input.file_path || input.notebook_path || '');
    return PROTECTED.test(p) ? `${p} is written only by the sc4sap evidence hook / build-receipt.mjs` : null;
  }
  if (SHELL_TOOLS.has(tool)) {
    const cmd = String(input.command || '');
    if (!PROTECTED.test(cmd)) return null;
    // the plugin's own build-receipt.mjs (resolved against the cwd, as pt.mjs) with plain arguments
    const b = cmd.match(/^\s*node\s+("[^"]*build-receipt\.mjs"|\S*build-receipt\.mjs)(\s+[\w\-,.:\\/"]+)*\s*$/);
    const onlyBuilder = !!b && isPluginScript(unq(b[1]), payload?.cwd, BR_PATH);
    return onlyBuilder || onlyPluginPt(cmd, payload?.cwd) ? null : 'evidence ledger, receipt.json and program-test run files are protected; use the Read tool to read them, build-receipt.mjs / the plugin\'s program-test/pt.mjs to write them';
  }
  return null;
}

async function main() {
  let reason = null;
  if (process.env.DISABLE_SC4SAP !== '1') {
    try {
      reason = decide(JSON.parse(await readStdin()));
    } catch {
      reason = null;
    }
  }
  if (!reason) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  console.log(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `sc4sap evidence guard: ${reason}` },
    })
  );
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/evidence/guard.mjs')) main();
