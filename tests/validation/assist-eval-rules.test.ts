import { describe, it, expect } from 'vitest';
// @ts-ignore - plain ESM module
import { parseRef, evaluate, verdict, existsQueries, factsNeeded, queryKey } from '../../scripts/assist/eval-rules.mjs';

const catalog = {
  rules: [
    { id: 'R-LC', message: { type: 'E', class: 'YMSG1', number: '081' }, bapis: ['BAPI_PO_CHANGE'], phase: 'check', machine_checkable: true,
      condition: { all: [ { field: 'EKKO-BSART', op: 'in', values: ['YP01', 'YP07'] }, { field: 'EKKO-ZZEXT1', op: 'initial' }, { field: 'EKKO-BUKRS(1)', op: 'ne', values: ['7'] } ] } },
    { id: 'R-ITEM', message: { type: 'E' }, bapis: ['BAPI_PO_CHANGE'], phase: 'check', machine_checkable: true,
      condition: { all: [ { field: 'EKPO-WERKS', op: 'eq', values: ['11T0'] } ] } },
    { id: 'R-CLOSE', message: { type: 'E', class: 'YMSG2', number: '154' }, bapis: ['BAPI_GOODSMVT_CREATE'], phase: 'post', machine_checkable: true,
      condition: { all: [ { field: 'BKPF-BUKRS', op: 'in', values: ['1100'] },
        { field: 'YCLOSE_TAB', op: 'exists_in_table', table: 'YCLOSE_TAB', key: { BNAME: '$UNAME', BUKRS: 'BKPF-BUKRS' } } ] } },
    { id: 'R-CUSTOM', message: { type: 'E' }, bapis: ['BAPI_PO_CHANGE'], phase: 'check', machine_checkable: false, condition: null },
    { id: 'R-WARN', message: { type: 'W' }, bapis: ['BAPI_PO_CHANGE'], phase: 'check', machine_checkable: true,
      condition: { all: [ { field: 'EKKO-RESWK(3:1)', op: 'eq', values: ['0'] } ] } },
  ],
};

describe('eval-rules', () => {
  it('parses references with offsets', () => {
    expect(parseRef('EKKO-BUKRS(1)')).toMatchObject({ base: 'EKKO-BUKRS', off: 0, len: 1 });
    expect(parseRef('EKKO-RESWK(3:1)')).toMatchObject({ base: 'EKKO-RESWK', off: 3, len: 1 });
    expect(parseRef('not a ref')).toBeNull();
  });

  it('fires a header rule and blocks', () => {
    const facts = { header: { 'EKKO-BSART': 'YP01', 'EKKO-ZZEXT1': '', 'EKKO-BUKRS': '1100', 'EKKO-RESWK': '1130' }, items: [{ 'EKPO-WERKS': '1150' }] };
    const res = evaluate(catalog, 'BAPI_PO_CHANGE', facts);
    expect(res.find((r) => r.id === 'R-LC')?.fires).toBe(true);
    expect(res.find((r) => r.id === 'R-ITEM')?.fires).toBe(false);
    expect(res.find((r) => r.id === 'R-WARN')?.fires).toBe(true);
    expect(verdict(res)).toBe('blocked');
  });

  it('does not fire when a condition fails, unknown for custom rules', () => {
    const facts = { header: { 'EKKO-BSART': 'YP01', 'EKKO-ZZEXT1': 'D', 'EKKO-BUKRS': '1100', 'EKKO-RESWK': '' }, items: [{ 'EKPO-WERKS': '1150' }] };
    const res = evaluate(catalog, 'BAPI_PO_CHANGE', facts);
    expect(res.find((r) => r.id === 'R-LC')?.fires).toBe(false);
    expect(res.find((r) => r.id === 'R-CUSTOM')?.fires).toBe('unknown');
    expect(verdict(res)).toBe('review');
  });

  it('item rule fires when any item matches', () => {
    const facts = { header: { 'EKKO-BSART': 'NB', 'EKKO-ZZEXT1': '', 'EKKO-BUKRS': '1100' }, items: [{ 'EKPO-WERKS': '1150' }, { 'EKPO-WERKS': '11T0' }] };
    expect(evaluate(catalog, 'BAPI_PO_CHANGE', facts).find((r) => r.id === 'R-ITEM')?.fires).toBe(true);
  });

  it('missing facts give unknown', () => {
    const res = evaluate(catalog, 'BAPI_PO_CHANGE', { header: {}, items: [] });
    expect(res.find((r) => r.id === 'R-LC')?.fires).toBe('unknown');
  });

  it('exists queries are built from facts and answered by key', () => {
    const facts = { header: { 'BKPF-BUKRS': '1100' }, items: [] };
    const qs = existsQueries(catalog, 'BAPI_GOODSMVT_CREATE', facts);
    expect(qs).toHaveLength(1);
    expect(qs[0].where).toEqual({ BNAME: '$UNAME', BUKRS: '1100' });
    const key = queryKey(qs[0]);
    expect(evaluate(catalog, 'BAPI_GOODSMVT_CREATE', facts, { [key]: true })[0].fires).toBe(true);
    expect(evaluate(catalog, 'BAPI_GOODSMVT_CREATE', facts, { [key]: false })[0].fires).toBe(false);
    expect(evaluate(catalog, 'BAPI_GOODSMVT_CREATE', facts)[0].fires).toBe('unknown');
  });

  it('lists the facts a BAPI needs', () => {
    expect(factsNeeded(catalog, 'BAPI_PO_CHANGE')).toEqual(['EKKO-BSART', 'EKKO-BUKRS', 'EKKO-RESWK', 'EKKO-ZZEXT1', 'EKPO-WERKS']);
  });
});

