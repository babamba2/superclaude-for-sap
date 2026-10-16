* ZMCP_ADT_DISPATCH - action SSF_CONTENT (MCP tool GetSmartFormContent).
*
* NOT a standalone object. Two snippets to paste into the LIVE dispatcher
* of the target system - never deploy the repo copies of the dispatchers
* (zmcp_adt_dispatch_731.abap / zmcp_adt_dispatch_ecc.abap may be older
* than the system). Read and back up the live source first.
*
* Prerequisite: FM ZMCP_SSF_CONTENT (abap/zmcp_ssf_content.abap) exists and
* is active in function group ZMCP_ADT_UTILS, next to ZMCP_SSF_LAYOUT (it
* uses FORM ssf_layout_str of that FM). Install it before the branch.
*
* params: part (FORM | STYLE | GRAPHIC | STDTEXT), form_name, name, object,
*         id, btype, language (1-char SAP key or 2-char ISO code)
* result: EV_RESULT of ZMCP_SSF_CONTENT unchanged (hand-built JSON)
* subrc : 0 ok, 4 not found, 8 other error - EV_MESSAGE says why


*======================================================================*
* SNIPPET A - BASIS 7.31 dispatcher (ZCL_MCP_JSON, no 7.40 syntax)
*======================================================================*
* A1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*     WHEN OTHERS:
*
*        WHEN 'SSF_CONTENT'.
*          PERFORM ssf_content USING iv_params
*                              CHANGING ev_subrc ev_message ev_result.
*
*     and add "SSF_CONTENT - SmartForm XML / style / graphic / text
*     (ZMCP_SSF_CONTENT)" to the "Supported actions" header comment.
*
* A2. Append at the end of the source:

*&---------------------------------------------------------------------*
*& Form SSF_CONTENT - SmartForm content parts (read-only)
*&---------------------------------------------------------------------*
FORM ssf_content USING iv_params TYPE string
                 CHANGING ev_subrc   TYPE i
                          ev_message TYPE string
                          ev_result  TYPE string.

  DATA: lt_members TYPE zcl_mcp_json=>ty_members,
        lv_part    TYPE string,
        lv_formstr TYPE string,
        lv_langstr TYPE string,
        lv_name    TYPE string,
        lv_object  TYPE string,
        lv_id      TYPE string,
        lv_btype   TYPE string,
        lv_form    TYPE tdsfname,
        lv_lang    TYPE spras,
        lv_iso     TYPE laiso,
        lv_subrc   TYPE sysubrc.

  lt_members = zcl_mcp_json=>parse_object( iv_params ).
  lv_part    = to_upper( condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'part' ) ) ).
  lv_formstr = to_upper( condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'form_name' ) ) ).
  lv_langstr = condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'language' ) ).
  lv_name    = condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'name' ) ).
  lv_object  = condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'object' ) ).
  lv_id      = condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'id' ) ).
  lv_btype   = condense( zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'btype' ) ).

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
      ev_subrc = 8. ev_message = |SSF_CONTENT: unknown language { lv_langstr }|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ELSEIF lv_langstr IS NOT INITIAL.
    lv_lang = lv_langstr(1).
  ENDIF.

  CALL FUNCTION 'ZMCP_SSF_CONTENT'
    EXPORTING
      iv_part     = lv_part
      iv_formname = lv_form
      iv_name     = lv_name
      iv_object   = lv_object
      iv_id       = lv_id
      iv_btype    = lv_btype
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
*        WHEN 'SSF_CONTENT'.     PERFORM ssf_content     USING iv_params CHANGING ev_subrc ev_message ev_result.
*
* B2. Append at the end of the source:

*&---------------------------------------------------------------------*
*& Form SSF_CONTENT - SmartForm content parts (read-only)
*&---------------------------------------------------------------------*
FORM ssf_content USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          part      TYPE string,
          form_name TYPE string,
          name      TYPE string,
          object    TYPE string,
          id        TYPE string,
          btype     TYPE string,
          language  TYPE string,
        END OF ls_input.
  DATA: lv_form  TYPE tdsfname,
        lv_lang  TYPE spras,
        lv_iso   TYPE laiso,
        lv_subrc TYPE sysubrc.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  lv_form = to_upper( condense( ls_input-form_name ) ).
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
      ev_subrc = 8. ev_message = |SSF_CONTENT: unknown language { ls_input-language }|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ELSEIF ls_input-language IS NOT INITIAL.
    lv_lang = ls_input-language(1).
  ENDIF.

  CALL FUNCTION 'ZMCP_SSF_CONTENT'
    EXPORTING iv_part     = to_upper( condense( ls_input-part ) )
              iv_formname = lv_form
              iv_name     = condense( ls_input-name )
              iv_object   = condense( ls_input-object )
              iv_id       = condense( ls_input-id )
              iv_btype    = condense( ls_input-btype )
              iv_language = lv_lang
    IMPORTING ev_subrc    = lv_subrc
              ev_message  = ev_message
              ev_result   = ev_result.
  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL. ev_result = '{}'. ENDIF.
ENDFORM.
