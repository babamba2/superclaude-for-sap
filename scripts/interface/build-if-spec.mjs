// sc4sap:interface-mapping-spec — build, import and refresh of interface mapping specifications.
//
// Files, per interface, under <artifactBase>/interfaces/<IF_ID>/:
//   <IF_ID>-v<ver>-<lang>.json    the model of that version (source of the page)
//   <IF_ID>-v<ver>-<lang>.html    the editable page
//   _i18n/                        texts handed to the translator for the English companion
// and <artifactBase>/interfaces/project.json — cover settings and code-list overrides
// shared by every interface of the project:
//   { projectName, title, company, docNo: "IF-MAP-{ifId}", copyright: [..], codes: { region: [..] } }
//   (any text may be { ko, en } instead of a string)
//
// CLI (prints one JSON line):
//   node build-if-spec.mjs init --answers <answers.json> [--force]   read SAP, write v0.1, build the page
//   node build-if-spec.mjs build --if <ID> [--lang L]                rebuild the latest page (after project.json changes)
//   node build-if-spec.mjs import <edited.html> [--force]            take a page saved in edit mode as its new version
//   node build-if-spec.mjs refresh --if <ID> [--line P=STRUCT]       read SAP again, keep user content, new version
//   node build-if-spec.mjs resolve --if <ID>                         fill hand-typed SAP fields (TABLE-FIELD / data element) from DDIC
//   node build-if-spec.mjs next-id --module <M>                      next IF ID from project.json idPattern
//   node build-if-spec.mjs fields --if <ID>                          SAP-side field list for /sc4sap:create-object
//   node build-if-spec.mjs texts --if <ID> --to en                   texts to translate → _i18n/<ver>-todo.json
//   node build-if-spec.mjs companion --if <ID> --to en [--texts <translated.json>]
//   common: [--dir <interfaces folder>] (default <artifactBase>/interfaces)
//
// answers.json (written by the skill from the interview):
//   { ifId, lang, header: {…}, sides: { source: {…}, target: {…} }, sapSide: "source"|"target"|"both",
//     objects: { source: { object, kind?, lines? }, target: {…} },   — an existing SAP object, or
//     fields:  { source: ["EKKO-EBELN", "MATNR", …] },                 — a new interface: fields by name
//     preset?: "master-out" | "txn-out" | "inbound" | "query", response?: bool, module? (next-id when ifId is empty) }
//   import also fills hand-typed SAP fields from DDIC (--no-resolve true skips it).

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { resolveArtifactBase, readActiveAlias } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { newModel, refreshModel, nextVersion, today, textsOf, withTexts, pendingRefs, resolveModel, orderRows, renumber } from './if-model.mjs';
import { ifValidate, findingText } from './if-validate.mjs';
import { ruleText } from './if-codes.mjs';
import { pageHtml, modelFromPage } from './if-spec-page.mjs';
import { readSapObject, splitGroups, resolveRefs } from './sap-fields.mjs';

const FIRST = { ko: '최초 작성', en: 'First version' };
const TITLES = { ko: '인터페이스 매핑 정의서', en: 'Interface Mapping Specification' };
export const safeId = (id) => String(id || '').trim().replace(/[^A-Za-z0-9_.-]/g, '_');
const vkey = (v) => String(v).split('.').map((n) => Number(n) || 0);
const byVer = (a, b) => { const [x, y] = [vkey(a), vkey(b)]; return x[0] - y[0] || x[1] - y[1]; };
const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const writeJson = (p, o) => atomicWriteFileSync(p, JSON.stringify(o, null, 2) + '\n');

/** Versions present for one interface and language, oldest first. */
export function versionsOf(dir, ifId, lang) {
  if (!existsSync(dir)) return [];
  const re = new RegExp(`^${safeId(ifId).replace(/[.]/g, '\\.')}-v(\\d+\\.\\d+)-${lang}\\.json$`);
  return readdirSync(dir).map((f) => re.exec(f)?.[1]).filter(Boolean).sort(byVer);
}

export function languagesOf(dir, ifId) {
  if (!existsSync(dir)) return [];
  const re = new RegExp(`^${safeId(ifId).replace(/[.]/g, '\\.')}-v\\d+\\.\\d+-([a-z]{2})\\.json$`);
  return [...new Set(readdirSync(dir).map((f) => re.exec(f)?.[1]).filter(Boolean))];
}

/** The language the specification is written in (the companion models carry companionOf). */
export function primaryLang(dir, ifId) {
  const langs = languagesOf(dir, ifId);
  return langs.find((l) => !readJson(file(dir, ifId, versionsOf(dir, ifId, l).pop(), l, 'json'), {}).companionOf) || langs[0];
}

