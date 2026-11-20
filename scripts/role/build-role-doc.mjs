// sc4sap:role-matrix — create, read from SAP, build and import role & authorization documents.
//
// Files, per document, under <artifactBase>/roles/<CODE>/:
//   <CODE>-roles.json                       the model (source of the page; edits come back into it)
//   <CODE>-role-matrix-v<ver>-<lang>.html   the editable page;  _src/<CODE>-v<ver>.json  the model of that version
// The version lives in the model (sheet 7 rows): 0.1, 0.2 … for drafts, --major for 1.0.
//
// CLI (prints one JSON line):
//   node build-role-doc.mjs init --code <CODE> [--from <draft.json>] [--project ..] [--system ..] [--module PM] [--author ..] [--lang ko|en|ja] [--force]
//   node build-role-doc.mjs sync --code <CODE> --patterns "Z_PM*,Y_PM*" [--module PM] [--no-users] [--replace]
//   node build-role-doc.mjs sod --code <CODE> --modules PM,MM          add the SoD library rules of those modules
//   node build-role-doc.mjs verify --code <CODE> [--users]              "SAP 반영 확인": the document's roles against SAP (read-only)
//   node build-role-doc.mjs verify-apply --code <CODE> --ids <file.json | all>   SAP's side into the document for those differences
//   node build-role-doc.mjs build --code <CODE> [--same-version | --major] [--note "<text>"]
//   node build-role-doc.mjs import <saved.html>
//   node build-role-doc.mjs check --code <CODE>
//   node build-role-doc.mjs layout --code <CODE> --file <layout.json | none>   company layout on (none = default workbook)
//   node build-role-doc.mjs columns [--lang ko]                         sheets / columns / cover fields a layout can name
//   node build-role-doc.mjs template <form.html | .docx | .xlsx> [--out <dir>] tables, headings, colours, fonts, images of a company form
//   node build-role-doc.mjs import-form <filled.xlsx> --code <CODE> --layout <layout.json> [--project ..] [--force]
//                                                                       the content of a filled-in company workbook → a new document
//   common: [--dir <roles folder>] (default <artifactBase>/roles)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { normalizeModel, deriveView, nextVersion, arr } from './role-model.mjs';
import { renderPage, modelFromPage } from './role-page.mjs';
import { modelFromDraft, addSodRules } from './role-ops.mjs';
import { checkLayout, columnCatalog, loadLayout } from './role-layout.mjs';

