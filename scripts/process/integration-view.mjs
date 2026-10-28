// sc4sap:module-to-process — the integration maps seen from one module page.
//
// loadIntegrations({ processesDir, module, lang, pageDir }) reads every <processesDir>/_integration/<A>-<B>/_state that names
// the module: touchpoints (cross-module.mjs), E2E scenarios (language file first), the other modules' models (labels)
// and the latest pages (links). moduleSection() draws the scenarios this module takes part in (its own steps in
// full colour, the other module's greyed) and taskLinks() writes the "before / after" lines of one task sheet.
// stepWhere() is shared with build-integration-doc.mjs: where a scenario step runs.

import fs from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { anchorId } from './process-model.mjs';
import { drawSwimlane } from './swimlane.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ids = (v) => String(v || '').toUpperCase().match(/[A-Z][A-Z0-9_]{2,}/g) || [];

/** Latest page <dir>/<prefix>-v<x.y>-<lang>.html, or ''. */
export function latestPage(dir, prefix, lang) {
  const re = new RegExp(`^${prefix}-v(\\d+)\\.(\\d+)-${lang}\\.html$`);
  if (!fs.existsSync(dir)) return '';
  const hit = fs.readdirSync(dir).map(f => [f, re.exec(f)]).filter(x => x[1]).sort((a, b) => (+a[1][1] - +b[1][1]) || (+a[1][2] - +b[1][2])).pop();
  return hit ? join(dir, hit[0]) : '';
}
const versionOf = (page) => (/-v(\d+\.\d+)-[a-z]{2}\.html$/.exec(page || '') || [])[1] || '';

/**
 * Where a scenario step runs: the program of that task that touches the object handed in or out at this step
 * (reference-graph evidence); if several, the one the step note names; else the programs touching an object the task
 * shares with its neighbours; else the task's TCodes. Only the task's own TCodes / programs when it has any of them.
 */
export function stepWhere(tp, rowOf, steps, i, more = (n) => `+${n}`) {
  const st = steps[i], r = rowOf(st.module, st.code);
  if (st.where) return st.where;
  const progs = tp.programs?.[`${st.module}|${st.code}`] || {};
  const hit = [...new Set([...ids(st.via), ...ids(steps[i - 1]?.via)].map(o => progs[o]).filter(Boolean))];
  const tcs = arr(r?.tcodes), own = new Set([...tcs, ...arr(r?.objects)]);
  const named = [...new Set(ids(st.note).filter(x => own.has(x)))];
  const both = hit.filter(x => named.includes(x));
  const near = [steps[i - 1], steps[i + 1]].filter(Boolean).map(n => tp.programs?.[`${n.module}|${n.code}`] || {});
  const shared = [...new Set(Object.keys(progs).filter(o => near.some(n => n[o])).map(o => progs[o]))];
  const mine = (l) => { const m = l.filter(x => own.has(x)); return m.length ? m : l; };
  const pick = both.length ? both : hit.length ? mine(hit) : named.length ? named : shared.length ? mine(shared) : tcs;
  if (!pick.length) return '';
  return pick.slice(0, 3).join(' / ') + (pick.length > 3 ? ` ${more(pick.length - 3)}` : '');
}

export function loadIntegrations({ processesDir, module, lang = 'ko', pageDir }) {
  const root = join(processesDir, '_integration');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    const st = join(root, name, '_state'), tpf = join(st, 'integration-touchpoints.json');
    if (!fs.existsSync(tpf)) continue;
    const tp = JSON.parse(fs.readFileSync(tpf, 'utf8'));
    if (!arr(tp.modules).includes(module)) continue;
    const sf = [...(lang === 'ko' ? [] : [join(st, `integration-scenarios.${lang}.json`)]), join(st, 'integration-scenarios.json')].find(f => fs.existsSync(f));
    const scen = sf ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
    const models = {}, pages = {};
    for (const m of tp.modules) {
      if (m === module) continue;
      const s = tp.states?.[m]; if (!s) continue;
      const mf = [join(s, lang === 'ko' ? 'process-model.json' : `process-model.${lang}.json`), join(s, 'process-model.json')].find(f => fs.existsSync(f));
      if (mf) models[m] = JSON.parse(fs.readFileSync(mf, 'utf8'));
      pages[m] = latestPage(resolve(s, '..'), `${m}-process`, lang);
    }
    const intPage = latestPage(join(root, name), `${tp.modules.join('-')}-integration`, lang);
    out.push({ name, tp, scen, models, pages, intPage, pageDir });
  }
  return out;
}

function makeRefs(v, m) {
  const rowOf = (mod, code) => (mod === m.module ? m.rows : arr(v.models[mod]?.rows)).find(r => r.code === code);
  const rel = (p) => relative(v.pageDir, p).replace(/\\/g, '/');
  const href = (mod, code) => (mod === m.module ? `#${anchorId(code)}` : v.pages[mod] ? `${rel(v.pages[mod])}#${anchorId(code)}` : '');
  const taskLink = (mod, code) => {
    const r = rowOf(mod, code), h = href(mod, code);
    const txt = `<span class="xmod${mod === m.module ? ' own' : ''}">${esc(mod)}</span> <code>${esc(code)}</code> ${esc(r?.label || '')}`;
    return h ? `<a href="${esc(h)}">${txt}</a>` : txt;
  };
  return { rowOf, rel, href, taskLink };
}

