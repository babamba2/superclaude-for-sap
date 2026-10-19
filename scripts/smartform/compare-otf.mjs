#!/usr/bin/env node
// Compare a SmartForm preview (build-preview.mjs HTML) with what SAP printed
// (OTF from the MCP tool RenderSmartForm): every text run SAP put on the
// first page is looked up in the preview, with its position (mm), font and
// size; SAP's lines are matched against the preview's borders.
//
//   node compare-otf.mjs <form.sap.otf.txt> <FORM-preview.html> [--out report.json]
//
// Report: { score, texts: {sap, matched, missing[], extra[], moved[], font[]},
//           lines: {sap, matched, missing[], extra[]}, ... }
// Positions: x = left edge, y = baseline, in mm from the page's top-left.
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { findBrowser, runBrowser, code128Codes, legacyDbcs } from './build-preview.mjs';

const TW = 25.4 / 1440; // twip → mm
const POS_TOL = 1.0;     // mm
const LINE_TOL = 0.6;    // mm

// ── OTF ─────────────────────────────────────────────────────────────────────
export function parseOtf(text, pageNo = 1) {
  const runs = [];
  const lines = [];
  const bitmaps = [];
  let page = 0;
  let x = 0;
  let y = 0;
  let font = { family: '', pt: 0, bold: false, italic: false };
  let run = null;
  let win = '';
  let bc = null; // bar code being read (BC → BP → BS)
  let sw = 0; // SW: width of a blank in the current font (twips)
  const flush = () => { if (run && run.text.trim()) runs.push(run); run = null; };
  for (const raw of text.split(/\r?\n/)) {
    const cmd = raw.slice(0, 2);
    const p = raw.slice(2);
    if (cmd === 'OP') { page++; continue; }
    if (page !== pageNo) continue;
    switch (cmd) {
      case 'IN':
        if (p.startsWith('06')) win = p.slice(2).trim();
        break;
      case 'MT':
        flush();
        x = Number(p.slice(0, 5));
        y = Number(p.slice(5, 10));
        break;
      case 'SW':
        sw = Number(p.slice(0, 5)) || 0;
        break;
      case 'FC': {
        flush();
        // a family whose name carries the weight (ARIAL_B) is bold whatever the flag says
        font = { family: p.slice(0, 8).trim(), pt: Number(p.slice(8, 11)) / 10, bold: p[11] === 'X' || /_B$|_BD$/.test(p.slice(0, 8).trim()), italic: p[12] === 'X' };
        // an SW follows for single-byte fonts; the FC record carries the blank width too
        // ("…4103 00144" — agrees with SW in all 125 cases), used when no SW comes
        // (ZFI_ZFIR10820 COURIER 12 pt on SAPWIN); not for DBCS fonts, whose blanks stay at half
        // an em here (their FC width, ~0.51 em, made the preview worse both ways — item 24)
        sw = /^(KP|CN|JP|TW|ANDALE)/.test(p.slice(0, 8).trim()) ? 0 : Number((/4103(\d{5})/.exec(p) || [])[1]) || 0;
        break;
      }
      case 'ST': {
        const w = Number(p.slice(0, 5));
        const len = Number(p.slice(5, 7));
        const s = p.slice(7, 7 + Math.max(0, Math.round(len / 2)));
        if (!run) run = { x: x * TW, y: y * TW, text: '', widthMm: 0, ...font, window: win, sw: sw || font.pt * 10 }; // none: half an em
        // NULs hold the place of a page total not yet known (SFSY-FORMPAGES(4ZC) = "1" + 3 NULs):
        // they print nothing — leave them out of the text and the inked width
        const nul = (s.match(/\0/g) || []).length;
        // legacy DBCS bytes in Latin-1 text print as Hangul / CJK in a DBCS font (as the preview reads them)
        run.text += legacyDbcs(s.replace(/\0/g, ''), font.family);
        // where each ST's ink starts (leading blanks at its average glyph width), for the
        // per-piece check of chains over long blank runs (R85, reviewer J)
        const lead = s.length - s.trimStart().length;
        // (a blank advances by SW when the font sent one — reviewer KL)
        if (s.trim()) (run.parts = run.parts || []).push({ x: (x + lead * (sw || (s.length ? w / s.length : 0))) * TW, text: s.trim() });
        run.widthMm += (s.length ? w * (1 - nul / s.length) : w) * TW;
        x += w;
        break;
      }
      case 'LI': {
        const lx = Number(p.slice(0, 5)) * TW;
        const ly = Number(p.slice(5, 10)) * TW;
        const dir = p[10];
        const len = Number(p.slice(11, 16)) * TW;
        const th = Number(p.slice(16, 21)) * TW;
        lines.push(dir === 'V' ? { dir, pos: lx, from: ly, to: ly + len, th, window: win } : { dir: 'H', pos: ly, from: lx, to: lx + len, th, window: win });
        break;
      }
      case 'BM':
        flush();
        bitmaps.push({ x: x * TW, y: y * TW, w: Number(p.slice(0, 5)) * TW, h: Number(p.slice(5, 10)) * TW, window: win });
        break;
      // bar code: BC name, BP "SCN7X00080A" (module = 7 + 1 and height 80, in 1/600 inch —
      // measured on SAP's PDF), BS value; the bars stand on the MT baseline
      case 'BC':
        flush();
        bc = { x: x * TW, base: y * TW, window: win, name: p.slice(0, 8).trim() };
        break;
      case 'BP': {
        // (a blank may stand for the letter: ZWM_STUFFING_REQUESTN BRL3 "S3N5 0015030")
        const m = /^..[A-Z](\d+)[A-Z ](\d{5})/.exec(p);
        if (bc && m) { bc.module = (Number(m[1]) + 1) * 25.4 / 600; bc.h = Number(m[2]) * 25.4 / 600; }
        break;
      }
      case 'BS':
        if (bc && bc.module) {
          const w = code128Codes(p.trimEnd()).reduce((s, c) => s + (c === 106 ? 13 : 11), 0) * bc.module;
          bitmaps.push({ x: bc.x, y: bc.base - bc.h, w, h: bc.h, window: bc.window, barcode: bc.name });
        }
        bc = null;
        break;
      default:
        break;
    }
  }
  flush();
  // blanks around a run (numeric fields printed in their output length) move its x / width
  for (const r of runs) {
    const lead = r.text.length - r.text.trimStart().length;
    const trail = r.text.length - r.text.trimEnd().length;
    r.x += (lead * r.sw) * TW;
    r.widthMm = Math.max(0, r.widthMm - ((lead + trail) * r.sw) * TW);
    r.text = r.text.replace(/\s+/g, ' ').trim();
    delete r.sw;
  }
  return { runs, lines, bitmaps, pages: page };
}

