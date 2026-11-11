FUNCTION zmcp_adt_ddic_ttyp
  IMPORTING
    VALUE(iv_action)       TYPE string
    VALUE(iv_name)         TYPE string
    VALUE(iv_devclass)     TYPE string OPTIONAL
    VALUE(iv_transport)    TYPE string OPTIONAL
    VALUE(iv_payload_json) TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_DDIC_TTYP — ECC 7.40 DDIC table type fallback (ECC-only).
* Same pattern as ZMCP_ADT_DDIC_TABL / _DTEL / _DOMA:
*   package <> $TMP: RS_CORR_INSERT → DDIF_TTYP_PUT →
*                    TR_RECORD_OBJ_CHANGE_TO_REQ → WB_TREE_ACTUALIZE
*   package  = $TMP: TR_TADIR_INTERFACE (local TADIR) → DDIF_TTYP_PUT
* Activation: ZMCP_ADT_DDIC_ACTIVATE type 'TTYP'.
*
* Payload JSON (CREATE / UPDATE):
*   { "dd40v": { "ROWTYPE":"ZSTRUC","ROWKIND":"S","ACCESSMODE":"T",
*                "KEYDEF":"D","KEYKIND":"N","DDTEXT":"..." },
*     "dd42v": [ { "KEYFDPOS":"0001","KEYFIELD":"VBELN" } ] }  " KEYDEF 'K' only
* Codes: ROWKIND E elementary / S structured / L table type / R reference;
*        ACCESSMODE T standard / S sorted / H hashed / I index / A any;
*        KEYDEF D standard key / T row type / K key components / G none;
*        KEYKIND N non-unique / U unique / G not specified.

  DATA: lv_name    TYPE ddobjname,
        ls_dd40v   TYPE dd40v,
        lt_dd42v   TYPE STANDARD TABLE OF dd42v WITH DEFAULT KEY,
        lv_objtype TYPE rsedd0-ddobjtype,
        lv_trkorr  TYPE e070-trkorr.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_name    = to_upper( iv_name ).
  lv_trkorr  = iv_transport.
  " RS_DD_DELETE_OBJ takes the one-letter EU type: A = table type.
  lv_objtype = 'A'.

  TRY.
      CASE iv_action.

        WHEN 'CREATE' OR 'UPDATE'.
          IF iv_payload_json IS INITIAL.
            ev_subrc   = 4.
            ev_message = 'iv_payload_json required for CREATE/UPDATE'.
            RETURN.
          ENDIF.

          IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP'.
            PERFORM register_corr_ttyp USING lv_name iv_devclass iv_transport
                                     CHANGING ev_subrc ev_message.
            IF ev_subrc <> 0.
              RETURN.
            ENDIF.
          ELSEIF iv_devclass = '$TMP'.
            PERFORM register_local_ttyp USING lv_name
                                        CHANGING ev_subrc ev_message.
            IF ev_subrc <> 0.
              RETURN.
            ENDIF.
          ENDIF.

          DATA: BEGIN OF ls_payload_y,
                  dd40v TYPE dd40v,
                  dd42v TYPE STANDARD TABLE OF dd42v WITH DEFAULT KEY,
                END OF ls_payload_y.

          /ui2/cl_json=>deserialize(
            EXPORTING json = iv_payload_json
            CHANGING  data = ls_payload_y ).

          ls_dd40v = ls_payload_y-dd40v.
          lt_dd42v = ls_payload_y-dd42v.
          ls_dd40v-typename   = lv_name.
          ls_dd40v-ddlanguage = sy-langu.
          LOOP AT lt_dd42v ASSIGNING FIELD-SYMBOL(<ls_key>).
            <ls_key>-typename = lv_name.
          ENDLOOP.

          CALL FUNCTION 'DDIF_TTYP_PUT'
            EXPORTING
              name              = lv_name
              dd40v_wa          = ls_dd40v
            TABLES
              dd42v_tab         = lt_dd42v
            EXCEPTIONS
              ttyp_not_found    = 1
              name_inconsistent = 2
              ttyp_inconsistent = 3
              put_failure       = 4
              put_refused       = 5
              error_message     = 7
              OTHERS            = 6.

          ev_subrc = sy-subrc.
          IF sy-subrc <> 0.
            IF sy-msgid IS NOT INITIAL.
              MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
                      WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO DATA(lv_msg).
              ev_message = |DDIF_TTYP_PUT failed (sy-subrc={ ev_subrc }): { sy-msgid } { sy-msgno } { lv_msg }|.
            ELSE.
              ev_message = |DDIF_TTYP_PUT failed (sy-subrc={ ev_subrc })|.
            ENDIF.
            RETURN.
          ENDIF.

          IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP' AND iv_transport IS NOT INITIAL.
            PERFORM record_to_req_ttyp USING lv_name iv_devclass iv_transport
                                     CHANGING ev_subrc ev_message.
            IF ev_subrc <> 0.
              RETURN.
            ENDIF.
          ENDIF.

          IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP'.
            PERFORM refresh_wb_tree_ttyp USING iv_devclass.
          ENDIF.

          ev_subrc   = 0.
          ev_message = |Table type { lv_name } staged inactive; call ZMCP_ADT_DDIC_ACTIVATE to activate|.
          ev_result  = |\{"saved":true,"state":"I","name":"{ lv_name }"\}|.

        WHEN 'DELETE'.
          CALL FUNCTION 'RS_DD_DELETE_OBJ'
            EXPORTING
              no_ask               = 'X'
              objname              = lv_name
              objtype              = lv_objtype
            CHANGING
              corrnum              = lv_trkorr
            EXCEPTIONS
              not_executed         = 1
              object_not_found     = 2
              object_not_specified = 3
              permission_failure   = 4
              dialog_needed        = 5
              OTHERS               = 6.

          ev_subrc = sy-subrc.
          IF sy-subrc <> 0.
            ev_message = |RS_DD_DELETE_OBJ failed for TTYP { lv_name } (sy-subrc={ sy-subrc })|.
          ELSE.
            IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP'.
              PERFORM refresh_wb_tree_ttyp USING iv_devclass.
            ENDIF.
            ev_message = |Table type { lv_name } deleted|.
            ev_result  = |\{"deleted":true,"name":"{ lv_name }"\}|.
          ENDIF.

        WHEN OTHERS.
          ev_subrc   = 4.
          ev_message = |Unknown action: { iv_action }. Use CREATE / UPDATE / DELETE.|.

      ENDCASE.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.


