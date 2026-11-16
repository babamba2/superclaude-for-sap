// sc4sap:uat-scenarios — the scenario set as an .xlsx workbook, zero-dependency (scripts/spec/xlsx-zip.mjs).
//
// Two layouts, the two shapes test teams hand around:
//   A  "integrated test": Schedule (one row per scenario), Activities (L2 / L3 / L4 / activity / T-code …),
//      and one sheet per scenario — Test Overview (name, description) above the Test Procedure table.
//   B  "scenario list": one sheet, a header row per scenario and a STEP row per step, with a result
//      column per test cycle and an issue column per system; plus a Test Users sheet (IDs only).
// Strings are written inline (t="inlineStr"), so there is no shared-strings table to keep in step.

import { zipFiles } from '../spec/xlsx-zip.mjs';
// No import of uat-model.mjs: the caller passes progress(set) as `stats`. A long-running server that
// loads these modules by versioned URL would otherwise keep a stale model behind a nested import.
const runsIn = (step, cycle) => !step.cycles?.length || step.cycles.includes(cycle);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // XML 1.0 forbids most control characters.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const bullets = (list) => (Array.isArray(list) ? list.map((x) => `■ ${x}`).join('\n') : String(list ?? ''));

/** Styles: 0 plain wrap, 1 bold header with fill, 2 title (bold, larger), 3 section header (bold, light fill). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="10"/><name val="Malgun Gothic"/></font><font><b/><sz val="10"/><name val="Malgun Gothic"/></font><font><b/><sz val="14"/><name val="Malgun Gothic"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="4">
<xf fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf fontId="2" fillId="0" borderId="0" applyFont="1"/>
<xf fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/**
 * One sheet from rows of cells. A cell is a string / number, or { v, s } with a style index.
 * `merges` are "A1:C1" ranges, `widths` column widths in characters.
 */
function sheetXml({ rows, merges = [], widths = [] }) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
    if (cell === null || cell === undefined) return '';
    const { v, s = 0 } = typeof cell === 'object' ? cell : { v: cell };
    const ref = `${col(c)}${r + 1}`;
    if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const mc = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>${cols}<sheetData>${body}</sheetData>${mc}</worksheet>`;
}

/** Sheet names: ≤ 31 characters, no []:*?/\ , unique. */
function sheetNames(names) {
  const used = new Set();
  return names.map((n) => {
    let base = String(n).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i += 1) name = `${base.slice(0, 28)}~${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** The workbook bytes from [{ name, rows, merges, widths }]. */
export function workbook(sheets) {
  const names = sheetNames(sheets.map((s) => s.name));
  const enc = (s) => Buffer.from(s, 'utf8');
  const files = [
    { name: '[Content_Types].xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { name: '_rels/.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: enc(STYLES) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s)) })),
  ];
  return zipFiles(files);
}

const H = (v) => ({ v, s: 1 });
const RESULT = { pass: 'O', fail: 'X', blocked: '△', 'n/a': 'N/A', '': '' };
/** A step's mark in one cycle: its result, or "–" in a cycle it does not run in. */
const mark = (st, c) => (runsIn(st, c) ? RESULT[st.results[c]] : '–');
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '');

/** Dashboard: per lead module and per company — plan, due, tested, pass, fail — then cycles and issues. */
function dashboard(set, p) {
  const block = (title, key, map) => [
    [{ v: title, s: 3 }],
    [H(key), H('Plan'), H('Due by today'), H('Tested'), H('Progress'), H('Pass'), H('Fail')],
    ...Object.entries(map).map(([k, t]) => [k, t.plan, t.due, t.tested, pct(t.tested, t.plan), t.pass, t.fail].map((v) => ({ v, s: 0 }))),
    [],
  ];
  return {
    name: 'Dashboard',
    widths: [16, 10, 12, 10, 10, 8, 8],
    rows: [
      [{ v: `${set.title || set.id} — dashboard`, s: 2 }],
      [],
      ...block('Scenarios per lead module', 'Module', p.byModule),
      ...(Object.keys(p.byCompany).some((k) => k !== '-') ? block('Scenarios per company', 'Company', p.byCompany) : []),
      [{ v: 'Steps per cycle', s: 3 }],
      [H('Cycle'), H('Pass'), H('Fail'), H('Blocked'), H('N/A'), H('Open')],
      ...set.cycles.map((c) => [c, p.byCycle[c].pass, p.byCycle[c].fail, p.byCycle[c].blocked, p.byCycle[c]['n/a'], p.byCycle[c].open].map((v) => ({ v, s: 0 }))),
      [],
      [{ v: 'Issues', s: 3 }],
      [H('Open'), H('Waiting'), H('Done'), H('N/A')],
      [p.issues.open, p.issues.waiting, p.issues.done, p.issues['n/a']].map((v) => ({ v, s: 0 })),
    ],
  };
}

