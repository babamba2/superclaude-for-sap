// sc4sap:role-matrix — create, read from SAP, build and import role & authorization documents.
//
// Files, per document, under <artifactBase>/roles/<CODE>/:
//   <CODE>-roles.json                       the model (source of the page; edits come back into it)
//   <CODE>-role-matrix-v<ver>-<lang>.html   the editable page;  _src/<CODE>-v<ver>.json  the model of that version
// The version lives in the model (sheet 7 rows): 0.1, 0.2 … for drafts, --major for 1.0.
//
// CLI (prints one JSON line):
//   node build-role-doc.mjs init --code <CODE> [--from <draft.json>] [--project ..] [--system ..] [--module PM] [--author ..] [--lang ko] [--force]
//   node build-role-doc.mjs sync --code <CODE> --patterns "Z_PM*,Y_PM*" [--module PM] [--no-users] [--replace]
//   node build-role-doc.mjs sod --code <CODE> --modules PM,MM          add the SoD library rules of those modules
//   node build-role-doc.mjs build --code <CODE> [--same-version | --major] [--note "<text>"]
//   node build-role-doc.mjs import <saved.html>
//   node build-role-doc.mjs check --code <CODE>
//   common: [--dir <roles folder>] (default <artifactBase>/roles)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { normalizeModel, deriveView, nextVersion, arr } from './role-model.mjs';
import { renderPage } from './role-page.mjs';

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
  if (version !== last) model.revisions.push({ ver: `v${version}`, date: today(), author: model.doc.author || '', change: note || (model.lang === 'en' ? 'Document built' : '문서 생성'), approver: '', note: '' });
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
  const model = normalizeModel({ ...draft, lang: draft.lang || lang, doc: { mode: 'new', ...(draft.doc || {}), ...Object.fromEntries(Object.entries(doc).filter(([, x]) => x)), code } });
  model.revisions = [];
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.model, model);
  return buildDoc({ root, code, note: lang === 'en' ? 'First draft' : '최초 작성' });
}

/**
 * Reads the roles from SAP into the model. Without --replace, what people wrote stays: business-role names / texts,
 * user names and departments, SoD rules, authorization notes; SAP decides roles, T-codes, levels and assignments.
 */
export async function cmdSync({ root, code, patterns, module = '', withUsers = true, replace = false, lang = 'ko', doc = {} }) {
  const { readRoles, mapRoles } = await import('./sap-roles.mjs');
  const f = files(root, code);
  const old = existsSync(f.model) ? normalizeModel(readJson(f.model)) : normalizeModel({ lang, doc: { code } });
  const { rows, errors } = await readRoles({ patterns, withUsers, lang: old.lang });
  if (!arr(rows.define).length) throw new Error(`no roles read — ${errors.join(' | ')}`);
  const got = mapRoles(rows, { module });
  const keep = (list, key, fresh, fields) => fresh.map((x) => { const o = replace ? null : list.find((y) => y[key] === x[key]); if (!o) return x; for (const k of fields) if (o[k]) x[k] = o[k]; return x; });
  const model = normalizeModel({
    ...old,
    doc: { ...old.doc, ...Object.fromEntries(Object.entries(doc).filter(([, x]) => x)), code, mode: 'sap' },
    broles: keep(old.broles, 'id', got.broles, ['name', 'nameEn', 'desc', 'tasks', 'org', 'note']),
    troles: keep(old.troles, 'id', got.troles, ['owner', 'note', 'status']),
    tcodes: keep(old.tcodes, 'tcode', got.tcodes, ['area', 'note', 'module']),
    users: keep(old.users, 'uid', got.users, ['empNo', 'name', 'dept', 'pos', 'plant', 'note', 'approval']),
    auths: got.auths.map((a) => { const o = replace ? null : old.auths.find((y) => y.trole === a.trole && y.object === a.object && y.field === a.field); return o?.note ? { ...a, note: o.note } : a; }),
    sod: old.sod,
    source: { system: process.env.SAP_SID || '', readAt: today(), patterns, users: withUsers, roles: rows.define.length },
  });
  mkdirSync(f.dir, { recursive: true });
  writeJson(f.model, model);
  const r = buildDoc({ root, code, note: model.lang === 'en' ? `Read from SAP (${patterns.join(', ')})` : `SAP 역할 읽기 (${patterns.join(', ')})` });
  return { ...r, roles: rows.define.length, readErrors: errors };
}

/** Adds the library SoD rules of the given modules (skips rules already there by kind). */
export function cmdSod({ root, code, modules }) {
  const f = files(root, code);
  const model = normalizeModel(readJson(f.model));
  const lib = readJson(join(here, 'sod-library.json')).rules;
  const lang = model.lang === 'en' ? 'en' : 'ko';
  const want = modules.map((m) => m.toUpperCase());
  let n = 0;
  for (const r of lib.filter((x) => want.includes(x.module))) {
    if (model.sod.some((s) => s.kind === r.kind[lang])) continue;
    model.sod.push({ id: `SOD-${String(model.sod.length + 1).padStart(2, '0')}`, a: '', b: '', kind: r.kind[lang], risk: r.risk[lang], level: r.level, mitigation: '', approver: '',
      status: 'open', note: `A: ${r.tcodesA.join(', ')} / B: ${r.tcodesB.join(', ')}`, tcodesA: r.tcodesA, tcodesB: r.tcodesB });
    n++;
  }
  writeJson(f.model, model);
  return { ...buildDoc({ root, code, sameVersion: true }), added: n };
}

/** Page saved in edit mode → model, rebuilt as the version it was saved as. */
export function cmdImport({ html, root }) {
  const text = readFileSync(html, 'utf8');
  const mm = /<script type="application\/json" id="role-model">([\s\S]*?)<\/script>/.exec(text);
  if (!mm) throw new Error(`${html} has no embedded role model — was it saved from the page?`);
  const { model } = JSON.parse(mm[1]);
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
    else if (cmd === 'sync') r = await cmdSync({ root, code: need(), patterns: String(get('--patterns') || 'Z*').split(/[,\s]+/).filter(Boolean), module: get('--module') || '', withUsers: !args.includes('--no-users'), replace: args.includes('--replace'), lang: get('--lang') || 'ko', doc });
    else if (cmd === 'sod') r = cmdSod({ root, code: need(), modules: String(get('--modules') || '').split(/[,\s]+/).filter(Boolean) });
    else if (cmd === 'build') r = buildDoc({ root, code: need(), sameVersion: args.includes('--same-version'), major: args.includes('--major'), note: get('--note') || '' });
    else if (cmd === 'import') r = cmdImport({ html: resolve(args[0]), root });
    else if (cmd === 'check') { const v = deriveView(readJson(files(root, need()).model)); r = { totals: v.totals, checks: v.checks }; }
    else { console.error('Usage: node build-role-doc.mjs init|sync|sod|build|import|check … (see the header)'); process.exit(2); }
    console.log(JSON.stringify(r));
  })().catch((e) => { console.error(`build-role-doc: ${e.message}`); process.exit(1); });
}