describe('eval-rules: length ops and comparison keys', () => {
  const cat2 = {
    rules: [
      { id: 'LEN', message: { type: 'E' }, bapis: ['B'], phase: 'check', machine_checkable: true,
        condition: { all: [ { field: 'EKKO-BSART', op: 'len_le', values: ['2'] } ] } },
      { id: 'CLOSE', message: { type: 'E' }, bapis: ['G'], phase: 'post', machine_checkable: true,
        condition: { all: [ { field: 'YCLOSE_TAB', op: 'exists_in_table', negate: true, table: 'YCLOSE_TAB',
          key: { BNAME: '$UNAME', BUKRS: 'BKPF-BUKRS', CLOSE_DT: { op: 'lt', ref: 'BKPF-BUDAT' } } } ] } },
    ],
  };
  it('len_le', () => {
    expect(evaluate(cat2, 'B', { header: { 'EKKO-BSART': 'NB' } })[0].fires).toBe(true);
    expect(evaluate(cat2, 'B', { header: { 'EKKO-BSART': 'YP01' } })[0].fires).toBe(false);
  });
  it('comparison key + negate', () => {
    const facts = { header: { 'BKPF-BUKRS': '1100', 'BKPF-BUDAT': '20261031' } };
    const [q] = existsQueries(cat2, 'G', facts);
    expect(q.where.CLOSE_DT).toEqual({ op: 'lt', value: '20261031' });
    expect(evaluate(cat2, 'G', facts, { [q.key]: false })[0].fires).toBe(true);
    expect(evaluate(cat2, 'G', facts, { [q.key]: true })[0].fires).toBe(false);
  });
});

describe('eval-rules: wire format', () => {
  it('encodes eq and comparison conditions', () => {
    expect(queryKey({ table: 'YCLOSE_TAB', where: { BNAME: '$UNAME', CLOSE_DT: { op: 'lt', value: '20261031' }, 'CLOSE_DT#2': { op: 'gt', value: '00000000' } } }))
      .toBe('YCLOSE_TAB?BNAME=$UNAME&CLOSE_DT:lt:20261031&CLOSE_DT#2:gt:00000000');
    expect(queryKey({ table: 'T', where: { A: 'x&y=z' } })).toBe('T?A=x%26y%3Dz');
  });
});

describe('eval-rules: material tables are item level', () => {
  it('a MARA-only rule is evaluated per item', () => {
    const cat = { rules: [ { id: 'MT', message: { type: 'E' }, bapis: ['G'], phase: 'check', machine_checkable: true,
      condition: { all: [ { field: 'MARA-MTART', op: 'eq', values: ['YRAW'] } ] } } ] };
    const facts = { header: {}, items: [{ 'MARA-MTART': 'FERT' }, { 'MARA-MTART': 'YRAW' }] };
    expect(evaluate(cat, 'G', facts)[0].fires).toBe(true);
    expect(evaluate(cat, 'G', { header: {}, items: [{ 'MARA-MTART': 'FERT' }] })[0].fires).toBe(false);
  });
});

