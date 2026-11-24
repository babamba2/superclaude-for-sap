FUNCTION zmcp_fp_delete
  IMPORTING
    VALUE(iv_name)    TYPE fpname
    VALUE(iv_kind)    TYPE string
    VALUE(iv_confirm) TYPE char1 OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_FP_DELETE - delete a local Z/Y Adobe form object (SFP): a form with
* its layout and generated function module, or an interface.
*
* Function group ZMCP_FP ($TMP), NOT remote-enabled - ZMCP_ADT_DISPATCH
* action FP_DELETE calls it (MCP tool DeleteAdobeForm). BASIS 7.40 or later
* (/UI2/CL_JSON). WRITES to the repository - DEV systems only.
*
* IV_KIND    FORM (R3TR SFPF) or INTERFACE (R3TR SFPI)
* IV_CONFIRM 'X' = delete; anything else = dry run (nothing changed, the
*            result says what would be deleted)
*
* Guards: development-type client only (T000-CCCATEGORY C / D / E; P, T, S
* and a client T000 cannot tell are refused); the name starts with Z or Y
* (letters, digits, _ and / only); the TADIR entry is in package $TMP -
* any other package is refused (SAP's delete removes TADIR only for $TMP;
* transportable objects belong on a transport: use SFP); an interface that
* a form still uses (FPCONTEXT) is refused and the forms are listed -
* delete the forms first. A FORM delete keeps its interface: delete it
* afterwards with kind INTERFACE.
*
* Deletion is SAP's own: CL_FP_WB_FORM=>DELETE (I_DARK = 'X', no dialog) /
* CL_FP_WB_INTERFACE=>DELETE - lock, active and inactive version, texts,
* documentation, working area, and for $TMP the TADIR entry; the form path
* also deletes the generated function module (FP_FUNCTION_DELETE). COMMIT
* WORK AND WAIT after success, ROLLBACK WORK when SAP raises (a commit made
* inside SAP's generator calls cannot be rolled back - a failed run can
* then leave a partly deleted object; the TADIR read-back reports it).
*
* EV_RESULT  {"name","kind","package","usedBy":[...],"deleted","tadirLeft"}
* EV_SUBRC   0 ok (deleted, or dry run), 4 refused / not found, 8 error

  TYPES: BEGIN OF ty_result,
           name      TYPE string,
           kind      TYPE string,
           package   TYPE string,
           used_by   TYPE string_table,
           deleted   TYPE abap_bool,
           tadir_left TYPE abap_bool,
         END OF ty_result.

  DATA: ls_result  TYPE ty_result,
        lv_name    TYPE fpname,
        lv_kind    TYPE string,
        lv_object  TYPE trobjtype,
        lv_objname TYPE tadir-obj_name,
        lv_devcl   TYPE devclass,
        lv_cat     TYPE t000-cccategory,
        lt_used    TYPE tfpname,
        lv_used    TYPE fpname,
        lv_list    TYPE string,
        lx_usage   TYPE REF TO cx_fp_api_usage,
        lx_repo    TYPE REF TO cx_fp_api_repository,
        lx_other   TYPE REF TO cx_root.

  ev_subrc = 0.
  CLEAR: ev_message.
  ev_result = '{}'.

  " Development-type clients only (customizing, demo, training).
  SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt.
  IF sy-subrc <> 0 OR ( lv_cat <> 'C' AND lv_cat <> 'D' AND lv_cat <> 'E' ).
    ev_subrc = 8.
    ev_message = |FP_DELETE: refused in client { sy-mandt } (role "{ lv_cat }") - development clients only|.
    RETURN.
  ENDIF.

  lv_name = to_upper( condense( iv_name ) ).
  IF lv_name IS INITIAL OR ( lv_name(1) <> 'Z' AND lv_name(1) <> 'Y' )
     OR NOT matches( val = CONV string( lv_name ) regex = `[A-Z0-9_/]+` ).
    ev_subrc = 4. ev_message = |FP_DELETE: only Z / Y names of letters, digits, _ and / ({ lv_name })|.
    RETURN.
  ENDIF.

  lv_kind = to_upper( condense( iv_kind ) ).
  CASE lv_kind.
    WHEN 'FORM'.      lv_object = 'SFPF'.
    WHEN 'INTERFACE'. lv_object = 'SFPI'.
    WHEN OTHERS.
      ev_subrc = 4. ev_message = |FP_DELETE: kind must be FORM or INTERFACE ({ lv_kind })|.
      RETURN.
  ENDCASE.

  lv_objname = lv_name.
  SELECT SINGLE devclass FROM tadir INTO lv_devcl
    WHERE pgmid = 'R3TR' AND object = lv_object AND obj_name = lv_objname.
  IF sy-subrc <> 0.
    ev_subrc = 4. ev_message = |FP_DELETE: { lv_kind } { lv_name } not found (no TADIR entry R3TR { lv_object })|.
    RETURN.
  ENDIF.
  " $TMP only: SAP's delete removes the TADIR entry only for $TMP (other $ packages would leave it).
  IF lv_devcl <> '$TMP'.
    ev_subrc = 4.
    ev_message = |FP_DELETE: { lv_name } is in package { lv_devcl } - only $TMP objects are deleted here (use SFP)|.
    RETURN.
  ENDIF.

  ls_result-name    = lv_name.
  ls_result-kind    = lv_kind.
  ls_result-package = lv_devcl.

  " An interface still used by a form is never deleted.
  IF lv_kind = 'INTERFACE'.
    SELECT name FROM fpcontext INTO TABLE lt_used WHERE interface = lv_name GROUP BY name.
    LOOP AT lt_used INTO lv_used.
      APPEND CONV string( lv_used ) TO ls_result-used_by.
    ENDLOOP.
    IF lt_used IS NOT INITIAL.
      lv_list = concat_lines_of( table = ls_result-used_by sep = `, ` ).
      ev_subrc = 4.
      ev_message = |FP_DELETE: interface { lv_name } is used by { lines( lt_used ) } form(s): { lv_list } - delete those first|.
      ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
      RETURN.
    ENDIF.
  ENDIF.

  IF iv_confirm <> 'X'.
    ev_message = |FP_DELETE: dry run - { lv_kind } { lv_name } ({ lv_devcl }) would be deleted|.
    ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
    RETURN.
  ENDIF.

  TRY.
      IF lv_kind = 'FORM'.
        cl_fp_wb_form=>delete( i_name = lv_name i_dark = abap_true ).
      ELSE.
        cl_fp_wb_interface=>delete( i_name = lv_name ).
      ENDIF.
    CATCH cx_fp_api_usage INTO lx_usage.
      ROLLBACK WORK.
      ev_subrc = 8. ev_message = |FP_DELETE: SAP refused the delete of { lv_name }: { lx_usage->get_text( ) }|.
      ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
      RETURN.
    CATCH cx_fp_api_repository INTO lx_repo.
      ROLLBACK WORK.
      ev_subrc = 8. ev_message = |FP_DELETE: SAP refused the delete of { lv_name }: { lx_repo->get_text( ) }|.
      ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
      RETURN.
    CATCH cx_root INTO lx_other.
      " e.g. CX_FP_API_INTERNAL from loading the object, not declared by DELETE
      ROLLBACK WORK.
      ev_subrc = 8. ev_message = |FP_DELETE: delete of { lv_name } failed: { lx_other->get_text( ) }|.
      ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
      RETURN.
  ENDTRY.
  COMMIT WORK AND WAIT.

  " Read back: the TADIR entry of a $TMP object must be gone.
  SELECT SINGLE devclass FROM tadir INTO lv_devcl
    WHERE pgmid = 'R3TR' AND object = lv_object AND obj_name = lv_objname.
  ls_result-tadir_left = xsdbool( sy-subrc = 0 ).
  ls_result-deleted    = abap_true.
  IF ls_result-tadir_left = abap_true.
    ev_message = |FP_DELETE: { lv_kind } { lv_name } deleted, but its TADIR entry is still there - check SE03|.
  ELSE.
    ev_message = |FP_DELETE: { lv_kind } { lv_name } deleted|.
  ENDIF.
  ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
ENDFUNCTION.
