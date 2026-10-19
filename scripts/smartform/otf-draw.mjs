#!/usr/bin/env node
// Draw page 1 of SAP's OTF (RenderSmartForm) as an SVG page and a JPG — the
// reference picture for reviewing a preview. Texts sit on their baselines in
// the printer font SAP chose, lines and boxes as printed, bitmaps as grey
// boxes. Unlike a PDF raster it needs no PDF fonts (Korean prints as is).
//
//   node otf-draw.mjs <form.sap.otf.txt> --out <file.jpg> [--landscape]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseOtf } from './compare-otf.mjs';
import { findBrowser, runBrowser } from './build-preview.mjs';

const FAMILY = (f) => {
  const s = String(f || '').toUpperCase();
  if (/^COUR/.test(s)) return "'Courier New', monospace";
  if (/^THANGSAN/.test(s)) return "'Angsana New', AngsanaUPC, 'Leelawadee UI', sans-serif";
  if (/^THCORDIA/.test(s)) return "'Cordia New', CordiaUPC, 'Leelawadee UI', sans-serif";
  if (/^TH/.test(s)) return "Tahoma, 'Leelawadee UI', sans-serif";
  if (/^ANDALE/.test(s)) return "'Andale Mono', 'Courier New', 'MS Gothic', monospace"; // 0.6 em, like Courier
  if (/^TIME/.test(s)) return "'Times New Roman', serif";
  if (/^KPDODUM/.test(s)) return "'DotumChe', Dotum, sans-serif";
  if (/^KPGULIM/.test(s)) return "'GulimChe', Gulim, sans-serif";
  if (/^KPBATANG/.test(s)) return "'BatangChe', Batang, serif";
  if (/^CNSONG/.test(s)) return "SimSun, serif";
  if (/^CNHEI/.test(s)) return "SimHei, 'Microsoft YaHei', sans-serif";
  if (/^CNKAI/.test(s)) return "KaiTi, serif";
  if (/^TW(MING|SONG)/.test(s)) return "MingLiU, PMingLiU, serif";
  if (/^TWDPHEI|^TWKAI/.test(s)) return "'Microsoft JhengHei', sans-serif";
  return 'Arial, Helvetica, sans-serif';
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function otfSvg(otfText, landscape = false) {
  const { runs, lines, bitmaps } = parseOtf(otfText);
  const [w, h] = landscape ? [297, 210] : [210, 297];
  const parts = [];
  for (const b of bitmaps)
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#e6e6e6" stroke="#999" stroke-width="0.2"/>`);
  for (const l of lines) {
    const t = Math.max(l.th, 0.1);
    parts.push(l.dir === 'H'
      ? `<rect x="${l.from}" y="${l.pos}" width="${l.to - l.from}" height="${t}"/>`
      : `<rect x="${l.pos}" y="${l.from}" width="${t}" height="${l.to - l.from}"/>`);
  }
  for (const r of runs) {
    // the text is stretched to SAP's printed width, so line ends match the print
    parts.push(`<text x="${r.x}" y="${r.y}" font-family="${FAMILY(r.family)}" font-size="${(r.pt * 25.4) / 72}" font-weight="${r.bold ? 700 : 400}" textLength="${r.widthMm.toFixed(2)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(r.text)}</text>`);
  }
  return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>` };
}

function main(argv) {
  const [otfFile] = argv;
  const i = argv.indexOf('--out');
  if (!otfFile || i < 0) {
    console.error('usage: otf-draw.mjs <form.sap.otf.txt> --out <file.jpg> [--landscape]');
    process.exit(2);
  }
  const { w, h, svg } = otfSvg(readFileSync(otfFile, 'utf8'), argv.includes('--landscape'));
  const dir = mkdtempSync(join(tmpdir(), 'sf-otf-'));
  const html = join(dir, 'page.html');
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body>${svg}</body></html>`);
  const browser = findBrowser();
  if (!browser) throw new Error('no Chrome / Edge / Chromium found');
  const px = (mm) => Math.round((mm / 25.4) * 96);
  const out = resolve(argv[i + 1]);
  runBrowser(browser, [`--window-size=${px(w)},${px(h)}`, '--force-device-scale-factor=2', `--screenshot=${out}`, pathToFileURL(html).href], join(dir, 'profile'));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* still locked */ }
  console.log(out);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
