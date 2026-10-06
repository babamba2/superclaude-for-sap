// sc4sap — free-layout flowchart: one drawing kit for Node and the browser.
//
// The auto-laid-out flowchart (screen-image-renderer.mjs renderFlowchartSVG)
// places nodes itself. Once a user edits a flow in a page (flow-editor.mjs),
// every node keeps the position the user gave it — a "free" graph:
//   {
//     layout: 'free',
//     nodes: [{ id, type: 'start'|'end'|'process'|'decision'|'io', label, x, y }],  // x, y = centre
//     edges: [{ from, to, label?, fromSide?, toSide? }]                           // side: N | E | S | W
//   }
// A missing side is picked from where the two nodes sit. Edges are drawn as
// right-angle lines between the chosen sides.
//
// flowKit() uses nothing from outside its own body: the page editor inlines
// its source (FLOW_KIT_SOURCE) so the browser draws exactly what the build draws.

export function flowKit() {
  var LINE_H = 17, STUB = 16, PAD = 28, HEAD_H = 56, LEGEND_H = 46;
  var INK = '#2B3A4A', EDGE = '#5E7388';
  function xml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function chW(ch) {
    var cp = ch.codePointAt(0);
    var wide = (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x2E80 && cp <= 0x303F) || (cp >= 0x3040 && cp <= 0x30FF)
      || (cp >= 0x3400 && cp <= 0x9FFF) || (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xFF00 && cp <= 0xFFEF) || cp >= 0x1F000;
    return wide ? 12.6 : (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' ? 8.2 : 6.8;
  }
  function textW(s) { var w = 0; for (var ch of String(s == null ? '' : s)) w += chW(ch); return w; }
  function wrap(label, maxPx) {
    var out = [];
    String(label == null ? '' : label).split('\n').forEach(function (seg) {
      var cur = '', w = 0;
      seg.split(/(\s+)/).forEach(function (tok) {
        if (!tok) return;
        var tw = textW(tok);
        if (w + tw <= maxPx) { cur += tok; w += tw; return; }
        if (tw > maxPx) {
          for (var ch of tok) { var cw = chW(ch); if (w + cw > maxPx && cur) { out.push(cur); cur = ''; w = 0; } cur += ch; w += cw; }
          return;
        }
        if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
        cur = /^\s+$/.test(tok) ? '' : tok; w = /^\s+$/.test(tok) ? 0 : tw;
      });
      out.push(cur.replace(/\s+$/, ''));
    });
    return out.length ? out : [''];
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function widest(lines) { return Math.max.apply(null, lines.map(textW).concat([0])); }

  /** Box of a node: { type, w, h, lines, x, y, l, r, t, b }. */
  function measure(n) {
    var type = n.type || 'process', lines, w, h;
    if (type === 'decision') {
      lines = wrap(n.label, 150);
      w = clamp(widest(lines) + 96, 170, 270); h = Math.max(84, lines.length * LINE_H + 46);
    } else if (type === 'start' || type === 'end') {
      lines = wrap(n.label, 220);
      w = Math.max(120, widest(lines) + 48); h = Math.max(42, lines.length * LINE_H + 18);
    } else {
      lines = wrap(n.label, 240);
      w = clamp(widest(lines) + (type === 'io' ? 54 : 38), 150, 300); h = Math.max(46, lines.length * LINE_H + 20);
    }
    var x = Number(n.x) || 0, y = Number(n.y) || 0;
    return { type: type, w: w, h: h, lines: lines, x: x, y: y, l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 };
  }
  function port(p, side) {
    if (side === 'N') return { x: p.x, y: p.t };
    if (side === 'S') return { x: p.x, y: p.b };
    if (side === 'E') return { x: p.r, y: p.y };
    return { x: p.l, y: p.y };
  }
  /** Sides for an edge with none given: vertical when the target is mostly above / below. */
  function autoSides(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dy) >= Math.abs(dx) * 0.6) return dy >= 0 ? ['S', 'N'] : ['N', 'S'];
    return dx >= 0 ? ['E', 'W'] : ['W', 'E'];
  }
  var DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  function vert(s) { return s === 'N' || s === 'S'; }
  function tidy(pts) {
    var out = [];
    pts.forEach(function (p) {
      var q = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      var last = out[out.length - 1];
      if (last && last.x === q.x && last.y === q.y) return;
      var prev = out[out.length - 2];
      if (prev && ((prev.x === last.x && last.x === q.x) || (prev.y === last.y && last.y === q.y))) out[out.length - 1] = q;
      else out.push(q);
    });
    return out;
  }
  /** Right-angle path from side s1 of a to side s2 of b. */
  function route(a, s1, b, s2) {
    var p1 = port(a, s1), p2 = port(b, s2);
    var q1 = { x: p1.x + DIR[s1][0] * STUB, y: p1.y + DIR[s1][1] * STUB };
    var q2 = { x: p2.x + DIR[s2][0] * STUB, y: p2.y + DIR[s2][1] * STUB };
    var pts;
    if (vert(s1) && vert(s2)) {
      if (s1 !== s2) {
        var ahead = s1 === 'S' ? p2.y >= p1.y : p2.y <= p1.y;
        if (ahead) { var my = (q1.y + q2.y) / 2; pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]; }
        else { var dx = Math.max(a.r, b.r) + 24; pts = [p1, q1, { x: dx, y: q1.y }, { x: dx, y: q2.y }, q2, p2]; }
      } else {
        var y = s1 === 'S' ? Math.max(q1.y, q2.y) : Math.min(q1.y, q2.y);
        pts = [p1, { x: p1.x, y: y }, { x: p2.x, y: y }, p2];
      }
    } else if (!vert(s1) && !vert(s2)) {
      if (s1 !== s2) {
        var fwd = s1 === 'E' ? p2.x >= p1.x : p2.x <= p1.x;
        if (fwd) { var mx = (q1.x + q2.x) / 2; pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]; }
        else { var dy = Math.max(a.b, b.b) + 24; pts = [p1, q1, { x: q1.x, y: dy }, { x: q2.x, y: dy }, q2, p2]; }
      } else {
        var x = s1 === 'E' ? Math.max(q1.x, q2.x) : Math.min(q1.x, q2.x);
        pts = [p1, { x: x, y: p1.y }, { x: x, y: p2.y }, p2];
      }
    } else if (vert(s1)) {
      var c = { x: p1.x, y: p2.y };
      var ok1 = (c.y - p1.y) * DIR[s1][1] > 0, ok2 = (c.x - p2.x) * DIR[s2][0] > 0;
      pts = ok1 && ok2 ? [p1, c, p2] : [p1, q1, { x: q2.x, y: q1.y }, q2, p2];
    } else {
      var c2 = { x: p2.x, y: p1.y };
      var okA = (c2.x - p1.x) * DIR[s1][0] > 0, okB = (c2.y - p2.y) * DIR[s2][1] > 0;
      pts = okA && okB ? [p1, c2, p2] : [p1, q1, { x: q1.x, y: q2.y }, q2, p2];
    }
    return tidy(pts);
  }
  function labelSpot(pts) {
    var best = 0, bi = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var len = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
      if (len > best + 0.5) { best = len; bi = i; }
    }
    var a = pts[bi], b = pts[bi + 1] || a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function edgeColor(label, o) {
    var s = String(label || '');
    if (!s) return '#56657A';
    if (s === o.no || /^(no|n|아니오?|아니요|いいえ)\b/i.test(s)) return '#B0402F';
    if (s === o.yes || /^(yes|y|예|네|はい)\b/i.test(s)) return '#1E7A46';
    return '#56657A';
  }
  function nodeSvg(p) {
    var cx = p.x, cy = p.y, w = p.w, h = p.h, top = p.t;
    var y0 = cy - ((p.lines.length - 1) * LINE_H) / 2 + 4;
    function texts(fill, bold) {
      return p.lines.map(function (ln, i) {
        return '<text x="' + cx + '" y="' + (y0 + i * LINE_H) + '" text-anchor="middle" font-size="12.5"' + (bold ? ' font-weight="700"' : '') + ' fill="' + fill + '">' + xml(ln) + '</text>';
      }).join('');
    }
    if (p.type === 'decision') {
      return '<polygon points="' + cx + ',' + top + ' ' + p.r + ',' + cy + ' ' + cx + ',' + p.b + ' ' + p.l + ',' + cy + '" fill="#FFF6D8" stroke="#D9A400" stroke-width="1.6" filter="url(#SH)"/>' + texts(INK);
    }
    if (p.type === 'start' || p.type === 'end') {
      return '<rect x="' + p.l + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="' + (h / 2) + '" fill="#2E6FB0" stroke="#24598F" stroke-width="1.4" filter="url(#SH)"/>' + texts('#FFFFFF', true);
    }
    if (p.type === 'io') {
      var sk = 14;
      return '<polygon points="' + (p.l + sk) + ',' + top + ' ' + p.r + ',' + top + ' ' + (p.r - sk) + ',' + p.b + ' ' + p.l + ',' + p.b + '" fill="#FCE7E4" stroke="#C0563E" stroke-width="1.5" filter="url(#SH)"/>' + texts(INK);
    }
    return '<rect x="' + p.l + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="7" fill="#F4F8FC" stroke="#5A85AE" stroke-width="1.5" filter="url(#SH)"/>' + texts(INK);
  }
  function chip(x, y, text, color) {
    var w = textW(text) + 12;
    return '<rect x="' + (x - w / 2) + '" y="' + (y - 9) + '" width="' + w + '" height="17" rx="3" fill="#FFFFFF" stroke="#D7DEE6"/>'
      + '<text x="' + x + '" y="' + (y + 3.5) + '" text-anchor="middle" font-size="11" font-weight="700" fill="' + color + '">' + xml(text) + '</text>';
  }
  function legendSvg(o, cx, y) {
    var L = o.legend; if (!L) return '';
    var items = [['t', L.terminal], ['p', L.process], ['d', L.decision], ['m', L.message]];
    var cell = 165, x0 = cx - (cell * items.length) / 2;
    return items.map(function (it, i) {
      var x = x0 + i * cell, s;
      if (it[0] === 't') s = '<rect x="' + x + '" y="' + (y - 9) + '" width="22" height="13" rx="6.5" fill="#2E6FB0" stroke="#24598F"/>';
      else if (it[0] === 'd') s = '<polygon points="' + (x + 11) + ',' + (y - 10) + ' ' + (x + 22) + ',' + (y - 2) + ' ' + (x + 11) + ',' + (y + 6) + ' ' + x + ',' + (y - 2) + '" fill="#FFF6D8" stroke="#D9A400"/>';
      else if (it[0] === 'm') s = '<polygon points="' + (x + 4) + ',' + (y - 9) + ' ' + (x + 22) + ',' + (y - 9) + ' ' + (x + 18) + ',' + (y + 4) + ' ' + x + ',' + (y + 4) + '" fill="#FCE7E4" stroke="#C0563E"/>';
      else s = '<rect x="' + x + '" y="' + (y - 9) + '" width="22" height="13" rx="3" fill="#F4F8FC" stroke="#5A85AE"/>';
      return s + '<text x="' + (x + 30) + '" y="' + (y + 1) + '" font-size="11.5" fill="#56657A">' + xml(it[1] || '') + '</text>';
    }).join('');
  }
  /** Each edge's sides and path: [{ i, e, s1, s2, pts }] (edges to a missing node are left out). */
  function edgePaths(graph, boxes) {
    return (graph.edges || []).map(function (e, i) {
      var a = boxes[e.from], b = boxes[e.to];
      if (!a || !b) return null;
      var auto = autoSides(a, b), s1 = e.fromSide || auto[0], s2 = e.toSide || auto[1];
      return { i: i, e: e, s1: s1, s2: s2, pts: route(a, s1, b, s2) };
    }).filter(Boolean);
  }
  /** Content bounds: nodes and edge paths. */
  function bounds(graph) {
    var boxes = {}, l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    (graph.nodes || []).forEach(function (n) {
      var p = measure(n); boxes[n.id] = p;
      l = Math.min(l, p.l); t = Math.min(t, p.t); r = Math.max(r, p.r); b = Math.max(b, p.b);
    });
    edgePaths(graph, boxes).forEach(function (ep) {
      ep.pts.forEach(function (p) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); });
    });
    if (l === Infinity) { l = 0; t = 0; r = 400; b = 120; }
    return { l: l, t: t, r: r, b: b, boxes: boxes };
  }

  /**
   * SVG of a free graph. o: { heading, legend: { terminal, process, decision, message }, yes, no,
   * uid (unique id suffix), scale (outer size factor), frame ({ l, t, r, b } to keep while dragging),
   * edit ({ sel: { kind: 'node'|'edge', id|i } } — draws hit areas, ports and the selection) }.
   * Returns { svg, width, height, view: { x, y, w, h } }.
   */
  function draw(graph, o) {
    o = o || {};
    var uid = o.uid || 'f', B = bounds(graph), boxes = B.boxes;
    var f = o.frame || B;
    var minX = Math.min(f.l, B.l) - PAD, maxX = Math.max(f.r, B.r) + PAD;
    var minY = Math.min(f.t, B.t) - (o.heading ? HEAD_H : PAD), maxY = Math.max(f.b, B.b) + (o.legend ? LEGEND_H + 10 : PAD);
    if (o.legend) { var need = 165 * 4 + 40; if (maxX - minX < need) { var grow = (need - (maxX - minX)) / 2; minX -= grow; maxX += grow; } }
    var W = maxX - minX, H = maxY - minY, cx = (minX + maxX) / 2;
    var sc = o.scale || 1, ed = o.edit, sel = ed && ed.sel;
    var parts = [];
    parts.push('<defs><marker id="AR" markerWidth="11" markerHeight="11" refX="8.5" refY="3.2" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9.5,3.2 L0,6.4 Z" fill="' + EDGE + '"/></marker>'
      + '<marker id="ARS" markerWidth="11" markerHeight="11" refX="8.5" refY="3.2" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9.5,3.2 L0,6.4 Z" fill="#D6336C"/></marker>'
      + '<filter id="SH" x="-12%" y="-25%" width="124%" height="150%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#8C9BAA" flood-opacity="0.45"/></filter></defs>');
    parts.push('<rect class="fbg" x="' + minX + '" y="' + minY + '" width="' + W + '" height="' + H + '" fill="#FFF"/>');
    if (o.heading) parts.push('<text x="' + cx + '" y="' + (minY + 34) + '" text-anchor="middle" font-size="16" font-weight="700" fill="#0A4F8C">' + xml(o.heading) + '</text>');
    var paths = edgePaths(graph, boxes);
    paths.forEach(function (ep) {
      var on = sel && sel.kind === 'edge' && sel.i === ep.i;
      var pts = ep.pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
      var g = '<g class="fe" data-ei="' + ep.i + '">';
      if (ed) g += '<polyline points="' + pts + '" fill="none" stroke="transparent" stroke-width="12" style="cursor:pointer"/>';
      g += '<polyline points="' + pts + '" fill="none" stroke="' + (on ? '#D6336C' : EDGE) + '" stroke-width="' + (on ? 2.4 : 1.7) + '" marker-end="url(#' + (on ? 'ARS' : 'AR') + ')"/>';
      if (ep.e.label) { var s = labelSpot(ep.pts); g += chip(s.x, s.y, ep.e.label, edgeColor(ep.e.label, o)); }
      if (on) {
        var p0 = ep.pts[0], pn = ep.pts[ep.pts.length - 1];
        g += '<circle class="feh" data-end="from" cx="' + p0.x + '" cy="' + p0.y + '" r="6" fill="#FFF" stroke="#D6336C" stroke-width="2" style="cursor:move"/>';
        g += '<circle class="feh" data-end="to" cx="' + pn.x + '" cy="' + pn.y + '" r="6" fill="#FFF" stroke="#D6336C" stroke-width="2" style="cursor:move"/>';
      }
      parts.push(g + '</g>');
    });
    (graph.nodes || []).forEach(function (n) {
      var p = boxes[n.id], on = sel && sel.kind === 'node' && sel.id === n.id;
      var g = '<g class="fn" data-id="' + xml(n.id) + '"' + (ed ? ' style="cursor:move"' : '') + '>' + nodeSvg(p);
      if (on) g += '<rect x="' + (p.l - 5) + '" y="' + (p.t - 5) + '" width="' + (p.w + 10) + '" height="' + (p.h + 10) + '" rx="6" fill="none" stroke="#D6336C" stroke-width="1.6" stroke-dasharray="5 3"/>';
      if (ed) ['N', 'E', 'S', 'W'].forEach(function (sd) {
        var q = port(p, sd);
        g += '<circle class="fp" data-side="' + sd + '" cx="' + q.x + '" cy="' + q.y + '" r="5.5" fill="#FFFFFF" stroke="#1F6FEB" stroke-width="1.6" style="cursor:crosshair"/>';
      });
      parts.push(g + '</g>');
    });
    if (o.legend) parts.push(legendSvg(o, cx, maxY - 22));
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="flow-svg" width="' + Math.round(W * sc) + '" height="' + Math.round(H * sc) + '" viewBox="' + minX + ' ' + minY + ' ' + W + ' ' + H + '" font-family="Arial,sans-serif" font-size="12">'
      + parts.join('').replace(/url\(#(AR|ARS|SH)\)/g, 'url(#$1-' + uid + ')').replace(/id="(AR|ARS|SH)"/g, 'id="$1-' + uid + '"') + '</svg>';
    return { svg: svg, width: Math.round(W * sc), height: Math.round(H * sc), view: { x: minX, y: minY, w: W, h: H } };
  }
  return { draw: draw, measure: measure, bounds: bounds, autoSides: autoSides, port: port };
}

export const FLOW_KIT_SOURCE = flowKit.toString();
const KIT = flowKit();
export const drawFreeFlow = KIT.draw;
export const measureFlowNode = KIT.measure;

/** A graph whose nodes carry the user's positions (drawn by drawFreeFlow, not auto-laid-out). */
export const isFreeGraph = (g) => Boolean(g && !Array.isArray(g) && g.layout === 'free' && Array.isArray(g.nodes));
