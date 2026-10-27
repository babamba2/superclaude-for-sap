// sc4sap:module-to-process — usage-first scope: only the TCodes users actually run.
//
//   node usage-scope.mjs --all <tcodes-all.json> --used <used.txt> [--used <more.txt>] --tran <tran.json>
//                        --module MM --packages ZXX_A,ZXX_B [--jobs <jobs.txt>] --months 12 --coverage 3
//                        --system PRD --out-dir <dir>
//
// Inputs (written by the main thread from MCP results):
//   --all   SearchObject(TRAN) results: [{ name, packageName, description? }] (or { results: [...] })
//   --used  TCode names measured as used (GetTcodeUsage → used[]), any whitespace / comma separator
//   --tran  GetTransaction results for the used TCodes: [{ tcode, kind, program? , parameters?: { VIEWNAME } }]
//           (or { transactions: [...] }); a TCode missing here counts as "program = TCode name"
//   --jobs  optional program names that run as background job steps (GetJobUsage → used[] / SM37 list)
// Only TCodes of the given packages are in scope. Writes into --out-dir:
//   walk.json     { package: "_USED", module, objects: [TRAN…, PROG…, VIEW…] } — the member list for Step G
//   tcodes.json   { transactions: [...] } — G2 input (launches edges)
//   usage.json    { tcodes: { result, months, coverage, source }, jobs? } — G4 shape
//   scope.json    counts per package, used / unused lists, programs, SM30 views, non-custom targets
// --save-usage <file> also writes the measured list for reuse without system access:
//   { kind: 'tcode-usage', system, destination, measuredAt, months, coverage, measured: [...], used: [...] }
// Deterministic, no SAP call.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);
const words = (text) => String(text || '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
const isCustom = (n) => /^[ZY]/.test(n) || /^\/[A-Z0-9_]+\//.test(n);

export function usageScope({ all, used, tran, jobs = [], packages = [], module = '', months = 12, coverage = null, system = '', destination = '' }) {
  const pk = new Set(packages.map(p => p.toUpperCase()));
  const inScope = arr(all?.results ?? all).filter(t => !pk.size || pk.has(String(t.packageName || '').toUpperCase()));
  const usedSet = new Set(arr(used).map(s => s.toUpperCase()));
  const byTcode = new Map(arr(tran?.transactions ?? tran).map(t => [String(t.tcode).toUpperCase(), t]));
  const perPackage = {};
  const usedT = [], unusedT = [];
  for (const t of inScope) {
    const name = String(t.name).toUpperCase();
    const p = String(t.packageName || '').toUpperCase();
    perPackage[p] ||= { tcodes: 0, used: 0 };
    perPackage[p].tcodes++;
    if (usedSet.has(name)) { perPackage[p].used++; usedT.push({ name, package: p, description: t.description || '' }); }
    else unusedT.push({ name, package: p });
  }
  const transactions = [];
  const programs = new Map(), views = new Map(), external = [];
  for (const t of usedT) {
    const tr = byTcode.get(t.name) || { tcode: t.name, kind: 'program', program: t.name, assumed: true };
    transactions.push({ ...tr, tcode: t.name });
    if (tr.kind === 'parameter' && tr.parameters?.VIEWNAME) {
      const v = String(tr.parameters.VIEWNAME).toUpperCase();
      views.set(v, [...(views.get(v) || []), t.name]);
    } else if (tr.program) {
      const p = String(tr.program).toUpperCase();
      if (!isCustom(p)) { external.push({ tcode: t.name, program: p }); continue; }
      programs.set(p, [...(programs.get(p) || []), t.name]);
    }
  }
  const jobProgs = arr(jobs).map(s => s.toUpperCase()).filter(p => !programs.has(p));
  for (const p of jobProgs) programs.set(p, []);
  const objects = [
    ...usedT.map(t => ({ name: t.name, type: 'TRAN', package: t.package, description: t.description })),
    ...[...programs.keys()].map(p => ({ name: p, type: 'PROG', tcodes: programs.get(p), job: jobProgs.includes(p) || undefined })),
    ...[...views.keys()].map(v => ({ name: v, type: 'VIEW', tcodes: views.get(v) })),
  ];
  const walk = { package: '_USED', module, objects, packages: [...pk], scopedBy: 'usage' };
  const result = Object.fromEntries(inScope.map(t => [String(t.name).toUpperCase(), usedSet.has(String(t.name).toUpperCase())]));
  const usage = {
    system,
    measuredAt: new Date().toISOString().slice(0, 10),
    tcodes: { result, months, coverage, complete: coverage == null ? undefined : coverage >= months, ...(system ? { source: { system, destination, kind: destination ? 'rfc' : 'local' } } : {}) },
    ...(jobs.length ? { jobs: { result: Object.fromEntries(arr(jobs).map(p => [p.toUpperCase(), true])), months } } : {}),
  };
  const scope = {
    module, packages: [...pk], perPackage,
    tcodes: { inScope: inScope.length, used: usedT.length, unused: unusedT.length },
    programs: programs.size, views: views.size, jobPrograms: jobProgs.length,
    external, assumed: transactions.filter(t => t.assumed).map(t => t.tcode),
    window: { months, coverage, system, destination },
    unused: unusedT,
  };
  return { walk, tcodes: { transactions }, usage, scope };
}

/** The measured usage as a standalone file (reused later as a submitted list — no system access needed). */
export function usageExport(res) {
  const r = res.usage.tcodes;
  return {
    kind: 'tcode-usage', system: r.source?.system || res.usage.system || '', destination: r.source?.destination || '',
    measuredAt: res.usage.measuredAt, months: r.months, coverage: r.coverage,
    measured: Object.keys(r.result).sort(), used: Object.keys(r.result).filter(k => r.result[k]).sort(),
  };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const getAll = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
  const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const outDir = get('--out-dir');
  if (!get('--all') || !getAll('--used').length || !outDir) {
    console.error('Usage: node usage-scope.mjs --all <tcodes-all.json> --used <used.txt> [--used …] [--tran <tran.json>] --packages A,B --module MM --out-dir <dir> [--jobs jobs.txt] [--months 12] [--coverage n] [--system SID] [--destination RFC]');
    process.exit(2);
  }
  try {
    const res = usageScope({
      all: readJson(get('--all')),
      used: getAll('--used').flatMap(f => words(readFileSync(f, 'utf8'))),
      tran: get('--tran') && existsSync(get('--tran')) ? readJson(get('--tran')) : [],
      jobs: get('--jobs') ? words(readFileSync(get('--jobs'), 'utf8')) : [],
      packages: words(get('--packages')),
      module: String(get('--module') || '').toUpperCase(),
      months: Number(get('--months') || 12),
      coverage: get('--coverage') != null ? Number(get('--coverage')) : null,
      system: get('--system') || '',
      destination: get('--destination') || '',
    });
    mkdirSync(outDir, { recursive: true });
    for (const [f, v] of [['walk.json', res.walk], ['tcodes.json', res.tcodes], ['usage.json', res.usage], ['scope.json', res.scope]]) {
      writeFileSync(join(outDir, f), `${JSON.stringify(v, null, 2)}\n`, 'utf8');
    }
    const save = get('--save-usage');
    if (save) {
      mkdirSync(resolve(save, '..'), { recursive: true });
      writeFileSync(save, `${JSON.stringify(usageExport(res), null, 2)}
`, 'utf8');
    }
    const { unused, ...summary } = res.scope;
    console.log(JSON.stringify({ outDir: resolve(outDir), ...summary, unused: unused.length }, null, 2));
  } catch (e) {
    console.error(`usage-scope: ${e.message}`);
    process.exit(1);
  }
}
