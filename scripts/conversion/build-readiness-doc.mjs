// sc4sap:s4-conversion-readiness — read the system facts, gather the evidence for the extension question, scan,
// and build the HTML report. Files, per analysis, under <artifactBase>/conversion/<CODE>/:
//   facts.json                              system facts (components, org units, warehouses, ML, credit, outputs, IDoc partner
//                                           profiles, event linkages)
//   <CODE>-readiness.json                   the model (scan results + ratings); narrative.json merged in on build
//   <CODE>-s4-readiness-v<n>-<lang>.html    the report
//
// CLI (prints one JSON line):
//   node build-readiness-doc.mjs facts --code <CODE>                                read-only SAP reads (config tables)
//   node build-readiness-doc.mjs evidence [--code <CODE>] [--target 2025]           evidence per extension (question [2])
//   node build-readiness-doc.mjs scan --code <CODE> --target 2023|2025|public|compare [--ext EWM,RAP,FLP]
//        [--project ..] [--lang ko] [--graphs a.json,b.json] [--src <dir>] [--cust <dir>] [--usage f1,f2]
//   node build-readiness-doc.mjs narrative --code <CODE> --file <narrative.json>   { summary: [..], extensions: { EWM: '..' } }
//   node build-readiness-doc.mjs build --code <CODE> [--same-version]
//   common: [--base <artifact base>] (default: the active profile's artifact base)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { loadKb, findGraphs, scanGraphs, scanPatterns, scanCustomizations, scanUsage, readUsage } from './readiness-scan.mjs';
import { rateObjects, extensionEvidence, checklist, totals, readinessScore, integrationRows, tableExtensionRows, TARGETS } from './readiness-model.mjs';
import { renderPage } from './readiness-page.mjs';

