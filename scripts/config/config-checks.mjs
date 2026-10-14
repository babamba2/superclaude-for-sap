// Check rules for config-to-document.
//
// A module's rules live in configs/<MODULE>/config-checks.json:
//   { "reads": [ { "table": "NRIV", "where": { "OBJECT": ["EINKBELEG"] } } ],
//     "rules": [ { "id", "severity": "error|warn|info", "activity"?, "title": {ko,en},
//                  "type": "exists|assigned|custom-keys", … } ] }
//
//   exists      — every row of `from` (optionally filtered by `from.where`) has a row in
//                 `to` whose `to.fields` equal the row's `from.fields` (and `to.where`).
//   assigned    — every row of `from` is referenced by at least one row of `to`
//                 (same field mapping as exists, read the other way round).
//   custom-keys — rows of `table` whose `field` matches `pattern` (customer namespace).
//
// Built-in checks for every module: blocked reads, missing texts in the
// document language. Results: { id, severity, activity, title, detail, items[] }.

import { readFileSync, existsSync } from 'fs';

export function loadRules(file) {
  if (!existsSync(file)) return { reads: [], rules: [] };
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return { reads: j.reads || [], rules: j.rules || [] };
}

const val = (v) => (v === true ? 'X' : v === false || v == null ? '' : String(v));
const match = (row, where = {}) => Object.entries(where).every(([f, w]) => (Array.isArray(w) ? w.map(String) : [String(w)]).includes(val(row[f])));
const tuple = (row, fields) => fields.map((f) => val(row[f]).trim()).join('\u0001');
const label = (row, fields) => fields.map((f) => `${f}=${val(row[f])}`).join(', ');

function runRule(rule, tables, lang) {
  const t = (n) => tables[n]?.rows || [];
  const title = rule.title?.[lang] || rule.title?.en || rule.id;
  const base = { id: rule.id, severity: rule.severity || 'warn', activity: rule.activity || '', title, detail: rule.detail?.[lang] || rule.detail?.en || '' };
  const missing = [rule.from?.table, rule.to?.table, rule.table].filter((n) => n && !tables[n]);
  if (missing.length) return { ...base, skipped: `not read: ${missing.join(', ')}`, items: [] };
  if (rule.type === 'exists' || rule.type === 'assigned') {
    const from = t(rule.from.table).filter((r) => match(r, rule.from.where));
    const to = t(rule.to.table).filter((r) => match(r, rule.to.where));
    if (rule.type === 'exists') {
      const have = new Set(to.map((r) => tuple(r, rule.to.fields)));
      const bad = from.filter((r) => tuple(r, rule.from.fields).replace(/\u0001/g, '') && !have.has(tuple(r, rule.from.fields)));
      return { ...base, checked: from.length, items: bad.map((r) => label(r, [...(rule.show || []), ...rule.from.fields])) };
    }
    const used = new Set(to.map((r) => tuple(r, rule.to.fields)));
    const bad = from.filter((r) => !used.has(tuple(r, rule.from.fields)));
    return { ...base, checked: from.length, items: bad.map((r) => label(r, [...(rule.show || []), ...rule.from.fields])) };
  }
  if (rule.type === 'custom-keys') {
    const re = new RegExp(rule.pattern);
    const rows = t(rule.table).filter((r) => match(r, rule.where) && re.test(val(r[rule.field])));
    return { ...base, checked: t(rule.table).length, items: rows.map((r) => label(r, rule.show || [rule.field])) };
  }
  return { ...base, skipped: `unknown rule type ${rule.type}`, items: [] };
}

/** Built-in checks that need no rule file. */
// One finding for all activities whose values could not be read: the reason is
// the same few causes (blocklist, application table behind the view).
const reason = (err, L) => (/blocklist/.test(err) ? L('블록리스트', 'blocklist')
  : /not allowed/.test(err) ? L('업무 데이터 테이블(읽기 대상 아님)', 'application table (not read)') : err.slice(0, 80));

function builtIn(snapshot, viewsOf, lang) {
  const L = (ko, en) => (lang === 'ko' ? ko : en);
  const activities = [];
  const items = [];
  for (const [id, a] of Object.entries(snapshot.activities)) {
    const blocked = [...new Set(viewsOf({ ...a, id }).flatMap((v) => v.tables).filter((tn) => snapshot.tables[tn]?.error))];
    if (!blocked.length) continue;
    activities.push(id);
    items.push(`${a.title || id} — ${blocked.map((tn) => `${tn} (${reason(snapshot.tables[tn].error, L)})`).join(', ')}`);
  }
  if (!items.length) return [];
  return [{ id: 'READ-BLOCKED', severity: 'info', activity: '', activities, title: L('설정값을 읽지 못한 항목', 'Activities whose values could not be read'),
    detail: L('블록리스트이거나 뷰가 업무 데이터 테이블을 함께 보여 주는 경우입니다. SAP 화면에서 직접 확인하세요.', 'Blocklisted, or the view shows an application table as well. Check these in SAP.'), items }];
}

export function runChecks(snapshot, rules, viewsOf, lang = 'ko') {
  const results = builtIn(snapshot, viewsOf, lang);
  for (const r of rules.rules) results.push(runRule(r, snapshot.tables, lang));
  return results;
}

/** Attach each result to IMG activities: its own, or every activity that maintains a table the rule reads. */
export function attachActivities(results, rules, acts) {
  for (const c of results) {
    if (Array.isArray(c.activities)) continue;
    const rule = rules.rules.find((r) => r.id === c.id);
    const tables = c.activity || !rule ? [] : [rule.from?.table, rule.table].filter(Boolean);
    c.activities = c.activity ? [c.activity] : Object.values(acts).filter((a) => tables.some((t) => a.tables.includes(t))).map((a) => a.id);
  }
  return results;
}
