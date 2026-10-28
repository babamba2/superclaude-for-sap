// sc4sap:module-to-process — swimlane drawings (inline SVG, no library).
//
// drawSwimlane({ lanes, nodes, edges, title }) → SVG string
//   lanes: [{ id, label }]                       horizontal bands, top to bottom
//   nodes: [{ id, label, sub?, lane, col, system, kind, badge?, iface?, href? }]
//          col = column index (left → right); system → fill colour, kind → border colour,
//          iface → double border (the step talks to another system), badge → small tag top-right,
//          group → program name; consecutive columns with the same group share a dashed frame labelled with it
//   edges: [{ from, to, label? }]                right-angle arrows between node centres
// The drawing has its own white ground (like the flowchart figures), so colours are fixed hex.
//
// Adapters:
//   l3Map(model, code)   one L3 scenario: its L4 tasks in the owner lanes, links between them as arrows,
//                        links leaving the L3 as "→ code" notes
//   stepLanes(model, row) one task: its steps in the owner lanes, in order; the small top line of a box
//                        is the step number and where it runs (`where`: TCode / program / RFC FM / job)

const arr = (v) => (Array.isArray(v) ? v : []);
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chW = (ch) => { const c = ch.codePointAt(0); return (c >= 0x1100 && c <= 0x11FF) || (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xAC00 && c <= 0xD7AF) || (c >= 0xFF00 && c <= 0xFFEF) ? 12 : 6.6; };
function wrap(text, maxPx, maxLines = 3) {
  // break between words (spaces, "·", "/"); a word wider than the box is split by characters
  const width = (t) => [...t].reduce((n, ch) => n + chW(ch), 0);
  const words = String(text ?? '').split(/(?<=[\s·/,])/).filter(Boolean);
  const out = []; let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const wd of words) {
    if (width(cur + wd) <= maxPx) { cur += wd; continue; }
    push();
    if (width(wd) <= maxPx) { cur = wd; continue; }
    for (const ch of wd) { if (width(cur + ch) > maxPx) push(); cur += ch; }
  }
  push();
  if (out.length > maxLines) { const kept = out.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].replace(/.$/, '…'); return kept; }
  return out;
}

const wrapAll = (text, maxPx) => wrap(text, maxPx, 99);
const clip = (text, maxPx) => { let w = 0, out = ''; for (const ch of String(text ?? '')) { w += chW(ch) * 0.9; if (w > maxPx) return `${out}…`; out += ch; } return out; };

