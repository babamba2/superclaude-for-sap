// sc4sap:project-dashboard — build, import, refresh and the portfolio of project dashboards.
//
// Files, per project, under <artifactBase>/projects/<CODE>/:
//   <CODE>-project.json            the model (source of the page; edits come back into it)
//   <CODE>-project.en.json         the English companion model (built from texts translated in _i18n/)
//   <CODE>-<lang>.history.json     revision history
//   <CODE>-dashboard-v<ver>-<lang>.html   the editable page;  _src/<CODE>-v<ver>-<lang>.json  the model of that version
// and <artifactBase>/projects/portfolio-<lang>.html — every project on one page, with people across projects.
//
// CLI (prints one JSON line):
//   node build-project-doc.mjs init --answers <answers.json> [--force]      template → model v1.0 (answers.wricef → add-wricef)
//   node build-project-doc.mjs build --project <CODE> [--same-version | --major] [--note "<text>"]
//   node build-project-doc.mjs refresh --project <CODE>                       read SAP actuals, rebuild the same version
//   node build-project-doc.mjs import <edited.html>                           page saved in edit mode → model + history, rebuild
//   node build-project-doc.mjs add-wricef --project <CODE> --file <items.json>
//   node build-project-doc.mjs reassign --project <CODE> --from <id> --to <id> [--side F|D]
//   node build-project-doc.mjs texts --project <CODE>                         Korean texts to translate → _i18n/texts.json
//   node build-project-doc.mjs companion --project <CODE> [--texts <translated.json>]   English model + page (same version)
//   node build-project-doc.mjs portfolio [--lang ko]
//   node build-project-doc.mjs check --project <CODE>
//   common: [--dir <projects folder>] (default <artifactBase>/projects)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { jsonTexts, jsonApply } from '../lib/humanize.mjs';
import { checkModel, normalizeModel, viewModel, withSnapshot, reassign, isActive, iso, arr } from './project-model.mjs';
import { instantiate, addWricef } from './project-template.mjs';
import { renderPage } from './project-page.mjs';
import { esc, labelsFor } from './project-render.mjs';

