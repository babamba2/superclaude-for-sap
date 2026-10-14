// SAPscript ITF (documentation text in DOKTL) → simple blocks.
//
// DOKTL rows carry a paragraph format (DOKFORMAT) and up to 72 characters
// of text. A row whose format is '' or '=' continues the previous paragraph
// ('=' without a blank). '/:' rows are control commands (INCLUDE, IF, …)
// and are dropped; '/*' rows are comments.
//
// Returned blocks: { t: 'h' | 'p' | 'li' | 'ol', level?, text }.

const HEADING = new Set(['U1', 'U2', 'U3', 'U4', 'UT', 'TH']);
const BULLET = /^B(\d)$/;
const NUMBER = /^N(\d)$/;

/** Inline markup: <DS:...>text</>, <ZH>…</>, <LS>…</>, &SYMBOLS& → plain text. */
export function itfInline(s) {
  return String(s ?? '')
    .replace(/<DS:[^>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/<[A-Z][A-Z0-9]?>/g, '')
    .replace(/&[A-Z0-9_\[\]]+&/g, '')
    .replace(/<\(>/g, '<').replace(/<\)>/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function itfToBlocks(rows = []) {
  const lines = [...rows].sort((a, b) => Number(a.LINE) - Number(b.LINE));
  const blocks = [];
  let cur = null;
  const flush = () => {
    if (cur) {
      cur.text = itfInline(cur.text);
      if (cur.text) blocks.push(cur);
    }
    cur = null;
  };
  for (const r of lines) {
    const fmt = String(r.DOKFORMAT ?? '').trim();
    const text = String(r.DOKTEXT ?? '');
    if (fmt.startsWith('/:') || fmt === '/*') continue;
    if (fmt === '' || fmt === '=') {
      if (cur) cur.text += (fmt === '=' ? '' : ' ') + text;
      else cur = { t: 'p', text };
      continue;
    }
    flush();
    if (fmt === 'LZ' || fmt === '/') {
      if (fmt === '/' && text.trim()) cur = { t: 'p', text };
      continue;
    }
    if (HEADING.has(fmt)) cur = { t: 'h', text };
    else if (BULLET.test(fmt)) cur = { t: 'li', level: Number(fmt[1]), text };
    else if (NUMBER.test(fmt)) cur = { t: 'ol', level: Number(fmt[1]), text };
    else cur = { t: 'p', text };
  }
  flush();
  return blocks;
}
