import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs module
import { loadCatalogs } from '../../scripts/assist/catalog.mjs';

// IF.TEST.CALL (interface test button, 2026-11-18): the ABAP fence and LUW rules held in the source, the
// catalog web-only, the executor wiring. The class is compiled on SAP at install; this guards edits.

const ROOT = join(__dirname, '..', '..');
const src = readFileSync(join(ROOT, 'abap', 'biz', 'zcl_mcp_biz_if.clas.abap'), 'utf8').replace(/\r\n/g, '\n');
const body = (name: string) => {
  const a = src.indexOf(`  METHOD ${name}.`);
  expect(a, name).toBeGreaterThan(0);
  return src.slice(a, src.indexOf('  ENDMETHOD.', a));
};

describe('ZCL_MCP_BIZ_IF — fence', () => {
  it('development clients only, remote-enabled, S_RFC, the name allow / deny list, never the sc4sap helpers', () => {
    const f = body('fence');
    expect(f).toMatch(/SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt\.\n\s+IF lv_cat <> 'C'\./);
    expect(f).toMatch(/IF lv_fmode <> 'R'\./);
    expect(f).toMatch(/AUTHORITY-CHECK OBJECT 'S_RFC'\n\s+ID 'RFC_TYPE' FIELD 'FUNC'\n\s+ID 'RFC_NAME' FIELD iv_fm\n\s+ID 'ACTVT'    FIELD '16'\./);
    expect(f).toContain("IF NOT ( iv_fm CP 'Z*' OR iv_fm CP 'Y*' OR iv_fm CP 'BAPI_*' )");
    for (const deny of ["'BAPI_TRANSACTION_*'", "'BAPI_USER_*'", "'BAPI_PRGN_*'", "'*ROLE*'", "'BAPI_XBP_*'", "'ZMCP_*'", "'YMCP_*'",
      "'RFC_*'", "'SXPG_*'", "'TH_*'", "'SUSR_*'", "'SU_*'", "'PRGN_*'", "'/SDF/*'"]) expect(f).toContain(deny);
    expect(f).toContain("lv_pname CP 'SAPLZMCP*'");
    expect(f).toContain("IF lv_pname = 'SAPLSRFC' OR lv_pname = 'SAPLSUTL' OR lv_pname = 'SAPLSDTX'.");
  });

  it('caps the payload and makes one call per EXECUTE', () => {
    const r = body('run');
    expect(src).toContain('CONSTANTS c_max_params TYPE i VALUE 100000.');
    expect(r.indexOf('IF strlen( is_params-fm_params ) > c_max_params.')).toBeLessThan(r.indexOf('lv_error = fence( lv_fm ).'));
    expect(r.match(/CALL FUNCTION lv_fm PARAMETER-TABLE/g)?.length).toBe(1);
  });

  it('runs the fence before anything else, in preview and execute alike', () => {
    const r = body('run');
    expect(r.indexOf('lv_error = fence( lv_fm ).')).toBeGreaterThan(0);
    expect(r.indexOf('lv_error = fence( lv_fm ).')).toBeLessThan(r.indexOf('signature( lv_fm )'));
    expect(body('zif_mcp_biz_action~preview')).toContain('run( is_params = is_params iv_execute = abap_false )');
    expect(body('zif_mcp_biz_action~execute')).toContain('run( is_params = is_params iv_execute = abap_true )');
  });
});

