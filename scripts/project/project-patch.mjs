// sc4sap:project-dashboard — text proposals applied to a project model (pure, no I/O).
//
// The web workbench's AI helper drafts text only; the PM accepts each op. Dates, statuses, owners, progress,
// stages, baselines and ids are never changed here — an op that tries is skipped with the reason.
//
//   applyPatch(model, ops, { today }) → { model, applied, skipped: [{ index, why }] }   (model is a new object)
//
// ops:
//   { op: 'set-text', target: 'risk',                id, field: 'text', value }
//   { op: 'set-text', target: 'decision',            id, field: 'text' | 'note', value }
//   { op: 'set-text', target: 'issue',               id, field: 'text' | 'note' | 'resolution', value }
//   { op: 'set-text', target: 'milestone-criterion', id: <milestone id>, index, field: 'text', value }   (id "<milestone id>:<index>" too)
//   { op: 'set-text', target: 'cutover-task',        id, field: 'label' | 'note', value }
//   { op: 'set-text', target: 'gonogo',              id, field: 'text', value }
//   { op: 'set-text', target: 'status',              field: 'comment', value }   (an id, e.g. the week end, is ignored)
//   { op: 'add-risk', text, impact?: H | M | L }      → open, no owner / due; raised = today
//   { op: 'add-decision', text }                      → open, no owner / due
//   { op: 'add-issue', text, priority?: H | M | L }   → open, no owner / due; raised = today
// A criterion keeps its rule tag ("… [cts-blocked<=0]"): a new text without the old tag gets it appended.

import { arr, normalizeModel } from './project-model.mjs';

export const PATCH_FIELDS = {
  risk: ['text'],
  decision: ['text', 'note'],
  issue: ['text', 'note', 'resolution'],
  'milestone-criterion': ['text'],
  'cutover-task': ['label', 'note'],
  gonogo: ['text'],
  status: ['comment'],
};
export const MAX_TEXT = 2000;
const IMPACT = ['H', 'M', 'L'];
const TAG = /\s*\[[a-z-]+(?::[^\]]*)?(?:<=|>=)[^\]]*\]\s*$/i;

// An allow-list entry for a key from the input: own keys only ("constructor", "__proto__", "toString" → none).
const own = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null);
const clean = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : null);
const nextId = (list, prefix) => { let n = list.length + 1; const have = new Set(list.map((x) => x.id)); while (have.has(prefix + n)) n++; return prefix + n; };

export function applyPatch(model0, ops, { today = '' } = {}) {
  const model = normalizeModel(JSON.parse(JSON.stringify(model0 || {})));
  const applied = [], skipped = [];
  arr(ops).forEach((o, index) => {
    const skip = (why) => skipped.push({ index, why });
    if (!o || typeof o !== 'object') return skip('not an op');
    if (o.op === 'add-risk' || o.op === 'add-decision' || o.op === 'add-issue') {
      const extra = Object.keys(o).filter((k) => !['op', 'text', ...(o.op === 'add-risk' ? ['impact'] : o.op === 'add-issue' ? ['priority'] : [])].includes(k));
      if (extra.length) return skip(`not allowed: ${extra.join(', ')}`);
      const text = clean(o.text);
      if (!text) return skip('empty text');
      if (text.length > MAX_TEXT) return skip('text too long');
      if (o.op === 'add-risk') {
        if (o.impact != null && !IMPACT.includes(o.impact)) return skip('impact must be H, M or L');
        const r = { id: nextId(model.risks, 'RK'), text, impact: o.impact || 'M', status: 'open', ...(today ? { raised: today } : {}) };
        model.risks.push(r); applied.push({ index, op: o.op, id: r.id });
      } else if (o.op === 'add-issue') {
        if (o.priority != null && !IMPACT.includes(o.priority)) return skip('priority must be H, M or L');
        const x = { id: nextId(model.issues, 'IS'), text, priority: o.priority || 'M', status: 'open', ...(today ? { raised: today } : {}) };
        model.issues.push(x); applied.push({ index, op: o.op, id: x.id });
      } else {
        const d = { id: nextId(model.decisions, 'DC'), text, status: 'open' };
        model.decisions.push(d); applied.push({ index, op: o.op, id: d.id });
      }
      return;
    }
    if (o.op !== 'set-text') return skip(`unknown op "${String(o.op).slice(0, 30)}"`);
    const fields = own(PATCH_FIELDS, o.target);
    if (!fields) return skip(`target "${String(o.target).slice(0, 30)}" is not text`);
    if (!fields.includes(o.field)) return skip(`field "${String(o.field).slice(0, 30)}" of ${o.target} is not text (dates, statuses, owners and progress are the PM's)`);
    const value = clean(o.value);
    if (value === null) return skip('value must be text');
    if (value.length > MAX_TEXT) return skip('text too long');
    if (!value && ['text', 'label'].includes(o.field)) return skip('empty text');
    let obj = null;
    if (o.target === 'risk') obj = model.risks.find((x) => x.id === o.id);
    else if (o.target === 'decision') obj = model.decisions.find((x) => x.id === o.id);
    else if (o.target === 'issue') obj = model.issues.find((x) => x.id === o.id);
    else if (o.target === 'cutover-task') obj = arr(model.cutover?.tasks).find((x) => x.id === o.id);
    else if (o.target === 'gonogo') obj = arr(model.cutover?.goNoGo).find((x) => x.id === o.id);
    else if (o.target === 'status') obj = (model.status = model.status && typeof model.status === 'object' ? model.status : {});
    else if (o.target === 'milestone-criterion') {
      // "<milestone id>:<index>" names both (milestone ids hold no colon)
      const [mid, ix] = o.index == null && /:\d+$/.test(String(o.id)) ? [String(o.id).replace(/:\d+$/, ''), String(o.id).split(':').pop()] : [o.id, o.index];
      const ms = model.milestones.find((x) => x.id === mid);
      if (!ms) return skip(`milestone "${String(mid).slice(0, 40)}" not found`);
      const i = Number(ix);
      if (!Number.isInteger(i) || i < 0 || i >= arr(ms.criteria).length) return skip('criterion index not found');
      const tag = (TAG.exec(String(ms.criteria[i])) || [''])[0].trim();
      ms.criteria[i] = tag && !TAG.test(value) ? `${value} ${tag}` : value;
      applied.push({ index, op: o.op, target: o.target, id: o.id, field: 'text' });
      return;
    }
    if (!obj) return skip(`${o.target} "${String(o.id).slice(0, 40)}" not found`);
    obj[o.field] = value;
    applied.push({ index, op: o.op, target: o.target, id: o.id ?? '', field: o.field });
  });
  return { model, applied, skipped };
}