/** The drawing shows the gist of an action ("실행(F8)", "'Create DN' 버튼" / "Run (F8)", "'Create DN' button"); the tables keep the full sentence. */
const ACT = {
  ko: { button: '버튼', run: '실행(F8)', batch: '배치 자동 실행', rfc: 'RFC 호출 시 자동', save: '저장 시 자동' },
  en: { button: 'button', run: 'Run (F8)', batch: 'Batch job', rfc: 'Called by RFC', save: 'Automatic on save' },
  ja: { button: 'ボタン', run: '実行(F8)', batch: 'バッチ自動実行', rfc: 'RFC 呼出時に自動', save: '保存時に自動' },
};
export function shortAction(a, lang = 'ko') {
  const L = ACT[String(lang).slice(0, 2)] || ACT.en;
  const t = String(a || '').replace(/s*((?:문구 )?추정)|s*((?:wording )?estimated)|s*(推定)/gi, '').trim();
  if (!t) return '';
  const btn = t.match(/'[^']+'/); if (btn) return `${btn[0]} ${L.button}`;
  if (/F8/.test(t)) return L.run;
  if (/배치|batch|job|バッチ/i.test(t)) return L.batch;
  if (/RFC/.test(t)) return L.rfc;
  if (/저장 시|on save|exit|保存時/i.test(t)) return L.save;
  return t.length > 18 ? t.split(/[,(—-]/)[0].trim() : t;
}

export const FILL = { sap: '#E3EEF9', legacy: '#EEE6F7', external: '#DDF2EE', manual: '#EEF0F2' };
export const BORDER = { std: '#1F6FB2', cbo: '#B3541E', enh: '#8A5A00', manual: '#6B7480', ext: '#0F8A7A' };
const LANE_W = 150, COL_W = 190, BOX_W = 160, BOX_H0 = 58, LANE_H0 = 84, PAD = 16, HEAD = 34, MAX_COLS = 5;

export function drawSwimlane({ lanes, nodes, edges = [], title = '' }) {
  // every line of a box is kept (no "…"): the box height of the drawing grows to the fullest box
  const linesOf = (n) => [...wrapAll(n.sub, BOX_W - 14).map(t => ['sub', t]), ...wrapAll(n.label, BOX_W - 16).map(t => ['label', t]), ...wrapAll(n.foot, BOX_W - 14).map(t => ['foot', t])];
  const BOX_H = Math.max(BOX_H0, ...arr(nodes).map(n => linesOf(n).length * 15 + 14));
  const LANE_H = BOX_H + (LANE_H0 - BOX_H0);
  const ls = arr(lanes).length ? arr(lanes) : [{ id: '_', label: '' }];
  const laneIx = new Map(ls.map((l, i) => [l.id, i]));
  // More than MAX_COLS columns wrap into bands; each band repeats the lane set (like the pages of a deck).
  const last = Math.max(0, ...arr(nodes).map(n => n.col ?? 0));
  const cols = Math.min(MAX_COLS, last + 1);
  const bands = Math.floor(last / MAX_COLS) + 1;
  const width = LANE_W + cols * COL_W + PAD;
  const height = HEAD + bands * ls.length * LANE_H + PAD;
  const pos = new Map();
  for (const n of arr(nodes)) {
    const li = laneIx.has(n.lane) ? laneIx.get(n.lane) : ls.length - 1;
    const c = n.col ?? 0, band = Math.floor(c / MAX_COLS);
    const x = LANE_W + (c % MAX_COLS) * COL_W + (COL_W - BOX_W) / 2;
    const y = HEAD + (band * ls.length + li) * LANE_H + (LANE_H - BOX_H) / 2;
    pos.set(n.id, { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2 });
  }
  const p = [];
  p.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>`);
  if (title) p.push(`<text x="${PAD}" y="22" font-size="14" font-weight="700" fill="#1D4F73">${xml(title)}</text>`);
  Array.from({ length: bands }).flatMap((_, b) => ls.map((l, i) => [l, b * ls.length + i])).forEach(([l, i]) => {
    const y = HEAD + i * LANE_H;
    p.push(`<rect x="0" y="${y}" width="${width}" height="${LANE_H}" fill="${i % 2 ? '#FAFBFC' : '#F3F6F9'}" stroke="#D3DBE4"/>`);
    p.push(`<rect x="0" y="${y}" width="${LANE_W - 10}" height="${LANE_H}" fill="#E8EEF5" stroke="#D3DBE4"/>`);
    wrapAll(l.label, LANE_W - 24).forEach((t, k, a) => p.push(`<text x="${(LANE_W - 10) / 2}" y="${y + LANE_H / 2 - (a.length - 1) * 8 + k * 16 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#2B3A4A">${xml(t)}</text>`));
  });
  // program frames: consecutive columns (same band) whose nodes share `group` get one frame with the program name
  const byCol = arr(nodes).filter(n => pos.has(n.id)).sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
  const runs = [];
  for (const n of byCol) {
    const prev = runs.at(-1), c = n.col ?? 0;
    if (n.group && prev && prev.k === n.group && prev.c === c - 1 && Math.floor(prev.c / MAX_COLS) === Math.floor(c / MAX_COLS)) { prev.ns.push(n); prev.c = c; }
    else runs.push({ k: n.group || '', c, ns: [n] });
  }
  for (const r of runs.filter(r => r.k && r.ns.length > 1)) {
    const ps = r.ns.map(n => pos.get(n.id)), FX = 9, FY = 9;
    const x0 = Math.min(...ps.map(q => q.x)) - FX, x1 = Math.max(...ps.map(q => q.x)) + BOX_W + FX;
    const y0 = Math.min(...ps.map(q => q.y)) - FY, y1 = Math.max(...ps.map(q => q.y)) + BOX_H + FY;
    const lw = [...r.k].reduce((n, ch) => n + chW(ch), 0) * 1.15 + 16;
    p.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="6" fill="#E3F1FB" fill-opacity="0.55" stroke="#1D4F73" stroke-width="1.2" stroke-dasharray="5 3"/>`);
    p.push(`<rect x="${x0 + 8}" y="${y0 - 8}" width="${lw}" height="16" fill="#FFFFFF" stroke="#C62828" stroke-width="0.9"/><text x="${x0 + 15}" y="${y0 + 4}" font-size="11" font-weight="700" fill="#C62828">${xml(r.k)}</text>`);
  }
  p.push(`<defs><marker id="sl-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,3 L0,6 Z" fill="#5E7388"/></marker></defs>`);
  for (const e of arr(edges)) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    let d;
    if (Math.abs(a.cy - b.cy) < 1) d = `M${a.x + (b.cx > a.cx ? BOX_W : 0)},${a.cy} L${b.x + (b.cx > a.cx ? 0 : BOX_W)},${b.cy}`;
    else if (b.cx > a.cx) { const mx = a.x + BOX_W + (b.x - a.x - BOX_W) / 2; d = `M${a.x + BOX_W},${a.cy} L${mx},${a.cy} L${mx},${b.cy} L${b.x},${b.cy}`; }
    else {
      // target left of the source (also the wrap from the last column of a band to the first column of the next):
      // leave the source vertically, run in the gap just before the target, enter the target vertically
      const down = b.cy > a.cy;
      const ym = down ? b.y - (LANE_H - BOX_H) / 2 : b.y + BOX_H + (LANE_H - BOX_H) / 2;
      d = `M${a.cx},${down ? a.y + BOX_H : a.y} L${a.cx},${ym} L${b.cx},${ym} L${b.cx},${down ? b.y : b.y + BOX_H}`;
    }
    p.push(`<path d="${d}" fill="none" stroke="#5E7388" stroke-width="1.4" marker-end="url(#sl-arrow)"/>`);
    if (e.label) p.push(`<text x="${(a.cx + b.cx) / 2}" y="${Math.min(a.cy, b.cy) - 4}" text-anchor="middle" font-size="10.5" fill="#5E7388">${xml(e.label)}</text>`);
  }
  for (const n of arr(nodes)) {
    const { x, y } = pos.get(n.id);
    const fill = FILL[n.system] || FILL.sap, stroke = BORDER[n.kind] || '#5E7388';
    const g = [];
    g.push(`<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`);
    if (n.iface) g.push(`<rect x="${x + 3}" y="${y + 3}" width="${BOX_W - 6}" height="${BOX_H - 6}" rx="5" fill="none" stroke="${stroke}" stroke-width="0.9"/>`);
    const lines = linesOf(n);
    lines.forEach(([kind, t], k) => g.push(`<text x="${x + BOX_W / 2}" y="${y + BOX_H / 2 - (lines.length - 1) * 7.5 + k * 15 + 4}" text-anchor="middle" font-size="${kind === 'label' ? 11.5 : 10.5}" fill="${kind === 'sub' ? '#5A6675' : kind === 'foot' ? '#1D4F73' : '#1D2733'}"${kind === 'foot' ? ' font-style="italic"' : ''}>${xml(t)}</text>`));
    if (n.badge) g.push(`<rect x="${x + BOX_W - 54}" y="${y - 8}" width="52" height="15" rx="7" fill="#FFFFFF" stroke="${stroke}"/><text x="${x + BOX_W - 28}" y="${y + 3}" text-anchor="middle" font-size="9.5" fill="${stroke}">${xml(n.badge)}</text>`);
    if (n.note) g.push(`<text x="${x + BOX_W / 2}" y="${y + BOX_H + 13}" text-anchor="middle" font-size="10" fill="#5E7388">${xml(n.note)}</text>`);
    p.push(n.href ? `<a href="${xml(n.href)}">${g.join('')}</a>` : g.join(''));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Segoe UI, Malgun Gothic, Apple SD Gothic Neo, sans-serif">${p.join('')}</svg>`;
}

