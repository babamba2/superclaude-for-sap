FUNCTION zmcp_adt_dispatch
  IMPORTING
    VALUE(iv_action) TYPE string
    VALUE(iv_params) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_DISPATCH — ECC variant (ABAP 7.40 / ECC).
*
* Divergences from the S/4HANA primary (abap/zmcp_adt_dispatch.abap):
*   1. Inline FUNCTION signature (no `*"Local Interface:` comment block) —
*      required because the ADT REST API used by the Step 9a installer
*      rejects comment-block parameter declarations.
*   2. `RS_CUA_INTERNAL_FETCH` table parameter TIT typed as `rsmpe_titt`
*      (not `rsmpe_tit`). ECC 7.40's FM signature expects `_titt`; passing
*      `_tit` fails with "parameter TIT — types match, but not the length".
*   3. Screen containers / fields declared using the FM's TABLES-parameter
*      table types `DYCATT_TAB` / `DYFATC_TAB` directly, because the line
*      type `RPY_DYFIELD` does not exist (not on S/4HANA either).
*   4. DYNPRO_INSERT flow logic typed `RPY_DYFLOW` (LINE CHAR 72) instead
*      of `SWBSE_MAX_LINE_TAB`; 7.40 exception list of RPY_DYNPRO_INSERT.
*   5. CUA_WRITE passes the mandatory 7.40 parameter TR_KEY (TRKEY) to
*      `RS_CUA_INTERNAL_WRITE`; exceptions NOT_FOUND / INVALID_DATA.
*
* Supported actions:
*   DYNPRO_INSERT  — create screen   (RPY_DYNPRO_INSERT)
*   DYNPRO_READ    — read screen     (RPY_DYNPRO_READ)
*   DYNPRO_DELETE  — delete screen   (RPY_DYNPRO_DELETE)
*   CUA_FETCH      — read GUI status (RS_CUA_INTERNAL_FETCH)
*   CUA_WRITE      — write GUI status (RS_CUA_INTERNAL_WRITE)
*   CUA_DELETE     — delete GUI status (RS_CUA_DELETE)
*   TABLE_READ     — read-only SELECT on a customizing / system table
*                    (delivery class C, G, E, S, W) or a listed repository
*                    table (CMOD, TSTC, DDIC metadata, transport keys); the
*                    MCP server's GetSqlQuery / GetTableContents fallback, as
*                    ECC has no ADT data preview

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
        WHEN 'TABLE_READ'.
          PERFORM table_read USING iv_params
                             CHANGING ev_subrc ev_message ev_result.
        WHEN 'DUMP_LIST'.
          PERFORM dump_list USING iv_params
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
*& Form DYNPRO_INSERT (ECC 7.40)
*&---------------------------------------------------------------------*
* params: program, dynpro, dynpro_data (JSON string, same contract as the
*         S/4 variant: HEADER / CONTAINERS / FIELDS_TO_CONTAINERS /
*         FLOW_LOGIC = [{LINE}] - also the shape DYNPRO_READ returns).
* ECC 7.40 RPY_DYNPRO_INSERT interface:
*   HEADER LIKE RPY_DYHEAD, CONTAINERS TYPE DYCATT_TAB,
*   FIELDS_TO_CONTAINERS TYPE DYFATC_TAB, FLOW_LOGIC LIKE RPY_DYFLOW
*   (one component LINE CHAR 72) - all mandatory; PARAMS optional.
* Same semantics as S/4: SUPPRESS_EXIST_CHECKS = 'X', so an existing
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
*& Form CUA_FETCH (ECC: rsmpe_titt)
*&---------------------------------------------------------------------*
FORM cua_fetch USING iv_params TYPE string
               CHANGING ev_subrc   TYPE i
                        ev_message TYPE string
                        ev_result  TYPE string.

  DATA: BEGIN OF ls_input,
          program  TYPE string,
          language TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  DATA: ls_adm TYPE rsmpe_adm,
        lt_sta TYPE TABLE OF rsmpe_stat,
        lt_fun TYPE TABLE OF rsmpe_funt,
        lt_men TYPE TABLE OF rsmpe_men,
        lt_mtx TYPE TABLE OF rsmpe_mnlt,
        lt_act TYPE TABLE OF rsmpe_act,
        lt_but TYPE TABLE OF rsmpe_but,
        lt_pfk TYPE TABLE OF rsmpe_pfk,
        lt_set TYPE TABLE OF rsmpe_staf,
        lt_doc TYPE TABLE OF rsmpe_atrt,
        lt_tit TYPE TABLE OF rsmpe_titt,
        lt_biv TYPE TABLE OF rsmpe_buts.

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
            men TYPE TABLE OF rsmpe_men  WITH DEFAULT KEY,
            mtx TYPE TABLE OF rsmpe_mnlt WITH DEFAULT KEY,
            act TYPE TABLE OF rsmpe_act  WITH DEFAULT KEY,
            but TYPE TABLE OF rsmpe_but  WITH DEFAULT KEY,
            pfk TYPE TABLE OF rsmpe_pfk  WITH DEFAULT KEY,
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
    ev_result  = /ui2/cl_json=>serialize( data = ls_result ).
    ev_message = 'OK'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form CUA_WRITE (ECC: rsmpe_titt)