describe('eval-rules: facts with several values (foreach), order status rules', () => {
  const rel = { id: 'ST-REL', message: { type: 'E' }, bapis: ['REL'], phase: 'check', machine_checkable: true,
    condition: { all: [
      { field: 'T003O-STSMA', op: 'not_initial' },
      { foreach: 'JEST-STAT', cond: { field: 'TJ31', op: 'exists_in_table', table: 'TJ31',
        key: { STSMA: 'T003O-STSMA', VRGNG: 'FREI', ESTAT: 'JEST-STAT', MODKZ: '3' } } },
    ] } };
  const cat = { rules: [rel] };
  const facts = { header: { 'T003O-STSMA': 'YPROF001' }, items: [], multi: { 'JEST-STAT': ['I0001', 'E0003'] } };

  it('lists the multi fact and its header fact as needed facts', () => {
    expect(factsNeeded(cat, 'REL')).toEqual(['JEST-STAT', 'T003O-STSMA']);
  });

  it('asks one TJ31 query per active status', () => {
    const qs = existsQueries(cat, 'REL', facts);
    expect(qs.map((q: { key: string }) => q.key)).toEqual([
      'TJ31?ESTAT=I0001&MODKZ=3&STSMA=YPROF001&VRGNG=FREI',
      'TJ31?ESTAT=E0003&MODKZ=3&STSMA=YPROF001&VRGNG=FREI',
    ]);
  });

  it('fires when the TJ31 row exists for any active status', () => {
    const answers = { 'TJ31?ESTAT=I0001&MODKZ=3&STSMA=YPROF001&VRGNG=FREI': false, 'TJ31?ESTAT=E0003&MODKZ=3&STSMA=YPROF001&VRGNG=FREI': true };
    const res = evaluate(cat, 'REL', facts, answers);
    expect(res[0].fires).toBe(true);
    expect(verdict(res)).toBe('blocked');
  });

  it('does not fire when no active status is prohibited', () => {
    const answers = { 'TJ31?ESTAT=I0001&MODKZ=3&STSMA=YPROF001&VRGNG=FREI': false, 'TJ31?ESTAT=E0003&MODKZ=3&STSMA=YPROF001&VRGNG=FREI': false };
    expect(evaluate(cat, 'REL', facts, answers)[0].fires).toBe(false);
  });

  it('is unknown while one answer is missing and none is true', () => {
    const answers = { 'TJ31?ESTAT=I0001&MODKZ=3&STSMA=YPROF001&VRGNG=FREI': false };
    const r = evaluate(cat, 'REL', facts, answers)[0];
    expect(r.fires).toBe('unknown');
    expect(r.unknowns.join(' ')).toContain('not answered');
  });

  it('is unknown when the multi fact was not delivered', () => {
    const r = evaluate(cat, 'REL', { header: { 'T003O-STSMA': 'YPROF001' }, items: [] }, {})[0];
    expect(r.fires).toBe('unknown');
    expect(r.unknowns.join(' ')).toContain('JEST-STAT');
  });

  it('an order type without status profile is decided without any query', () => {
    const noProfile = { header: { 'T003O-STSMA': '' }, items: [], multi: { 'JEST-STAT': ['I0001', 'I0002'] } };
    expect(existsQueries(cat, 'REL', noProfile)).toHaveLength(0);
    expect(evaluate(cat, 'REL', noProfile, {})[0].fires).toBe(false);
  });

  it('no active status at all means the rule cannot fire', () => {
    const none = { header: { 'T003O-STSMA': 'YPROF001' }, items: [], multi: { 'JEST-STAT': [] } };
    expect(evaluate(cat, 'REL', none, {})[0].fires).toBe(false);
  });
});