describe('ZCL_MCP_BIZ_IF — posting and the LUW', () => {
  it('posting signs need ack_posting; commit needs ack_posting; preview calls nothing', () => {
    const r = body('run');
    expect(r).toMatch(/IF lv_posting = abap_true AND is_params-ack_posting <> 'true'\./);
    expect(r).toMatch(/IF lv_commit = abap_true AND is_params-ack_posting <> 'true'\./);
    const callAt = r.indexOf('CALL FUNCTION lv_fm PARAMETER-TABLE');
    expect(r.indexOf('IF iv_execute = abap_false.')).toBeLessThan(callAt);
  });

  it('commits only when asked and nothing failed; otherwise rolls back inside the handler (the executor commits its log after)', () => {
    const r = body('run');
    const tail = r.slice(r.indexOf('CALL FUNCTION lv_fm PARAMETER-TABLE'));
    expect(tail).toMatch(/IF lv_commit = abap_true AND rs_result-failed = abap_false\.\n\s+CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'/);
    expect(tail).toMatch(/ELSE\.\n\s+ROLLBACK WORK\./);
    expect(tail).toMatch(/CATCH cx_root INTO lx_root\.\n\s+ROLLBACK WORK\./);
    // a RETURN with E / A fails the call before the commit decision
    expect(tail.indexOf("rs_result-failed = abap_true.\n      EXIT.")).toBeLessThan(tail.indexOf("CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'"));
  });

  it('a module that commits by itself is reported irreversible', () => {
    const r = body('run');
    expect(r).toMatch(/IF lv_self_commit = abap_true\.\n\s+add_kv\( EXPORTING iv_name = 'posting.self_commit'[^\n]*\n\s+rs_result-irreversible = abap_true\./);
    expect(body('posting_signs')).toMatch(/IF lv_line CS 'COMMIT WORK' OR lv_line CS 'BAPI_TRANSACTION_COMMIT'\.\n\s+ev_self_commit = abap_true\./);
  });

  it('parameter names the module does not have are refused; exporting ones are not sent', () => {
    const b = body('build');
    expect(b).toContain('is not a parameter of this module');
    expect(b).toContain('is not a parameter the caller sends');
    expect(b).toContain('Required parameter');
    expect(b).not.toMatch(/\/ui2\/cl_json=>generate\(/i); // a call: missing on older 7.40 support packages
  });
});

describe('IF catalog and executor wiring', () => {
  const cat = JSON.parse(readFileSync(join(ROOT, 'configs', 'IF', 'actions.json'), 'utf8'));
  it('web-only: never in the assist chat\'s catalogs', () => {
    expect(cat.channel).toBe('web');
    expect(loadCatalogs().some((c: { module: string }) => c.module === 'IF')).toBe(false);
  });
  it('"chat": false on the action: kept out of the chat even once verified', () => {
    expect(cat.actions[0].chat).toBe(false);
    expect(readFileSync(join(ROOT, 'scripts', 'assist', 'catalog.mjs'), 'utf8')).toContain('.filter((a) => a.chat !== false)');
  });
  it('the handler lists exactly the catalog\'s action', () => {
    expect(src).toContain("CONSTANTS c_action TYPE string VALUE 'IF.TEST.CALL'.");
    expect(cat.actions.map((a: { id: string }) => a.id)).toEqual(['IF.TEST.CALL']);
  });
  for (const f of ['zcl_mcp_biz_exec.clas.abap', '731/zcl_mcp_biz_exec.clas.abap']) {
    it(`${f} reaches IF through optional_handler and lists it`, () => {
      const e = readFileSync(join(ROOT, 'abap', 'biz', f), 'utf8').replace(/\r\n/g, '\n');
      expect(e).toContain("OR iv_action CP 'QM.*' OR iv_action CP 'IF.*'.");
      expect(e).toMatch(/lo_handler = optional_handler\( 'IF' \)\.\n\s+IF lo_handler IS BOUND\./);
    });
  }
  for (const f of ['zcl_mcp_biz_exec.clas.abap', '731/zcl_mcp_biz_exec.clas.abap']) {
    it(`${f} logs IF.* by module name only, never parameter or output values`, () => {
      const e = readFileSync(join(ROOT, 'abap', 'biz', f), 'utf8').replace(/\r\n/g, '\n');
      expect(e).toMatch(/IF iv_action CP 'IF\.\*'\.\n\s+ls_log-params_json = \|\{ '\{' \}"fm_name":/);
      expect(e).toMatch(/DELETE ls_logres-rows WHERE name = 'fm_result' OR name CP 'sig\.\*'\.\n\s+lv_json = to_json\( ls_logres \)\./);
    });
  }
  it('the params type carries the four fields, in both interface copies', () => {
    for (const f of ['zif_mcp_biz_action.intf.abap', '731/zif_mcp_biz_action.intf.abap']) {
      const i = readFileSync(join(ROOT, 'abap', 'biz', f), 'utf8');
      for (const n of ['fm_name', 'fm_params', 'ack_posting', 'commit']) expect(i, `${f} ${n}`).toMatch(new RegExp(`\\n\\s+${n}\\s+TYPE string,`));
    }
  });
});

describe('ZCL_MCP_BIZ_IF — verifier-3 FAIL fixes (2026-11-18)', () => {
  it('the key scanner compares blanks as the initial c(1), and tab / LF / CR as c(1) copies', () => {
    const k = body('json_top_keys');
    expect(k).toContain('IF NOT ( lv_k IS INITIAL OR lv_k = lv_tab OR lv_k = lv_lf OR lv_k = lv_cr ).');
    for (const bad of ['lv_k = ` `', String.raw`lv_k = |\t|`, String.raw`lv_k = |\n|`, String.raw`lv_k = |\r|`]) expect(k).not.toContain(bad);
    expect(k).toContain('lv_tab = cl_abap_char_utilities=>horizontal_tab.');
  });

  it('ABAP Unit covers blanks / tab / CR LF / newline before the colon, strings and nesting', () => {
    const t = readFileSync(join(ROOT, 'abap', 'biz', 'zcl_mcp_biz_if.clas.testclasses.abap'), 'utf8');
    expect(t).toContain('CLASS zcl_mcp_biz_if DEFINITION LOCAL FRIENDS ltcl_keys.');
    expect(t).toContain(String.raw`|\{ "iv_a" : "1",\n  "IT_C"\t:\r\n [ \{"Z":":"\} ],\n "IV_D"\n:"x" \}|`);
    for (const m of ['plain', 'blanks_around_colon', 'strings_and_nesting', 'not_an_object']) expect(t).toContain(`METHODS ${m} FOR TESTING.`);
  });

  it('no FUNCTION_INCLUDE_INFO call: the include comes from TFDIR PNAME / INCLUDE', () => {
    const p = body('posting_signs');
    expect(p).not.toMatch(/CALL FUNCTION 'FUNCTION_INCLUDE_INFO'/);
    expect(p).toContain('SELECT SINGLE pname include FROM tfdir INTO (lv_pname, lv_incno) WHERE funcname = iv_fm.');
    expect(p).toContain('lv_include = |{ lv_ns }L{ lv_group }U{ lv_incno }|.');
    expect(p).toContain('SPLIT lv_raw AT \'"\' INTO lv_line lv_comment.');
  });

  it('the preview says a COMMIT in a called module is not detected', () => {
    expect(body('run')).toContain("iv_value = 'A COMMIT inside a module this one calls is not detected: on DEV this can post data'");
  });
});