*&---------------------------------------------------------------------*
FORM cua_write USING iv_params TYPE string
               CHANGING ev_subrc   TYPE i
                        ev_message TYPE string
                        ev_result  TYPE string.

  DATA: BEGIN OF ls_input,
          program  TYPE string,
          language TYPE string,
          cua_data TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  DATA: BEGIN OF ls_cua,
          adm TYPE rsmpe_adm,
          sta TYPE TABLE OF rsmpe_stat WITH DEFAULT KEY,
          fun TYPE TABLE OF rsmpe_funt WITH DEFAULT KEY,
          men TYPE TABLE OF rsmpe_men  WITH DEFAULT KEY,
          mtx TYPE TABLE OF rsmpe_mnlt WITH DEFAULT KEY,
          act TYPE TABLE OF rsmpe_act  WITH DEFAULT KEY,
          but TYPE TABLE OF rsmpe_but  WITH DEFAULT KEY,
          pfk TYPE TABLE OF rsmpe_pfk  WITH DEFAULT KEY,
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

  " ECC 7.40: TR_KEY (LIKE TRKEY) is a mandatory IMPORTING parameter of
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
      program         = lv_prog
      language        = lv_lang
      tr_key          = ls_tr_key
      adm             = ls_cua-adm
      state           = 'A'
    TABLES
      sta             = ls_cua-sta
      fun             = ls_cua-fun
      men             = ls_cua-men
      mtx             = ls_cua-mtx
      act             = ls_cua-act
      but             = ls_cua-but
      pfk             = ls_cua-pfk
      set             = ls_cua-set
      doc             = ls_cua-doc
      tit             = ls_cua-tit
      biv             = ls_cua-biv
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
    ev_result  = '{"written":true}'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form CUA_DELETE
*&---------------------------------------------------------------------*
FORM cua_delete USING iv_params TYPE string
                CHANGING ev_subrc   TYPE i
                         ev_message TYPE string
                         ev_result  TYPE string.

  DATA: BEGIN OF ls_input,
          program TYPE string,
          status  TYPE string,
        END OF ls_input.

  /ui2/cl_json=>deserialize(
    EXPORTING json = iv_params
    CHANGING  data = ls_input ).

  CALL FUNCTION 'RS_CUA_DELETE'
    EXPORTING
      report    = CONV syrepid( to_upper( ls_input-program ) )
    EXCEPTIONS
      not_found = 1
      OTHERS    = 2.

  ev_subrc = sy-subrc.
  IF sy-subrc <> 0.
    ev_message = |RS_CUA_DELETE failed (sy-subrc={ sy-subrc })|.
  ELSE.
    ev_message = |CUA deleted for { ls_input-program }|.
    ev_result  = '{"deleted":true}'.
  ENDIF.

