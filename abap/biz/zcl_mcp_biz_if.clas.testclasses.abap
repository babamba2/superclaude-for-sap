*"* ZCL_MCP_BIZ_IF — local test classes (ABAP Unit). Run with the install (RunUnitTest) before any test call.
*"* json_top_keys decides which names reach the unknown-key check: a key it misses would escape the check
*"* and, for an optional importing parameter, be silently left unbound (verifier-3, 2026-11-18).

*"* ltcl_fence: the dangerous-module rules (names, signature, source lines, include list) — pure logic, no SAP
*"* data. Every refused case is a pattern a real remote-enabled module used; every allowed case must keep
*"* passing (the three read-only BAPIs of the first live interface test among them).

CLASS ltcl_keys DEFINITION DEFERRED.
CLASS ltcl_fence DEFINITION DEFERRED.
CLASS zcl_mcp_biz_if DEFINITION LOCAL FRIENDS ltcl_keys ltcl_fence.

CLASS ltcl_keys DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    DATA mo_cut TYPE REF TO zcl_mcp_biz_if.
    METHODS setup.
    METHODS plain FOR TESTING.
    METHODS blanks_around_colon FOR TESTING.
    METHODS strings_and_nesting FOR TESTING.
    METHODS not_an_object FOR TESTING.
ENDCLASS.


CLASS ltcl_keys IMPLEMENTATION.

  METHOD setup.
    CREATE OBJECT mo_cut.
  ENDMETHOD.


  METHOD plain.
    DATA lt_exp TYPE string_table.

    APPEND `IV_A` TO lt_exp.
    APPEND `IS_B` TO lt_exp.
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->json_top_keys( `{"IV_A":"1","IS_B":{"X":"2"}}` )
      exp = lt_exp ).
  ENDMETHOD.


  METHOD blanks_around_colon.
    " Blank, tab, CR LF and newline between a name and its colon; lower case is upper-cased.
    DATA lt_exp TYPE string_table.

    APPEND `IV_A` TO lt_exp.
    APPEND `IT_C` TO lt_exp.
    APPEND `IV_D` TO lt_exp.
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->json_top_keys( |\{ "iv_a" : "1",\n  "IT_C"\t:\r\n [ \{"Z":":"\} ],\n "IV_D"\n:"x" \}| )
      exp = lt_exp ).
  ENDMETHOD.


  METHOD strings_and_nesting.
    " Colons and quotes inside values, and names of nested objects, are not top-level names.
    DATA lt_exp TYPE string_table.

    APPEND `A` TO lt_exp.
    APPEND `B` TO lt_exp.
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->json_top_keys( `{"A":"x\"K\":1","B":{"C":{"D":2}}}` )
      exp = lt_exp ).
  ENDMETHOD.


  METHOD not_an_object.
    cl_abap_unit_assert=>assert_initial( mo_cut->json_top_keys( `["A","B"]` ) ).
    cl_abap_unit_assert=>assert_initial( mo_cut->json_top_keys( `` ) ).
  ENDMETHOD.

ENDCLASS.

CLASS ltcl_fence DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    DATA mo_cut TYPE REF TO zcl_mcp_biz_if.
    METHODS setup.
    METHODS add_par
      IMPORTING iv_name TYPE string
                iv_kind TYPE string
                iv_typ  TYPE string
                iv_opt  TYPE abap_bool OPTIONAL
      CHANGING  ct_pars TYPE zcl_mcp_biz_if=>ty_pars.
    METHODS line_reason
      IMPORTING iv_line          TYPE string
      RETURNING VALUE(rv_reason) TYPE string.
    METHODS names_refused FOR TESTING.
    METHODS names_allowed FOR TESTING.
    METHODS params_refused FOR TESTING.
    METHODS params_allowed FOR TESTING.
    METHODS comments_and_literals FOR TESTING.
    METHODS statements_refused FOR TESTING.
    METHODS statements_allowed FOR TESTING.
    METHODS source_first_hit FOR TESTING.
    METHODS include_list FOR TESTING.
    METHODS group_from_char40 FOR TESTING.
    METHODS posting_names FOR TESTING.
    METHODS not_posting_names FOR TESTING.
    METHODS person_keys FOR TESTING.
    METHODS not_person_keys FOR TESTING.