const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`, 'utf8');
const CODE_RE = /^[A-Za-z0-9_-]{1,30}$/;

export const projectsDir = (dir, cwd = process.cwd()) => resolve(dir || join(resolveArtifactBase(cwd), 'projects'));
const files = (root, code, lang = 'ko') => {
  const d = join(root, code);
  return { dir: d, model: join(d, `${code}-project.json`), en: join(d, `${code}-project.en.json`), history: join(d, `${code}-${lang}.history.json`),
    page: (v, l = lang) => join(d, `${code}-dashboard-v${v}-${l}.html`), src: (v, l = lang) => join(d, '_src', `${code}-v${v}-${l}.json`), i18n: join(d, '_i18n') };
};

export function nextVersion(history, { sameVersion = false, major = false } = {}) {
  const last = arr(history?.versions).at(-1)?.version;
  if (!last) return '1.0';
  if (sameVersion) return last;
  const [ma, mi] = String(last).split('.').map(n => Number(n) || 0);
  return major ? `${ma + 1}.0` : `${ma}.${mi + 1}`;
}

/** Builds the page of one model file. Adds today's snapshot (progress + auto KPIs) to the model. */
export function buildProject({ modelPath, root, sameVersion = false, major = false, asVersion = '', note = '', today = iso(Date.now()) }) {
  let model = normalizeModel(readJson(modelPath));
  const { errors, warnings } = checkModel(model);
  if (errors.length) throw new Error(`model has ${errors.length} error(s):\n  · ${errors.join('\n  · ')}`);
  const lang = model.lang || 'ko', code = model.project.code;
  const f = files(root, code, lang);
  mkdirSync(join(f.dir, '_src'), { recursive: true });
  model = withSnapshot(model, today);
  if (lang === 'ko' || !asVersion) writeJson(modelPath, model);
  const history = readJson(f.history, { project: code, lang, versions: [] });
  const version = asVersion || nextVersion(history, { sameVersion, major });
  const versions = arr(history.versions);
  const last = versions.at(-1);
  const entry = last?.version === version && last.source === 'edit' ? last : { version, date: today, author: model.author || '', note: note || model.changeNote || '' };
  if (last?.version === version) versions[versions.length - 1] = { ...last, ...entry };
  else versions.push(entry);
  history.versions = versions;
  const other = lang === 'en' ? 'ko' : 'en';
  const companion = existsSync(f.page(version, other)) || (lang === 'ko' && existsSync(f.en)) ? `${code}-dashboard-v${version}-${other}.html` : '';
  writeFileSync(f.page(version, lang), renderPage(model, { version, date: entry.date, history: versions, today, companion }), 'utf8');
  writeJson(f.src(version, lang), model);
  writeJson(f.history, history);
  return { html: f.page(version, lang), model: modelPath, version, warnings };
}

export function cmdInit({ answers, root, force = false }) {
  const a = readJson(answers);
  if (!CODE_RE.test(a.code || '')) throw new Error('answers.code must be 1–30 letters, digits, _ or -');
  const f = files(root, a.code, a.lang || 'ko');
  if (existsSync(f.model) && !force) throw new Error(`${f.model} exists — use build, or --force to start over`);
  mkdirSync(f.dir, { recursive: true });
  let model = instantiate(a);
  let wr = { added: [], skipped: [] };
  if (arr(a.wricef).length) { wr = addWricef(model, a.wricef); model = wr.model; }
  model.changeNote = model.changeNote || (model.lang === 'en' ? 'Created from the template' : '템플릿으로 생성');
  model.author = a.author || arr(a.team).find(t => t.role === 'pm')?.name || '';
  writeJson(f.model, model);
  const r = buildProject({ modelPath: f.model, root });
  return { ...r, wricef: wr.added.length, skipped: wr.skipped };
}

/** Model saved from the page's edit mode → model file + history entries (source: 'edit'), rebuilt as that version. */
export function cmdImport({ html, root }) {
  const text = readFileSync(html, 'utf8');
  const mm = /<script type="application\/json" id="project-model">([\s\S]*?)<\/script>/.exec(text);
  if (!mm) throw new Error(`${html} has no embedded project model — was it saved from the page's edit mode?`);
  const { model, version, history = [] } = JSON.parse(mm[1]);
  const lang = model.lang || 'ko', code = model.project?.code;
  if (!CODE_RE.test(code || '')) throw new Error('embedded model has no valid project.code');
  const f = files(root, code, lang);
  const h = readJson(f.history, { project: code, lang, versions: [] });
  const known = new Set(arr(h.versions).map(v => v.version));
  const vk = (v) => String(v).split('.').map(n => Number(n) || 0);
  const after = (a, b) => { const [x, y] = [vk(a), vk(b)]; return x[0] - y[0] || x[1] - y[1]; };
  const added = arr(history).filter(v => after(v.version, version) > 0 && !known.has(v.version));
  if (!added.length) throw new Error('the page has no new revision after the version it was built as (already imported?)');
  const target = lang === 'en' ? f.en : f.model;
  if (existsSync(target)) writeFileSync(`${target}.bak`, readFileSync(target));
  writeJson(target, model);
  h.versions = [...arr(h.versions), ...added.map(v => ({ ...v, source: 'edit' }))].sort((a, b) => after(a.version, b.version));
  writeJson(f.history, h);
  const r = buildProject({ modelPath: target, root, sameVersion: true });
  return { ...r, fromVersion: version, added: added.map(v => v.version) };
}

export async function cmdRefresh({ code, root }) {
  const f = files(root, code);
  const model = readJson(f.model);
  if (!model) throw new Error(`no model for ${code}`);
  const { collectActuals } = await import('./sap-actuals.mjs');
  model.actuals = await collectActuals(model);
  writeJson(f.model, model);
  const r = buildProject({ modelPath: f.model, root, sameVersion: true });
  return { ...r, transports: model.actuals.transports.length, objects: model.actuals.objects, inactive: model.actuals.inactive.length, errors: model.actuals.errors };
}

