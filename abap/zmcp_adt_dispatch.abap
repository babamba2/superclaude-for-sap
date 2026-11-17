FUNCTION zmcp_adt_dispatch
  IMPORTING
    VALUE(iv_action) TYPE string
    VALUE(iv_params) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_DISPATCH - JSON-based dispatcher for Screen/GUI Status operations
* Called via SOAP RFC from mcp-abap-adt MCP server.
*
* Inline FUNCTION signature: the ADT REST API used by the installer
* rejects the `*"Local Interface:` comment block.
* Screen and GUI status FM interfaces are the same as on ECC 7.40:
*   RPY_DYNPRO_INSERT / READ - CONTAINERS TYPE DYCATT_TAB,
*     FIELDS_TO_CONTAINERS TYPE DYFATC_TAB, FLOW_LOGIC TYPE RPY_DYFLOW
*     (RPY_DYFIELD does not exist).
*   RS_CUA_INTERNAL_FETCH / WRITE - TIT typed RSMPE_TITT; WRITE needs
*     the mandatory TR_KEY (TRKEY).
*
* Supported actions:
*   DYNPRO_INSERT  - Create screen (RPY_DYNPRO_INSERT)
*   DYNPRO_READ    - Read screen (RPY_DYNPRO_READ)
*   DYNPRO_DELETE  - Delete screen (RPY_DYNPRO_DELETE)
*   CUA_FETCH      - Read GUI status (RS_CUA_INTERNAL_FETCH)
*   CUA_WRITE      - Write GUI status (RS_CUA_INTERNAL_WRITE)
*   CUA_DELETE     - Delete GUI status (RS_CUA_DELETE)

* BIZ_EXECUTE    - business action, forwards to ZMCP_BIZ_EXECUTE (FORM biz_execute)
* FM_PROXY       - calls an allow-listed helper FM that is not remote-enabled,
*                  for RFC clients (NCo backend) (FORM fm_proxy)
* REMOTE_READ    - read-only rows of one table in another system through an
*                  SM59 ABAP destination with RFC_READ_TABLE (FORM remote_read)

  CLEAR: ev_subrc, ev_message, ev_result.

  TRY.
      CASE iv_action.
        WHEN 'DYNPRO_INSERT'.
          PERFORM dynpro_insert USING iv_params
                                CHANGING ev_subrc ev_message ev_result.
        WHEN 'DYNPRO_READ'.
          PERFORM dynpro_read USING iv_params
                              CHANGING ev_subrc ev_message ev_result.
        WHEN 'DYNPRO_DELETE'.
          PERFORM dynpro_delete USING iv_params
                                CHANGING ev_subrc ev_message ev_result.
        WHEN 'CUA_FETCH'.
          PERFORM cua_fetch USING iv_params
                            CHANGING ev_subrc ev_message ev_result.
        WHEN 'CUA_WRITE'.
          PERFORM cua_write USING iv_params
                            CHANGING ev_subrc ev_message ev_result.
        WHEN 'CUA_DELETE'.
          PERFORM cua_delete USING iv_params
                             CHANGING ev_subrc ev_message ev_result.
        WHEN 'BIZ_EXECUTE'.
          PERFORM biz_execute USING iv_params
                              CHANGING ev_subrc ev_message ev_result.
        WHEN 'FM_PROXY'.
          PERFORM fm_proxy USING iv_params
                           CHANGING ev_subrc ev_message ev_result.
        WHEN 'REMOTE_READ'.
          PERFORM remote_read USING iv_params
                              CHANGING ev_subrc ev_message ev_result.
        WHEN OTHERS.
          ev_subrc = 4.
          ev_message = |Unknown action: { iv_action }|.
      ENDCASE.
    CATCH cx_root INTO DATA(lx_root).
      ev_subrc = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.


