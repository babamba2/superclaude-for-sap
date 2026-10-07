#!/usr/bin/env node
//
// Customization (Enhancement + Extension) Extraction Script
//
// Parses standard exit / BAdI / append-structure definitions from
// configs/{MODULE}/enhancements.md, then queries the live SAP system
// (via the MCP server) to find which ones the customer has actually
// implemented with Z-namespace or Y-namespace objects.
//
// Outputs (multi-profile: `.sc4sap/work/<activeAlias>/customizations/...`;
//          legacy: `.sc4sap/customizations/...`):
//   {artifactBase}/customizations/{MODULE}/enhancements.json   (BAdI impl, SMOD -> CMOD Z-namespace)
//   {artifactBase}/customizations/{MODULE}/extensions.json     (Append Structures + Custom Fields)
//
// Persistence rules requested by user:
//   - BAdI  -> record only when at least one Z/Y implementation exists
//   - SMOD  -> record only when a CMOD project includes this enhancement AND
//             the CMOD project is Z/Y  (proof that the customer turned it on)
//   - Append structures / Custom fields -> always recorded when any Z/Y
//             append or field exists on the base table; written to the
//             separate extensions.json
//   - VOFM  -> customer-range routines (600-999; PSTK/TDAT 50-99, FOFU 900-999)
//             registered in TFRM, filed by module, each read from its include;
//             SAP routines below that range are never reported
//
// Usage:
//   node scripts/extract-customizations.mjs [modules...]
//   node scripts/extract-customizations.mjs SD MM FI CO
//   node scripts/extract-customizations.mjs all
//
// Requires the MCP server bridge (bridge/mcp-server.cjs) to be runnable
// with a populated .sc4sap/sap.env — same prerequisites as extract-spro.mjs.
//

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveArtifactBase } from './lib/profile-resolve.mjs';
import { vofmRoutines, vofmForModule, VOFM_MODULES } from './lib/customization-vofm.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIGS_DIR = resolve(ROOT, 'configs');
// Output path is `<artifactBase>/customizations/` — artifactBase resolves to
// `.sc4sap/work/<alias>/` in multi-profile mode, `.sc4sap/` in legacy mode.
const OUTPUT_DIR = join(resolveArtifactBase(process.cwd()), 'customizations');
const BRIDGE = resolve(ROOT, 'bridge', 'mcp-server.cjs');

const Z_PATTERN = /^[ZY]/i;

// Run only when executed directly; the parsers below are imported by tests.
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

let selectedModules = IS_MAIN ? process.argv.slice(2) : [];
if (IS_MAIN && (selectedModules.length === 0 || selectedModules[0] === 'all')) {
  selectedModules = readdirSync(CONFIGS_DIR).filter((d) => {
    try { return statSync(resolve(CONFIGS_DIR, d)).isDirectory() && d !== 'common'; } catch { return false; }
  });
}

if (IS_MAIN) console.log(`[cust] Modules: ${selectedModules.join(', ')}`);

/* ──────────────────── enhancements.md parser ──────────────────── */

/**
 * Parse `configs/{MODULE}/enhancements.md` into structured section buckets.
 * Section detection is heuristic — based on the `##` / `###` headers used
 * across the existing files (CMOD/SMOD, BAdIs, Enhancement Spots, Form-based
 * user exits, VOFM, Custom Fields / Append Structures).
 */
function parseEnhancementsMd(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/);

  const sections = {
    smod: [],         // classic SMOD enhancement names (e.g. V45A0001)
    badi: [],         // BAdI / Enhancement Spot names (BADI_SD_SALES, ES_SAPLV45A)
    formExits: [],    // include programs (MV45AFZZ, RV60AFZZ, ZXRSRU01…)
    appends: [],      // { append, baseTable }
  };

  let mode = null; // 'smod' | 'badi' | 'formExits' | 'appends' | null

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+/.test(raw)) {
      const h = raw.toLowerCase();
      if (/\bcustomer exits\b|\bcmod\/smod\b|\bclassic\b/.test(h)) mode = 'smod';
      else if (/\bbadi\b|\benhancement spots\b/.test(h)) mode = 'badi';
      else if (/\bform[\s-]?based\b|\binclude programs\b|\bmodule-specific\b/.test(h)) mode = 'formExits';
      else if (/\bcustom fields\b|\bappend structures\b/.test(h)) mode = 'appends';
      else mode = null;
      continue;
    }
    if (/^###\s+/.test(raw)) {
      const h = raw.toLowerCase();
      if (/\bform[\s-]?based\b|\binclude\b/.test(h)) mode = 'formExits';
      else if (/\bappend\b|\bcustom fields\b/.test(h)) mode = 'appends';
      else if (/\bbadi\b/.test(h)) mode = 'badi';
      continue;
    }

    const m = line.match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (!m) continue;
    const col1 = m[1].trim().replace(/\*+/g, '').trim();
    const col2 = m[2].trim().replace(/\*+/g, '').trim();
    const col3 = m[3].trim().replace(/\*+/g, '').trim();
    if (!col1 || col1 === 'Name' || col1 === 'Include' || col1 === 'Append' || col1.startsWith('---')) continue;

    if (mode === 'smod') {
      if (/^[A-Z][A-Z0-9_]{5,}$/.test(col1)) sections.smod.push({ name: col1, description: col3 });
    } else if (mode === 'badi') {
      if (/^[A-Z][A-Z0-9_]+$/.test(col1)) sections.badi.push({ name: col1, description: col3 });
    } else if (mode === 'formExits') {
      if (/^[A-Z][A-Z0-9_]{3,}$/.test(col1)) sections.formExits.push({ include: col1, routines: col3 });
    } else if (mode === 'appends') {
      // In SD the header row is | Append | Table | System | Description |
      // col2 may contain the base table; otherwise skip
      if (/^[A-Z][A-Z0-9_]+$/.test(col1)) sections.appends.push({ append: col1, baseTable: col2, description: col3 });
    }
  }

  return sections;
}