// ── preview measurement (runs in the browser) ───────────────────────────────
const MEASURE = `<script>(function(){
var Z=Number((document.querySelector('.sheet')||{}).dataset?.zoom)||1, MM=25.4/96/Z, out={runs:[],lines:[],images:[]};
var sheet=document.querySelector('.sheet'), o=sheet.getBoundingClientRect();
var ctx=document.createElement('canvas').getContext('2d');
function clipped(el,r){for(var a=el;a&&a!==sheet;a=a.parentElement){var cs=getComputedStyle(a);if(cs.overflow!=='visible'){var b=a.getBoundingClientRect();var cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;if(cx<b.left-0.5||cx>b.right+0.5||cy<b.top-0.5||cy>b.bottom+0.5)return true;}}return false;}
var w=document.createTreeWalker(sheet,NodeFilter.SHOW_TEXT),n,cur=null,carryPar=null,carryNb=false;
while((n=w.nextNode())){var t=n.nodeValue;
 // a blank-only node between two pieces of a run keeps its blank ("A-B C-D" over two .nb spans)
 if(!t.trim()){var bp=n.parentElement&&n.parentElement.closest('.par');if(cur&&bp&&bp===carryPar&&t.length)cur.text+=' ';continue;}var el=n.parentElement,cs=getComputedStyle(el);
 if(cs.display==='none'||cs.visibility==='hidden')continue;
 ctx.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;var asc=ctx.measureText('Hg').fontBoundingBoxAscent;
 // a .nb span (a hyphenated word kept together) is not a run of its own: the run goes on through it
 // (only text right next to it: a tab span in between starts a new run, as SAP's MT does)
 var par=el.closest('.par'),nb=el.closest('.nb'),nbHere=!!nb,ps=nb?nb.previousSibling:n.previousSibling;
 var touching=nbHere?(ps&&(ps.nodeType===3||(ps.classList&&ps.classList.contains('nb')))):(carryNb&&ps&&ps.classList&&ps.classList.contains('nb'));
 var sameFont=cur&&cur.family===cs.fontFamily&&cur.bold===(parseInt(cs.fontWeight)>=600)&&Math.abs(cur.pt-parseFloat(cs.fontSize)*0.75)<0.1;
 if(!(cur&&par&&par===carryPar&&touching&&sameFont)){if(cur)out.runs.push(cur);cur=null;}
 carryPar=par;carryNb=nbHere;
 var rg=document.createRange();
 for(var i=0;i<t.length;i++){rg.setStart(n,i);rg.setEnd(n,i+1);var rs=rg.getClientRects();if(!rs.length){continue;}var r=rs[0];
  var vis=!clipped(el,r);var top=Math.round(r.top*4)/4;
  var newRun=!cur||Math.abs(cur.top-top)>1||!vis!==!cur.vis;
  if(newRun&&/\\s/.test(t[i])){if(cur){out.runs.push(cur);cur=null;}continue;}
  if(newRun){if(cur)out.runs.push(cur);cur={top:top,vis:vis,x:(r.left-o.left)*MM,y:(r.top-o.top+asc*Z)*MM,text:'',family:cs.fontFamily,pt:parseFloat(cs.fontSize)*0.75,bold:parseInt(cs.fontWeight)>=600,italic:cs.fontStyle==='italic',right:r.right};}
  cur.text+=t[i];if(!/\\s/.test(t[i]))cur.right=r.right;}}
if(cur)out.runs.push(cur);
document.querySelectorAll('.sheet *').forEach(function(e){var cs=getComputedStyle(e);var b=e.getBoundingClientRect();if(!b.width&&!b.height)return;if(cs.visibility==='hidden')return;
 [['top','H'],['bottom','H'],['left','V'],['right','V']].forEach(function(s){var wd=parseFloat(cs['border-'+s[0]+'-width']);if(!wd||cs['border-'+s[0]+'-style']==='none')return;
  if(s[1]==='H')out.lines.push({dir:'H',pos:((s[0]==='top'?b.top:b.bottom)-o.top)*MM,from:(b.left-o.left)*MM,to:(b.right-o.left)*MM,th:wd*25.4/96});
  else out.lines.push({dir:'V',pos:((s[0]==='left'?b.left:b.right)-o.left)*MM,from:(b.top-o.top)*MM,to:(b.bottom-o.top)*MM,th:wd*25.4/96});});
 if(e.tagName==='IMG'||(e.tagName==='svg'&&e.classList.contains('bc'))){var vl=b.left,vt=b.top,vr=b.right,vb=b.bottom;for(var a=e.parentElement;a&&a!==sheet;a=a.parentElement){if(getComputedStyle(a).overflow!=='visible'){var c=a.getBoundingClientRect();vl=Math.max(vl,c.left);vt=Math.max(vt,c.top);vr=Math.min(vr,c.right);vb=Math.min(vb,c.bottom);}}
  var shown=b.width*b.height?Math.max(0,vr-vl)*Math.max(0,vb-vt)/(b.width*b.height):0;
  out.images.push({x:(b.left-o.left)*MM,y:(b.top-o.top)*MM,w:b.width*MM,h:b.height*MM,shown:shown});}});
out.runs.forEach(function(r){r.text=r.text.replace(/\\u2060/g,'').replace(/\\s+/g,' ').trim();r.widthMm=(r.right-o.left)*MM-r.x;delete r.right;delete r.top;});
out.runs=out.runs.filter(function(r){return r.text;});
var s=document.createElement('script');s.type='application/json';s.id='sf-measure';s.textContent=JSON.stringify(out);document.body.appendChild(s);})();</script>`;

