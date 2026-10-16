* ZMCP_ADT_DISPATCH - action SSF_LAYOUT (MCP tool GetSmartFormLayout).
*
* NOT a standalone object. Two snippets to paste into the LIVE dispatcher
* of the target system - never deploy the repo copies of the dispatchers
* (zmcp_adt_dispatch_731.abap / zmcp_adt_dispatch_ecc.abap may be older
* than the system). Read and back up the live source first.
*
* Prerequisite: FM ZMCP_SSF_LAYOUT (abap/zmcp_ssf_layout.abap) exists and is
* active in function group ZMCP_ADT_UTILS. Install it before the branch.
*
* params: form_name (required), language (optional: 1-char SAP key or
*         2-char ISO code, converted with CONVERSION_EXIT_ISOLA_INPUT;
*         empty -> master language of the form)
* result: EV_RESULT of ZMCP_SSF_LAYOUT unchanged (hand-built JSON)
* subrc : 0 ok, 4 form not found, 8 other error - EV_MESSAGE says why


*======================================================================*
* SNIPPET A - BASIS 7.31 dispatcher (ZCL_MCP_JSON, no 7.40 syntax)
*======================================================================*
* A1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*     WHEN OTHERS:
*
*        WHEN 'SSF_LAYOUT'.
*          PERFORM ssf_layout USING iv_params
*                             CHANGING ev_subrc ev_message ev_result.
*
*     and add "SSF_LAYOUT - SmartForm page / window layout (ZMCP_SSF_LAYOUT)"
*     to the "Supported actions" header comment.
*
* A2. Append at the end of the source:

*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT - SmartForm page / window layout (read-only)
*&---------------------------------------------------------------------*
* params: form_name, language   result: JSON of ZMCP_SSF_LAYOUT
FORM ssf_layout USING iv_params TYPE string
                CHANGING ev_subrc   TYPE i
                         ev_message TYPE string
                         ev_result  TYPE string.

  DATA: lt_members TYPE zcl_mcp_json=>ty_members,
        lv_formstr TYPE string,
        lv_langstr TYPE string,
        lv_form    TYPE tdsfname,
        lv_lang    TYPE spras,
        lv_iso     TYPE laiso,
        lv_subrc   TYPE sysubrc.

  lt_members = zcl_mcp_json=>parse_object( iv_params ).
  lv_formstr = to_upper( condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'form_name' ) ) ).
  lv_langstr = condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'language' ) ).

  IF lv_formstr IS INITIAL.
    ev_subrc = 8. ev_message = 'SSF_LAYOUT: form_name is required'. ev_result = '{}'.
    RETURN.
  ENDIF.
  lv_form = lv_formstr.
  " 1 char = SAP language key; 2 chars = ISO code (KO -> 3, EN -> E).
  IF strlen( lv_langstr ) = 2.
    lv_iso = to_upper( lv_langstr ).
    CALL FUNCTION 'CONVERSION_EXIT_ISOLA_INPUT'
      EXPORTING
        input            = lv_iso
      IMPORTING
        output           = lv_lang
      EXCEPTIONS
        unknown_language = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      ev_subrc = 8. ev_message = |SSF_LAYOUT: unknown language { lv_langstr }|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ELSEIF lv_langstr IS NOT INITIAL.
    lv_lang = lv_langstr(1).
  ENDIF.

  CALL FUNCTION 'ZMCP_SSF_LAYOUT'
    EXPORTING
      iv_formname = lv_form
      iv_language = lv_lang
    IMPORTING
      ev_subrc    = lv_subrc
      ev_message  = ev_message
      ev_result   = ev_result.

  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL.
    ev_result = '{}'.
  ENDIF.
ENDFORM.


*======================================================================*
* SNIPPET B - ECC / BASIS 7.40 dispatcher (/UI2/CL_JSON)
*======================================================================*
* B1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert one line
*     before WHEN OTHERS (same layout as the neighbouring actions):
*
*        WHEN 'SSF_LAYOUT'.      PERFORM ssf_layout      USING iv_params CHANGING ev_subrc ev_message ev_result.
*
* B2. Append at the end of the source:

*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT - SmartForm page / window layout (read-only)
*&---------------------------------------------------------------------*
* params: form_name, language   result: JSON of ZMCP_SSF_LAYOUT
FORM ssf_layout USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          form_name TYPE string,
          language  TYPE string,
        END OF ls_input.
  DATA: lv_form  TYPE tdsfname,
        lv_lang  TYPE spras,
        lv_iso   TYPE laiso,
        lv_subrc TYPE sysubrc.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  lv_form = to_upper( condense( ls_input-form_name ) ).
  IF lv_form IS INITIAL.
    ev_subrc = 8. ev_message = 'SSF_LAYOUT: form_name is required'. ev_result = '{}'.
    RETURN.
  ENDIF.
  " 1 char = SAP language key; 2 chars = ISO code (KO -> 3, EN -> E).
  ls_input-language = condense( ls_input-language ).
  IF strlen( ls_input-language ) = 2.
    lv_iso = to_upper( ls_input-language ).
    CALL FUNCTION 'CONVERSION_EXIT_ISOLA_INPUT'
      EXPORTING input            = lv_iso
      IMPORTING output           = lv_lang
      EXCEPTIONS unknown_language = 1
                 OTHERS           = 2.
    IF sy-subrc <> 0.
      ev_subrc = 8. ev_message = |SSF_LAYOUT: unknown language { ls_input-language }|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ELSEIF ls_input-language IS NOT INITIAL.
    lv_lang = ls_input-language(1).
  ENDIF.

  CALL FUNCTION 'ZMCP_SSF_LAYOUT'
    EXPORTING iv_formname = lv_form
              iv_language = lv_lang
    IMPORTING ev_subrc    = lv_subrc
              ev_message  = ev_message
              ev_result   = ev_result.
  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL. ev_result = '{}'. ENDIF.
ENDFORM.