*&---------------------------------------------------------------------*
*& Form DYNPRO_INSERT
*&---------------------------------------------------------------------*
* params: program, dynpro, dynpro_data (JSON string, the shape
*         DYNPRO_READ returns: HEADER / CONTAINERS / FIELDS_TO_CONTAINERS /
*         FLOW_LOGIC = [{LINE}]).
* RPY_DYNPRO_INSERT interface (ECC 7.40 and S/4HANA):
*   HEADER LIKE RPY_DYHEAD, CONTAINERS TYPE DYCATT_TAB,
*   FIELDS_TO_CONTAINERS TYPE DYFATC_TAB, FLOW_LOGIC LIKE RPY_DYFLOW
*   (one component LINE CHAR 72) - all mandatory; PARAMS optional.
* SUPPRESS_EXIST_CHECKS = 'X', so an existing
* screen is overwritten (UpdateScreen deletes it first anyway). Because
* that flag also skips the TRDIR check, the program is checked here.
FORM dynpro_insert USING iv_params TYPE string
                   CHANGING ev_subrc   TYPE i
                            ev_message TYPE string
                            ev_result  TYPE string.

  TYPES: BEGIN OF ty_flow_in,
           line TYPE string,
         END OF ty_flow_in,
         ty_flow_in_tab TYPE STANDARD TABLE OF ty_flow_in WITH DEFAULT KEY.

  DATA: BEGIN OF ls_input,
          program     TYPE string,
          dynpro      TYPE string,
          dynpro_data TYPE string,
        END OF ls_input.

  DATA: BEGIN OF ls_dynpro,
          header               TYPE rpy_dyhead,
          containers           TYPE dycatt_tab,
          fields_to_containers TYPE dyfatc_tab,
          flow_logic           TYPE ty_flow_in_tab,
        END OF ls_dynpro.

  DATA: lt_flow    TYPE STANDARD TABLE OF rpy_dyflow WITH DEFAULT KEY,
        ls_flow    TYPE rpy_dyflow,
        ls_flow_in TYPE ty_flow_in,
        lv_lineno  TYPE i,
        lv_name    TYPE trdir-name,
        lv_sap_msg TYPE string.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  /ui2/cl_json=>deserialize(
    EXPORTING json = ls_input-dynpro_data
    CHANGING  data = ls_dynpro ).

  " Screen key: fall back to the call parameters, program in upper case.
  IF ls_dynpro-header-program IS INITIAL.
    ls_dynpro-header-program = ls_input-program.
  ENDIF.
  IF ls_dynpro-header-screen IS INITIAL.
    ls_dynpro-header-screen = ls_input-dynpro.
  ENDIF.
  TRANSLATE ls_dynpro-header-program TO UPPER CASE.

  SELECT SINGLE name FROM trdir INTO lv_name
    WHERE name = ls_dynpro-header-program.
  IF sy-subrc <> 0.
    ev_subrc   = 4.
    ev_message = |Program { ls_dynpro-header-program } does not exist|.
    RETURN.
  ENDIF.

  " Flow logic: text lines -> RPY_DYFLOW (LINE CHAR 72). Trailing blanks
  " and CR (CRLF input) are dropped; a longer line is rejected, not cut.
  LOOP AT ls_dynpro-flow_logic INTO ls_flow_in.
    lv_lineno = sy-tabix.
    ls_flow_in-line = replace( val = ls_flow_in-line regex = `\s+$` with = `` ).
    IF strlen( ls_flow_in-line ) > 72.
      ev_subrc   = 4.
      ev_message = |Flow logic line { lv_lineno } is longer than 72 characters|.
      RETURN.
    ENDIF.
    ls_flow-line = ls_flow_in-line.
    APPEND ls_flow TO lt_flow.
  ENDLOOP.

  CALL FUNCTION 'RPY_DYNPRO_INSERT'
    EXPORTING
      header                 = ls_dynpro-header
      suppress_exist_checks  = abap_true
    TABLES
      containers             = ls_dynpro-containers
      fields_to_containers   = ls_dynpro-fields_to_containers
      flow_logic             = lt_flow
    EXCEPTIONS
      cancelled              = 1
      already_exists         = 2
      program_not_exists     = 3
      not_executed           = 4
      missing_required_field = 5
      illegal_field_value    = 6
      field_not_allowed      = 7
      not_generated          = 8
      illegal_field_position = 9
      OTHERS                 = 10.

  ev_subrc = sy-subrc.
  IF ev_subrc <> 0.
    IF sy-msgid IS NOT INITIAL.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_sap_msg.
    ENDIF.
    IF ev_subrc = 8.
      " The screen is already stored; only GENERATE DYNPRO failed.
      ev_message = |Screen { ls_dynpro-header-program }/{ ls_dynpro-header-screen } saved but not generated (sy-subrc=8)|.
    ELSE.
      ev_message = |RPY_DYNPRO_INSERT failed (sy-subrc={ ev_subrc })|.
    ENDIF.
    IF lv_sap_msg IS NOT INITIAL.
      ev_message = |{ ev_message }: { lv_sap_msg }|.
    ENDIF.
  ELSE.
    ev_message = |Screen { ls_dynpro-header-program }/{ ls_dynpro-header-screen } created|.
    ev_result  = '{}'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form DYNPRO_READ
*&---------------------------------------------------------------------*
FORM dynpro_read USING iv_params TYPE string
                 CHANGING ev_subrc   TYPE i
                          ev_message TYPE string
                          ev_result  TYPE string.

  DATA: BEGIN OF ls_input,
          program TYPE string,
          dynpro  TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  DATA: ls_header TYPE rpy_dyhead,
        lt_cont   TYPE dycatt_tab,
        lt_fields TYPE dyfatc_tab,
        lt_flow   TYPE STANDARD TABLE OF rpy_dyflow WITH DEFAULT KEY.

  CALL FUNCTION 'RPY_DYNPRO_READ'
    EXPORTING
      progname             = CONV syrepid( to_upper( ls_input-program ) )
      dynnr                = CONV sydynnr( ls_input-dynpro )
    IMPORTING
      header               = ls_header
    TABLES
      containers           = lt_cont
      fields_to_containers = lt_fields
      flow_logic           = lt_flow
    EXCEPTIONS
      cancelled            = 1
      not_found            = 2
      permission_error     = 3
      OTHERS               = 4.

  ev_subrc = sy-subrc.
  IF sy-subrc <> 0.
    ev_message = |RPY_DYNPRO_READ failed (sy-subrc={ sy-subrc })|.
  ELSE.
    DATA: BEGIN OF ls_result,
            header               TYPE rpy_dyhead,
            containers           TYPE dycatt_tab,
            fields_to_containers TYPE dyfatc_tab,
            flow_logic           TYPE STANDARD TABLE OF rpy_dyflow WITH DEFAULT KEY,
          END OF ls_result.
    ls_result-header               = ls_header.
    ls_result-containers           = lt_cont.
    ls_result-fields_to_containers = lt_fields.
    ls_result-flow_logic           = lt_flow.
    ev_result  = /ui2/cl_json=>serialize( data = ls_result ).
    ev_message = 'OK'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form DYNPRO_DELETE
