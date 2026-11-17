* ZMCP_ADT_DISPATCH - actions FP_CONTENT and FP_RENDER (Adobe forms).
*
* NOT a standalone object. A snippet to paste into the LIVE dispatcher of
* the target system - never deploy the repo copies of the dispatchers (they
* may be older than the system). Read and back up the live source first.
*
* Prerequisite: FM ZMCP_FP_CONTENT (abap/zmcp_fp_content.abap) exists and is
* active (function group ZMCP_FP). BASIS 7.40 or later (/UI2/CL_JSON).
*
* FP_CONTENT (MCP tool GetAdobeFormContent) - read only
*   params: part (FORM | LAYOUT | INTERFACE), name (the form, or the
*           interface for INTERFACE), language (1-char SAP key or 2-char ISO)
* FP_RENDER (MCP tool RenderAdobeForm) - the PDF from ADS, no spool
*   params: name (form), params (JSON array [{"name","json"}] as a string),
*           language
* result: EV_RESULT of ZMCP_FP_CONTENT unchanged
* subrc : 0 ok, 4 not found, 8 other error - EV_MESSAGE says why


*======================================================================*
* 1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*    WHEN OTHERS:
*
*        WHEN 'FP_CONTENT'.
*          PERFORM fp_call USING iv_params abap_false CHANGING ev_subrc ev_message ev_result.
*        WHEN 'FP_RENDER'.
*          PERFORM fp_call USING iv_params abap_true CHANGING ev_subrc ev_message ev_result.
*
*    and add to the "Supported actions" header comment:
*      FP_CONTENT - Adobe form XML / XDP / interface (ZMCP_FP_CONTENT)
*      FP_RENDER  - Adobe form PDF from ADS, no spool (ZMCP_FP_CONTENT)
*
* 2. Append at the end of the function group include:
*======================================================================*

*&---------------------------------------------------------------------*
*& Form FP_CALL - Adobe form content (FP_CONTENT) or ADS PDF (FP_RENDER)
*&---------------------------------------------------------------------*
FORM fp_call USING iv_params TYPE string iv_render TYPE abap_bool
             CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          part     TYPE string,
          name     TYPE string,
          language TYPE string,
          params   TYPE string,
        END OF ls_input.
  DATA: lv_name  TYPE fpname,
        lv_part  TYPE string,
        lv_lang  TYPE spras,
        lv_iso   TYPE laiso,
        lv_subrc TYPE sysubrc.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  ls_input-name = to_upper( condense( ls_input-name ) ).
  " FPNAME is CHAR 30: a longer name would be cut off silently and read another form.
  IF strlen( ls_input-name ) > 30.
    ev_subrc = 8. ev_message = |FP: form name longer than 30 characters|. ev_result = '{}'.
    RETURN.
  ENDIF.
  lv_name = ls_input-name.
  IF iv_render = abap_true.
    lv_part = 'RENDER'.
  ELSE.
    lv_part = to_upper( condense( ls_input-part ) ).
    IF lv_part = 'RENDER'.
      ev_subrc = 8. ev_message = |FP_CONTENT: use action FP_RENDER for the PDF|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ENDIF.
  ls_input-language = condense( ls_input-language ).
  IF strlen( ls_input-language ) = 2.
    lv_iso = to_upper( ls_input-language ).
    CALL FUNCTION 'CONVERSION_EXIT_ISOLA_INPUT'
      EXPORTING input            = lv_iso
      IMPORTING output           = lv_lang
      EXCEPTIONS unknown_language = 1
                 OTHERS           = 2.
    IF sy-subrc <> 0.
      ev_subrc = 8. ev_message = |FP: unknown language { ls_input-language }|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ELSEIF strlen( ls_input-language ) = 1.
    lv_lang = ls_input-language.
  ENDIF.

  CALL FUNCTION 'ZMCP_FP_CONTENT'
    EXPORTING
      iv_part     = lv_part
      iv_name     = lv_name
      iv_language = lv_lang
      iv_params   = ls_input-params
    IMPORTING
      ev_subrc    = lv_subrc
      ev_message  = ev_message
      ev_result   = ev_result.
  ev_subrc = lv_subrc.
ENDFORM.