ENDFORM.


*&---------------------------------------------------------------------*
*& Form TABLE_READ - read-only SELECT on a customizing / system table
*&---------------------------------------------------------------------*
* Used by the MCP server where the ADT data preview is missing (BASIS < 7.50):
* GetSqlQuery / GetTableContents on customizing and system tables (CMOD,
* GGB, BTE, VOFM, T100, IMG structure and documentation, configuration
* tables for config-to-document), DDIC metadata and transport keys.
* params: table_name, field_list (string table), condition, max_rows
* result: rows (array of objects) and count
FORM table_read USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  TYPES ty_names TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
  DATA: BEGIN OF ls_input,
          table_name TYPE string,
          field_list TYPE ty_names,
          condition  TYPE string,
          max_rows   TYPE i,
        END OF ls_input.
  DATA: lv_tab    TYPE tabname,
        lv_where  TYPE string,
        lv_upper  TYPE string,
        lv_max    TYPE i,
        lv_count  TYPE i,
        lv_cnt    TYPE string,
        lt_sel    TYPE ty_names,
        lt_comp   TYPE cl_abap_structdescr=>component_table,
        lt_keep   TYPE cl_abap_structdescr=>component_table,
        ls_comp   TYPE abap_componentdescr,
        lo_struct TYPE REF TO cl_abap_structdescr,
        lo_line   TYPE REF TO cl_abap_structdescr,
        lo_table  TYPE REF TO cl_abap_tabledescr,
        lr_data   TYPE REF TO data,
        lx_sql    TYPE REF TO cx_sy_dynamic_osql_error,
        lv_field  TYPE string,
        lv_rows   TYPE string,
        lv_class  TYPE dd02l-contflag,
        lt_view   TYPE abap_component_view_tab,
        ls_view   TYPE abap_simple_componentdescr.
  FIELD-SYMBOLS: <lt_data> TYPE STANDARD TABLE.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  lv_tab = to_upper( condense( ls_input-table_name ) ).

  " Allow rule: customizing and system tables only - never business data.
  " Delivery class C/G (customizing), E/S (control / system) and W (system
  " tables maintained by the system: repository directory TADIR / TDEVC /
  " TRDIR, inactive objects DWINACTV) pass, plus a fixed list of tables the
  " older dispatchers already accepted: CMOD, transaction codes, BAdI
  " definitions / implementations (SXS_*, SXC_*, ENHHEADER),
  " DDIC metadata and the transport key tables for change history.
  " Application (A) and temporary (L) data stay closed, and so do tables
  " that hold credentials or user master data whatever their class.
  " Of the PFCG tables only the role design (definition, texts, flags,
  " composite contents, menu T-codes, authorization values, org levels)
  " and the role-user assignment (user ID and validity) are readable -
  " for role-matrix documents.
  IF lv_tab = 'RFCDES' OR lv_tab = 'RSECTAB' OR lv_tab = 'RSECACTB'
     OR lv_tab CP 'USR*' OR lv_tab CP 'UST*'
     OR ( lv_tab CP 'AGR_*' AND lv_tab <> 'AGR_DEFINE' AND lv_tab <> 'AGR_TEXTS'
          AND lv_tab <> 'AGR_FLAGS' AND lv_tab <> 'AGR_AGRS' AND lv_tab <> 'AGR_TCODES'
          AND lv_tab <> 'AGR_1251' AND lv_tab <> 'AGR_1252' AND lv_tab <> 'AGR_USERS' )
     OR lv_tab CP 'SSF_PSE*' OR lv_tab CP 'STRUST*' OR lv_tab CP 'SNC*'
     OR lv_tab CP 'TRUSTED*' OR lv_tab CP 'RSAU*'.
    ev_subrc = 4. ev_message = |TABLE_READ: table { lv_tab } is not allowed|. ev_result = '{}'.
    RETURN.
  ENDIF.
  IF lv_tab <> 'MODACT' AND lv_tab <> 'MODATTR' AND lv_tab <> 'MODSAP'
     AND lv_tab <> 'TSTC' AND lv_tab <> 'TSTCP'
     AND lv_tab <> 'DD02L' AND lv_tab <> 'DD02T' AND lv_tab <> 'DD03L' AND lv_tab <> 'DD03T'
     AND lv_tab <> 'DD04L' AND lv_tab <> 'DD04T' AND lv_tab <> 'DD07L' AND lv_tab <> 'DD07T'
     AND lv_tab <> 'DD26S' AND lv_tab <> 'DD27S' AND lv_tab <> 'DD28S'
     AND lv_tab <> 'DD01L' AND lv_tab <> 'DD01T' AND lv_tab <> 'DD05S' AND lv_tab <> 'DD08L'
     AND lv_tab <> 'DD30L' AND lv_tab <> 'DD30T' AND lv_tab <> 'DD31S' AND lv_tab <> 'DD35L'
     AND lv_tab <> 'DD40L' AND lv_tab <> 'DD40T'
     AND lv_tab <> 'TVDIR' AND lv_tab <> 'OBJH' AND lv_tab <> 'OBJS' AND lv_tab <> 'OBJT'
     AND lv_tab <> 'E070' AND lv_tab <> 'E07T' AND lv_tab <> 'E071' AND lv_tab <> 'E071K'
     AND lv_tab <> 'SXS_ATTR' AND lv_tab <> 'SXC_EXIT' AND lv_tab <> 'SXC_ATTR'
     AND lv_tab <> 'SXC_CLASS' AND lv_tab <> 'ENHHEADER'.
    SELECT SINGLE contflag FROM dd02l INTO lv_class
      WHERE tabname = lv_tab AND as4local = 'A' AND as4vers = '0000'
        AND tabclass IN ('TRANSP','POOL','CLUSTER').
    IF sy-subrc <> 0 OR ( lv_class <> 'C' AND lv_class <> 'G'
                          AND lv_class <> 'E' AND lv_class <> 'S'
                          AND lv_class <> 'W' ).
      ev_subrc = 4. ev_message = |TABLE_READ: table { lv_tab } is not allowed|. ev_result = '{}'.
      RETURN.
    ENDIF.
  ENDIF.

  " The condition must stay on this table: no sub-queries.
  lv_where = ls_input-condition.
  lv_upper = to_upper( lv_where ).
  IF lv_upper CS 'SELECT' OR lv_upper CS ' FROM ' OR lv_upper CS 'JOIN'.
    ev_subrc = 4. ev_message = 'TABLE_READ: sub-queries are not allowed in the condition'. ev_result = '{}'.
    RETURN.
  ENDIF.

  lv_max = ls_input-max_rows.
  IF lv_max <= 0. lv_max = 500. ENDIF.
  IF lv_max > 5000. lv_max = 5000. ENDIF.

  " Flat component list: fields inside an .INCLUDE count as table fields.
  lo_struct ?= cl_abap_typedescr=>describe_by_name( lv_tab ).
  lt_view = lo_struct->get_included_view( ).
  LOOP AT lt_view INTO ls_view.
    CLEAR ls_comp.
    ls_comp-name = ls_view-name.
    ls_comp-type = ls_view-type.
    APPEND ls_comp TO lt_comp.
  ENDLOOP.

  " Requested fields (all when none): each must exist on the table.
  IF ls_input-field_list IS INITIAL.
    lt_keep = lt_comp.
  ELSE.
    LOOP AT ls_input-field_list INTO lv_field.
      lv_field = to_upper( condense( lv_field ) ).
      READ TABLE lt_comp INTO ls_comp WITH KEY name = lv_field.
      IF sy-subrc <> 0.
        ev_subrc = 4. ev_message = |TABLE_READ: field { lv_field } is not on { lv_tab }|. ev_result = '{}'.
        RETURN.
      ENDIF.
      APPEND ls_comp TO lt_keep.
      APPEND lv_field TO lt_sel.
    ENDLOOP.
  ENDIF.

  lo_line  = cl_abap_structdescr=>create( p_components = lt_keep ).
  lo_table = cl_abap_tabledescr=>create( p_line_type = lo_line ).
  CREATE DATA lr_data TYPE HANDLE lo_table.
  ASSIGN lr_data->* TO <lt_data>.

  TRY.
      IF lt_sel IS INITIAL.
        SELECT * FROM (lv_tab) UP TO lv_max ROWS
          INTO CORRESPONDING FIELDS OF TABLE <lt_data>
          WHERE (lv_where).
      ELSE.
        SELECT (lt_sel) FROM (lv_tab) UP TO lv_max ROWS
          INTO CORRESPONDING FIELDS OF TABLE <lt_data>
          WHERE (lv_where).
      ENDIF.
    CATCH cx_sy_dynamic_osql_error INTO lx_sql.
      ev_subrc = 8. ev_message = lx_sql->get_text( ). ev_result = '{}'.
      RETURN.
  ENDTRY.

  lv_rows = /ui2/cl_json=>serialize( data = <lt_data> ).
  lv_count = lines( <lt_data> ).
  lv_cnt = lv_count.
  CONDENSE lv_cnt.
  CONCATENATE '{"rows":' lv_rows ',"count":' lv_cnt '}' INTO ev_result.
  ev_subrc = 0.
  ev_message = 'OK'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DUMP_LIST - ST22 runtime error headers for a date range
