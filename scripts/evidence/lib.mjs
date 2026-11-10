/**
 * Evidence ledger + receipt — pure functions (no I/O except the helpers at the bottom).
 *
 * The ledger is written by the PostToolUse hook (record.mjs) from the MCP
 * response itself, never by an agent. build-receipt.mjs turns the ledger into
 * `.sc4sap/program/{PROG}/receipt.json` — the Done Criteria verdicts of
 * common/verification-evidence.md Rule 2, decided by code.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

export const SAP_NAMESPACES = ['mcp__plugin_sc4sap_sap__', 'mcp__mcp-abap-adt__'];
export const CHECK_TOOLS = new Set(['ActivateObjects', 'GetInactiveObjects', 'RunUnitTest', 'GetUnitTestResult']);
const WRITE_PREFIXES = ['Create', 'Update', 'Patch', 'Write'];

export function handlerName(toolName) {
  const ns = SAP_NAMESPACES.find((n) => typeof toolName === 'string' && toolName.startsWith(n));
  return ns ? toolName.slice(ns.length) : null;
}

export function isWriteTool(handler) {
  return WRITE_PREFIXES.some((p) => handler.startsWith(p)) && handler !== 'CreateTransport';
}

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

/** Text of an MCP tool response as Claude Code hands it to PostToolUse (several shapes seen). */
export function responseText(resp) {
  if (resp == null) return '';
  if (typeof resp === 'string') return resp;
  if (Array.isArray(resp)) return resp.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n');
  if (Array.isArray(resp.content)) return responseText(resp.content);
  if (resp.result !== undefined) return responseText(resp.result);
  if (typeof resp.text === 'string') return resp.text;
  return JSON.stringify(resp);
}

export function isErrorResponse(resp) {
  return !!(resp && typeof resp === 'object' && !Array.isArray(resp) && resp.isError === true);
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const up = (s) => String(s).trim().toUpperCase();

/** Object names a write tool touched — every `name` / `*_name` string, plus objects[].name. */
export function namesFromInput(input) {
  const out = new Set();
  if (!input || typeof input !== 'object') return [];
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v && (k === 'name' || k.endsWith('_name')) && k !== 'transport_name') out.add(up(v));
  }
  if (Array.isArray(input.objects)) for (const o of input.objects) if (o && o.name) out.add(up(o.name));
  return [...out];
}

/** ABAP Unit runResult XML → counts. Failure = an alert with severity critical / fatal. */
export function parseAunit(xml) {
  if (typeof xml !== 'string' || !xml.includes('runResult')) return null;
  // Self-closing form first: `<testMethod …/>` has no body; otherwise `[^>]*` would eat the `/`.
  const METHOD = /<(?:\w+:)?testMethod\b([^>]*?)\/>|<(?:\w+:)?testMethod\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?testMethod>/g;
  const methods = [...xml.matchAll(METHOD)];
  const failedRe = /<(?:\w+:)?alert\b[^>]*severity="(?:critical|fatal)"/i;
  const nameOf = (attrs) => ((attrs || '').match(/(?:adtcore:)?name="([^"]*)"/) || [])[1] || '?';
  const failed = [];
  for (const m of methods) if (m[3] && failedRe.test(m[3])) failed.push(nameOf(m[2]));
  // Alerts outside any test method (class setup failed, program not runnable) also fail the run.
  const outside = xml.replace(METHOD, '');
  const outsideFail = failedRe.test(outside);
  const firstTitle = (xml.match(/<(?:\w+:)?title>([\s\S]*?)<\/(?:\w+:)?title>/) || [])[1];
  const programs = [...xml.matchAll(/<(?:\w+:)?program\b[^>]*?(?:adtcore:)?name="([^"]*)"/g)].map((m) => up(m[1]));
  return { programs, methods: methods.length, failed: failed.length, failed_methods: failed.slice(0, 10), outside_fail: outsideFail, first_alert: firstTitle ? firstTitle.trim().slice(0, 200) : undefined };
}