// Keys that are never translated: ids, codes, people, enums, dates.
const NO_TR = ['parent', 'owner', 'fnOwner', 'devOwner', 'ws', 'status', 'stage', 'name', 'sapUser', 'role', 'module', 'approver', 'dir', 'unit', 'group', 'system', 'pm', 'pmo', 'sponsor', 'author', 'actuals', 'snapshots', 'history', 'company'];

export function cmdTexts({ code, root }) {
  const f = files(root, code);
  const t = jsonTexts([readJson(f.model)], NO_TR, 1);
  const prev = readJson(join(f.i18n, 'texts.en.json'), { items: [] }), prevSrc = readJson(join(f.i18n, 'texts.json'), { items: [] });
  const done = new Map(prevSrc.items.map(x => [x.text, prev.items.find(y => y.i === x.i)?.text]).filter(([, e]) => e));
  mkdirSync(f.i18n, { recursive: true });
  const todo = { from: 'ko', to: 'en', items: t.items.filter(x => !done.has(x.text)) };
  writeJson(join(f.i18n, 'todo.json'), todo);
  return { outFile: join(f.i18n, 'todo.en.json'), todo: todo.items.length, reused: t.items.length - todo.items.length, file: join(f.i18n, 'todo.json') };
}

export function cmdCompanion({ code, root, texts }) {
  const f = files(root, code);
  const model = readJson(f.model);
  const t = jsonTexts([model], NO_TR, 1);
  const known = new Map();
  for (const [src, tr] of [[join(f.i18n, 'texts.json'), join(f.i18n, 'texts.en.json')], [join(f.i18n, 'todo.json'), texts || join(f.i18n, 'todo.en.json')]]) {
    const s = readJson(src, { items: [] }), e = readJson(tr, { items: [] });
    const byI = new Map(arr(e.items).map(x => [x.i, x.text]));
    for (const x of arr(s.items)) if (byI.get(x.i)) known.set(x.text, byI.get(x.i));
  }
  const items = t.items.map(x => ({ i: x.i, text: known.get(x.text) }));
  const missing = items.filter(x => !x.text).map(x => t.items.find(y => y.i === x.i).text);
  const { docs } = jsonApply([model], t, { items: items.filter(x => x.text) });
  const en = { ...docs[0], lang: 'en' };
  writeJson(f.en, en);
  // keep the merged pairs as the reusable memory for the next run
  writeJson(join(f.i18n, 'texts.json'), { from: 'ko', items: t.items });
  writeJson(join(f.i18n, 'texts.en.json'), { items: items.filter(x => x.text) });
  const version = arr(readJson(f.history, { versions: [] }).versions).at(-1)?.version || '1.0';
  const r = buildProject({ modelPath: f.en, root, asVersion: version });
  return { ...r, missing };
}