const laneLabel = (m, id) => arr(m.lanes).find(l => l.id === id)?.label || id || '—';
const sysKind = (m, id) => arr(m.scope?.systems).find(s => s.id === id)?.kind || 'sap';
const anchor = (code) => `#p-${String(code).replace(/[^A-Za-z0-9]+/g, '-')}`;

/** One L3 scenario: its L4 tasks laid out by owner lane, arrows for links inside the L3. */
export function l3Map(m, code, { variantWord = 'Variant', moreWord = (n) => `+${n}` } = {}) {
  const tasks = arr(m.rows).filter(r => r.level === 4 && r.code.startsWith(`${code}.`));
  if (!tasks.length) return '';
  const laneIds = [...new Set(tasks.map(t => t.owner || '_'))];
  const lanes = laneIds.map(id => ({ id, label: laneLabel(m, id === '_' ? '' : id) }));
  const inside = new Set(tasks.map(t => t.code));
  const nodes = tasks.map((t, i) => {
    const out = arr(t.task?.links).map(l => (typeof l === 'string' ? l : l.code)).filter(c => c && !inside.has(c));
    return { id: t.code, label: t.label, sub: t.code, lane: t.owner || '_', col: i, system: sysKind(m, t.system), kind: t.kind,
      iface: arr(t.task?.interfaces).length > 0, badge: arr(t.variants).length ? `${variantWord} ${t.variants.length}` : '',
      note: out.length ? `→ ${out.slice(0, 3).join(', ')}${out.length > 3 ? ` ${moreWord(out.length - 3)}` : ''}` : '', href: anchor(t.code) };
  });
  const edges = [];
  for (const t of tasks) for (const l of arr(t.task?.links)) {
    const to = typeof l === 'string' ? l : l.code;
    if (inside.has(to) && to !== t.code && !edges.some(e => (e.from === t.code && e.to === to) || (e.from === to && e.to === t.code))) edges.push({ from: t.code, to });
  }
  return drawSwimlane({ lanes, nodes, edges });
}

