import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { loadKb, kbIndex, scanGraphs, scanUnit, scanPatterns, scanCustomizations, scanUsage } from '../../scripts/conversion/readiness-scan.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { rateObjects, extensionEvidence, checklist, totals, readinessScore, integrationRows, tableExtensionRows } from '../../scripts/conversion/readiness-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdScan, cmdBuild, cmdNarrative, docFiles, extensionTables, customFieldsOf } from '../../scripts/conversion/build-readiness-doc.mjs';

const kb = loadKb();

// A small reference graph: a program reading KONV and writing MSEG, a function group calling an old BAPI and
// running batch input on XD01, an include folded into its program.
const GRAPH = {
  package: 'ZTEST', module: 'SD', nodes: [
    { id: 'PROG:ZR1', type: 'PROG', name: 'ZR1', scope: 'member', lines: 100, units: ['ZR1', 'ZR1F01'] },
    { id: 'INCL:ZR1F01', type: 'INCL', name: 'ZR1F01', scope: 'member', lines: 50, units: ['ZR1F01'] },
    { id: 'FUGR:ZFG', type: 'FUGR', name: 'ZFG', scope: 'member', lines: 80, units: ['LZFGU01'] },
    { id: 'FUNC:Z_FM', type: 'FUNC', name: 'Z_FM', scope: 'member', parent: 'FUGR:ZFG', units: [] },
    { id: 'PROG:ZCLEAN', type: 'PROG', name: 'ZCLEAN', scope: 'member', lines: 10, units: ['ZCLEAN'] },
    { id: 'TRAN:ZT1', type: 'TRAN', name: 'ZT1', scope: 'member' },
  ],
  edges: [
    { from: 'PROG:ZR1', to: 'INCL:ZR1F01', kind: 'include', evidence: [] },
    { from: 'INCL:ZR1F01', to: 'TABL:KONV', kind: 'reads', count: 2, evidence: [{ unit: 'ZR1F01', line: 12, text: 'SELECT * FROM konv INTO TABLE lt_konv' }] },
    { from: 'PROG:ZR1', to: 'TABL:MSEG', kind: 'writes', count: 1, evidence: [{ unit: 'ZR1', line: 40, text: 'UPDATE mseg SET ...' }] },
    { from: 'PROG:ZR1', to: 'FUNC:REUSE_ALV_GRID_DISPLAY', kind: 'calls', evidence: [] },
    { from: 'FUNC:Z_FM', to: 'FUNC:BAPI_PO_CREATE', kind: 'calls', evidence: [{ unit: 'LZFGU01', line: 5, text: "CALL FUNCTION 'BAPI_PO_CREATE'" }] },
    { from: 'FUGR:ZFG', to: 'TRAN:XD01', kind: 'starts', bdc: true, evidence: [{ unit: 'LZFGU01', line: 9, text: "CALL TRANSACTION 'XD01' USING bdc" }] },
    { from: 'PROG:ZCLEAN', to: 'TABL:ZTAB', kind: 'writes', evidence: [] },
    { from: 'PROG:ZCLEAN', to: 'CLAS:CX_AI_SYSTEM_FAULT', kind: 'uses', evidence: [{ unit: 'ZCLEAN', line: 3, text: 'CATCH cx_ai_system_fault INTO lx_fault' }] },
    { from: 'FUGR:ZFG', to: 'FUNC:SWE_EVENT_CREATE', kind: 'calls', evidence: [] },
  ],
};

describe('s4-conversion-readiness knowledge base', () => {
  it('is consistent: unique ids, valid severities and efforts, every target and extension labelled', () => {
    const ids = [...kb.items, ...kb.patterns].map((x: any) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of [...kb.items, ...kb.patterns]) {
      expect(['blocker', 'functional', 'performance', 'check', 'info']).toContain(it.sev);
      expect(['S', 'M', 'L']).toContain(it.effort);
      expect(it.title.ko && it.title.en && it.action.ko && it.action.en).toBeTruthy();
      if (it.extension) expect(kb.extensions[it.extension]).toBeTruthy();
    }
    expect(Object.keys(kb.targets)).toEqual(['2023', '2025', 'public', 'compare']);
    const ix = kbIndex(kb);
    expect(ix.table.get('KONV').it.id).toBe('SD-PRICING');
    expect(ix.tcode.get('MB1A').rule.to).toBe('MIGO');
    expect(JSON.stringify(kb)).not.toMatch(/\bZ[A-Z0-9_]{2,}[A-Z0-9]\b/); // no customer object names (prefixes such as ZCO_ are fine)
  });
});

