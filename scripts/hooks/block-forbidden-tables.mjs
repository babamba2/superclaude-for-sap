#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Block Forbidden Tables (profile-aware)
 *
 * Intercepts MCP tool calls that would read row data from SAP and checks the
 * target table(s) against `exceptions/table_exception.md`, filtered by the
 * `blocklistProfile` in the active profile's config.json
 * (`~/.sc4sap/profiles/<alias>/config.json`; legacy: `<project>/.sc4sap/config.json`).
 *
 * Profiles (accumulative):
 *   - minimal  — PII + credentials only
 *   - standard — minimal + Protected Business Data
 *   - strict   — everything (default)
 *   - custom   — minimal + `.sc4sap/blocklist-custom.txt` (minimal always applies)
 *   - off      — no table check (the hook exits allow)
 *
 * Any profile except `off` additionally honors `.sc4sap/blocklist-extend.txt` (one
 * table name / pattern per line) if present.
 *
 * Failure mode: fails OPEN (allows) on parse/IO errors so a broken file
 * doesn't block legitimate development. L1 (agents) and L2 (CLAUDE.md) still
 * enforce the policy in that case.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfigJsonPath } from '../lib/profile-resolve.mjs';
import { patchMixOf, sourcePatchesOf, sourceTextOf } from '../lib/source-file-input.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_DIR = resolve(__dirname, '..', '..', 'exceptions');
// `table_exception.md` is the index/documentation file; each category lives in
// its own `*.md` so the files stay small and grep-able. Everything under
// exceptions/ EXCEPT the index is parsed and merged.
const INDEX_FILE = 'table_exception.md';

const TIER_ORDER = { minimal: 1, standard: 2, strict: 3 };
const DEFAULT_PROFILE = 'strict';

// Walk up from cwd to find a project directory (one that contains .sc4sap/),
// then resolve the active-profile.txt pointer through the shared resolver so
// the active profile's config.json is preferred over any legacy project-local
// config.json that may have been left behind.
function resolveProjectConfig() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.sc4sap'))) {
      const hit = resolveConfigJsonPath(dir);
      if (hit) return { configPath: hit.path, projectDir: dir, source: hit.source, alias: hit.alias };
      return { configPath: null, projectDir: dir, source: null, alias: null };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { configPath: null, projectDir: process.cwd(), source: null, alias: null };
}

function loadProfile(configPath) {
  if (!configPath) return DEFAULT_PROFILE;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    const p = String(raw.blocklistProfile || '').toLowerCase();
    // `off` mirrors the MCP server's MCP_BLOCKLIST_PROFILE=off (guard disabled).
    if (p === 'minimal' || p === 'standard' || p === 'strict' || p === 'custom' || p === 'off') return p;
  } catch {
    // fall through
  }
  return DEFAULT_PROFILE;
}

/**
 * Parse markdown blocklist. Each H2 carries a tier (`<!-- tier: X -->`) and
 * optionally an action (`<!-- action: deny | warn -->`, default `deny`).
 */
function listSectionFiles() {
  try {
    return readdirSync(EXCEPTIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== INDEX_FILE.toLowerCase())
      .map((f) => join(EXCEPTIONS_DIR, f))
      .sort();
  } catch {
    return [];
  }
}

function loadBuiltinBlocklist() {
  const exact = new Map(); // name -> meta { category, tier, action, why }
  const patterns = [];     // { re, category, tier, action, why }
  const sections = listSectionFiles();
  // Back-compat: if no per-section files exist yet, fall back to the legacy
  // single-file blocklist at exceptions/table_exception.md so upgrades don't
  // break in-flight.
  const files = sections.length > 0 ? sections : [join(EXCEPTIONS_DIR, INDEX_FILE)];
  for (const file of files.filter((p) => existsSync(p))) {
    parseBlocklistText(readFileSync(file, 'utf8'), exact, patterns);
  }
  return { exact, patterns };
}