/** One text per document language (ko / en / ja). */
const say = (lang, ko, en, ja) => (lang === 'en' ? en : lang === 'ja' ? ja : ko);

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`, 'utf8');
const CODE_RE = /^[A-Za-z0-9_-]{1,30}$/;
const today = () => new Date().toISOString().slice(0, 10);

export const rolesDir = (dir, cwd = process.cwd()) => resolve(dir || join(resolveArtifactBase(cwd), 'roles'));
export const files = (root, code) => {
  const d = join(root, code);
  return { dir: d, model: join(d, `${code}-roles.json`), page: (v, l) => join(d, `${code}-role-matrix-v${v}-${l}.html`), src: (v) => join(d, '_src', `${code}-v${v}.json`) };
};
const lastVer = (m) => String(arr(m.revisions).at(-1)?.ver || '').replace(/^v/i, '');

/** Builds the page. A new version adds a row to sheet 7; --same-version redraws the current one. */
export function buildDoc({ root, code, sameVersion = false, major = false, note = '' }) {
  const f = files(root, code);
  const model = normalizeModel(readJson(f.model));
  const errors = deriveView(model).checks.filter((c) => c.sev === 'err');
  const last = lastVer(model);
  const version = sameVersion && last ? last : nextVersion(last, { major });
  if (version !== last) model.revisions.push({ ver: `v${version}`, date: today(), author: model.doc.author || '', change: note || say(model.lang, '문서 생성', 'Document built', '文書作成'), approver: '', note: '' });
  model.doc.date = model.doc.date && sameVersion ? model.doc.date : today();
  mkdirSync(join(f.dir, '_src'), { recursive: true });
  writeJson(f.model, model);
  writeJson(f.src(version), model);
  const html = f.page(version, model.lang);
  writeFileSync(html, renderPage(model, { version, date: model.doc.date }), 'utf8');
  const v = deriveView(model);
  return { html, model: f.model, version, totals: v.totals, checks: v.checks.length, errors: errors.map((e) => `${e.text} ${e.ref}`) };
}

export function cmdInit({ root, code, from, doc = {}, lang = 'ko', force = false }) {
  const f = files(root, code);
  if (existsSync(f.model) && !force) throw new Error(`${f.model} exists — use build, or --force to start over`);
  const draft = from ? readJson(from) : {};
  const model = modelFromDraft(draft, { ...doc, code }, lang);
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.model, model);
  return buildDoc({ root, code, note: say(lang, '최초 작성', 'First draft', '初版作成') });
}

/**
 * Reads the roles from SAP into the model. Without --replace, what people wrote stays: business-role names / texts,
 * user names and departments, SoD rules, authorization notes; SAP decides roles, T-codes, levels and assignments.
 */
export async function cmdSync({ root, code, patterns, module = '', withUsers = true, replace = false, lang = 'ko', doc = {}, read = null }) {
  const { readRoles, mergeSync } = await import('./sap-roles.mjs');
  const f = files(root, code);
  const old = existsSync(f.model) ? normalizeModel(readJson(f.model)) : normalizeModel({ lang, doc: { code } });
  // `read`: the reader to use (tests hand a fake one); else sap-roles.mjs readRoles on a connection of its own
  const { rows, errors } = await (read || readRoles)({ patterns, withUsers, lang: old.lang });
  if (!arr(rows.define).length) throw new Error(`no roles read — ${errors.join(' | ')}`);
  const model = mergeSync(old, rows, { module, replace, patterns, withUsers, system: process.env.SAP_SID || '', today: today(), doc, code });
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.model, model);
  const r = buildDoc({ root, code, note: say(model.lang, `SAP 역할 읽기 (${patterns.join(', ')})`, `Read from SAP (${patterns.join(', ')})`, `SAP からロールを読み込み (${patterns.join(', ')})`) });
  return { ...r, roles: rows.define.length, readErrors: errors };
}


/**
 * "SAP 반영 확인" (role-verify.mjs): the document's technical roles read from SAP — exactly those, user assignments
 * only with --users — compared with the document; the result is kept on the model (`sapCheck`, cover checks) and
 * the page redrawn in the same version. Nothing is written to SAP.
 */
export async function cmdVerify({ root, code, withUsers = false, read = null }) {
  const { readRoles } = await import('./sap-roles.mjs');
  const { compareRoles, docRoleNames, withCheck } = await import('./role-verify.mjs');
  const f = files(root, code);
  if (!existsSync(f.model)) throw new Error(`${f.model} not found — init or sync first`);
  const model = normalizeModel(readJson(f.model));
  const names = docRoleNames(model);
  if (!names.length) throw new Error('the document lists no technical role');
  const { rows, errors } = await (read || readRoles)({ names, withUsers, lang: model.lang });
  const result = compareRoles(model, rows, { withUsers, today: today() });
  const checked = withCheck(model, result, { date: today(), system: process.env.SAP_SID || '', tier: process.env.SAP_TIER || '', withUsers });
  // the version buildDoc is about to draw (the current one; a document without a version gets its first)
  checked.sapCheck.version = `v${lastVer(checked) || nextVersion('')}`;
  writeJson(f.model, checked);
  const r = buildDoc({ root, code, sameVersion: true });
  return { ...r, counts: result.counts, differences: result.diffs.filter((d) => d.counted).length, reference: result.diffs.filter((d) => !d.counted).length, readErrors: errors };
}

/** The accepted differences of the last check into the document (SAP's side); a new version with a history row. */
export async function cmdVerifyApply({ root, code, ids }) {
  const { applyVerify } = await import('./role-verify.mjs');
  const f = files(root, code);
  const model = normalizeModel(readJson(f.model));
  if (!model.sapCheck) throw new Error('no SAP check on the document — run verify first');
  const want = ids === 'all' ? model.sapCheck.diffs.filter((d) => d.counted).map((d) => d.id) : ids;
  const { model: next, applied, skipped } = applyVerify(model, want);
  // the check stays current: it belongs to the version this apply makes
  next.sapCheck.version = `v${nextVersion(lastVer(next))}`;
  writeJson(f.model, next);
  const c = next.sapCheck;
  const r = buildDoc({ root, code, note: say(next.lang, `SAP 반영 확인 결과 ${applied.length}건 반영 (${c.system || '-'}, ${c.date})`, `${applied.length} differences taken from SAP (${c.system || '-'}, ${c.date})`, `SAP 反映確認の結果 ${applied.length} 件を反映 (${c.system || '-'}, ${c.date})`) });
  return { ...r, applied: applied.length, skipped };
}

/** Adds the library SoD rules of the given modules (skips rules already there by kind). */
export function cmdSod({ root, code, modules }) {
  const f = files(root, code);
  const model = normalizeModel(readJson(f.model));
  const { model: next, added: n } = addSodRules(model, modules, model.lang);
  writeJson(f.model, next);
  return { ...buildDoc({ root, code, sameVersion: true }), added: n };
}

/** Puts a company layout on the document (or takes it off with "none") and redraws the current version. */
export function cmdLayout({ root, code, file }) {
  const f = files(root, code);
  if (!existsSync(f.model)) throw new Error(`${f.model} not found — init or sync first`);
  const model = normalizeModel(readJson(f.model));
  let warnings = [];
  if (!file) throw new Error('--file <layout.json> or --file none is required');
  if (file === 'none') model.layout = null;
  else {
    const layout = loadLayout(file);
    const c = checkLayout(layout);
    if (c.errors.length) throw new Error(`layout ${file}: ${c.errors.join(' | ')}`);
    warnings = c.warnings;
    model.layout = layout;
  }
  writeJson(f.model, model);
  return { ...buildDoc({ root, code, sameVersion: true }), layout: model.layout?.name || (model.layout ? file : 'default'), warnings };
}

/**
 * A filled-in company workbook → a new document in that company's layout (the layout's `form` blocks say where each
 * value sits). An existing document is only replaced with --force (the old model is kept as .bak).
 */
export async function cmdImportForm({ root, code, file, layoutFile, doc = {}, lang = 'ko', force = false }) {
  const f = files(root, code);
  if (existsSync(f.model) && !force) throw new Error(`${f.model} exists — --force replaces it (a .bak copy is kept)`);
  if (!layoutFile) throw new Error('--layout <layout.json> is required: its `form` blocks say where the values sit');
  const layout = loadLayout(layoutFile);
  const c = checkLayout(layout);
  if (c.errors.length) throw new Error(`layout ${layoutFile}: ${c.errors.join(' | ')}`);
  const { importForm } = await import('./import-form.mjs');
  const got = importForm(file, layout, { lang });
  if (!Object.values(got.counts).some(Boolean)) throw new Error(`nothing read from ${file} — ${got.warnings.join(' | ')}`);
  mkdirSync(f.dir, { recursive: true });
  if (existsSync(f.model)) writeFileSync(`${f.model}.bak`, readFileSync(f.model));
  const model = normalizeModel({ ...got.model, lang, layout, doc: { mode: 'new', ...Object.fromEntries(Object.entries(doc).filter(([, x]) => x)), code } });
  model.revisions = [];
  writeJson(f.model, model);
  const name = file.split(/[\\/]/).pop();
  const r = buildDoc({ root, code, note: say(lang, `회사 양식 파일에서 가져옴 (${name})`, `Taken from the company workbook (${name})`, `会社の様式ファイルから取り込み (${name})`) });
  return { ...r, read: got.counts, warnings: [...c.warnings, ...got.warnings] };
}

/** Page saved in edit mode → model, rebuilt as the version it was saved as. */
export function cmdImport({ html, root }) {
  let page;
  try { page = modelFromPage(readFileSync(html, 'utf8')); } catch (e) { throw new Error(`${html}: ${e.message}`); }
  const { model } = page;
  const code = model?.doc?.code;
  if (!CODE_RE.test(code || '')) throw new Error('embedded model has no valid doc.code');
  const f = files(root, code);
  if (existsSync(f.model)) writeFileSync(`${f.model}.bak`, readFileSync(f.model));
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.model, normalizeModel(model));
  return { ...buildDoc({ root, code, sameVersion: true }), imported: html };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...args] = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const root = rolesDir(get('--dir'));
  const code = get('--code');
  const need = () => { if (!CODE_RE.test(code || '')) throw new Error('--code <CODE> is required (letters, digits, _ or -)'); return code; };
  const doc = { project: get('--project'), system: get('--system'), module: get('--module'), author: get('--author'), reviewer: get('--reviewer') };
  (async () => {
    let r;
    if (cmd === 'init') r = cmdInit({ root, code: need(), from: get('--from') ? resolve(get('--from')) : '', doc, lang: get('--lang') || 'ko', force: args.includes('--force') });
    else if (cmd === 'verify') r = await cmdVerify({ root, code: need(), withUsers: args.includes('--users') });
    else if (cmd === 'verify-apply') { const ids = get('--ids'); r = await cmdVerifyApply({ root, code: need(), ids: ids === 'all' ? 'all' : JSON.parse(readFileSync(ids, 'utf8')) }); }
    else if (cmd === 'sync') r = await cmdSync({ root, code: need(), patterns: String(get('--patterns') || 'Z*').split(/[,\s]+/).filter(Boolean), module: get('--module') || '', withUsers: !args.includes('--no-users'), replace: args.includes('--replace'), lang: get('--lang') || 'ko', doc });
    else if (cmd === 'sod') r = cmdSod({ root, code: need(), modules: String(get('--modules') || '').split(/[,\s]+/).filter(Boolean) });
    else if (cmd === 'build') r = buildDoc({ root, code: need(), sameVersion: args.includes('--same-version'), major: args.includes('--major'), note: get('--note') || '' });
    else if (cmd === 'import') r = cmdImport({ html: resolve(args[0]), root });
    else if (cmd === 'layout') r = cmdLayout({ root, code: need(), file: get('--file') === 'none' ? 'none' : get('--file') ? resolve(get('--file')) : '' });
    else if (cmd === 'import-form') r = await cmdImportForm({ root, code: need(), file: resolve(args[0]), layoutFile: get('--layout') ? resolve(get('--layout')) : '', doc, lang: get('--lang') || 'ko', force: args.includes('--force') });
    else if (cmd === 'columns') r = columnCatalog(get('--lang') || 'ko');
    else if (cmd === 'template') r = (await import('./read-template.mjs')).readTemplate(resolve(args[0]), { out: get('--out') ? resolve(get('--out')) : '' });
    else if (cmd === 'check') { const v = deriveView(readJson(files(root, need()).model)); r = { totals: v.totals, checks: v.checks }; }
    else { console.error('Usage: node build-role-doc.mjs init|sync|verify|verify-apply|sod|build|import|import-form|check|layout|columns|template … (see the header)'); process.exit(2); }
    console.log(JSON.stringify(r));
  })().catch((e) => { console.error(`build-role-doc: ${e.message}`); process.exit(1); });
}
