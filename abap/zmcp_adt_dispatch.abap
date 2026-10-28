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
