CLASS zcl_mcp_biz_wm DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Business actions on classic warehouse management, LE-WM (configs/WM/actions.json).
* Written in 7.31 syntax. ECC only: on S/4HANA the warehouse runs in EWM (out of scope),
* every WM action is refused there.
*
* Queries  WM.TO.LIST_OPEN / GET_DETAIL (LTAK, LTAP), WM.TR.LIST_OPEN / GET_DETAIL (LTBK, LTBP),
*          WM.STOCK.LIST (LQUA), WM.STOCK.COMPARE (MARD vs LQUA via T320), WM.BIN.LIST_EMPTY /
*          LIST_BLOCKED (LAGP), WM.PCN.LIST_OPEN (LUBU), WM.INV.LIST_OPEN / GET_DETAIL (LINK, LINP).
* Writes   WM.TO.CREATE_FOR_DLV (L_TO_CREATE_DN), WM.TO.CREATE_STOCK (L_TO_CREATE_SINGLE),
*          WM.TO.CREATE_FOR_TR (L_TO_CREATE_TR), WM.TO.CONFIRM (L_TO_CONFIRM, no differences),
*          WM.TO.CANCEL (L_TO_CANCEL), WM.TO.POSTING_CHANGE (L_TO_CREATE_POSTING_CHANGE),
*          WM.TR.CREATE (L_TR_CREATE_CHECK at preview, L_TR_CREATE at execute).
*          The L_TO_* modules have no test mode: the preview runs the checks of the handler
*          (status, bins, stock, configuration, authorization); every check runs again at EXECUTE.
* Authorization: L_LGNUM (warehouse / storage type) and L_BWLVS (movement type), fail closed.
* No person names are returned (creator, confirmer, counter).

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_tok,
        tanum TYPE ltak-tanum,
        bwlvs TYPE ltak-bwlvs,
        trart TYPE ltak-trart,
        bdatu TYPE ltak-bdatu,
        vbeln TYPE ltak-vbeln,
        tbnum TYPE ltak-tbnum,
        ubnum TYPE ltak-ubnum,
        kquit TYPE ltak-kquit,
      END OF ty_tok,
      ty_toks TYPE STANDARD TABLE OF ty_tok WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_top,
        tanum TYPE ltap-tanum,
        tapos TYPE ltap-tapos,
        matnr TYPE ltap-matnr,
        werks TYPE ltap-werks,
        lgort TYPE ltap-lgort,
        charg TYPE ltap-charg,
        bestq TYPE ltap-bestq,
        meins TYPE ltap-meins,
        vsolm TYPE ltap-vsolm,
        vltyp TYPE ltap-vltyp,
        vlpla TYPE ltap-vlpla,
        nltyp TYPE ltap-nltyp,
        nlpla TYPE ltap-nlpla,
        pquit TYPE ltap-pquit,
      END OF ty_top,
      ty_tops TYPE STANDARD TABLE OF ty_top WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_tbp,
        tbpos TYPE ltbp-tbpos,
        matnr TYPE ltbp-matnr,
        werks TYPE ltbp-werks,
        lgort TYPE ltbp-lgort,
        charg TYPE ltbp-charg,
        menge TYPE ltbp-menge,
        meins TYPE ltbp-meins,
        tamen TYPE ltbp-tamen,
        altme TYPE ltbp-altme,
        elikz TYPE ltbp-elikz,
      END OF ty_tbp,
      ty_tbps TYPE STANDARD TABLE OF ty_tbp WITH DEFAULT KEY.

    TYPES ty_r_lgtyp TYPE RANGE OF lgtyp.

    METHODS check_wh
      IMPORTING iv_lgnum  TYPE string
                iv_lgtyp  TYPE lgtyp OPTIONAL
      EXPORTING ev_lgnum  TYPE lgnum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS auth_lgtyp
      IMPORTING iv_lgnum     TYPE lgnum
                iv_lgtyp     TYPE lgtyp
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS check_bwlvs
      IMPORTING iv_lgnum  TYPE lgnum
                iv_bwlvs  TYPE string
      EXPORTING ev_bwlvs  TYPE bwlvs
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS check_material
      IMPORTING iv_lgnum  TYPE lgnum
                iv_matnr  TYPE string
      EXPORTING ev_matnr  TYPE matnr
                ev_meins  TYPE meins
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS to_matnr
      IMPORTING iv_matnr        TYPE string
      RETURNING VALUE(rv_matnr) TYPE matnr.

    METHODS to_num10
      IMPORTING iv_text       TYPE string
      RETURNING VALUE(rv_num) TYPE tanum.

    METHODS to_qty
      IMPORTING iv_text  TYPE string
      EXPORTING ev_qty   TYPE rl03t-anfme
                ev_ok    TYPE abap_bool.

    METHODS to_unit
      IMPORTING iv_unit        TYPE string
                iv_default     TYPE meins
      RETURNING VALUE(rv_unit) TYPE meins.

    METHODS max_rows
      IMPORTING iv_text       TYPE string
      RETURNING VALUE(rv_max) TYPE i.

    METHODS lgtyp_range
      IMPORTING iv_lgtyp        TYPE string
      RETURNING VALUE(rt_range) TYPE ty_r_lgtyp.

    METHODS bin_stock
      IMPORTING iv_lgnum      TYPE lgnum
                iv_matnr      TYPE matnr
                iv_werks      TYPE werks_d
                iv_charg      TYPE charg_d OPTIONAL
                iv_bestq      TYPE bestq OPTIONAL
                iv_lgtyp      TYPE lgtyp OPTIONAL
                iv_lgpla      TYPE lgpla OPTIONAL
      RETURNING VALUE(rv_qty) TYPE lqua-verme.

    METHODS read_to
      IMPORTING iv_lgnum TYPE lgnum
                iv_tanum TYPE tanum
      EXPORTING es_tok   TYPE ty_tok
                et_items TYPE ty_tops
                ev_found TYPE abap_bool.

    METHODS wait_to
      IMPORTING iv_lgnum        TYPE lgnum
                iv_tanum        TYPE tanum
      RETURNING VALUE(rv_found) TYPE abap_bool.

    METHODS to_rows
      IMPORTING it_items  TYPE ty_tops
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS status_text
      IMPORTING iv_domain      TYPE domname
                iv_value       TYPE any
      RETURNING VALUE(rv_text) TYPE string.

    " queries
    METHODS to_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS to_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS tr_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS tr_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS stock_list IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS stock_compare IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS bin_list
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_blocked       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS pcn_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS inv_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS inv_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " writes (preview = iv_execute false)
    METHODS to_for_dlv
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS to_stock
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS to_for_tr
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS to_confirm_cancel
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_cancel        TYPE abap_bool
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS to_posting_change
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS tr_create
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS run_write
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_kv
      IMPORTING iv_row   TYPE i
                iv_name  TYPE string
                iv_value TYPE any
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.

    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_sy_msg
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS fm_failed
      IMPORTING iv_fm     TYPE string
                iv_exc    TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.


