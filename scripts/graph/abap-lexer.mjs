// sc4sap:graph — a small ABAP statement lexer for the reference-graph extractor
// (extract-edges.mjs). Not a parser: it only turns source text into statements
// that regexes can match safely.
//
//   - full-line comments (`*` in column 1) and `"` end-of-line comments are dropped
//   - literals ('…', `…`, |…| templates) are lifted out: in `masked` each one is a
//     placeholder `'§<n>'`, its content sits in `lits[n]` — so a keyword inside a
//     string never matches, but CALL FUNCTION 'X' can still read X
//   - a statement runs to the period outside literals, across lines; `line` is the
//     unit-relative line (1-based) of its first character
//   - chained statements (`A: b, c.`) become `A b` and `A c`, each with the line its
//     part starts on (commas inside parentheses do not split)
//
// lexAbap(src) → { statements: [{ masked, upper, line, chained }], lits: [{ value, quote }], lines }
// statementText(stmt, lits, max?) → the statement with literals restored, whitespace collapsed

const PH = (i) => `'§${i}'`;

export function lexAbap(src) {
  const text = String(src ?? '').replace(/^﻿/, '');
  const rows = text.split(/\r?\n/);
  const lits = [];
  const statements = [];
  // current statement: chars + line of each char (whitespace collapsed)
  let buf = [];
  let bufLines = [];
  let colonAt = -1; // index in buf of the chain colon
  const push = (ch, line) => {
    if (/\s/.test(ch)) {
      if (!buf.length || buf[buf.length - 1] === ' ') return;
      buf.push(' ');
      bufLines.push(line);
      return;
    }
    buf.push(ch);
    bufLines.push(line);
  };
  const pushStr = (s, line) => {
    for (const ch of s) {
      buf.push(ch);
      bufLines.push(line);
    }
  };
  const finish = () => {
    // drop trailing blank
    while (buf.length && buf[buf.length - 1] === ' ') {
      buf.pop();
      bufLines.pop();
    }
    while (buf.length && buf[0] === ' ') {
      buf.shift();
      bufLines.shift();
      if (colonAt >= 0) colonAt--;
    }
    if (buf.length) {
      if (colonAt >= 0) splitChain(buf, bufLines, colonAt, statements);
      else {
        const masked = buf.join('');
        statements.push({ masked, upper: masked.toUpperCase(), line: bufLines[0], chained: false });
      }
    }
    buf = [];
    bufLines = [];
    colonAt = -1;
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    if (row.startsWith('*')) continue;
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      if (ch === '"') break; // end-of-line comment
      if (ch === "'" || ch === '`') {
        // ' and ` literals: doubled quote escapes it; closes at end of line at the latest
        let j = i + 1;
        let val = '';
        while (j < row.length) {
          if (row[j] === ch) {
            if (row[j + 1] === ch) {
              val += ch;
              j += 2;
              continue;
            }
            break;
          }
          val += row[j];
          j++;
        }
        lits.push({ value: val, quote: ch });
        pushStr(PH(lits.length - 1), line);
        i = j + 1;
        continue;
      }
      if (ch === '|') {
        // string template: \| escapes, {…} embeds expressions (kept inside the literal)
        let j = i + 1;
        let val = '';
        let depth = 0;
        while (j < row.length) {
          const c = row[j];
          if (c === '\\' && j + 1 < row.length) {
            val += c + row[j + 1];
            j += 2;
            continue;
          }
          if (c === '{') depth++;
          else if (c === '}' && depth > 0) depth--;
          else if (c === '|' && depth === 0) break;
          val += c;
          j++;
        }
        lits.push({ value: val, quote: '|' });
        pushStr(PH(lits.length - 1), line);
        i = j + 1;
        continue;
      }
      if (ch === '.') {
        // a period ends the statement unless it sits inside a name/number (e.g. 1.5 never
        // occurs unquoted in ABAP, but `/ns/x.y` neither — keep it simple)
        const next = row[i + 1];
        if (next === undefined || /\s/.test(next) || next === '"') {
          finish();
          i++;
          continue;
        }
        push(ch, line);
        i++;
        continue;
      }
      if (ch === ':' && colonAt < 0) {
        colonAt = buf.length;
        buf.push(':');
        bufLines.push(line);
        i++;
        continue;
      }
      push(ch, line);
      i++;
    }
    push(' ', line);
  }
  finish();
  return { statements, lits, lines: rows.length };
}

function splitChain(buf, bufLines, colonAt, out) {
  const head = buf.slice(0, colonAt).join('').trim();
  const parts = [];
  let depth = 0;
  let start = colonAt + 1;
  for (let k = colonAt + 1; k <= buf.length; k++) {
    const c = buf[k];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (k === buf.length || (c === ',' && depth === 0)) {
      let s = start;
      while (s < k && buf[s] === ' ') s++;
      const body = buf.slice(s, k).join('').trim();
      if (body) parts.push({ body, line: bufLines[s] ?? bufLines[colonAt] });
      start = k + 1;
    }
  }
  if (!parts.length) {
    out.push({ masked: head, upper: head.toUpperCase(), line: bufLines[0], chained: true });
    return;
  }
  parts.forEach((p, idx) => {
    const masked = head ? `${head} ${p.body}` : p.body;
    out.push({ masked, upper: masked.toUpperCase(), line: idx === 0 ? bufLines[0] : p.line, chained: true });
  });
}

export function restoreLits(masked, lits) {
  return masked.replace(/'§(\d+)'/g, (_, n) => {
    const l = lits[Number(n)];
    if (!l) return _;
    if (l.quote === '|') return `|${l.value}|`;
    return l.quote + l.value.split(l.quote).join(l.quote + l.quote) + l.quote;
  });
}

export function statementText(stmt, lits, max = 120) {
  const t = restoreLits(stmt.masked, lits).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// the literal behind a `'§n'` placeholder token (or null)
export function litValue(token, lits) {
  const m = /^'§(\d+)'$/.exec(String(token || ''));
  return m ? (lits[Number(m[1])]?.value ?? null) : null;
}