*&---------------------------------------------------------------------*
FORM dynpro_delete USING iv_params TYPE string
                   CHANGING ev_subrc   TYPE i
                            ev_message TYPE string
                            ev_result  TYPE string.

  DATA: BEGIN OF ls_input,
          program TYPE string,
          dynpro  TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  CALL FUNCTION 'RPY_DYNPRO_DELETE'
    EXPORTING
      progname         = CONV syrepid( to_upper( ls_input-program ) )
      dynnr            = CONV sydynnr( ls_input-dynpro )
    EXCEPTIONS
      cancelled        = 1
      not_found        = 2
      permission_error = 3
      OTHERS           = 4.

  ev_subrc = sy-subrc.
  IF sy-subrc <> 0.
    ev_message = |RPY_DYNPRO_DELETE failed (sy-subrc={ sy-subrc })|.
  ELSE.
    ev_message = |Screen { ls_input-program }/{ ls_input-dynpro } deleted|.
    ev_result  = '{}'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form CUA_FETCH
*&---------------------------------------------------------------------*
FORM cua_fetch USING iv_params TYPE string
               CHANGING ev_subrc TYPE i
                        ev_message TYPE string
                        ev_result TYPE string.

  DATA: BEGIN OF ls_input,
          program TYPE string,
          language TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  DATA: ls_adm    TYPE rsmpe_adm,
        lt_sta    TYPE TABLE OF rsmpe_stat,
        lt_fun    TYPE TABLE OF rsmpe_funt,
        lt_men    TYPE TABLE OF rsmpe_men,
        lt_mtx    TYPE TABLE OF rsmpe_mnlt,
        lt_act    TYPE TABLE OF rsmpe_act,
        lt_but    TYPE TABLE OF rsmpe_but,
        lt_pfk    TYPE TABLE OF rsmpe_pfk,
        lt_set    TYPE TABLE OF rsmpe_staf,
        lt_doc    TYPE TABLE OF rsmpe_atrt,
        lt_tit    TYPE TABLE OF rsmpe_titt,
        lt_biv    TYPE TABLE OF rsmpe_buts.

  DATA: lv_lang TYPE sy-langu.
  IF ls_input-language IS NOT INITIAL.
    lv_lang = ls_input-language(1).
  ELSE.
    lv_lang = sy-langu.
  ENDIF.

  CALL FUNCTION 'RS_CUA_INTERNAL_FETCH'
    EXPORTING
      program         = CONV syrepid( to_upper( ls_input-program ) )
      language        = lv_lang
      state           = 'A'
    IMPORTING
      adm             = ls_adm
    TABLES
      sta             = lt_sta
      fun             = lt_fun
      men             = lt_men
      mtx             = lt_mtx
      act             = lt_act
      but             = lt_but
      pfk             = lt_pfk
      set             = lt_set
      doc             = lt_doc
      tit             = lt_tit
      biv             = lt_biv
    EXCEPTIONS
      not_found       = 1
      unknown_version = 2
      OTHERS          = 3.

  ev_subrc = sy-subrc.
  IF sy-subrc <> 0.
    ev_message = |RS_CUA_INTERNAL_FETCH failed (sy-subrc={ sy-subrc })|.
  ELSE.
    DATA: BEGIN OF ls_result,
            adm TYPE rsmpe_adm,
            sta TYPE TABLE OF rsmpe_stat WITH DEFAULT KEY,
            fun TYPE TABLE OF rsmpe_funt WITH DEFAULT KEY,
            men TYPE TABLE OF rsmpe_men WITH DEFAULT KEY,
            mtx TYPE TABLE OF rsmpe_mnlt WITH DEFAULT KEY,
            act TYPE TABLE OF rsmpe_act WITH DEFAULT KEY,
            but TYPE TABLE OF rsmpe_but WITH DEFAULT KEY,
            pfk TYPE TABLE OF rsmpe_pfk WITH DEFAULT KEY,
            set TYPE TABLE OF rsmpe_staf WITH DEFAULT KEY,
            doc TYPE TABLE OF rsmpe_atrt WITH DEFAULT KEY,
            tit TYPE TABLE OF rsmpe_titt WITH DEFAULT KEY,
            biv TYPE TABLE OF rsmpe_buts WITH DEFAULT KEY,
          END OF ls_result.
    ls_result-adm = ls_adm.
    ls_result-sta = lt_sta.
    ls_result-fun = lt_fun.
    ls_result-men = lt_men.
    ls_result-mtx = lt_mtx.
    ls_result-act = lt_act.
    ls_result-but = lt_but.
    ls_result-pfk = lt_pfk.
    ls_result-set = lt_set.
    ls_result-doc = lt_doc.
    ls_result-tit = lt_tit.
    ls_result-biv = lt_biv.
    ev_result = /ui2/cl_json=>serialize( data = ls_result ).
    ev_message = 'OK'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form CUA_WRITE
*&---------------------------------------------------------------------*
FORM cua_write USING iv_params TYPE string
               CHANGING ev_subrc TYPE i
                        ev_message TYPE string
                        ev_result TYPE string.

  DATA: BEGIN OF ls_input,
          program  TYPE string,
          language TYPE string,
          cua_data TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