// the program / TCode a step runs in (first one named in `where`); consecutive steps in the same one are framed
const PROG_RE = /\b(Z[A-Z0-9_]{2,}|SAPM[A-Z0-9]+|[A-Z]{2,4}\d{1,3}[A-Z]?N?)\b/;

/** One task: its steps in order, by owner lane. A step with several `alts` links to its case figure (`altHref(i)`). */
export function stepLanes(m, row, { altHref = null, altWord = (n) => `${n} cases` } = {}) {
  const steps = arr(row.task?.steps);
  if (steps.length < 2) return '';
  const laneIds = [...new Set(steps.map(s => s.owner || row.owner || '_'))];
  const lanes = laneIds.map(id => ({ id, label: laneLabel(m, id === '_' ? '' : id) }));
  const nodes = steps.map((s, i) => {
    const many = arr(s.alts).length > 1;
    const sub = many ? `${i + 1} · ${altWord(s.alts.length)} ▸` : s.where ? `${i + 1} · ${s.where}` : `${i + 1}`;
    return { id: `s${i}`, label: s.name || s.method || '', sub, foot: many ? '' : shortAction(s.action, m.lang), lane: s.owner || row.owner || '_', col: i,
      system: sysKind(m, s.system || row.system), kind: sysKind(m, s.system || row.system) === 'sap' ? row.kind : 'ext',
      href: many && altHref ? altHref(i) : undefined, badge: many ? '▸' : '', group: many ? '' : (PROG_RE.exec(s.where || '') || [])[1] || '' };
  });
  const edges = steps.slice(1).map((_, i) => ({ from: `s${i}`, to: `s${i + 1}` }));
  return drawSwimlane({ lanes, nodes, edges });
}

