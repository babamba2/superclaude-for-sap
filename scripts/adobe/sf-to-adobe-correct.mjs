#!/usr/bin/env node
// sc4sap:smartform-to-adobe — correction spec for SAP's migration (MIGRATE + correction, ZMCP_FP_MIGRATE).
// From the SmartForm's geometry and the XDP that MIGRATE wrote for it, plus an optional calibration (SAP's PDF of the
// SmartForm and SAP's PDF of the migrated form, same invented values), compute layout corrections the helper applies
// to the XDP before it saves the form. No SAP call; reads only what it is given.
//
//   xdpTargets(layoutXdp)                          → { root, protos: Map(id → node), byPath: Map(path → node) }
//   correctionSpec({ content, layoutXdp, source, sfPdf?, afPdf? }) → { version: 1, source, ops, notes }
//
// Rules (v1):
//   R1 MAIN flows top to bottom: the SmartForm's main window prints its nodes one under the other; MIGRATE writes the
//      MAIN subform as lr-tb, and ADS then puts a narrow block next to a wide one (EX15: the table squeezed at x 180 mm).
//      → { op: layout, value: tb } on every flowed subform named MAIN.
//   R2 Window offsets (calibration): for each secondary window, the median dy (dx) between the SmartForm print and the
//      migrated print of the same texts. A shift up of the migrated content (dy < 0) becomes extra top inset on the
//      window subform; a shift down moves the window up by dy (its box moves along — reported in notes when it has a
//      border). Offsets under 0.25 mm are left alone.
//   R3 Dates: a date the SmartForm prints with a 4-digit year where the migrated form prints a 2-digit one → the field's
//      format picture date{MM/DD/YYYY} (the order follows the SmartForm print: DD.MM.YYYY, YYYY.MM.DD, MM/DD/YYYY);
//      a field whose initialize script sets the picture with DateFmt gets datePicture (the script would override it).
//   R6 / R7 hidden-field holders hidden; their embedded fields get the embedding span's font (see the code).
//   R8 A right / center paragraph of embedded values only → embedLead (ADS aligns it only with a blank before it).
//   R9 Row pitch (calibration on a print that has the structural rules): SmartForm pitch − migrated pitch as bottom
//      inset on every table row subform (layout row) that holds embedded values (a static header row keeps its
//      height); only texts inside the SmartForm's MAIN window are measured. R3 leaves Num2Date scripts alone.
//   R10 Block offsets (calibration, same print as R9): static texts (draw <value>, no embeds) found moved anchor their
//      flowed block (a child of MAIN, or a proto root such as a table header leader); per block the median dy becomes
//      top inset, in print order, counting the insets of earlier blocks (an inset moves everything after it).
//
// Targets: { protoId, path? } for page-area windows (their content lives in <proto>), { path } from the root subform
// otherwise; path = names joined by '.', name[n] for the n-th same-name sibling (0-based), as the spec v1 defines.
//
// CLI  node sf-to-adobe-correct.mjs <content.json> <layout.xdp> [--source NAME] [--sf-pdf sf.pdf --af-pdf af.pdf] [--out spec.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readXdp, kids, unit } from './read-adobe.mjs';
import { scoreFidelity } from '../forms-common/score-fidelity.mjs';
import { readPdf } from '../smartform/read-pdf.mjs';

const CONTAINER = new Set(['subform', 'subformSet', 'field', 'draw', 'exclGroup', 'area', 'pageSet', 'pageArea', 'contentArea']);
const mm = (v) => `${Math.round(v * 100) / 100}mm`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** Names and paths of the template: root path nodes and <proto> definitions by id. */
export function xdpTargets(layoutXdp) {
  const { template } = readXdp(layoutXdp);
  const root = kids(template, 'subform')[0];
  const byPath = new Map();
  const protos = new Map();
  const walk = (el, path) => {
    const seen = new Map();
    for (const c of kids(el)) {
      if (c.tag === 'proto') { for (const p of kids(c)) if (p.attrs?.id) protos.set(p.attrs.id, p); continue; }
      if (!CONTAINER.has(c.tag)) continue;
      const name = c.attrs?.name;
      if (!name) { walk(c, path); continue; }
      const n = seen.get(name) || 0;
      seen.set(name, n + 1);
      const p = `${path}.${name}${n ? `[${n}]` : ''}`;
      byPath.set(p, c);
      walk(c, p);
    }
  };
  if (root) { byPath.set(root.attrs?.name || 'form1', root); walk(root, root.attrs?.name || 'form1'); }
  // a name that repeats must carry [n] on every instance, [0] included (spec v1): re-key the first ones
  for (const [p, node] of [...byPath]) if (byPath.has(`${p}[1]`)) { byPath.delete(p); byPath.set(`${p}[0]`, node); }
  return { root, protos, byPath };
}