* Deserialize CUA data from JSON
  DATA: BEGIN OF ls_cua,
          adm TYPE rsmpe_adm,
          sta TYPE TABLE OF rsmpe_stat WITH DEFAULT KEY,
          fun TYPE TABLE OF rsmpe_funt WITH DEFAULT KEY,
          men TYPE TABLE OF rsmpe_men WITH DEFAULT KEY,
          mtx TYPE TABLE OF rsmpe_mnlt WITH DEFAULT KEY,
          act TYPE TABLE OF rsmpe_act WITH DEFAULT KEY,
          but TYPE TABLE OF rsmpe_but WITH DEFAULT KEY,
          pfk TYPE TABLE OF rsmpe_pfk WITH DEFAULT KEY,
          set TYPE TABLE OF rsmpe_staf WITH DEFAULT KEY,
          doc TYPE TABLE OF rsmpe_atrt WITH DEFAULT KEY,
          tit TYPE TABLE OF rsmpe_titt WITH DEFAULT KEY,
          biv TYPE TABLE OF rsmpe_buts WITH DEFAULT KEY,
        END OF ls_cua.

  /ui2/cl_json=>deserialize(
    EXPORTING json = ls_input-cua_data
    CHANGING  data = ls_cua ).

  DATA: lv_lang TYPE sy-langu.
  IF ls_input-language IS NOT INITIAL.
    lv_lang = ls_input-language(1).
  ELSE.
    lv_lang = sy-langu.
  ENDIF.

  " TR_KEY (LIKE TRKEY) is a mandatory IMPORTING parameter of
  " RS_CUA_INTERNAL_WRITE (omitting it -> CX_SY_DYN_CALL_PARAM_MISSING).
  " OBJ_TYPE must fit the program type (PROG for 1/M, FUGR for F) or the
  " FM raises INVALID_DATA; SUB_NAME drives the tree / TCODE index.
  DATA: ls_tr_key  TYPE trkey,
        lv_prog    TYPE trdir-name,
        lv_subc    TYPE trdir-subc,
        lv_ns      TYPE string,
        lv_rest    TYPE string,
        lv_sap_msg TYPE string.

  lv_prog = to_upper( ls_input-program ).
  SELECT SINGLE subc FROM trdir INTO lv_subc WHERE name = lv_prog.
  IF lv_subc = 'F'.
    ls_tr_key-obj_type = 'FUGR'.
    IF lv_prog(1) = '/'.
      FIND REGEX '^(/[^/]+/)SAPL(.+)$' IN lv_prog SUBMATCHES lv_ns lv_rest.
      ls_tr_key-obj_name = lv_ns && lv_rest.
    ELSE.
      ls_tr_key-obj_name = lv_prog+4.
    ENDIF.
  ELSE.
    ls_tr_key-obj_type = 'PROG'.
    ls_tr_key-obj_name = lv_prog.
  ENDIF.
  ls_tr_key-sub_type = 'CUAD'.
  ls_tr_key-sub_name = lv_prog.
  SELECT SINGLE devclass FROM tadir INTO ls_tr_key-devclass
    WHERE pgmid    = 'R3TR'
      AND object   = ls_tr_key-obj_type
      AND obj_name = ls_tr_key-obj_name.

  CALL FUNCTION 'RS_CUA_INTERNAL_WRITE'
    EXPORTING
      program   = lv_prog
      language  = lv_lang
      tr_key    = ls_tr_key
      adm       = ls_cua-adm
      state     = 'A'
    TABLES
      sta       = ls_cua-sta
      fun       = ls_cua-fun
      men       = ls_cua-men
      mtx       = ls_cua-mtx
      act       = ls_cua-act
      but       = ls_cua-but
      pfk       = ls_cua-pfk
      set       = ls_cua-set
      doc       = ls_cua-doc
      tit       = ls_cua-tit
      biv       = ls_cua-biv
    EXCEPTIONS
      not_found       = 1
      invalid_data    = 2
      OTHERS          = 3.

  ev_subrc = sy-subrc.
  IF ev_subrc <> 0.
    ev_message = |RS_CUA_INTERNAL_WRITE failed (sy-subrc={ ev_subrc })|.
    IF sy-msgid IS NOT INITIAL.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_sap_msg.
      ev_message = |{ ev_message }: { lv_sap_msg }|.
    ENDIF.
  ELSE.
    ev_message = |CUA written for { ls_input-program }|.
    ev_result = '{"written":true}'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form CUA_DELETE
*&---------------------------------------------------------------------*
FORM cua_delete USING iv_params TYPE string
                CHANGING ev_subrc TYPE i
                         ev_message TYPE string
                         ev_result TYPE string.

  DATA: BEGIN OF ls_input,
          program TYPE string,
          status  TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  CALL FUNCTION 'RS_CUA_DELETE'
    EXPORTING
      report     = CONV syrepid( to_upper( ls_input-program ) )
    EXCEPTIONS
      not_found  = 1
      OTHERS     = 2.

  ev_subrc = sy-subrc.
  IF sy-subrc <> 0.
    ev_message = |RS_CUA_DELETE failed (sy-subrc={ sy-subrc })|.
  ELSE.
    ev_message = |CUA deleted for { ls_input-program }|.
    ev_result = '{"deleted":true}'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form BIZ_EXECUTE