const file = (dir, ifId, ver, lang, ext) => join(dir, `${safeId(ifId)}-v${ver}-${lang}.${ext}`);

/** Cover settings of the project in one language. */
export function projectFor(project, lang, model) {
  const pick = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x[lang] ?? x.ko ?? x.en : x);
  const p = project || {};
  const copy = pick(p.copyright);
  return {
    projectName: pick(p.projectName) || '',
    title: pick(p.title) || TITLES[lang] || TITLES.en,
    company: pick(p.company) || '',
    docNo: String(pick(p.docNo) || 'IF-MAP-{ifId}').replace(/\{ifId\}/g, model.ifId).replace(/\{name\}/g, model.header?.name || ''),
    copyright: Array.isArray(copy) ? copy : copy ? [copy] : [],
  };
}

function summary(model) {
  const f = ifValidate(model);
  const n = { error: 0, warn: 0, info: 0 };
  for (const x of f) n[x.sev]++;
  return { findings: n, top: f.filter((x) => x.sev !== 'info').slice(0, 12).map((x) => findingText(x, 'en')) };
}

/** Write the model of one version and its page. */
export function writeVersion(root, model, { companion = true } = {}) {
  const dir = join(root, safeId(model.ifId));
  ensureDirSync(dir);
  const project = readJson(join(root, 'project.json'), {});
  const others = languagesOf(dir, model.ifId).filter((l) => l !== model.lang && versionsOf(dir, model.ifId, l).includes(model.version));
  const other = companion && others[0] ? basename(file(dir, model.ifId, model.version, others[0], 'html')) : '';
  writeJson(file(dir, model.ifId, model.version, model.lang, 'json'), model);
  const html = file(dir, model.ifId, model.version, model.lang, 'html');
  atomicWriteFileSync(html, pageHtml({ model, project: projectFor(project, model.lang, model), codes: project.codes || {}, companion: other }));
  return { html, model: file(dir, model.ifId, model.version, model.lang, 'json'), version: model.version, lang: model.lang, ...summary(model) };
}

async function withClient(fn) {
  const { connect } = await import('../config/sap-reader.mjs');
  const client = await connect('interface-mapping-spec');
  try { return await fn(client); } finally { await client.close().catch(() => {}); }
}

/** SAP side of each side: an object (table, structure, view, FM) or, for a new interface, a field list. */
async function sapRead(objects, extraLines = {}, fields = {}) {
  // An empty grid needs no SAP connection (and works with SAP unreachable).
  if (!['source', 'target'].some((s) => objects?.[s]?.object || fields?.[s]?.length)) return { sap: {}, problems: [] };
  return withClient(async (client) => {
    const out = {};
    const problems = [];
    for (const side of ['source', 'target']) {
      const o = objects?.[side];
      if (!o?.object && fields?.[side]?.length) {
        const r = await resolveRefs(client, fields[side]);
        out[side] = { request: { groups: [{ name: '', kind: '', card: '', rows: r.rows.map(({ ref, ...c }) => c) }] }, response: null, kind: 'FIELDS' };
        problems.push(...r.problems.map((p) => `${side}: ${p}`));
        continue;
      }
      if (!o?.object) continue;
      const r = await readSapObject(client, o.object, { kind: o.kind, lines: { ...(o.lines || {}), ...extraLines } });
      if (r.error) { problems.push(`${side}: ${r.error}`); continue; }
      out[side] = splitGroups(r);
      out[side].kind = r.kind;
      if (r.unresolved?.length) problems.push(...r.unresolved.map((u) => `${side}: ${u.param} (${u.ref}) — ${u.why}`));
    }
    return { sap: out, problems };
  });
}

const sapResolve = (refs) => withClient((client) => resolveRefs(client, refs));

function systemName() {
  try { return readActiveAlias(process.cwd()) || ''; } catch { return ''; }
}

export async function cmdInit(root, answers, { force = false, read = sapRead } = {}) {
  if (!answers.ifId && answers.module) answers.ifId = cmdNextId(root, answers.module).ifId;
  const ifId = String(answers.ifId || '').trim();
  if (!ifId) throw new Error('answers.ifId is required');
  const lang = answers.lang || 'ko';
  const dir = join(root, safeId(ifId));
  if (versionsOf(dir, ifId, lang).length && !force) throw new Error(`${ifId} already has a specification in ${dir} — use build / import / refresh, or --force to start over`);
  const { sap, problems } = await read(answers.objects || {}, {}, answers.fields || {});
  const objects = {};
  for (const side of ['source', 'target']) if (answers.objects?.[side]?.object) objects[side] = { ...answers.objects[side], object: answers.objects[side].object.toUpperCase(), kind: sap[side]?.kind || answers.objects[side].kind || '' };
  const model = newModel({ ...answers, lang, sap, objects, system: systemName() });
  return { ...writeVersion(root, model), problems };
}

