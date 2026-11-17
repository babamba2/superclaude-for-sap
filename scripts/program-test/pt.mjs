#!/usr/bin/env node
/**
 * program-test CLI — run state, checks, harness / mutant / tamper generation, verdict.
 *
 *   pt.mjs init <PROG> --source dev|qa|prd [--root <dir>]   new run (+ active capture marker)
 *   pt.mjs mask-extra --run <dir> --fields F1,F2              more personal fields to mask (before reads)
 *   pt.mjs check --run <dir>                                  cases.json / expected.json / plan.json checks
 *   pt.mjs freeze --run <dir> [--reason "<spec ref>" --user-approved]   freeze expected (re-freeze only with both)
 *   pt.mjs abap-rows --run <dir> --table <T> [--fields a,b]   VALUE #( … ) from the masked rows
 *   pt.mjs harness --run <dir>                                lint test-class.abap, write harness/<H>.abap
 *   pt.mjs mutants --run <dir>                                mutant + tamper programs under harness/
 *   pt.mjs verdict --run <dir>                                per-case verdict → pt-receipt.json + report.md
 *   pt.mjs close --run <dir>                                  stop capturing
 *
 * Exit: 0 ok / PASS · 1 problems / FAIL verdicts · 2 INCOMPLETE · 3 usage / I/O · 4 PARTIAL / NOT_TESTABLE ·
 *       5 destination missing (QA) · 6 connected system is not DEV · 7 production refused (no MCP-side masking yet).
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ledgerPath, projectRoot } from '../evidence/lib.mjs';
import { readActiveConfigJson, readActiveSapEnv, resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { activePath } from './pt-capture.mjs';
import {
  abapRows, buildHarness, buildMutant, buildTamper, checkCases, checkExpected, checkPlan, decide, evidenceLines,
  exitCode, harnessNames, lintHarness, MAX_ROUNDS, mutationCandidates, PRD_REFUSED, sha, SOURCES, srcSha,
} from './pt-lib.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n) => {
  const i = argv.indexOf(n);
  return i > 0 ? argv[i + 1] : undefined;
};
const flag = (n) => argv.includes(n);
const up = (s) => String(s ?? '').trim().toUpperCase();
const die = (msg, code = 3) => {
  console.error(msg);
  process.exit(code);
};
const readJson = (f, fb) => {
  try {
    return JSON.parse(readFileSync(f, 'utf-8'));
  } catch {
    return fb;
  }
};
const writeJson = (f, d) => writeFileSync(f, JSON.stringify(d, null, 2) + '\n', 'utf-8');

function runDir() {
  const d = arg('--run');
  if (!d || !existsSync(join(d, 'state.json'))) die('usage: --run <run folder with state.json>');
  return resolve(d);
}
const stateOf = (d) => readJson(join(d, 'state.json'), null);
const saveState = (d, s) => writeJson(join(d, 'state.json'), s);
const fileText = (f) => (existsSync(f) ? readFileSync(f, 'utf-8') : null);

function sources(d) {
  const dir = join(d, 'src');
  const out = {};
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.abap')) out[f.slice(0, -5).replace(/#/g, '/')] = readFileSync(join(dir, f), 'utf-8');
  return out;
}

function inputs(d) {
  return { cases: readJson(join(d, 'cases.json'), null), expected: readJson(join(d, 'expected.json'), null), plan: readJson(join(d, 'plan.json'), null) };
}

const HOWTO = (src) => `No SM59 destination for ${src.toUpperCase()} in the profile config.json → testDataSources.${src}.
The skill never creates destinations. To set one up (SAP Basis, in the DEV system):
  1. SM59 → ABAP Connections → create (type 3): target host / instance of the ${src.toUpperCase()} system, client.
  2. Logon: a technical RFC user of the ${src.toUpperCase()} system with S_RFC (RFC_READ_TABLE, SDTX) and
     S_TABU_DIS / S_TABU_NAM in display (03) for the tables to read — nothing else.
  3. Connection Test + Remote Logon OK.
  4. /sc4sap:sap-option → Test data sources → ${src} = <destination name> (case-sensitive).
Or run with --source dev (DEV's own data, no destination).`;

switch (cmd) {
  case 'init': {
    const prog = up(argv[1]);
    const source = arg('--source') || 'dev';
    if (!prog || prog.startsWith('--')) die('usage: pt.mjs init <PROG> --source dev|qa|prd');
    if (!SOURCES.includes(source)) die(`--source must be ${SOURCES.join(' / ')}`);
    if (source === 'prd') die(PRD_REFUSED, 7);
    const root = projectRoot(arg('--root'));
    const env = readActiveSapEnv(root)?.env || {};
    const tier = up(env.SAP_TIER || 'DEV');
    if (tier !== 'DEV') die(`connected system tier is ${tier} — the harness is written to $TMP, so program-test runs only on a DEV profile`, 6);
    const cfg = readActiveConfigJson(root)?.config || {};
    let destination = null;
    if (source !== 'dev') {
      destination = String(cfg.testDataSources?.[source] || '').trim();
      if (!destination) die(HOWTO(source), 5);
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
    // per-profile artifact base (common/multi-profile-artifact-resolution.md): <root>/.sc4sap/work/<alias>/ or legacy <root>/.sc4sap/
    const d = join(resolveArtifactBase(root), 'program', prog, 'test', stamp);
    mkdirSync(d, { recursive: true });
    const state = { program: prog, source, destination, sap_version: cfg.sapVersion || null, abap_release: cfg.abapRelease || null, created_at: new Date().toISOString(), salt: randomBytes(16).toString('hex'), mask_extra: [], round: 0, names: harnessNames(prog) };
    saveState(d, state);
    mkdirSync(join(root, '.sc4sap', 'program-test'), { recursive: true });
    writeJson(activePath(root), { program: prog, run_dir: d, source, destination });
    console.log(JSON.stringify({ run: d, source, destination, harness: state.names.harness, mutants: state.names.mutants, tamper: state.names.tamper }, null, 2));
    break;
  }
  case 'mask-extra': {
    const d = runDir();
    const s = stateOf(d);
    const add = (arg('--fields') || '').split(',').map(up).filter(Boolean);
    s.mask_extra = [...new Set([...(s.mask_extra || []), ...add])];
    saveState(d, s);
    console.log(`mask extra: ${s.mask_extra.join(', ') || '(none)'}`);
    break;
  }
  case 'check': {
    const d = runDir();
    const s = stateOf(d);
    const { cases, expected, plan } = inputs(d);
    const p = [];
    if (!cases) p.push('cases.json missing / not JSON');
    else p.push(...checkCases(cases));
    if (cases && !expected) p.push('expected.json missing / not JSON');
    else if (cases) p.push(...checkExpected(cases, expected));
    if (!plan) p.push('plan.json missing / not JSON');
    else {
      if (plan.source !== s.source) p.push(`plan.source ${plan.source} ≠ run source ${s.source}`);
      if (s.source !== 'dev' && plan.destination !== s.destination) p.push(`plan.destination ${plan.destination} ≠ ${s.destination}`);
      p.push(...checkPlan(plan, (cases?.cases || []).map((c) => c.id)));
    }
    if (!sources(d)[s.program]) p.push(`source of ${s.program} not captured — GetProgram ${s.program} during the run`);
    console.log(p.length ? p.map((x) => `- ${x}`).join('\n') : 'check OK');
    process.exit(p.length ? 1 : 0);
  }
  case 'freeze': {
    const d = runDir();
    const s = stateOf(d);
    const { cases, expected, plan } = inputs(d);
    const p = [...(cases ? checkCases(cases) : ['cases.json missing']), ...(cases && expected ? checkExpected(cases, expected) : ['expected.json missing'])];
    if (p.length) die(p.map((x) => `- ${x}`).join('\n'), 1);
    const eSha = sha(readFileSync(join(d, 'expected.json'), 'utf-8'));
    if (s.frozen?.expected_sha && s.frozen.expected_sha !== eSha) {
      const reason = arg('--reason');
      if (!reason || !flag('--user-approved')) die('expected.json is already frozen. A change needs --reason "<spec section>" --user-approved (the user said yes to this exact change).', 1);
      s.expected_changes = [...(s.expected_changes || []), { t: new Date().toISOString(), from: s.frozen.expected_sha, to: eSha, reason }];
    }
    s.frozen = { t: new Date().toISOString(), expected_sha: eSha, cases_sha: sha(readFileSync(join(d, 'cases.json'), 'utf-8')) };
    s.plan_tables = (plan?.tables || []).map((t) => up(t.table));
    s.srcNames = Object.keys(sources(d)).map(up);
    saveState(d, s);
    console.log(`frozen expected ${eSha.slice(0, 12)} · ${cases.cases.length} case(s) · source names ${s.srcNames.join(', ') || '(none)'}`);
    break;
  }
  case 'abap-rows': {
    const d = runDir();
    const t = up(arg('--table'));
    const f = readJson(join(d, 'rows', `${t.replace(/\//g, '#')}.json`), null);
    if (!f) die(`no captured rows for ${t}`, 1);
    console.log(abapRows(f.rows, (arg('--fields') || '').split(',').filter(Boolean)));
    break;
  }
  case 'harness': {
    const d = runDir();
    const s = stateOf(d);
    const { cases, expected, plan } = inputs(d);
    if (!s.frozen) die('freeze expected.json first', 1);
    const main = sources(d)[s.program];
    if (!main) die(`source of ${s.program} not captured`, 1);
    const tc = fileText(join(d, 'test-class.abap'));
    if (!tc) die('test-class.abap missing', 1);
    const lint = lintHarness(tc, cases, expected, plan, readJson(join(d, 'fingerprints.json'), []), s.salt);
    s.lint_problems = lint;
    if (lint.length) {
      saveState(d, s);
      die(`harness lint:\n${lint.map((x) => `- ${x}`).join('\n')}`, 1);
    }
    const src = buildHarness(main, s.names.harness, tc);
    mkdirSync(join(d, 'harness'), { recursive: true });
    const file = join(d, 'harness', `${s.names.harness}.abap`);
    writeFileSync(file, src, 'utf-8');
    s.harness = { name: s.names.harness, sha: srcSha(src), file, test_class_sha: srcSha(tc) };
    s.mutants = [];
    s.tamper = null;
    saveState(d, s);
    console.log(`harness ${s.names.harness} → ${file}`);
    break;
  }
  case 'mutants': {
    const d = runDir();
    const s = stateOf(d);
    const { cases, expected } = inputs(d);
    if (!s.harness) die('build the harness first', 1);
    const H = readFileSync(s.harness.file, 'utf-8');
    if (srcSha(H) !== s.harness.sha) die('harness file changed after it was generated — run pt.mjs harness again', 1);
    const srcs = sources(d);
    const hSrcs = { ...srcs, [s.program]: H };
    const cites = (cases.cases || []).filter((c) => c.testable !== false).flatMap((c) => c.source || []);
    const cands = mutationCandidates(hSrcs, cites);
    s.mutants = [];
    cands.forEach((m, i) => {
      const name = s.names.mutants[i];
      const src = buildMutant(H, name, m, srcs, s.program);
      const file = join(d, 'harness', `${name}.abap`);
      writeFileSync(file, src, 'utf-8');
      s.mutants.push({ name, include: m.include, line: m.line, before: m.before, after: m.after, sha: srcSha(src), file });
    });
    const t = buildTamper(H, s.names.tamper, cases, expected);
    if (t) {
      const file = join(d, 'harness', `${s.names.tamper}.abap`);
      writeFileSync(file, t.source, 'utf-8');
      s.tamper = { name: s.names.tamper, case: t.case, method: t.method, value: t.value, sha: srcSha(t.source), file };
    }
    saveState(d, s);
    for (const m of s.mutants) console.log(`mutant ${m.name}: ${m.include}:${m.line}  ${m.before}  →  ${m.after}`);
    console.log(t ? `tamper ${s.names.tamper}: ${t.case} expected ${JSON.stringify(t.value)} changed` : 'tamper: no expected literal found in a case method');
    if (!cands.length) console.log('no mutant: the cited source lines hold no condition — cite the IF / WHERE / CHECK lines the cases exercise');
    process.exit(cands.length && t ? 0 : 1);
  }
  case 'verdict': {
    const d = runDir();
    const s = stateOf(d);
    const { cases, expected } = inputs(d);
    if (!cases) die('cases.json missing', 1);
    s.rows = {};
    const rowsDir = join(d, 'rows');
    if (existsSync(rowsDir)) for (const f of readdirSync(rowsDir)) {
      const r = readJson(join(rowsDir, f), null);
      if (r) s.rows[up(r.table)] = { count: r.rows.length, sources: r.sources, masked: r.masked };
    }
    const root = projectRoot(d);
    const raw = fileText(ledgerPath(root)) || '';
    const entries = raw.split(/\r?\n/).filter((l) => l.trim()).map(safe).filter(Boolean);
    const eSha = existsSync(join(d, 'expected.json')) ? sha(readFileSync(join(d, 'expected.json'), 'utf-8')) : null;
    const result = decide(s, cases, eSha, entries);
    s.round = (s.round || 0) + 1;
    result.round = s.round;
    result.max_rounds = MAX_ROUNDS;
    result.expected_changes = s.expected_changes || [];
    result.created_at = new Date().toISOString();
    result.written_by = 'scripts/program-test/pt.mjs (ledger + captured rows; agents do not write this file)';
    saveState(d, s);
    writeJson(join(d, 'pt-receipt.json'), result);
    const text = evidenceLines(result, cases, expected);
    writeFileSync(join(d, 'report.md'), `${text}\n`, 'utf-8');
    console.log(text);
    if (result.expected_changes.length) console.log(`! expected.json changed ${result.expected_changes.length}× with user approval — see pt-receipt.json`);
    console.log(`round ${s.round}/${MAX_ROUNDS}${s.round >= MAX_ROUNDS && result.verdict !== 'PASS' ? ' — round cap reached: stop the loop and report' : ''}`);
    process.exit(exitCode(result.verdict));
  }
  case 'close': {
    const d = runDir();
    const root = projectRoot(d);
    const a = readJson(activePath(root), null);
    if (a && resolve(a.run_dir) === d) rmSync(activePath(root));
    console.log('capture stopped');
    break;
  }
  default:
    die('usage: pt.mjs init|mask-extra|check|freeze|abap-rows|harness|mutants|verdict|close …');
}

function safe(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
