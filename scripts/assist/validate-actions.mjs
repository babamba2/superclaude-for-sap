#!/usr/bin/env node
// Validate business-action catalogs (configs/<MODULE>/actions.json) for /sc4sap:assist.
// Checks the schema and a deprecation lint: S/4 variants must not use objects
// that the S/4HANA simplification list retires or demotes to compatibility only.
//
// Usage: node scripts/assist/validate-actions.mjs [configs/MM/actions.json ...]
//        (no argument = every configs/*/actions.json)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const KINDS = ['query', 'write'];
export const RISKS = ['none', 'medium', 'high'];
export const FAMILIES = ['ECC', 'S4'];

// Objects an S/4 variant must not use. Pattern → reason.
export const S4_FORBIDDEN = [
  [/^BAPI_VENDOR_/, 'vendor BAPIs are replaced by Business Partner / CVI on S/4'],
  [/^BAPI_CUSTOMER_/, 'customer BAPIs are replaced by Business Partner / CVI on S/4'],
  [/^MKPF$/, 'material documents live in MATDOC on S/4'],
  [/^MSEG$/, 'material documents live in MATDOC on S/4'],
  [/^BSEG$/, 'ACDOCA is the source of truth on S/4'],
  [/^VBUK$/, 'status fields moved into VBAK/LIKP/VBRK on S/4'],
  [/^VBUP$/, 'status fields moved into VBAP/LIPS/VBRP on S/4'],
  [/^KONV$/, 'pricing conditions live in PRCD_ELEMENTS on S/4'],
];

// Parameters that are tables (string_table) in ZIF_MCP_BIZ_ACTION=>ty_params. SAP reads a
// scalar JSON value for them as an empty table, so the catalog must declare them as lists
// (and every other parameter as a scalar). Keep in sync with abap/biz/zif_mcp_biz_action.intf.abap.
export const LIST_PARAMS = ['ebelp', 'cbo', 'items', 'fields', 'exists', 'lines', 'dlv_list'];
const isListType = (t) => t === 'array' || /\[\]$/.test(t ?? '');

const ID_RE = /^[A-Z]{2,4}\.[A-Z0-9_]+\.[A-Z0-9_]+$/;

function objectNamesOf(impl) {
  const names = [];
  if (impl.fm) names.push(impl.fm);
  if (Array.isArray(impl.source)) names.push(...impl.source);
  return names;
}

/** Returns a list of error strings for one parsed catalog. */
export function validateCatalog(cat, label = 'catalog') {
  const errors = [];
  const err = (m) => errors.push(`${label}: ${m}`);

  if (cat.schemaVersion !== 1) err('schemaVersion must be 1');
  if (!cat.module) err('module is required');
  if (!Array.isArray(cat.actions) || cat.actions.length === 0) {
    err('actions must be a non-empty array');
    return errors;
  }

  const ids = new Set();
  for (const a of cat.actions) {
    const at = `${a.id ?? '(no id)'}`;
    if (!a.id || !ID_RE.test(a.id)) err(`${at}: id must look like MM.PO.LIST_OPEN`);
    else if (!a.id.startsWith(`${cat.module}.`)) err(`${at}: id must start with module ${cat.module}`);
    if (ids.has(a.id)) err(`${at}: duplicate id`);
    ids.add(a.id);

    if (!KINDS.includes(a.kind)) err(`${at}: kind must be one of ${KINDS.join('|')}`);
    if (!RISKS.includes(a.risk)) err(`${at}: risk must be one of ${RISKS.join('|')}`);
    if (a.kind === 'query' && a.risk !== 'none') err(`${at}: query actions must have risk none`);
    if (a.kind === 'write' && a.risk === 'none') err(`${at}: write actions need risk medium or high`);
    if (a.risk === 'high' && a.max_items !== 1) err(`${at}: high-risk actions must set max_items 1`);
    if (!a.title) err(`${at}: title is required`);
    if (!a.intents?.en?.length || !a.intents?.ko?.length) err(`${at}: intents.en and intents.ko are required`);
    if (!Array.isArray(a.params)) err(`${at}: params must be an array`);
    for (const p of a.params ?? []) {
      const list = LIST_PARAMS.includes(p.name);
      if (list && !isListType(p.type)) err(`${at}: param ${p.name} is a table in SAP — type must be string[]`);
      if (!list && isListType(p.type)) err(`${at}: param ${p.name} is a scalar in SAP — type must not be a list`);
    }
    if (!Array.isArray(a.auth) || a.auth.length === 0) err(`${at}: at least one auth object is required`);
    if (!Array.isArray(a.verified_on)) err(`${at}: verified_on must be an array`);

    // what the preview cannot prove: shown to the user with every preview of a write action
    if (a.kind === 'write') {
      const pl = a.preview_limits;
      if (!pl || !Array.isArray(pl.en) || !Array.isArray(pl.ko) || pl.en.length === 0) {
        err(`${at}: write actions need preview_limits.en and preview_limits.ko (what the preview cannot prove)`);
      } else if (pl.en.length !== pl.ko.length) {
        err(`${at}: preview_limits.en and preview_limits.ko must have the same number of lines`);
      }
    }

    // clarify entries: a question, never a default answer
    for (const c of a.clarify ?? []) {
      if (!c.param || !c.ask) err(`${at}: clarify entries need param and ask`);
      if ('default' in c) err(`${at}: clarify must not carry a default (business questions are asked)`);
    }

    // implementation per system family
    for (const fam of FAMILIES) {
      const impl = a.impl?.[fam];
      if (!impl) { err(`${at}: impl.${fam} is required`); continue; }
      if (!impl.fm && !impl.source) err(`${at}: impl.${fam} needs fm or source`);
      if (a.kind === 'write') {
        if (!impl.testrun) err(`${at}: impl.${fam}.testrun is required for writes ("TESTRUN" or "none")`);
        if (impl.testrun === 'none' && !impl.preview) err(`${at}: impl.${fam} without testrun needs a preview strategy`);
        if (!impl.commit) err(`${at}: impl.${fam}.commit is required for writes`);
      }
      if (fam === 'S4') {
        for (const name of objectNamesOf(impl)) {
          for (const [re, why] of S4_FORBIDDEN) {
            if (re.test(name)) err(`${at}: impl.S4 uses ${name} — ${why}`);
          }
        }
      }
    }

    for (const v of a.verified_on ?? []) {
      if (!v.alias || !FAMILIES.includes(v.family) || !v.release || !v.date || !v.evidence) {
        err(`${at}: verified_on entries need alias, family (ECC|S4), release, date, evidence`);
      }
    }
  }

  // references must point to known actions (or be marked as outside the pilot)
  for (const a of cat.actions) {
    for (const ref of [a.reverse, ...(a.ambiguity?.candidates ?? [])]) {
      if (!ref || /\(not in pilot\)$/.test(ref)) continue;
      if (!ids.has(ref)) err(`${a.id}: references unknown action ${ref}`);
    }
  }
  return errors;
}

export function catalogFiles() {
  const dir = join(ROOT, 'configs');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dir, d.name, 'actions.json'))
    .filter((p) => existsSync(p));
}

function main(argv) {
  const files = argv.length ? argv : catalogFiles();
  let failed = 0;
  for (const f of files) {
    const errors = validateCatalog(JSON.parse(readFileSync(f, 'utf8')), f);
    if (errors.length) { failed += errors.length; errors.forEach((e) => console.error(e)); }
    else console.log(`ok ${f}`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