*&---------------------------------------------------------------------*
* The ADT dump feed (CL_SABP_RABAX_ADT_RES_DUMPS) only returns the last
* 24 hours on this release, whatever "from" is sent. This action lists
* older dumps the way RS_ST22_GET_DUMPS does: SNAP header rows (SEQNO 000)
* with the runtime error, program, include and line decoded from FLIST.
* Variable contents never leave SAP - only the header fields below.
* Authority: same checks as ST22 (CL_ST22_TOOLS); without S_ADMI_FCD ST22
* only the logon client is listed.
* params: date_from, date_to (YYYYMMDD or YYYY-MM-DD; default last 7 days),
*         user (optional), max_rows (default 200, max 1000)
* result: COUNT, TRUNCATED, DUMPS = [{DATUM, UZEIT, AHOST, UNAME, MANDT,
*         MODNO, RUNTIME_ERROR, PROGRAM, INCLUDE, LINE}]
FORM dump_list USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  TYPES: BEGIN OF ty_dump,
           datum         TYPE snap-datum,
           uzeit         TYPE snap-uzeit,
           ahost         TYPE snap-ahost,
           uname         TYPE snap-uname,
           mandt         TYPE snap-mandt,
           modno         TYPE snap-modno,
           runtime_error TYPE string,
           program       TYPE string,
           include       TYPE string,
           line          TYPE string,
         END OF ty_dump.
  DATA: BEGIN OF ls_input,
          date_from TYPE string,
          date_to   TYPE string,
          user      TYPE string,
          max_rows  TYPE i,
        END OF ls_input.
  DATA: BEGIN OF ls_result,
          count     TYPE i,
          truncated TYPE abap_bool,
          dumps     TYPE STANDARD TABLE OF ty_dump WITH DEFAULT KEY,
        END OF ls_result.
  DATA: ls_snap  TYPE snap,
        ls_dump  TYPE ty_dump,
        lv_from  TYPE d,
        lv_to    TYPE d,
        lv_max   TYPE i,
        lv_fetch TYPE i,
        lv_x     TYPE i,
        lv_len   TYPE i,
        lv_found TYPE i,
        lv_tag   TYPE c LENGTH 2,
        lv_value TYPE string,
        lr_user  TYPE RANGE OF snap-uname,
        lr_mandt TYPE RANGE OF snap-mandt.
  FIELD-SYMBOLS <lv_buf> TYPE c.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).

  IF cl_st22_tools=>check_user_authorization_st22( ) <> 'X'.
    ev_subrc = 4.
    ev_message = 'DUMP_LIST: no ST22 authorization (S_TCODE ST22, S_DEVELOP OBJTYPE ST22 or DEBUG, ACTVT 03)'.
    ev_result = '{}'.
    RETURN.
  ENDIF.
  IF cl_st22_tools=>check_user_authoriz_client( ) <> cl_st22_tools=>c_authorization_all_clients.
    lr_mandt = VALUE #( ( sign = 'I' option = 'EQ' low = sy-mandt ) ).
  ENDIF.

  REPLACE ALL OCCURRENCES OF '-' IN ls_input-date_from WITH ''.
  REPLACE ALL OCCURRENCES OF '-' IN ls_input-date_to WITH ''.
  lv_from = ls_input-date_from.
  lv_to   = ls_input-date_to.
  IF lv_to IS INITIAL.
    lv_to = sy-datum.
  ENDIF.
  IF lv_from IS INITIAL.
    lv_from = lv_to - 7.
  ENDIF.
  lv_max = ls_input-max_rows.
  IF lv_max <= 0 OR lv_max > 1000.
    lv_max = 200.
  ENDIF.
  lv_fetch = lv_max + 1.
  IF ls_input-user IS NOT INITIAL.
    lr_user = VALUE #( ( sign = 'I' option = 'EQ' low = to_upper( condense( ls_input-user ) ) ) ).
  ENDIF.

  SELECT * FROM snap INTO ls_snap UP TO lv_fetch ROWS
    WHERE datum BETWEEN lv_from AND lv_to
      AND seqno = '000'
      AND uname IN lr_user
      AND mandt IN lr_mandt
    ORDER BY datum DESCENDING uzeit DESCENDING.

    CLEAR ls_dump.
    MOVE-CORRESPONDING ls_snap TO ls_dump.

    " FLIST: stream of <tag(2)><length(3)><value>, ended by '%'
    " (same decoding as RS_ST22_GET_DUMPS: FC error, AP program, AI include, AL line)
    ASSIGN ls_snap-flist(1600) TO <lv_buf> RANGE ls_snap.
    CLEAR: lv_x, lv_found.
    TRY.
        WHILE lv_x < 1595 AND <lv_buf>+lv_x(1) <> '%' AND lv_found < 4.
          lv_tag = <lv_buf>+lv_x(2).
          lv_x = lv_x + 2.
          lv_len = <lv_buf>+lv_x(3).
          lv_x = lv_x + 3.
          IF lv_len < 0 OR lv_x + lv_len > 1600.
            EXIT.
          ENDIF.
          lv_value = <lv_buf>+lv_x(lv_len).
          CASE lv_tag.
            WHEN 'FC'. ls_dump-runtime_error = lv_value. lv_found = lv_found + 1.
            WHEN 'AP'. ls_dump-program       = lv_value. lv_found = lv_found + 1.
            WHEN 'AI'. ls_dump-include       = lv_value. lv_found = lv_found + 1.
            WHEN 'AL'. ls_dump-line          = condense( lv_value ). lv_found = lv_found + 1.
          ENDCASE.
          lv_x = lv_x + lv_len.
        ENDWHILE.
      CATCH cx_sy_conversion_error cx_sy_data_access_error.
        " inconsistent stream - keep the header fields
    ENDTRY.

    APPEND ls_dump TO ls_result-dumps.
  ENDSELECT.

  IF lines( ls_result-dumps ) > lv_max.
    DELETE ls_result-dumps FROM lv_max + 1.
    ls_result-truncated = abap_true.
  ENDIF.
  ls_result-count = lines( ls_result-dumps ).
  ev_result = /ui2/cl_json=>serialize( data = ls_result ).
  ev_message = |{ ls_result-count } dump(s) { lv_from }-{ lv_to }|.
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