/** Per-window offsets of the migrated print against the SmartForm print (same values). */
function windowOffsets(content, sfPdf, afPdf) {
  const r = scoreFidelity(sfPdf, afPdf);
  const page = content.pages?.[0];
  const wins = (page?.windows || []).filter((w) => w.type !== 'MAIN');
  const inWin = (w, x, y) => x >= w.leftMm - 0.5 && x <= w.leftMm + w.widthMm + 0.5 && y >= w.topMm - 0.5 && y <= w.topMm + w.heightMm + 0.5;
  const out = new Map();
  for (const w of wins) {
    const moves = r.diff.moved.filter((m) => m.page === 1 && m.candPage === 1 && inWin(w, m.at[0], m.at[1]));
    if (moves.length) out.set(w.name, { dx: median(moves.map((m) => m.dx)), dy: median(moves.map((m) => m.dy)), n: moves.length });
  }
  return { offsets: out, score: r };
}

const DATE4 = /^(\d{2})([./-])(\d{2})\2(\d{4})$|^(\d{4})([./-])(\d{2})\6(\d{2})$/;
// a date the migrated form prints in another pattern: 2-digit year, or a month name (DateFmt medium / long)
const DATE2 = /^\d{1,2}[./-]\d{1,2}[./-]\d{2}$|^[A-Z][a-z]{2,8} \d{1,2}, \d{4}$/;
function datePicture(s) {
  const m = DATE4.exec(s);
  if (!m) return null;
  if (m[5]) return `date{YYYY${m[6]}MM${m[6]}DD}`;
  // 11/17/2026: month first when the first number is ≤ 12 and the second > 12, or the separator is '/'
  const a = +m[1], b = +m[3];
  const monthFirst = m[2] === '/' ? b <= 31 && a <= 12 : a <= 12 && b > 12;
  return monthFirst ? `date{MM${m[2]}DD${m[2]}YYYY}` : `date{DD${m[2]}MM${m[2]}YYYY}`;
}

/** Every named container under the root subform and in each <proto> definition, with the v1 target it is reached by
 *  ({ path } from the root, or { protoId, path? } below a proto definition) and its parent element. */
function allTargets(t) {
  const out = [];
  const walk = (el, base, path) => {
    const seen = new Map();
    for (const c of kids(el)) {
      if (c.tag === 'proto' || !CONTAINER.has(c.tag)) continue;
      const name = c.attrs?.name;
      if (!name) { walk(c, base, path); continue; }
      const n = seen.get(name) || 0;
      seen.set(name, n + 1);
      const same = kids(el).filter((x) => x.attrs?.name === name && CONTAINER.has(x.tag)).length > 1;
      const p = `${path ? `${path}.` : ''}${name}${same ? `[${n}]` : ''}`;
      out.push({ node: c, parent: el, target: base.protoId ? { protoId: base.protoId, ...(p ? { path: p } : {}) } : { path: p } });
      walk(c, base, p);
    }
  };
  if (t.root) walk(t.root, {}, t.root.attrs?.name || 'form1');
  for (const [id, node] of t.protos) {
    out.push({ node, parent: null, target: { protoId: id } });
    walk(node, { protoId: id }, '');
  }
  return out;
}

const hiddenField = (c) => c.tag === 'field' && c.attrs?.presence === 'hidden';
/** A subform MIGRATE writes to hold the hidden fields a cell text embeds (<subform name="GS_SFLIGHT"> with hidden
 *  CARRID): named, no layout of its own, every container child a hidden field. */
