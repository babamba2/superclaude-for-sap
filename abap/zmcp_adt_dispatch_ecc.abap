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
  " for role-matrix documents. IDoc partner profiles (EDP13 / EDP21) and
  " event type linkages (SWETYPECOU) are readable for the S/4HANA conversion
  " readiness report.
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
     AND lv_tab <> 'TVDIR' AND lv_tab <> 'OBJH' AND lv_tab <> 'OBJS' AND lv_tab <> 'OBJT'
     AND lv_tab <> 'E070' AND lv_tab <> 'E07T' AND lv_tab <> 'E071' AND lv_tab <> 'E071K'
     AND lv_tab <> 'SXS_ATTR' AND lv_tab <> 'SXC_EXIT' AND lv_tab <> 'SXC_ATTR'
     AND lv_tab <> 'SXC_CLASS' AND lv_tab <> 'ENHHEADER'
     AND lv_tab <> 'EDP13' AND lv_tab <> 'EDP21' AND lv_tab <> 'SWETYPECOU'.
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
