import { describe, it, expect } from 'vitest';
import {
  parseTableExtensions,
  cmodMembership,
  classicBadiImpls,
  analyzeFormExitSource,
  unavailableReason,
  ggbRules,
  ggbForModule,
  bteImplementations,
  bteForModule,
  isNotFound,
  countChecks,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/extract-customizations.mjs';

describe('customization extraction — table extensions', () => {
  it('reads customer fields from the ECC GetTable JSON (append names are not there)', () => {
    const raw = JSON.stringify({
      table_data: JSON.stringify({
        name: 'VBAK',
        fields: [
          { fieldname: 'MANDT', rollname: 'MANDT' },
          { fieldname: '.INCLUDE', comptype: 'S' },
          { fieldname: 'ZZKVGR1', rollname: 'ZSDZZKVGR1' },
          { fieldname: 'ZSEASON', rollname: 'ZSEASON' },
          { fieldname: 'Z_LOGON', rollname: 'ZE_LOGON' },
          { fieldname: 'CTRID', rollname: 'ZE_CTRID' },
          { fieldname: 'TDLNR', rollname: 'TDLNR' },
        ],
      }),
    });
    expect(parseTableExtensions(raw)).toEqual({
      appendStructures: [],
      customFields: ['ZZKVGR1', 'ZSEASON', 'Z_LOGON', 'CTRID'],
      appendNamesKnown: false,
    });
  });

  it('reads appends and customer fields from DDL text, ZZ fields without an underscore included', () => {
    const ddl = 'define table vbak {\n  key mandt : mandt not null;\n  include ci_vbak;\n  include zavbak_ext;\n  zzapprover : zde_approver;\n  ctrid : ze_ctrid;\n  vbeln : vbeln_va;\n}';
    expect(parseTableExtensions(ddl)).toEqual({
      appendStructures: ['CI_VBAK', 'ZAVBAK_EXT'],
      customFields: ['ZZAPPROVER', 'CTRID'],
      appendNamesKnown: true,
    });
  });
});

describe('customization extraction — CMOD, BAdI, form exits', () => {
  it('maps SMOD enhancements to ACTIVE customer CMOD projects only', () => {
    const map = cmodMembership(
      [{ NAME: 'ZSD_PROJ', STATUS: 'A' }, { NAME: 'ZOLD', STATUS: '' }, { NAME: 'SAPPROJ', STATUS: 'A' }],
      [{ NAME: 'ZSD_PROJ', MEMBER: 'V45A0001' }, { NAME: 'ZOLD', MEMBER: 'V45A0002' }, { NAME: 'SAPPROJ', MEMBER: 'V45A0003' }],
    );
    expect([...map]).toEqual([['V45A0001', ['ZSD_PROJ']]]);
  });

  it('takes classic BAdI implementations from GetBadiImplementations, active Z/Y only', () => {
    expect(classicBadiImpls({
      success: true, kind: 'classic',
      implementations: [
        { impl_name: 'ZIM_SD_SALES', impl_class: 'ZCL_IM_SD_SALES', active: true },
        { impl_name: 'SAP_DEMO', active: true },
        { impl_name: 'ZOLD', active: false },
      ],
    })).toEqual([{ name: 'ZIM_SD_SALES', type: 'BADI_IMPL', class: 'ZCL_IM_SD_SALES' }]);
    expect(classicBadiImpls({ success: true, kind: 'classic', implementations: [] })).toEqual([]);
    expect(classicBadiImpls({ success: true, kind: 'unknown' })).toBeNull();
  });

  it('tells a pristine user-exit include from a customized one', () => {
    const pristine = 'FORM userexit_number_range USING us_range_intern.\n* Example\n*  US_RANGE_INTERN = TVFK-NUMKI.\nENDFORM.\n*eject';
    expect(analyzeFormExitSource(pristine).customized).toBe(false);
    const custom = 'FORM userexit_number_range USING us_range_intern.\n  INCLUDE zsdu50110.\nENDFORM.\nFORM check_limit_and_adjust.\n  DATA x.\nENDFORM.';
    expect(analyzeFormExitSource(custom)).toMatchObject({
      customized: true,
      customerForms: ['CHECK_LIMIT_AND_ADJUST'],
      zIncludes: ['ZSDU50110'],
    });
  });

  it('names the release limit when SQL is not available', () => {
    expect(unavailableReason('SQL query is not supported on this SAP system (legacy, BASIS < 7.50).'))
      .toBe('SQL is not available on this release (BASIS < 7.50)');
  });

  it('tells a missing include from a failed read and counts repeated checks', () => {
    expect(isNotFound('Request failed with status code 404')).toBe(true);
    expect(isNotFound('SQL is not available on this release (BASIS < 7.50)')).toBe(false);
    expect(countChecks(['FORMEXIT', 'FORMEXIT', 'FORMEXIT', 'GGB'])).toBe('FORMEXIT ×3, GGB');
  });
});

describe('customization extraction — GGB rules and BTE function modules', () => {
  const gb31 = [
    { VALUSER: 'GL', VALEVENT: '0002', RCLASS: '009' },
    { VALUSER: 'CO', VALEVENT: '1000', RCLASS: '050' },
  ];

  it('keeps rules not created by SAP whatever their name, mapped to application areas and company codes', () => {
    const rules = ggbRules(
      [
        { VALID: 'ZFI_ITM', BOOLCLASS: '009', GBOPCREATE: 'KIMJ' },
        { VALID: 'ZSAMPLE', BOOLCLASS: '009', GBOPCREATE: 'SAP' },
        { VALID: 'LVAL001', BOOLCLASS: '009', GBOPCREATE: 'KIMJ' },
      ],
      [{ SUBSTID: 'YCO_SUB', BOOLCLASS: '050', EXIT: 'U100', GBOPCREATE: 'LEEH' }],
      gb31,
      [
        { BUKRS: '1000', EVENT: '0002', VALID: 'ZFI_ITM', ACTIV: '1' },
        { BUKRS: '3000', EVENT: '0002', VALID: 'LVAL001', ACTIV: '1' },
      ],
      [],
    );
    expect(rules).toEqual([
      {
        name: 'ZFI_ITM', type: 'validation', boolClass: '009', applAreas: ['GL'], createdBy: 'KIMJ',
        companyCodeAssignments: [{ companyCode: '1000', callupPoint: '0002', activationLevel: '1' }],
      },
      {
        name: 'LVAL001', type: 'validation', boolClass: '009', applAreas: ['GL'], createdBy: 'KIMJ',
        companyCodeAssignments: [{ companyCode: '3000', callupPoint: '0002', activationLevel: '1' }],
      },
      {
        name: 'YCO_SUB', type: 'substitution', boolClass: '050', applAreas: ['CO'], createdBy: 'LEEH',
        exit: 'U100', companyCodeAssignments: [],
      },
    ]);
    expect(ggbForModule(rules, 'FI').map((r: { name: string }) => r.name)).toEqual(['ZFI_ITM', 'LVAL001']);
    expect(ggbForModule(rules, 'CO').map((r: { name: string }) => r.name)).toEqual(['YCO_SUB']);
    expect(ggbForModule(rules, 'SD')).toEqual([]);
  });

  it('reads customer BTE FMs from TBE34 / TPS34 with the product active flag from TBE24', () => {
    const impls = bteImplementations(
      [
        { EVENT: '00001030', PRDKT: 'ZPROD', LAND: '', APPLK: 'FI-FI', FUNCT: 'Z_BTE_1030' },
        { EVENT: '00001025', PRDKT: 'ZPROD', LAND: '', APPLK: '', FUNCT: 'SAMPLE_INTERFACE_1025' },
      ],
      [{ PROCS: '00001120', PRDKT: 'ZOLD', LAND: 'KR', APPLK: 'FI-AA', FUNCT: 'Z_PROC_1120' }],
      [{ PRDKT: 'ZPROD', AKTIV: 'X' }, { PRDKT: 'ZOLD', AKTIV: '' }],
    );
    expect(impls).toEqual([
      { kind: 'P/S', event: '00001030', application: 'FI-FI', country: '', product: 'ZPROD', productActive: true, function: 'Z_BTE_1030' },
      { kind: 'Process', event: '00001120', application: 'FI-AA', country: 'KR', product: 'ZOLD', productActive: false, function: 'Z_PROC_1120' },
    ]);
    expect(bteForModule(impls, 'AA').map((b: { function: string }) => b.function)).toEqual(['Z_PROC_1120']);
    expect(bteForModule(impls, 'SD')).toEqual([]);
  });
});
