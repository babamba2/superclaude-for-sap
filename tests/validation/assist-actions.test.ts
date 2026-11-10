import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
// @ts-expect-error — plain .mjs module without type declarations
import { validateCatalog, catalogFiles } from '../../scripts/assist/validate-actions.mjs';

function load(p: string) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function minimal(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    module: 'MM',
    actions: [
      {
        id: 'MM.PO.TEST',
        kind: 'write',
        risk: 'medium',
        title: 't',
        intents: { en: ['x'], ko: ['x'] },
        params: [],
        auth: [{ object: 'M_BEST_EKO', fields: { ACTVT: '02' } }],
        impl: {
          ECC: { fm: 'BAPI_PO_CHANGE', testrun: 'TESTRUN', commit: 'BAPI_TRANSACTION_COMMIT' },
          S4: { fm: 'BAPI_PO_CHANGE', testrun: 'TESTRUN', commit: 'BAPI_TRANSACTION_COMMIT' },
        },
        verified_on: [],
        preview_limits: { en: ['l'], ko: ['l'] },
        ...overrides,
      },
    ],
  };
}

describe('assist action catalogs', () => {
  const files: string[] = catalogFiles();

  it('at least the MM catalog exists', () => {
    expect(files.some((f) => /configs[\\/]MM[\\/]actions\.json$/.test(f))).toBe(true);
  });

  for (const f of files) {
    it(`${f} passes schema and S/4 deprecation lint`, () => {
      expect(validateCatalog(load(f), f)).toEqual([]);
    });
  }
});

describe('validateCatalog rules', () => {
  it('accepts a minimal valid catalog', () => {
    expect(validateCatalog(minimal())).toEqual([]);
  });

  it('rejects a vendor BAPI in an S/4 variant', () => {
    const c = minimal();
    (c.actions[0].impl as any).S4.fm = 'BAPI_VENDOR_CREATE';
    expect(validateCatalog(c).join()).toMatch(/BAPI_VENDOR_CREATE/);
  });

  it('rejects MSEG as an S/4 read source', () => {
    const c = minimal({ kind: 'query', risk: 'none' });
    (c.actions[0].impl as any).S4 = { source: ['MSEG'] };
    (c.actions[0].impl as any).ECC = { source: ['MSEG'] };
    expect(validateCatalog(c).join()).toMatch(/MSEG.*MATDOC/);
  });

  it('rejects a high-risk action without max_items 1', () => {
    expect(validateCatalog(minimal({ risk: 'high' })).join()).toMatch(/max_items 1/);
  });

  it('rejects a write without a preview strategy when there is no testrun', () => {
    const c = minimal();
    (c.actions[0].impl as any).ECC.testrun = 'none';
    expect(validateCatalog(c).join()).toMatch(/preview strategy/);
  });

  it('rejects a write without preview_limits', () => {
    expect(validateCatalog(minimal({ preview_limits: undefined })).join()).toMatch(/preview_limits/);
  });

  it('rejects preview_limits with unequal en / ko lines', () => {
    expect(validateCatalog(minimal({ preview_limits: { en: ['a', 'b'], ko: ['a'] } })).join()).toMatch(/same number of lines/);
  });

  it('does not ask preview_limits of a query', () => {
    expect(validateCatalog(minimal({ kind: 'query', risk: 'none', preview_limits: undefined }))).toEqual([]);
  });

  it('rejects a default answer on a clarify question', () => {
    const c = minimal({ clarify: [{ param: 'p', ask: 'q?', default: 'a' }] });
    expect(validateCatalog(c).join()).toMatch(/must not carry a default/);
  });

  it('rejects a reverse action that does not exist', () => {
    expect(validateCatalog(minimal({ reverse: 'MM.PO.NOPE' })).join()).toMatch(/unknown action/);
  });

  it('rejects ebelp typed as a scalar (SAP reads it as an empty table)', () => {
    const c = minimal({ params: [{ name: 'ebelp', type: 'string', required: true }] });
    expect(validateCatalog(c).join()).toMatch(/ebelp is a table in SAP/);
  });

  it('accepts list params as string[] or array', () => {
    const c = minimal({ params: [{ name: 'ebelp', type: 'string[]' }, { name: 'lines', type: 'array' }] });
    expect(validateCatalog(c)).toEqual([]);
  });

  it('rejects a scalar SAP param typed as a list', () => {
    const c = minimal({ params: [{ name: 'posnr', type: 'string[]' }] });
    expect(validateCatalog(c).join()).toMatch(/posnr is a scalar in SAP/);
  });
});

describe('ZCL_MCP_BIZ_EXEC allowed_params matches the catalogs', () => {
  // The SAP executor refuses parameter names an action does not declare.
  // Its per-action list is generated from configs/*/actions.json and must stay in sync.
  const sources = ['abap/biz/zcl_mcp_biz_exec.clas.abap', 'abap/biz/731/zcl_mcp_biz_exec.clas.abap'];

  function abapLists(path: string): Map<string, string[]> {
    const text = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
    const out = new Map<string, string[]>();
    const re = /WHEN '([A-Z]+\.[A-Z_.]+)'\.\n\s+lv_list = '([a-z_0-9 ]*)'\./g;
    for (const m of text.matchAll(re)) out.set(m[1], m[2].split(' ').filter(Boolean));
    return out;
  }

  for (const src of sources) {
    it(`${src} lists every catalog action with the same parameters`, () => {
      const lists = abapLists(src);
      const files: string[] = catalogFiles();
      let n = 0;
      for (const f of files) {
        for (const a of load(f).actions) {
          n++;
          const want = (a.params ?? []).map((p: { name: string }) => p.name).sort();
          expect(lists.has(a.id), `${a.id} missing in ${src}`).toBe(true);
          expect([...(lists.get(a.id) ?? [])].sort(), a.id).toEqual(want);
        }
      }
      expect(lists.size).toBe(n);
    });
  }
});