describe('eval-rules: scope_condition and document item tables', () => {
  const sc = {
    rules: [
      // not machine-checkable: only the scope can settle it
      { id: 'S-CUSTOM', message: { type: 'E' }, bapis: ['B1'], phase: 'post', machine_checkable: false, condition: null,
        scope_condition: { all: [ { field: 'VBAK-VKORG', op: 'eq', values: ['1000'] }, { field: 'T180-TRTYP', op: 'ne', values: ['A'] } ] } },
      // machine-checkable with a scope: scope AND condition
      { id: 'S-MACHINE', message: { type: 'E' }, bapis: ['B1'], phase: 'check', machine_checkable: true,
        scope_condition: { all: [ { field: 'VBAK-VKORG', op: 'eq', values: ['1000'] } ] },
        condition: { all: [ { field: 'VBAK-AUART', op: 'eq', values: ['XX'] } ] } },
      // scope and condition read the same item row
      { id: 'S-ITEM', message: { type: 'E' }, bapis: ['B1'], phase: 'check', machine_checkable: true,
        scope_condition: { all: [ { field: 'VBEP-ETENR', op: 'eq', values: ['0001'] } ] },
        condition: { all: [ { field: 'VBEP-WMENG', op: 'eq', values: ['0'] } ] } },
      // no scope, not machine-checkable: unknown as before
      { id: 'S-PLAIN', message: { type: 'W' }, bapis: ['B1'], phase: 'check', machine_checkable: false, condition: null },
      // document item tables of FI and CO
      { id: 'FI-LINE', message: { type: 'E' }, bapis: ['B2'], phase: 'check', machine_checkable: true,
        condition: { all: [ { field: 'BSEG-HKONT', op: 'eq', values: ['0000400000'] }, { field: 'BSEG-KOSTL', op: 'initial' } ] } },
      { id: 'CO-LINE', message: { type: 'E' }, bapis: ['B3'], phase: 'check', machine_checkable: true,
        condition: { all: [ { field: 'COEP-KSTAR', op: 'eq', values: ['0000600000'] }, { field: 'COEP-OBJNR', op: 'initial' } ] } },
    ],
  };
  const byId = (res: any[], id: string) => res.find((r) => r.id === id);

  it('a false scope means the rule does not apply', () => {
    const facts = { header: { 'VBAK-VKORG': '2000', 'T180-TRTYP': 'V', 'VBAK-AUART': 'XX' }, items: [] };
    const res = evaluate(sc, 'B1', facts);
    expect(byId(res, 'S-CUSTOM')).toMatchObject({ fires: false, scope: 'out' });
    expect(byId(res, 'S-MACHINE')).toMatchObject({ fires: false, scope: 'out' });
  });

  it('a true scope keeps a rule that is not machine-checkable at unknown', () => {
    const facts = { header: { 'VBAK-VKORG': '1000', 'T180-TRTYP': 'V', 'VBAK-AUART': 'YY' }, items: [] };
    const r = byId(evaluate(sc, 'B1', facts), 'S-CUSTOM');
    expect(r.fires).toBe('unknown');
    expect(r.scope).toBe('in');
    expect(r.unknowns.join(' ')).toContain('not machine-checkable');
  });

  it('an unknown scope keeps the rule unknown', () => {
    const r = byId(evaluate(sc, 'B1', { header: { 'VBAK-VKORG': '1000' }, items: [] }), 'S-CUSTOM');
    expect(r.fires).toBe('unknown');
    expect(r.scope).toBe('unknown');
  });

  it('scope and condition both decide a machine-checkable rule', () => {
    const inScope = { header: { 'VBAK-VKORG': '1000', 'VBAK-AUART': 'XX' }, items: [] };
    expect(byId(evaluate(sc, 'B1', inScope), 'S-MACHINE')).toMatchObject({ fires: true, scope: 'in' });
    const condFalse = { header: { 'VBAK-VKORG': '1000', 'VBAK-AUART': 'YY' }, items: [] };
    expect(byId(evaluate(sc, 'B1', condFalse), 'S-MACHINE').fires).toBe(false);
    // condition fact missing with the scope true: unknown
    expect(byId(evaluate(sc, 'B1', { header: { 'VBAK-VKORG': '1000' }, items: [] }), 'S-MACHINE').fires).toBe('unknown');
    // condition already false with the scope fact missing: false
    expect(byId(evaluate(sc, 'B1', { header: { 'VBAK-AUART': 'YY' }, items: [] }), 'S-MACHINE').fires).toBe(false);
  });

  it('scope and condition are evaluated on the same item', () => {
    const items = [ { 'VBEP-ETENR': '0001', 'VBEP-WMENG': '5' }, { 'VBEP-ETENR': '0002', 'VBEP-WMENG': '0' } ];
    // the item with WMENG 0 is not in scope, the item in scope has quantity 5: the rule must not fire
    expect(byId(evaluate(sc, 'B1', { header: {}, items }), 'S-ITEM').fires).toBe(false);
    const hit = [ { 'VBEP-ETENR': '0001', 'VBEP-WMENG': '0' } ];
    expect(byId(evaluate(sc, 'B1', { header: {}, items: hit }), 'S-ITEM').fires).toBe(true);
  });

  it('a rule without scope_condition behaves as before', () => {
    const r = byId(evaluate(sc, 'B1', { header: {}, items: [] }), 'S-PLAIN');
    expect(r.fires).toBe('unknown');
    expect(r.scope).toBeUndefined();
  });

  it('factsNeeded asks for the scope facts of every rule, existsQueries skips out-of-scope rules', () => {
    const needed = factsNeeded(sc, 'B1');
    expect(needed).toEqual(expect.arrayContaining(['VBAK-VKORG', 'T180-TRTYP', 'VBAK-AUART', 'VBEP-ETENR', 'VBEP-WMENG']));
    const ex = { rules: [ { id: 'E-1', message: { type: 'E' }, bapis: ['B1'], phase: 'check', machine_checkable: true,
      scope_condition: { all: [ { field: 'VBAK-VKORG', op: 'eq', values: ['1000'] } ] },
      condition: { all: [ { field: 'T1', op: 'exists_in_table', table: 'T1', key: { K: 'VBAK-AUART' } } ] } } ] };
    expect(existsQueries(ex, 'B1', { header: { 'VBAK-VKORG': '2000', 'VBAK-AUART': 'XX' }, items: [] })).toHaveLength(0);
    expect(existsQueries(ex, 'B1', { header: { 'VBAK-VKORG': '1000', 'VBAK-AUART': 'XX' }, items: [] })).toHaveLength(1);
  });

  it('BSEG and COEP rows are items: one row decides, other rows do not', () => {
    const fi = { header: {}, items: [ { 'BSEG-HKONT': '0000100000', 'BSEG-KOSTL': '' }, { 'BSEG-HKONT': '0000400000', 'BSEG-KOSTL': '' } ] };
    expect(byId(evaluate(sc, 'B2', fi), 'FI-LINE').fires).toBe(true);
    const fiOk = { header: {}, items: [ { 'BSEG-HKONT': '0000400000', 'BSEG-KOSTL': 'CC1' }, { 'BSEG-HKONT': '0000100000', 'BSEG-KOSTL': '' } ] };
    expect(byId(evaluate(sc, 'B2', fiOk), 'FI-LINE').fires).toBe(false);
    const co = { header: {}, items: [ { 'COEP-KSTAR': '0000600000', 'COEP-OBJNR': '' } ] };
    expect(byId(evaluate(sc, 'B3', co), 'CO-LINE').fires).toBe(true);
    const coOk = { header: {}, items: [ { 'COEP-KSTAR': '0000600000', 'COEP-OBJNR': 'KS1' }, { 'COEP-KSTAR': '0000700000', 'COEP-OBJNR': '' } ] };
    expect(byId(evaluate(sc, 'B3', coOk), 'CO-LINE').fires).toBe(false);
  });

  it('CORP rows (lines of a CO posting) are items too', () => {
    const cat = { rules: [ { id: 'CORP-R', message: { type: 'E' }, bapis: ['B4'], phase: 'check', machine_checkable: true,
      condition: { all: [ { field: 'CORP-KOSTL', op: 'eq', values: ['CC9'] } ] } } ] };
    const facts = { header: {}, items: [ { 'CORP-KOSTL': 'CC1' }, { 'CORP-KOSTL': 'CC9' } ] };
    expect(evaluate(cat, 'B4', facts)[0].fires).toBe(true);
    expect(evaluate(cat, 'B4', { header: {}, items: [ { 'CORP-KOSTL': 'CC1' } ] })[0].fires).toBe(false);
  });
});