/** Issue list: one row per issue, with its follow-up and state. */
function issueSheet(set) {
  return {
    name: 'Issue List',
    widths: [11, 12, 10, 8, 12, 44, 11, 14, 40, 10, 14, 16, 8],
    rows: [
      [H('Issue No.'), H('Scenario'), H('Step'), H('Module'), H('Type'), H('Issue'), H('Raised on'), H('Raised by'), H('Follow-up'), H('State'), H('Owner'), H('Fix request'), H('Retest')],
      ...set.issues.map((i) => [i.id, i.scenario, i.step, i.module, i.type, i.text, i.raisedOn, i.raisedBy, i.followUp, i.state, i.owner, (i.transports || []).join(', '), i.retest || ''].map((v) => ({ v, s: 0 }))),
    ],
  };
}

/** Scenario list with the module participation matrix (1 = the module has a step in it). */
function scenarioList(set, p) {
  const verdict = { pass: 'Pass', fail: 'Fail', '': '' };
  return {
    name: 'Scenario List',
    widths: [12, 30, 12, 12, 14, 14, ...p.modules.map(() => 6), 12, 12, 8],
    rows: [
      [H('Scenario'), H('Title / variant'), H('Company'), H('Channel'), H('Product group'), H('Earlier ID'), ...p.modules.map(H), H('Planned'), H('Actual'), H('Result')],
      ...set.scenarios.map((s, i) => [s.id, [s.title, s.variant].filter(Boolean).join(' — '), s.company, s.channel, s.productGroup, s.legacyId,
        ...p.modules.map((m) => (p.participation[i].modules.includes(m) ? 1 : '')), s.date, s.actualDate, verdict[s.result]].map((v) => ({ v, s: 0 }))),
    ],
  };
}
const KIND_TITLE = { uat: 'UAT', sit: 'Integration test' };

