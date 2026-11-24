#!/usr/bin/env node
// Code-mode batch runner (PoC): runs many READ-ONLY sc4sap MCP calls in one
// process and prints one short line per call, so the model spends one turn
// instead of one turn per call and never sees the raw results.
//
// Safety: the PreToolUse hooks (tier-readonly-guard, evidence ledger) only see
// `node sap-batch.mjs`, not the MCP calls inside. So this runner refuses every
// tool whose server description does not start with "[read-only]". The table
// blocklist still applies — it lives in the MCP server.
//
// Usage:
//   node sap-batch.mjs --plan plan.json [--from n --to m] [--out <dir>] [--pick <path>]
//   node sap-batch.mjs --tool GetProgFullCode --each "A:PROG/P,B:FUGR" \
//        --args '{"output":"file"}' --keys name,type [--pick <path>]
// plan.json = { "calls": [ { "id": "A", "tool": "GetProgFullCode", "args": {...} } ] }
// --pick = dotted path into the parsed result (e.g. code_objects.0.path);
//          "dir:" prefix prints its parent folder. Without --pick: ok + size.
// Full results go to <out>/<id>.json only when --out is given.

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { connect } from '../config/sap-reader.mjs';
import { isDdMetadataQuery } from './dd-metadata-query.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function buildCalls() {
  const plan = arg('plan');
  if (plan) {
    // --from / --to (1-based, inclusive): run a long plan in parts (one Bash call stays under its time limit)
    const calls = JSON.parse(fs.readFileSync(plan, 'utf8')).calls;
    return calls.slice(Number(arg('from') || 1) - 1, Number(arg('to') || calls.length));
  }
  const tool = arg('tool');
  const each = arg('each');
  if (!tool || !each) throw new Error('need --plan or --tool + --each');
  const keys = (arg('keys') || 'name').split(',');
  const base = JSON.parse(arg('args') || '{}');
  return each.split(',').map((item) => {
    const vals = item.trim().split(':');
    const args = { ...base };
    keys.forEach((k, i) => { if (vals[i] !== undefined) args[k] = vals[i]; });
    return { id: vals[0], tool, args };
  });
}

function pickValue(obj, spec) {
  const asDir = spec.startsWith('dir:');
  const p = asDir ? spec.slice(4) : spec;
  // "*" maps over an array: fields.*.name → ["A","B",…]
  const walk = (cur, keys) => {
    if (!keys.length || cur == null) return cur;
    const [k, ...rest] = keys;
    if (k === '*') return Array.isArray(cur) ? cur.map((x) => walk(x, rest)) : undefined;
    return walk(cur[/^\d+$/.test(k) ? Number(k) : k], rest);
  };
  const v = walk(obj, p.split('.'));
  if (v === undefined) return undefined;
  // MCP paths are Windows paths on Windows; posix dirname does not split "\".
  if (asDir && typeof v === 'string') return v.includes('\\') ? path.win32.dirname(v) : path.dirname(v);
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// Read tools: marked [read-only] by the server, or named as a pure read
// (Get / Read / Search / List / Describe). Runtime*, Run* (except the business
// query, which the server marks [read-only]), Preview*, Create / Update /
// Delete / Activate never pass.
export function isReadTool(t) {
  return /^\[read-only\]/.test(t.description || '') || /^(Get|Read|Search|List|Describe)[A-Z]/.test(t.name);
}

// Row reads stay with the permission flow (common/data-extraction-policy.md):
// this runner never carries acknowledge_risk, never reads table contents, and
// runs GetSqlQuery only in the DD* metadata shape the permission-approver hook
// auto-approves (stock-cbo G3a).
const ROW_READ_TOOLS = new Set(['GetTableContents', 'GetRemoteTableContents']);

export function refuseDataRead(call) {
  const args = call.args || {};
  if (JSON.stringify(args).includes('acknowledge_risk')) return 'acknowledge_risk is never sent by a batch';
  if (ROW_READ_TOOLS.has(call.tool)) return `${call.tool} reads rows — call it directly so the permission flow sees it`;
  if (call.tool === 'GetSqlQuery' && !isDdMetadataQuery(args)) {
    return 'GetSqlQuery only in the DD* metadata shape (output "file"); other statements go through the permission flow';
  }
  return null;
}

function oneLine(s) {
  return String(s).replace(/\s+/g, ' ').slice(0, 200);
}

async function main() {
  const calls = buildCalls();
  const out = arg('out');
  const pick = arg('pick');
  if (out) fs.mkdirSync(out, { recursive: true });

  const client = await connect('sap-batch');
  try {
    const { tools } = await client.listTools();
    const readOnly = new Set(tools.filter(isReadTool).map((t) => t.name));
    let ok = 0;
    for (const c of calls) {
      if (!readOnly.has(c.tool)) {
        console.log(`${c.id}\tREFUSED\t${c.tool} is not a [read-only] tool`);
        continue;
      }
      const dataRefusal = refuseDataRead(c);
      if (dataRefusal) {
        console.log(`${c.id}\tREFUSED\t${dataRefusal}`);
        continue;
      }
      if (process.argv.includes('--dry-run')) { console.log(`${c.id}\tALLOWED\t${c.tool}`); continue; }
      try {
        const res = await client.callTool({ name: c.tool, arguments: c.args });
        const text = (res.content || []).map((b) => b.text || '').join('');
        if (res.isError) { console.log(`${c.id}\tERROR\t${oneLine(text)}`); continue; }
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* plain text result */ }
        if (out) fs.writeFileSync(path.join(out, `${c.id.replace(/[^\w.-]/g, '_')}.json`), text);
        const spec = c.pick || pick;
        const val = spec && parsed ? pickValue(parsed, spec) : undefined;
        console.log(`${c.id}\tOK\t${val !== undefined ? val : `${text.length} chars`}`);
        ok++;
      } catch (e) {
        console.log(`${c.id}\tERROR\t${oneLine(e.message)}`);
      }
    }
    console.error(`sap-batch: ${ok}/${calls.length} ok`);
  } finally {
    await client.close();
  }
}

export { pickValue, buildCalls };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(`sap-batch: ${e.message}`); process.exit(1); });
}