/** Every project of the folder on one page: status, progress, next milestone, KPIs to watch; people across projects. */
export function cmdPortfolio({ root, lang = 'ko', today = iso(Date.now()) }) {
  const L = labelsFor(lang);
  const P = PORT[lang] || PORT.en;
  const codes = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name) : [];
  const views = [];
  for (const c of codes) {
    const f = files(root, c, lang);
    const m = readJson(lang === 'en' && existsSync(f.en) ? f.en : f.model);
    if (!m?.project) continue;
    const h = readJson(files(root, c, m.lang).history, { versions: [] });
    const ver = arr(h.versions).at(-1)?.version || '';
    views.push({ v: viewModel(m, today), ver, page: ver ? `${c}/${c}-dashboard-v${ver}-${m.lang}.html` : '' });
  }
  views.sort((a, b) => ({ red: 0, amber: 1, green: 2 }[a.v.overall] - { red: 0, amber: 1, green: 2 }[b.v.overall]) || (a.v.m.project.goLive < b.v.m.project.goLive ? -1 : 1));
  const chip = (r) => `<span class="rag rag-${r}">${esc(L.rag[r])}</span>`;
  const rows = views.map(({ v, ver, page }) => {
    const p = v.m.project, next = v.upcoming[0];
    const watch = v.kpis.filter(k => k.rag === 'red' || k.rag === 'amber').length;
    return `<tr><td>${chip(v.overall)}</td><td>${page ? `<a href="${esc(page)}">${esc(p.code)}</a>` : esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(P.type[p.type] || p.type)}</td>
<td>${esc(arr(p.modules).join(', '))}</td><td>${esc(name(v, p.pm) || p.pm || v.m.team.find(t => t.role === 'pm' && isActive(t, today))?.name || '')}</td><td>${esc(p.goLive)}</td><td class="num">${v.progress.actual}% / ${v.progress.planned}%</td>
<td>${next ? `${esc(next.label)} · ${esc(next.date)} ${chip(next.rag)}` : ''}</td><td class="num">${v.late.length || ''}</td><td class="num">${v.wricef.done}/${v.wricef.total}</td>
<td class="num">${v.handoff.toDev.length + v.handoff.toFn.length || ''}</td><td class="num">${v.orphans.length || ''}</td><td class="num">${watch || ''}</td><td>${esc(ver)}</td></tr>`;
  }).join('');
  // People across projects: the same person by SAP user (else by name), active and with open items in two or more.
  const people = new Map();
  for (const { v } of views) for (const t of v.m.team) {
    if (!isActive(t, today)) continue;
    const key = (t.sapUser || t.name || t.id).toUpperCase();
    const open = v.rows.filter(r => r.leaf && r.status !== 'done' && [r.owner, r.fnOwner, r.devOwner].includes(t.id));
    const x = people.get(key) || { name: t.name, sapUser: t.sapUser || '', roles: new Set(), projects: [] };
    x.roles.add(L.role[t.role] || t.role);
    x.projects.push({ code: v.m.project.code, open: open.length, late: open.filter(r => r.rag === 'red').length });
    people.set(key, x);
  }
  const multi = [...people.values()].filter(x => x.projects.length > 1).sort((a, b) => b.projects.length - a.projects.length);
  const prow = multi.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.sapUser)}</td><td>${esc([...x.roles].join(', '))}</td>