/** Layout A — integrated test workbook. */
export function layoutA(set, stats) {
  const title = set.title || `${set.module} ${KIND_TITLE[set.kind] || 'UAT'}`;
  const schedule = {
    name: 'Schedule',
    widths: [12, 26, 26, 30, 16, 18, 14, 10, 16],
    merges: ['A1:I1'],
    rows: [
      [{ v: `${title} — schedule`, s: 2 }],
      [H('Module'), H('Scenario'), H('Process chain (L2)'), H('Process (L3)'), H('Consultant'), H('Business owner'), H('Test date'), H('Time'), H('Place')],
      ...set.scenarios.map((s) => [set.module, `${s.id} ${s.title}`, s.theme, s.process, s.consultant, s.owner, s.date, s.time, s.place || set.schedule.place].map((v) => ({ v, s: 0 }))),
    ],
  };
  const activities = {
    name: 'Activities',
    widths: [10, 24, 26, 30, 8, 14, 40, 18, 12, 14, 30],
    rows: [
      [H('Scenario'), H('Process (L3)'), H('Task (L4)'), H('Activity'), H('Module'), H('T-code'), H('Description'), H('Process owner'), H('Test date'), H('Result'), H('Follow-up')],
      ...set.scenarios.flatMap((s) => s.steps.map((st) => [s.id, s.process, s.task || s.title, `${st.id} ${st.activity}`, st.module, st.tcode, bullets(st.checks), s.owner, s.date,
        set.cycles.map((c) => (st.results[c] ? `${c} ${RESULT[st.results[c]]}` : '')).filter(Boolean).join(' / '), st.followUp].map((v) => ({ v, s: 0 })))),
    ],
  };
  const perScenario = set.scenarios.map((s) => ({
    name: s.id,
    widths: [10, 6, 8, 26, 36, 14, 34, 30, 26, 12, ...set.cycles.map(() => 8), 26],
    merges: ['A1:F1', 'A4:B4', 'C4:J4', 'A5:B5', 'C5:J5', 'A6:B6', 'C6:J6', 'A7:B7', 'C7:J7'],
    rows: [
      [{ v: `${s.id} ${s.title}`, s: 2 }],
      [],
      [{ v: 'Test Overview', s: 3 }],
      [{ v: 'Scenario', s: 3 }, null, { v: s.title, s: 0 }],
      [{ v: 'Description', s: 3 }, null, { v: s.description, s: 0 }],
      [{ v: 'Lead / modules', s: 3 }, null, { v: [s.leadModule, [...new Set(s.steps.map((st) => st.module))].join(', ')].filter(Boolean).join(' · '), s: 0 }],
      [{ v: 'Key check point', s: 3 }, null, { v: s.focus, s: 0 }],
      [],
      [{ v: 'Test Procedure', s: 3 }],
      [H('Scenario #'), H('Seq.'), H('Module'), H('Step'), H('Description'), H('T-code'), H('Check points'), H('Input data'), H('Expected output'), H('User'), ...set.cycles.map((c) => H(`${c} (O/X)`)), H('Remarks')],
      ...s.steps.map((st, j) => [j === 0 ? s.id : '', j + 1, st.module, st.activity, st.system && st.system !== 'SAP' ? `[${st.system}]` : '', st.tcode, bullets(st.checks), bullets(st.inputs), bullets(st.outputs), st.user,
        ...set.cycles.map((c) => mark(st, c)), [st.phase && `[${st.phase}]`, st.followUp, st.issue].filter(Boolean).join('\n')].map((v) => ({ v, s: 0 }))),
    ],
  }));
  return workbook([dashboard(set, stats), scenarioList(set, stats), schedule, activities, ...perScenario, issueSheet(set)]);
}

/** Layout B — flat scenario list. */
export function layoutB(set, stats) {
  const heads = ['Theme', 'Scenario / No.', 'Phase', 'Activity', 'Test case (variant)', 'Module', 'System', 'T-code', ...set.cycles, 'Test date', 'Check', 'PIC', 'Status', 'Input', 'Output & check list', 'Result & follow-up', 'Issue'];
  const rows = [[{ v: set.title || `${set.module} ${KIND_TITLE[set.kind] || 'UAT'} scenarios`, s: 2 }], heads.map(H)];
  const merges = [];
  set.scenarios.forEach((s, i) => {
    rows.push([{ v: String(i + 1), s: 3 }, { v: `${s.id} ${s.title}`, s: 3 }, ...heads.slice(2).map(() => ({ v: '', s: 3 }))]);
    merges.push(`B${rows.length}:${col(heads.length - 1)}${rows.length}`);
    for (const st of s.steps) {
      rows.push([s.theme, st.id, st.phase, st.activity, s.variant, st.module, st.system || 'SAP', st.tcode, ...set.cycles.map((c) => mark(st, c)),
        s.date, bullets(st.checks), st.user, st.status, bullets(st.inputs), bullets(st.outputs), st.followUp, st.issue].map((v) => ({ v, s: 0 })));
    }
  });
  const users = [...new Set(set.scenarios.flatMap((s) => s.steps.map((st) => st.user)).filter(Boolean))];
  return workbook([
    { name: `${set.module || 'UAT'} scenarios`, rows, merges: ['A1:F1', ...merges], widths: [16, 14, 16, 36, 22, 8, 10, 18, ...set.cycles.map(() => 7), 12, 34, 10, 12, 30, 30, 30, 22] },
    issueSheet(set),
    dashboard(set, stats),
    { name: 'Test users', widths: [12, 18], rows: [[H('Module'), H('Test user ID')], ...users.map((u) => [{ v: set.module, s: 0 }, { v: u, s: 0 }])] },
  ]);
}
