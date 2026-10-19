* ZMCP_ADT_DISPATCH - action SSF_RENDER (MCP tool RenderSmartForm).
*
* NOT a standalone object. A snippet to paste into the LIVE dispatcher of
* the target system - never deploy the repo copies of the dispatchers
* (zmcp_adt_dispatch_ecc.abap may be older than the system). Read and back
* up the live source first.
*
* Prerequisite: FM ZMCP_SSF_RENDER (abap/zmcp_ssf_render.abap) exists and is
* active in function group ZMCP_ADT_UTILS. ECC / BASIS 7.40 only
* (/UI2/CL_JSON); there is no 7.31 variant.
*
* params: form_name, params (JSON array [{"name","json"}]), language
*         (1-char SAP key or 2-char ISO code), device, families
* result: EV_RESULT of ZMCP_SSF_RENDER unchanged (form, fm, pages, otf, pdf)
* subrc : 0 ok, 4 form not found, 8 other error - EV_MESSAGE says why


*======================================================================*
* 1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*    WHEN OTHERS:
*
*        WHEN 'SSF_RENDER'.      PERFORM ssf_render      USING iv_params CHANGING ev_subrc ev_message ev_result.
*
*    and add "SSF_RENDER - SmartForm output as OTF / PDF (ZMCP_SSF_RENDER)"
*    to the "Supported actions" header comment.
*
* 2. Append at the end of the function group include:
*======================================================================*

*&---------------------------------------------------------------------*
*& Form SSF_RENDER - SmartForm output as OTF / PDF (no spool)
*&---------------------------------------------------------------------*
FORM ssf_render USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          form_name TYPE string,
          params    TYPE string,
          language  TYPE string,
          device    TYPE string,
          families  TYPE string,
        END OF ls_input.
  DATA: lv_form  TYPE tdsfname,
        lv_lang  TYPE spras,
        lv_iso   TYPE laiso,
        lv_dev   TYPE rspopname,
        lv_subrc TYPE sysubrc.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  lv_form = to_upper( condense( ls_input-form_name ) ).
  lv_dev = to_upper( condense( ls_input-device ) ).
  ls_input-language = condense( ls_input-language ).
  IF strlen( ls_input-language ) = 2.
    lv_iso = to_upper( ls_input-language ).
    CALL FUNCTION 'CONVERSION_EXIT_ISOLA_INPUT'
      EXPORTING input            = lv_iso
      IMPORTING output           = lv_lang
      EXCEPTIONS unknown_language = 1
                 OTHERS           = 2.
    IF sy-subrc <> 0.
      ev_subrc = 8. ev_message = |SSF_RENDER: unknown language { ls_input-language }|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ELSEIF ls_input-language IS NOT INITIAL.
    lv_lang = ls_input-language(1).
  ENDIF.

  CALL FUNCTION 'ZMCP_SSF_RENDER'
    EXPORTING iv_formname = lv_form
              iv_params   = ls_input-params
              iv_language = lv_lang
              iv_device   = lv_dev
              iv_families = ls_input-families
    IMPORTING ev_subrc    = lv_subrc
              ev_message  = ev_message
              ev_result   = ev_result.
  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL. ev_result = '{}'. ENDIF.
ENDFORM.
