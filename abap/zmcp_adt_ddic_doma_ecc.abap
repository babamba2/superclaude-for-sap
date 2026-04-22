FUNCTION zmcp_adt_ddic_doma
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

* ZMCP_ADT_DDIC_DOMA — ECC 7.40 DDIC domain fallback (ECC-only).
*
* Scope: lets the MCP client create/update/delete domains on ECC where
* the native ADT handler does not cover DDIC writes. S/4HANA uses ADT
* directly and does NOT install this FM.
*
* Actions:
*   CREATE / UPDATE — writes inactive; caller invokes
*                     ZMCP_ADT_DDIC_ACTIVATE(type='DOMA') next.
*   DELETE          — deletes via RS_DD_DELETE_OBJ.
*
* Package / transport strategy:
*   iv_devclass blank or '$TMP' → PUT only; DDIF_DOMA_ACTIVATE creates
*     the TADIR entry automatically (local $TMP).
*   iv_devclass = real package (non-$TMP):
*     1. RS_CORR_INSERT            — creates TADIR with package+author
*     2. DDIF_DOMA_PUT             — stages inactive version
*     3. TR_RECORD_OBJ_CHANGE_TO_REQ — appends object to transport
*     4. WB_TREE_ACTUALIZE         — refreshes SE80 object-tree cache
*                                     (EU_<package>) so the new object
*                                     appears without manual Ctrl+F5
*     5. Caller invokes ZMCP_ADT_DDIC_ACTIVATE separately.
*
* Payload JSON (CREATE / UPDATE):
*   {
*     "dd01v": { "DOMNAME":"Y...","DDLANGUAGE":"E",
*                "DATATYPE":"CHAR","LENG":"000010",
*                "OUTPUTLEN":"000010","DDTEXT":"..." },
*     "dd07v": [ { "VALPOS":"0001","DOMVALUE_L":"A","DDTEXT":"Alpha" } ]
*   }

  DATA: lv_name    TYPE ddobjname,
        ls_dd01v   TYPE dd01v,
        lt_dd07v   TYPE STANDARD TABLE OF dd07v WITH DEFAULT KEY,
        lv_objtype TYPE rsedd0-ddobjtype,
        lv_trkorr  TYPE e070-trkorr.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_name    = to_upper( iv_name ).
  lv_trkorr  = iv_transport.
  lv_objtype = 'DOMA'.

  TRY.
      CASE iv_action.

        WHEN 'CREATE' OR 'UPDATE'.
          IF iv_payload_json IS INITIAL.
            ev_subrc   = 4.
            ev_message = 'iv_payload_json required for CREATE/UPDATE'.
            RETURN.
          ENDIF.

          IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP'.
            PERFORM register_corr_doma USING lv_name iv_devclass iv_transport
                                     CHANGING ev_subrc ev_message.
            IF ev_subrc <> 0.
              RETURN.
            ENDIF.
          ENDIF.

          DATA: BEGIN OF ls_payload_d,
                  dd01v TYPE dd01v,
                  dd07v TYPE STANDARD TABLE OF dd07v WITH DEFAULT KEY,
                END OF ls_payload_d.

          /ui2/cl_json=>deserialize(
            EXPORTING json = iv_payload_json
            CHANGING  data = ls_payload_d ).

          ls_dd01v = ls_payload_d-dd01v.
          lt_dd07v = ls_payload_d-dd07v.
          ls_dd01v-domname = lv_name.

          LOOP AT lt_dd07v ASSIGNING FIELD-SYMBOL(<ls_fv>).
            <ls_fv>-domname = lv_name.
          ENDLOOP.

          CALL FUNCTION 'DDIF_DOMA_PUT'
            EXPORTING
              name              = lv_name
              dd01v_wa          = ls_dd01v
            TABLES
              dd07v_tab         = lt_dd07v
            EXCEPTIONS
              doma_not_found    = 1
              name_inconsistent = 2
              doma_inconsistent = 3
              put_failure       = 4
              put_refused       = 5
              OTHERS            = 6.

          ev_subrc = sy-subrc.
          IF sy-subrc <> 0.
            ev_message = |DDIF_DOMA_PUT failed (sy-subrc={ sy-subrc })|.
            RETURN.
          ENDIF.

          IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP' AND iv_transport IS NOT INITIAL.
            PERFORM record_to_req_doma USING lv_name iv_devclass iv_transport
                                     CHANGING ev_subrc ev_message.
            IF ev_subrc <> 0.
              RETURN.
            ENDIF.
          ENDIF.

          IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP'.
            PERFORM refresh_wb_tree_doma USING iv_devclass.
          ENDIF.

          ev_subrc   = 0.
          ev_message = |Domain { lv_name } staged inactive; call ZMCP_ADT_DDIC_ACTIVATE to activate|.
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
            ev_message = |RS_DD_DELETE_OBJ failed for DOMA { lv_name } (sy-subrc={ sy-subrc })|.
          ELSE.
            IF iv_devclass IS NOT INITIAL AND iv_devclass <> '$TMP'.
              PERFORM refresh_wb_tree_doma USING iv_devclass.
            ENDIF.
            ev_message = |Domain { lv_name } deleted|.
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


*&---------------------------------------------------------------------*
*& Form register_corr_doma — TADIR + package via RS_CORR_INSERT
*&---------------------------------------------------------------------*
FORM register_corr_doma
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
          object_class              = 'DOMA'
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


*&---------------------------------------------------------------------*
*& Form record_to_req_doma — append to transport request
*&---------------------------------------------------------------------*
FORM record_to_req_doma
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
  ls_ko200-object     = 'DOMA'.
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
      ev_message = |Recorded { lv_cnt } TADIR entries for DOMA { iv_name } -> { iv_transport }|.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = |TR_RECORD_OBJ_CHANGE_TO_REQ exception: { lx_root->get_text( ) }|.
  ENDTRY.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form refresh_wb_tree_doma — SE80 object tree cache refresh
*&---------------------------------------------------------------------*
* Calls WB_TREE_ACTUALIZE (FG SEWB) with TREE_NAME='EU_<package>' to
* regenerate the Repository Browser object list + index for the
* package, so newly staged / deleted DDIC objects appear without the
* user having to Ctrl+F5 in SE80. Best-effort: any failure here is
* swallowed since the DDIC object itself is already persisted and the
* sole purpose of this call is cache refresh.
FORM refresh_wb_tree_doma USING iv_devclass TYPE string.

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
