* ZMCP_ADT_DISPATCH - action FP_DELETE (MCP tool DeleteAdobeForm).
*
* NOT a standalone object. A snippet to paste into the LIVE dispatcher of
* the target system - never deploy the repo copies of the dispatchers (they
* may be older than the system). Read and back up the live source first.
*
* Prerequisite: FM ZMCP_FP_DELETE (abap/zmcp_fp_delete.abap) active in
* function group ZMCP_FP. BASIS 7.40 or later (/UI2/CL_JSON).
* WRITES: DEV systems only; deletes Z/Y form objects of package $TMP only.
*
* params: name, kind (FORM | INTERFACE), confirm (X = delete; otherwise a
*         dry run)
* result: EV_RESULT of ZMCP_FP_DELETE
*         {"name","kind","package","usedBy","deleted","tadirLeft"}

*======================================================================*
* 1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*    WHEN OTHERS:
*
*        WHEN 'FP_DELETE'.
*          PERFORM fp_delete_call USING iv_params CHANGING ev_subrc ev_message ev_result.
*
*    and add to the "Supported actions" header comment:
*      FP_DELETE - delete a local Z/Y Adobe form or interface (ZMCP_FP_DELETE)
*
* 2. Append at the end of the function group include:
*======================================================================*

*&---------------------------------------------------------------------*
*& Form FP_DELETE_CALL - delete a $TMP Z/Y Adobe form / interface
*&---------------------------------------------------------------------*
FORM fp_delete_call USING iv_params TYPE string
                    CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          name    TYPE string,
          kind    TYPE string,
          confirm TYPE string,
        END OF ls_input.
  DATA: lv_subrc TYPE sysubrc,
        lv_conf  TYPE char1.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  IF strlen( condense( ls_input-name ) ) > 30.
    ev_subrc = 4. ev_message = |FP_DELETE: name longer than 30 characters|. ev_result = '{}'.
    RETURN.
  ENDIF.
  IF ls_input-confirm = 'X' OR ls_input-confirm = 'true'. lv_conf = 'X'. ENDIF.
  " every other check (client, name, package, users of an interface) is in ZMCP_FP_DELETE
  CALL FUNCTION 'ZMCP_FP_DELETE'
    EXPORTING iv_name    = CONV fpname( to_upper( condense( ls_input-name ) ) )
              iv_kind    = ls_input-kind
              iv_confirm = lv_conf
    IMPORTING ev_subrc   = lv_subrc
              ev_message = ev_message
              ev_result  = ev_result.
  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL. ev_result = '{}'. ENDIF.
ENDFORM.