/* ──────────────────── MCP helpers ──────────────────── */

/** Short reason for a check that could not run; SQL on ECC is the common case. */
export function unavailableReason(error) {
  const e = String(error || 'no data returned');
  if (/BASIS < 7\.50|not supported on this SAP system|datapreview\/freestyle/i.test(e)) return 'SQL is not available on this release (BASIS < 7.50)';
  return e.split('\n')[0].slice(0, 200);
}

/** True when the object does not exist on the system (HTTP 404 / "not found"), as opposed to a failed read. */
export function isNotFound(error) {
  return /\b404\b|not found|does not exist/i.test(String(error || ''));
}

/** ['FORMEXIT', 'FORMEXIT', 'GGB'] → 'FORMEXIT ×2, GGB' */
export function countChecks(checks) {
  const n = new Map();
  for (const c of checks || []) n.set(c, (n.get(c) || 0) + 1);
  return [...n].map(([c, k]) => (k > 1 ? `${c} ×${k}` : c)).join(', ');
}

async function callTool(client, name, args) {
  try {
    const r = await client.callTool({ name, arguments: args });
    const text = r?.content?.[0]?.text;
    if (!text) return { ok: false, error: 'empty response' };
    // Some tools return JSON; others return XML/text. Try parsing JSON, else return raw.
    try { return { ok: true, json: JSON.parse(text), raw: text }; }
    catch { return { ok: true, raw: text }; }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// BAdI — customer implementations of a standard BAdI.
//   1. GetBadiImplementations (classic SE18/SE19 BAdI; SXC_EXIT/SXC_ATTR/SXC_CLASS via the
//      ZMCP_ADT_DDIC_BADI bridge): exact implementation names, implementing classes and the
//      active flag. Answers kind='classic' for a classic BAdI.
//   2. Anything else (kernel BAdI / enhancement spot, or a system without the bridge):
//      GetEnhancementSpot and the Z/Y names in its payload — a coarse scan, so each hit is
//      recorded with confidence 'low' (it may pick up package or interface names).
export function classicBadiImpls(json) {
  if (!json || json.success !== true || String(json.kind) !== 'classic') return null;
  return (json.implementations || [])
    .filter((i) => i && i.impl_name && Z_PATTERN.test(String(i.impl_name)) && i.active !== false)
    .map((i) => ({
      name: String(i.impl_name).toUpperCase(),
      type: 'BADI_IMPL',
      ...(i.impl_class ? { class: String(i.impl_class).toUpperCase() } : {}),
    }));
}

async function scanBadiImplementations(client, badiName) {
  const c = await callTool(client, 'GetBadiImplementations', {
    badi_definition: badiName, customer_only: true, active_only: true, include_methods: false,
  });
  const classic = c.ok ? classicBadiImpls(c.json) : null;
  if (classic) return { ok: true, source: 'classic', customs: classic };

  const r = await callTool(client, 'GetEnhancementSpot', { enhancement_spot_name: badiName });
  if (!r.ok) return { ok: false, source: 'spot-scan', customs: [], error: r.error };
  const names = new Set();
  for (const m of String(r.raw || '').matchAll(/\b([ZY][A-Z0-9_]{2,30})\b/g)) names.add(m[1]);
  names.delete(String(badiName).toUpperCase());
  return {
    ok: true,
    source: 'spot-scan',
    customs: [...names].map((n) => ({ name: n, type: 'CLAS', confidence: 'low' })),
  };
}

// SMOD → CMOD — ACTIVE customer CMOD projects and the SMOD enhancements they contain.
// Tables (Customizing/repository metadata, not transactional rows):
//   MODATTR — CMOD project header; STATUS = 'A' means activated in CMOD
//   MODACT  — CMOD project ↔ SMOD membership (NAME = project, MEMBER = SMOD name)
// Read once, two single-table queries (no JOIN), so the same statements also run
// through the ECC fallback (ZMCP_ADT_DISPATCH TABLE_READ). Historical note: older
// code queried MODSAP (SAP's SMOD definitions, no customer membership — issue #29).
export function cmodMembership(attrRows, actRows) {
  const active = new Set((attrRows || [])
    .filter((r) => String(r.STATUS ?? r.status ?? '').toUpperCase() === 'A')
    .map((r) => String(r.NAME ?? r.name ?? '').toUpperCase())
    .filter((n) => Z_PATTERN.test(n)));
  const byMember = new Map();
  for (const r of actRows || []) {
    const project = String(r.NAME ?? r.name ?? '').toUpperCase();
    const member = String(r.MEMBER ?? r.member ?? '').toUpperCase();
    if (!member || !active.has(project)) continue;
    if (!byMember.has(member)) byMember.set(member, []);
    if (!byMember.get(member).includes(project)) byMember.get(member).push(project);
  }
  return byMember;
}

async function scanCmodAll(client) {
  const attr = await callTool(client, 'GetSqlQuery', {
    sql_query: "SELECT NAME, STATUS FROM MODATTR WHERE NAME LIKE 'Z%' OR NAME LIKE 'Y%'",
    row_number: 5000,
  });
  if (!attr.ok || !attr.json) return { ok: false, error: attr.error || 'no MODATTR data' };
  const act = await callTool(client, 'GetSqlQuery', {
    sql_query: "SELECT NAME, MEMBER FROM MODACT WHERE NAME LIKE 'Z%' OR NAME LIKE 'Y%'",
    row_number: 5000,
  });
  if (!act.ok || !act.json) return { ok: false, error: act.error || 'no MODACT data' };
  return { ok: true, byMember: cmodMembership(attr.json.rows, act.json.rows) };
}

/**
 * Form-based user exits (MV45AFZZ, RV60AFZZ, …): what the customer put in the include.
 * A pristine SAP include holds USEREXIT_* FORMs whose bodies are comments only, so the
 * include counts as customized when any of these holds:
 *   - a FORM has code lines (not comments, not FORM / ENDFORM / *eject),
 *   - it declares FORMs of its own (not USEREXIT_*),
 *   - it pulls in customer includes (INCLUDE z… / y…).
 * Returns { customized, routines: [{ form, lines }], customerForms: [...], zIncludes: [...], codeLines }.
 */
export function analyzeFormExitSource(src) {
  const routines = [];
  const customerForms = [];
  const zIncludes = new Set();
  let current = null;
  let codeLines = 0;
  for (const raw of String(src || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('*') || line.startsWith('"')) continue;
    const code = line.replace(/".*$/, '').trim();
    if (!code) continue;
    const form = /^FORM\s+([A-Za-z0-9_\/]+)/i.exec(code);
    if (form) {
      current = { form: form[1].toUpperCase(), lines: 0 };
      routines.push(current);
      if (!/^USEREXIT_/i.test(current.form)) customerForms.push(current.form);
      continue;
    }
    if (/^ENDFORM\b/i.test(code)) { current = null; continue; }
    const inc = /^INCLUDE\s+([ZY][A-Za-z0-9_\/]*)/i.exec(code);
    if (inc) zIncludes.add(inc[1].replace(/\.$/, '').toUpperCase());
    if (current) current.lines += 1;
    codeLines += 1;
  }
  const withCode = routines.filter((r) => r.lines > 0);
  return {
    customized: withCode.length > 0 || customerForms.length > 0 || zIncludes.size > 0,
    routines: withCode,
    customerForms,
    zIncludes: [...zIncludes],
    codeLines,
  };
}

async function scanFormExit(client, includeName) {
  const r = await callTool(client, 'GetInclude', { include_name: includeName });
  if (!r.ok || /^(MCP error|Error)/.test(String(r.raw || ''))) return { ok: false, error: r.error || r.raw };
  return { ok: true, ...analyzeFormExitSource(r.raw) };
}

// GGB0 (Validation) / GGB1 (Substitution) — customer rules.
// Tables (Customizing, not transactional rows):
//   GB93  — validations:   VALID (name), BOOLCLASS, GBOPCREATE (created by)
//   GB92  — substitutions: SUBSTID (name), BOOLCLASS, EXIT, GBOPCREATE
//   GB31  — callup points: VALUSER (application area: GL, AM, CO, PS, …), VALEVENT
//           (callup point), RCLASS (Boolean class read there) → maps a rule's
//           BOOLCLASS to the application areas it belongs to
//   T001D / T001Q — FI company-code assignment of a validation / substitution
//           (BUKRS, EVENT, ACTIV); other application areas assign elsewhere
// A customer rule is one not created by user SAP. The name is not checked:
// GGB rule names have no customer namespace, and productive rules are commonly
// named without Z/Y (e.g. HVAL001, LSUB301).
const val = (row, key) => String(row?.[key] ?? row?.[key.toLowerCase()] ?? '').trim();

export function isCustomerGgbRule(name, createdBy) {
  return String(name || '').trim() !== '' && String(createdBy || '').trim().toUpperCase() !== 'SAP';
}

export function ggbRules(valRows, subRows, gb31Rows, t001dRows, t001qRows) {
  const areasByClass = new Map();
  for (const r of gb31Rows || []) {
    const cls = val(r, 'RCLASS');
    if (!cls) continue;
    if (!areasByClass.has(cls)) areasByClass.set(cls, { areas: new Set(), events: new Set() });
    areasByClass.get(cls).areas.add(val(r, 'VALUSER').toUpperCase());
    areasByClass.get(cls).events.add(val(r, 'VALEVENT'));
  }
  const assignments = (rows, nameKey) => {
    const by = new Map();
    for (const r of rows || []) {
      const name = val(r, nameKey).toUpperCase();
      if (!name) continue;
      if (!by.has(name)) by.set(name, []);
      by.get(name).push({ companyCode: val(r, 'BUKRS'), callupPoint: val(r, 'EVENT'), activationLevel: val(r, 'ACTIV') });
    }
    return by;
  };
  const valAssign = assignments(t001dRows, 'VALID');
  const subAssign = assignments(t001qRows, 'SUBST');
  const build = (rows, nameKey, type, assign) => (rows || [])
    .filter((r) => isCustomerGgbRule(val(r, nameKey), val(r, 'GBOPCREATE')))
    .map((r) => {
      const name = val(r, nameKey).toUpperCase();
      const cls = val(r, 'BOOLCLASS');
      const map = areasByClass.get(cls);
      const exit = val(r, 'EXIT');
      return {
        name,
        type,
        boolClass: cls,
        applAreas: map ? [...map.areas].filter(Boolean).sort() : [],
        createdBy: val(r, 'GBOPCREATE').toUpperCase(),
        ...(exit ? { exit } : {}),
        companyCodeAssignments: assign.get(name) || [],
      };
    });
  return [
    ...build(valRows, 'VALID', 'validation', valAssign),
    ...build(subRows, 'SUBSTID', 'substitution', subAssign),
  ];
}

const Z_OR_Y = (col) => `(${col} LIKE 'Z%' OR ${col} LIKE 'Y%')`;

async function sqlRows(client, sql, rowNumber = 5000) {
  const r = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: rowNumber });
  if (!r.ok || !r.json || !Array.isArray(r.json.rows)) return { ok: false, rows: [], error: r.error || r.raw || 'no data' };
  return { ok: true, rows: r.json.rows };
}

async function scanGgbRulesAll(client) {
  const v = await sqlRows(client, `SELECT VALID, BOOLCLASS, GBOPCREATE FROM GB93 WHERE GBOPCREATE <> 'SAP'`);
  const s = await sqlRows(client, `SELECT SUBSTID, BOOLCLASS, EXIT, GBOPCREATE FROM GB92 WHERE GBOPCREATE <> 'SAP'`);
  if (!v.ok && !s.ok) return { ok: false, rules: [], error: v.error };
  const c = await sqlRows(client, 'SELECT VALUSER, VALEVENT, RCLASS FROM GB31');
  if (!c.ok) return { ok: false, rules: [], error: c.error };
  // Company-code assignments are FI-only extra detail — a failed read does not fail the scan
  const d = v.ok ? await sqlRows(client, `SELECT BUKRS, EVENT, VALID, ACTIV FROM T001D`) : { rows: [] };
  const q = s.ok ? await sqlRows(client, `SELECT BUKRS, EVENT, SUBST, ACTIV FROM T001Q`) : { rows: [] };
  const partial = [!v.ok && 'GB93', !s.ok && 'GB92'].filter(Boolean);
  return {
    ok: true,
    rules: ggbRules(v.rows, s.rows, c.rows, d.rows, q.rows),
    ...(partial.length ? { partial: `${partial.join(', ')} not readable: ${unavailableReason((!v.ok ? v : s).error)}` } : {}),
  };
}

// BTE (Business Transaction Events, FIBF) — customer function modules:
//   TBE34 — Publish/Subscribe: EVENT, PRDKT (customer product), LAND, APPLK, FUNCT
//   TPS34 — Process:           PROCS, PRDKT, LAND, APPLK, FUNCT
//   TBE24 — customer products: PRDKT, AKTIV ('X' = product active) — read separately
//           and matched here, since TABLE_READ on ECC cannot JOIN
// Kept: FUNCT starting with Z/Y. APPLK (application: FI-FI, FI-AA, …) drives the
// module filter; an entry without APPLK applies to every application and is
// filed under FI (FIBF belongs to FI).
export function bteImplementations(tbe34Rows, tps34Rows, tbe24Rows) {
  const products = new Map((tbe24Rows || []).map((r) => [val(r, 'PRDKT').toUpperCase(), val(r, 'AKTIV').toUpperCase() === 'X']));
  const build = (rows, kind, eventKey) => (rows || [])
    .filter((r) => Z_PATTERN.test(val(r, 'FUNCT')))
    .map((r) => {
      const product = val(r, 'PRDKT').toUpperCase();
      return {
        kind,
        event: val(r, eventKey),
        application: val(r, 'APPLK').toUpperCase(),
        country: val(r, 'LAND').toUpperCase(),
        product,
        productActive: product ? (products.has(product) ? products.get(product) : null) : null,
        function: val(r, 'FUNCT').toUpperCase(),
      };
    });
  return [...build(tbe34Rows, 'P/S', 'EVENT'), ...build(tps34Rows, 'Process', 'PROCS')];
}

async function scanBteImplementationsAll(client) {
  const ps = await sqlRows(client, `SELECT EVENT, PRDKT, LAND, APPLK, FUNCT FROM TBE34 WHERE ${Z_OR_Y('FUNCT')}`);
  const pr = await sqlRows(client, `SELECT PROCS, PRDKT, LAND, APPLK, FUNCT FROM TPS34 WHERE ${Z_OR_Y('FUNCT')}`);
  if (!ps.ok && !pr.ok) return { ok: false, implementations: [], error: ps.error };
  const prod = await sqlRows(client, 'SELECT PRDKT, AKTIV FROM TBE24');
  const partial = [!ps.ok && 'TBE34', !pr.ok && 'TPS34', !prod.ok && 'TBE24'].filter(Boolean);
  return {
    ok: true,
    implementations: bteImplementations(ps.rows, pr.rows, prod.rows),
    ...(partial.length ? { partial: `${partial.join(', ')} not readable` } : {}),
  };
}

// VOFM — customer routines from TFRM / TFRMT (catalog + module rules in lib/customization-vofm.mjs).
// Customer number ranges only (exact per-group range is applied in vofmRoutines) —
// TFRMT holds every language, so reading SAP's routines too would hit the row cap.
const VOFM_CUSTOMER_RANGE = "( GRPNO >= '600' OR ( GRPZE IN ('PSTK', 'TDAT') AND GRPNO >= '050' ) )";

async function scanVofmAll(client) {
  const reg = await sqlRows(client, `SELECT GRPZE, GRPNO, AKTIV, KAPPL FROM TFRM WHERE ${VOFM_CUSTOMER_RANGE}`);
  if (!reg.ok) return { ok: false, routines: [], error: reg.error };
  const txt = await sqlRows(client, `SELECT SPRAS, GRPZE, GRPNO, BEZEI FROM TFRMT WHERE ${VOFM_CUSTOMER_RANGE}`);
  return {
    ok: true,
    ...vofmRoutines(reg.rows, txt.rows),
    ...(txt.ok ? {} : { partial: 'TFRMT not readable (no descriptions)' }),
  };
}

// Module scope — GGB by application area (GB31 VALUSER), BTE by application
// indicator (APPLK, prefix match). Modules not listed get no GGB / BTE entries.
export const GGB_SCOPE = {
  FI: ['GL', 'FI'],
  AA: ['AM'],
  CO: ['CO', 'KC', 'PC'],
  PS: ['PS'],
};
export const BTE_SCOPE = {
  FI: ['FI-', ''],
  AA: ['FI-AA'],
  CO: ['CO'],
  PS: ['PS', 'IS-PS'],
  TR: ['TR', 'FI-TR'],
  PM: ['PM'],
  SD: ['SD'],
  HCM: ['HR', 'PY'],
};

export function ggbForModule(rules, mod) {
  const scope = GGB_SCOPE[mod];
  if (!scope) return [];
  return (rules || []).filter((r) => r.applAreas.some((a) => scope.includes(a)));
}

export function bteForModule(impls, mod) {
  const scope = BTE_SCOPE[mod];
  if (!scope) return [];
  return (impls || []).filter((b) => scope.some((p) => (p === '' ? b.application === '' : b.application.startsWith(p))));
}

// Append structures / custom fields on a base table. GetTable answers in one of two shapes:
//   - ECC (BASIS < 7.50, path ecc-odata-rfc): JSON `{ table_data: "{…fields:[{fieldname,
//     rollname,comptype}]}" }` — includes show as `.INCLUDE` / `.INCLU--AP` WITHOUT their
//     structure name, so append names cannot be read there, only the fields.
//   - S/4 / BASIS ≥ 7.50: CDS-DDL text — `include ci_vbak_zz;`, `zzapprover : zde_x;` —
//     or classic `.APPEND.CI_VBAK`.
// A customer field is one whose name starts with Z / Y (ZZKVGR1, ZSEASON, Z_LOGON, YYFLAG)
// or whose data element does (CTRID typed ZE_CTRID) — SAP never ships either.
export function parseTableExtensions(raw) {
  const text = String(raw || '');
  let fields = null;
  try {
    const outer = JSON.parse(text);
    const inner = typeof outer?.table_data === 'string' ? JSON.parse(outer.table_data) : outer?.table_data || outer;
    if (Array.isArray(inner?.fields)) fields = inner.fields;
  } catch { /* DDL text */ }
  if (fields) {
    const customFields = fields
      .filter((f) => f?.fieldname && !String(f.fieldname).startsWith('.'))
      .filter((f) => Z_PATTERN.test(f.fieldname) || (f.rollname && Z_PATTERN.test(f.rollname)))
      .map((f) => String(f.fieldname).toUpperCase());
    const appendStructures = fields
      .filter((f) => String(f?.fieldname || '').startsWith('.') && f.rollname && (Z_PATTERN.test(f.rollname) || /^CI_/i.test(f.rollname)))
      .map((f) => String(f.rollname).toUpperCase());
    return { appendStructures: [...new Set(appendStructures)], customFields: [...new Set(customFields)], appendNamesKnown: false };
  }
  const cdsIncludes = [...text.matchAll(/\binclude\s+(\w+)/gi)].map((m) => m[1].toUpperCase());
  const seAppends = [...text.matchAll(/\.APPEND\.\s*([A-Z_][A-Z0-9_]*)/gi)].map((m) => m[1].toUpperCase());
  const appendStructures = [...new Set([...cdsIncludes, ...seAppends])].filter((n) => Z_PATTERN.test(n) || /^CI_/.test(n));
  // DDL field lines: `[key] name : type;` — keep customer names or customer-typed fields
  const customFields = [];
  for (const m of text.matchAll(/^\s*(?:key\s+)?([A-Za-z0-9_/]+)\s*:\s*([A-Za-z0-9_/.()]+)/gm)) {
    const name = m[1].toUpperCase(), type = m[2].toUpperCase();
    if (Z_PATTERN.test(name) || Z_PATTERN.test(type)) customFields.push(name);
  }
  return { appendStructures, customFields: [...new Set(customFields)], appendNamesKnown: true };
}

async function scanTableExtensions(client, baseTable) {
  const r = await callTool(client, 'GetTable', { table_name: baseTable });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...parseTableExtensions(r.raw) };
}

