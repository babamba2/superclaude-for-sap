// sc4sap:module-to-process — swimlane drawings (inline SVG, no library).
//
// drawSwimlane({ lanes, nodes, edges, title }) → SVG string
//   lanes: [{ id, label }]                       horizontal bands, top to bottom
//   nodes: [{ id, label, sub?, lane, col, system, kind, badge?, iface?, href? }]
//          col = column index (left → right); system → fill colour, kind → border colour,
//          iface → double border (the step talks to another system), badge → small tag top-right
//   edges: [{ from, to, label? }]                right-angle arrows between node centres
// The drawing has its own white ground (like the flowchart figures), so colours are fixed hex.
//
// Adapters:
//   l3Map(model, code)   one L3 scenario: its L4 tasks in the owner lanes, links between them as arrows,
//                        links leaving the L3 as "→ code" notes
//   stepLanes(model, row) one task: its steps in the owner lanes, in order

const arr = (v) => (Array.isArray(v) ? v : []);
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chW = (ch) => { const c = ch.codePointAt(0); return (c >= 0x1100 && c <= 0x11FF) || (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xAC00 && c <= 0xD7AF) || (c >= 0xFF00 && c <= 0xFFEF) ? 12 : 6.6; };
function wrap(text, maxPx, maxLines = 3) {
  const out = []; let cur = ''; let w = 0;
  for (const ch of String(text ?? '')) {
    const cw = chW(ch);
    if (w + cw > maxPx && cur) { out.push(cur); cur = ''; w = 0; if (out.length === maxLines) break; }
    cur += ch; w += cw;
  }
  if (cur && out.length < maxLines) out.push(cur);
  if (out.length === maxLines && [...String(text)].length > out.join('').length) out[maxLines - 1] = out[maxLines - 1].replace(/.$/, '…');
  return out;
}

export const FILL = { sap: '#E3EEF9', legacy: '#EEE6F7', external: '#DDF2EE', manual: '#EEF0F2' };
export const BORDER = { std: '#1F6FB2', cbo: '#B3541E', enh: '#8A5A00', manual: '#6B7480', ext: '#0F8A7A' };
const LANE_W = 150, COL_W = 190, BOX_W = 160, BOX_H = 58, LANE_H = 84, PAD = 16, HEAD = 34, MAX_COLS = 5;

export function drawSwimlane({ lanes, nodes, edges = [], title = '' }) {
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
    wrap(l.label, LANE_W - 24, 3).forEach((t, k, a) => p.push(`<text x="${(LANE_W - 10) / 2}" y="${y + LANE_H / 2 - (a.length - 1) * 8 + k * 16 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#2B3A4A">${xml(t)}</text>`));
  });
  p.push(`<defs><marker id="sl-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,3 L0,6 Z" fill="#5E7388"/></marker></defs>`);
  for (const e of arr(edges)) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    let d;
    if (Math.abs(a.cy - b.cy) < 1) d = `M${a.x + (b.cx > a.cx ? BOX_W : 0)},${a.cy} L${b.x + (b.cx > a.cx ? 0 : BOX_W)},${b.cy}`;
    else if (b.cx > a.cx) { const mx = a.x + BOX_W + (b.x - a.x - BOX_W) / 2; d = `M${a.x + BOX_W},${a.cy} L${mx},${a.cy} L${mx},${b.cy} L${b.x},${b.cy}`; }
    else d = `M${a.cx},${a.cy + (b.cy > a.cy ? BOX_H / 2 : -BOX_H / 2)} L${a.cx},${b.cy + (b.cy > a.cy ? -BOX_H / 2 : BOX_H / 2) - (b.cy > a.cy ? 6 : -6)} L${b.cx},${b.cy + (b.cy > a.cy ? -BOX_H / 2 : BOX_H / 2)}`;
    p.push(`<path d="${d}" fill="none" stroke="#5E7388" stroke-width="1.4" marker-end="url(#sl-arrow)"/>`);
    if (e.label) p.push(`<text x="${(a.cx + b.cx) / 2}" y="${Math.min(a.cy, b.cy) - 4}" text-anchor="middle" font-size="10.5" fill="#5E7388">${xml(e.label)}</text>`);
  }
  for (const n of arr(nodes)) {
    const { x, y } = pos.get(n.id);
    const fill = FILL[n.system] || FILL.sap, stroke = BORDER[n.kind] || '#5E7388';
    const g = [];
    g.push(`<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`);
    if (n.iface) g.push(`<rect x="${x + 3}" y="${y + 3}" width="${BOX_W - 6}" height="${BOX_H - 6}" rx="5" fill="none" stroke="${stroke}" stroke-width="0.9"/>`);
    const lines = [n.sub, ...wrap(n.label, BOX_W - 16, n.sub ? 2 : 3)].filter(Boolean);
    lines.forEach((t, k) => g.push(`<text x="${x + BOX_W / 2}" y="${y + BOX_H / 2 - (lines.length - 1) * 7.5 + k * 15 + 4}" text-anchor="middle" font-size="${k === 0 && n.sub ? 10.5 : 11.5}" ${k === 0 && n.sub ? 'fill="#5A6675"' : 'fill="#1D2733"'}>${xml(t)}</text>`));
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
export function l3Map(m, code, { variantWord = 'Variant' } = {}) {
  const tasks = arr(m.rows).filter(r => r.level === 4 && r.code.startsWith(`${code}.`));
  if (!tasks.length) return '';
  const laneIds = [...new Set(tasks.map(t => t.owner || '_'))];
  const lanes = laneIds.map(id => ({ id, label: laneLabel(m, id === '_' ? '' : id) }));
  const inside = new Set(tasks.map(t => t.code));
  const nodes = tasks.map((t, i) => {
    const out = arr(t.task?.links).map(l => (typeof l === 'string' ? l : l.code)).filter(c => c && !inside.has(c));
    return { id: t.code, label: t.label, sub: t.code, lane: t.owner || '_', col: i, system: sysKind(m, t.system), kind: t.kind,
      iface: arr(t.task?.interfaces).length > 0, badge: arr(t.variants).length ? `${variantWord} ${t.variants.length}` : '',
      note: out.length ? `→ ${out.slice(0, 3).join(', ')}${out.length > 3 ? ' …' : ''}` : '', href: anchor(t.code) };
  });
  const edges = [];
  for (const t of tasks) for (const l of arr(t.task?.links)) {
    const to = typeof l === 'string' ? l : l.code;
    if (inside.has(to) && to !== t.code && !edges.some(e => (e.from === t.code && e.to === to) || (e.from === to && e.to === t.code))) edges.push({ from: t.code, to });
  }
  return drawSwimlane({ lanes, nodes, edges });
}

/** One task: its steps in order, by owner lane. */
export function stepLanes(m, row) {
  const steps = arr(row.task?.steps);
  if (steps.length < 2) return '';
  const laneIds = [...new Set(steps.map(s => s.owner || row.owner || '_'))];
  const lanes = laneIds.map(id => ({ id, label: laneLabel(m, id === '_' ? '' : id) }));
  const nodes = steps.map((s, i) => ({ id: `s${i}`, label: s.name || s.method || '', sub: `${i + 1}`, lane: s.owner || row.owner || '_', col: i,
    system: sysKind(m, s.system || row.system), kind: sysKind(m, s.system || row.system) === 'sap' ? row.kind : 'ext' }));
  const edges = steps.slice(1).map((_, i) => ({ from: `s${i}`, to: `s${i + 1}` }));
  return drawSwimlane({ lanes, nodes, edges });
}