CLASS zcl_mcp_biz_wm IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/WM/actions.json.
    ls_def-kind = 'query'. ls_def-risk = 'none'.
    ls_def-id = 'WM.TO.LIST_OPEN'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TO.GET_DETAIL'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TR.LIST_OPEN'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TR.GET_DETAIL'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.STOCK.LIST'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.STOCK.COMPARE'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.BIN.LIST_EMPTY'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.BIN.LIST_BLOCKED'. APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.PCN.LIST_OPEN'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.INV.LIST_OPEN'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.INV.GET_DETAIL'.   APPEND ls_def TO rt_actions.
    ls_def-kind = 'write'. ls_def-risk = 'medium'.
    ls_def-id = 'WM.TO.CREATE_FOR_DLV'. APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TO.CREATE_STOCK'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TO.CREATE_FOR_TR'.  APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TO.CONFIRM'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TO.CANCEL'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TO.POSTING_CHANGE'. APPEND ls_def TO rt_actions.
    ls_def-id = 'WM.TR.CREATE'.         APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    CASE iv_action.
      WHEN 'WM.TO.LIST_OPEN'.
        rs_result = to_list_open( is_params ).
      WHEN 'WM.TO.GET_DETAIL'.
        rs_result = to_get_detail( is_params ).
      WHEN 'WM.TR.LIST_OPEN'.
        rs_result = tr_list_open( is_params ).
      WHEN 'WM.TR.GET_DETAIL'.
        rs_result = tr_get_detail( is_params ).
      WHEN 'WM.STOCK.LIST'.
        rs_result = stock_list( is_params ).
      WHEN 'WM.STOCK.COMPARE'.
        rs_result = stock_compare( is_params ).
      WHEN 'WM.BIN.LIST_EMPTY'.
        rs_result = bin_list( is_params = is_params iv_blocked = abap_false ).
      WHEN 'WM.BIN.LIST_BLOCKED'.
        rs_result = bin_list( is_params = is_params iv_blocked = abap_true ).
      WHEN 'WM.PCN.LIST_OPEN'.
        rs_result = pcn_list_open( is_params ).
      WHEN 'WM.INV.LIST_OPEN'.
        rs_result = inv_list_open( is_params ).
      WHEN 'WM.INV.GET_DETAIL'.
        rs_result = inv_get_detail( is_params ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a query action|
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    rs_result-action = iv_action.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    rs_result = run_write( iv_action = iv_action is_params = is_params iv_execute = abap_false ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    rs_result = run_write( iv_action = iv_action is_params = is_params iv_execute = abap_true ).
  ENDMETHOD.


  METHOD run_write.
    CASE iv_action.
      WHEN 'WM.TO.CREATE_FOR_DLV'.
        rs_result = to_for_dlv( is_params = is_params iv_execute = iv_execute ).
      WHEN 'WM.TO.CREATE_STOCK'.
        rs_result = to_stock( is_params = is_params iv_execute = iv_execute ).
      WHEN 'WM.TO.CREATE_FOR_TR'.
        rs_result = to_for_tr( is_params = is_params iv_execute = iv_execute ).
      WHEN 'WM.TO.CONFIRM'.
        rs_result = to_confirm_cancel( is_params = is_params iv_cancel = abap_false iv_execute = iv_execute ).
      WHEN 'WM.TO.CANCEL'.
        rs_result = to_confirm_cancel( is_params = is_params iv_cancel = abap_true iv_execute = iv_execute ).
      WHEN 'WM.TO.POSTING_CHANGE'.
        rs_result = to_posting_change( is_params = is_params iv_execute = iv_execute ).
      WHEN 'WM.TR.CREATE'.
        rs_result = tr_create( is_params = is_params iv_execute = iv_execute ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a write action|
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    rs_result-action = iv_action.
    IF iv_execute = abap_true.
      rs_result-mode = 'EXECUTE'.
    ELSE.
      rs_result-mode = 'PREVIEW'.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD check_wh.
    DATA: lv_in   TYPE string,
          lv_t300 TYPE t300-lgnum,
          lv_text TYPE string.

    CLEAR ev_lgnum.
    IF zcl_mcp_biz_sys=>get( )->family( ) = zif_mcp_biz_sys=>c_family_s4.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'Classic WM actions are not offered on S/4HANA: the warehouse runs in EWM (out of scope)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_in = to_upper( condense( iv_lgnum ) ).
    IF lv_in IS INITIAL OR strlen( lv_in ) > 3.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lgnum is required (warehouse number, up to 3 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE lgnum FROM t300 INTO lv_t300 WHERE lgnum = lv_in.
    IF sy-subrc <> 0.
      lv_text = |Warehouse { lv_in } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF iv_lgtyp IS INITIAL.
      AUTHORITY-CHECK OBJECT 'L_LGNUM' ID 'LGNUM' FIELD lv_t300 ID 'LGTYP' DUMMY.
    ELSE.
      AUTHORITY-CHECK OBJECT 'L_LGNUM' ID 'LGNUM' FIELD lv_t300 ID 'LGTYP' FIELD iv_lgtyp.
    ENDIF.
    IF sy-subrc <> 0.
      lv_text = |No authorization for warehouse { lv_in }|.
      IF iv_lgtyp IS NOT INITIAL.
        lv_text = |{ lv_text } storage type { iv_lgtyp }|.
      ENDIF.
      lv_text = |{ lv_text } (L_LGNUM)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_lgnum = lv_t300.
  ENDMETHOD.


  METHOD auth_lgtyp.
    rv_ok = abap_true.
    IF iv_lgtyp IS INITIAL.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'L_LGNUM' ID 'LGNUM' FIELD iv_lgnum ID 'LGTYP' FIELD iv_lgtyp.
    IF sy-subrc <> 0.
      rv_ok = abap_false.
    ENDIF.
  ENDMETHOD.


  METHOD check_bwlvs.
    DATA: lv_in   TYPE string,
          lv_bw   TYPE t333-bwlvs,
          lv_text TYPE string.

    CLEAR ev_bwlvs.
    lv_in = condense( iv_bwlvs ).
    IF lv_in IS INITIAL OR strlen( lv_in ) > 3 OR lv_in CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bwlvs is required (WM movement type, 3 digits, e.g. 999)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_bw = lv_in.
    SELECT SINGLE bwlvs FROM t333 INTO lv_bw WHERE lgnum = iv_lgnum AND bwlvs = lv_bw.
    IF sy-subrc <> 0.
      lv_text = |WM movement type { lv_in } does not exist in warehouse { iv_lgnum } (T333)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'L_BWLVS' ID 'LGNUM' FIELD iv_lgnum ID 'BWLVS' FIELD lv_bw.
    IF sy-subrc <> 0.
      lv_text = |No authorization for WM movement type { lv_bw } in warehouse { iv_lgnum } (L_BWLVS)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_bwlvs = lv_bw.
  ENDMETHOD.


  METHOD check_material.
    DATA: lv_mlgn TYPE mlgn-matnr,
          lv_text TYPE string.

    CLEAR: ev_matnr, ev_meins.
    IF iv_matnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr is required (material)' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_matnr = to_matnr( iv_matnr ).
    SELECT SINGLE meins FROM mara INTO ev_meins WHERE matnr = ev_matnr.
    IF sy-subrc <> 0.
      lv_text = |Material { iv_matnr } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      CLEAR ev_matnr.
      RETURN.
    ENDIF.
    SELECT SINGLE matnr FROM mlgn INTO lv_mlgn WHERE matnr = ev_matnr AND lgnum = iv_lgnum.
    IF sy-subrc <> 0.
      lv_text = |Material { iv_matnr } has no warehouse management view for warehouse { iv_lgnum } (MLGN)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      CLEAR ev_matnr.
    ENDIF.
  ENDMETHOD.


  METHOD to_matnr.
    DATA lv_in TYPE string.

    lv_in = to_upper( condense( iv_matnr ) ).
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
      EXPORTING
        input        = lv_in
      IMPORTING
        output       = rv_matnr
      EXCEPTIONS
        length_error = 1
        OTHERS       = 2.
    IF sy-subrc <> 0.
      rv_matnr = lv_in.
    ENDIF.
  ENDMETHOD.


  METHOD to_num10.
    DATA lv_in TYPE string.

    CLEAR rv_num.
    lv_in = condense( iv_text ).
    IF lv_in IS INITIAL OR strlen( lv_in ) > 10 OR lv_in CN '0123456789'.
      RETURN.
    ENDIF.
    rv_num = lv_in.
  ENDMETHOD.


  METHOD to_qty.
    DATA lv_in TYPE string.

    CLEAR: ev_qty, ev_ok.
    lv_in = condense( iv_text ).
    REPLACE ALL OCCURRENCES OF ',' IN lv_in WITH '.'.
    IF lv_in IS INITIAL OR lv_in CN '0123456789.'.
      RETURN.
    ENDIF.
    TRY.
        ev_qty = lv_in.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_overflow.
        RETURN.
    ENDTRY.
    IF ev_qty > 0.
      ev_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD to_unit.
    DATA lv_in TYPE string.

    lv_in = to_upper( condense( iv_unit ) ).
    IF lv_in IS INITIAL.
      rv_unit = iv_default.
      RETURN.
    ENDIF.
    CALL FUNCTION 'CONVERSION_EXIT_CUNIT_INPUT'
      EXPORTING
        input          = lv_in
        language       = sy-langu
      IMPORTING
        output         = rv_unit
      EXCEPTIONS
        unit_not_found = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      CLEAR rv_unit.
    ENDIF.
  ENDMETHOD.


  METHOD max_rows.
    DATA lv_in TYPE string.

    rv_max = 50.
    lv_in = condense( iv_text ).
    IF lv_in IS INITIAL OR lv_in CN '0123456789' OR strlen( lv_in ) > 4.
      RETURN.
    ENDIF.
    rv_max = lv_in.
    IF rv_max < 1.
      rv_max = 50.
    ELSEIF rv_max > 500.
      rv_max = 500.
    ENDIF.
  ENDMETHOD.


  METHOD lgtyp_range.
    DATA: lv_in TYPE string,
          ls_r  LIKE LINE OF rt_range.

    lv_in = to_upper( condense( iv_lgtyp ) ).
    IF lv_in IS INITIAL.
      RETURN.
    ENDIF.
    ls_r-sign = 'I'.
    IF lv_in CA '*+'.
      ls_r-option = 'CP'.
    ELSE.
      ls_r-option = 'EQ'.
    ENDIF.
    ls_r-low = lv_in.
    APPEND ls_r TO rt_range.
  ENDMETHOD.


  METHOD bin_stock.
    " Available quantity (VERME) of the material in the warehouse; interim storage types (9xx)
    " are left out unless a storage type is given.
    DATA: lr_charg TYPE RANGE OF charg_d,
          lr_bestq TYPE RANGE OF bestq,
          lr_lgtyp TYPE RANGE OF lgtyp,
          lr_lgpla TYPE RANGE OF lgpla,
          ls_charg LIKE LINE OF lr_charg,
          ls_bestq LIKE LINE OF lr_bestq,
          ls_lgtyp LIKE LINE OF lr_lgtyp,
          ls_lgpla LIKE LINE OF lr_lgpla.

    IF iv_charg IS NOT INITIAL.
      ls_charg-sign = 'I'. ls_charg-option = 'EQ'. ls_charg-low = iv_charg. APPEND ls_charg TO lr_charg.
    ENDIF.
    IF iv_bestq IS SUPPLIED.
      ls_bestq-sign = 'I'. ls_bestq-option = 'EQ'. ls_bestq-low = iv_bestq. APPEND ls_bestq TO lr_bestq.
    ENDIF.
    IF iv_lgtyp IS NOT INITIAL.
      ls_lgtyp-sign = 'I'. ls_lgtyp-option = 'EQ'. ls_lgtyp-low = iv_lgtyp. APPEND ls_lgtyp TO lr_lgtyp.
    ELSE.
      ls_lgtyp-sign = 'E'. ls_lgtyp-option = 'CP'. ls_lgtyp-low = '9*'. APPEND ls_lgtyp TO lr_lgtyp.
    ENDIF.
    IF iv_lgpla IS NOT INITIAL.
      ls_lgpla-sign = 'I'. ls_lgpla-option = 'EQ'. ls_lgpla-low = iv_lgpla. APPEND ls_lgpla TO lr_lgpla.
    ENDIF.
    SELECT SUM( verme ) FROM lqua INTO rv_qty
      WHERE lgnum = iv_lgnum AND matnr = iv_matnr AND werks = iv_werks
        AND charg IN lr_charg AND bestq IN lr_bestq AND lgtyp IN lr_lgtyp AND lgpla IN lr_lgpla.
  ENDMETHOD.


  METHOD read_to.
    CLEAR: es_tok, et_items, ev_found.
    SELECT SINGLE tanum bwlvs trart bdatu vbeln tbnum ubnum kquit FROM ltak
      INTO es_tok WHERE lgnum = iv_lgnum AND tanum = iv_tanum.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    ev_found = abap_true.
    SELECT tanum tapos matnr werks lgort charg bestq meins vsolm vltyp vlpla nltyp nlpla pquit
      FROM ltap INTO TABLE et_items
      WHERE lgnum = iv_lgnum AND tanum = iv_tanum
      ORDER BY tapos.
  ENDMETHOD.


  METHOD wait_to.
    DATA lv_tanum TYPE ltak-tanum.

    DO 10 TIMES.
      SELECT SINGLE tanum FROM ltak INTO lv_tanum WHERE lgnum = iv_lgnum AND tanum = iv_tanum.
      IF sy-subrc = 0.
        rv_found = abap_true.
        RETURN.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
  ENDMETHOD.


  METHOD to_rows.
    DATA: ls_it  TYPE ty_top,
          lv_row TYPE i,
          lv_mat TYPE string.

    LOOP AT it_items INTO ls_it.
      lv_row = lv_row + 1.
      lv_mat = ls_it-matnr.
      SHIFT lv_mat LEFT DELETING LEADING '0'.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO_ITEM'  iv_value = ls_it-tapos CHANGING ct_rows = cs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MATERIAL' iv_value = lv_mat CHANGING ct_rows = cs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANT'    iv_value = ls_it-werks CHANGING ct_rows = cs_result-rows ).
      IF ls_it-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_it-charg CHANGING ct_rows = cs_result-rows ).
      ENDIF.
      IF ls_it-bestq IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_CATEGORY' iv_value = ls_it-bestq CHANGING ct_rows = cs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = |{ ls_it-vsolm } { ls_it-meins }| CHANGING ct_rows = cs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FROM'     iv_value = |{ ls_it-vltyp } / { ls_it-vlpla }| CHANGING ct_rows = cs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO'       iv_value = |{ ls_it-nltyp } / { ls_it-nlpla }| CHANGING ct_rows = cs_result-rows ).
      IF ls_it-pquit = abap_true.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = 'confirmed' CHANGING ct_rows = cs_result-rows ).
      ELSE.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = 'open' CHANGING ct_rows = cs_result-rows ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD status_text.
    DATA lv_val TYPE dd07l-domvalue_l.

    lv_val = iv_value.
    SELECT SINGLE ddtext FROM dd07t INTO rv_text
      WHERE domname = iv_domain AND ddlanguage = 'E' AND as4local = 'A' AND domvalue_l = lv_val.
    IF sy-subrc <> 0 OR rv_text IS INITIAL.
      rv_text = lv_val.
      IF rv_text IS INITIAL.
        rv_text = 'open'.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD to_list_open.
    TYPES: BEGIN OF ty_p,
             tanum TYPE ltap-tanum,
             tapos TYPE ltap-tapos,
             pquit TYPE ltap-pquit,
             vltyp TYPE ltap-vltyp,
             nltyp TYPE ltap-nltyp,
           END OF ty_p.
    DATA: lv_lgnum TYPE lgnum,
          lv_vbeln TYPE ltak-vbeln,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lt_k     TYPE ty_toks,
          ls_k     TYPE ty_tok,
          lt_p     TYPE STANDARD TABLE OF ty_p,
          ls_p     TYPE ty_p,
          lv_items TYPE i,
          lv_open  TYPE i,
          lv_hit   TYPE abap_bool,
          lv_row   TYPE i,
          lv_nopen TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    IF is_params-vbeln IS NOT INITIAL.
      lv_vbeln = to_num10( is_params-vbeln ).
      IF lv_vbeln IS INITIAL OR lv_vbeln CO '0'.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln must be a delivery number (digits, up to 10)'
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      SELECT tanum bwlvs trart bdatu vbeln tbnum ubnum kquit FROM ltak INTO TABLE lt_k
        WHERE lgnum = lv_lgnum AND vbeln = lv_vbeln.
    ELSE.
      SELECT tanum bwlvs trart bdatu vbeln tbnum ubnum kquit FROM ltak INTO TABLE lt_k UP TO 5000 ROWS
        WHERE lgnum = lv_lgnum AND kquit = space.
    ENDIF.
    SORT lt_k BY bdatu DESCENDING tanum DESCENDING.
    IF lt_k IS NOT INITIAL.
      SELECT tanum tapos pquit vltyp nltyp FROM ltap INTO TABLE lt_p
        FOR ALL ENTRIES IN lt_k WHERE lgnum = lv_lgnum AND tanum = lt_k-tanum.
      SORT lt_p BY tanum tapos.
    ENDIF.

    LOOP AT lt_k INTO ls_k.
      CLEAR: lv_items, lv_open, lv_hit.
      LOOP AT lt_p INTO ls_p WHERE tanum = ls_k-tanum.
        lv_items = lv_items + 1.
        IF ls_p-pquit IS INITIAL.
          lv_open = lv_open + 1.
        ENDIF.
        IF lr_lgtyp IS INITIAL OR ls_p-vltyp IN lr_lgtyp OR ls_p-nltyp IN lr_lgtyp.
          lv_hit = abap_true.
        ENDIF.
      ENDLOOP.
      IF lr_lgtyp IS NOT INITIAL AND lv_hit = abap_false.
        CONTINUE.
      ENDIF.
      IF ls_k-kquit IS INITIAL.
        lv_nopen = lv_nopen + 1.
      ENDIF.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO'          iv_value = ls_k-tanum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MOVEMENT'    iv_value = ls_k-bwlvs CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED'     iv_value = ls_k-bdatu CHANGING ct_rows = rs_result-rows ).
      IF ls_k-vbeln IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'DELIVERY' iv_value = ls_k-vbeln CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_k-tbnum IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'TRANSFER_REQUIREMENT' iv_value = ls_k-tbnum CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_k-ubnum IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'POSTING_CHANGE' iv_value = ls_k-ubnum CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEMS'      iv_value = lv_items CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OPEN_ITEMS' iv_value = lv_open CHANGING ct_rows = rs_result-rows ).
      IF ls_k-kquit IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = 'confirmed' CHANGING ct_rows = rs_result-rows ).
      ELSEIF lv_open < lv_items.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = 'partly confirmed' CHANGING ct_rows = rs_result-rows ).
      ELSE.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = 'open' CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.

    IF lv_vbeln IS NOT INITIAL.
      lv_text = |Delivery { is_params-vbeln } in warehouse { lv_lgnum }: { lv_row } transfer orders ({ lv_nopen } open)|.
    ELSE.
      lv_text = |Warehouse { lv_lgnum }: { lv_nopen } open transfer orders|.
      IF lr_lgtyp IS NOT INITIAL.
        lv_text = |{ lv_text } with storage type { is_params-lgtyp }|.
      ENDIF.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD to_get_detail.
    DATA: lv_lgnum TYPE lgnum,
          lv_tanum TYPE tanum,
          ls_k     TYPE ty_tok,
          lt_it    TYPE ty_tops,
          ls_it    TYPE ty_top,
          lv_found TYPE abap_bool,
          lv_open  TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_tanum = to_num10( is_params-tanum ).
    IF lv_tanum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tanum is required (transfer order number, digits up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_it ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Transfer order { is_params-tanum } not found in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    to_rows( EXPORTING it_items = lt_it CHANGING cs_result = rs_result ).
    LOOP AT lt_it INTO ls_it WHERE pquit IS INITIAL.
      lv_open = lv_open + 1.
    ENDLOOP.
    lv_text = |TO { ls_k-tanum } (warehouse { lv_lgnum }, movement type { ls_k-bwlvs }, created { ls_k-bdatu }): | &&
              |{ lines( lt_it ) } items, { lv_open } open|.
    IF ls_k-kquit IS NOT INITIAL.
      lv_text = |{ lv_text }, confirmed|.
    ENDIF.
    IF ls_k-vbeln IS NOT INITIAL.
      lv_text = |{ lv_text }, delivery { ls_k-vbeln }|.
    ENDIF.
    IF ls_k-tbnum IS NOT INITIAL.
      lv_text = |{ lv_text }, transfer requirement { ls_k-tbnum }|.
    ENDIF.
    IF ls_k-ubnum IS NOT INITIAL.
      lv_text = |{ lv_text }, posting change { ls_k-ubnum }|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD tr_list_open.
    TYPES: BEGIN OF ty_k,
             tbnum TYPE ltbk-tbnum,
             statu TYPE ltbk-statu,
             bwlvs TYPE ltbk-bwlvs,
             betyp TYPE ltbk-betyp,
             benum TYPE ltbk-benum,
             bdatu TYPE ltbk-bdatu,
           END OF ty_k,
           BEGIN OF ty_n,
             tbnum TYPE ltbp-tbnum,
           END OF ty_n.
    DATA: lv_lgnum TYPE lgnum,
          lv_matnr TYPE matnr,
          lv_max   TYPE i,
          lt_k     TYPE STANDARD TABLE OF ty_k,
          ls_k     TYPE ty_k,
          lt_n     TYPE STANDARD TABLE OF ty_n,
          lv_items TYPE i,
          lv_row   TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).
    IF is_params-matnr IS NOT INITIAL.
      lv_matnr = to_matnr( is_params-matnr ).
      SELECT DISTINCT tbnum FROM ltbp INTO TABLE lt_n WHERE lgnum = lv_lgnum AND matnr = lv_matnr.
      IF lt_n IS NOT INITIAL.
        SELECT tbnum statu bwlvs betyp benum bdatu FROM ltbk INTO TABLE lt_k
          FOR ALL ENTRIES IN lt_n WHERE lgnum = lv_lgnum AND tbnum = lt_n-tbnum AND statu <> 'E'.
      ENDIF.
    ELSE.
      SELECT tbnum statu bwlvs betyp benum bdatu FROM ltbk INTO TABLE lt_k UP TO 5000 ROWS
        WHERE lgnum = lv_lgnum AND statu <> 'E'.
    ENDIF.
    SORT lt_k BY bdatu DESCENDING tbnum DESCENDING.
    LOOP AT lt_k INTO ls_k.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      SELECT COUNT(*) FROM ltbp INTO lv_items WHERE lgnum = lv_lgnum AND tbnum = ls_k-tbnum.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TR'       iv_value = ls_k-tbnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'   iv_value = status_text( iv_domain = 'LTBK_STATU' iv_value = ls_k-statu ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MOVEMENT' iv_value = ls_k-bwlvs CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'REQUIREMENT' iv_value = |{ ls_k-betyp } { ls_k-benum }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED'  iv_value = ls_k-bdatu CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEMS'    iv_value = lv_items CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_text = |Warehouse { lv_lgnum }: { lines( lt_k ) } open transfer requirements|.
    IF lv_matnr IS NOT INITIAL.
      lv_text = |{ lv_text } for material { is_params-matnr }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD tr_get_detail.
    DATA: lv_lgnum TYPE lgnum,
          lv_tbnum TYPE tbnum,
          lv_statu TYPE ltbk-statu,
          lv_bwlvs TYPE ltbk-bwlvs,
          lv_betyp TYPE ltbk-betyp,
          lv_benum TYPE ltbk-benum,
          lv_bdatu TYPE ltbk-bdatu,
          lt_p     TYPE ty_tbps,
          ls_p     TYPE ty_tbp,
          lv_open  TYPE ltbp-menge,
          lv_row   TYPE i,
          lv_mat   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_tbnum = to_num10( is_params-tbnum ).
    IF lv_tbnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tbnum is required (transfer requirement number, digits up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE statu bwlvs betyp benum bdatu FROM ltbk INTO (lv_statu, lv_bwlvs, lv_betyp, lv_benum, lv_bdatu)
      WHERE lgnum = lv_lgnum AND tbnum = lv_tbnum.
    IF sy-subrc <> 0.
      lv_text = |Transfer requirement { is_params-tbnum } not found in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT tbpos matnr werks lgort charg menge meins tamen altme elikz FROM ltbp INTO TABLE lt_p
      WHERE lgnum = lv_lgnum AND tbnum = lv_tbnum ORDER BY tbpos.
    LOOP AT lt_p INTO ls_p.
      lv_row = lv_row + 1.
      lv_mat = ls_p-matnr.
      SHIFT lv_mat LEFT DELETING LEADING '0'.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TR_ITEM'   iv_value = ls_p-tbpos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MATERIAL'  iv_value = lv_mat CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANT'     iv_value = |{ ls_p-werks } { ls_p-lgort }| CHANGING ct_rows = rs_result-rows ).
      IF ls_p-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_p-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY'  iv_value = |{ ls_p-menge } { ls_p-meins }| CHANGING ct_rows = rs_result-rows ).
      lv_open = ls_p-menge - ls_p-tamen.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OPEN'      iv_value = |{ lv_open } { ls_p-meins }| CHANGING ct_rows = rs_result-rows ).
      IF ls_p-elikz IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = 'completed' CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    lv_text = |TR { lv_tbnum } (warehouse { lv_lgnum }, movement type { lv_bwlvs }, requirement { lv_betyp } { lv_benum }, | &&
              |created { lv_bdatu }): { status_text( iv_domain = 'LTBK_STATU' iv_value = lv_statu ) }, { lines( lt_p ) } items|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD stock_list.
    TYPES: BEGIN OF ty_q,
             lgtyp TYPE lqua-lgtyp,
             lgpla TYPE lqua-lgpla,
             matnr TYPE lqua-matnr,
             werks TYPE lqua-werks,
             lgort TYPE lqua-lgort,
             charg TYPE lqua-charg,
             bestq TYPE lqua-bestq,
             sobkz TYPE lqua-sobkz,
             verme TYPE lqua-verme,
             gesme TYPE lqua-gesme,
             meins TYPE lqua-meins,
           END OF ty_q,
           BEGIN OF ty_g,
             lgtyp TYPE lqua-lgtyp,
             cnt   TYPE i,
           END OF ty_g.
    DATA: lv_lgnum TYPE lgnum,
          lv_max   TYPE i,
          lr_matnr TYPE RANGE OF matnr,
          lr_lgtyp TYPE ty_r_lgtyp,
          lr_lgpla TYPE RANGE OF lgpla,
          lr_werks TYPE RANGE OF werks_d,
          ls_matnr LIKE LINE OF lr_matnr,
          ls_lgpla LIKE LINE OF lr_lgpla,
          ls_werks LIKE LINE OF lr_werks,
          lt_q     TYPE STANDARD TABLE OF ty_q,
          ls_q     TYPE ty_q,
          lt_g     TYPE STANDARD TABLE OF ty_g,
          ls_g     TYPE ty_g,
          lv_total TYPE lqua-gesme,
          lv_avail TYPE lqua-verme,
          lv_unit  TYPE meins,
          lv_one   TYPE abap_bool,
          lv_row   TYPE i,
          lv_mat   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).
    IF is_params-matnr IS NOT INITIAL.
      ls_matnr-sign = 'I'. ls_matnr-option = 'EQ'. ls_matnr-low = to_matnr( is_params-matnr ). APPEND ls_matnr TO lr_matnr.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    IF is_params-lgpla IS NOT INITIAL.
      ls_lgpla-sign = 'I'. ls_lgpla-option = 'EQ'. ls_lgpla-low = to_upper( condense( is_params-lgpla ) ). APPEND ls_lgpla TO lr_lgpla.
    ENDIF.
    IF is_params-werks IS NOT INITIAL.
      ls_werks-sign = 'I'. ls_werks-option = 'EQ'. ls_werks-low = to_upper( condense( is_params-werks ) ). APPEND ls_werks TO lr_werks.
    ENDIF.

    " Warehouse only: quants per storage type.
    IF lr_matnr IS INITIAL AND lr_lgtyp IS INITIAL AND lr_lgpla IS INITIAL.
      SELECT lgtyp COUNT(*) FROM lqua INTO TABLE lt_g
        WHERE lgnum = lv_lgnum AND werks IN lr_werks GROUP BY lgtyp.
      SORT lt_g BY lgtyp.
      LOOP AT lt_g INTO ls_g.
        lv_row = lv_row + 1.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STORAGE_TYPE' iv_value = ls_g-lgtyp CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTS'       iv_value = ls_g-cnt CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      rs_result-summary = |Warehouse { lv_lgnum }: stock in { lines( lt_g ) } storage types (give matnr, lgtyp or lgpla for the quants)|.
      RETURN.
    ENDIF.

    SELECT lgtyp lgpla matnr werks lgort charg bestq sobkz verme gesme meins FROM lqua INTO TABLE lt_q UP TO 5000 ROWS
      WHERE lgnum = lv_lgnum AND matnr IN lr_matnr AND lgtyp IN lr_lgtyp AND lgpla IN lr_lgpla AND werks IN lr_werks.
    SORT lt_q BY lgtyp lgpla matnr charg.
    lv_one = abap_true.
    LOOP AT lt_q INTO ls_q.
      lv_total = lv_total + ls_q-gesme.
      lv_avail = lv_avail + ls_q-verme.
      IF lv_unit IS INITIAL.
        lv_unit = ls_q-meins.
      ELSEIF lv_unit <> ls_q-meins.
        lv_one = abap_false.
      ENDIF.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      lv_mat = ls_q-matnr.
      SHIFT lv_mat LEFT DELETING LEADING '0'.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN'       iv_value = |{ ls_q-lgtyp } / { ls_q-lgpla }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MATERIAL'  iv_value = lv_mat CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANT'     iv_value = |{ ls_q-werks } { ls_q-lgort }| CHANGING ct_rows = rs_result-rows ).
      IF ls_q-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_q-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_q-bestq IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_CATEGORY' iv_value = ls_q-bestq CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_q-sobkz IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'SPECIAL_STOCK' iv_value = ls_q-sobkz CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'AVAILABLE' iv_value = |{ ls_q-verme } { ls_q-meins }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TOTAL'     iv_value = |{ ls_q-gesme } { ls_q-meins }| CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_text = |Warehouse { lv_lgnum }: { lines( lt_q ) } quants|.
    IF lt_q IS NOT INITIAL AND lv_one = abap_true.
      lv_text = |{ lv_text }, total { lv_total } { lv_unit }, available { lv_avail } { lv_unit }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD stock_compare.
    TYPES: BEGIN OF ty_a,
             werks TYPE t320-werks,
             lgort TYPE t320-lgort,
           END OF ty_a.
    DATA: lv_lgnum TYPE lgnum,
          lv_matnr TYPE matnr,
          lv_meins TYPE meins,
          lt_a     TYPE STANDARD TABLE OF ty_a,
          ls_a     TYPE ty_a,
          lv_labst TYPE mard-labst,
          lv_insme TYPE mard-insme,
          lv_speme TYPE mard-speme,
          lv_im    TYPE mard-labst,
          lv_wm    TYPE lqua-gesme,
          lv_diff  TYPE lqua-gesme,
          lv_ndiff TYPE i,
          lv_werks TYPE werks_d,
          lv_lgort TYPE lgort_d,
          lv_row   TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-matnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr is required (material)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_matnr = to_matnr( is_params-matnr ).
    SELECT SINGLE meins FROM mara INTO lv_meins WHERE matnr = lv_matnr.
    IF sy-subrc <> 0.
      lv_text = |Material { is_params-matnr } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT werks lgort FROM t320 INTO TABLE lt_a WHERE lgnum = lv_lgnum.
    lv_werks = to_upper( condense( is_params-werks ) ).
    lv_lgort = to_upper( condense( is_params-lgort ) ).
    IF lv_werks IS NOT INITIAL.
      DELETE lt_a WHERE werks <> lv_werks.
    ENDIF.
    IF lv_lgort IS NOT INITIAL.
      DELETE lt_a WHERE lgort <> lv_lgort.
    ENDIF.
    IF lt_a IS INITIAL.
      lv_text = |No plant / storage location is assigned to warehouse { lv_lgnum } for this selection (T320)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SORT lt_a BY werks lgort.
    LOOP AT lt_a INTO ls_a.
      CLEAR: lv_labst, lv_insme, lv_speme, lv_wm.
      SELECT SINGLE labst insme speme FROM mard INTO (lv_labst, lv_insme, lv_speme)
        WHERE matnr = lv_matnr AND werks = ls_a-werks AND lgort = ls_a-lgort.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      lv_im = lv_labst + lv_insme + lv_speme.
      SELECT SUM( gesme ) FROM lqua INTO lv_wm
        WHERE lgnum = lv_lgnum AND matnr = lv_matnr AND werks = ls_a-werks AND lgort = ls_a-lgort.
      lv_diff = lv_im - lv_wm.
      IF lv_diff <> 0.
        lv_ndiff = lv_ndiff + 1.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANT'           iv_value = |{ ls_a-werks } { ls_a-lgort }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'IM_UNRESTRICTED' iv_value = lv_labst CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'IM_QUALITY'      iv_value = lv_insme CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'IM_BLOCKED'      iv_value = lv_speme CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'IM_TOTAL'        iv_value = lv_im CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WM_TOTAL'        iv_value = lv_wm CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'DIFFERENCE'      iv_value = lv_diff CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT'            iv_value = lv_meins CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF lv_row = 0.
      lv_text = |Material { is_params-matnr } has no storage location stock in the plants of warehouse { lv_lgnum }|.
    ELSEIF lv_ndiff = 0.
      lv_text = |Material { is_params-matnr }, warehouse { lv_lgnum }: IM and WM stock are equal in { lv_row } storage locations|.
    ELSE.
      lv_text = |Material { is_params-matnr }, warehouse { lv_lgnum }: IM and WM stock differ in { lv_ndiff } of { lv_row } storage locations | &&
                |(open transfer orders, interim storage types or errors)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD bin_list.
    TYPES: BEGIN OF ty_b,
             lgtyp TYPE lagp-lgtyp,
             lgpla TYPE lagp-lgpla,
             lgber TYPE lagp-lgber,
             lptyp TYPE lagp-lptyp,
             skzua TYPE lagp-skzua,
             skzue TYPE lagp-skzue,
             spgru TYPE lagp-spgru,
             kzinv TYPE lagp-kzinv,
           END OF ty_b.
    DATA: lv_lgnum TYPE lgnum,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lt_b     TYPE STANDARD TABLE OF ty_b,
          ls_b     TYPE ty_b,
          lv_cnt   TYPE i,
          lv_row   TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    IF iv_blocked = abap_true.
      SELECT COUNT(*) FROM lagp INTO lv_cnt
        WHERE lgnum = lv_lgnum AND lgtyp IN lr_lgtyp AND ( skzua = abap_true OR skzue = abap_true ).
      SELECT lgtyp lgpla lgber lptyp skzua skzue spgru kzinv FROM lagp INTO TABLE lt_b UP TO lv_max ROWS
        WHERE lgnum = lv_lgnum AND lgtyp IN lr_lgtyp AND ( skzua = abap_true OR skzue = abap_true )
        ORDER BY lgtyp lgpla.
    ELSE.
      SELECT COUNT(*) FROM lagp INTO lv_cnt
        WHERE lgnum = lv_lgnum AND lgtyp IN lr_lgtyp AND kzler = abap_true.
      SELECT lgtyp lgpla lgber lptyp skzua skzue spgru kzinv FROM lagp INTO TABLE lt_b UP TO lv_max ROWS
        WHERE lgnum = lv_lgnum AND lgtyp IN lr_lgtyp AND kzler = abap_true
        ORDER BY lgtyp lgpla.
    ENDIF.
    IF lv_cnt > lines( lt_b ).
      rs_result-truncated = abap_true.
    ENDIF.
    LOOP AT lt_b INTO ls_b.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN'      iv_value = |{ ls_b-lgtyp } / { ls_b-lgpla }| CHANGING ct_rows = rs_result-rows ).
      IF ls_b-lgber IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'SECTION'  iv_value = ls_b-lgber CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_b-lptyp IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN_TYPE' iv_value = ls_b-lptyp CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_b-skzua IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'REMOVAL_BLOCK' iv_value = 'X' CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_b-skzue IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PUTAWAY_BLOCK' iv_value = 'X' CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_b-spgru IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BLOCK_REASON' iv_value = ls_b-spgru CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_b-kzinv IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'INVENTORY' iv_value = ls_b-kzinv CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    IF iv_blocked = abap_true.
      lv_text = |Warehouse { lv_lgnum }: { lv_cnt } blocked storage bins|.
    ELSE.
      lv_text = |Warehouse { lv_lgnum }: { lv_cnt } empty storage bins|.
    ENDIF.
    IF lr_lgtyp IS NOT INITIAL.
      lv_text = |{ lv_text } in storage type { is_params-lgtyp }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD pcn_list_open.
    TYPES: BEGIN OF ty_u,
             ubnum TYPE lubu-ubnum,
             statu TYPE lubu-statu,
             bdatu TYPE lubu-bdatu,
             bwart TYPE lubu-bwart,
             bwlvs TYPE lubu-bwlvs,
             matn1 TYPE lubu-matn1,
             werk1 TYPE lubu-werk1,
             bstq1 TYPE lubu-bstq1,
             chrg1 TYPE lubu-chrg1,
             matn2 TYPE lubu-matn2,
             werk2 TYPE lubu-werk2,
             bstq2 TYPE lubu-bstq2,
             chrg2 TYPE lubu-chrg2,
             menge TYPE lubu-menge,
             meins TYPE lubu-meins,
           END OF ty_u.
    DATA: lv_lgnum TYPE lgnum,
          lv_max   TYPE i,
          lt_u     TYPE STANDARD TABLE OF ty_u,
          ls_u     TYPE ty_u,
          lv_cnt   TYPE i,
          lv_row   TYPE i,
          lv_m1    TYPE string,
          lv_m2    TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).
    " U = posting change processed (domain LUBU_STATU); space = open, T = partly processed.
    SELECT COUNT(*) FROM lubu INTO lv_cnt WHERE lgnum = lv_lgnum AND statu <> 'U'.
    SELECT ubnum statu bdatu bwart bwlvs matn1 werk1 bstq1 chrg1 matn2 werk2 bstq2 chrg2 menge meins
      FROM lubu INTO TABLE lt_u UP TO 5000 ROWS
      WHERE lgnum = lv_lgnum AND statu <> 'U'.
    SORT lt_u BY bdatu DESCENDING ubnum DESCENDING.
    LOOP AT lt_u INTO ls_u.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      lv_m1 = ls_u-matn1.
      SHIFT lv_m1 LEFT DELETING LEADING '0'.
      lv_m2 = ls_u-matn2.
      SHIFT lv_m2 LEFT DELETING LEADING '0'.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'POSTING_CHANGE' iv_value = ls_u-ubnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'   iv_value = status_text( iv_domain = 'LUBU_STATU' iv_value = ls_u-statu ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED'  iv_value = ls_u-bdatu CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MOVEMENT' iv_value = |IM { ls_u-bwart } / WM { ls_u-bwlvs }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FROM'     iv_value = |{ lv_m1 } { ls_u-werk1 } cat. { ls_u-bstq1 } batch { ls_u-chrg1 }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO'       iv_value = |{ lv_m2 } { ls_u-werk2 } cat. { ls_u-bstq2 } batch { ls_u-chrg2 }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = |{ ls_u-menge } { ls_u-meins }| CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_text = |Warehouse { lv_lgnum }: { lv_cnt } posting change notices not processed|.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD inv_list_open.
    TYPES: BEGIN OF ty_i,
             ivnum TYPE link-ivnum,
             istat TYPE link-istat,
             lgtyp TYPE link-lgtyp,
             pdatu TYPE link-pdatu,
           END OF ty_i.
    DATA: lv_lgnum TYPE lgnum,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lt_i     TYPE STANDARD TABLE OF ty_i,
          ls_i     TYPE ty_i,
          lv_bins  TYPE i,
          lv_open  TYPE i,
          lv_row   TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    " Domain LVS_ISTAT: L = cleared, S = cancelled; N not counted, A partly counted, Z counted.
    SELECT ivnum istat lgtyp pdatu FROM link INTO TABLE lt_i
      WHERE lgnum = lv_lgnum AND lgtyp IN lr_lgtyp AND istat <> 'L' AND istat <> 'S'.
    SORT lt_i BY ivnum DESCENDING.
    LOOP AT lt_i INTO ls_i.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      SELECT COUNT(*) FROM linp INTO lv_bins WHERE lgnum = lv_lgnum AND ivnum = ls_i-ivnum.
      SELECT COUNT(*) FROM linp INTO lv_open WHERE lgnum = lv_lgnum AND ivnum = ls_i-ivnum AND istat = 'N'.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'INVENTORY'    iv_value = ls_i-ivnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'       iv_value = status_text( iv_domain = 'LVS_ISTAT' iv_value = ls_i-istat ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STORAGE_TYPE' iv_value = ls_i-lgtyp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNED'      iv_value = ls_i-pdatu CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BINS'         iv_value = lv_bins CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BINS_NOT_COUNTED' iv_value = lv_open CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_text = |Warehouse { lv_lgnum }: { lines( lt_i ) } WM inventory documents not cleared|.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD inv_get_detail.
    TYPES: BEGIN OF ty_p,
             ivpos TYPE linp-ivpos,
             istat TYPE linp-istat,
             lgpla TYPE linp-lgpla,
             idatu TYPE linp-idatu,
           END OF ty_p.
    DATA: lv_lgnum TYPE lgnum,
          lv_ivnum TYPE link-ivnum,
          lv_istat TYPE link-istat,
          lv_lgtyp TYPE link-lgtyp,
          lv_pdatu TYPE link-pdatu,
          lt_p     TYPE STANDARD TABLE OF ty_p,
          ls_p     TYPE ty_p,
          lv_open  TYPE i,
          lv_row   TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_ivnum = condense( is_params-ivnum ).
    IF lv_ivnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ivnum is required (WM inventory document number)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF condense( is_params-ivnum ) CO '0123456789'.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_ivnum
        IMPORTING output = lv_ivnum.
    ENDIF.
    SELECT SINGLE istat lgtyp pdatu FROM link INTO (lv_istat, lv_lgtyp, lv_pdatu)
      WHERE lgnum = lv_lgnum AND ivnum = lv_ivnum.
    IF sy-subrc <> 0.
      lv_text = |WM inventory document { is_params-ivnum } not found in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT ivpos istat lgpla idatu FROM linp INTO TABLE lt_p
      WHERE lgnum = lv_lgnum AND ivnum = lv_ivnum ORDER BY ivpos.
    LOOP AT lt_p INTO ls_p.
      lv_row = lv_row + 1.
      IF ls_p-istat = 'N'.
        lv_open = lv_open + 1.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM'   iv_value = ls_p-ivpos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN'    iv_value = |{ lv_lgtyp } / { ls_p-lgpla }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = status_text( iv_domain = 'LVS_ISTAT' iv_value = ls_p-istat ) CHANGING ct_rows = rs_result-rows ).
      IF ls_p-idatu IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'COUNT_DATE' iv_value = ls_p-idatu CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    lv_text = |WM inventory { lv_ivnum } (warehouse { lv_lgnum }, storage type { lv_lgtyp }, planned { lv_pdatu }): | &&
              |{ status_text( iv_domain = 'LVS_ISTAT' iv_value = lv_istat ) }, { lines( lt_p ) } bins, { lv_open } not counted|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD to_for_dlv.
    TYPES: BEGIN OF ty_li,
             posnr TYPE lips-posnr,
             matnr TYPE lips-matnr,
             werks TYPE lips-werks,
             lgort TYPE lips-lgort,
             charg TYPE lips-charg,
             lgmng TYPE lips-lgmng,
             meins TYPE lips-meins,
             lgnum TYPE lips-lgnum,
           END OF ty_li,
           BEGIN OF ty_tp,
             posnr TYPE ltap-posnr,
             vsolm TYPE ltap-vsolm,
             vorga TYPE ltap-vorga,
           END OF ty_tp.
    FIELD-SYMBOLS <ls_li> TYPE ty_li.
    DATA: lt_tp    TYPE STANDARD TABLE OF ty_tp,
          ls_tp    TYPE ty_tp,
          lv_lgnum TYPE lgnum,
          lv_vbeln TYPE likp-vbeln,
          lv_vbtyp TYPE likp-vbtyp,
          lv_vstel TYPE likp-vstel,
          lv_lvstk TYPE vbuk-lvstk,
          lv_wbstk TYPE vbuk-wbstk,
          lt_li    TYPE STANDARD TABLE OF ty_li,
          ls_li    TYPE ty_li,
          lv_stock TYPE lqua-verme,
          lv_row   TYPE i,
          lv_mat   TYPE string,
          lv_tanum TYPE ltak-tanum,
          lv_teilk TYPE t340d-teilv,
          ls_k     TYPE ty_tok,
          lt_it    TYPE ty_tops,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_exc   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_vbeln = to_num10( is_params-vbeln ).
    IF lv_vbeln IS INITIAL OR lv_vbeln CO '0'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (outbound delivery, digits up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE vbtyp vstel FROM likp INTO (lv_vbtyp, lv_vstel) WHERE vbeln = lv_vbeln.
    IF sy-subrc <> 0.
      lv_text = |Delivery { is_params-vbeln } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_vbtyp <> 'J'.
      lv_text = |Document { is_params-vbeln } is not an outbound delivery|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_LIKP_VST' ID 'VSTEL' FIELD lv_vstel ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      lv_text = |No authorization to change deliveries of shipping point { lv_vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE lvstk wbstk FROM vbuk INTO (lv_lvstk, lv_wbstk) WHERE vbeln = lv_vbeln.
    IF lv_wbstk = 'C'.
      lv_text = |Goods issue of delivery { is_params-vbeln } is already posted: no picking transfer order is needed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_lvstk IS INITIAL.
      lv_text = |Delivery { is_params-vbeln } is not relevant for warehouse management (no WM activity status)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_lvstk = 'C'.
      lv_text = |Delivery { is_params-vbeln } already has transfer orders for all items (WM status complete)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT posnr matnr werks lgort charg lgmng meins lgnum FROM lips INTO TABLE lt_li WHERE vbeln = lv_vbeln.
    DELETE lt_li WHERE lgnum <> lv_lgnum OR lgmng = 0.
    IF lt_li IS INITIAL.
      lv_text = |Delivery { is_params-vbeln } has no items in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    " Quantity already in transfer orders (cancelled TO items left out); VBUK may lag behind LTAP.
    SELECT posnr vsolm vorga FROM ltap INTO TABLE lt_tp WHERE lgnum = lv_lgnum AND vbeln = lv_vbeln.
    LOOP AT lt_li ASSIGNING <ls_li>.
      LOOP AT lt_tp INTO ls_tp WHERE posnr = <ls_li>-posnr.
        IF ls_tp-vorga <> 'ST' AND ls_tp-vorga <> 'SL'.
          <ls_li>-lgmng = <ls_li>-lgmng - ls_tp-vsolm.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    DELETE lt_li WHERE lgmng <= 0.
    IF lt_li IS INITIAL.
      lv_text = |Delivery { is_params-vbeln } already has transfer orders for all items in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    LOOP AT lt_li INTO ls_li.
      lv_stock = bin_stock( iv_lgnum = lv_lgnum iv_matnr = ls_li-matnr iv_werks = ls_li-werks iv_charg = ls_li-charg ).
      lv_row = lv_row + 1.
      lv_mat = ls_li-matnr.
      SHIFT lv_mat LEFT DELETING LEADING '0'.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'DELIVERY_ITEM' iv_value = ls_li-posnr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MATERIAL'      iv_value = lv_mat CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY'      iv_value = |{ ls_li-lgmng } { ls_li-meins }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WAREHOUSE_STOCK' iv_value = |{ lv_stock } { ls_li-meins }| CHANGING ct_rows = rs_result-rows ).
      IF lv_stock < ls_li-lgmng.
        lv_text = |Item { ls_li-posnr }: warehouse { lv_lgnum } has { lv_stock } { ls_li-meins } available outside interim storage, | &&
                  |the item needs { ls_li-lgmng }: the transfer order may be partial or refused|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDIF.
    ENDLOOP.
    ls_chg-field     = 'TRANSFER_ORDER'.
    ls_chg-old_value = |delivery { is_params-vbeln }, WM status { lv_lvstk }|.
    ls_chg-new_value = |new picking transfer order in warehouse { lv_lgnum } ({ lines( lt_li ) } items)|.
    APPEND ls_chg TO rs_result-changes.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: a picking transfer order for delivery { is_params-vbeln } ({ lines( lt_li ) } items) | &&
                          |would be created in warehouse { lv_lgnum }. Nothing was created.|.
      RETURN.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    CALL FUNCTION 'L_TO_CREATE_DN'
      EXPORTING
        i_lgnum                    = lv_lgnum
        i_vbeln                    = lv_vbeln
        i_commit_work              = 'X'
      IMPORTING
        e_tanum                    = lv_tanum
        e_teilk                    = lv_teilk
      EXCEPTIONS
        foreign_lock               = 1
        dn_completed               = 2
        partial_delivery_forbidden = 3
        xfeld_wrong                = 4
        ldest_wrong                = 5
        drukz_wrong                = 6
        dn_wrong                   = 7
        squit_forbidden            = 8
        no_to_created              = 9
        teilk_wrong                = 10
        update_without_commit      = 11
        no_authority               = 12
        no_picking_allowed         = 13
        dn_hu_not_choosable        = 14
        input_error                = 15
        error_message              = 98
        OTHERS                     = 99.
    IF sy-subrc <> 0.
      CASE sy-subrc.
        WHEN 1.  lv_exc = 'the delivery is locked by another user'.
        WHEN 2.  lv_exc = 'the delivery is completed for WM (DN_COMPLETED)'.
        WHEN 3.  lv_exc = 'partial delivery is not allowed and the stock is not enough'.
        WHEN 9.  lv_exc = 'no transfer order was created (stock or bins missing)'.
        WHEN 12. lv_exc = 'no authorization'.
        WHEN 13. lv_exc = 'picking is not allowed for this delivery'.
        WHEN OTHERS. lv_exc = |exception { sy-subrc }|.
      ENDCASE.
      add_sy_msg( CHANGING cs_result = rs_result ).
      fm_failed( EXPORTING iv_fm = 'L_TO_CREATE_DN' iv_exc = lv_exc CHANGING cs_result = rs_result ).
      ROLLBACK WORK.
      RETURN.
    ENDIF.
    IF lv_tanum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'L_TO_CREATE_DN returned no transfer order number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF wait_to( iv_lgnum = lv_lgnum iv_tanum = lv_tanum ) = abap_false.
      lv_text = |Transfer order { lv_tanum } is not visible in LTAK yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    CLEAR rs_result-rows.
    read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_it ev_found = lv_found ).
    to_rows( EXPORTING it_items = lt_it CHANGING cs_result = rs_result ).
    IF lv_teilk IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The transfer order covers the delivery only partly (stock missing for some quantity)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    READ TABLE rs_result-changes INTO ls_chg INDEX 1.
    ls_chg-new_value = |transfer order { lv_tanum } ({ lines( lt_it ) } items)|.
    MODIFY rs_result-changes FROM ls_chg INDEX 1.
    rs_result-summary = |Transfer order { lv_tanum } created in warehouse { lv_lgnum } for delivery { is_params-vbeln } | &&
                        |({ lines( lt_it ) } items, open for confirmation)|.
  ENDMETHOD.


  METHOD to_stock.
    DATA: lv_lgnum TYPE lgnum,
          lv_bwlvs TYPE bwlvs,
          lv_matnr TYPE matnr,
          lv_meins TYPE meins,
          lv_werks TYPE werks_d,
          lv_lgort TYPE lgort_d,
          lv_charg TYPE charg_d,
          lv_qty   TYPE rl03t-anfme,
          lv_ok    TYPE abap_bool,
          lv_unit  TYPE meins,
          lv_vltyp TYPE ltap-vltyp,
          lv_vlpla TYPE ltap-vlpla,
          lv_nltyp TYPE ltap-nltyp,
          lv_nlpla TYPE ltap-nlpla,
          lv_skz   TYPE lagp-skzua,
          lv_kzinv TYPE lagp-kzinv,
          lv_other TYPE lqua-matnr,
          lv_sutyp TYPE ltap-nltyp,
          lv_lenvw TYPE t331-lenvw,
          lv_whsu  TYPE t340d-lenvw,
          lv_nukle TYPE t340d-nukle,
          lv_stock TYPE lqua-verme,
          lv_tanum TYPE ltak-tanum,
          ls_k     TYPE ty_tok,
          lt_it    TYPE ty_tops,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_exc   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    check_bwlvs( EXPORTING iv_lgnum = lv_lgnum iv_bwlvs = is_params-bwlvs IMPORTING ev_bwlvs = lv_bwlvs CHANGING cs_result = rs_result ).
    IF lv_bwlvs IS INITIAL.
      RETURN.
    ENDIF.
    check_material( EXPORTING iv_lgnum = lv_lgnum iv_matnr = is_params-matnr IMPORTING ev_matnr = lv_matnr ev_meins = lv_meins
                    CHANGING cs_result = rs_result ).
    IF lv_matnr IS INITIAL.
      RETURN.
    ENDIF.
    lv_werks = to_upper( condense( is_params-werks ) ).
    IF lv_werks IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required (plant of the stock)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_lgort = to_upper( condense( is_params-lgort ) ).
    lv_charg = to_upper( condense( is_params-charg ) ).
    to_qty( EXPORTING iv_text = is_params-quantity IMPORTING ev_qty = lv_qty ev_ok = lv_ok ).
    IF lv_ok = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'quantity is required and must be a positive number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_unit = to_unit( iv_unit = is_params-unit iv_default = lv_meins ).
    IF lv_unit IS INITIAL.
      lv_text = |Unit { is_params-unit } is unknown|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_vltyp = to_upper( condense( is_params-src_lgtyp ) ).
    lv_vlpla = to_upper( condense( is_params-src_lgpla ) ).
    lv_nltyp = to_upper( condense( is_params-dst_lgtyp ) ).
    lv_nlpla = to_upper( condense( is_params-dst_lgpla ) ).
    IF ( lv_vlpla IS NOT INITIAL AND lv_vltyp IS INITIAL ) OR ( lv_nlpla IS NOT INITIAL AND lv_nltyp IS INITIAL ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'A storage bin needs its storage type (src_lgtyp / dst_lgtyp)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_lgtyp( iv_lgnum = lv_lgnum iv_lgtyp = lv_vltyp ) = abap_false OR auth_lgtyp( iv_lgnum = lv_lgnum iv_lgtyp = lv_nltyp ) = abap_false.
      lv_text = |No authorization for storage type { lv_vltyp } or { lv_nltyp } in warehouse { lv_lgnum } (L_LGNUM)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    " Source bin: exists in this warehouse, no removal block, no active inventory, enough stock.
    IF lv_vlpla IS NOT INITIAL.
      SELECT SINGLE skzua kzinv FROM lagp INTO (lv_skz, lv_kzinv)
        WHERE lgnum = lv_lgnum AND lgtyp = lv_vltyp AND lgpla = lv_vlpla.
      IF sy-subrc <> 0.
        lv_text = |Source bin { lv_vltyp } / { lv_vlpla } does not exist in warehouse { lv_lgnum }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_skz IS NOT INITIAL.
        lv_text = |Source bin { lv_vltyp } / { lv_vlpla } is blocked for removal|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_kzinv IS NOT INITIAL.
        lv_text = |Source bin { lv_vltyp } / { lv_vlpla } is in an active WM physical inventory|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_stock = bin_stock( iv_lgnum = lv_lgnum iv_matnr = lv_matnr iv_werks = lv_werks iv_charg = lv_charg
                            iv_lgtyp = lv_vltyp iv_lgpla = lv_vlpla ).
      IF lv_unit = lv_meins AND lv_stock < lv_qty.
        lv_text = |Source bin { lv_vltyp } / { lv_vlpla } holds { lv_stock } { lv_meins } of material { is_params-matnr } available, | &&
                  |the move needs { lv_qty }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    " Destination bin: exists in this warehouse, no putaway block, no active inventory.
    IF lv_nlpla IS NOT INITIAL.
      SELECT SINGLE skzue kzinv FROM lagp INTO (lv_skz, lv_kzinv)
        WHERE lgnum = lv_lgnum AND lgtyp = lv_nltyp AND lgpla = lv_nlpla.
      IF sy-subrc <> 0.
        lv_text = |Destination bin { lv_nltyp } / { lv_nlpla } does not exist in warehouse { lv_lgnum }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_skz IS NOT INITIAL.
        lv_text = |Destination bin { lv_nltyp } / { lv_nlpla } is blocked for putaway|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_kzinv IS NOT INITIAL.
        lv_text = |Destination bin { lv_nltyp } / { lv_nlpla } is in an active WM physical inventory|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      SELECT SINGLE matnr FROM lqua INTO lv_other
        WHERE lgnum = lv_lgnum AND lgtyp = lv_nltyp AND lgpla = lv_nlpla AND matnr <> lv_matnr.
      IF sy-subrc = 0.
        lv_text = |Destination bin { lv_nltyp } / { lv_nlpla } already holds another material: | &&
                  |the storage type decides whether mixed storage is allowed|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDIF.
    ENDIF.
    " A storage-unit managed destination needs the storage unit number range of the warehouse (T340D-NUKLE).
    IF lv_nltyp IS INITIAL.
      SELECT SINGLE nltyp FROM t333 INTO lv_sutyp WHERE lgnum = lv_lgnum AND bwlvs = lv_bwlvs.
    ELSE.
      lv_sutyp = lv_nltyp.
    ENDIF.
    IF lv_sutyp IS NOT INITIAL.
      SELECT SINGLE lenvw FROM t331 INTO lv_lenvw WHERE lgnum = lv_lgnum AND lgtyp = lv_sutyp.
      IF lv_lenvw IS NOT INITIAL.
        SELECT SINGLE lenvw nukle FROM t340d INTO (lv_whsu, lv_nukle) WHERE lgnum = lv_lgnum.
        IF lv_whsu IS NOT INITIAL AND lv_nukle IS INITIAL.
          lv_text = |Storage type { lv_sutyp } is storage-unit managed, but warehouse { lv_lgnum } has no storage unit | &&
                    |number range interval (T340D): the transfer order would fail. Choose a destination without storage units|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
      ENDIF.
    ENDIF.
    IF lv_vlpla IS INITIAL AND lv_nlpla IS INITIAL.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'No bin given: the movement type and the storage type search strategies determine source and destination'
               CHANGING cs_result = rs_result ).
    ENDIF.

    add_kv( EXPORTING iv_row = 1 iv_name = 'MOVEMENT' iv_value = lv_bwlvs CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'MATERIAL' iv_value = is_params-matnr CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'QUANTITY' iv_value = |{ lv_qty } { lv_unit }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'FROM'     iv_value = |{ lv_vltyp } / { lv_vlpla }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TO'       iv_value = |{ lv_nltyp } / { lv_nlpla }| CHANGING ct_rows = rs_result-rows ).
    ls_chg-field     = 'TRANSFER_ORDER'.
    ls_chg-old_value = |{ lv_vltyp } / { lv_vlpla }|.
    ls_chg-new_value = |{ lv_qty } { lv_unit } to { lv_nltyp } / { lv_nlpla } (movement type { lv_bwlvs })|.
    APPEND ls_chg TO rs_result-changes.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: a transfer order (movement type { lv_bwlvs }) would move { lv_qty } { lv_unit } of material | &&
                          |{ is_params-matnr } in warehouse { lv_lgnum }. Nothing was created.|.
      RETURN.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    CALL FUNCTION 'L_TO_CREATE_SINGLE'
      EXPORTING
        i_lgnum             = lv_lgnum
        i_bwlvs             = lv_bwlvs
        i_matnr             = lv_matnr
        i_werks             = lv_werks
        i_lgort             = lv_lgort
        i_charg             = lv_charg
        i_anfme             = lv_qty
        i_altme             = lv_unit
        i_vltyp             = lv_vltyp
        i_vlpla             = lv_vlpla
        i_nltyp             = lv_nltyp
        i_nlpla             = lv_nlpla
        i_commit_work       = 'X'
      IMPORTING
        e_tanum             = lv_tanum
      EXCEPTIONS
        no_to_created       = 1
        bwlvs_wrong         = 2
        foreign_lock        = 3
        vltyp_wrong         = 4
        vlpla_wrong         = 5
        nltyp_wrong         = 6
        nlpla_wrong         = 7
        manual_to_forbidden = 8
        no_authority        = 9
        material_not_found  = 10
        error_message       = 98
        OTHERS              = 99.
    IF sy-subrc <> 0.
      CASE sy-subrc.
        WHEN 1.  lv_exc = 'no transfer order was created (stock or bins missing)'.
        WHEN 2.  lv_exc = 'the movement type is wrong for this move'.
        WHEN 3.  lv_exc = 'the stock or bin is locked by another user'.
        WHEN 4 OR 5. lv_exc = 'source storage type or bin is wrong'.
        WHEN 6 OR 7. lv_exc = 'destination storage type or bin is wrong'.
        WHEN 8.  lv_exc = 'manual transfer orders are not allowed for this movement type'.
        WHEN 9.  lv_exc = 'no authorization'.
        WHEN 10. lv_exc = 'material not found in the warehouse'.
        WHEN OTHERS. lv_exc = |exception { sy-subrc }|.
      ENDCASE.
      add_sy_msg( CHANGING cs_result = rs_result ).
      fm_failed( EXPORTING iv_fm = 'L_TO_CREATE_SINGLE' iv_exc = lv_exc CHANGING cs_result = rs_result ).
      ROLLBACK WORK.
      RETURN.
    ENDIF.
    IF lv_tanum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'L_TO_CREATE_SINGLE returned no transfer order number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF wait_to( iv_lgnum = lv_lgnum iv_tanum = lv_tanum ) = abap_false.
      lv_text = |Transfer order { lv_tanum } is not visible in LTAK yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    CLEAR rs_result-rows.
    read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_it ev_found = lv_found ).
    to_rows( EXPORTING it_items = lt_it CHANGING cs_result = rs_result ).
    rs_result-summary = |Transfer order { lv_tanum } created in warehouse { lv_lgnum } (movement type { lv_bwlvs }, | &&
                        |{ lv_qty } { lv_unit } of material { is_params-matnr }, open for confirmation)|.
  ENDMETHOD.


  METHOD to_for_tr.
    DATA: lv_lgnum TYPE lgnum,
          lv_tbnum TYPE ltbk-tbnum,
          lv_statu TYPE ltbk-statu,
          lv_bwlvs TYPE ltbk-bwlvs,
          lv_t_vl  TYPE t333-vltyp,
          lv_t_nl  TYPE t333-nltyp,
          lv_lpman TYPE t333-lpman,
          lt_p     TYPE ty_tbps,
          ls_p     TYPE ty_tbp,
          lv_open  TYPE ltbp-menge,
          lv_stock TYPE lqua-verme,
          lv_row   TYPE i,
          lv_mat   TYPE string,
          lv_tanum TYPE ltak-tanum,
          lv_teilk TYPE t340d-teilv,
          ls_k     TYPE ty_tok,
          lt_it    TYPE ty_tops,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_exc   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_tbnum = to_num10( is_params-tbnum ).
    IF lv_tbnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tbnum is required (transfer requirement number, digits up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE statu bwlvs FROM ltbk INTO (lv_statu, lv_bwlvs) WHERE lgnum = lv_lgnum AND tbnum = lv_tbnum.
    IF sy-subrc <> 0.
      lv_text = |Transfer requirement { is_params-tbnum } not found in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_statu = 'E'.
      lv_text = |Transfer requirement { is_params-tbnum } is completed: no further transfer order is possible|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_bwlvs IS NOT INITIAL.
      AUTHORITY-CHECK OBJECT 'L_BWLVS' ID 'LGNUM' FIELD lv_lgnum ID 'BWLVS' FIELD lv_bwlvs.
      IF sy-subrc <> 0.
        lv_text = |No authorization for WM movement type { lv_bwlvs } in warehouse { lv_lgnum } (L_BWLVS)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      " Movement types without a fixed storage type, or with manual bin entry, need the bins typed in (LT04).
      SELECT SINGLE vltyp nltyp lpman FROM t333 INTO (lv_t_vl, lv_t_nl, lv_lpman)
        WHERE lgnum = lv_lgnum AND bwlvs = lv_bwlvs.
      IF sy-subrc = 0 AND ( lv_lpman IS NOT INITIAL OR ( lv_t_vl IS INITIAL AND lv_t_nl IS INITIAL ) ).
        lv_text = |Transfer requirement { is_params-tbnum } has WM movement type { lv_bwlvs }, which needs the bins | &&
                  |entered by hand: create its transfer order in LT04|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    SELECT tbpos matnr werks lgort charg menge meins tamen altme elikz FROM ltbp INTO TABLE lt_p
      WHERE lgnum = lv_lgnum AND tbnum = lv_tbnum ORDER BY tbpos.
    LOOP AT lt_p INTO ls_p.
      IF ls_p-elikz IS NOT INITIAL OR ls_p-tamen >= ls_p-menge.
        DELETE lt_p.
      ENDIF.
    ENDLOOP.
    IF lt_p IS INITIAL.
      lv_text = |Transfer requirement { is_params-tbnum } has no open quantity|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    LOOP AT lt_p INTO ls_p.
      lv_row = lv_row + 1.
      lv_mat = ls_p-matnr.
      SHIFT lv_mat LEFT DELETING LEADING '0'.
      lv_stock = bin_stock( iv_lgnum = lv_lgnum iv_matnr = ls_p-matnr iv_werks = ls_p-werks iv_charg = ls_p-charg ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TR_ITEM'  iv_value = ls_p-tbpos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MATERIAL' iv_value = lv_mat CHANGING ct_rows = rs_result-rows ).
      lv_open = ls_p-menge - ls_p-tamen.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OPEN'     iv_value = |{ lv_open } { ls_p-meins }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WAREHOUSE_STOCK' iv_value = |{ lv_stock } { ls_p-meins }| CHANGING ct_rows = rs_result-rows ).
      IF lv_stock < lv_open.
        lv_text = |TR item { ls_p-tbpos }: { lv_stock } { ls_p-meins } available outside interim storage, { lv_open } open: | &&
                  |the transfer order may be partial or refused|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDIF.
    ENDLOOP.
    ls_chg-field     = 'TRANSFER_ORDER'.
    ls_chg-old_value = |transfer requirement { lv_tbnum } { status_text( iv_domain = 'LTBK_STATU' iv_value = lv_statu ) }|.
    ls_chg-new_value = |new transfer order for { lines( lt_p ) } open items|.
    APPEND ls_chg TO rs_result-changes.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: a transfer order for transfer requirement { lv_tbnum } ({ lines( lt_p ) } open items) | &&
                          |would be created in warehouse { lv_lgnum }. Nothing was created.|.
      RETURN.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    CALL FUNCTION 'L_TO_CREATE_TR'
      EXPORTING
        i_lgnum                        = lv_lgnum
        i_tbnum                        = lv_tbnum
        i_commit_work                  = 'X'
      IMPORTING
        e_tanum                        = lv_tanum
        e_teilk                        = lv_teilk
      EXCEPTIONS
        foreign_lock                   = 1
        qm_relevant                    = 2
        tr_completed                   = 3
        xfeld_wrong                    = 4
        ldest_wrong                    = 5
        drukz_wrong                    = 6
        tr_wrong                       = 7
        squit_forbidden                = 8
        no_to_created                  = 9
        update_without_commit          = 10
        no_authority                   = 11
        preallocated_stock             = 12
        partial_transfer_req_forbidden = 13
        input_error                    = 14
        error_message                  = 98
        OTHERS                         = 99.
    IF sy-subrc <> 0.
      CASE sy-subrc.
        WHEN 1.  lv_exc = 'the transfer requirement is locked by another user'.
        WHEN 2.  lv_exc = 'the stock is QM relevant (inspection lot open)'.
        WHEN 3.  lv_exc = 'the transfer requirement is completed'.
        WHEN 9.  lv_exc = 'no transfer order was created (stock or bins missing)'.
        WHEN 11. lv_exc = 'no authorization'.
        WHEN 13. lv_exc = 'partial processing is not allowed and the stock is not enough'.
        WHEN OTHERS. lv_exc = |exception { sy-subrc }|.
      ENDCASE.
      add_sy_msg( CHANGING cs_result = rs_result ).
      fm_failed( EXPORTING iv_fm = 'L_TO_CREATE_TR' iv_exc = lv_exc CHANGING cs_result = rs_result ).
      ROLLBACK WORK.
      RETURN.
    ENDIF.
    IF lv_tanum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'L_TO_CREATE_TR returned no transfer order number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF wait_to( iv_lgnum = lv_lgnum iv_tanum = lv_tanum ) = abap_false.
      lv_text = |Transfer order { lv_tanum } is not visible in LTAK yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    CLEAR rs_result-rows.
    read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_it ev_found = lv_found ).
    to_rows( EXPORTING it_items = lt_it CHANGING cs_result = rs_result ).
    IF lv_teilk IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The transfer order covers the transfer requirement only partly'
               CHANGING cs_result = rs_result ).
    ENDIF.
    SELECT SINGLE statu FROM ltbk INTO lv_statu WHERE lgnum = lv_lgnum AND tbnum = lv_tbnum.
    rs_result-summary = |Transfer order { lv_tanum } created in warehouse { lv_lgnum } for transfer requirement { lv_tbnum } | &&
                        |({ lines( lt_it ) } items); the requirement is now { status_text( iv_domain = 'LTBK_STATU' iv_value = lv_statu ) }|.
  ENDMETHOD.


  METHOD to_confirm_cancel.
    DATA: lv_lgnum  TYPE lgnum,
          lv_tanum  TYPE ltak-tanum,
          lv_tapos  TYPE ltap-tapos,
          lv_in     TYPE string,
          ls_k      TYPE ty_tok,
          lt_it     TYPE ty_tops,
          lt_sel    TYPE ty_tops,
          lt_now    TYPE ty_tops,
          ls_it     TYPE ty_top,
          ls_now    TYPE ty_top,
          lv_found  TYPE abap_bool,
          lt_conf   TYPE STANDARD TABLE OF ltap_conf,
          ls_conf   TYPE ltap_conf,
          lt_cancl  TYPE STANDARD TABLE OF ltap_cancl,
          ls_cancl  TYPE ltap_cancl,
          lv_done   TYPE i,
          lv_kostk  TYPE vbuk-kostk,
          lv_lvstk  TYPE vbuk-lvstk,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_verb   TYPE string,
          lv_new    TYPE string,
          lv_fm     TYPE string,
          lv_exc    TYPE string,
          lv_text   TYPE string.

    IF iv_cancel = abap_true.
      lv_verb = 'cancel'.
      lv_new  = 'cancelled'.
      lv_fm   = 'L_TO_CANCEL'.
    ELSE.
      lv_verb = 'confirm'.
      lv_new  = 'confirmed'.
      lv_fm   = 'L_TO_CONFIRM'.
    ENDIF.
    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_tanum = to_num10( is_params-tanum ).
    IF lv_tanum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tanum is required (transfer order number, digits up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_in = condense( is_params-tapos ).
    IF lv_in IS NOT INITIAL.
      IF lv_in CN '0123456789' OR strlen( lv_in ) > 4.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'tapos must be a TO item number (digits, up to 4)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_tapos = lv_in.
    ENDIF.
    read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_it ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Transfer order { is_params-tanum } not found in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_k-kquit IS NOT INITIAL.
      IF iv_cancel = abap_true.
        lv_text = |Transfer order { is_params-tanum } is confirmed: a confirmed TO cannot be cancelled|.
      ELSE.
        lv_text = |Transfer order { is_params-tanum } is already confirmed|.
      ENDIF.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_tapos IS NOT INITIAL.
      READ TABLE lt_it INTO ls_it WITH KEY tapos = lv_tapos.
      IF sy-subrc <> 0.
        lv_text = |Transfer order { is_params-tanum } has no item { lv_in }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF ls_it-pquit IS NOT INITIAL.
        lv_text = |Item { lv_in } of transfer order { is_params-tanum } is already confirmed or cancelled|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      APPEND ls_it TO lt_sel.
    ELSE.
      LOOP AT lt_it INTO ls_it WHERE pquit IS INITIAL.
        APPEND ls_it TO lt_sel.
      ENDLOOP.
    ENDIF.
    IF lt_sel IS INITIAL.
      lv_text = |Transfer order { is_params-tanum } has no open item to { lv_verb }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    LOOP AT lt_sel INTO ls_it.
      IF auth_lgtyp( iv_lgnum = lv_lgnum iv_lgtyp = ls_it-vltyp ) = abap_false
         OR auth_lgtyp( iv_lgnum = lv_lgnum iv_lgtyp = ls_it-nltyp ) = abap_false.
        lv_text = |No authorization for storage type { ls_it-vltyp } or { ls_it-nltyp } in warehouse { lv_lgnum } (L_LGNUM)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      ls_chg-field     = |TO item { ls_it-tapos }|.
      ls_chg-old_value = 'open'.
      ls_chg-new_value = lv_new.
      APPEND ls_chg TO rs_result-changes.
    ENDLOOP.
    to_rows( EXPORTING it_items = lt_sel CHANGING cs_result = rs_result ).
    IF iv_cancel = abap_false.
      add_msg( EXPORTING iv_type = 'I' iv_text = 'Items are confirmed with their planned quantity (no differences)'
               CHANGING cs_result = rs_result ).
    ENDIF.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: { lines( lt_sel ) } open items of transfer order { lv_tanum } (warehouse { lv_lgnum }) | &&
                          |would be { lv_new }. Nothing was changed.|.
      RETURN.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    IF iv_cancel = abap_true.
      LOOP AT lt_sel INTO ls_it.
        CLEAR ls_cancl.
        ls_cancl-tanum = ls_it-tanum.
        ls_cancl-tapos = ls_it-tapos.
        APPEND ls_cancl TO lt_cancl.
      ENDLOOP.
      CALL FUNCTION 'L_TO_CANCEL'
        EXPORTING
          i_lgnum                      = lv_lgnum
          i_tanum                      = lv_tanum
          i_commit_work                = 'X'
        TABLES
          t_ltap_cancl                 = lt_cancl
        EXCEPTIONS
          to_confirmed                 = 1
          to_doesnt_exist              = 2
          item_confirmed               = 3
          item_doesnt_exist            = 4
          foreign_lock                 = 5
          double_lines                 = 6
          nothing_to_do                = 7
          xfeld_wrong                  = 8
          su_movement_partly_confirmed = 9
          update_without_commit        = 10
          no_authority                 = 11
          error_message                = 98
          OTHERS                       = 99.
    ELSE.
      LOOP AT lt_sel INTO ls_it.
        CLEAR ls_conf.
        ls_conf-tanum = ls_it-tanum.
        ls_conf-tapos = ls_it-tapos.
        ls_conf-squit = 'X'.
        APPEND ls_conf TO lt_conf.
      ENDLOOP.
      CALL FUNCTION 'L_TO_CONFIRM'
        EXPORTING
          i_lgnum                        = lv_lgnum
          i_tanum                        = lv_tanum
          i_commit_work                  = 'X'
        TABLES
          t_ltap_conf                    = lt_conf
        EXCEPTIONS
          to_confirmed                   = 1
          to_doesnt_exist                = 2
          item_confirmed                 = 3
          item_doesnt_exist              = 4
          foreign_lock                   = 5
          two_step_confirmation_required = 6
          pick_confirmation_missing      = 7
          no_authority                   = 8
          nothing_to_do                  = 9
          error_message                  = 98
          OTHERS                         = 99.
    ENDIF.
    IF sy-subrc <> 0.
      CASE sy-subrc.
        WHEN 1.  lv_exc = 'the transfer order is confirmed'.
        WHEN 2.  lv_exc = 'the transfer order does not exist'.
        WHEN 3.  lv_exc = 'an item is already confirmed'.
        WHEN 4.  lv_exc = 'an item does not exist'.
        WHEN 5.  lv_exc = 'the transfer order is locked by another user'.
        WHEN 6.
          IF iv_cancel = abap_true.
            lv_exc = |exception { sy-subrc }|.
          ELSE.
            lv_exc = 'two-step confirmation (pick, then transfer) is required: confirm in LT12'.
          ENDIF.
        WHEN OTHERS. lv_exc = |exception { sy-subrc }|.
      ENDCASE.
      add_sy_msg( CHANGING cs_result = rs_result ).
      fm_failed( EXPORTING iv_fm = lv_fm iv_exc = lv_exc CHANGING cs_result = rs_result ).
      ROLLBACK WORK.
      RETURN.
    ENDIF.

    " Read back: every selected item confirmed (PQUIT) or, for a cancellation, confirmed or removed.
    DO 10 TIMES.
      CLEAR lv_done.
      read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_now ev_found = lv_found ).
      LOOP AT lt_sel INTO ls_it.
        READ TABLE lt_now INTO ls_now WITH KEY tapos = ls_it-tapos.
        IF sy-subrc <> 0.
          IF iv_cancel = abap_true.
            lv_done = lv_done + 1.
          ENDIF.
        ELSEIF ls_now-pquit IS NOT INITIAL.
          lv_done = lv_done + 1.
        ENDIF.
      ENDLOOP.
      IF lv_done = lines( lt_sel ).
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    CLEAR rs_result-rows.
    to_rows( EXPORTING it_items = lt_now CHANGING cs_result = rs_result ).
    IF lv_done < lines( lt_sel ).
      lv_text = |Only { lv_done } of { lines( lt_sel ) } items show as { lv_new } yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    lv_text = |{ lv_done } items of transfer order { lv_tanum } (warehouse { lv_lgnum }) { lv_new }|.
    IF ls_k-kquit IS NOT INITIAL.
      lv_text = |{ lv_text }; the transfer order is complete|.
    ENDIF.
    IF ls_k-vbeln IS NOT INITIAL.
      SELECT SINGLE kostk lvstk FROM vbuk INTO (lv_kostk, lv_lvstk) WHERE vbeln = ls_k-vbeln.
      lv_text = |{ lv_text }; delivery { ls_k-vbeln } picking status { lv_kostk }, WM status { lv_lvstk }|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD to_posting_change.
    TYPES: BEGIN OF ty_u,
             statu TYPE lubu-statu,
             bwlvs TYPE lubu-bwlvs,
             matn1 TYPE lubu-matn1,
             werk1 TYPE lubu-werk1,
             bstq1 TYPE lubu-bstq1,
             chrg1 TYPE lubu-chrg1,
             matn2 TYPE lubu-matn2,
             werk2 TYPE lubu-werk2,
             bstq2 TYPE lubu-bstq2,
             chrg2 TYPE lubu-chrg2,
             menge TYPE lubu-menge,
             meins TYPE lubu-meins,
           END OF ty_u.
    DATA: lv_lgnum TYPE lgnum,
          lv_ubnum TYPE lubu-ubnum,
          ls_u     TYPE ty_u,
          lv_stock TYPE lqua-verme,
          lv_m1    TYPE string,
          lv_m2    TYPE string,
          lv_tanum TYPE ltak-tanum,
          ls_k     TYPE ty_tok,
          lt_it    TYPE ty_tops,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_exc   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_ubnum = to_num10( is_params-ref_doc ).
    IF lv_ubnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ref_doc is required (posting change notice number, digits up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE statu bwlvs matn1 werk1 bstq1 chrg1 matn2 werk2 bstq2 chrg2 menge meins FROM lubu INTO ls_u
      WHERE lgnum = lv_lgnum AND ubnum = lv_ubnum.
    IF sy-subrc <> 0.
      lv_text = |Posting change notice { is_params-ref_doc } not found in warehouse { lv_lgnum }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_u-statu = 'U'.
      lv_text = |Posting change notice { is_params-ref_doc } is already processed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_u-bwlvs IS NOT INITIAL.
      AUTHORITY-CHECK OBJECT 'L_BWLVS' ID 'LGNUM' FIELD lv_lgnum ID 'BWLVS' FIELD ls_u-bwlvs.
      IF sy-subrc <> 0.
        lv_text = |No authorization for WM movement type { ls_u-bwlvs } in warehouse { lv_lgnum } (L_BWLVS)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    lv_stock = bin_stock( iv_lgnum = lv_lgnum iv_matnr = ls_u-matn1 iv_werks = ls_u-werk1 iv_charg = ls_u-chrg1 iv_bestq = ls_u-bstq1 ).
    IF lv_stock < ls_u-menge.
      lv_text = |Warehouse { lv_lgnum } has { lv_stock } { ls_u-meins } of the from-stock available outside interim storage, | &&
                |the posting change needs { ls_u-menge }: the transfer order may be partial or refused|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    lv_m1 = ls_u-matn1.
    SHIFT lv_m1 LEFT DELETING LEADING '0'.
    lv_m2 = ls_u-matn2.
    SHIFT lv_m2 LEFT DELETING LEADING '0'.
    add_kv( EXPORTING iv_row = 1 iv_name = 'POSTING_CHANGE' iv_value = lv_ubnum CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'FROM'     iv_value = |{ lv_m1 } { ls_u-werk1 } cat. { ls_u-bstq1 } batch { ls_u-chrg1 }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TO'       iv_value = |{ lv_m2 } { ls_u-werk2 } cat. { ls_u-bstq2 } batch { ls_u-chrg2 }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'QUANTITY' iv_value = |{ ls_u-menge } { ls_u-meins }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'WAREHOUSE_STOCK' iv_value = |{ lv_stock } { ls_u-meins }| CHANGING ct_rows = rs_result-rows ).
    ls_chg-field     = 'TRANSFER_ORDER'.
    ls_chg-old_value = |posting change notice { lv_ubnum } { status_text( iv_domain = 'LUBU_STATU' iv_value = ls_u-statu ) }|.
    ls_chg-new_value = |new posting change transfer order ({ ls_u-menge } { ls_u-meins })|.
    APPEND ls_chg TO rs_result-changes.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: a posting change transfer order for notice { lv_ubnum } ({ ls_u-menge } { ls_u-meins }) | &&
                          |would be created in warehouse { lv_lgnum }. Nothing was created.|.
      RETURN.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    CALL FUNCTION 'L_TO_CREATE_POSTING_CHANGE'
      EXPORTING
        i_lgnum               = lv_lgnum
        i_ubnum               = lv_ubnum
        i_commit_work         = 'X'
      IMPORTING
        e_tanum               = lv_tanum
      EXCEPTIONS
        foreign_lock          = 1
        tp_completed          = 2
        xfeld_wrong           = 3
        ldest_wrong           = 4
        drukz_wrong           = 5
        tp_wrong              = 6
        squit_forbidden       = 7
        no_to_created         = 8
        update_without_commit = 9
        no_authority          = 10
        i_ubnum_or_i_lubu     = 11
        no_quants             = 12
        error_message         = 98
        OTHERS                = 99.
    IF sy-subrc <> 0.
      CASE sy-subrc.
        WHEN 1.  lv_exc = 'the notice or stock is locked by another user'.
        WHEN 2.  lv_exc = 'the posting change notice is completed'.
        WHEN 8.  lv_exc = 'no transfer order was created'.
        WHEN 10. lv_exc = 'no authorization'.
        WHEN 12. lv_exc = 'no quants of the from-stock in the warehouse'.
        WHEN OTHERS. lv_exc = |exception { sy-subrc }|.
      ENDCASE.
      add_sy_msg( CHANGING cs_result = rs_result ).
      fm_failed( EXPORTING iv_fm = 'L_TO_CREATE_POSTING_CHANGE' iv_exc = lv_exc CHANGING cs_result = rs_result ).
      ROLLBACK WORK.
      RETURN.
    ENDIF.
    IF lv_tanum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'L_TO_CREATE_POSTING_CHANGE returned no transfer order number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF wait_to( iv_lgnum = lv_lgnum iv_tanum = lv_tanum ) = abap_false.
      lv_text = |Transfer order { lv_tanum } is not visible in LTAK yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    CLEAR rs_result-rows.
    read_to( EXPORTING iv_lgnum = lv_lgnum iv_tanum = lv_tanum IMPORTING es_tok = ls_k et_items = lt_it ev_found = lv_found ).
    to_rows( EXPORTING it_items = lt_it CHANGING cs_result = rs_result ).
    SELECT SINGLE statu FROM lubu INTO ls_u-statu WHERE lgnum = lv_lgnum AND ubnum = lv_ubnum.
    rs_result-summary = |Posting change transfer order { lv_tanum } created in warehouse { lv_lgnum } for notice { lv_ubnum } | &&
                        |({ lines( lt_it ) } items); the notice is now { status_text( iv_domain = 'LUBU_STATU' iv_value = ls_u-statu ) }|.
  ENDMETHOD.


  METHOD tr_create.
    DATA: lv_lgnum TYPE lgnum,
          lv_bwlvs TYPE bwlvs,
          lv_matnr TYPE matnr,
          lv_meins TYPE meins,
          lv_werks TYPE werks_d,
          lv_lgort TYPE lgort_d,
          lv_qty   TYPE rl03t-anfme,
          lv_ok    TYPE abap_bool,
          lv_unit  TYPE meins,
          lt_ltba  TYPE STANDARD TABLE OF ltba,
          ls_ltba  TYPE ltba,
          ls_req   TYPE ltba,
          lv_rc    TYPE sy-subrc,
          lv_t_vl  TYPE t333-vltyp,
          lv_t_nl  TYPE t333-nltyp,
          lv_lpman TYPE t333-lpman,
          lv_tbnum TYPE ltbk-tbnum,
          lv_statu TYPE ltbk-statu,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_type  TYPE c LENGTH 1,
          lv_msg   TYPE string,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    check_bwlvs( EXPORTING iv_lgnum = lv_lgnum iv_bwlvs = is_params-bwlvs IMPORTING ev_bwlvs = lv_bwlvs CHANGING cs_result = rs_result ).
    IF lv_bwlvs IS INITIAL.
      RETURN.
    ENDIF.
    check_material( EXPORTING iv_lgnum = lv_lgnum iv_matnr = is_params-matnr IMPORTING ev_matnr = lv_matnr ev_meins = lv_meins
                    CHANGING cs_result = rs_result ).
    IF lv_matnr IS INITIAL.
      RETURN.
    ENDIF.
    lv_werks = to_upper( condense( is_params-werks ) ).
    IF lv_werks IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required (plant)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_lgort = to_upper( condense( is_params-lgort ) ).
    to_qty( EXPORTING iv_text = is_params-quantity IMPORTING ev_qty = lv_qty ev_ok = lv_ok ).
    IF lv_ok = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'quantity is required and must be a positive number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_unit = to_unit( iv_unit = is_params-unit iv_default = lv_meins ).
    IF lv_unit IS INITIAL.
      lv_text = |Unit { is_params-unit } is unknown|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE vltyp nltyp lpman FROM t333 INTO (lv_t_vl, lv_t_nl, lv_lpman)
      WHERE lgnum = lv_lgnum AND bwlvs = lv_bwlvs.
    IF lv_lpman IS NOT INITIAL OR ( lv_t_vl IS INITIAL AND lv_t_nl IS INITIAL ).
      lv_text = |WM movement type { lv_bwlvs } needs bins entered by hand: the transfer order for this requirement | &&
                |cannot be created by WM.TO.CREATE_FOR_TR (use LT04)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.

    ls_req-lgnum = lv_lgnum.
    ls_req-bwlvs = lv_bwlvs.
    ls_req-matnr = lv_matnr.
    ls_req-werks = lv_werks.
    ls_req-lgort = lv_lgort.
    ls_req-menga = lv_qty.
    ls_req-altme = lv_unit.

    " Check the request row (no number, nothing saved), then roll back.
    APPEND ls_req TO lt_ltba.
    CALL FUNCTION 'L_TR_CREATE_CHECK'
      EXPORTING
        i_number      = space
        i_single_item = 'X'
      TABLES
        t_ltba        = lt_ltba
      EXCEPTIONS
        item_error    = 1
        error_message = 98
        OTHERS        = 99.
    lv_rc = sy-subrc.
    IF lv_rc = 98 OR lv_rc = 99.
      add_sy_msg( CHANGING cs_result = rs_result ).
    ENDIF.
    READ TABLE lt_ltba INTO ls_ltba INDEX 1.
    IF sy-subrc = 0 AND ls_ltba-msgid IS NOT INITIAL.
      MESSAGE ID ls_ltba-msgid TYPE 'E' NUMBER ls_ltba-msgno
        WITH ls_ltba-msgv1 ls_ltba-msgv2 ls_ltba-msgv3 ls_ltba-msgv4 INTO lv_msg.
      lv_type = ls_ltba-msgty.
      IF lv_type <> 'E' AND lv_type <> 'A' AND lv_type <> 'W'.
        lv_type = 'I'.
      ENDIF.
      add_msg( EXPORTING iv_type = lv_type iv_text = lv_msg CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_ltba-eprot IS NOT INITIAL AND lv_rc <> 0.
      lv_msg = ls_ltba-eprot.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_msg CHANGING cs_result = rs_result ).
    ENDIF.
    ROLLBACK WORK.
    IF lv_rc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'L_TR_CREATE_CHECK refused the transfer requirement row (see the messages)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    add_kv( EXPORTING iv_row = 1 iv_name = 'MOVEMENT' iv_value = lv_bwlvs CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'MATERIAL' iv_value = is_params-matnr CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'PLANT'    iv_value = |{ lv_werks } { lv_lgort }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'QUANTITY' iv_value = |{ lv_qty } { lv_unit }| CHANGING ct_rows = rs_result-rows ).
    ls_chg-field     = 'TRANSFER_REQUIREMENT'.
    ls_chg-old_value = ''.
    ls_chg-new_value = |{ lv_qty } { lv_unit } of material { is_params-matnr } (movement type { lv_bwlvs })|.
    APPEND ls_chg TO rs_result-changes.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: L_TR_CREATE_CHECK accepted a transfer requirement for { lv_qty } { lv_unit } of material | &&
                          |{ is_params-matnr } in warehouse { lv_lgnum } (movement type { lv_bwlvs }). Nothing was created.|.
      RETURN.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    CLEAR lt_ltba.
    APPEND ls_req TO lt_ltba.
    CALL FUNCTION 'L_TR_CREATE'
      EXPORTING
        i_single_item         = 'X'
        i_save_only_all       = 'X'
        i_commit_work         = 'X'
      TABLES
        t_ltba                = lt_ltba
      EXCEPTIONS
        item_error            = 1
        no_entry_in_int_table = 2
        item_without_number   = 3
        no_update_item_error  = 4
        error_message         = 98
        OTHERS                = 99.
    lv_rc = sy-subrc.
    READ TABLE lt_ltba INTO ls_ltba INDEX 1.
    IF lv_rc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
      IF ls_ltba-eprot IS NOT INITIAL.
        lv_msg = ls_ltba-eprot.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_msg CHANGING cs_result = rs_result ).
      ENDIF.
      lv_text = |exception { lv_rc }|.
      fm_failed( EXPORTING iv_fm = 'L_TR_CREATE' iv_exc = lv_text CHANGING cs_result = rs_result ).
      ROLLBACK WORK.
      RETURN.
    ENDIF.
    lv_tbnum = ls_ltba-tbnum.
    IF lv_tbnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'L_TR_CREATE returned no transfer requirement number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    DO 10 TIMES.
      SELECT SINGLE statu FROM ltbk INTO lv_statu WHERE lgnum = lv_lgnum AND tbnum = lv_tbnum.
      IF sy-subrc = 0.
        lv_ok = abap_true.
        EXIT.
      ENDIF.
      lv_ok = abap_false.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_ok = abap_false.
      lv_text = |Transfer requirement { lv_tbnum } is not visible in LTBK yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    READ TABLE rs_result-changes INTO ls_chg INDEX 1.
    ls_chg-old_value = ''.
    ls_chg-new_value = |transfer requirement { lv_tbnum }|.
    MODIFY rs_result-changes FROM ls_chg INDEX 1.
    rs_result-summary = |Transfer requirement { lv_tbnum } created in warehouse { lv_lgnum } for { lv_qty } { lv_unit } of material | &&
                        |{ is_params-matnr } (movement type { lv_bwlvs }, { status_text( iv_domain = 'LTBK_STATU' iv_value = lv_statu ) })|.
  ENDMETHOD.


  METHOD add_kv.
    DATA ls_kv TYPE zif_mcp_biz_action=>ty_kv.

    ls_kv-row   = iv_row.
    ls_kv-name  = iv_name.
    ls_kv-value = iv_value.
    CONDENSE ls_kv-value.
    APPEND ls_kv TO ct_rows.
  ENDMETHOD.


  METHOD add_msg.
    DATA ls_msg TYPE zif_mcp_biz_action=>ty_message.

    ls_msg-type    = iv_type.
    ls_msg-message = iv_text.
    APPEND ls_msg TO cs_result-messages.
  ENDMETHOD.


  METHOD add_sy_msg.
    DATA: ls_msg TYPE zif_mcp_biz_action=>ty_message,
          lv_txt TYPE string.

    IF sy-msgid IS INITIAL.
      RETURN.
    ENDIF.
    MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
      WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_txt.
    ls_msg-type    = 'E'.
    ls_msg-id      = sy-msgid.
    ls_msg-number  = sy-msgno.
    ls_msg-message = lv_txt.
    APPEND ls_msg TO cs_result-messages.
  ENDMETHOD.


  METHOD fm_failed.
    DATA lv_text TYPE string.

    lv_text = |{ iv_fm } refused the request: { iv_exc }|.
    add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD finish.
    FIELD-SYMBOLS <ls_msg> TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT cs_result-messages ASSIGNING <ls_msg> WHERE type = 'E' OR type = 'A'.
      cs_result-failed = abap_true.
      EXIT.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
