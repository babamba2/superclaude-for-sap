FUNCTION zmcp_ssf_delete
  IMPORTING
    VALUE(iv_formname) TYPE tdsfname
    VALUE(iv_confirm)  TYPE char1 OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_SSF_DELETE - delete a local Z/Y SmartForm (form, its generated
* function module, the TADIR entry).
*
* Function group ZMCP_ADT_UTILS, NOT remote-enabled - ZMCP_ADT_DISPATCH
* action SSF_DELETE_FORM calls it (MCP tool DeleteSmartForm). ECC / BASIS
* 7.40 (/UI2/CL_JSON). WRITES to the repository - DEV systems only.
*
* Guards: the name starts with Z or Y; the form is in a local package ($...)
* - a transportable form is refused (delete it in SMARTFORMS, the deletion
* belongs on a transport); without IV_CONFIRM = 'X' nothing is deleted and
* the result says what would be.
*
* EV_RESULT  {"form","package","fm","deleted"}
* EV_SUBRC   0 ok (deleted, or dry run), 4 refused / not found, 8 error

  TYPES: BEGIN OF ty_result,
           form    TYPE string,
           package TYPE string,
           fm      TYPE string,
           deleted TYPE abap_bool,
         END OF ty_result.

  DATA: ls_result   TYPE ty_result,
        lv_form     TYPE tdsfname,
        lv_formtype TYPE tdsftype,
        lv_devclass TYPE devclass,
        lv_fm       TYPE rs38l_fnam,
        lv_objname  TYPE tadir-obj_name,
        lv_rc       TYPE sysubrc.

  ev_subrc = 0.
  CLEAR: ev_message, ev_result.
  ev_result = '{}'.

  lv_form = to_upper( condense( iv_formname ) ).
  IF lv_form IS INITIAL OR ( lv_form(1) <> 'Z' AND lv_form(1) <> 'Y' ).
    ev_subrc = 4. ev_message = |SSF_DELETE: only Z / Y forms ({ lv_form })|.
    RETURN.
  ENDIF.

  SELECT SINGLE formtype FROM stxfadm INTO lv_formtype WHERE formname = lv_form.
  IF sy-subrc <> 0.
    ev_subrc = 4. ev_message = |SSF_DELETE: form { lv_form } not found|.
    RETURN.
  ENDIF.
  lv_objname = lv_form.
  SELECT SINGLE devclass FROM tadir INTO lv_devclass
    WHERE pgmid = 'R3TR' AND object = 'SSFO' AND obj_name = lv_objname.
  IF lv_devclass IS INITIAL OR lv_devclass(1) <> '$'.
    ev_subrc = 4.
    ev_message = |SSF_DELETE: { lv_form } is in package { lv_devclass } - only local forms are deleted here (use SMARTFORMS with a transport)|.
    RETURN.
  ENDIF.

  CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
    EXPORTING formname = lv_form
    IMPORTING fm_name  = lv_fm
    EXCEPTIONS OTHERS  = 1.

  ls_result-form    = lv_form.
  ls_result-package = lv_devclass.
  ls_result-fm      = lv_fm.

  IF iv_confirm <> 'X'.
    ev_message = |SSF_DELETE: dry run - { lv_form } ({ lv_devclass }) would be deleted|.
    ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    RETURN.
  ENDIF.

  " the form with its generated function module, no dialogs
  CALL FUNCTION 'FB_DELETE_FORM'
    EXPORTING  i_formname            = lv_form
               i_formtype            = lv_formtype
               i_with_dialog         = space
               i_with_confirm_dialog = space
    EXCEPTIONS no_name               = 1
               no_form               = 2
               form_locked           = 3
               no_access_permission  = 4
               illegal_language      = 5
               illegal_formtype      = 6
               OTHERS                = 7.
  lv_rc = sy-subrc.
  IF lv_rc <> 0 AND lv_rc <> 2.
    MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
    ev_subrc = 8. ev_message = |SSF_DELETE: FB_DELETE_FORM failed ({ lv_rc }): { ev_message }|.
    RETURN.
  ENDIF.

  CALL FUNCTION 'TR_TADIR_INTERFACE'
    EXPORTING  wi_test_modus         = space
               wi_delete_tadir_entry = 'X'
               wi_tadir_pgmid        = 'R3TR'
               wi_tadir_object       = 'SSFO'
               wi_tadir_obj_name     = lv_objname
    EXCEPTIONS OTHERS                = 1.
  COMMIT WORK.

  ls_result-deleted = abap_true.
  ev_message = |SSF_DELETE: { lv_form } deleted|.
  ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
ENDFUNCTION.