*&---------------------------------------------------------------------*
* Business actions for backends that only reach ZMCP_ADT_DISPATCH
* (OData FunctionImport Dispatch). Forwards to the RFC FM
* ZMCP_BIZ_EXECUTE (function group ZMCP_BIZ, sc4sap abap/biz/) and wraps
* its exports. The SOAP backend calls ZMCP_BIZ_EXECUTE directly.
* params: action, mode, params (JSON object as a string), token, idem_key
* result: {"subrc":n,"message":"..","token":"..","result":<EV_RESULT JSON>}
* ev_subrc stays 0 when the FM ran: a business refusal (subrc 4 / 8) is
* an answer for the caller, not a dispatcher error. Dynamic call, so the
* dispatcher activates without ZMCP_BIZ installed.
FORM biz_execute USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_in,
          action   TYPE string,
          mode     TYPE string,
          params   TYPE string,
          token    TYPE string,
          idem_key TYPE string,
        END OF ls_in.
  DATA: lv_fm    TYPE rs38l_fnam VALUE 'ZMCP_BIZ_EXECUTE',
        lv_subrc TYPE i,
        lv_msg   TYPE string,
        lv_res   TYPE string,
        lv_tok   TYPE string,
        lv_first TYPE c LENGTH 1.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_in ).

  CALL FUNCTION 'FUNCTION_EXISTS'
    EXPORTING
      funcname           = lv_fm
    EXCEPTIONS
      function_not_exist = 1
      OTHERS             = 2.
  IF sy-subrc <> 0.
    ev_subrc   = 4.
    ev_message = 'ZMCP_BIZ_EXECUTE is not installed on this system (sc4sap abap/biz)'.
    RETURN.
  ENDIF.

  CALL FUNCTION lv_fm
    EXPORTING
      iv_action   = ls_in-action
      iv_mode     = ls_in-mode
      iv_params   = ls_in-params
      iv_token    = ls_in-token
      iv_idem_key = ls_in-idem_key
    IMPORTING
      ev_subrc    = lv_subrc
      ev_message  = lv_msg
      ev_result   = lv_res
      ev_token    = lv_tok.

  lv_res = condense( lv_res ).
  IF lv_res IS INITIAL.
    lv_res = 'null'.
  ELSE.
    lv_first = lv_res.
    IF lv_first <> '{' AND lv_first <> '['.
      lv_res = /ui2/cl_json=>serialize( data = lv_res ).
    ENDIF.
  ENDIF.

  ev_result = |\{"subrc":{ lv_subrc },"message":{ /ui2/cl_json=>serialize( data = lv_msg ) },| &&
              |"token":{ /ui2/cl_json=>serialize( data = lv_tok ) },"result":{ lv_res }\}|.
  ev_subrc = 0.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FM_PROXY