<td>${x.projects.map(p => `${esc(p.code)} <small>(${p.open}${p.late ? `, <span class="bad">${p.late}</span>` : ''})</small>`).join(' · ')}</td>
<td class="num">${x.projects.reduce((s, p) => s + p.open, 0)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(P.title)}</title>
<style>${PORT_STYLE}</style></head><body><header><h1>${esc(P.title)}</h1><p class="muted">${esc(today)} · ${views.length} ${esc(P.projects)}</p></header><main>
<div class="tw"><table><thead><tr>${P.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="15" class="muted">${esc(L.none)}</td></tr>`}</tbody></table></div>
<h2>${esc(P.people)}</h2><p class="muted">${esc(P.peopleHint)}</p>
<div class="tw"><table><thead><tr>${P.pcols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${prow || `<tr><td colspan="5" class="muted">${esc(L.none)}</td></tr>`}</tbody></table></div>
</main></body></html>`;
  const out = join(root, `portfolio-${lang}.html`);
  mkdirSync(root, { recursive: true });
  writeFileSync(out, html, 'utf8');
  return { html: out, projects: views.length, sharedPeople: multi.length };
}
const name = (v, id) => v.m.team.find(t => t.id === id)?.name;
const PORT = {
  ko: { title: 'SAP 프로젝트 포트폴리오', projects: '개 프로젝트', type: { implementation: '신규 구축', conversion: 'S/4 전환', rollout: '롤아웃', ams: '운영·개선', task: '과제' },
    cols: ['상태', '코드', '프로젝트', '유형', '모듈', 'PM', 'Go-Live', '진척 (실적/계획)', '다음 마일스톤', '지연', 'WRICEF', '인계 대기', '담당 공백', '주의 KPI', '버전'],
    people: '여러 프로젝트에 투입된 사람', peopleHint: 'SAP ID(없으면 이름)가 같은 사람. 괄호 = 진행 중 작업 수, 빨간 숫자 = 그중 지연.', pcols: ['이름', 'SAP ID', '역할', '프로젝트 (진행 작업)', '진행 작업 합계'] },
  en: { title: 'SAP project portfolio', projects: 'projects', type: { implementation: 'Implementation', conversion: 'S/4 conversion', rollout: 'Rollout', ams: 'AMS', task: 'Small project' },
    cols: ['Status', 'Code', 'Project', 'Type', 'Modules', 'PM', 'Go-live', 'Progress (actual / plan)', 'Next milestone', 'Late', 'WRICEF', 'Hand-offs', 'No owner', 'KPIs to watch', 'Version'],
    people: 'People on several projects', peopleHint: 'Same SAP user (else name). In brackets: open items; red: late among them.', pcols: ['Name', 'SAP user', 'Roles', 'Projects (open items)', 'Open items total'] },
};
const PORT_STYLE = `:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--red:#c62828;--amber:#b26a00;--green:#2e7d32;--red-bg:#fdecea;--amber-bg:#fff4e0;--green-bg:#e8f5e9;color-scheme:light}
@media (prefers-color-scheme: dark){:root{--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}header,main{max-width:1600px;margin:0 auto;padding:12px 16px}h1{font-size:24px;margin:8px 0 0}h2{font-size:18px;margin:28px 0 4px}
a{color:#0b62c4}.muted,small{color:var(--muted)}.bad{color:var(--red);font-weight:600}.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left}th{background:var(--head);white-space:nowrap}.num{text-align:right}
.rag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600}.rag-red{background:var(--red-bg);color:var(--red)}.rag-amber{background:var(--amber-bg);color:var(--amber)}.rag-green{background:var(--green-bg);color:var(--green)}`;

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...args] = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const root = projectsDir(get('--dir'));
  const code = get('--project');
  const need = () => { if (!CODE_RE.test(code || '')) throw new Error('--project <CODE> is required'); return code; };
  (async () => {
    let r;
    if (cmd === 'init') r = cmdInit({ answers: resolve(get('--answers')), root, force: args.includes('--force') });
    else if (cmd === 'build') r = buildProject({ modelPath: files(root, need()).model, root, sameVersion: args.includes('--same-version'), major: args.includes('--major'), note: get('--note') || '' });
    else if (cmd === 'refresh') r = await cmdRefresh({ code: need(), root });
    else if (cmd === 'import') r = cmdImport({ html: resolve(args[0]), root });
    else if (cmd === 'add-wricef') {
      const f = files(root, need()); const res = addWricef(readJson(f.model), readJson(resolve(get('--file'))));
      writeJson(f.model, res.model); r = { ...buildProject({ modelPath: f.model, root, note: `WRICEF +${res.added.length}` }), added: res.added, skipped: res.skipped };
    } else if (cmd === 'reassign') {
      const f = files(root, need()); const res = reassign(readJson(f.model), get('--from'), get('--to'), { side: get('--side') || '' });
      writeJson(f.model, res.model); r = { ...buildProject({ modelPath: f.model, root, note: `${get('--from')} → ${get('--to')} (${res.moved.length})` }), moved: res.moved };
    } else if (cmd === 'texts') r = cmdTexts({ code: need(), root });
    else if (cmd === 'companion') r = cmdCompanion({ code: need(), root, texts: get('--texts') ? resolve(get('--texts')) : undefined });
    else if (cmd === 'portfolio') r = cmdPortfolio({ root, lang: get('--lang') || 'ko' });
    else if (cmd === 'check') r = checkModel(normalizeModel(readJson(files(root, need()).model)));
    else { console.error('Usage: node build-project-doc.mjs init|build|refresh|import|add-wricef|reassign|texts|companion|portfolio|check … (see the header)'); process.exit(2); }
    if (r?.warnings?.length) for (const w of r.warnings) console.error(`⚠ project-dashboard: ${w}`);
    console.log(JSON.stringify({ ...r, warnings: r?.warnings?.length ?? 0 }));
  })().catch((e) => { console.error(`build-project-doc: ${e.message}`); process.exit(1); });
}