const CODE_RE = /^[A-Za-z0-9_-]{1,30}$/;
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`, 'utf8');
const today = () => new Date().toISOString().slice(0, 10);
const arr = (v) => (Array.isArray(v) ? v : []);

export const docFiles = (base, code) => {
  const dir = join(base, 'conversion', code);
  return { dir, facts: join(dir, 'facts.json'), model: join(dir, `${code}-readiness.json`), narrative: join(dir, 'narrative.json'), page: (v, l) => join(dir, `${code}-s4-readiness-v${v}-${l}.html`) };
};

/** Newest measured usage files of the profile: all custom T-codes and the standard ones. */
export function findUsage(base) {
  const d = join(base, 'usage');
  if (!existsSync(d)) return [];
  const fs = readdirSync(d).filter((f) => /^tcode-usage-.*-(all|STD)\.json$/.test(f)).sort();
  const last = (re) => fs.filter((f) => re.test(f)).at(-1);
  return [last(/-all\.json$/), last(/-STD\.json$/)].filter(Boolean).map((f) => join(d, f));
}

/** Tables whose customer fields the report checks: proxy / moved tables, append items, tables with standard CDS views. */
export function extensionTables(kb) {
  return [...new Set([...arr(kb.tableExtensions?.groups).flatMap((g) => g.tables), ...arr(kb.items).flatMap((it) => arr(it.appends).map((a) => a.table)),
    ...Object.keys(kb.cds || {}).filter((k) => !k.startsWith('_'))])].sort();
}

/** DD03L rows → { TABLE: { fields: [customer fields], includes: [append / CI_ include names] } }. */
export function customFieldsOf(rows) {
  const out = {};
  for (const r of rows) {
    const t = String(r.TABNAME || ''), f = String(r.FIELDNAME || ''), p = String(r.PRECFIELD || '');
    const x = () => (out[t] ||= { fields: [], includes: [] });
    if (/^[ZY]/.test(f)) x().fields.push(f);
    else if (/^\.(APPEND|INCLU)/.test(f) && /^([ZY]|CI_)/.test(p)) x().includes.push(p);
  }
  for (const v of Object.values(out)) { v.fields = [...new Set(v.fields)]; v.includes = [...new Set(v.includes)]; }
  return out;
}

/** Facts from configuration tables (read-only, no application data): components, org units, WM, ML, credit, output. */
export async function readFacts(base, code) {
  const { connect, readTable, readIn } = await import('../config/sap-reader.mjs');
  const client = await connect('s4-conversion-readiness');
  const facts = { readAt: today(), errors: [] };
  const read = async (t, opt) => { const r = await readTable(client, t, opt); if (!r.ok) facts.errors.push(`${t}: ${r.error}`); return r.ok ? r.rows : null; };
  try {
    const cv = await read('CVERS');
    if (cv) facts.components = cv.map((r) => ({ name: r.COMPONENT, release: r.RELEASE, sp: r.EXTRELEASE, type: r.COMP_TYPE, foreign: /^\//.test(r.COMPONENT || '') || !/^(SAP_|EA-|EA_|PI_BASIS|ST-|ST_|SAP_BW|WEBCUIF|ELM|LSOFE|IW_|GW_|UI|BI_CONT|MDG|SEM-BW|FINBASIS|FSCM|ECC-|INSURANCE|IS-|ERECRUIT|CTE_|FI-CA|SRA|ODATA_|MDG_|SLL|GRC|SEPA|PLMWUI|SAP-HR|HR-|CPRXRPM|SBOP|CRM|SRM|SCM)/.test(r.COMPONENT || '') }));
    const t001 = await read('T001', { fields: ['BUKRS', 'WAERS', 'LAND1'] }); if (t001) facts.companyCodes = t001.length;
    const plants = await read('T001W', { fields: ['WERKS'] }); if (plants) facts.plants = plants.length;
    const wh = await read('T300', { fields: ['LGNUM'] }); if (wh) facts.warehouses = wh.length;
    const t001k = await read('T001K', { fields: ['BWKEY', 'MLBWA'] }); if (t001k) { facts.valuationAreas = t001k.length; facts.mlInactive = t001k.filter((r) => !String(r.MLBWA || '').trim()).length; }
    const cc = await read('T014', { fields: ['KKBER'] }); if (cc) facts.creditAreas = cc.length;
    const out = await read('TNAPR', { fields: ['KAPPL', 'KSCHL', 'PGNAM', 'SFORM', 'FONAM'] });
    if (out) facts.customOutputs = out.filter((r) => /^[ZY]/.test(r.PGNAM || '') || /^[ZY]/.test(r.SFORM || '') || /^[ZY]/.test(r.FONAM || '')).length;
    // interfaces: message types of the partner profiles (outbound / inbound) — configuration, no IDoc data
    const group = (rows, dir, partner) => {
      const m = new Map();
      for (const r of rows || []) { const t = String(r.MESTYP || '').trim(); if (!t) continue; const x = m.get(t) || { mestyp: t, dir, partners: new Set(), idoctyp: r.IDOCTYP || '' }; x.partners.add(r[partner] || ''); m.set(t, x); }
      return [...m.values()].map((x) => ({ ...x, partners: x.partners.size }));
    };
    const e13 = await read('EDP13'), e21 = await read('EDP21');
    if (e13 || e21) facts.idoc = [...group(e13, 'out', 'RCVPRN'), ...group(e21, 'in', 'SNDPRN')].sort((a, b) => a.mestyp.localeCompare(b.mestyp) || a.dir.localeCompare(b.dir));
    // customer fields (Z* / Y* fields, appends, CI_ includes) of every table the conversion moves or puts behind
    // a proxy view, and of the tables with standard CDS views — from the DDIC (DD03L), not from the append extract
    const tabs = extensionTables(loadKb());
    const dd = await readIn(client, 'DD03L', 'TABNAME', tabs, { extra: { AS4LOCAL: 'A' }, fields: ['TABNAME', 'FIELDNAME', 'PRECFIELD'], chunk: 6 });
    if (dd.rows.length) facts.customFields = customFieldsOf(dd.rows);
    if (!dd.ok) facts.errors.push(...dd.errors.map((e) => `DD03L: ${e}`));
    // event linkages (SWE2): customer receivers of BOR events
    const ev = await read('SWETYPECOU');
    if (ev) { facts.eventLinks = ev.length; facts.customEventLinks = ev.filter((r) => Object.values(r).some((v) => /^(Z|Y|WS9)/.test(String(v || '').trim()))).length; }
  } finally { await client.close().catch(() => {}); }
  const f = docFiles(base, code);
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.facts, facts);
  return { facts: f.facts, components: arr(facts.components).length, foreign: arr(facts.components).filter((c) => c.foreign).map((c) => c.name), warehouses: facts.warehouses, mlInactive: facts.mlInactive, creditAreas: facts.creditAreas, customOutputs: facts.customOutputs,
    idocTypes: arr(facts.idoc).length, eventLinks: facts.eventLinks, customEventLinks: facts.customEventLinks, errors: facts.errors };
}

function collect(base, { graphs, src, cust, usage }) {
  const kb = loadKb();
  const gFiles = graphs?.length ? graphs : findGraphs(base);
  const g = scanGraphs(gFiles, kb);
  const p = scanPatterns(g.objects, src || join(base, 'mcp-output', 'src'), kb);
  const c = scanCustomizations(cust || join(base, 'customizations'), kb);
  const uFiles = usage?.length ? usage : findUsage(base);
  const used = [...new Set(uFiles.flatMap(readUsage))];
  return { kb, gFiles, g, p, c, uFiles, used };
}

/** Evidence for question [2] — which extensions the system points to. */
export function cmdEvidence({ base, code, target = '' }) {
  const { g, p, c, used } = collect(base, {});
  const facts = code ? readJson(docFiles(base, code).facts, {}) : {};
  return extensionEvidence({ used, findings: [...g.findings, ...p.findings], exits: c.exits, objects: g.objects, facts, target });
}

export function cmdScan({ base, code, target, ext = [], project = '', lang = 'ko', graphs, src, cust, usage, system = {} }) {
  if (!TARGETS.includes(target)) throw new Error(`--target must be one of ${TARGETS.join(', ')}`);
  const f = docFiles(base, code);
  const { kb, gFiles, g, p, c, uFiles, used } = collect(base, { graphs, src, cust, usage });
  const facts = readJson(f.facts, {});
  const findings = [...g.findings, ...p.findings];
  const objects = rateObjects(g.objects, findings, kb);
  const usageHits = scanUsage(used, kb);
  const tabExt = tableExtensionRows(kb, facts, c.appends);
  const zUsed = used.filter((t) => /^[ZY]/.test(t)).length;
  const measured = uFiles.length ? { used: zUsed, measured: readJson(uFiles[0], {}).measured?.length || zUsed } : null;
  const old = readJson(f.model, {});
  const model = {
    code, lang, project: project || old.project || '', target, extensions: ext, system, builtAt: today(), version: old.version || 0,
    inputs: { kbVersion: kb.version, graphs: gFiles.map((x) => x.replace(base, '').replace(/^[\\/]/, '')), units: p.scanned, usage: uFiles.map((x) => x.replace(base, '').replace(/^[\\/]/, '')), cust: cust || 'customizations', facts: existsSync(f.facts) ? 'facts.json' : '' },
    facts, objects, findings, exits: c.exits, appends: tabExt, usage: usageHits, integration: integrationRows(facts, kb),
    extEvidence: extensionEvidence({ used, findings, exits: c.exits, objects, facts, target }),
    checklist: checklist({ findings, usage: usageHits, appends: tabExt, facts, objects, extensions: ext, measured }),
  };
  model.totals = totals({ findings, objects, exits: c.exits, appends: tabExt, usage: usageHits });
  model.score = readinessScore(objects);
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.model, model);
  return { model: f.model, objects: objects.length, findings: findings.length, bySev: model.totals.bySev, exits: c.exits.length, appends: tabExt.length, extensionsNeeded: tabExt.filter((a) => a.item).length, usage: usageHits.length, score: model.score, days: model.totals.days };
}

export function cmdNarrative({ base, code, file }) {
  const n = readJson(file, null); if (!n) throw new Error(`${file} not found`);
  writeJson(docFiles(base, code).narrative, { summary: arr(n.summary).map(String), extensions: Object.fromEntries(Object.entries(n.extensions || {}).map(([k, v]) => [k, String(v)])) });
  return { narrative: docFiles(base, code).narrative };
}

export function cmdBuild({ base, code, sameVersion = false }) {
  const f = docFiles(base, code);
  const model = readJson(f.model, null); if (!model) throw new Error(`${f.model} not found — run scan first`);
  if (!sameVersion || !model.version) model.version = (model.version || 0) + 1;
  writeJson(f.model, model);
  model.narrative = readJson(f.narrative, null);
  const html = f.page(model.version, model.lang);
  writeFileSync(html, renderPage(model, loadKb()), 'utf8');
  return { html, version: model.version };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...args] = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const list = (k) => String(get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const base = resolve(get('--base') || resolveArtifactBase(process.cwd()));
  const code = get('--code');
  const need = () => { if (!CODE_RE.test(code || '')) throw new Error('--code <CODE> is required (letters, digits, _ or -)'); return code; };
  (async () => {
    let r;
    if (cmd === 'facts') r = await readFacts(base, need());
    else if (cmd === 'evidence') r = cmdEvidence({ base, code, target: get('--target') || '' });
    else if (cmd === 'scan') r = cmdScan({ base, code: need(), target: get('--target'), ext: list('--ext').map((x) => x.toUpperCase()), project: get('--project') || '', lang: get('--lang') || 'ko',
      graphs: list('--graphs').map((x) => resolve(x)), src: get('--src') ? resolve(get('--src')) : '', cust: get('--cust') ? resolve(get('--cust')) : '', usage: list('--usage').map((x) => resolve(x)),
      system: { alias: get('--alias') || process.env.SAP_PROFILE || '', sapVersion: get('--sap-version') || '', release: get('--release') || '' } });
    else if (cmd === 'narrative') r = cmdNarrative({ base, code: need(), file: resolve(get('--file') || '') });
    else if (cmd === 'build') r = cmdBuild({ base, code: need(), sameVersion: args.includes('--same-version') });
    else { console.error('Usage: node build-readiness-doc.mjs facts|evidence|scan|narrative|build … (see the header)'); process.exit(2); }
    console.log(JSON.stringify(r));
  })().catch((e) => { console.error(`build-readiness-doc: ${e.message}`); process.exit(1); });
}
