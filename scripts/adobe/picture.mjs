// sc4sap:adobe-preview — XFA picture clauses and locale defaults for field display (no I/O).
//
//   formatValue(raw, { type, picture, fracDigits, leadDigits, locale })  → the displayed string
//     raw     the data value as the data XML carries it (ISO date / time, '.' decimals)
//     type    'text' | 'date' | 'time' | 'dateTime' | 'decimal' | 'float' | 'integer'
//     picture display picture (format/picture), e.g. "HH:MM", "zzz,zzz,zz9.888", "date{DD.MM.YYYY}"
//   formatPicture(raw, picture, type, locale)                              → one picture applied
//   LOCALES                                                                 → the locales known here
//
// Supported: date D DD J JJJ M MM MMM MMMM E EEE EEEE YY YYYY; time h hh H HH k kk K KK M MM S SS FFF A;
// num 9 z Z 8 s S , . V v E $ and quoted literals; text 9 A X O 0 t; category prefixes date{} time{} num{} text{}
// and alternatives joined with '|'. Unknown symbols print as they are.

export const LOCALES = {
  en_US: { dates: ['M/D/YY', 'MMM D, YYYY', 'MMMM D, YYYY', 'EEEE, MMMM D, YYYY'], times: ['h:MM A', 'h:MM:SS A', 'h:MM:SS A Z', 'h:MM:SS A Z'], months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ampm: ['AM', 'PM'],
    date: 'MMM D, YYYY', time: 'h:MM:SS A', group: ',', radix: '.', currency: '$' },
  en_GB: { dates: ['DD/MM/YY', 'D MMM YYYY', 'D MMMM YYYY', 'EEEE, D MMMM YYYY'], times: ['HH:MM', 'HH:MM:SS', 'HH:MM:SS Z', 'HH:MM:SS Z'], months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ampm: ['AM', 'PM'],
    date: 'D MMM YYYY', time: 'HH:MM:SS', group: ',', radix: '.', currency: '£' },
  de_DE: { dates: ['DD.MM.YY', 'DD.MM.YYYY', 'D. MMMM YYYY', 'EEEE, D. MMMM YYYY'], times: ['HH:MM', 'HH:MM:SS', 'HH:MM:SS Z', 'HH:MM:SS Z'], months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'], ampm: ['AM', 'PM'],
    date: 'DD.MM.YYYY', time: 'HH:MM:SS', group: '.', radix: ',', currency: '€' },
};

const loc = (l) => LOCALES[l] || LOCALES.en_US;

/** FormCalc DateFmt / TimeFmt: 0 default (medium), 1 short, 2 medium, 3 long, 4 full — with the category. */
export function datePattern(n, locale) { const d = loc(locale).dates; return `date{${d[[1, 0, 1, 2, 3][Number(n) || 0] ?? 1]}}`; }
export function timePattern(n, locale) { const t = loc(locale).times; return `time{${t[[1, 0, 1, 2, 3][Number(n) || 0] ?? 1]}}`; }
const pad = (n, k) => String(n).padStart(k, '0');

function parseDate(raw) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(raw || '').trim());
  if (!m || m[1] === '0000') return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
function parseTime(raw) {
  const m = /(?:^|T)(\d{2}):?(\d{2}):?(\d{2})?(?:\.(\d+))?/.exec(String(raw || '').trim());
  if (!m) return null;
  return { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3] || 0), f: m[4] || '0' };
}

/** Split a picture into symbol runs and literals ('…' quoted, other punctuation literal). */
function tokens(pic) {
  const out = [];
  for (let i = 0; i < pic.length;) {
    const c = pic[i];
    if (c === "'") {
      const j = pic.indexOf("'", i + 1);
      out.push({ lit: pic.slice(i + 1, j < 0 ? undefined : j) });
      i = j < 0 ? pic.length : j + 1;
      continue;
    }
    if (/[A-Za-z0-9]/.test(c)) {
      let j = i;
      while (j < pic.length && pic[j] === c) j++;
      out.push({ sym: c, n: j - i });
      i = j;
      continue;
    }
    out.push({ lit: c });
    i++;
  }
  return out;
}