export function cmdBuild(root, ifId, lang) {
  const dir = join(root, safeId(ifId));
  const langs = lang ? [lang] : languagesOf(dir, ifId);
  if (!langs.length) throw new Error(`no specification for ${ifId} in ${dir}`);
  return langs.map((l) => {
    const v = versionsOf(dir, ifId, l).pop();
    return writeVersion(root, readJson(file(dir, ifId, v, l, 'json')));
  });
}

export async function cmdImport(root, htmlPath, { force = false, resolve: res = sapResolve, noResolve = false } = {}) {
  const m = modelFromPage(readFileSync(htmlPath, 'utf8'));
  if (!m?.ifId || !m.version) throw new Error(`${htmlPath} is not a page of interface-mapping-spec`);
  // Names, version and language end up in file names: accept only what this tool writes.
  if (safeId(m.ifId) !== m.ifId || !/^\d+\.\d+$/.test(m.version) || !/^[a-z]{2}$/.test(m.lang || '') || (m.baseVersion && !/^\d+\.\d+$/.test(m.baseVersion))) {
    throw new Error(`${htmlPath}: interface ID, version or language is not valid — the page was changed outside edit mode`);
  }
  if (m.companionOf) throw new Error(`${htmlPath} is the ${m.lang} companion — edits go into the ${m.companionOf} page; the companion is rebuilt from it`);
  const dir = join(root, safeId(m.ifId));
  const vs = versionsOf(dir, m.ifId, m.lang);
  if (!vs.length) throw new Error(`no specification for ${m.ifId} (${m.lang}) in ${dir} — wrong project or profile?`);
  const latest = vs[vs.length - 1];
  if (vs.includes(m.version) && !force) throw new Error(`version ${m.version} already exists — this page was imported before`);
  if (m.baseVersion && m.baseVersion !== latest && !force) throw new Error(`the page was edited from v${m.baseVersion}, but v${latest} is newer — merge by hand or use --force`);
  delete m.baseVersion;
  // Rows kept together per group (a row without a known group joins the first).
  for (const [bk, pre] of [['request', 'A'], ['response', 'B']]) if (m[bk]?.groups?.length) { orderRows(m[bk]); renumber(m[bk].rows, pre); }
  const filled = noResolve ? { resolved: 0, problems: [] } : await fillRefs(m, res);
  return { ...writeVersion(root, m), from: latest, ...filled };
}

export async function cmdRefresh(root, ifId, { lang = '', lines = {}, read = sapRead } = {}) {
  const dir = join(root, safeId(ifId));
  const l = lang || primaryLang(dir, ifId);
  const v = versionsOf(dir, ifId, l).pop();
  if (!v) throw new Error(`no specification for ${ifId} in ${dir}`);
  const m = readJson(file(dir, ifId, v, l, 'json'));
  const objects = { source: m.sap?.source, target: m.sap?.target };
  // A new interface built from a field list has no SAP object: its SAP fields are read again one by one.
  const fields = {};
  for (const [side, sd] of [['source', 's'], ['target', 't']]) {
    if (objects[side]?.object || !(m.sap?.side === side || m.sap?.side === 'both')) continue;
    fields[side] = (m.request.rows || []).filter((r) => r[sd]?.field && r[sd].ddic).map((r) => (r[sd].table ? `${r[sd].table}-${r[sd].field}` : r[sd].field));
  }
  if (!['source', 'target'].some((s) => objects[s]?.object || fields[s]?.length)) throw new Error(`${ifId} has no SAP object and no SAP field read from DDIC yet — nothing to refresh (use resolve for hand-typed fields)`);
  const { sap, problems } = await read(objects, lines, fields);
  if (!Object.keys(sap).length) throw new Error(`SAP objects could not be read: ${problems.join('; ') || 'no answer from SAP'}`);
  // Line types given with --line are kept, so later refreshes resolve them too.
  for (const side of ['source', 'target']) if (m.sap?.[side]?.object && Object.keys(lines).length) m.sap[side].lines = { ...(m.sap[side].lines || {}), ...lines };
  for (const side of Object.keys(fields)) if (sap[side]) sap[side].response = null;
  const counts = refreshModel(m, sap);
  if (!counts.added && !counts.changed && !counts.removed) return { unchanged: true, version: v, counts, problems };
  m.version = nextVersion(v);
  m.sap.readAt = new Date().toISOString();
  const text = l === 'ko' ? `SAP 구조 재동기화: 추가 ${counts.added}, 변경 ${counts.changed}, 삭제 ${counts.removed}` : `SAP structure refreshed: added ${counts.added}, changed ${counts.changed}, removed ${counts.removed}`;
  m.revisions.push({ seq: m.revisions.length + 1, version: m.version, date: today(), text, author: 'sc4sap', approver: '' });
  return { ...writeVersion(root, m), counts, problems };
}