describe('s4-conversion-readiness scan', () => {
  it('matches graph edges, folds includes and function modules into their owner', () => {
    const dir = mkdtempSync(join(tmpdir(), 's4g-'));
    try {
      const gf = join(dir, 'graph.json'); writeFileSync(gf, JSON.stringify(GRAPH));
      const { findings, objects } = scanGraphs([gf], kb);
      expect(objects.map((o: any) => o.id).sort()).toEqual(['FUGR:ZFG', 'PROG:ZCLEAN', 'PROG:ZR1']);
      const by = (item: string) => findings.find((f: any) => f.item === item);
      expect(by('SD-PRICING')).toMatchObject({ object: 'PROG:ZR1', kind: 'table-read', sev: 'functional', to: 'PRCD_ELEMENTS' });
      expect(by('MM-MATDOC')).toMatchObject({ object: 'PROG:ZR1', kind: 'table-write', sev: 'blocker' });
      expect(by('MM-PUR-TX')).toMatchObject({ object: 'FUGR:ZFG', kind: 'fm', to: 'BAPI_PO_CREATE1' });
      expect(by('BP-CVI')).toMatchObject({ object: 'FUGR:ZFG', kind: 'tcode', sev: 'blocker', bdc: true });
      expect(by('INT-PO')).toMatchObject({ object: 'PROG:ZCLEAN', kind: 'class', target: 'CX_AI_SYSTEM_FAULT' });
      expect(by('INT-EVENT')).toMatchObject({ object: 'FUGR:ZFG', kind: 'fm' });
      const ev = extensionEvidence({ findings, objects, facts: { idoc: [{ mestyp: 'MATMAS', dir: 'out', partners: 2 }] } });
      expect(ev.INTSUITE.evidence.map((x: any) => x.k)).toEqual(['proxyObjects', 'idocTypes']);
      expect(ev.EVENTMESH.recommend).toBe(true);
      expect(integrationRows({ idoc: [{ mestyp: 'MATMAS', dir: 'out', partners: 2 }, { mestyp: 'ZORD', dir: 'in', partners: 1 }] }, kb).map((x: any) => x.item)).toEqual(['MM-MATNR40', '']);
      const rated = rateObjects(objects, findings, kb);
      const zr1 = rated.find((o: any) => o.id === 'PROG:ZR1');
      expect(zr1).toMatchObject({ worst: 'blocker', alv: true, level: 'D', cloud: 'api' });
      expect(rated.find((o: any) => o.id === 'PROG:ZCLEAN')).toMatchObject({ worst: 'check', cloud: 'rap', level: 'C' });
      expect(readinessScore(rated)).toBeLessThan(100);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('finds code patterns: native SQL, other-database hints, sort order on HANA, MATNR offsets', () => {
    const src = [
      'REPORT zr.',
      'SELECT * FROM vbak INTO TABLE lt_vbak WHERE vkorg = p_vkorg.',
      "READ TABLE lt_vbak INTO ls_vbak WITH KEY vbeln = lv_vbeln BINARY SEARCH.",
      'SELECT * FROM vbap INTO TABLE lt_vbap ORDER BY PRIMARY KEY.',
      'READ TABLE lt_vbap INTO ls_vbap WITH KEY vbeln = lv_vbeln BINARY SEARCH.',
      'SELECT * FROM lips INTO TABLE lt_lips.',
      'SORT lt_lips BY vbeln.',
      'READ TABLE lt_lips INTO ls_lips WITH KEY vbeln = lv_vbeln BINARY SEARCH.',
      'EXEC SQL.',
      '  SELECT 1 FROM dual',
      'ENDEXEC.',
      "SELECT SINGLE ebeln INTO lv_ebeln FROM ekko WHERE ebeln = lv_x %_HINTS ORACLE 'RULE'.",
      'lv_code = ls_mara-matnr+7(7).',
      "IF ls_mara-matnr+0(1) = '3'. ENDIF.",
      'DATA lv_matnr(18) TYPE c.',
    ].join('\n');
    const ids = scanUnit(src).map((h: any) => h.id);
    expect(ids.filter((x: string) => x === 'SELECT_ORDER').length).toBe(1);
    expect(ids).toContain('NATIVE_SQL');
    expect(ids).toContain('DB_HINTS');
    expect(ids.filter((x: string) => x === 'MATNR18').length).toBe(2); // the +0(1) prefix check is fine
    const dir = mkdtempSync(join(tmpdir(), 's4p-'));
    try {
      mkdirSync(join(dir, 'zr.prog'));
      writeFileSync(join(dir, 'zr.prog', 'zr.prog.abap'), src);
      const r = scanPatterns([{ id: 'PROG:ZR', type: 'PROG', name: 'ZR', module: 'SD', units: ['ZR'] }], dir, kb);
      expect(r.scanned).toBe(1);
      expect(r.findings.map((f: any) => f.item).sort()).toEqual(['DB_HINTS', 'MATNR18', 'NATIVE_SQL', 'SELECT_ORDER']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('rates exits and appends, finds changed transactions in the usage', () => {
    const dir = mkdtempSync(join(tmpdir(), 's4c-'));
    try {
      mkdirSync(join(dir, 'SD'));
      writeFileSync(join(dir, 'SD', 'enhancements.json'), JSON.stringify({ smodExits: [{ standardName: 'V45A0001', description: 'x', customs: [{ name: 'ZPROJ' }] }],
        badiImplementations: [{ standardName: 'SAPMF02D_X', customs: [{ name: 'ZIMPL' }] }] }));
      writeFileSync(join(dir, 'SD', 'extensions.json'), JSON.stringify({ appendStructures: [{ baseTable: 'KONV', customFields: ['ZZF1'] }, { baseTable: 'VBAK', customFields: ['ZZA', 'ZZB'] }, { baseTable: 'MARA', customFields: [] }] }));
      const c = scanCustomizations(dir, kb);
      expect(c.exits.find((x: any) => x.standard === 'SAPMF02D_X')).toMatchObject({ item: 'BP-CVI', sev: 'functional' });
      expect(c.exits.find((x: any) => x.standard === 'V45A0001')).toMatchObject({ item: '', sev: 'info' });
      expect(c.appends.map((a: any) => a.table)).toEqual(['KONV', 'VBAK']);
      expect(c.appends[0]).toMatchObject({ item: 'SD-PRICING', to: 'PRCD_ELEMENTS', sev: 'functional' });
      expect(c.appends[1].cds).toEqual(['I_SalesDocument']);
      // customer fields from the DDIC: proxy views, moved data, BP, standard CDS — the append extract fills the rest
      const tabs = extensionTables(kb);
      for (const t of ['MARC', 'MARDH', 'MSEG', 'MBEW', 'BSIS', 'FAGLFLEXT', 'KONV', 'VBUK', 'KNA1', 'MARA', 'VBAK']) expect(tabs).toContain(t);
      const cf = customFieldsOf([{ TABNAME: 'MARC', FIELDNAME: 'ZZPLANT', PRECFIELD: '' }, { TABNAME: 'MARC', FIELDNAME: '.APPEND', PRECFIELD: 'ZAMARC' },
        { TABNAME: 'MSEG', FIELDNAME: 'ZZBATCH', PRECFIELD: '' }, { TABNAME: 'MSEG', FIELDNAME: '.INCLUDE', PRECFIELD: 'CI_COBL' }, { TABNAME: 'MSEG', FIELDNAME: '.INCLUDE', PRECFIELD: 'EMSEG' },
        { TABNAME: 'MARA', FIELDNAME: 'MATNR', PRECFIELD: '' }]);
      expect(cf).toEqual({ MARC: { fields: ['ZZPLANT'], includes: ['ZAMARC'] }, MSEG: { fields: ['ZZBATCH'], includes: ['CI_COBL'] } });
      const rows = tableExtensionRows(kb, { customFields: cf }, c.appends);
      expect(rows.map((r: any) => `${r.table}:${r.kind}`)).toEqual(['KONV:move', 'MSEG:move', 'MARC:proxy', 'VBAK:cds']);
      expect(rows.find((r: any) => r.table === 'MSEG')).toMatchObject({ to: 'MATDOC', sev: 'blocker', item: 'MM-MATDOC' });
      expect(rows.find((r: any) => r.table === 'MARC')).toMatchObject({ sev: 'functional', item: 'MM-STOCK', fields: ['ZZPLANT'] });
      const u = scanUsage(['MB1A', 'XD01', 'VA01', 'LT03', 'ZSD001'], kb);
      expect(u.map((x: any) => x.tcode)).toEqual(['XD01', 'LT03', 'MB1A']);
      const ev = extensionEvidence({ used: ['LT03', 'ZSD001', 'VA01'], facts: { warehouses: 2 } });
      expect(ev.EWM.recommend).toBe(true);
      expect(ev.GTS.recommend).toBe(false);
      const cl = checklist({ findings: [], usage: u, facts: { warehouses: 2, mlInactive: 0 } });
      expect(cl.find((x: any) => x.id === 'wm').status).toBe('attention');
      expect(cl.find((x: any) => x.id === 'ml').status).toBe('ok');
      expect(cl.find((x: any) => x.id === 'siCheck').status).toBe('todo');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('s4-conversion-readiness report', () => {
  it('scans an artifact base and builds the report with a filter row on every table', () => {
    const base = mkdtempSync(join(tmpdir(), 's4b-'));
    try {
      mkdirSync(join(base, 'cbo', 'SD', '_USED'), { recursive: true });
      writeFileSync(join(base, 'cbo', 'SD', '_USED', 'graph.json'), JSON.stringify(GRAPH));
      mkdirSync(join(base, 'usage'));
      writeFileSync(join(base, 'usage', 'tcode-usage-PRD-2026-01-01-all.json'), JSON.stringify({ measured: ['ZT1', 'ZT2'], used: ['ZT1'] }));
      writeFileSync(join(base, 'usage', 'tcode-usage-PRD-2026-01-01-STD.json'), JSON.stringify({ used: ['XD01', 'VA01'] }));
      expect(() => cmdScan({ base, code: 'T1', target: '2030' })).toThrow(/target/);
      const r = cmdScan({ base, code: 'T1', target: 'compare', ext: ['EWM'], project: 'Test' });
      expect(r.objects).toBe(3);
      expect(r.bySev.blocker).toBeGreaterThan(0);
      const nf = join(base, 'n.json'); writeFileSync(nf, JSON.stringify({ summary: ['one', 'two'], extensions: { EWM: 'note' } }));
      cmdNarrative({ base, code: 'T1', file: nf });
      const b = cmdBuild({ base, code: 'T1' });
      expect(b.version).toBe(1);
      const html = readFileSync(b.html, 'utf8');
      const tables = (html.match(/<table class="grid"/g) || []).length;
      expect((html.match(/<tr class="frow">/g) || []).length).toBe(tables);
      expect(html).toContain('PRCD_ELEMENTS');
      expect(html).toContain('Clean core');
      expect(html).toContain('<li>one</li>');
      expect(cmdBuild({ base, code: 'T1' }).version).toBe(2);
      expect(cmdBuild({ base, code: 'T1', sameVersion: true }).version).toBe(2);
      const m = JSON.parse(readFileSync(docFiles(base, 'T1').model, 'utf8'));
      expect(totals(m).hit).toBe(3);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