*&---------------------------------------------------------------------*
* Calls one of the sc4sap helper FMs that are not remote-enabled, for
* RFC clients (NCo backend) that only reach remote-enabled FMs. Allow
* list only. Importing parameters arrive by name as strings and are
* converted to the FM's own parameter types; CHANGING / TABLES
* parameters are not supported.
* params: {"fm":"ZMCP_ADT_DDIC_TTYP",
*          "params":[{"name":"IV_ACTION","value":"READ"},...]}
* result: the FM's EXPORTING parameters as one JSON object, e.g.
*         {"EV_SUBRC":0,"EV_MESSAGE":"..","EV_RESULT":".."}
* ev_subrc 0 = the FM ran (its own EV_SUBRC is inside the result).
FORM fm_proxy USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  TYPES: BEGIN OF ty_kv,
           name  TYPE string,
           value TYPE string,
         END OF ty_kv.
  DATA: BEGIN OF ls_in,
          fm     TYPE string,
          params TYPE STANDARD TABLE OF ty_kv WITH DEFAULT KEY,
        END OF ls_in.
  DATA: lt_allowed TYPE STANDARD TABLE OF rs38l_fnam WITH DEFAULT KEY,
        lv_fm      TYPE rs38l_fnam,
        lt_imp     TYPE STANDARD TABLE OF rsimp,
        lt_exp     TYPE STANDARD TABLE OF rsexp,
        lt_cha     TYPE STANDARD TABLE OF rscha,
        lt_tbl     TYPE STANDARD TABLE OF rstbl,
        lt_exc     TYPE STANDARD TABLE OF rsexc,
        lt_ptab    TYPE abap_func_parmbind_tab,
        ls_pbind   TYPE abap_func_parmbind,
        lt_etab    TYPE abap_func_excpbind_tab,
        ls_ebind   TYPE abap_func_excpbind,
        lv_type    TYPE string,
        lr_data    TYPE REF TO data,
        lv_rc      TYPE i,
        lv_json    TYPE string,
        lv_sep     TYPE string.
  FIELD-SYMBOLS: <ls_imp> TYPE rsimp,
                 <ls_exp> TYPE rsexp,
                 <ls_exc> TYPE rsexc,
                 <ls_kv>  TYPE ty_kv,
                 <lv_any> TYPE any.

  lt_allowed = VALUE #( ( 'ZMCP_ADT_DDIC_TABL_READ' ) ( 'ZMCP_ADT_DDIC_DTEL_READ' )
                        ( 'ZMCP_ADT_DDIC_DOMA_READ' ) ( 'ZMCP_ADT_DDIC_TTYP' )
                        ( 'ZMCP_ADT_DDIC_BADI' ) ( 'ZMCP_ADT_DDIC_INTROSPECT' )
                        ( 'ZMCP_WL_TCODE_USAGE' ) ( 'ZMCP_WL_JOB_USAGE' ) ).

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_in ).
  lv_fm = to_upper( ls_in-fm ).
  READ TABLE lt_allowed TRANSPORTING NO FIELDS WITH KEY table_line = lv_fm.
  IF sy-subrc <> 0.
    ev_subrc = 4.
    ev_message = |FM_PROXY: { lv_fm } is not on the allow list|.
    RETURN.
  ENDIF.
  LOOP AT ls_in-params ASSIGNING <ls_kv>.
    TRANSLATE <ls_kv>-name TO UPPER CASE.
  ENDLOOP.

  CALL FUNCTION 'FUNCTION_IMPORT_INTERFACE'
    EXPORTING
      funcname           = lv_fm
    TABLES
      exception_list     = lt_exc
      export_parameter   = lt_exp
      import_parameter   = lt_imp
      changing_parameter = lt_cha
      tables_parameter   = lt_tbl
    EXCEPTIONS
      error_message      = 1
      function_not_found = 2
      invalid_name       = 3
      OTHERS             = 4.
  IF sy-subrc <> 0.
    ev_subrc = 4.
    ev_message = |FM_PROXY: { lv_fm } is not installed on this system|.
    RETURN.
  ENDIF.
  IF lt_cha IS NOT INITIAL OR lt_tbl IS NOT INITIAL.
    ev_subrc = 4.
    ev_message = |FM_PROXY: { lv_fm } has CHANGING / TABLES parameters (not supported)|.
    RETURN.
  ENDIF.

  LOOP AT lt_imp ASSIGNING <ls_imp>.
    READ TABLE ls_in-params ASSIGNING <ls_kv> WITH KEY name = <ls_imp>-parameter.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
    lv_type = COND #( WHEN <ls_imp>-typ IS NOT INITIAL THEN <ls_imp>-typ ELSE <ls_imp>-dbfield ).
    IF lv_type IS INITIAL.
      lv_type = 'STRING'.
    ENDIF.
    CREATE DATA lr_data TYPE (lv_type).
    ASSIGN lr_data->* TO <lv_any>.
    <lv_any> = <ls_kv>-value.
    CLEAR ls_pbind.
    ls_pbind-name  = <ls_imp>-parameter.
    ls_pbind-kind  = abap_func_exporting.
    ls_pbind-value = lr_data.
    INSERT ls_pbind INTO TABLE lt_ptab.
  ENDLOOP.

  LOOP AT lt_exp ASSIGNING <ls_exp>.
    lv_type = COND #( WHEN <ls_exp>-typ IS NOT INITIAL THEN <ls_exp>-typ ELSE <ls_exp>-dbfield ).
    IF lv_type IS INITIAL.
      lv_type = 'STRING'.
    ENDIF.
    CREATE DATA lr_data TYPE (lv_type).
    CLEAR ls_pbind.
    ls_pbind-name  = <ls_exp>-parameter.
    ls_pbind-kind  = abap_func_importing.
    ls_pbind-value = lr_data.
    INSERT ls_pbind INTO TABLE lt_ptab.
  ENDLOOP.

  LOOP AT lt_exc ASSIGNING <ls_exc>.
    ls_ebind-name  = <ls_exc>-exception.
    ls_ebind-value = sy-tabix.
    INSERT ls_ebind INTO TABLE lt_etab.
  ENDLOOP.
  ls_ebind-name  = 'ERROR_MESSAGE'.
  ls_ebind-value = 90.
  INSERT ls_ebind INTO TABLE lt_etab.
  ls_ebind-name  = 'OTHERS'.
  ls_ebind-value = 99.
  INSERT ls_ebind INTO TABLE lt_etab.

  CALL FUNCTION lv_fm
    PARAMETER-TABLE lt_ptab
    EXCEPTION-TABLE lt_etab.
  lv_rc = sy-subrc.
  IF lv_rc <> 0.
    ev_subrc = 8.
    IF lv_rc = 90 AND sy-msgid IS NOT INITIAL.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
      ev_message = |FM_PROXY: { lv_fm }: { ev_message }|.
    ELSE.
      ev_message = |FM_PROXY: { lv_fm } raised an exception (sy-subrc { lv_rc })|.
    ENDIF.
    RETURN.
  ENDIF.

  lv_json = '{'.
  LOOP AT lt_exp ASSIGNING <ls_exp>.
    READ TABLE lt_ptab INTO ls_pbind WITH TABLE KEY name = <ls_exp>-parameter kind = abap_func_importing.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
    ASSIGN ls_pbind-value->* TO <lv_any>.
    lv_json = |{ lv_json }{ lv_sep }"{ <ls_exp>-parameter }":{ /ui2/cl_json=>serialize( data = <lv_any> ) }|.
    lv_sep = ','.
  ENDLOOP.
  ev_result = |{ lv_json }\}|.
  ev_subrc = 0.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form REMOTE_READ - read-only table rows from another system via RFC