/* ──────────────────── orchestration ──────────────────── */

async function extractForModule(client, mod, globalCache) {
  const mdPath = resolve(CONFIGS_DIR, mod, 'enhancements.md');
  const parsed = parseEnhancementsMd(mdPath);
  if (!parsed) {
    console.warn(`[cust] ${mod}: enhancements.md not found — skipping`);
    return null;
  }
  console.log(`[cust] ${mod}: parsed ${parsed.smod.length} SMOD / ${parsed.badi.length} BAdI / ${parsed.formExits.length} form-exits / ${parsed.appends.length} appends`);

  const enhancements = {
    smodExits: [],
    badiImplementations: [],
    formBasedExits: [],
    ggbRules: [],
    bteImplementations: [],
    vofmRoutines: [],
    // Checks that could not be read at all (e.g. SQL on ECC) — never confuse with "none found"
    unavailable: [],
    // Catalog entries this system does not have (e.g. an include of another release)
    notPresent: [],
  };
  const extensions = {
    appendStructures: [],
  };

  // 1) BAdI implementations
  for (const b of parsed.badi) {
    const r = await scanBadiImplementations(client, b.name);
    if (r.ok && r.customs.length > 0) {
      enhancements.badiImplementations.push({
        standardName: b.name,
        description: b.description,
        source: r.source,
        customs: r.customs,
      });
      console.log(`  ✓ BAdI ${b.name} — ${r.customs.length} Z impl (${r.source})`);
    }
  }

  // 2) SMOD → CMOD — from the pre-computed global scan
  if (globalCache && !globalCache.cmodOk) {
    if (parsed.smod.length) {
      enhancements.unavailable.push({ check: 'smod', source: 'MODATTR/MODACT', reason: unavailableReason(globalCache.cmodError) });
      console.log(`  ✗ SMOD → CMOD not readable: ${unavailableReason(globalCache.cmodError)}`);
    }
  } else {
    for (const s of parsed.smod) {
      const projects = globalCache?.cmod?.get(String(s.name).toUpperCase()) || [];
      if (projects.length > 0) {
        enhancements.smodExits.push({
          standardName: s.name,
          description: s.description,
          customs: projects.map((n) => ({ name: n, type: 'CMOD' })),
        });
        console.log(`  ✓ SMOD ${s.name} — CMOD(${projects.join(', ')})`);
      }
    }
  }

  // 3) Form-based user exits
  for (const f of parsed.formExits) {
    const r = await scanFormExit(client, f.include);
    if (!r.ok && isNotFound(r.error)) {
      // The catalog lists includes of every release; this system simply does not have it
      enhancements.notPresent.push({ check: 'formExit', source: f.include });
      console.log(`  · Form-exit ${f.include} not present on this system`);
      continue;
    }
    if (!r.ok) {
      enhancements.unavailable.push({ check: 'formExit', source: f.include, reason: unavailableReason(r.error) });
      console.log(`  ✗ Form-exit ${f.include} not readable: ${unavailableReason(r.error)}`);
      continue;
    }
    if (r.customized) {
      enhancements.formBasedExits.push({
        include: f.include,
        catalogRoutines: f.routines,
        routines: r.routines,
        customerForms: r.customerForms,
        zIncludes: r.zIncludes,
        codeLines: r.codeLines,
      });
      console.log(`  ✓ Form-exit ${f.include} — ${r.routines.length} FORM(s) with code, ${r.zIncludes.length} Z include(s)`);
    }
  }

  // 4) GGB0/GGB1 — from the pre-computed global scan, filtered by application area
  if (globalCache && GGB_SCOPE[mod] && (!globalCache.ggbOk || globalCache.ggbPartial)) {
    enhancements.unavailable.push({
      check: 'ggb', source: 'GB93/GB92/GB31',
      reason: globalCache.ggbOk ? globalCache.ggbPartial : unavailableReason(globalCache.ggbError),
    });
  }
  if (globalCache?.ggb && GGB_SCOPE[mod]) {
    const mine = ggbForModule(globalCache.ggb, mod);
    if (mine.length) {
      enhancements.ggbRules = mine;
      for (const g of mine) {
        const cc = g.companyCodeAssignments.length ? ` — ${g.companyCodeAssignments.length} company-code assignment(s)` : '';
        console.log(`  ✓ GGB ${g.type.padEnd(12)} ${g.name} [${g.applAreas.join(',')}] class ${g.boolClass}${cc}`);
      }
    }
  }

  // 5) BTE — from the pre-computed global scan, filtered by application indicator
  if (globalCache && BTE_SCOPE[mod] && (!globalCache.bteOk || globalCache.btePartial)) {
    enhancements.unavailable.push({
      check: 'bte', source: 'TBE34/TPS34/TBE24',
      reason: globalCache.bteOk ? globalCache.btePartial : unavailableReason(globalCache.bteError),
    });
  }
  if (globalCache?.bte && BTE_SCOPE[mod]) {
    const mine = bteForModule(globalCache.bte, mod);
    if (mine.length) {
      enhancements.bteImplementations = mine;
      for (const b of mine) {
        console.log(`  ✓ BTE ${b.kind.padEnd(8)} ${b.event} [${b.application || '*'}] → ${b.function}${b.productActive === false ? ' (product inactive)' : ''}`);
      }
    }
  }

  // 6) VOFM — customer routines of this module, each read from its include
  if (globalCache && VOFM_MODULES.has(mod) && !globalCache.vofmOk) {
    enhancements.unavailable.push({ check: 'vofm', source: 'TFRM', reason: unavailableReason(globalCache.vofmError) });
  }
  if (globalCache?.vofmPartial && vofmForModule(globalCache.vofm, mod).length) {
    enhancements.unavailable.push({ check: 'vofmText', source: 'TFRMT', reason: globalCache.vofmPartial });
  }
  for (const v of vofmForModule(globalCache?.vofm, mod)) {
    const r = await scanFormExit(client, v.include);
    const { module: _m, ...entry } = v;
    if (!r.ok && isNotFound(r.error) && !v.active) {
      // Registered but never activated: no active include to read — still a customer routine
      enhancements.vofmRoutines.push({ ...entry, forms: [], codeLines: 0, note: 'inactive routine — no active include' });
      console.log(`  ✓ VOFM ${v.group} ${v.number} ${v.description || ''} — inactive, no active include`);
      continue;
    }
    if (!r.ok && isNotFound(r.error)) {
      // Registered in TFRM but its include was never generated on this system
      enhancements.notPresent.push({ check: 'vofm', source: v.include });
      console.log(`  · VOFM ${v.group} ${v.number} — include ${v.include} not present on this system`);
      continue;
    }
    if (!r.ok) {
      enhancements.unavailable.push({ check: 'vofm', source: v.include, reason: unavailableReason(r.error) });
      console.log(`  ✗ VOFM ${v.group} ${v.number} — ${v.include} not readable: ${unavailableReason(r.error)}`);
      continue;
    }
    enhancements.vofmRoutines.push({ ...entry, forms: r.routines.map((x) => x.form), codeLines: r.codeLines });
    console.log(`  ✓ VOFM ${v.group} ${v.number} ${v.description || ''} — ${v.include}, ${r.codeLines} line(s)${v.active ? '' : ' (inactive)'}`);
  }

  // 7) Append structures / custom fields on base tables
  const baseTables = [...new Set(parsed.appends.map((a) => a.baseTable).filter((t) => /^[A-Z][A-Z0-9_]+$/.test(t)))];
  for (const tbl of baseTables) {
    const r = await scanTableExtensions(client, tbl);
    if (r.ok && ((r.appendStructures && r.appendStructures.length) || (r.customFields && r.customFields.length))) {
      extensions.appendStructures.push({
        baseTable: tbl,
        appendStructures: r.appendStructures || [],
        customFields: r.customFields || [],
        ...(r.appendNamesKnown === false ? { note: 'append structure names not readable on this release (ECC) — fields only' } : {}),
      });
      console.log(`  ✓ Table ${tbl} — ${r.appendStructures.length} append / ${r.customFields.length} Z field`);
    }
  }

  return { enhancements, extensions };
}