/** One step with several programs: the step on the left, one box per case (`alts[]`: { when, label?, where, system? })
 *  on the right, the condition written on each arrow. */
export function caseMap(m, step, row) {
  const alts = arr(step.alts);
  if (!alts.length) return '';
  const RW = 250, GAP = 14, LX = PAD, LW = 190, MID = 190, RX = LX + LW + MID;
  const boxLines = (a) => [...wrapAll(a.where || '', RW - 14).map(t => ['sub', t]), ...wrapAll(a.label || '', RW - 16).map(t => ['label', t]), ...wrapAll(shortAction(a.action, m.lang), RW - 14).map(t => ['foot', t])];
  const RH = Math.max(62, ...alts.map(a => boxLines(a).length * 15 + 14));
  const height = HEAD + alts.length * (RH + GAP) + PAD, width = RX + RW + PAD;
  const top = HEAD, lcy = top + (alts.length * (RH + GAP) - GAP) / 2;
  const p = [`<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>`,
    `<defs><marker id="cm-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,3 L0,6 Z" fill="#5E7388"/></marker></defs>`];
  const lstroke = BORDER[row.kind] || '#5E7388';
  p.push(`<rect x="${LX}" y="${lcy - 34}" width="${LW}" height="68" rx="7" fill="${FILL[sysKind(m, step.system || row.system)] || FILL.sap}" stroke="${lstroke}" stroke-width="1.6"/>`);
  wrapAll(step.name, LW - 16).forEach((t, k, a) => p.push(`<text x="${LX + LW / 2}" y="${lcy - (a.length - 1) * 8 + k * 16 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#1D2733">${xml(t)}</text>`));
  const jx = LX + LW + 24;
  p.push(`<path d="M${LX + LW},${lcy} L${jx},${lcy}" stroke="#5E7388" stroke-width="1.4" fill="none"/>`);
  alts.forEach((a, i) => {
    const y = top + i * (RH + GAP), cy = y + RH / 2;
    const sysK = sysKind(m, a.system || step.system || row.system);
    p.push(`<path d="M${jx},${lcy} L${jx},${cy} L${RX},${cy}" stroke="#5E7388" stroke-width="1.4" fill="none" marker-end="url(#cm-arrow)"/>`);
    const wl = wrapAll(a.when || '', MID - 34);
    wl.forEach((t, k) => p.push(`<text x="${jx + 8}" y="${cy - 6 - (wl.length - 1 - k) * 13}" font-size="10.5" fill="#1D4F73">${xml(t)}</text>`));
    p.push(`<rect x="${RX}" y="${y}" width="${RW}" height="${RH}" rx="7" fill="${FILL[sysK] || FILL.sap}" stroke="${sysK === 'sap' ? lstroke : BORDER.ext}" stroke-width="1.4"/>`);
    const lines = boxLines(a);
    lines.forEach(([kind, t], k) => p.push(`<text x="${RX + RW / 2}" y="${cy - (lines.length - 1) * 7.5 + k * 15 + 4}" text-anchor="middle" font-size="${kind === 'label' ? 11.5 : 10.5}" fill="${kind === 'sub' ? '#5A6675' : kind === 'foot' ? '#1D4F73' : '#1D2733'}"${kind === 'sub' ? ' font-family="Consolas, monospace"' : kind === 'foot' ? ' font-style="italic"' : ''}>${xml(t)}</text>`));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Segoe UI, Malgun Gothic, Apple SD Gothic Neo, sans-serif">${p.join('')}</svg>`;
}
