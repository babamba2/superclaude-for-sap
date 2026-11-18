*"* ZCL_MCP_BIZ_IF — local test classes (ABAP Unit). Run with the install (RunUnitTest) before any test call.
*"* json_top_keys decides which names reach the unknown-key check: a key it misses would escape the check
*"* and, for an optional importing parameter, be silently left unbound (verifier-3, 2026-11-18).

CLASS ltcl_keys DEFINITION DEFERRED.
CLASS zcl_mcp_biz_if DEFINITION LOCAL FRIENDS ltcl_keys.

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