FORM register_corr_ttyp
  USING iv_name      TYPE ddobjname
        iv_devclass  TYPE string
        iv_transport TYPE string
  CHANGING ev_subrc   TYPE i
           ev_message TYPE string.

  DATA: lv_object   TYPE e071-obj_name,
        lv_devclass TYPE tadir-devclass,
        lv_korrnum  TYPE e070-trkorr,
        lv_ret_dev  TYPE tadir-devclass,
        lv_ret_korr TYPE e070-trkorr,
        lv_ret_ord  TYPE e070-trkorr,
        lv_ret_auth TYPE sy-uname.

  lv_object   = iv_name.
  lv_devclass = iv_devclass.
  lv_korrnum  = iv_transport.

  TRY.
      CALL FUNCTION 'RS_CORR_INSERT'
        EXPORTING
          object                    = lv_object
          object_class              = 'TTYP'
          mode                      = 'I'
          global_lock               = 'X'
          devclass                  = lv_devclass
          korrnum                   = lv_korrnum
          use_korrnum_immediatedly  = 'X'
          master_language           = sy-langu
          suppress_dialog           = 'X'
        IMPORTING
          devclass                  = lv_ret_dev
          korrnum                   = lv_ret_korr
          ordernum                  = lv_ret_ord
          author                    = lv_ret_auth
        EXCEPTIONS
          cancelled                 = 1
          permission_failure        = 2
          unknown_objectclass       = 3
          OTHERS                    = 4.

      IF sy-subrc <> 0.
        ev_subrc   = sy-subrc.
        ev_message = |RS_CORR_INSERT failed for { iv_name } (sy-subrc={ sy-subrc } msgno={ sy-msgno } { sy-msgv1 } { sy-msgv2 } { sy-msgv3 } { sy-msgv4 })|.
        RETURN.
      ENDIF.

      ev_subrc = 0.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = |RS_CORR_INSERT exception: { lx_root->get_text( ) }|.
  ENDTRY.