*&---------------------------------------------------------------------*
* Reads rows of one table in another SAP system through an RFC
* destination the user names (SM59 ABAP connection, e.g. PRDCLNT100)
* with the standard RFC_READ_TABLE, so realistic test data sets can be
* built without installing anything there.
* Business tables are allowed on purpose; credential / user master
* tables stay closed and sub-queries are refused. The caller (MCP tool /
* CLI) applies the table blocklist before calling.
* params: destination, table_name, field_list (string table),
*         options (string table, WHERE lines of at most 72 characters),
*         max_rows, skip_rows
* result: destination, table, fields [{name,type,length,text}],
*         rows (array of objects, values as text), count
FORM remote_read USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  TYPES ty_names TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
  DATA: BEGIN OF ls_input,
          destination TYPE string,
          table_name  TYPE string,
          field_list  TYPE ty_names,
          options     TYPE ty_names,
          max_rows    TYPE i,
          skip_rows   TYPE i,
        END OF ls_input.
  DATA: lv_dest     TYPE rfcdest,
        lv_tab      TYPE tabname,
        lv_line     TYPE string,
        lv_all      TYPE string,
        lv_max      TYPE i,
        lv_skip     TYPE i,
        lv_msg(255) TYPE c,
        lv_val      TYPE string,
        lv_off      TYPE i,
        lv_len      TYPE i,
        lv_num      TYPE string,
        lv_sep      TYPE string,
        lv_fsep     TYPE string,
        lt_opt      TYPE STANDARD TABLE OF rfc_db_opt,
        ls_opt      TYPE rfc_db_opt,
        lt_fld      TYPE STANDARD TABLE OF rfc_db_fld,
        ls_fld      TYPE rfc_db_fld,
        lt_dat      TYPE STANDARD TABLE OF tab512,
        ls_dat      TYPE tab512,
        lt_json     TYPE ty_names.
  DATA lv_rfctype TYPE rfcdes-rfctype.
  " Destinations must be ABAP connections (SM59 type 3): RFC_READ_TABLE
  " exists only in an SAP system.
  CONSTANTS lc_abap_conn TYPE rfcdes-rfctype VALUE '3'.
  " Row cap per call (same as TABLE_READ); larger extracts page with skip_rows.
  CONSTANTS lc_max_rows TYPE i VALUE 5000.
  " Rows when the caller sends none: enough to see the data shape.
  CONSTANTS lc_default_rows TYPE i VALUE 100.
  " RFC_READ_TABLE OPTIONS line width (RFC_DB_OPT-TEXT is CHAR 72).
  CONSTANTS lc_option_width TYPE i VALUE 72.
  " RFC_READ_TABLE data line width (TAB512-WA is CHAR 512).
  CONSTANTS lc_data_width TYPE i VALUE 512.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).

  " The caller names the destination (the tool asks the user); it must be an
  " ABAP connection maintained in SM59.
  lv_dest = condense( ls_input-destination ).
  IF lv_dest IS INITIAL.
    ev_subrc = 4. ev_message = 'REMOTE_READ: destination is required'. ev_result = '{}'.
    RETURN.
  ENDIF.
  SELECT SINGLE rfctype FROM rfcdes INTO lv_rfctype WHERE rfcdest = lv_dest.
  IF sy-subrc <> 0.
    ev_subrc = 4. ev_message = |REMOTE_READ: destination { lv_dest } is not defined in SM59|. ev_result = '{}'.
    RETURN.
  ENDIF.
  IF lv_rfctype <> lc_abap_conn.
    ev_subrc = 4. ev_message = |REMOTE_READ: destination { lv_dest } is not an ABAP connection (type { lv_rfctype })|. ev_result = '{}'.
    RETURN.
  ENDIF.

  lv_tab = to_upper( condense( ls_input-table_name ) ).
  IF lv_tab IS INITIAL.
    ev_subrc = 4. ev_message = 'REMOTE_READ: table_name is required'. ev_result = '{}'.
    RETURN.
  ENDIF.
  " Credentials, user master and security tables stay closed whatever the purpose.
  IF lv_tab = 'RFCDES' OR lv_tab = 'RSECTAB' OR lv_tab = 'RSECACTB'
     OR lv_tab CP 'USR*' OR lv_tab CP 'UST*' OR lv_tab CP 'AGR_*'
     OR lv_tab CP 'SSF_PSE*' OR lv_tab CP 'STRUST*' OR lv_tab CP 'SNC*'
     OR lv_tab CP 'TRUSTED*' OR lv_tab CP 'RSAU*'.
    ev_subrc = 4. ev_message = |REMOTE_READ: table { lv_tab } is not allowed|. ev_result = '{}'.
    RETURN.
  ENDIF.

  " WHERE lines: width check, and no sub-queries (checked on the joined text,
  " so a keyword split across two lines is still caught).
  LOOP AT ls_input-options INTO lv_line.
    IF strlen( lv_line ) > lc_option_width.
      ev_subrc = 4. ev_message = |REMOTE_READ: options lines must be at most { lc_option_width } characters|. ev_result = '{}'.
      RETURN.
    ENDIF.
    CONCATENATE lv_all lv_line INTO lv_all.
    CLEAR ls_opt.
    ls_opt-text = lv_line.
    APPEND ls_opt TO lt_opt.
  ENDLOOP.
  lv_all = to_upper( lv_all ).
  IF lv_all CS 'SELECT' OR lv_all CS 'JOIN'.
    ev_subrc = 4. ev_message = 'REMOTE_READ: sub-queries are not allowed in the condition'. ev_result = '{}'.
    RETURN.
  ENDIF.

  LOOP AT ls_input-field_list INTO lv_line.
    CLEAR ls_fld.
    ls_fld-fieldname = to_upper( condense( lv_line ) ).
    APPEND ls_fld TO lt_fld.
  ENDLOOP.

  lv_max = ls_input-max_rows.
  IF lv_max <= 0. lv_max = lc_default_rows. ENDIF.
  IF lv_max > lc_max_rows. lv_max = lc_max_rows. ENDIF.
  lv_skip = ls_input-skip_rows.
  IF lv_skip < 0. lv_skip = 0. ENDIF.

  CALL FUNCTION 'RFC_READ_TABLE'
    DESTINATION lv_dest
    EXPORTING
      query_table           = lv_tab
      rowcount              = lv_max
      rowskips              = lv_skip
    TABLES
      options               = lt_opt
      fields                = lt_fld
      data                  = lt_dat
    EXCEPTIONS
      table_not_available   = 1
      table_without_data    = 2
      option_not_valid      = 3
      field_not_valid       = 4
      not_authorized        = 5
      data_buffer_exceeded  = 6
      system_failure        = 7 MESSAGE lv_msg
      communication_failure = 8 MESSAGE lv_msg
      OTHERS                = 9.
  CASE sy-subrc.
    WHEN 0.
    WHEN 1. ev_subrc = 4. ev_message = |REMOTE_READ: table { lv_tab } is not available on { lv_dest }|.
    WHEN 2. ev_subrc = 4. ev_message = |REMOTE_READ: { lv_tab } has no database table on { lv_dest }|.
    WHEN 3. ev_subrc = 4. ev_message = 'REMOTE_READ: the WHERE condition is not valid'.
    WHEN 4. ev_subrc = 4. ev_message = |REMOTE_READ: a requested field is not on { lv_tab }|.
    WHEN 5. ev_subrc = 4. ev_message = |REMOTE_READ: the RFC user of { lv_dest } may not read { lv_tab } (S_TABU_DIS)|.
    WHEN 6. ev_subrc = 4. ev_message = |REMOTE_READ: a row is longer than { lc_data_width } characters - choose fewer fields|.
    WHEN 7. ev_subrc = 8. ev_message = |REMOTE_READ: system failure on { lv_dest }: { lv_msg }|.
    WHEN 8. ev_subrc = 8. ev_message = |REMOTE_READ: communication failure to { lv_dest }: { lv_msg }|.
    WHEN OTHERS. ev_subrc = 8. ev_message = |REMOTE_READ: RFC_READ_TABLE failed, sy-subrc { sy-subrc }|.
  ENDCASE.
  IF ev_subrc <> 0.
    ev_result = '{}'.
    RETURN.
  ENDIF.

  " Field list: name, ABAP type, length and short text.
  APPEND |\{"destination":"{ lv_dest }","table":"{ lv_tab }","fields":[| TO lt_json.
  CLEAR lv_sep.
  LOOP AT lt_fld INTO ls_fld.
    lv_val = ls_fld-fieldtext.
    PERFORM remote_read_escape CHANGING lv_val.
    lv_len = ls_fld-length.
    lv_num = lv_len.
    CONDENSE lv_num.
    APPEND |{ lv_sep }\{"name":"{ ls_fld-fieldname }","type":"{ ls_fld-type }","length":{ lv_num },"text":"{ lv_val }"\}| TO lt_json.
    lv_sep = ','.
  ENDLOOP.

  " Rows: each field cut from the fixed-width data line at its offset.
  APPEND '],"rows":[' TO lt_json.
  CLEAR lv_sep.
  LOOP AT lt_dat INTO ls_dat.
    APPEND |{ lv_sep }\{| TO lt_json.
    CLEAR lv_fsep.
    LOOP AT lt_fld INTO ls_fld.
      lv_off = ls_fld-offset.
      lv_len = ls_fld-length.
      IF lv_off + lv_len > lc_data_width.
        lv_len = lc_data_width - lv_off.
      ENDIF.
      CLEAR lv_val.
      IF lv_len > 0.
        lv_val = ls_dat-wa+lv_off(lv_len).
        SHIFT lv_val LEFT DELETING LEADING space.
        PERFORM remote_read_escape CHANGING lv_val.
      ENDIF.
      APPEND |{ lv_fsep }"{ ls_fld-fieldname }":"{ lv_val }"| TO lt_json.
      lv_fsep = ','.
    ENDLOOP.
    APPEND '}' TO lt_json.
    lv_sep = ','.
  ENDLOOP.

  lv_num = lines( lt_dat ).
  CONDENSE lv_num.
  APPEND |],"count":{ lv_num }\}| TO lt_json.
  CONCATENATE LINES OF lt_json INTO ev_result.
  ev_subrc = 0.
  ev_message = 'OK'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form REMOTE_READ_ESCAPE - escape a text value for a JSON string
*&---------------------------------------------------------------------*
FORM remote_read_escape CHANGING cv_text TYPE string.
  DATA lv_cr TYPE c LENGTH 1.
  lv_cr = cl_abap_char_utilities=>cr_lf. " first character = carriage return
  REPLACE ALL OCCURRENCES OF `\` IN cv_text WITH `\\`.
  REPLACE ALL OCCURRENCES OF `"` IN cv_text WITH `\"`.
  REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab IN cv_text WITH `\t`.
  REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>newline IN cv_text WITH `\n`.
  REPLACE ALL OCCURRENCES OF lv_cr IN cv_text WITH `\r`.
ENDFORM.