/** One ledger line for a PostToolUse payload, or null when the call is not evidence. */
export function ledgerEntry(payload, now = new Date()) {
  const handler = handlerName(payload?.tool_name);
  if (!handler) return null;
  const input = payload.tool_input || {};
  const base = { t: now.toISOString(), session: payload.session_id, tool: handler };
  if (isWriteTool(handler)) return { ...base, kind: 'write', names: namesFromInput(input) };
  if (!CHECK_TOOLS.has(handler)) return null;
  const text = responseText(payload.tool_response);
  const entry = { ...base, kind: 'check', sha256: sha256(text), error: isErrorResponse(payload.tool_response) };
  const data = tryJson(text);
  if (!data) return { ...entry, error: true, excerpt: text.slice(0, 300) };
  if (handler === 'ActivateObjects') {
    entry.requested = (input.objects || []).map((o) => up(o.name || ''));
    entry.success = data.success === true;
    entry.objects = (data.objects || []).map((o) => ({ name: up(o.name || ''), status: o.status }));
    entry.errors = (data.errors || []).slice(0, 5).map((e) => (typeof e === 'string' ? e : e.message || e.text || JSON.stringify(e)).slice(0, 200));
  } else if (handler === 'GetInactiveObjects') {
    entry.inactive = (data.objects || []).map((o) => up(o.name || ''));
  } else {
    entry.run_id = data.run_id;
    if (handler === 'RunUnitTest') entry.containers = (input.tests || []).map((x) => up(x.container_class || ''));
    const r = data.run_result;
    if (r !== undefined) entry.aunit = parseAunit(typeof r === 'string' ? r : JSON.stringify(r)) || { unparsed: true };
  }
  return entry;
}

// ── receipt ──────────────────────────────────────────────────────────────

const belongs = (name, prog, also) => name === prog || name.startsWith(prog) || also.has(name);

const DOES_NOT_PROVE = {
  activation: 'business logic is right; runtime behaviour with real data',
  inactive: 'objects are on the right transport',
  unit_test: 'cases the tests do not cover; tests written with the same mistake as the code',
};

/**
 * Decide the Done Criteria checks for one program from the ledger.
 * @param {object[]} entries ledger lines (any order)
 * @param {string} prog main program name
 * @param {{also?: string[], unitTestRequired?: boolean}} opts
 */