ENDFORM.


FORM register_local_ttyp
  USING iv_name    TYPE ddobjname
  CHANGING ev_subrc   TYPE i
           ev_message TYPE string.

  DATA lv_obj_name TYPE tadir-obj_name.
  lv_obj_name = iv_name.

  CALL FUNCTION 'TR_TADIR_INTERFACE'
    EXPORTING
      wi_test_modus       = ' '
      wi_tadir_pgmid      = 'R3TR'
      wi_tadir_object     = 'TTYP'
      wi_tadir_obj_name   = lv_obj_name
      wi_tadir_devclass   = '$TMP'
      wi_tadir_masterlang = sy-langu
      wi_tadir_author     = sy-uname
    EXCEPTIONS
      error_message       = 98
      OTHERS              = 99.

  IF sy-subrc <> 0.
    ev_subrc = sy-subrc.
    IF sy-msgid IS NOT INITIAL.
      MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
              WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO DATA(lv_msg).
      ev_message = |TR_TADIR_INTERFACE failed for { iv_name }: { sy-msgid } { sy-msgno } { lv_msg }|.
    ELSE.
      ev_message = |TR_TADIR_INTERFACE failed for { iv_name } (sy-subrc={ ev_subrc })|.
    ENDIF.
    RETURN.
  ENDIF.
  ev_subrc = 0.

ENDFORM.


FORM record_to_req_ttyp
  USING iv_name      TYPE ddobjname
        iv_devclass  TYPE string
        iv_transport TYPE string
  CHANGING ev_subrc   TYPE i
           ev_message TYPE string.

  DATA: lv_trkorr  TYPE trkorr,
        lt_objects TYPE tredt_objects,
        ls_ko200   TYPE ko200,
        lt_tadir   TYPE scts_tadir,
        lv_cnt     TYPE i.

  lv_trkorr = iv_transport.
  ls_ko200-pgmid      = 'R3TR'.
  ls_ko200-object     = 'TTYP'.
  ls_ko200-obj_name   = iv_name.
  ls_ko200-author     = sy-uname.
  ls_ko200-masterlang = sy-langu.
  ls_ko200-devclass   = iv_devclass.
  ls_ko200-operation  = 'I'.
  APPEND ls_ko200 TO lt_objects.

  TRY.
      CALL FUNCTION 'TR_RECORD_OBJ_CHANGE_TO_REQ'
        EXPORTING
          iv_request = lv_trkorr
          it_objects = lt_objects
        IMPORTING
          et_tadir   = lt_tadir
        EXCEPTIONS
          cancel     = 1
          OTHERS     = 2.

      IF sy-subrc <> 0.
        ev_subrc   = sy-subrc.
        ev_message = |TR_RECORD_OBJ_CHANGE_TO_REQ failed for { iv_name } (sy-subrc={ sy-subrc } msgno={ sy-msgno } { sy-msgv1 } { sy-msgv2 } { sy-msgv3 } { sy-msgv4 })|.
        RETURN.
      ENDIF.

      lv_cnt = lines( lt_tadir ).
      ev_subrc = 0.
      ev_message = |Recorded { lv_cnt } TADIR entries for TTYP { iv_name } -> { iv_transport }|.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = |TR_RECORD_OBJ_CHANGE_TO_REQ exception: { lx_root->get_text( ) }|.
  ENDTRY.

ENDFORM.


FORM refresh_wb_tree_ttyp USING iv_devclass TYPE string.

  DATA: lv_tree_name TYPE string,
        lv_syntax    TYPE flag.

  lv_tree_name = |EU_{ iv_devclass }|.

  TRY.
      CALL FUNCTION 'WB_TREE_ACTUALIZE'
        EXPORTING
          tree_name              = lv_tree_name
          without_crossreference = 'X'
        IMPORTING
          syntax_error           = lv_syntax.

    CATCH cx_root.                                   "#EC NO_HANDLER
  ENDTRY.

ENDFORM.