// Parse one blocklist markdown text. State (category/tier/action) is scoped to
// this call — callers reset at file boundaries so defaults from one section
// file never bleed into the next. Within a file, H1 or H2 headings also reset.
function parseBlocklistText(text, exact, patterns) {
  let currentCategory = 'Protected';
  let currentTier = 'strict';
  let currentAction = 'deny';
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();

    // H1 or H2 heading resets per-section state (per-file H1 is typical when
    // each category lives in its own file; legacy single-file layout used H2).
    if (line.startsWith('# ') || line.startsWith('## ')) {
      currentCategory = line.replace(/^#+\s+/, '').trim();
      currentTier = 'strict';
      currentAction = 'deny';
      continue;
    }

    const tierMatch = line.match(/<!--\s*tier:\s*(minimal|standard|strict)\s*-->/i);
    if (tierMatch) {
      currentTier = tierMatch[1].toLowerCase();
      continue;
    }

    const actionMatch = line.match(/<!--\s*action:\s*(deny|warn)\s*-->/i);
    if (actionMatch) {
      currentAction = actionMatch[1].toLowerCase();
      continue;
    }

    if (!line.startsWith('|')) continue;
    if (/^\|\s*-+/.test(line)) continue;
    if (/^\|\s*(Table|Pattern)\s*\|/i.test(line)) continue;

    const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 1) continue;

    const rawName = cells[0].replace(/`/g, '').replace(/\*\*/g, '').trim();
    if (!rawName) continue;
    const description = cells[1] || '';
    const why = cells[2] || '';
    const meta = { category: currentCategory, tier: currentTier, action: currentAction, why, description };

    if (rawName.includes('*') || rawName.includes('xxx') || rawName.includes('#')) {
      const family = rawName
        .split(/[\s,(]/)[0]
        .replace(/xxx/gi, '[A-Z0-9_]*')
        .replace(/\*/g, '[A-Z0-9_]*')
        .replace(/#/g, '[0-9]');
      try {
        const re = new RegExp(`^${family}$`, 'i');
        patterns.push({ re, ...meta });
      } catch { /* skip */ }
      continue;
    }

    for (const token of rawName.split(/[\/,]/).map((t) => t.trim()).filter(Boolean)) {
      const name = token.toUpperCase();
      if (/^[A-Z0-9_\/]+$/.test(name)) exact.set(name, meta);
    }
  }
}

/** Load a plain-text override file (one table/pattern per line). User
 *  entries default to action=deny. */
function loadTextList(path, { category, tier, action = 'deny' }) {
  if (!existsSync(path)) return { exact: new Map(), patterns: [] };
  const exact = new Map();
  const patterns = [];
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const meta = { category, tier, action, why: 'User-extended blocklist', description: '' };
      if (line.includes('*')) {
        const family = line.replace(/\*/g, '[A-Z0-9_]*');
        try {
          patterns.push({ re: new RegExp(`^${family}$`, 'i'), ...meta });
        } catch { /* skip */ }
      } else {
        exact.set(line.toUpperCase(), meta);
      }
    }
  } catch { /* fail-open */ }
  return { exact, patterns };
}

// `custom` keeps the minimal tier (PII, credentials); the custom list is merged on top by the caller.
function filterByProfile(builtin, profile) {
  const maxTier = profile === 'custom' ? TIER_ORDER.minimal : (TIER_ORDER[profile] || TIER_ORDER[DEFAULT_PROFILE]);
  const exact = new Map();
  const patterns = [];
  for (const [k, meta] of builtin.exact) {
    if ((TIER_ORDER[meta.tier] || 3) <= maxTier) exact.set(k, meta);
  }
  for (const p of builtin.patterns) {
    if ((TIER_ORDER[p.tier] || 3) <= maxTier) patterns.push(p);
  }
  return { exact, patterns };
}

function mergeLists(...lists) {
  const exact = new Map();
  const patterns = [];
  for (const l of lists) {
    for (const [k, v] of l.exact) exact.set(k, v);
    patterns.push(...l.patterns);
  }
  return { exact, patterns };
}

function extractTables(toolName, toolInput) {
  const tables = new Set();
  if (!toolInput || typeof toolInput !== 'object') return tables;
  for (const key of ['table', 'table_name', 'tableName', 'tabname', 'target_table']) {
    if (typeof toolInput[key] === 'string') tables.add(toolInput[key].toUpperCase());
  }
  for (const key of ['sql', 'query', 'sql_query', 'statement']) {
    const sql = toolInput[key];
    if (typeof sql !== 'string') continue;
    for (const t of tablesFromSql(sql)) tables.add(t);
  }
  if (SOURCE_TOOL_RE.test(toolName) && sourceIsReadChannel(toolName, toolInput)) {
    for (const t of tablesFromSource(toolInput, toolName)) tables.add(t);
  }
  return tables;
}

/** Keywords that end a FROM clause (at the FROM's own bracket depth). */
const FROM_END_RE = /^(?:WHERE|GROUP|ORDER|HAVING|UNION|EXCEPT|INTERSECT|INTO|APPENDING|UP|FIELDS|FOR|OFFSET|LIMIT|BYPASSING|CLIENT|USING|WITH)$/i;

/**
 * Table names of a free-style SQL statement (same walk as the MCP server's
 * extractTablesFromSql): every name of every FROM clause counts — `FROM a`,
 * `JOIN b`, the old comma join `FROM a, b` / `FROM a AS x, b y` and bracketed
 * sources `FROM ( a ), b`. Over-collecting is safe: a name that is not a
 * table never matches the blocklist. The first FROM name comes first.
 */
export function tablesFromSql(sql) {
  const out = new Set();
  const tokens = String(sql ?? '').match(/[A-Za-z0-9_/~]+|\(|\)|,|'(?:[^']|'')*'|\S/g) ?? [];
  const isName = (t) => !!t && /^[A-Za-z0-9_/]+$/.test(t) && !/^SELECT$/i.test(t);
  const nameAt = (i) => {
    let j = i;
    while (tokens[j] === '(') j++;
    return isName(tokens[j]) ? tokens[j].toUpperCase() : undefined;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^JOIN$/i.test(t)) {
      const n = nameAt(i + 1);
      if (n) out.add(n);
      continue;
    }
    if (!/^FROM$/i.test(t)) continue;
    const first = nameAt(i + 1);
    if (first) out.add(first);
    // walk the FROM clause: a top-level comma starts another source
    let depth = 0;
    for (let j = i + 1; j < tokens.length; j++) {
      const u = tokens[j];
      if (u === '(') depth++;
      else if (u === ')') {
        if (depth === 0) break; // end of a sub-query's FROM
        depth--;
      } else if (depth === 0 && FROM_END_RE.test(u)) break;
      else if (u === ',' && depth === 0) {
        const n = nameAt(j + 1);
        if (n) out.add(n);
      }
    }
  }
  return [...out];
}

// Tools that upload ABAP / CDS source.
export const SOURCE_TOOL_RE = /__(Create|Update)(Program|Include|Class|Interface|FunctionModule|FunctionGroup|LocalTestClass|LocalDefinitions|LocalTypes|LocalMacros|UnitTest|CdsUnitTest|BehaviorImplementation|View)$/i;
const TEST_TOOL_RE = /__(Create|Update)(LocalTestClass|UnitTest|CdsUnitTest)$/i;
const CDS_TOOL_RE = /__(Create|Update)View$/i;

// Business code that reads KNA1 / LFA1 / ADRC is normal development, so plain
// source is not checked. Checked is source whose rows come back to the agent:
// ABAP Unit test classes (RunUnitTest returns their messages) and CDS views
// (a view over a blocked table is the same table under a new name for
// GetSqlQuery). There the deny tier applies exactly as for GetSqlQuery.
export function sourceIsReadChannel(toolName, toolInput) {
  if (TEST_TOOL_RE.test(toolName) || CDS_TOOL_RE.test(toolName)) return true;
  for (const key of SOURCE_KEYS) {
    const v = toolInput?.[key];
    if (typeof v === 'string' && isTestCodeText(stripAbapNoise(v))) return true;
  }
  return false;
}

/**
 * Test code in already-stripped source: `FOR TESTING`, or a class IMPLEMENTATION whose DEFINITION is not
 * in the same text (a test class split over two includes — its implementation alone carries no
 * FOR TESTING but still runs under RunUnitTest). Same rule as the MCP server's isReadChannel.
 */
export function isTestCodeText(clean) {
  // Colon chaining (`FOR: TESTING`, `CLASS: x IMPLEMENTATION`) splits keywords; the chain colon is only
  // a separator for this check.
  const t = clean.replace(/:/g, ' ');
  if (/\bFOR\s+TESTING\b/i.test(t)) return true;
  return hasOrphanClassImplementation(t);
}

/**
 * A CLASS … IMPLEMENTATION without a CLASS … DEFINITION (not DEFERRED / LOAD / LOCAL FRIENDS) of that
 * class in the text. Known trade-off (accepted 2026-11-24): business code whose definitions sit in another
 * include (class pool CCIMP, older TOP + F01 programs) counts too — its upload is then scanned against the
 * deny tier, and the MCP server refuses source_patches to it (full source instead).
 */
export function hasOrphanClassImplementation(clean) {
  const t = clean.replace(/:/g, ' ');
  const defined = new Set();
  for (const m of t.matchAll(/\bCLASS\s+([\w/]+)\s+DEFINITION\b(?!\s+(?:DEFERRED|LOAD|LOCAL\s+FRIENDS)\b)/gi)) defined.add(m[1].toUpperCase());
  for (const m of t.matchAll(/\bCLASS\s+([\w/]+)\s+IMPLEMENTATION\b/gi)) if (!defined.has(m[1].toUpperCase())) return true;
  return false;
}

// String-valued input fields that may carry source code.
const SOURCE_KEYS = ['source_code', 'source', 'code', 'ddl_source', 'ddl', 'test_class_source', 'class_source',
  'implementation', 'definitions', 'local_types', 'local_definitions', 'macros', 'test_classes',
  // MCP field names of the local class part tools (UpdateLocalTestClass / Types / Definitions / Macros)
  'test_class_code', 'local_types_code', 'definitions_code', 'macros_code'];

/**
 * Remove ABAP comments and literal text so "FROM" in a message text does not count. A character scanner
 * (same as the MCP server's stripAbapComments): `*` in column 1 and `"` (and `//` for CDS) comment to the
 * end of the line; '…' / `…` become '' / `` (doubled quote = escaped); a string template |…| keeps its
 * delimiters and the CODE of its embedded expressions { … } (which may hold literals and templates of
 * their own) and drops its text (\ escapes). '…', `…` and template text end at the line end. So a quote
 * inside one literal never opens another and never swallows the code after it.
 */
export function stripAbapNoise(src, opts = {}) {
  const s = String(src).replace(/\r\n?/g, '\n');
  const n = s.length;
  const stack = []; // 'tpl' = inside template text, 'emb' = inside an embedded expression (code)
  let out = '';
  let lineStart = true;
  let i = 0;
  const toEol = () => { while (i < n && s[i] !== '\n') i++; };
  while (i < n) {
    const c = s[i];
    if (c === '\n') {
      if (stack[stack.length - 1] === 'tpl') { stack.pop(); out += '|'; }
      out += '\n'; lineStart = true; i++; continue;
    }
    const atStart = lineStart;
    lineStart = false;
    if (stack[stack.length - 1] === 'tpl') {
      if (c === '\\') { i += s[i + 1] === '\n' ? 1 : 2; continue; }
      if (c === '|') { stack.pop(); out += '|'; i++; continue; }
      if (c === '{') { stack.push('emb'); out += '{'; i++; continue; }
      i++; continue;
    }
    if (atStart && c === '*') { toEol(); continue; }
    if (c === '"') { toEol(); continue; }
    if (opts.cds && c === '/' && s[i + 1] === '/') { toEol(); continue; }
    if (c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && s[j] !== '\n') {
        if (s[j] === c) { if (s[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      out += c + c;
      i = j < n && s[j] === c ? j + 1 : j;
      continue;
    }
    if (c === '|') { stack.push('tpl'); out += '|'; i++; continue; }
    if (c === '}' && stack[stack.length - 1] === 'emb') { stack.pop(); out += '}'; i++; continue; }
    out += c; i++;
  }
  return out;
}

/** Tables read by uploaded source: FROM / JOIN targets in ABAP SQL and CDS DDL. */
export function tablesFromSource(toolInput, toolName = '') {
  const out = new Set();
  const texts = [];
  for (const key of SOURCE_KEYS) if (typeof toolInput[key] === 'string') texts.push(toolInput[key]);
  const cds = CDS_TOOL_RE.test(toolName) || typeof toolInput.ddl_source === 'string' || typeof toolInput.ddl === 'string';
  for (const text of texts) {
    const clean = stripAbapNoise(text, { cds });
    const re = /\b(?:FROM|JOIN)\s+(?:TABLE\s+)?@?([A-Z0-9_\/]+)/gi;
    let m;
    while ((m = re.exec(clean)) !== null) out.add(m[1].toUpperCase());
  }
  return out;
}

// Return every rule a table matches (exact hit first, then each matching
// pattern). Earlier versions returned only the first match, which let a
// built-in `warn` pattern short-circuit a stricter user-extended `deny` —
// the aggregate `deny > warn` decision downstream never saw the deny rule.
// Callers decide precedence via `effectiveHitForTable`.
function matchBlocklistAll(name, { exact, patterns }) {
  const upper = name.toUpperCase();
  const matches = [];
  if (exact.has(upper)) matches.push(exact.get(upper));
  for (const p of patterns) if (p.re.test(upper)) matches.push(p);
  return matches;
}

// Collapse all rules matching `table` into one effective hit using
// deny > warn > first-rule precedence. Returns null when no rule matches.
function effectiveHitForTable(table, blocklist) {
  const matches = matchBlocklistAll(table, blocklist);
  if (matches.length === 0) return null;
  const deny = matches.find((m) => (m.action || 'deny') === 'deny');
  if (deny) return { table, ...deny };
  const warn = matches.find((m) => m.action === 'warn');
  if (warn) return { table, ...warn };
  return { table, ...matches[0] };
}

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(data));
    setTimeout(() => done(data), 1500).unref?.();
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const toolName = payload.tool_name || payload.toolName || '';
  let toolInput = payload.tool_input || payload.toolInput || payload.arguments || {};
  const isSourceUpload = SOURCE_TOOL_RE.test(toolName);
  const deny = (why) => {
    console.log(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why },
    }));
    process.exit(0);
  };
  // Server-side patch (source_patches) is for business code only — the same as a full upload, which this hook
  // scans only for test code. Source with test classes (or a test-class part) is always sent as full
  // source_code: the MCP server refuses a patch whose current or patched text is test code; here the call
  // shape (a source field or source_file next to source_patches, any value even "", is denied), the patch
  // format, and visible test code (a test-class tool, or FOR TESTING in any old_string / new_string) are
  // denied. Every other patch is left to the server.
  if (isSourceUpload && Object.prototype.hasOwnProperty.call(toolInput, 'source_patches')) {
    const mixed = patchMixOf(toolInput);
    if (mixed.length) deny(`sc4sap blocklist: source_patches together with ${mixed.join(', ')} — send source_patches alone or the full source alone.`);
    const pt = sourcePatchesOf(toolInput);
    if (pt.error) deny(`sc4sap blocklist: ${pt.error} — the hook checks every patch before it reaches SAP.`);
    const fragments = toolInput.source_patches.map((p) => `${p.old_string}\n${p.new_string}`).join('\n');
    if (TEST_TOOL_RE.test(toolName) || /\bFOR\s+TESTING\b/i.test(stripAbapNoise(fragments).replace(/:/g, ' '))) {
      deny('sc4sap blocklist: source_patches refused — this source contains test classes; send the full source_code so the blocklist hook can check it.');
    }
    process.exit(0);
  }
  // source_file next to source_code is refused whatever the values: the server uploads the file when
  // source_code is "", so scanning source_code alone would let an unscanned file through.
  const hasKey = (k) => Object.prototype.hasOwnProperty.call(toolInput, k);
  if (isSourceUpload && hasKey('source_file') && hasKey('source_code')) {
    deny('sc4sap blocklist: source_file together with source_code — send one of them, not both.');
  }
  // Patch mode: scan the file the server will upload. A source_file the hook cannot read is refused —
  // otherwise a test class reading a blocked table would pass unscanned.
  if (isSourceUpload && toolInput.source_file !== undefined) {
    const src = sourceTextOf(toolInput);
    if (src.text === null) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `sc4sap blocklist: ${src.error} — the hook scans uploaded source before it reaches SAP. Pass the absolute path of the edited file.`,
        },
      }));
      process.exit(0);
    }
    toolInput = { ...toolInput, source_code: src.text };
  }
  if (!/GetTableContents|GetRemoteTableContents|GetSqlQuery/i.test(toolName) && !isSourceUpload) process.exit(0);
  if (isSourceUpload && !sourceIsReadChannel(toolName, toolInput)) process.exit(0);

  const { configPath, projectDir } = resolveProjectConfig();
  const profile = loadProfile(configPath);
  if (profile === 'off') process.exit(0); // guard disabled by the user for this profile

  let builtin;
  try { builtin = loadBuiltinBlocklist(); }
  catch (err) {
    process.stderr.write(`[sc4sap hook] Unable to load blocklist: ${err.message}\n`);
    process.exit(0);
  }

  const filtered = filterByProfile(builtin, profile);
  const extendPath = resolve(projectDir, '.sc4sap', 'blocklist-extend.txt');
  const customPath = resolve(projectDir, '.sc4sap', 'blocklist-custom.txt');
  const extend = loadTextList(extendPath, { category: 'User Extended', tier: 'minimal' });
  const custom = profile === 'custom' ? loadTextList(customPath, { category: 'User Custom', tier: 'minimal' }) : { exact: new Map(), patterns: [] };

  const blocklist = mergeLists(filtered, extend, custom);

  const tables = extractTables(toolName, toolInput);
  const hits = [];
  for (const t of tables) {
    const h = effectiveHitForTable(t, blocklist);
    if (h) hits.push(h);
  }
  if (hits.length === 0) process.exit(0);

  const denyHits = hits.filter((h) => (h.action || 'deny') === 'deny');
  const warnHits = hits.filter((h) => h.action === 'warn');
  // Source uploads: only the deny tier blocks; warn tables (VBAK, BKPF …) are
  // everyday test-class reads and keep their GetSqlQuery confirmation instead.
  if (isSourceUpload && denyHits.length === 0) process.exit(0);

  // deny takes precedence over warn.
  if (denyHits.length > 0) {
    const lines = denyHits.map((h) => `  - ${h.table} — ${h.category}: ${h.why || 'protected'}`).join('\n');
    const what = isSourceUpload
      ? 'source upload denied — a test class or CDS view reads a blocked table (running it would extract the rows)'
      : 'row extraction denied';
    const reason =
      `sc4sap blocklist (profile: ${profile}) — ${what}:\n${lines}\n\n` +
      `A deny table has no exception route: not a chat request, not a program / class / FM / CDS view ` +
      `written to read it. See common/data-extraction-policy.md for allowed alternatives ` +
      `(released CDS views, anonymized test data, COUNT/SUM aggregates, the user's own SAP GUI lookup).\n` +
      `Only the user can change the scope, by reselecting the blocklist profile in \`/sc4sap:setup\`.`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }));
    process.exit(0);
  }

  // warn category: require explicit user confirmation via permissionDecision="ask".
  const lines = warnHits.map((h) => `  - ${h.table} — ${h.category}: ${h.why || 'sensitive'}`).join('\n');
  const reason =
    `sc4sap blocklist (profile: ${profile}) — sensitive table access requires confirmation:\n${lines}\n\n` +
    `These are "Protected Business Data" tables. Default posture is blocked until the user authorizes the request ` +
    `(scope, anonymization, intended use). Approve only if the user has confirmed scope and party-ID handling. ` +
    `Safer alternatives: released CDS views, anonymized test data, COUNT/SUM aggregates.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

// Run only as a hook command, not when a test imports the helpers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