function fmtDate(raw, pic, l) {
  const d = parseDate(raw);
  if (!d) return null;
  const L = loc(l);
  const dow = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
  const doy = Math.round((Date.UTC(d.y, d.m - 1, d.d) - Date.UTC(d.y, 0, 1)) / 86400000) + 1;
  return tokens(pic).map((t) => {
    if (t.lit !== undefined) return t.lit;
    const { sym, n } = t;
    if (sym === 'D') return n === 1 ? String(d.d) : pad(d.d, 2);
    if (sym === 'J') return n === 1 ? String(doy) : pad(doy, 3);
    if (sym === 'M') return n === 1 ? String(d.m) : n === 2 ? pad(d.m, 2) : n === 3 ? L.months[d.m - 1].slice(0, 3) : L.months[d.m - 1];
    if (sym === 'E') return n === 1 ? String(dow + 1) : n === 3 ? L.days[dow].slice(0, 3) : L.days[dow];
    if (sym === 'Y') return n === 2 ? pad(d.y % 100, 2) : String(d.y);
    return sym.repeat(n);
  }).join('');
}

function fmtTime(raw, pic, l) {
  const t0 = parseTime(raw);
  if (!t0) return null;
  const L = loc(l);
  return tokens(pic).map((t) => {
    if (t.lit !== undefined) return t.lit;
    const { sym, n } = t;
    const h12 = t0.h % 12 === 0 ? 12 : t0.h % 12;
    if (sym === 'h') return n === 1 ? String(h12) : pad(h12, 2);
    if (sym === 'H') return n === 1 ? String(t0.h) : pad(t0.h, 2);
    if (sym === 'k') { const v = t0.h % 12; return n === 1 ? String(v) : pad(v, 2); }
    if (sym === 'K') { const v = t0.h === 0 ? 24 : t0.h; return n === 1 ? String(v) : pad(v, 2); }
    if (sym === 'M') return n === 1 ? String(t0.mi) : pad(t0.mi, 2);
    if (sym === 'S') return n === 1 ? String(t0.s) : pad(t0.s, 2);
    if (sym === 'F') return (t0.f + '000').slice(0, n);
    if (sym === 'A') return L.ampm[t0.h < 12 ? 0 : 1];
    return sym.repeat(n);
  }).join('');
}

/** A numeric picture: digits right-to-left into the integer part, left-to-right into the fraction. */
function fmtNum(raw, pic, l) {
  const s = String(raw ?? '').trim();
  if (!/^[-+]?\d*\.?\d*(E[-+]?\d+)?$/i.test(s) || s === '' || s === '.') return null;
  const L = loc(l);
  const neg = s.startsWith('-');
  const [ip0, fp0 = ''] = s.replace(/^[-+]/, '').split('.');
  const ip = ip0.replace(/^0+(?=\d)/, '');
  const radixAt = pic.search(/[.vV]/);
  const intPic = radixAt < 0 ? pic : pic.slice(0, radixAt);
  const fracPic = radixAt < 0 ? '' : pic.slice(radixAt + 1);
  // fraction: round to the number of fraction digit symbols
  const nFrac = (fracPic.match(/[9zZ8]/g) || []).length;
  let intDigits = ip;
  let fracDigits = fp0;
  if (fracDigits.length > nFrac) {
    const v = Number(`${ip || '0'}.${fp0}`);
    const r = v.toFixed(nFrac).split('.');
    intDigits = r[0];
    fracDigits = r[1] || '';
  }
  // integer part, right to left
  const iDigits = [...intDigits].reverse();
  let k = 0;
  const intOut = [];
  const syms = [...intPic];
  let started = false;
  for (let i = syms.length - 1; i >= 0; i--) {
    const c = syms[i];
    if (c === '9') { intOut.unshift(iDigits[k] ?? '0'); k++; }
    else if (c === 'z' || c === 'Z') {
      const dgt = iDigits[k]; k++;
      if (dgt !== undefined) intOut.unshift(dgt); else intOut.unshift(c === 'z' ? ' ' : '');
    } else if (c === ',') intOut.unshift(k < iDigits.length ? L.group : (syms.slice(0, i).some((x) => x === '9') ? L.group : '\u0000'));
    else if (c === 's' || c === 'S') intOut.unshift(neg ? '-' : c === 's' ? '' : ' ');
    else if (c === '$') intOut.unshift(L.currency);
    else if (c === "'") continue;
    else intOut.unshift(c);
    started = true;
  }
  // digits the picture has no room for still print (no overflow handling)
  while (k < iDigits.length) { intOut.unshift(iDigits[k]); k++; }
  let intStr = intOut.join('');
  // a grouping symbol before no digit becomes a blank like its 'z'
  intStr = intStr.replace(/\u0000/g, ' ');
  intStr = intStr.replace(/^([ ]*)[,.](?=[ ]*\d)/, '$1 ');
  let fracStr = '';
  if (radixAt >= 0) {
    const fsyms = [...fracPic];
    let j = 0;
    const out = [];
    for (const c of fsyms) {
      if (c === '9') { out.push(fracDigits[j] ?? '0'); j++; }
      else if (c === '8') { if (fracDigits[j] !== undefined) out.push(fracDigits[j]); j++; }
      else if (c === 'z' || c === 'Z') { const dgt = fracDigits[j]; j++; out.push(dgt !== undefined ? dgt : c === 'z' ? ' ' : ''); }
      else if (c === 's' || c === 'S') out.push(neg ? '-' : c === 's' ? '' : ' ');
      else out.push(c);
    }
    const fr = out.join('');
    const radix = /[vV]/.test(pic[radixAt]) ? '' : L.radix;
    fracStr = fr.trim() || /9/.test(fracPic) ? radix + fr : (/8/.test(fracPic) ? '' : radix + fr);
  }
  const sign = neg && !/[sS]/.test(pic) ? '-' : '';
  void started;
  return sign + intStr + fracStr;
}