export function buildReceipt(entries, prog, opts = {}) {
  const P = up(prog);
  const also = new Set((opts.also || []).map(up));
  const mine = (n) => belongs(n, P, also);
  const sorted = [...entries].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  const lastWrite = new Map();
  for (const e of sorted) if (e.kind === 'write') for (const n of e.names || []) if (mine(n)) lastWrite.set(n, e.t);
  const lastWriteAll = [...lastWrite.values()].sort().pop();

  const checks = [];
  const ref = (e) => ({ t: e.t, tool: e.tool, sha256: e.sha256 });

  // 1. Activation: every written object has a successful activation after its last write.
  const acts = sorted.filter((e) => e.tool === 'ActivateObjects' && (e.objects || e.requested || []).some((o) => mine(o.name || o)));
  const lastAct = acts[acts.length - 1];
  if (!lastAct) {
    checks.push({ id: 'activation', status: 'NOT RUN', result: 'no ActivateObjects call on this program recorded' });
  } else {
    const activatedAt = new Map();
    for (const a of acts) if (!a.error) for (const o of a.objects || []) if (mine(o.name) && o.status !== 'failed') activatedAt.set(o.name, a.t);
    const failedNow = (lastAct.objects || []).filter((o) => mine(o.name) && o.status === 'failed').map((o) => o.name);
    const never = [...lastWrite.keys()].filter((n) => !activatedAt.has(n));
    const stale = [...lastWrite.entries()].filter(([n, t]) => activatedAt.has(n) && activatedAt.get(n) < t).map(([n]) => n);
    const fail = lastAct.error || failedNow.length > 0 || stale.length > 0 || never.length > 0;
    const parts = [];
    if (lastAct.error) parts.push('last activation call returned an error');
    if (failedNow.length) parts.push(`failed: ${failedNow.join(', ')}`);
    if (lastAct.errors?.length) parts.push(`errors: ${lastAct.errors.join(' | ')}`);
    if (never.length) parts.push(`no activation recorded after the write: ${never.join(', ')}`);
    if (stale.length) parts.push(`changed after its last activation: ${stale.join(', ')}`);
    if (!fail) parts.push(`${activatedAt.size} object(s) activated, none changed afterwards`);
    checks.push({ id: 'activation', status: fail ? 'FAIL' : 'PASS', result: parts.join('; '), evidence: ref(lastAct) });
  }

  // 2. Inactive list read after the last activation and the last write.
  const after = [lastAct?.t, lastWriteAll].filter(Boolean).sort().pop() || '';
  const inact = lastAct && sorted.filter((e) => e.tool === 'GetInactiveObjects' && !e.error && e.t >= after).pop();
  if (!lastAct) {
    checks.push({ id: 'inactive', status: 'NOT RUN', result: 'nothing of this program was activated, so an empty list proves nothing' });
  } else if (!inact) {
    checks.push({ id: 'inactive', status: 'NOT RUN', result: 'no GetInactiveObjects after the last activation / change' });
  } else {
    const left = (inact.inactive || []).filter(mine);
    checks.push({ id: 'inactive', status: left.length ? 'FAIL' : 'PASS', result: left.length ? `still inactive: ${left.join(', ')}` : `0 of this program's objects in a list of ${(inact.inactive || []).length}`, evidence: ref(inact) });
  }

  // 3. Unit tests: newest result for a run on this program's containers.
  const runs = new Map();
  for (const e of sorted) if (e.tool === 'RunUnitTest' && e.run_id && (e.containers || []).some(mine)) runs.set(e.run_id, e);
  const results = sorted.filter((e) => e.aunit && !e.aunit.unparsed && ((e.tool === 'RunUnitTest' && (e.containers || []).some(mine)) || (e.tool === 'GetUnitTestResult' && runs.has(e.run_id)) || (e.aunit.programs || []).some(mine)));
  const res = results[results.length - 1];
  if (!res) {
    checks.push({ id: 'unit_test', status: 'NOT RUN', result: runs.size ? 'run started but no result recorded' : 'no unit test run on this program recorded', required: !!opts.unitTestRequired });
  } else {
    const a = res.aunit;
    const staleT = lastWriteAll && res.t < lastWriteAll;
    let status = 'PASS';
    let result = `${a.methods} test method(s), ${a.failed} failed`;
    if (a.methods === 0) { status = 'NOT RUN'; result = '0 test methods in the result'; }
    if (a.failed > 0 || a.outside_fail) { status = 'FAIL'; result += a.failed_methods.length ? ` (${a.failed_methods.join(', ')})` : ''; if (a.first_alert) result += ` — ${a.first_alert}`; }
    if (staleT && status === 'PASS') { status = 'FAIL'; result += '; code changed after this run'; }
    checks.push({ id: 'unit_test', status, result, evidence: ref(res), required: !!opts.unitTestRequired });
  }

  for (const c of checks) c.does_not_prove = DOES_NOT_PROVE[c.id];
  const counted = checks.filter((c) => c.id !== 'unit_test' || c.required || c.status !== 'NOT RUN');
  const verdict = counted.some((c) => c.status === 'FAIL') ? 'FAIL' : counted.some((c) => c.status === 'NOT RUN') ? 'INCOMPLETE' : 'PASS';
  return { program: P, also: [...also], verdict, checks, ledger_entries: entries.length };
}

export function receiptMarkdown(r) {
  const lines = [`Receipt verdict: **${r.verdict}** (${r.program})`, ''];
  for (const c of r.checks) {
    const ev = c.evidence ? ` [${c.evidence.tool} ${c.evidence.t}]` : '';
    lines.push(`- ${c.id}${ev} → ${c.result} — ${c.status}`);
    if (c.status === 'PASS') lines.push(`  ↳ does not prove: ${c.does_not_prove}`);
  }
  return lines.join('\n');
}

/**
 * Project root: nearest ancestor holding `.sc4sap/`, else the start dir (where create-program
 * writes `.sc4sap/program/` too). The home directory counts only as the start dir itself —
 * reached by walking up, `~/.sc4sap/` is the global profile store, not this project.
 */
export function projectRoot(start) {
  let first = resolve(start || process.cwd());
  // A cwd inside a `.sc4sap` tree (e.g. `.sc4sap/program/ZPROG`) must resolve to the
  // project that owns that tree — never to a stray nested `.sc4sap` another hook created there.
  const parts = first.split(/[\\/]+/);
  const inner = parts.findIndex((p) => p.toLowerCase() === '.sc4sap');
  if (inner > 0) first = resolve(parts.slice(0, inner).join(sep) + sep);
  const home = resolve(homedir()).toLowerCase();
  for (let dir = first; ; ) {
    const skip = dir !== first && dir.toLowerCase() === home;
    if (!skip && existsSync(join(dir, '.sc4sap'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return first;
    dir = parent;
  }
}

export const ledgerPath = (root) => join(root, '.sc4sap', 'evidence', 'ledger.jsonl');
export const receiptPath = (root, prog) => join(root, '.sc4sap', 'program', up(prog), 'receipt.json');