const isHiddenHolder = (n) => n.tag === 'subform' && !n.attrs?.layout && !n.attrs?.presence
  && kids(n).some(hiddenField) && kids(n).every((c) => !CONTAINER.has(c.tag) || hiddenField(c));

/** The CSS font of the innermost span around <span xfa:embed="ref"/> in a draw's rich text (null when not found). */
function embedFont(draw, ref) {
  let hit = null;
  const walk = (el, st) => {
    for (const c of kids(el)) {
      const own = String(c.attrs?.style || '');
      const css = { ...st };
      for (const part of own.split(';')) {
        const [k, v] = part.split(':').map((x) => String(x || '').trim());
        if (/^font-(family|size|weight)$/.test(k) && v) css[k] = v.replace(/['"]/g, '');
      }
      if ((c.attrs?.['xfa:embed'] || c.attrs?.embed) === ref) { hit = css; return; }
      walk(c, css);
      if (hit) return;
    }
  };
  walk(draw, {});
  return hit;
}

/** A draw with a right / center paragraph whose only content is embedded values (no text, not even a blank). */
function embedOnlyAligned(draw) {
  let hit = false;
  const hasEmbed = (el) => (el.children || []).some((c) => c.attrs?.['xfa:embed'] || hasEmbed(c));
  const walk = (el) => {
    for (const c of el.children || []) {
      if (hit || !c.tag || c.tag === '#text') continue;
      if (/(^|:)(p|div)$/.test(c.tag)) {
        const own = (c.children || []).some((k) => /(^|:)(p|div)$/.test(k.tag));
        const style = String(c.attrs?.style || '');
        if (!own && /text-align\s*:\s*(right|center)/.test(style) && hasEmbed(c) && !allText(c)) { hit = true; return; }
      }
      walk(c);
    }
  };
  const allText = (el) => (el.children || []).map((c) => (c.tag === '#text' ? c.text || '' : allText(c))).join('');
  walk(draw);
  return hit;
}

/** Row pitch of the repeated table rows: per column (same x within 0.5 mm), the median step between texts that come
 *  at least three times one under the other; the SmartForm print against the migrated print over the columns both
 *  have. null when no column repeats. */
function rowPitchDelta(sfPdf, afPdf, box = null) {
  // only texts inside the SmartForm's MAIN window count (address / info windows repeat lines too)
  const inBox = (r) => !box || (r.x >= box.leftMm - 1 && r.x <= box.leftMm + box.widthMm + 1 && r.y >= box.topMm - 1 && r.y <= box.topMm + box.heightMm + 1);
  const pitch = (src) => {
    // a PDF, or (tests) a layout JSON { pages: [{ texts: [{ x, y, text }] }] }
    const runs = Buffer.isBuffer(src) || src instanceof Uint8Array ? readPdf(src).page?.runs : src?.pages?.[0]?.texts;
    const cols = new Map();
    for (const r of (runs || []).filter(inBox)) {
      const k = Math.round(r.x * 2) / 2;
      (cols.get(k) || cols.set(k, []).get(k)).push(r.y);
    }
    const out = [];
    for (const ys of cols.values()) {
      if (ys.length < 3) continue;
      const s = [...new Set(ys.map((y) => Math.round(y * 100) / 100))].sort((a, b) => a - b);
      const steps = s.slice(1).map((y, i) => y - s[i]).filter((d) => d > 2 && d < 15);
      if (steps.length >= 2) out.push(median(steps));
    }
    return out;
  };
  const a = pitch(sfPdf), b = pitch(afPdf);
  if (!a.length || !b.length) return null;
  const sf = Math.round(median(a) * 100) / 100, af = Math.round(median(b) * 100) / 100;
  return { sf, af, delta: Math.round((sf - af) * 100) / 100, n: Math.min(a.length, b.length) };
}

/** R3 op: an initialize script that sets the picture with DateFmt overrides a template picture — then datePicture (the
 *  one script edit ZMCP_FP_MIGRATE allows), else picture. */
function dateOp(target, script, pic, text) {
  const evidence = `SmartForm prints ${text.replace(/\d/g, '9')}`;
  // a script that converts with Num2Date( …, $.format.picture ) cannot take a date{…} literal (EX35 printed
  // "{11/17/2026}"): no op
  if (/Num2Date/.test(script)) return null;
  if (!/DateFmt/.test(script)) return { op: 'picture', target, format: pic, rule: 'R3', evidence };
  // the FM's datePicture takes exactly one "$.format.picture = DateFmt(<n>, $.locale)"; any other DateFmt use: no op
  const n = (script.match(/\$\.format\.picture\s*=\s*DateFmt\(\s*\d\s*,\s*\$\.locale\s*\)/g) || []).length;
  return n === 1 ? { op: 'datePicture', target, picture: pic, rule: 'R3', evidence } : null;
}

/** R10: offsets of flowed blocks from static-text anchors (see correctionSpec). → [{ target, top, dy, n, clamped }] */
function blockOffsets(t, score) {
  const entries = allTargets(t);
  const byNode = new Map(entries.map((e) => [e.node, e]));
  const textOf = (el) => (el.children || []).map((c) => (c.tag === '#text' ? c.text || '' : textOf(c))).join('');
  const hasEmbed = (el) => (el.children || []).some((c) => c.attrs?.['xfa:embed'] || c.attrs?.embed || hasEmbed(c));
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  // the flowed block of an element: its ancestor whose parent is a MAIN subform, or the proto root it sits in
  const blockOf = (e) => {
    for (let cur = e; cur; cur = byNode.get(cur.parent)) {
      if (cur.target.protoId && !cur.target.path) return cur;
      if (cur.parent?.tag === 'subform' && /^MAIN$/.test(cur.parent.attrs?.name || '') && !cur.target.protoId) return cur;
    }
    return null;
  };
  // the printed text is the draw's <value> (its <desc> is not printed)
  const statics = entries.filter((e) => e.node.tag === 'draw' && !hasEmbed(e.node))
    .map((e) => ({ e, text: norm(kids(e.node, 'value').map(textOf).join(' ')) })).filter((x) => x.text);
  const groups = new Map();
  for (const m of score.diff.moved) {
    if (m.page !== 1 || m.candPage !== 1) continue;
    const t1 = norm(m.text);
    const hits = statics.filter((s) => s.text === t1 || s.text.split(' ').length > 1 && s.text.startsWith(`${t1} `));
    if (hits.length !== 1) continue;
    const b = blockOf(hits[0].e);
    if (!b) continue;
    const g = groups.get(b) || { b, dys: [], y: Infinity };
    g.dys.push(m.dy);
    g.y = Math.min(g.y, m.at[1]);
    groups.set(b, g);
  }
  const out = [];
  let applied = 0;
  for (const g of [...groups.values()].sort((a, c) => a.y - c.y)) {
    const dy = Math.round(median(g.dys) * 100) / 100;
    // a block printed higher (dy < 0) needs -dy more room above it, less what earlier insets already moved it
    const need = Math.round((-dy - applied) * 100) / 100;
    if (Math.abs(need) < 0.25) continue;
    const cur = unit(kids(g.b.node, 'margin')[0]?.attrs?.topInset, 0);
    const top = Math.max(0, cur + need);
    out.push({ target: g.b.target, top, dy, n: g.dys.length, clamped: cur + need < 0 });
    applied += top - cur;
  }
  return out;
}

/** The correction spec v1 for one migrated form. */
export function correctionSpec({ content, layoutXdp, source = '', sfPdf = null, afPdf = null }) {
  const t = xdpTargets(layoutXdp);
  const ops = [];
  const notes = [];
  // R1 — MAIN top to bottom
  for (const [p, node] of t.byPath) {
    if (node.tag === 'subform' && /^MAIN(\[\d+\])?$/.test(p.split('.').pop()) && /^(lr-tb|rl-tb)$/.test(node.attrs?.layout || '')) {
      ops.push({ op: 'layout', target: { path: p }, value: 'tb', rule: 'R1' });
    }
  }
  for (const [id, node] of t.protos) {
    if (/(^|_)MAIN$/.test(id) && /^(lr-tb|rl-tb)$/.test(node.attrs?.layout || '')) ops.push({ op: 'layout', target: { protoId: id }, value: 'tb', rule: 'R1' });
  }
  // R6 — the subforms MIGRATE writes to hold a text's hidden fields take a line of their own in the flow (ADS: a cell
  // 7.58 mm high instead of one text line); hidden, they take none and the embedded values still print (ADS probe on
  // the SF_TOTALS migration, 2026-11-17)
  // R7 — a formatted embed prints in its field's font, and those hidden fields have none (Courier 10 pt): they get
  // the font of the span that embeds them, as the SmartForm prints the value
  for (const { node, parent, target } of allTargets(t)) {
    if (!isHiddenHolder(node)) continue;
    ops.push({ op: 'presence', target, value: 'hidden', rule: 'R6', basis: `holder of hidden fields for an embedding text (${node.attrs.name}), not a SmartForm node` });
    const draws = parent ? kids(parent).filter((d) => d.tag === 'draw') : [];
    for (const f of kids(node).filter(hiddenField)) {
      const ref = `${node.attrs.name}.${f.attrs?.name}`;
      const css = draws.map((d) => embedFont(d, ref)).find(Boolean);
      if (!css || kids(f, 'font').length || (!css['font-family'] && !css['font-size'])) continue;
      ops.push({ op: 'font', target: { ...target, path: `${target.path ? `${target.path}.` : ''}${f.attrs.name}` },
        ...(css['font-family'] ? { typeface: css['font-family'] } : {}), ...(css['font-size'] ? { size: css['font-size'] } : {}),
        ...(css['font-weight'] === 'bold' ? { weight: 'bold' } : {}), rule: 'R7', evidence: `embedded as ${ref} in a span of ${css['font-family'] || ''} ${css['font-size'] || ''}`.trim() });
    }
  }
  // R8 — a paragraph aligned right / center that holds embedded values only prints at the content's left edge in ADS
  // (CSS text-align and margins ignored, calibration 4 / 5): op embedLead puts one blank before the value
  for (const { node, target } of allTargets(t)) {
    if (node.tag !== 'draw' || !embedOnlyAligned(node)) continue;
    ops.push({ op: 'embedLead', target, rule: 'R8' });
  }
  // R9 — table row pitch (calibration, measured on a print that already has the structural rules): the SmartForm's row
  // pitch minus the migrated one becomes extra bottom inset on every table row subform
  if (sfPdf && afPdf) {
    const main = content?.pages?.[0]?.windows?.find((w) => w.type === 'MAIN') || null;
    const d = rowPitchDelta(sfPdf, afPdf, main);
    if (d && Math.abs(d.delta) >= 0.25) {
      const embeds = (el) => (el.children || []).some((c) => c.attrs?.['xfa:embed'] || c.attrs?.embed || embeds(c));
      for (const { node, target } of allTargets(t)) {
        // data rows only: a header row of static texts keeps its height (EX35: the header row's inset pushed every
        // row 2.8 mm down once R10 had put the header in place)
        if (node.tag !== 'subform' || node.attrs?.layout !== 'row' || !embeds(node)) continue;
        const bottom = unit(kids(node, 'margin')[0]?.attrs?.bottomInset, 0);
        ops.push({ op: 'margin', target, bottomInset: mm(Math.max(0, bottom + d.delta)), rule: 'R9', evidence: `row pitch SmartForm ${d.sf} mm, migrated ${d.af} mm (${d.n} columns)` });
      }
    }
  }
  if (sfPdf && afPdf) {
    const { offsets, score } = windowOffsets(content, sfPdf, afPdf);
    // R2 — window offsets; every page area's copy of the window (FIRST_X, NEXT_X) gets the same correction
    for (const [win, o] of offsets) {
      const ids = [...t.protos.keys()].filter((id) => id === win || id.endsWith(`_${win}`));
      if (!ids.length) { notes.push(`window ${win}: no proto subform found — offset dy ${o.dy} mm not applied`); continue; }
      for (const id of ids) {
        const node = t.protos.get(id);
        if (Math.abs(o.dy) >= 0.25) {
          if (o.dy < 0) {
            const marginEl = kids(node, 'margin')[0];
            const top = unit(marginEl?.attrs?.topInset, 0);
            ops.push({ op: 'margin', target: { protoId: id }, topInset: mm(top - o.dy), rule: 'R2', evidence: `${o.n} texts dy ${o.dy}` });
          } else {
            const y = unit(node.attrs?.y, 0);
            ops.push({ op: 'geometry', target: { protoId: id }, y: mm(y - o.dy), rule: 'R2', evidence: `${o.n} texts dy ${o.dy}` });
            if (kids(node, 'border').length) notes.push(`window ${id}: moved up ${o.dy} mm together with its border`);
          }
        }
        if (Math.abs(o.dx) >= 0.25) {
          const x = unit(node.attrs?.x, 0);
          ops.push({ op: 'geometry', target: { protoId: id }, x: mm(x - o.dx), rule: 'R2', evidence: `${o.n} texts dx ${o.dx}` });
        }
      }
    }
    // R3 — dates: the SmartForm prints a numeric 4-digit-year date, the migrated print another pattern at about the same place
    const used = new Set();
    for (const m of score.diff.missing) {
      const pic = datePicture(m.text);
      if (!pic) continue;
      const e = score.diff.extra.find((x) => x.page === m.page && DATE2.test(x.text) && Math.abs(x.y - m.y) <= 5 && Math.abs(x.x - m.x) <= 5);
      if (!e) continue;
      // the field that prints it: date fields with a format / display picture script (DateFmt) in the XDP
      for (const [p, node] of t.byPath) {
        if (node.tag !== 'field' || used.has(p) || !/DAT|DATE|DATUM/i.test(p.split('.').pop())) continue;
        const script = JSON.stringify(node.children || []);
        if (!/DateFmt|date\{/.test(script)) continue;
        used.add(p);
        { const o = dateOp({ path: p }, script, pic, m.text); if (o) ops.push(o); else notes.push(`${p}: DateFmt script not in the one form datePicture takes — date picture not set`); }
      }
      for (const [id, node] of t.protos) {
        const walk = (el, path) => {
          for (const c of kids(el)) {
            if (!CONTAINER.has(c.tag)) continue;
            const name = c.attrs?.name;
            const pp = name ? (path ? `${path}.${name}` : name) : path;
            const key = `${id}:${pp}`;
            if (c.tag === 'field' && name && /DAT|DATE|DATUM/i.test(name) && !used.has(key) && /DateFmt|date\{/.test(JSON.stringify(c.children || []))) {
              used.add(key);
              { const o = dateOp({ protoId: id, path: pp }, JSON.stringify(c.children || []), pic, m.text); if (o) ops.push(o); else notes.push(`${id}:${pp}: DateFmt script not in the one form datePicture takes — date picture not set`); }
            }
            walk(c, pp);
          }
        };
        walk(node, '');
      }
    }
    // R10 — block offsets in the flow: static texts (draws without embedded values) the score finds moved are anchors;
    // per flowed block (a child of the flowed root's MAIN, or a proto root such as a table header leader) the median dy;
    // blocks in print order get top inset so each lands where the SmartForm prints it (an inset moves the block and
    // all after it). Measured on a print that already has the structural rules (like R9).
    for (const o of blockOffsets(t, score)) {
      ops.push({ op: 'margin', target: o.target, topInset: mm(o.top), rule: 'R10', evidence: `${o.n} texts dy ${o.dy}` });
      if (o.clamped) notes.push(`${JSON.stringify(o.target)}: block printed lower than the SmartForm (${o.dy} mm) — top inset cannot go below 0`);
    }
  }
  return { version: 1, source, ops, notes };
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const [contentFile, xdpFile] = argv;
  if (!contentFile || !xdpFile) {
    console.error('usage: node sf-to-adobe-correct.mjs <content.json> <layout.xdp> [--source NAME] [--sf-pdf sf.pdf --af-pdf af.pdf] [--out spec.json]');
    process.exit(2);
  }
  const spec = correctionSpec({
    content: JSON.parse(readFileSync(resolve(contentFile), 'utf8')), layoutXdp: readFileSync(resolve(xdpFile), 'utf8'), source: opt('--source') || '',
    sfPdf: opt('--sf-pdf') ? readFileSync(resolve(opt('--sf-pdf'))) : null, afPdf: opt('--af-pdf') ? readFileSync(resolve(opt('--af-pdf'))) : null,
  });
  const json = `${JSON.stringify(spec, null, 1)}\n`;
  if (opt('--out')) writeFileSync(resolve(opt('--out')), json);
  process.stdout.write(json);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