function fmtText(raw, pic) {
  const s = [...String(raw ?? '')];
  let i = 0;
  return tokens(pic).map((t) => {
    if (t.lit !== undefined) return t.lit;
    if (/[9AXOt0]/.test(t.sym)) { let r = ''; for (let k = 0; k < t.n; k++) r += s[i++] ?? ''; return r; }
    return t.sym.repeat(t.n);
  }).join('');
}

/** Apply one picture clause (with or without its category prefix). */
export function formatPicture(raw, picture, type, locale) {
  for (const alt of String(picture).split('|')) {
    const m = /^\s*(date|time|num|text|datetime)\{([\s\S]*)\}\s*$/i.exec(alt);
    const cat = m ? m[1].toLowerCase() : type === 'date' ? 'date' : type === 'time' ? 'time' : /decimal|float|integer/.test(type) ? 'num' : 'text';
    const pic = m ? m[2] : alt;
    const r = cat === 'date' ? fmtDate(raw, pic, locale) : cat === 'time' ? fmtTime(raw, pic, locale)
      : cat === 'num' ? fmtNum(raw, pic, locale) : fmtText(raw, pic);
    if (r !== null) return r;
  }
  return String(raw ?? '');
}

function defaultNum(raw, { type, fracDigits }, locale) {
  const s = String(raw ?? '').trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return s;
  const L = loc(locale);
  const neg = s.startsWith('-');
  let [ip, fp = ''] = s.replace(/^[-+]/, '').split('.');
  if (type === 'integer') fp = '';
  else if (fracDigits === -1) { /* keep the data's own fraction digits */ }
  else {
    const fd = fracDigits === undefined ? 2 : fracDigits;
    const r = Number(`${ip}.${fp || '0'}`).toFixed(fd).split('.');
    ip = r[0];
    fp = (r[1] || '').replace(/0+$/, '');
  }
  ip = ip.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, L.group);
  return (neg ? '-' : '') + ip + (fp ? L.radix + fp : '');
}

/** The displayed string of a field value. */
export function formatValue(raw, { type = 'text', picture, fracDigits, locale = 'en_US' } = {}) {
  const s = raw === undefined || raw === null ? '' : String(raw);
  if (s === '') return '';
  if (picture) return formatPicture(s, picture, type, locale);
  if (type === 'date') return fmtDate(s, loc(locale).date, locale) ?? s;
  if (type === 'time') return fmtTime(s, loc(locale).time, locale) ?? s;
  if (type === 'dateTime') {
    const d = fmtDate(s, loc(locale).date, locale);
    const t = fmtTime(s, loc(locale).time, locale);
    return d && t ? `${d} ${t}` : s;
  }
  if (/decimal|float|integer/.test(type)) return defaultNum(s, { type, fracDigits }, locale);
  return s;
}