/** SAP fields typed by hand (TABLE-FIELD / data element) filled from DDIC. */
async function fillRefs(m, res) {
  const refs = pendingRefs(m);
  if (!refs.length) return { resolved: 0, problems: [] };
  const r = await res(refs);
  return { resolved: resolveModel(m, r.rows), problems: r.problems };
}

/** Fill hand-typed SAP fields of the latest version in place (no new version: only DDIC facts change). */
export async function cmdResolve(root, ifId, { resolve: res = sapResolve } = {}) {
  const dir = join(root, safeId(ifId));
  const l = primaryLang(dir, ifId);
  const v = versionsOf(dir, ifId, l).pop();
  if (!v) throw new Error(`no specification for ${ifId} in ${dir}`);
  const m = readJson(file(dir, ifId, v, l, 'json'));
  const filled = await fillRefs(m, res);
  return { ...writeVersion(root, m), ...filled };
}

/**
 * Next interface ID from project.json → idPattern, e.g. "{module}{seq:5}" (CO00181) or "IF-{seq:4}".
 * Existing interface folders are scanned for the highest number.
 */
export function cmdNextId(root, module = '') {
  const project = readJson(join(root, 'project.json'), {});
  const pattern = project.idPattern;
  if (!pattern) throw new Error('project.json has no idPattern (e.g. "{module}{seq:5}") — ask for the ID or set the pattern');
  const mod = String(module || '').toUpperCase();
  const width = Number((/\{seq:(\d+)\}/.exec(pattern) || [])[1] || 4);
  const esc = (x) => x.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  // Literal parts as the folder names spell them (characters outside A-Z 0-9 _ . - become _).
  const parts = pattern.split(/(\{module\}|\{seq(?::\d+)?\})/).filter((p) => p !== '').map((p) => (/^\{(module|seq)/.test(p) ? p : p.replace(/[^A-Za-z0-9_.-]/g, '_')));
  const re = new RegExp('^' + parts.map((p) => (p === '{module}' ? esc(mod) : /^\{seq/.test(p) ? '(\\d+)' : esc(p))).join('') + '$', 'i');
  let max = 0;
  if (existsSync(root)) for (const d of readdirSync(root)) { const m = re.exec(d); if (m) max = Math.max(max, Number(m[1])); }
  const ifId = parts.map((p) => (p === '{module}' ? mod : /^\{seq/.test(p) ? String(max + 1).padStart(width, '0') : p)).join('');
  return { ifId, pattern, last: max };
}

/** SAP-side fields of the latest version, ready to hand to /sc4sap:create-object for a Z structure. */
export function cmdFields(root, ifId) {
  const dir = join(root, safeId(ifId));
  const l = primaryLang(dir, ifId);
  const m = readJson(file(dir, ifId, versionsOf(dir, ifId, l).pop(), l, 'json'));
  const sides = m.sap?.side === 'both' ? ['s', 't'] : [m.sap?.side === 'target' ? 't' : 's'];
  // One entry per carrier (parameter set / structure / table) with its SAP-side fields.
  const list = (bk) => (m[bk]?.groups || []).flatMap((g) => sides.map((sd) => {
    const fields = (m[bk].rows || []).filter((r) => r.g === g.id && r.sync !== 'removed').map((r) => r[sd]).filter((c) => c?.field && c.ddic).map((c) => {
      const [typeLen, dataElement = ''] = String(c.ddic).split(' · ');
      const [ddicType, length = ''] = typeLen.split(' ');
      return { field: c.field, dataElement, ddicType, length, key: c.key, desc: c.desc, from: c.table || '' };
    });
    return { carrier: g[sd]?.name || '', kind: g[sd]?.kind || '', occurrence: g[sd]?.card || '', ...(g[sd]?.ddic ? { ddic: g[sd].ddic } : {}), fields };
  })).filter((x) => x.fields.length);
  return { ifId: m.ifId, version: m.version, request: list('request'), response: list('response'), unresolved: pendingRefs(m) };
}

/** Texts to translate for the companion; texts translated for an earlier version are reused. */
export function cmdTexts(root, ifId, to) {
  const dir = join(root, safeId(ifId));
  const from = primaryLang(dir, ifId);
  if (!from || from === to) throw new Error(`no specification for ${ifId} in another language than ${to}`);
  const v = versionsOf(dir, ifId, from).pop();
  const m = readJson(file(dir, ifId, v, from, 'json'));
  const src = textsOf(m);
  const i18n = join(dir, '_i18n');
  ensureDirSync(i18n);
  const known = new Map();
  for (const pv of versionsOf(dir, ifId, to)) {
    const a = readJson(join(i18n, `${pv}-src.json`), {});
    const b = textsOf(readJson(file(dir, ifId, pv, to, 'json'), {}));
    for (const [p, t] of Object.entries(a)) if (b[p]) known.set(t, b[p]);
  }
  const todo = {};
  const reuse = {};
  // A Korean document's texts without Hangul (SAP's English field texts, codes) need no translation.
  const asIs = (t) => from === 'ko' && to === 'en' && !/[ㄱ-ㆎ가-힣]/.test(t);
  // Proposed rules and the first revision line have their wording in both languages already.
  const fixed = (p, t) => {
    const r = /^rules\.(\d+)\.text$/.exec(p) && m.rules[Number(p.split('.')[1])];
    if (r?.kind && t === ruleText(r.kind, from)) return ruleText(r.kind, to);
    if (p === 'revisions.0.text' && t === FIRST[from]) return FIRST[to];
    return null;
  };
  for (const [p, t] of Object.entries(src)) {
    const f = fixed(p, t);
    if (f) reuse[p] = f; else if (known.has(t)) reuse[p] = known.get(t); else if (asIs(t)) reuse[p] = t; else todo[p] = t;
  }
  writeJson(join(i18n, `${v}-src.json`), src);
  writeJson(join(i18n, `${v}-reuse-${to}.json`), reuse);
  const todoFile = join(i18n, `${v}-todo-${to}.json`);
  writeJson(todoFile, todo);
  return { version: v, from, to, todo: Object.keys(todo).length, reused: Object.keys(reuse).length, todoFile, outFile: join(i18n, `${v}-${to}.json`) };
}

export function cmdCompanion(root, ifId, to, textsPath) {
  const dir = join(root, safeId(ifId));
  const from = primaryLang(dir, ifId);
  if (!from || from === to) throw new Error(`no specification for ${ifId} in another language than ${to}`);
  const v = versionsOf(dir, ifId, from).pop();
  const m = readJson(file(dir, ifId, v, from, 'json'));
  const i18n = join(dir, '_i18n');
  const texts = { ...readJson(join(i18n, `${v}-reuse-${to}.json`), {}), ...readJson(textsPath || join(i18n, `${v}-${to}.json`), {}) };
  const missing = Object.keys(textsOf(m)).filter((p) => !(p in texts));
  const c = withTexts(m, to, texts);
  const out = writeVersion(root, c);
  const primary = writeVersion(root, m);
  return { ...out, primary: primary.html, missing };
}

function args(argv) {
  const o = { _: [], lines: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--line') { const [k, v] = String(argv[++i] || '').split('='); if (k && v) o.lines[k.toUpperCase()] = v.toUpperCase(); }
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const [cmd, arg] = o._;
  const root = resolve(o.dir || join(resolveArtifactBase(process.cwd()), 'interfaces'));
  let out;
  if (cmd === 'init') out = await cmdInit(root, readJson(resolve(o.answers)) || {}, { force: o.force });
  else if (cmd === 'build') out = cmdBuild(root, o.if, o.lang);
  else if (cmd === 'import') out = await cmdImport(root, resolve(arg || o.file), { force: o.force, noResolve: o['no-resolve'] === 'true' });
  else if (cmd === 'resolve') out = await cmdResolve(root, o.if);
  else if (cmd === 'refresh') out = await cmdRefresh(root, o.if, { lang: o.lang, lines: o.lines });
  else if (cmd === 'next-id') out = cmdNextId(root, o.module);
  else if (cmd === 'fields') out = cmdFields(root, o.if);
  else if (cmd === 'texts') out = cmdTexts(root, o.if, o.to || 'en');
  else if (cmd === 'companion') out = cmdCompanion(root, o.if, o.to || 'en', o.texts && resolve(o.texts));
  else throw new Error('usage: build-if-spec.mjs init|build|import|resolve|refresh|next-id|fields|texts|companion … (see the header of this file)');
  console.log(JSON.stringify({ ok: true, root, ...(Array.isArray(out) ? { pages: out } : out) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) })); process.exit(1); });
}
