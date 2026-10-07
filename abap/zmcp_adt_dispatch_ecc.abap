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
*      type `RPY_DYFIELD` does not exist on ECC 7.40 (S/4HANA-only DDIC).
*
* Supported actions:
*   DYNPRO_INSERT  — create screen   (RPY_DYNPRO_INSERT)
*   DYNPRO_READ    — read screen     (RPY_DYNPRO_READ)
*   DYNPRO_DELETE  — delete screen   (RPY_DYNPRO_DELETE)
*   CUA_FETCH      — read GUI status (RS_CUA_INTERNAL_FETCH)
*   CUA_WRITE      — write GUI status (RS_CUA_INTERNAL_WRITE)
*   CUA_DELETE     — delete GUI status (RS_CUA_DELETE)
*   TABLE_READ     — read-only SELECT on an allow-listed customizing table
*                    (MODACT, MODATTR, MODSAP, GB31, GB92, GB93, T001D, T001Q,
*                    TBE24, TBE34, TPS34, TFRM, TFRMT, T100); the
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
*& Form DYNPRO_INSERT — stub on ECC
*&---------------------------------------------------------------------*
* flow_logic line type on ECC 7.40 is `RPY_DYFLOW`; its internal field
* layout and the JSON round-trip mapping differ from S/4HANA enough that
* porting requires a dedicated pass. Until then this form is a stub so
* the other actions (READ / CUA) can compile and install cleanly.
FORM dynpro_insert USING iv_params TYPE string
                   CHANGING ev_subrc   TYPE i
                            ev_message TYPE string
                            ev_result  TYPE string.
  ev_subrc   = 4.
  ev_message = 'DYNPRO_INSERT not yet supported in the ECC variant — TODO'.
  ev_result  = '{}'.
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

  CALL FUNCTION 'RS_CUA_INTERNAL_WRITE'
    EXPORTING
      program         = CONV syrepid( to_upper( ls_input-program ) )
      language        = lv_lang
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
      unknown_version = 2
      OTHERS          = 3.

  ev_subrc = sy-subrc.
  IF sy-subrc <> 0.
    ev_message = |RS_CUA_INTERNAL_WRITE failed (sy-subrc={ sy-subrc })|.
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
*& Form TABLE_READ - read-only SELECT on an allow-listed customizing table
*&---------------------------------------------------------------------*
* Used by the MCP server where the ADT data preview is missing (BASIS < 7.50):
* GetSqlQuery / GetTableContents on CMOD (MODACT/MODATTR/MODSAP),
* GGB (GB31/GB92/GB93, FI assignment T001D/T001Q), BTE (TBE24/TBE34/TPS34),
* VOFM routines (TFRM/TFRMT) and message texts (T100).
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
        lv_rows   TYPE string.
  FIELD-SYMBOLS: <lt_data> TYPE STANDARD TABLE.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  lv_tab = to_upper( condense( ls_input-table_name ) ).

  " Allow list: customizing / repository tables only - never business data.
  IF lv_tab <> 'MODACT' AND lv_tab <> 'MODATTR' AND lv_tab <> 'MODSAP'
     AND lv_tab <> 'GB31' AND lv_tab <> 'GB92' AND lv_tab <> 'GB93'
     AND lv_tab <> 'T001D' AND lv_tab <> 'T001Q'
     AND lv_tab <> 'TBE24' AND lv_tab <> 'TBE34' AND lv_tab <> 'TPS34'
     AND lv_tab <> 'TFRM' AND lv_tab <> 'TFRMT' AND lv_tab <> 'T100'.
    ev_subrc = 4. ev_message = |TABLE_READ: table { lv_tab } is not allowed|. ev_result = '{}'.
    RETURN.
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

  lo_struct ?= cl_abap_typedescr=>describe_by_name( lv_tab ).
  lt_comp = lo_struct->get_components( ).

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
