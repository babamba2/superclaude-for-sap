// Shared by the form renderers (SmartForm preview, Adobe form preview): Code 128 bar codes as inline SVG.
// Moved unchanged from scripts/smartform/build-preview.mjs (which re-exports these).

// ── bar codes: Code 128 (set B) bars; SAP's own symbology / module come from SE73 ──
const CODE128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112').split(' ');
/** Code 128 symbol values of a value, as SAP's BRLC bar codes print it: set B, switching
 *  to set C for runs of 4+ digits (an odd run gives its first digit to B) — 101 modules
 *  for "BC12345", 123 for "BC0012345678" in SAP's PDF. Start, check and stop included. */
export function code128Codes(value) {
  const s = [...String(value)].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127).join('');
  const digitsAt = (i) => { let n = 0; while (i + n < s.length && /\d/.test(s[i + n])) n++; return n; };
  const lead = digitsAt(0);
  let set = lead >= 4 && lead % 2 === 0 ? 'C' : 'B';
  const codes = [set === 'C' ? 105 : 104];
  for (let i = 0; i < s.length;) {
    if (set === 'C') {
      if (digitsAt(i) >= 2) { codes.push(Number(s.substr(i, 2))); i += 2; continue; }
      codes.push(100); set = 'B';
    }
    const run = digitsAt(i);
    if (run >= 4 && run % 2 === 0) { codes.push(99); set = 'C'; continue; }
    codes.push(s.charCodeAt(i) - 32); i++;
  }
  codes.push(codes.reduce((t, c, i) => t + c * (i || 1), 0) % 103, 106);
  return codes;
}

/** Module and height of an SE73 bar code: TFO05-TDBARCAUX "N08X00080A" = module 8, height 80,
 *  both in 1/600 inch (measured on SAP's PDF: 0.339 mm / 3.39 mm, 6 / 150 → 0.254 / 6.35). */
export function barcodeSize(def) {
  const m = /^.(\d{2}).(\d{5})/.exec(String(def?.aux || ''));
  if (!m) return null;
  // the place the text line keeps for it is the SE73 width (TFO05 TDBCSIZE), whatever the bars
  // take: a right-aligned bar code starts at edge − that width (ZSF_DEMO_73 50 mm)
  const w = /([\d.]+)\s*([A-Z]{2})?/i.exec(String(def?.width || ''));
  const f = { MM: 1, CM: 10, IN: 25.4, PT: 25.4 / 72, TW: 25.4 / 1440 }[String(w?.[2] || 'MM').toUpperCase()];
  const layoutMm = w && f ? Number(w[1]) * f : 0; // an unknown unit (CH, LN): the bars' own width
  return { moduleMm: Number(m[1]) * 25.4 / 600, heightMm: Number(m[2]) * 25.4 / 600, ...(layoutMm > 0 ? { layoutMm } : {}) };
}

/** Bars of a value as an inline SVG standing on the baseline. Without a definition
 *  0.3 mm module and 3.5 mm height are assumed. */
export function barcodeSvg(value, def = {}) {
  const mod = Number(def.moduleMm) || 0.3;
  const h = Number(def.heightMm) || 3.5;
  const codes = code128Codes(value);
  let x = 0;
  const bars = [];
  for (const c of codes) {
    [...CODE128[c]].forEach((w, i) => { if (i % 2 === 0) bars.push(`M${x} 0h${w}v1h-${w}z`); x += Number(w); });
  }
  // the bars rise from the baseline without making the line taller (as in SAP's print)
  const wmm = (x * mod).toFixed(2);
  const place = Number(def.layoutMm) > 0 ? Number(def.layoutMm).toFixed(2) : wmm;
  return `<span class="bcw" style="width:${place}mm"><svg class="bc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 1" preserveAspectRatio="none" ` +
    `style="width:${wmm}mm;height:${h.toFixed(2)}mm"><path d="${bars.join('')}"/></svg></span>`;
}