/** Section of the module page: the scenarios of every integration map that has this module. */
export function moduleSection(views, m, T, num) {
  const parts = [];
  for (const v of views) {
    const sc = arr(v.scen?.scenarios).filter(s => arr(s.steps).some(st => st.module === m.module));
    if (!sc.length && !Object.keys(v.tp.stubs || {}).length) continue;
    const { rowOf, rel, href, taskLink } = makeRefs(v, m);
    const others = v.tp.modules.filter(x => x !== m.module);
    const basis = [`${v.tp.modules.join(' ↔ ')} ${T.xMap}${versionOf(v.intPage) ? ` v${versionOf(v.intPage)}` : ''}`,
      ...others.map(o => `${o}${versionOf(v.pages[o]) ? ` v${versionOf(v.pages[o])}` : ''}`)].join(' · ');
    const intLink = v.intPage ? ` <a href="${esc(rel(v.intPage))}">${esc(T.xOpen)}</a>` : '';
    parts.push(`<h3 id="x-${esc(v.name)}">${esc(v.tp.modules.join(' ↔ '))}</h3><p class="lead">${esc(T.xBasis)}: ${esc(basis)}.${intLink}</p>`);
    sc.forEach((s) => {
      const si = arr(v.scen.scenarios).indexOf(s) + 1;
      const nodes = arr(s.steps).map((st, i) => {
        const mine = st.module === m.module, r = rowOf(st.module, st.code);
        return { id: `n${i}`, label: r?.label || st.code, sub: `${i + 1} · ${st.module} ${st.code}`, foot: stepWhere(v.tp, rowOf, s.steps, i, (n) => T.more.replace('{n}', n)),
          lane: st.module, col: i, system: mine ? 'sap' : 'manual', kind: mine ? (r?.kind || 'cbo') : 'manual', href: href(st.module, st.code) || undefined };
      });
      const edges = arr(s.steps).slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
      const svg = drawSwimlane({ lanes: v.tp.modules.map(x => ({ id: x, label: x })), nodes, edges });
      const scLink = v.intPage ? ` <a class="go" href="${esc(rel(v.intPage))}#scen-${si}">${esc(T.xOpen)}</a>` : '';
      parts.push(`<div class="xscen" id="x-${esc(v.name)}-${si}"><h4>${esc(`${si}. ${s.title}`)}${scLink}</h4><p>${esc(s.desc || '')}</p><figure class="flowfig swim">${svg}</figure>`
        + `<div class="tw"><table><thead><tr><th>#</th><th>${esc(T.xTask)}</th><th>${esc(T.where)}</th><th>${esc(T.objects)}</th><th>${esc(T.desc)}</th></tr></thead><tbody>`
        + arr(s.steps).map((st, i) => `<tr${st.module === m.module ? '' : ' class="xother"'}><td>${i + 1}</td><td>${taskLink(st.module, st.code)}</td><td>${stepWhere(v.tp, rowOf, s.steps, i, (n) => T.more.replace('{n}', n)).split(' / ').map(w => `<code>${esc(w)}</code>`).join(' ')}</td><td>${st.via ? `<code>${esc(st.via)}</code>` : ''}</td><td>${esc(st.note || '')}</td></tr>`).join('')
        + `</tbody></table></div>${arr(s.conversion).length ? `<div class="tbd"><strong>${esc(T.conversion)}</strong><ul>${arr(s.conversion).map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}</div>`);
    });
    // touchpoints of this module with modules that have no map yet
    const stubs = {};
    for (const t of arr(v.tp.touchpoints)) if (t.stub && t.from.module === m.module) stubs[t.owner] = (stubs[t.owner] || 0) + 1;
    const st = Object.entries(stubs).sort((a, b) => b[1] - a[1]);
    if (st.length) parts.push(`<p class="lead">${esc(T.xStubs)}: ${st.map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</p>`);
  }
  if (!parts.length) return '';
  return `<section id="xmodule" class="page-break"><h2>${num}. ${esc(T.xScen)}</h2><p class="lead">${esc(T.xLead)}</p>${parts.join('\n')}</section>`;
}

/** The "before / after" lines of one task sheet: every scenario step of this task, plus the key pair notes. */
export function taskLinks(views, m, code, T) {
  const items = [];
  for (const v of views) {
    const { taskLink } = makeRefs(v, m);
    arr(v.scen?.scenarios).forEach((s, si) => arr(s.steps).forEach((st, k) => {
      if (st.module !== m.module || st.code !== code) return;
      const prev = s.steps[k - 1], next = s.steps[k + 1];
      const io = [prev && `← ${taskLink(prev.module, prev.code)}${prev.via ? ` <span class="sub">(${esc(prev.via)})</span>` : ''}`,
        next && `→ ${taskLink(next.module, next.code)}${st.via ? ` <span class="sub">(${esc(st.via)})</span>` : ''}`].filter(Boolean).join('<br>');
      items.push(`<li><a href="#x-${esc(v.name)}-${si + 1}">${esc(T.xStepOf.replace('{n}', si + 1).replace('{k}', k + 1))} · ${esc(s.title)}</a><div>${io}</div></li>`);
    }));
    for (const p of arr(v.scen?.pair_notes)) {
      const [me, other] = p.a.module === m.module && p.a.code === code ? [p.a, p.b] : p.b.module === m.module && p.b.code === code ? [p.b, p.a] : [];
      if (me) items.push(`<li>↔ ${taskLink(other.module, other.code)} — ${esc(p.desc || '')}</li>`);
    }
  }
  return items.length ? `<h4>${esc(T.xLinks)}</h4><ul class="xlinks">${items.join('')}</ul>` : '';
}

export const XSTYLE = `.xmod{display:inline-block;font-size:11px;font-weight:700;border-radius:4px;padding:0 5px;color:#fff;background:#8a5a00}.xmod.own{background:var(--accent);color:var(--accent-ink)}
.xscen{border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}.xscen h4 .go{font-size:13px;font-weight:400;margin-left:8px}
tr.xother td{color:var(--muted)}ul.xlinks{padding-left:18px}ul.xlinks li{margin:4px 0}.sub{color:var(--muted);font-size:12.5px}`;