ENDCLASS.


CLASS ltcl_fence IMPLEMENTATION.

  METHOD setup.
    CREATE OBJECT mo_cut.
  ENDMETHOD.


  METHOD add_par.
    DATA ls_par TYPE zcl_mcp_biz_if=>ty_par.

    ls_par-name = iv_name.
    ls_par-kind = iv_kind.
    ls_par-typ  = iv_typ.
    ls_par-optional = iv_opt.
    APPEND ls_par TO ct_pars.
  ENDMETHOD.


  METHOD line_reason.
    rv_reason = mo_cut->risky_line( mo_cut->code_part( iv_line ) ).
  ENDMETHOD.


  METHOD names_refused.
    DATA: lt_names TYPE string_table,
          lv_name  TYPE string,
          lv_fm    TYPE rs38l_fnam.

    APPEND `ZTEST_DYNSQL` TO lt_names.
    APPEND `ZTEST_DYNSQL_NOLOG` TO lt_names.
    APPEND `ZTEST_TRUNCATE_TABLE` TO lt_names.
    APPEND `ZTEST_RFC_READ_TABLE` TO lt_names.
    APPEND `YTEST_DATA_COPY` TO lt_names.
    APPEND `ZTEST_USER_UNLOCK_RESET` TO lt_names.
    APPEND `ZTEST_CHANGEPASSWORD` TO lt_names.
    APPEND `ZHR_ANY_MODULE` TO lt_names.
    APPEND `YHR_ANY_MODULE` TO lt_names.
    APPEND `Z_HR_ANY_MODULE` TO lt_names.
    APPEND `ZTEST_PAYROLL_RESULT` TO lt_names.
    APPEND `BAPI_GET_PAYSLIP` TO lt_names.
    APPEND `ZTEST_SALARY_INFO` TO lt_names.
    APPEND `BAPI_BASICPAY_EVALUATEWAGETYPES` TO lt_names.
    APPEND `ZTEST_READ_PCL2` TO lt_names.
    LOOP AT lt_names INTO lv_name.
      lv_fm = lv_name.
      cl_abap_unit_assert=>assert_not_initial( act = mo_cut->risky_name( lv_fm ) msg = lv_name ).
    ENDLOOP.
  ENDMETHOD.


  METHOD names_allowed.
    DATA: lt_names TYPE string_table,
          lv_name  TYPE string,
          lv_fm    TYPE rs38l_fnam.

    APPEND `BAPI_EXCHANGERATE_GETDETAIL` TO lt_names.
    APPEND `BAPI_COMPANYCODE_GETDETAIL` TO lt_names.
    APPEND `BAPI_COMPANYCODE_GETLIST` TO lt_names.
    APPEND `ZTEST_CHR_LIST` TO lt_names.      " HR only as a prefix
    APPEND `ZTEST_PCLASS_GET` TO lt_names.    " PCL1..PCL4 only, not every PCL
    APPEND `ZTEST_ORDER_GET` TO lt_names.
    LOOP AT lt_names INTO lv_name.
      lv_fm = lv_name.
      cl_abap_unit_assert=>assert_initial( act = mo_cut->risky_name( lv_fm ) msg = lv_name ).
    ENDLOOP.
  ENDMETHOD.


  METHOD params_refused.
    DATA: lt_pars TYPE zcl_mcp_biz_if=>ty_pars,
          ls_par  TYPE zcl_mcp_biz_if=>ty_par.

    add_par( EXPORTING iv_name = `I_TAB` iv_kind = `I` iv_typ = `TABNAME` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `I_TABNAM` iv_kind = `I` iv_typ = `TABNAME16` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `QUERY_TABLE` iv_kind = `I` iv_typ = `DD02L-TABNAME` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `OPTIONS` iv_kind = `T` iv_typ = `RFC_DB_OPT` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IT_COND` iv_kind = `T` iv_typ = `RSDSWHERE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IT_COND2` iv_kind = `T` iv_typ = `DB2WHERE_S` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IT_CODE` iv_kind = `T` iv_typ = `ABAPSOURCE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `SQL_STR` iv_kind = `I` iv_typ = `STRING` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `I_WHERE` iv_kind = `I` iv_typ = `CHAR200` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IV_TABLE_NAME` iv_kind = `C` iv_typ = `CHAR30` CHANGING ct_pars = lt_pars ).
    LOOP AT lt_pars INTO ls_par.
      cl_abap_unit_assert=>assert_not_initial( act = mo_cut->risky_param( ls_par ) msg = |{ ls_par-name }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD params_allowed.
    DATA: lt_pars TYPE zcl_mcp_biz_if=>ty_pars,
          ls_par  TYPE zcl_mcp_biz_if=>ty_par.

    add_par( EXPORTING iv_name = `COMPANYCODEID` iv_kind = `I` iv_typ = `BAPI0002_2-COMP_CODE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `DATE` iv_kind = `I` iv_typ = `BAPI1093_2-TRANS_DATE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `RATE_TYPE` iv_kind = `I` iv_typ = `BAPI1093_1-RATE_TYPE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `COMPANYCODE_LIST` iv_kind = `T` iv_typ = `BAPI0002_1` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `GETWHEREUSED` iv_kind = `I` iv_typ = `BAPI_DOC_AUX-FLAG` CHANGING ct_pars = lt_pars ).
    " Exporting parameters only come back to the caller.
    add_par( EXPORTING iv_name = `E_TABNAME` iv_kind = `E` iv_typ = `TABNAME` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `RETURN` iv_kind = `E` iv_typ = `BAPIRET2` CHANGING ct_pars = lt_pars ).
    LOOP AT lt_pars INTO ls_par.
      cl_abap_unit_assert=>assert_initial( act = mo_cut->risky_param( ls_par ) msg = |{ ls_par-name }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD comments_and_literals.
    " A quote inside a literal does not start a comment; the comment is cut; literals stay.
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->code_part( `  lv_x = 'a"b'. " EXEC SQL in a comment` )
      exp = `  LV_X = 'A"B'. ` ).
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->code_part( `  lv_x = |say "hi"|. " comment` )
      exp = `  LV_X = |SAY "HI"|. ` ).
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->code_part( `  lv_x = 'it''s'. " c` )
      exp = `  LV_X = 'IT''S'. ` ).
    cl_abap_unit_assert=>assert_initial( line_reason( `  lv_x = 'a"b'. " EXEC SQL in a comment` ) ).
  ENDMETHOD.


  METHOD statements_refused.
    DATA: lt_lines TYPE string_table,
          lv_line  TYPE string.

    APPEND `  EXEC SQL.` TO lt_lines.
    APPEND `   'EXEC SQL.',` TO lt_lines.                       " generated code in a literal
    APPEND `  CONCATENATE 'TRUNCATE TABLE' iv_tab INTO lv_src SEPARATED BY space.` TO lt_lines.
    APPEND `  lo_stmt = NEW cl_sql_statement( ).` TO lt_lines.
    APPEND `  GENERATE SUBROUTINE POOL lt_code NAME lv_prog.` TO lt_lines.
    APPEND `  INSERT REPORT lv_prog FROM lt_code.` TO lt_lines.
    APPEND `  SUBMIT ztest_report AND RETURN.` TO lt_lines.
    APPEND `  lv_s = |then SUBMIT it|.` TO lt_lines.
    APPEND `  OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.` TO lt_lines.
    APPEND `  DELETE DATASET lv_file.` TO lt_lines.
    APPEND `  CALL FUNCTION 'ZTEST_X' DESTINATION lv_dest.` TO lt_lines.
    APPEND `  CALL FUNCTION 'ZTEST_X' STARTING NEW TASK 'T1'.` TO lt_lines.
    APPEND `  CALL 'SYSTEM' ID 'COMMAND' FIELD lv_cmd ID 'TAB' FIELD lt_out.` TO lt_lines.
    APPEND `  CALL FUNCTION lv_fm EXPORTING iv_x = lv_x.` TO lt_lines.
    APPEND `  CALL FUNCTION ls_cfg-function.` TO lt_lines.
    APPEND `  CALL FUNCTION |ZTEST_{ lv_suffix }|.` TO lt_lines.
    APPEND `  DELETE FROM (lv_tab) WHERE (lt_where).` TO lt_lines.
    APPEND `  MODIFY (lv_tab) FROM TABLE <lt_data>.` TO lt_lines.
    APPEND `  INSERT (lv_tab) FROM TABLE lt_rows.` TO lt_lines.
    APPEND `  UPDATE ( lv_tab ) SET (lt_set).` TO lt_lines.
    APPEND `  SELECT * FROM (iv_table) INTO TABLE <lt_any> UP TO 10 ROWS.` TO lt_lines.
    LOOP AT lt_lines INTO lv_line.
      cl_abap_unit_assert=>assert_not_initial( act = line_reason( lv_line ) msg = lv_line ).
    ENDLOOP.
  ENDMETHOD.


  METHOD statements_allowed.
    DATA: lt_lines TYPE string_table,
          lv_line  TYPE string.

    APPEND `  SELECT SINGLE * FROM tsad3t WHERE langu = lv_langu.` TO lt_lines.
    APPEND `  SELECT a~ebeln FROM ( ekko AS a INNER JOIN ekpo AS b ON a~ebeln = b~ebeln ) INTO TABLE lt_po.` TO lt_lines.
    APPEND `  lv_submit_date = sy-datum.` TO lt_lines.
    APPEND `  ls_line-destination = lv_x.` TO lt_lines.
    APPEND `  MODIFY ztest_table FROM ls_row.` TO lt_lines.        " static: a posting sign, not a refusal
    APPEND `  CALL FUNCTION 'ADDR_GET' EXPORTING address_selection = ls_sel.` TO lt_lines.
    APPEND `  CALL FUNCTION ``ZTEST_X`` EXPORTING iv_x = lv_x.` TO lt_lines.
    APPEND `  CALL FUNCTION` TO lt_lines.                        " name on the next line
    APPEND `  PERFORM init_dynamic.` TO lt_lines.
    APPEND `  DELETE lt_rows WHERE flag = abap_true.` TO lt_lines.
    APPEND `  lv_x = 'a"b'. " SUBMIT and DESTINATION in a comment` TO lt_lines.
    LOOP AT lt_lines INTO lv_line.
      cl_abap_unit_assert=>assert_initial( act = line_reason( lv_line ) msg = lv_line ).
    ENDLOOP.
  ENDMETHOD.


  METHOD source_first_hit.
    DATA lt_src TYPE string_table.

    APPEND `* EXEC SQL.` TO lt_src.                                " a comment line
    APPEND `  WRITE 'ok'.` TO lt_src.
    APPEND `` TO lt_src.
    cl_abap_unit_assert=>assert_initial( mo_cut->risky_source( lt_src ) ).
    APPEND `  SUBMIT ztest_report.` TO lt_src.
    APPEND `  EXEC SQL.` TO lt_src.
    cl_abap_unit_assert=>assert_equals(
      act = mo_cut->risky_source( lt_src )
      exp = `SUBMIT of a program: SUBMIT ZTEST_REPORT.` ).
  ENDMETHOD.


  METHOD include_list.
    DATA: lt_src TYPE string_table,
          lt_exp TYPE string_table.

    APPEND `FUNCTION-POOL ztest.` TO lt_src.
    APPEND `  INCLUDE lztesttop.                " Global data` TO lt_src.
    APPEND `  INCLUDE lztestuxx.` TO lt_src.
    APPEND `INCLUDE lztestf01 IF FOUND.` TO lt_src.
    APPEND `* INCLUDE lztestf99.` TO lt_src.
    APPEND `  INCLUDE STRUCTURE ztest_s.` TO lt_src.
    APPEND `DATA lv_x TYPE c. " INCLUDE lztestf98.` TO lt_src.
    APPEND `LZTESTTOP` TO lt_exp.
    APPEND `LZTESTUXX` TO lt_exp.
    APPEND `LZTESTF01` TO lt_exp.
    cl_abap_unit_assert=>assert_equals( act = mo_cut->include_names( lt_src ) exp = lt_exp ).
  ENDMETHOD.


  METHOD group_from_char40.
    " TFDIR-PNAME is CHAR40: the group must not carry its trailing blanks (live preview, 2026-11-18).
    DATA: lv_pname TYPE tfdir-pname,
          lv_ns    TYPE string,
          lv_group TYPE string.

    lv_pname = 'SAPL0002'.
    mo_cut->group_of( EXPORTING iv_pname = lv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).
    cl_abap_unit_assert=>assert_initial( lv_ns ).
    cl_abap_unit_assert=>assert_equals( act = lv_group exp = `0002` ).
    cl_abap_unit_assert=>assert_equals( act = |L{ lv_group }U02| exp = `L0002U02` ).

    lv_pname = '/TEST/SAPLZTEST_GRP'.
    mo_cut->group_of( EXPORTING iv_pname = lv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).
    cl_abap_unit_assert=>assert_equals( act = lv_ns exp = `/TEST/` ).
    cl_abap_unit_assert=>assert_equals( act = lv_group exp = `ZTEST_GRP` ).

    lv_pname = 'ZTEST_REPORT'.
    mo_cut->group_of( EXPORTING iv_pname = lv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).
    cl_abap_unit_assert=>assert_initial( lv_group ).
  ENDMETHOD.


  METHOD posting_names.
    DATA: lt_names TYPE string_table,
          lv_name  TYPE string,
          lv_fm    TYPE rs38l_fnam.

    APPEND `BAPI_PO_CHANGE` TO lt_names.
    APPEND `BAPI_PO_CREATE1` TO lt_names.
    APPEND `BAPI_SALESORDER_CREATEFROMDAT2` TO lt_names.
    APPEND `BAPI_ACC_DOCUMENT_POST` TO lt_names.
    APPEND `BAPI_ACC_DOCUMENT_REVERSE` TO lt_names.
    APPEND `BAPI_MATERIAL_SAVEDATA` TO lt_names.
    APPEND `BAPI_GOODSMVT_CANCEL` TO lt_names.
    APPEND `BAPI_EXCHRATE_CREATEMULTIPLE` TO lt_names.
    APPEND `ZTEST_ITEM_DELETE` TO lt_names.
    APPEND `ZTEST_DOCPOST` TO lt_names.               " verb at the end of a part
    APPEND `ZTEST_ORDERUPDATE` TO lt_names.
    APPEND `ZTEST_RECREATE2` TO lt_names.             " verb inside a word
    APPEND `ZTEST_MASSDELETERELATION` TO lt_names.
    APPEND `ZTEST_EQUI_EXCHANGE` TO lt_names.         " EXCHANGE alone stays a posting sign
    LOOP AT lt_names INTO lv_name.
      lv_fm = lv_name.
      cl_abap_unit_assert=>assert_equals( act = mo_cut->posting_name( lv_fm ) exp = abap_true msg = lv_name ).
    ENDLOOP.
  ENDMETHOD.


  METHOD not_posting_names.
    DATA: lt_names TYPE string_table,
          lv_name  TYPE string,
          lv_fm    TYPE rs38l_fnam.

    APPEND `BAPI_EXCHANGERATE_GETDETAIL` TO lt_names.  " CHANGE inside EXCHANGERATE
    APPEND `BAPI_COMPANYCODE_GETDETAIL` TO lt_names.
    APPEND `BAPI_COMPANYCODE_GETLIST` TO lt_names.
    APPEND `BAPI_PO_GETDETAIL` TO lt_names.
    APPEND `ZTEST_POSITION_GET` TO lt_names.
    LOOP AT lt_names INTO lv_name.
      lv_fm = lv_name.
      cl_abap_unit_assert=>assert_equals( act = mo_cut->posting_name( lv_fm ) exp = abap_false msg = lv_name ).
    ENDLOOP.
  ENDMETHOD.

  METHOD person_keys.
    " Required importing scalars that name one person: refused.
    DATA: lt_pars TYPE zcl_mcp_biz_if=>ty_pars,
          ls_par  TYPE zcl_mcp_biz_if=>ty_par.

    add_par( EXPORTING iv_name = `EMPLOYEENUMBER` iv_kind = `I` iv_typ = `BAPIP0006-PERNR` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IV_ID` iv_kind = `I` iv_typ = `PERSNO` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IV_PERNR` iv_kind = `I` iv_typ = `ZTEST_NUMC8` CHANGING ct_pars = lt_pars ).
    LOOP AT lt_pars INTO ls_par.
      cl_abap_unit_assert=>assert_not_initial( act = mo_cut->person_key( is_par = ls_par iv_elementary = abap_true )
                                               msg = |{ ls_par-name }| ).
    ENDLOOP.
  ENDMETHOD.


  METHOD not_person_keys.
    " An optional filter, a selection table, a structure or an exporting value: a business module, allowed.
    DATA: lt_pars TYPE zcl_mcp_biz_if=>ty_pars,
          ls_par  TYPE zcl_mcp_biz_if=>ty_par.

    add_par( EXPORTING iv_name = `IV_PERNR` iv_kind = `I` iv_typ = `PERNR_D` iv_opt = abap_true CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `IT_PERNR` iv_kind = `T` iv_typ = `ZTEST_PERNR_RANGE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `EV_PERNR` iv_kind = `E` iv_typ = `PERNR_D` CHANGING ct_pars = lt_pars ).
    LOOP AT lt_pars INTO ls_par.
      cl_abap_unit_assert=>assert_initial( act = mo_cut->person_key( is_par = ls_par iv_elementary = abap_true )
                                           msg = |{ ls_par-name }| ).
    ENDLOOP.
    " A structure that holds an employee number among other fields.
    CLEAR lt_pars.
    add_par( EXPORTING iv_name = `IS_SELECTION` iv_kind = `I` iv_typ = `ZTEST_PERNR_SEL` CHANGING ct_pars = lt_pars ).
    READ TABLE lt_pars INDEX 1 INTO ls_par.
    cl_abap_unit_assert=>assert_initial( mo_cut->person_key( is_par = ls_par iv_elementary = abap_false ) ).
    " C1-C3 parameters stay allowed.
    CLEAR lt_pars.
    add_par( EXPORTING iv_name = `COMPANYCODEID` iv_kind = `I` iv_typ = `BAPI0002_2-COMP_CODE` CHANGING ct_pars = lt_pars ).
    add_par( EXPORTING iv_name = `DATE` iv_kind = `I` iv_typ = `BAPI1093_2-TRANS_DATE` CHANGING ct_pars = lt_pars ).
    LOOP AT lt_pars INTO ls_par.
      cl_abap_unit_assert=>assert_initial( act = mo_cut->person_key( is_par = ls_par iv_elementary = abap_true )
                                           msg = |{ ls_par-name }| ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