export function measurePreview(htmlFile) {
  const browser = findBrowser();
  if (!browser) throw new Error('no Chrome / Edge / Chromium found (set SC4SAP_CHROME)');
  const html = readFileSync(htmlFile, 'utf8').replace('</body>', `${MEASURE}</body>`);
  const dir = mkdtempSync(join(tmpdir(), 'sf-measure-'));
  const tmp = join(dir, 'page.html');
  writeFileSync(tmp, html);
  const profile = join(tmpdir(), `sc4sap-smartform-preview-chrome-${process.pid}`);
  const dom = runBrowser(browser, ['--window-size=1000,1400', '--dump-dom', pathToFileURL(tmp).href], profile);
  try { rmSync(profile, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); } catch { /* still locked */ }
  const m = /<script type="application\/json" id="sf-measure">([\s\S]*?)<\/script>/.exec(dom.stdout || '');
  if (!m) throw new Error(`measurement failed: ${(dom.stderr || '').slice(-400)}`);
  return JSON.parse(m[1]);
}

// ── compare ─────────────────────────────────────────────────────────────────
// dates / times only differ by the day of the render (SY-DATUM / SY-UZEIT): compare them as one
const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/\d{4}[./-]\d{2}[./-]\d{2}/g, '<date>').replace(/\d{2}:\d{2}(:\d{2})?/g, '<time>');
const fam = (f) => {
  const s = String(f).toLowerCase().split(',')[0]; // the first family of a CSS list is the one asked for
  if (/courier/.test(s)) return 'courier';
  if (/times|timecyr|time_i7/.test(s)) return 'times';
  if (/andale/.test(s)) return 'andale';
  if (/thangsan|angsana/.test(s)) return 'angsana';
  if (/helv|arial/.test(s)) return 'helvetica';
  if (/dodum|dotum|돋움/.test(s)) return 'dotum';
  if (/gulim|굴림/.test(s)) return 'gulim';
  if (/kpsammul|gungsuh|궁서/.test(s)) return 'sammul';
  if (/jpmincho|ms mincho|明朝/.test(s)) return 'mincho';
  if (/jpgothic|ms gothic|ゴシック/.test(s)) return 'jgothic';
  if (/batang|바탕/.test(s)) return 'batang';
  if (/cnsong|simsun|宋/.test(s)) return 'song';
  if (/cnhei|simhei|yahei/.test(s)) return 'hei';
  if (/cnkai|kaiti|楷/.test(s)) return 'kai';
  if (/twming|twsong|mingliu/.test(s)) return 'ming';
  return s.replace(/["']/g, '').split(',')[0].trim();
};
const r1 = (v) => Math.round(v * 10) / 10;

/** Join runs that continue each other on one baseline (a character format or a font
 *  change splits a line into runs — on SAP's side by FC, on the preview's by spans). */
function joinRuns(runs) {
  const out = [];
  for (const r of [...runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = out[out.length - 1];
    const gap = last ? r.x - (last.x + last.widthMm) : Infinity;
    if (last && Math.abs(last.y - r.y) < 0.3 && gap > -0.3 && gap < 0.8 && (r.vis !== false) === (last.vis !== false)) {
      last.text += (gap > 0.4 ? ' ' : '') + r.text;
      last.widthMm = r.x + r.widthMm - last.x;
      if (last.parts || r.parts) last.parts = [...(last.parts || []), ...(r.parts || [])];
    } else out.push({ ...r });
  }
  return out;
}

export function compare(sapIn, prevIn) {
  const sap = { ...sapIn, runs: joinRuns(sapIn.runs) };
  const prev = { ...prevIn, runs: joinRuns(prevIn.runs) };
  const mine = prev.runs.filter((r) => r.vis !== false);
  const hidden = prev.runs.filter((r) => r.vis === false);
  const used = new Set();
  const matched = [];
  const missing = [];
  const pick = (cands, s) => {
    let best = null;
    for (const c of cands) {
      if (used.has(c)) continue;
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      if (!best || d < best.d) best = { c, d };
    }
    return best;
  };
  // exact text first, nearest; then text contained in one of mine (split differently)
  for (const s of sap.runs) {
    const t = norm(s.text);
    // the same text first; blanks between words print alike, so the blank-insensitive
    // match only counts nearby ("0 0 1 2" far away is not "0012"; near, the width check decides)
    const loose = pick(mine.filter((m) => norm(m.text).replace(/ /g, '') === t.replace(/ /g, '')), s);
    const b = pick(mine.filter((m) => norm(m.text) === t), s) || (loose && loose.d < 15 ? loose : null);
    // the same text far away waits until the chains of this baseline had their turn
    // ("1,000.00 USD" in another window vs "1,000.00" + "USD" here)
    if (b && b.d < 5) { used.add(b.c); matched.push({ s, m: b.c, how: 'exact' }); }
    else missing.push(s);
  }
  const farExact = () => {
    for (const s of [...missing]) {
      const t = norm(s.text);
      const b = pick(mine.filter((m) => norm(m.text) === t), s);
      if (!b) continue;
      used.add(b.c);
      missing.splice(missing.indexOf(s), 1);
      matched.push({ s, m: b.c, how: 'exact' });
    }
  };
  // one run on one side, neighbours on one baseline on the other ("&DATE& &TIME&" is one
  // ST in the OTF and two spans here; table cells the other way round): match the chain
  const flat = (x) => norm(x).replace(/ /g, '');
  const chainFor = (target, pool, isFree) => {
    const want = flat(target.text);
    if (!want) return null;
    // blanks the target holds after its n-th ink character: a piece may end in blanks
    // (SAP's ST width carries them, the preview's stops at the ink), so the gap may grow
    const tn = target.text.replace(/\s/g, ' ').trim().replace(/\d{4}[./-]\d{2}[./-]\d{2}/g, '<date>').replace(/\d{2}:\d{2}(:\d{2})?/g, '<time>');
    const blanksAfter = (n) => {
      let k = 0, i = 0;
      for (; i < tn.length && k < n; i++) if (tn[i] !== ' ') k++;
      let b = 0;
      while (i < tn.length && tn[i] === ' ') { b++; i++; }
      return b;
    };
    const row = pool.filter((r) => isFree(r) && Math.abs(r.y - target.y) < 0.3).sort((a, b) => a.x - b.x);
    let best = null;
    for (let i = 0; i < row.length; i++) {
      let txt = '';
      let wide = false;
      for (let j = i; j < row.length && j < i + 6; j++) {
        const gap = j > i ? row[j].x - (row[j - 1].x + row[j - 1].widthMm) : 0;
        // a longer blank run (collapsed to one blank in the text) only joins pieces
        // whose chain starts and ends where the target does
        if (gap > 80) break;
        if (gap > 3 + 1.5 * blanksAfter(txt.length)) wide = true;
        txt += flat(row[j].text);
        if (!want.startsWith(txt)) break;
        if (j > i && txt === want) {
          if (wide && (Math.abs(row[i].x - target.x) > 1 || Math.abs(row[j].x + row[j].widthMm - target.x - target.widthMm) > 1)) break;
          // every piece of a wide chain must stand where one of SAP's pieces starts with it
          // (only the ends were checked: "Qty" | "10" 25 mm off | "EA" scored 100 — reviewer J)
          if (wide && target.parts) {
            const ok = row.slice(i, j + 1).every((r) => target.parts.some((p) => {
              const a = flat(p.text), b = flat(r.text);
              return (a.startsWith(b) || b.startsWith(a)) && Math.abs(p.x - r.x) < 1.5;
            }));
            if (!ok) break;
          }
          const d = Math.abs(row[i].x - target.x);
          if (!best || d < best.d) best = { d, runs: row.slice(i, j + 1) };
          break;
        }
      }
    }
    return best && best.d < 15 ? best.runs : null;
  };
  for (const s of [...missing]) {
    const runs = chainFor(s, mine, (m) => !used.has(m));
    if (!runs) continue;
    runs.forEach((m) => used.add(m));
    const last = runs[runs.length - 1];
    const m = { ...runs[0], text: runs.map((r) => r.text).join(' '), widthMm: last.x + last.widthMm - runs[0].x };
    missing.splice(missing.indexOf(s), 1);
    matched.push({ s, m, how: 'exact' });
  }
  for (const m of mine.filter((x) => !used.has(x))) {
    const runs = chainFor(m, missing, () => true);
    if (!runs) continue;
    used.add(m);
    const lastS = runs[runs.length - 1];
    const span = lastS.x + lastS.widthMm - runs[0].x;
    runs.forEach((s, k) => {
      missing.splice(missing.indexOf(s), 1);
      // the first piece carries the width check of the whole chain; the others only y / font
      if (!k) matched.push({ s: { ...s, widthMm: span }, m, how: 'exact' });
      else matched.push({ s, m: { ...m, x: s.x }, how: 'chain-tail' });
    });
  }
  farExact();
  for (const s of [...missing]) {
    const t = norm(s.text);
    const b = pick(mine.filter((m) => norm(m.text).includes(t) || t.includes(norm(m.text))), s);
    if (b && b.d < 15) {
      missing.splice(missing.indexOf(s), 1);
      matched.push({ s, m: b.c, how: 'partial' });
    }
  }
  const moved = [];
  const font = [];
  for (const { s, m, how } of matched) {
    let dx = m.x - s.x;
    if (how === 'partial') {
      const i = norm(m.text).indexOf(norm(s.text));
      if (i > 0) dx = NaN; // starts inside a longer preview run - x not comparable
    }
    const dy = m.y - s.y;
    if (Math.abs(dy) > POS_TOL || (!Number.isNaN(dx) && Math.abs(dx) > POS_TOL))
      moved.push({ text: s.text, window: s.window, sap: [r1(s.x), r1(s.y)], preview: [r1(m.x), r1(m.y)], dx: r1(dx), dy: r1(dy), how });
    const sizeOff = Math.abs(m.pt - s.pt) > 0.6;
    if (fam(m.family) !== fam(s.family) || sizeOff || m.bold !== s.bold || !!m.italic !== !!s.italic)
      font.push({ text: s.text, window: s.window, sap: `${s.family} ${s.pt}pt${s.bold ? ' bold' : ''}${s.italic ? ' italic' : ''}`, preview: `${fam(m.family)} ${r1(m.pt)}pt${m.bold ? ' bold' : ''}${m.italic ? ' italic' : ''}` });
    if (how === 'exact' && Math.abs(m.widthMm - s.widthMm) > Math.max(1.5, s.widthMm * 0.08))
      font.push({ text: s.text, window: s.window, widthMm: { sap: r1(s.widthMm), preview: r1(m.widthMm) } });
  }
  const extra = mine.filter((m) => !used.has(m) && !matched.some((x) => x.m === m)).map((m) => ({ text: m.text, at: [r1(m.x), r1(m.y)] }));
  const hiddenButPrinted = missing.filter((s) => hidden.some((h) => norm(h.text).includes(norm(s.text)) || norm(s.text).includes(norm(h.text))));

  // lines: SAP's within tolerance of a preview border of the same direction
  const lm = new Set();
  const lineMissing = [];
  const lineThick = [];
  for (const l of sap.lines) {
    const covers = (p) => p.dir === l.dir && Math.abs(p.pos - l.pos) <= LINE_TOL &&
      Math.min(p.to, l.to) - Math.max(p.from, l.from) >= 0.8 * (l.to - l.from);
    // a free preview line first (a line drawn twice pairs up); else one long preview line
    // may cover several of SAP's per-cell segments
    // of several (a template frame on a window box) the one of the closest thickness
    const byTh = (a, b) => Math.abs((a.p.th || 0) - (l.th || 0)) - Math.abs((b.p.th || 0) - (l.th || 0));
    const free = prev.lines.map((p, i) => ({ p, i })).filter(({ p, i }) => !lm.has(i) && covers(p)).sort(byTh)[0];
    if (free) lm.add(free.i);
    const hit = free?.p || prev.lines.map((p) => ({ p })).filter(({ p }) => covers(p)).sort(byTh)[0]?.p;
    if (!hit) lineMissing.push({ dir: l.dir, pos: r1(l.pos), from: r1(l.from), to: r1(l.to), window: l.window });
    // thickness: SAP's LI width against the border width (0.15 mm tolerance)
    // (LI width 0 = the printer's thinnest line: anything up to 0.3 mm)
    else if (l.th ? Math.abs((hit.th || 0) - l.th) > 0.15 : (hit.th || 0) > 0.3)
      lineThick.push({ dir: l.dir, pos: r1(l.pos), from: r1(l.from), to: r1(l.to), sap: Math.round(l.th * 100) / 100, preview: Math.round(hit.th * 100) / 100, window: l.window });
  }
  // a preview line lying on one of SAP's (a template frame on the window box) is not seen twice
  // (only a true duplicate: within 0.2 mm, so a double rule 0.4 mm apart still counts — ZMMM20930)
  const onSap = (p) => sap.lines.some((l) => l.dir === p.dir && Math.abs(p.pos - l.pos) <= 0.2 &&
    Math.min(p.to, l.to) - Math.max(p.from, l.from) >= 0.8 * (p.to - p.from));
  const lineExtra = prev.lines.filter((p, i) => !lm.has(i) && !onSap(p)).map((p) => ({ dir: p.dir, pos: r1(p.pos), from: r1(p.from), to: r1(p.to) }));

  // a partial match is a changed text, a width off by more than 1.5 mm / 8 % a wrong font metric: both count
  const changed = matched.filter((x) => x.how === 'partial').map((x) => ({ text: x.s.text, window: x.s.window, preview: x.m.text }));
  const bad = new Set([...missing.map((s) => s.text), ...moved.map((m) => m.text), ...font.map((f) => f.text), ...changed.map((c) => c.text)]);
  const ok = sap.runs.filter((s) => !bad.has(s.text)).length;
  // extras count against the score as much as misses (text the print does not have, lines,
  // graphics); graphics must sit within 1 mm in place and size and be shown whole
  const textScore = sap.runs.length + extra.length ? ok / (sap.runs.length + extra.length) : 1;
  const lineScore = sap.lines.length + lineExtra.length ? (sap.lines.length - lineMissing.length - lineThick.length) / (sap.lines.length + lineExtra.length) : 1;
  const usedImg = new Set();
  const bmMiss = [];
  for (const b of sap.bitmaps) {
    const i = prev.images.findIndex((p, k) => !usedImg.has(k) && Math.abs(p.x - b.x) <= 1 && Math.abs(p.y - b.y) <= 1 && Math.abs(p.w - b.w) <= 1 && Math.abs(p.h - b.h) <= 1 && p.shown >= 0.95);
    if (i >= 0) usedImg.add(i);
    else bmMiss.push({ window: b.window, at: [r1(b.x), r1(b.y)], size: [r1(b.w), r1(b.h)] });
  }
  const bmExtra = prev.images.filter((_, k) => !usedImg.has(k)).map((p) => ({ at: [r1(p.x), r1(p.y)], size: [r1(p.w), r1(p.h)], shown: Math.round(p.shown * 100) }));
  const bmTotal = sap.bitmaps.length + bmExtra.length;
  const bmScore = bmTotal ? (sap.bitmaps.length - bmMiss.length) / bmTotal : null;
  const score = Math.round((bmScore === null ? 0.8 * textScore + 0.2 * lineScore : 0.7 * textScore + 0.2 * lineScore + 0.1 * bmScore) * 1000) / 10;
  return {
    score,
    texts: {
      sap: sap.runs.length, matched: matched.length, missing: missing.map((s) => ({ text: s.text, window: s.window, at: [r1(s.x), r1(s.y)], font: `${s.family} ${s.pt}pt${s.bold ? ' bold' : ''}`, clippedInPreview: hiddenButPrinted.includes(s) })),
      extra, moved, font, changed,
    },
    lines: { sap: sap.lines.length, matched: sap.lines.length - lineMissing.length, missing: lineMissing, thickness: lineThick.length > 40 ? lineThick.length : lineThick, extra: lineExtra.length > 40 ? lineExtra.length : lineExtra },
    bitmaps: { sap: sap.bitmaps.length, missing: bmMiss, extra: bmExtra },
  };
}

function main(argv) {
  const [otfFile, htmlFile] = argv;
  if (!otfFile || !htmlFile || !existsSync(otfFile) || !existsSync(htmlFile)) {
    console.error('usage: compare-otf.mjs <form.sap.otf.txt> <FORM-preview.html> [--out report.json]');
    process.exit(2);
  }
  const sap = parseOtf(readFileSync(otfFile, 'latin1') === '' ? '' : readFileSync(otfFile, 'utf8'));
  const prev = measurePreview(resolve(htmlFile));
  const report = { otf: resolve(otfFile), html: resolve(htmlFile), sapPages: sap.pages, ...compare(sap, prev) };
  const i = argv.indexOf('--out');
  if (i >= 0 && argv[i + 1]) writeFileSync(argv[i + 1], JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