async function main() {
  console.log('[cust] Connecting to MCP server...');
  const transport = new StdioClientTransport({ command: 'node', args: [BRIDGE] });
  const client = new Client({ name: 'customization-extractor', version: '1.0.0' });
  await client.connect(transport);
  console.log('[cust] Connected.');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // One-shot global scans — CMOD, GGB (GB93/GB92/GB31), BTE (TBE34/TPS34/TBE24) and VOFM (TFRM/TFRMT)
  // are workspace-wide, not per-module; scanning once and filtering by
  // application area / indicator into each module's bucket avoids repeating
  // the same SQL on every module iteration.
  console.log('[cust] Scanning active customer CMOD projects (MODATTR, MODACT)...');
  const cmodAll = await scanCmodAll(client);
  console.log(cmodAll.ok ? `[cust]   → ${cmodAll.byMember.size} SMOD enhancements in active Z/Y CMOD projects` : `[cust]   ✗ MODATTR/MODACT not readable: ${unavailableReason(cmodAll.error)}`);
  console.log('[cust] Scanning GGB0/GGB1 customer rules (GB93, GB92, GB31, T001D, T001Q)...');
  const ggbAll = await scanGgbRulesAll(client);
  console.log(ggbAll.ok ? `[cust]   → ${ggbAll.rules?.length || 0} customer GGB rules${ggbAll.partial ? ` (${ggbAll.partial})` : ''}` : `[cust]   ✗ GB93/GB92/GB31 not readable: ${unavailableReason(ggbAll.error)}`);
  console.log('[cust] Scanning BTE customer FMs (TBE34, TPS34, TBE24)...');
  const bteAll = await scanBteImplementationsAll(client);
  console.log(bteAll.ok ? `[cust]   → ${bteAll.implementations?.length || 0} customer BTE FMs${bteAll.partial ? ` (${bteAll.partial})` : ''}` : `[cust]   ✗ TBE34/TPS34 not readable: ${unavailableReason(bteAll.error)}`);
  console.log('[cust] Scanning VOFM customer routines (TFRM, TFRMT)...');
  const vofmAll = await scanVofmAll(client);
  const unmapped = Object.entries(vofmAll.unmapped || {}).map(([g, n]) => `${g} ×${n}`).join(', ');
  console.log(vofmAll.ok
    ? `[cust]   → ${vofmAll.routines.length} customer VOFM routines${vofmAll.partial ? ` (${vofmAll.partial})` : ''}${unmapped ? ` — groups outside the catalog, not reported (counted as 600–999): ${unmapped}` : ''}`
    : `[cust]   ✗ TFRM not readable: ${unavailableReason(vofmAll.error)}`);
  const globalCache = {
    cmod: cmodAll.byMember || new Map(), cmodOk: cmodAll.ok, cmodError: cmodAll.error,
    ggb: ggbAll.rules || [], ggbOk: ggbAll.ok, ggbError: ggbAll.error, ggbPartial: ggbAll.partial,
    bte: bteAll.implementations || [], bteOk: bteAll.ok, bteError: bteAll.error, btePartial: bteAll.partial,
    vofm: vofmAll.routines || [], vofmOk: vofmAll.ok, vofmError: vofmAll.error, vofmPartial: vofmAll.partial,
  };

  const summary = { modules: [], total: { smod: 0, badi: 0, formExits: 0, extensions: 0, ggb: 0, bte: 0, vofm: 0 } };

  for (const mod of selectedModules) {
    const res = await extractForModule(client, mod, globalCache);
    if (!res) continue;
    const modDir = resolve(OUTPUT_DIR, mod);
    mkdirSync(modDir, { recursive: true });

    const enhancementsPath = resolve(modDir, 'enhancements.json');
    const extensionsPath = resolve(modDir, 'extensions.json');

    writeFileSync(enhancementsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      module: mod,
      ...res.enhancements,
    }, null, 2), 'utf-8');
    writeFileSync(extensionsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      module: mod,
      ...res.extensions,
    }, null, 2), 'utf-8');

    summary.modules.push({
      module: mod,
      smodExits: res.enhancements.smodExits.length,
      badiImpls: res.enhancements.badiImplementations.length,
      formExits: res.enhancements.formBasedExits.length,
      ggbRules: res.enhancements.ggbRules.length,
      bteImpls: res.enhancements.bteImplementations.length,
      vofmRoutines: res.enhancements.vofmRoutines.length,
      tableExtensions: res.extensions.appendStructures.length,
      unavailable: res.enhancements.unavailable.map((u) => u.check.toUpperCase()),
      notPresent: res.enhancements.notPresent.length,
    });
    summary.total.smod += res.enhancements.smodExits.length;
    summary.total.badi += res.enhancements.badiImplementations.length;
    summary.total.formExits += res.enhancements.formBasedExits.length;
    summary.total.ggb += res.enhancements.ggbRules.length;
    summary.total.bte += res.enhancements.bteImplementations.length;
    summary.total.vofm += res.enhancements.vofmRoutines.length;
    summary.total.extensions += res.extensions.appendStructures.length;
  }

  console.log('\n[cust] === Summary ===');
  for (const m of summary.modules) {
    console.log(`  ${m.module.padEnd(8)} SMOD:${m.smodExits}  BAdI:${m.badiImpls}  FormExit:${m.formExits}  GGB:${m.ggbRules}  BTE:${m.bteImpls}  VOFM:${m.vofmRoutines}  TableExt:${m.tableExtensions}${m.unavailable.length ? `  NOT READ: ${countChecks(m.unavailable)}` : ''}${m.notPresent ? `  not present: ${m.notPresent}` : ''}`);
  }
  console.log(`  TOTAL    SMOD:${summary.total.smod}  BAdI:${summary.total.badi}  FormExit:${summary.total.formExits}  GGB:${summary.total.ggb}  BTE:${summary.total.bte}  VOFM:${summary.total.vofm}  TableExt:${summary.total.extensions}`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  await client.close();
  process.exit(0);
}

if (IS_MAIN) {
  main().catch((e) => {
    console.error('[cust] Fatal error:', e);
    process.exit(1);
  });
}
