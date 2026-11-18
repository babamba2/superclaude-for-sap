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
    expect(t).toMatch(/CLASS zcl_mcp_biz_if DEFINITION LOCAL FRIENDS ltcl_keys[ .]/);
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

// Dangerous-module rules (2026-11-18): a remote-enabled customer module that truncated any Z table passed the
// fence with no posting sign. Refusals happen in the fence, so PREVIEW and EXECUTE both stop and ack_posting
// cannot unlock them.
describe('ZCL_MCP_BIZ_IF — dangerous modules refused', () => {
  const tsrc = readFileSync(join(ROOT, 'abap', 'biz', 'zcl_mcp_biz_if.clas.testclasses.abap'), 'utf8').replace(/\r\n/g, '\n');

  it('the fence checks the name rules before TFDIR and the signature / source rules before S_RFC', () => {
    const f = body('fence');
    const name = f.indexOf('lv_reason = risky_name( iv_fm ).');
    expect(name).toBeGreaterThan(f.indexOf("IF NOT ( iv_fm CP 'Z*'"));
    expect(name).toBeLessThan(f.indexOf('FROM tfdir'));
    expect(f).toContain('SELECT SINGLE fmode pname include FROM tfdir INTO (lv_fmode, lv_pname, lv_incno) WHERE funcname = iv_fm.');
    const danger = f.indexOf('rv_error = danger( iv_fm = iv_fm iv_pname = lv_pname iv_incno = lv_incno ).');
    expect(danger).toBeGreaterThan(f.indexOf("IF lv_fmode <> 'R'."));
    expect(danger).toBeLessThan(f.indexOf("AUTHORITY-CHECK OBJECT 'S_RFC'"));
    // the fence runs before the posting / ack checks in run, so no ack reaches these refusals
    const r = body('run');
    expect(r.indexOf('lv_error = fence( lv_fm ).')).toBeLessThan(r.indexOf("is_params-ack_posting <> 'true'"));
  });

  it('names: generic SQL / table tools, passwords, user unlock, HR and payroll', () => {
    const n = body('risky_name');
    for (const p of ['*DYNSQL*', '*TRUNCATE*', '*READ_TABLE*', '*DATA_COPY*', '*PASSWORD*', '*USER_UNLOCK*',
      'ZHR*', 'YHR*', 'Z_HR*', 'Y_HR*', '*PAYROLL*', '*PAYSLIP*', '*SALARY*', '*WAGE*', '*PCL1*', '*PCL2*', '*PCL3*', '*PCL4*'])
      expect(n, p).toContain(`iv_fm CP '${p}'`);
  });

  it('signature: table names, WHERE conditions, source code, SQL names — sent parameters only', () => {
    const p = body('risky_param');
    expect(p).toContain("IF is_par-kind <> 'I' AND is_par-kind <> 'C' AND is_par-kind <> 'T'.");
    for (const t of ["is_par-typ CP 'TABNAME*'", "is_par-typ CP '*-TABNAME'", "is_par-typ = 'RFC_DB_OPT'", "is_par-typ CP '*WHERE*'",
      "is_par-typ CP 'ABAPSOURCE*'", "is_par-name CP '*SQL*'", "is_par-name CP '*TABNAME*'", "is_par-name CP '*TAB_NAME*'",
      "is_par-name CP '*TABLE_NAME*'", "is_par-name CP '*WHERE*' AND NOT is_par-name CP '*WHEREUSED*'"]) expect(p, t).toContain(t);
    expect(p).not.toContain('PERNR');
  });

  it('employee numbers: only a required importing scalar (a module run for one person)', () => {
    const k = body('person_key');
    expect(k).toContain("IF is_par-kind <> 'I' OR is_par-optional = abap_true OR iv_elementary = abap_false.");
    expect(k).toContain("IF is_par-typ CP '*PERNR*' OR is_par-typ CP '*PERSNO*' OR is_par-name CP '*PERNR*'.");
    const d = body('danger');
    expect(d).toContain('IF lo_type IS BOUND AND lo_type->kind = cl_abap_typedescr=>kind_elem.');
    expect(d).toContain('lv_reason = person_key( is_par = ls_par iv_elementary = lv_elem ).');
    for (const m of ['person_keys', 'not_person_keys']) expect(tsrc).toContain(`METHODS ${m} FOR TESTING.`);
  });

  it('source: every rule, literals kept, comments cut', () => {
    const l = body('risky_line');
    for (const r of ['`EXEC\\s+SQL`', "iv_code CS 'TRUNCATE'", "iv_code CS 'CL_SQL_'", '`GENERATE\\s+SUBROUTINE\\s+POOL`',
      '`(INSERT|DELETE)\\s+REPORT`', '`(^|[^A-Z0-9_-])SUBMIT([^A-Z0-9_-]|$)`', '`(OPEN|DELETE)\\s+DATASET`',
      '`(^|[^A-Z0-9_-])DESTINATION([^A-Z0-9_-]|$)`', '`STARTING\\s+NEW\\s+TASK`', "`CALL\\s+'SYSTEM'`", "`CALL\\s+FUNCTION\\s+[^'``\\s]`",
      '`(^|[^A-Z0-9_-])(INSERT|UPDATE|MODIFY|DELETE)\\s+(FROM\\s+|INTO\\s+)?\\(\\s*[A-Z_<][A-Z0-9_<>/-]*\\s*\\)`',
      '`(^|[^A-Z0-9_-])FROM\\s+\\(\\s*[A-Z_<][A-Z0-9_<>/-]*\\s*\\)`']) expect(l, r).toContain(r);
    const c = body('code_part');
    expect(c).toContain("ELSEIF lv_c = '''' OR lv_c = '`' OR lv_c = '|'.");
    expect(c).toMatch(/IF lv_c = '"'\.\n\s+EXIT\./);
    // the cut position, not a char-by-char rebuild: c(1) blanks would vanish in a concatenation
    expect(c).toContain('rv_code = to_upper( substring( val = iv_line len = lv_pos ) ).');
  });

  it("the module's include, then the group's own and customer includes; unreadable or too many = refused", () => {
    const d = body('danger');
    expect(d).toContain('lt_pars = signature( iv_fm ).');
    expect(d).toContain('lv_own    = |{ lv_ns }L{ lv_group }U{ iv_incno }|.');
    expect(d).toContain('READ REPORT lv_prog INTO lt_src.');
    expect(d).toContain('IF lv_name <> lv_own AND lv_name CP lv_others.');
    expect(d).toContain("IF NOT ( lv_name CP lv_mine OR lv_name CP 'Z*' OR lv_name CP 'Y*' OR lv_name CP 'LZ*' OR lv_name CP 'LY*' ).");
    expect(d).toContain('IF lines( lt_seen ) > c_max_includes.');
    expect(src).toContain('CONSTANTS c_max_includes TYPE i VALUE 60.');
    expect(d.match(/could not be (read|located), so dangerous statements are not ruled out/g)?.length).toBe(3);
    expect(body('include_names')).toContain(String.raw`FIND REGEX ` + '`' + String.raw`^\s*INCLUDE\s+([A-Z0-9_/<>$]+)(\s+IF\s+FOUND)?\s*\.` + '`');
  });

  it('7.40-safe: no xsdbool, inline declarations or offset arithmetic in the new methods', () => {
    for (const m of ['danger', 'risky_name', 'risky_param', 'code_part', 'risky_line', 'risky_source', 'include_names']) {
      const b = body(m).replace(/`[^`]*`/g, "``"); // regex literals left out
      expect(b, m).not.toMatch(/xsdbool/i);
      expect(b, m).not.toMatch(/DATA\(/);
      expect(b, m).not.toMatch(/\+\(|\+\w+\(\w+\s*[-+]/); // no lv+( expr ) or lv+off(len - x)
    }
  });

  it('ABAP Unit covers names, parameters, literals, statements, the first hit and the include list', () => {
    expect(tsrc).toContain('CLASS zcl_mcp_biz_if DEFINITION LOCAL FRIENDS ltcl_keys ltcl_fence.');
    for (const m of ['names_refused', 'names_allowed', 'params_refused', 'params_allowed', 'comments_and_literals',
      'statements_refused', 'statements_allowed', 'source_first_hit', 'include_list']) expect(tsrc).toContain(`METHODS ${m} FOR TESTING.`);
    // the three read-only BAPIs of the first live test stay allowed
    for (const b of ['BAPI_EXCHANGERATE_GETDETAIL', 'BAPI_COMPANYCODE_GETDETAIL', 'BAPI_COMPANYCODE_GETLIST'])
      expect(tsrc.slice(tsrc.indexOf('METHOD names_allowed.'))).toContain('`' + b + '`');
  });

  it('live preview fixes: the group from a string copy of PNAME, posting verbs as name parts', () => {
    const g = body('group_of');
    expect(g).toContain('lv_pname = condense( iv_pname ).');
    expect(g).toContain('DATA lv_pname TYPE string.');
    expect(g).toContain('FIND REGEX `^SAPL(\\S+)` IN lv_pname SUBMATCHES ev_group.');
    expect(g).toContain('FIND REGEX `^(/[^/]+/)SAPL(\\S+)` IN lv_pname SUBMATCHES ev_ns ev_group.');
    // both readers use it; no FIND straight on the CHAR40 field any more
    expect(body('posting_signs')).toContain('group_of( EXPORTING iv_pname = lv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).');
    expect(body('danger')).toContain('group_of( EXPORTING iv_pname = iv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).');
    expect(src).not.toContain('SAPL(.+)'); // the old pattern kept trailing blanks of the CHAR40 field
    expect(src.match(/FIND REGEX `\^SAPL/g)?.length).toBe(1);
    // name rule: a verb anywhere in the name, EXCHANGERATE masked first (part splitting lost real writers)
    const n = body('posting_name');
    expect(n).toContain("REPLACE ALL OCCURRENCES OF 'EXCHANGERATE' IN lv_fm WITH '#'.");
    expect(n).toContain('IF lv_fm CS lv_verb.');
    for (const v of ['CREATE', 'CHANGE', 'POST', 'SAVE', 'DELETE', 'CANCEL', 'REVERSE', 'UPDATE']) expect(n).toContain('APPEND `' + v + '` TO lt_verbs.');
    expect(body('posting_signs')).toContain('IF posting_name( iv_fm ) = abap_true.');
    expect(body('posting_signs')).not.toContain("iv_fm CP '*CHANGE*'");
    for (const m of ['group_from_char40', 'posting_names', 'not_posting_names']) expect(tsrc).toContain(`METHODS ${m} FOR TESTING.`);
    expect(tsrc).toContain('APPEND `BAPI_EXCHANGERATE_GETDETAIL` TO lt_names.  " CHANGE inside EXCHANGERATE');
    expect(tsrc).toContain('APPEND `BAPI_PO_CHANGE` TO lt_names.');
  });

  it('test data uses invented customer names only (public repo)', () => {
    const fence = tsrc.slice(tsrc.indexOf('CLASS ltcl_fence IMPLEMENTATION.'));
    const names = [...fence.matchAll(/`([ZY][A-Z0-9_]*)`/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(n).toMatch(/^(ZTEST_|YTEST_|ZHR_ANY_|YHR_ANY_|Z_HR_ANY_)/);
  });
});
