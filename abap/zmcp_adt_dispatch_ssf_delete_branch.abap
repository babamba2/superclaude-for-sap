* ZMCP_ADT_DISPATCH - action SSF_DELETE_FORM (MCP tool DeleteSmartForm).
*
* NOT a standalone object. A snippet to paste into the LIVE dispatcher of
* the target system - read and back up the live source first.
*
* Prerequisite: FM ZMCP_SSF_DELETE (abap/zmcp_ssf_delete.abap) active in
* function group ZMCP_ADT_UTILS. ECC / BASIS 7.40 only (/UI2/CL_JSON).
* WRITES: DEV systems only; deletes local ($) Z/Y forms only.
*
* params: form_name, confirm (X = delete; otherwise a dry run)
* result: EV_RESULT of ZMCP_SSF_DELETE {"form","package","fm","deleted"}

*======================================================================*
* 1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*    WHEN OTHERS:
*
*        WHEN 'SSF_DELETE_FORM'. PERFORM ssf_delete_form USING iv_params CHANGING ev_subrc ev_message ev_result.
*
* 2. Append at the end of the function group include:
*======================================================================*

*&---------------------------------------------------------------------*
*& Form SSF_DELETE_FORM - delete a local Z/Y SmartForm (ZMCP_SSF_DELETE)
*&---------------------------------------------------------------------*
FORM ssf_delete_form USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          form_name TYPE string,
          confirm   TYPE string,
        END OF ls_input.
  DATA: lv_subrc TYPE sysubrc,
        lv_conf  TYPE char1.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  IF ls_input-confirm = 'X' OR ls_input-confirm = 'true'. lv_conf = 'X'. ENDIF.
  CALL FUNCTION 'ZMCP_SSF_DELETE'
    EXPORTING iv_formname = CONV tdsfname( to_upper( condense( ls_input-form_name ) ) )
              iv_confirm  = lv_conf
    IMPORTING ev_subrc    = lv_subrc
              ev_message  = ev_message
              ev_result   = ev_result.
  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL. ev_result = '{}'. ENDIF.
ENDFORM.