describe('eval-rules: field-to-field comparison', () => {
  const cat = { rules: [ { id: 'REV-DATE', message: { type: 'E' }, bapis: ['R'], phase: 'check', machine_checkable: true,
    condition: { all: [ { field: 'PARAM-BUDAT', op: 'lt', ref: 'BKPF-BUDAT' } ] } } ] };
  it('needs both facts', () => {
    expect(factsNeeded(cat, 'R')).toEqual(['BKPF-BUDAT', 'PARAM-BUDAT']);
  });
  it('fires when the reversal date is before the original date', () => {
    expect(evaluate(cat, 'R', { header: { 'PARAM-BUDAT': '20261030', 'BKPF-BUDAT': '20261101' } })[0].fires).toBe(true);
    expect(evaluate(cat, 'R', { header: { 'PARAM-BUDAT': '20261101', 'BKPF-BUDAT': '20261101' } })[0].fires).toBe(false);
  });
  it('is unknown when the compared fact is missing', () => {
    const r = evaluate(cat, 'R', { header: { 'PARAM-BUDAT': '20261030' } })[0];
    expect(r.fires).toBe('unknown');
    expect(r.unknowns.join(' ')).toContain('BKPF-BUDAT');
  });
  it('compares per item when the reference is an item field', () => {
    const c2 = { rules: [ { id: 'I', message: { type: 'E' }, bapis: ['R'], phase: 'check', machine_checkable: true,
      condition: { field: 'BKPF-BUDAT', op: 'gt', ref: 'BSEG-ZFBDT' } } ] };
    const f = { header: { 'BKPF-BUDAT': '20261105' }, items: [{ 'BSEG-ZFBDT': '20261110' }, { 'BSEG-ZFBDT': '20261101' }] };
    expect(evaluate(c2, 'R', f)[0].fires).toBe(true);
  });
});
