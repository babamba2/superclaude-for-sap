CLASS zcl_mcp_biz_pp DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_PP - PP business actions for ZMCP_BIZ_EXECUTE (production orders; REM and
* planned orders go here too). Renamed 2026-11-10 from ZCL_MCP_BIZ_PP_ORD (old class kept).
*
* Catalog: sc4sap configs/PP/actions.json. Action IDs must match it.
* Reads: SELECT on AUFK / AFKO / AFPO / JEST (plant + order type checked
*        with C_AFKO_AWK) and BAPI_PRODORD_GET_DETAIL.
* Writes: CONFIRM and the two goods movements have a TESTRUN: preview =
*         BAPI with TESTRUN + rollback. RELEASE / CHANGE_QTY_DATES /
*         COMPLETE_TECH have none: preview = static checks of the order
*         status and quantities only, the BAPI is never called.
*         execute = BAPI + BAPI_TRANSACTION_COMMIT / _ROLLBACK.
*         CONFIRM: the TESTRUN does not check the posting period, so the MM period
*         (MARV) and the FI period (FI_PERIOD_CHECK) are checked here. Activities and
*         the automatic goods movements (backflush, automatic goods receipt) come from
*         BAPI_PRODORDCONF_GET_TT_PROP like in the dialog (on the posting date); the preview
*         lists them, from the reservation (backflush flag) when the proposal gives none.
*         CHANGE_QTY_DATES: after EXECUTE the order is read back; a requested value that was
*         not applied is an error, a value moved by scheduling a warning (old / new values).
*         GOODS_ISSUE refuses backflushed components (they move with the confirmation).
* 7.31 syntax (no inline declarations, no constructor operators, no string
* templates in method call parameters) so one source serves ECC 7.31,
* ECC 7.40 and S/4HANA.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    CONSTANTS:
      c_crtd TYPE jest-stat VALUE 'I0001',
      c_rel  TYPE jest-stat VALUE 'I0002',
      c_cnf  TYPE jest-stat VALUE 'I0009',
      c_pcnf TYPE jest-stat VALUE 'I0010',
      c_dlt  TYPE jest-stat VALUE 'I0013',
      c_lkd  TYPE jest-stat VALUE 'I0043',
      c_teco TYPE jest-stat VALUE 'I0045',
      c_clsd TYPE jest-stat VALUE 'I0046',
      c_dlfl TYPE jest-stat VALUE 'I0076'.

    TYPES:
      ty_ret2     TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
      ty_ords     TYPE STANDARD TABLE OF bapi_order_key WITH DEFAULT KEY,
      ty_oret     TYPE STANDARD TABLE OF bapi_order_return WITH DEFAULT KEY,
      ty_tt       TYPE STANDARD TABLE OF bapi_pp_timeticket WITH DEFAULT KEY,
      ty_cret     TYPE STANDARD TABLE OF bapi_coru_return WITH DEFAULT KEY,
      ty_heads    TYPE STANDARD TABLE OF bapi_order_header1 WITH DEFAULT KEY,
      ty_gm_items TYPE STANDARD TABLE OF bapi2017_gm_item_create WITH DEFAULT KEY,
      ty_stats    TYPE STANDARD TABLE OF jest-stat WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_item,
        posnr TYPE afpo-posnr,
        matnr TYPE afpo-matnr,
        psmng TYPE afpo-psmng,
        wemng TYPE afpo-wemng,
        amein TYPE afpo-amein,
        dwerk TYPE afpo-dwerk,
        lgort TYPE afpo-lgort,
      END OF ty_item,
      ty_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_ord,
        aufnr TYPE aufk-aufnr,
        autyp TYPE aufk-autyp,
        auart TYPE aufk-auart,
        werks TYPE aufk-werks,
        objnr TYPE aufk-objnr,
        rsnum TYPE afko-rsnum,
        aufpl TYPE afko-aufpl,
        gamng TYPE afko-gamng,
        gmein TYPE afko-gmein,
        igmng TYPE afko-igmng,
        gstrp TYPE afko-gstrp,
        gltrp TYPE afko-gltrp,
        dispo TYPE afko-dispo,
        posnr TYPE afpo-posnr,
        matnr TYPE afpo-matnr,
        psmng TYPE afpo-psmng,
        wemng TYPE afpo-wemng,
        amein TYPE afpo-amein,
        dwerk TYPE afpo-dwerk,
        lgort TYPE afpo-lgort,
        items TYPE i,
      END OF ty_ord.

    TYPES:
      BEGIN OF ty_row,
        aufnr TYPE aufk-aufnr,
        auart TYPE aufk-auart,
        werks TYPE aufk-werks,
        objnr TYPE aufk-objnr,
        matnr TYPE afpo-matnr,
        gamng TYPE afko-gamng,
        gmein TYPE afko-gmein,
        igmng TYPE afko-igmng,
        wemng TYPE afpo-wemng,
        gstrp TYPE afko-gstrp,
        gltrp TYPE afko-gltrp,
        dispo TYPE afko-dispo,
      END OF ty_row,
      ty_rows TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_js,
        objnr TYPE jest-objnr,
        stat  TYPE jest-stat,
      END OF ty_js,
      ty_jss TYPE STANDARD TABLE OF ty_js WITH DEFAULT KEY.

    METHODS run
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS list_open
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS get_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS check_order
      IMPORTING iv_aufnr  TYPE string
                iv_obj    TYPE tobj-objct
                iv_actvt  TYPE c
      EXPORTING es_ord    TYPE ty_ord
                et_stats  TYPE ty_stats
                ev_ok     TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS load_order
      IMPORTING iv_aufnr TYPE aufk-aufnr
      EXPORTING es_ord   TYPE ty_ord
                ev_found TYPE abap_bool.

    METHODS auth_check
      IMPORTING iv_obj       TYPE tobj-objct
                iv_werks     TYPE aufk-werks
                iv_auart     TYPE aufk-auart
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS read_stats
      IMPORTING iv_objnr         TYPE aufk-objnr
      RETURNING VALUE(rt_stats)  TYPE ty_stats.

    METHODS has_stat
      IMPORTING it_stats      TYPE ty_stats
                iv_stat       TYPE jest-stat
      RETURNING VALUE(rv_has) TYPE abap_bool.

    METHODS is_closed
      IMPORTING it_stats         TYPE ty_stats
      RETURNING VALUE(rv_closed) TYPE abap_bool.

    METHODS status_text
      IMPORTING iv_objnr       TYPE aufk-objnr
      RETURNING VALUE(rv_text) TYPE string.

    METHODS prepare_status
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_ord    TYPE ty_ord
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_status
      IMPORTING iv_action TYPE string
                is_ord    TYPE ty_ord
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_change
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_ord    TYPE ty_ord
                es_data   TYPE bapi_pp_order_change
                es_datax  TYPE bapi_pp_order_changex
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_change
      IMPORTING is_ord    TYPE ty_ord
                is_data   TYPE bapi_pp_order_change
                is_datax  TYPE bapi_pp_order_changex
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS wait_change
      IMPORTING is_ord    TYPE ty_ord
                is_data   TYPE bapi_pp_order_change
                is_datax  TYPE bapi_pp_order_changex
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_confirm
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_ord    TYPE ty_ord
                et_tt     TYPE ty_tt
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS period_check
      IMPORTING iv_werks       TYPE aufk-werks
                iv_date        TYPE sy-datum
      RETURNING VALUE(rv_text) TYPE string.

    METHODS propose_confirm
      IMPORTING is_ord    TYPE ty_ord
      CHANGING  ct_tt     TYPE ty_tt
                cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS backflush_resb
      IMPORTING is_ord      TYPE ty_ord
                it_tt       TYPE ty_tt
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result
      RETURNING VALUE(rv_n) TYPE i.

    METHODS call_confirm
      IMPORTING it_tt      TYPE ty_tt
                iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_gm
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_ord    TYPE ty_ord
                es_head   TYPE bapi2017_gm_head_01
                es_code   TYPE bapi2017_gm_code
                et_item   TYPE ty_gm_items
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_gm
      IMPORTING is_head    TYPE bapi2017_gm_head_01
                is_code    TYPE bapi2017_gm_code
                it_item    TYPE ty_gm_items
                iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS to_aufnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_aufnr) TYPE aufk-aufnr.

    METHODS to_vornr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_vornr) TYPE afvc-vornr.

    METHODS to_matnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_matnr) TYPE afpo-matnr.

    " ---- step 5 (2026-11-10): single-level BOM, result in rows
    METHODS bom_read
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_rows
      IMPORTING is_data TYPE any
                iv_row  TYPE i
      CHANGING  ct_rows TYPE zif_mcp_biz_action=>ty_kvs.

    METHODS to_date
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_date) TYPE sy-datum.

    METHODS to_qty
      IMPORTING iv_value TYPE string
      EXPORTING ev_qty   TYPE afko-gamng
                ev_ok    TYPE abap_bool.

    METHODS fmt_qty
      IMPORTING iv_qty         TYPE afko-gamng
      RETURNING VALUE(rv_text) TYPE string.

    METHODS fmt_date
      IMPORTING iv_date        TYPE sy-datum
      RETURNING VALUE(rv_text) TYPE string.

    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_sy_msg
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_ret2
      IMPORTING it_return TYPE ty_ret2
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_oret
      IMPORTING it_return TYPE ty_oret
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_cret
      IMPORTING it_return TYPE ty_cret
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS commit_or_rollback
      IMPORTING iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

ENDCLASS.



CLASS zcl_mcp_biz_pp IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/PP/actions.json.
    ls_def-id = 'PP.ORD.LIST_OPEN'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.RELEASE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.CHANGE_QTY_DATES'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.CONFIRM'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.COMPLETE_TECH'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.GOODS_ISSUE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.ORD.GOODS_RECEIPT'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'PP.BOM.READ'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'PP.ORD.LIST_OPEN'.
        rs_result = list_open( is_params ).
      WHEN 'PP.ORD.GET_DETAIL'.
        rs_result = get_detail( is_params ).
      WHEN 'PP.BOM.READ'.
        rs_result = bom_read( is_params ).
      WHEN OTHERS.
        lv_text = |{ iv_action } is not a query action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    rs_result = run( iv_action = iv_action is_params = is_params iv_execute = abap_false ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    rs_result = run( iv_action = iv_action is_params = is_params iv_execute = abap_true ).
  ENDMETHOD.


  METHOD run.
    DATA: ls_ord   TYPE ty_ord,
          ls_data  TYPE bapi_pp_order_change,
          ls_datax TYPE bapi_pp_order_changex,
          ls_head  TYPE bapi2017_gm_head_01,
          ls_code  TYPE bapi2017_gm_code,
          lt_gm    TYPE ty_gm_items,
          lt_tt    TYPE ty_tt,
          lv_test  TYPE abap_bool,
          lv_text  TYPE string.

    IF iv_execute = abap_false.
      lv_test = abap_true.
    ENDIF.

    " Every check of the preview runs again on the current data at EXECUTE.
    CASE iv_action.
      WHEN 'PP.ORD.RELEASE' OR 'PP.ORD.COMPLETE_TECH'.
        prepare_status( EXPORTING iv_action = iv_action is_params = is_params
                        IMPORTING es_ord = ls_ord
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          IF iv_execute = abap_true.
            call_status( EXPORTING iv_action = iv_action is_ord = ls_ord
                         CHANGING  cs_result = rs_result ).
          ELSE.
            add_msg( EXPORTING iv_type = 'I'
                               iv_text = 'The BAPI has no TESTRUN: this preview is the status check only'
                     CHANGING  cs_result = rs_result ).
          ENDIF.
        ENDIF.

      WHEN 'PP.ORD.CHANGE_QTY_DATES'.
        prepare_change( EXPORTING is_params = is_params
                        IMPORTING es_ord = ls_ord es_data = ls_data es_datax = ls_datax
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          IF iv_execute = abap_true.
            call_change( EXPORTING is_ord = ls_ord is_data = ls_data is_datax = ls_datax
                         CHANGING  cs_result = rs_result ).
          ELSE.
            add_msg( EXPORTING iv_type = 'I'
                               iv_text = 'The BAPI has no TESTRUN: this preview is the status and quantity check only'
                     CHANGING  cs_result = rs_result ).
          ENDIF.
        ENDIF.

      WHEN 'PP.ORD.CONFIRM'.
        prepare_confirm( EXPORTING is_params = is_params
                         IMPORTING es_ord = ls_ord et_tt = lt_tt
                         CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          propose_confirm( EXPORTING is_ord = ls_ord CHANGING ct_tt = lt_tt cs_result = rs_result ).
          finish( CHANGING cs_result = rs_result ).
        ENDIF.
        IF rs_result-failed = abap_false.
          call_confirm( EXPORTING it_tt = lt_tt iv_testrun = lv_test
                        CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN 'PP.ORD.GOODS_ISSUE' OR 'PP.ORD.GOODS_RECEIPT'.
        prepare_gm( EXPORTING iv_action = iv_action is_params = is_params
                    IMPORTING es_ord = ls_ord es_head = ls_head es_code = ls_code et_item = lt_gm
                    CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_gm( EXPORTING is_head = ls_head is_code = ls_code it_item = lt_gm
                             iv_testrun = lv_test
                   CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN OTHERS.
        lv_text = |{ iv_action } is not a write action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING  cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD list_open.
    DATA: lv_werks  TYPE aufk-werks,
          lv_status TYPE string,
          lv_basis  TYPE string,
          lv_max    TYPE i,
          lv_fetch  TYPE i,
          lv_from   TYPE i,
          lv_lines  TYPE i,
          lv_rel    TYPE abap_bool,
          lv_ok     TYPE abap_bool,
          lv_text   TYPE string,
          lr_dispo  TYPE RANGE OF afko-dispo,
          ls_dispo  LIKE LINE OF lr_dispo,
          lr_matnr  TYPE RANGE OF afpo-matnr,
          ls_matnr  LIKE LINE OF lr_matnr,
          lr_gstrp  TYPE RANGE OF afko-gstrp,
          ls_gstrp  LIKE LINE OF lr_gstrp,
          lt_rows   TYPE ty_rows,
          lt_keep   TYPE ty_rows,
          lt_js     TYPE ty_jss,
          lt_auart  TYPE STANDARD TABLE OF aufk-auart WITH DEFAULT KEY,
          lv_auart  TYPE aufk-auart,
          ls_out    TYPE zif_mcp_biz_action=>ty_pp_order.
    FIELD-SYMBOLS <ls_row> TYPE ty_row.

    " Business-meaning parameters have no defaults: the skill asks them.
    lv_werks  = to_upper( is_params-werks ).
    lv_status = is_params-status.
    lv_basis  = is_params-date_basis.
    IF lv_werks IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    IF lv_status <> 'created' AND lv_status <> 'released' AND lv_status <> 'all_open'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'status is required: created, released or all_open'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    IF lv_basis <> 'start_due_today' AND lv_basis <> 'start_overdue_until_today'
       AND lv_basis <> 'all'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'date_basis is required: start_due_today, start_overdue_until_today or all'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    lv_max = 200.
    IF is_params-max_rows IS NOT INITIAL AND is_params-max_rows CO '0123456789'.
      lv_max = is_params-max_rows.
    ENDIF.
    IF lv_max > 1000.
      lv_max = 1000.
    ENDIF.
    IF lv_max < 1.
      lv_max = 200.
    ENDIF.
    lv_fetch = lv_max + 1.

    IF is_params-dispo IS NOT INITIAL.
      ls_dispo-sign = 'I'. ls_dispo-option = 'EQ'.
      ls_dispo-low = to_upper( is_params-dispo ).
      APPEND ls_dispo TO lr_dispo.
    ENDIF.
    IF is_params-matnr IS NOT INITIAL.
      ls_matnr-sign = 'I'. ls_matnr-option = 'EQ'.
      ls_matnr-low = to_matnr( is_params-matnr ).
      APPEND ls_matnr TO lr_matnr.
    ENDIF.
    CASE lv_basis.
      WHEN 'start_due_today'.
        ls_gstrp-sign = 'I'. ls_gstrp-option = 'EQ'. ls_gstrp-low = sy-datum.
        APPEND ls_gstrp TO lr_gstrp.
      WHEN 'start_overdue_until_today'.
        ls_gstrp-sign = 'I'. ls_gstrp-option = 'LE'. ls_gstrp-low = sy-datum.
        APPEND ls_gstrp TO lr_gstrp.
    ENDCASE.

    " Open = not technically completed, closed or flagged for deletion.
    SELECT k~aufnr k~auart k~werks k~objnr p~matnr o~gamng o~gmein o~igmng
           p~wemng o~gstrp o~gltrp o~dispo
      FROM aufk AS k
      INNER JOIN afko AS o ON o~aufnr = k~aufnr
      INNER JOIN afpo AS p ON p~aufnr = k~aufnr
      INTO CORRESPONDING FIELDS OF TABLE lt_rows
      UP TO 5000 ROWS
      WHERE k~autyp = '10'
        AND k~loekz = space
        AND k~werks = lv_werks
        AND o~dispo IN lr_dispo
        AND p~matnr IN lr_matnr
        AND o~gstrp IN lr_gstrp
        AND NOT EXISTS ( SELECT objnr FROM jest
                           WHERE objnr = k~objnr
                             AND stat IN ('I0045', 'I0046', 'I0076', 'I0013')
                             AND inact = space ).

    IF lt_rows IS NOT INITIAL.
      SELECT objnr stat FROM jest INTO TABLE lt_js
        FOR ALL ENTRIES IN lt_rows
        WHERE objnr = lt_rows-objnr AND inact = space.
      SORT lt_js BY objnr stat.
    ENDIF.

    LOOP AT lt_rows ASSIGNING <ls_row>.
      READ TABLE lt_js TRANSPORTING NO FIELDS
        WITH KEY objnr = <ls_row>-objnr stat = c_rel BINARY SEARCH.
      IF sy-subrc = 0.
        lv_rel = abap_true.
      ELSE.
        lv_rel = abap_false.
      ENDIF.
      lv_ok = abap_true.
      IF lv_status = 'created' AND lv_rel = abap_true.
        lv_ok = abap_false.
      ELSEIF lv_status = 'released' AND lv_rel = abap_false.
        lv_ok = abap_false.
      ENDIF.
      IF lv_ok = abap_true.
        APPEND <ls_row> TO lt_keep.
      ENDIF.
    ENDLOOP.
    SORT lt_keep BY gstrp aufnr.

    " Display authorization per order type.
    LOOP AT lt_keep ASSIGNING <ls_row>.
      COLLECT <ls_row>-auart INTO lt_auart.
    ENDLOOP.
    LOOP AT lt_auart INTO lv_auart.
      IF auth_check( iv_obj = 'C_AFKO_AWK' iv_werks = lv_werks
                     iv_auart = lv_auart iv_actvt = '03' ) = abap_false.
        lv_lines = lines( lt_keep ).
        DELETE lt_keep WHERE auart = lv_auart.
        rs_result-hidden_no_auth = rs_result-hidden_no_auth + lv_lines - lines( lt_keep ).
      ENDIF.
    ENDLOOP.

    IF lines( lt_keep ) > lv_max.
      rs_result-truncated = abap_true.
      lv_from = lv_max + 1.
      DELETE lt_keep FROM lv_from.
    ENDIF.

    LOOP AT lt_keep ASSIGNING <ls_row>.
      CLEAR ls_out.
      MOVE-CORRESPONDING <ls_row> TO ls_out.
      ls_out-status = status_text( <ls_row>-objnr ).
      APPEND ls_out TO rs_result-pp_orders.
    ENDLOOP.

    lv_lines = lines( rs_result-pp_orders ).
    lv_text = |{ lv_lines } open production orders|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD get_detail.
    DATA: ls_ord   TYPE ty_ord,
          lt_stats TYPE ty_stats,
          lv_ok    TYPE abap_bool,
          ls_obj   TYPE bapi_pp_order_objects,
          lv_num   TYPE bapi_order_key-order_number,
          ls_ret   TYPE bapiret2,
          lt_ret2  TYPE ty_ret2,
          lt_head  TYPE ty_heads,
          lt_op    TYPE zif_mcp_biz_action=>ty_pp_operations,
          lt_comp  TYPE zif_mcp_biz_action=>ty_pp_components,
          lv_o     TYPE i,
          lv_c     TYPE i,
          lv_text  TYPE string.

    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_obj = 'C_AFKO_AWK' iv_actvt = '03'
                 IMPORTING es_ord = ls_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = rs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.

    lv_num = ls_ord-aufnr.
    ls_obj-header     = 'X'.
    ls_obj-operations = 'X'.
    ls_obj-components = 'X'.
    CALL FUNCTION 'BAPI_PRODORD_GET_DETAIL'
      EXPORTING
        number        = lv_num
        order_objects = ls_obj
      IMPORTING
        return        = ls_ret
      TABLES
        header        = lt_head
        operation     = lt_op
        component     = lt_comp
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_ret IS NOT INITIAL.
      APPEND ls_ret TO lt_ret2.
      add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = rs_result ).
    ENDIF.

    READ TABLE lt_head INTO rs_result-pp_header INDEX 1.
    rs_result-pp_operations = lt_op.
    rs_result-pp_components = lt_comp.
    rs_result-pp_status     = status_text( ls_ord-objnr ).

    lv_o = lines( lt_op ).
    lv_c = lines( lt_comp ).
    lv_text = |{ lv_o } operations, { lv_c } components|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD check_order.
    DATA: lv_aufnr TYPE aufk-aufnr,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    CLEAR: es_ord, et_stats, ev_ok.
    lv_aufnr = to_aufnr( iv_aufnr ).
    IF lv_aufnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'aufnr is required (digits, up to 12)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_order( EXPORTING iv_aufnr = lv_aufnr
                IMPORTING es_ord = es_ord ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Order { lv_aufnr ALPHA = OUT } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_ord-autyp <> '10'.
      lv_text = |Order { lv_aufnr ALPHA = OUT } is not a production order|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_check( iv_obj = iv_obj iv_werks = es_ord-werks
                   iv_auart = es_ord-auart iv_actvt = iv_actvt ) = abap_false.
      lv_text = |No authorization for order { lv_aufnr ALPHA = OUT } (plant { es_ord-werks }, order type { es_ord-auart })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    et_stats = read_stats( es_ord-objnr ).
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD load_order.
    DATA: lt_items TYPE ty_items,
          ls_item  TYPE ty_item.

    CLEAR: es_ord, ev_found.
    SELECT SINGLE k~aufnr k~autyp k~auart k~werks k~objnr o~rsnum o~aufpl
                  o~gamng o~gmein o~igmng o~gstrp o~gltrp o~dispo
      FROM aufk AS k
      INNER JOIN afko AS o ON o~aufnr = k~aufnr
      INTO CORRESPONDING FIELDS OF es_ord
      WHERE k~aufnr = iv_aufnr.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    ev_found = abap_true.

    SELECT posnr matnr psmng wemng amein dwerk lgort FROM afpo
      INTO TABLE lt_items
      WHERE aufnr = iv_aufnr.
    SORT lt_items BY posnr.
    es_ord-items = lines( lt_items ).
    READ TABLE lt_items INTO ls_item INDEX 1.
    IF sy-subrc = 0.
      es_ord-posnr = ls_item-posnr.
      es_ord-matnr = ls_item-matnr.
      es_ord-amein = ls_item-amein.
      es_ord-dwerk = ls_item-dwerk.
      es_ord-lgort = ls_item-lgort.
    ENDIF.
    LOOP AT lt_items INTO ls_item.
      es_ord-psmng = es_ord-psmng + ls_item-psmng.
      es_ord-wemng = es_ord-wemng + ls_item-wemng.
    ENDLOOP.
  ENDMETHOD.


  METHOD auth_check.
    DATA: ls_tobj  TYPE tobj,
          lv_comp  TYPE string,
          lv_actvt TYPE abap_bool.
    FIELD-SYMBOLS <lv_f> TYPE any.

    " The field list of C_AFKO_AWK differs between systems: ACTVT is only
    " passed when the object has it.
    SELECT SINGLE * FROM tobj INTO ls_tobj WHERE objct = iv_obj.
    DO 10 TIMES.
      lv_comp = |FIEL{ sy-index }|.
      ASSIGN COMPONENT lv_comp OF STRUCTURE ls_tobj TO <lv_f>.
      IF sy-subrc = 0 AND <lv_f> = 'ACTVT'.
        lv_actvt = abap_true.
      ENDIF.
    ENDDO.

    IF lv_actvt = abap_true.
      AUTHORITY-CHECK OBJECT iv_obj
        ID 'ACTVT'  FIELD iv_actvt
        ID 'WERKS'  FIELD iv_werks
        ID 'AUFART' FIELD iv_auart.
    ELSE.
      AUTHORITY-CHECK OBJECT iv_obj
        ID 'WERKS'  FIELD iv_werks
        ID 'AUFART' FIELD iv_auart.
    ENDIF.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD read_stats.
    SELECT stat FROM jest INTO TABLE rt_stats
      WHERE objnr = iv_objnr AND inact = space.
  ENDMETHOD.


  METHOD has_stat.
    READ TABLE it_stats TRANSPORTING NO FIELDS WITH KEY table_line = iv_stat.
    IF sy-subrc = 0.
      rv_has = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD is_closed.
    IF has_stat( it_stats = it_stats iv_stat = c_teco ) = abap_true
       OR has_stat( it_stats = it_stats iv_stat = c_clsd ) = abap_true
       OR has_stat( it_stats = it_stats iv_stat = c_dlfl ) = abap_true
       OR has_stat( it_stats = it_stats iv_stat = c_dlt ) = abap_true.
      rv_closed = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD status_text.
    DATA lv_line TYPE bsvx-sttxt.

    CALL FUNCTION 'STATUS_TEXT_EDIT'
      EXPORTING
        objnr            = iv_objnr
        spras            = sy-langu
      IMPORTING
        line             = lv_line
      EXCEPTIONS
        object_not_found = 1
        OTHERS           = 2.
    IF sy-subrc = 0.
      rv_text = lv_line.
      CONDENSE rv_text.
    ENDIF.
  ENDMETHOD.


  METHOD prepare_status.
    DATA: lt_stats TYPE ty_stats,
          lv_ok    TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_text  TYPE string,
          lv_aufnr TYPE string.

    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_obj = 'C_AFKO_AWK' iv_actvt = '02'
                 IMPORTING es_ord = es_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    lv_aufnr = es_ord-aufnr.
    SHIFT lv_aufnr LEFT DELETING LEADING '0'.
    cs_result-pp_status = status_text( es_ord-objnr ).

    IF is_closed( lt_stats ) = abap_true.
      lv_text = |Order { lv_aufnr } is technically completed, closed or flagged for deletion (status: { cs_result-pp_status })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    CASE iv_action.
      WHEN 'PP.ORD.RELEASE'.
        IF has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_true.
          lv_text = |Order { lv_aufnr } is already released (status: { cs_result-pp_status })|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        IF has_stat( it_stats = lt_stats iv_stat = c_lkd ) = abap_true.
          lv_text = |Order { lv_aufnr } is locked (status: { cs_result-pp_status })|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        ls_chg-field     = 'SYSTEM_STATUS'.
        ls_chg-old_value = cs_result-pp_status.
        ls_chg-new_value = 'REL'.
        APPEND ls_chg TO cs_result-changes.

      WHEN 'PP.ORD.COMPLETE_TECH'.
        IF has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_false
           AND has_stat( it_stats = lt_stats iv_stat = c_pcnf ) = abap_false
           AND has_stat( it_stats = lt_stats iv_stat = c_cnf ) = abap_false.
          lv_text = |Order { lv_aufnr } is not released: release it first (status: { cs_result-pp_status })|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        IF es_ord-wemng < es_ord-psmng.
          lv_text = |Open quantity: delivered { fmt_qty( es_ord-wemng ) } of { fmt_qty( es_ord-psmng ) }|.
          add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
        ENDIF.
        IF has_stat( it_stats = lt_stats iv_stat = c_cnf ) = abap_false.
          add_msg( EXPORTING iv_type = 'W'
                             iv_text = 'The order has no final confirmation (status CNF is not set)'
                   CHANGING  cs_result = cs_result ).
        ENDIF.
        add_msg( EXPORTING iv_type = 'W'
                           iv_text = 'TECO can be revoked only in CO02 (reset technical completion): it cannot be undone here'
                 CHANGING  cs_result = cs_result ).
        cs_result-irreversible = abap_true.
        ls_chg-field     = 'SYSTEM_STATUS'.
        ls_chg-old_value = cs_result-pp_status.
        ls_chg-new_value = 'TECO'.
        APPEND ls_chg TO cs_result-changes.

      WHEN OTHERS.
        lv_text = |{ iv_action } is not a status action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDCASE.
  ENDMETHOD.


  METHOD call_status.
    DATA: lt_ord  TYPE ty_ords,
          ls_key  TYPE bapi_order_key,
          ls_ret  TYPE bapiret2,
          lt_ret2 TYPE ty_ret2,
          lt_det  TYPE ty_oret.

    ls_key-order_number = is_ord-aufnr.
    APPEND ls_key TO lt_ord.

    IF iv_action = 'PP.ORD.RELEASE'.
      CALL FUNCTION 'BAPI_PRODORD_RELEASE'
        IMPORTING
          return        = ls_ret
        TABLES
          orders        = lt_ord
          detail_return = lt_det
        EXCEPTIONS
          error_message = 1
          OTHERS        = 2.
    ELSE.
      CALL FUNCTION 'BAPI_PRODORD_COMPLETE_TECH'
        IMPORTING
          return        = ls_ret
        TABLES
          orders        = lt_ord
          detail_return = lt_det
        EXCEPTIONS
          error_message = 1
          OTHERS        = 2.
    ENDIF.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    IF ls_ret IS NOT INITIAL.
      APPEND ls_ret TO lt_ret2.
      add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = cs_result ).
    ENDIF.
    add_oret( EXPORTING it_return = lt_det CHANGING cs_result = cs_result ).
    commit_or_rollback( EXPORTING iv_testrun = abap_false CHANGING cs_result = cs_result ).
    cs_result-pp_status_new = status_text( is_ord-objnr ).
  ENDMETHOD.


  METHOD prepare_change.
    DATA: lt_stats  TYPE ty_stats,
          lv_ok     TYPE abap_bool,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string,
          lv_aufnr  TYPE string,
          lv_qty    TYPE afko-gamng,
          lv_qok    TYPE abap_bool,
          lv_start  TYPE sy-datum,
          lv_end    TYPE sy-datum,
          lv_nstart TYPE sy-datum,
          lv_nend   TYPE sy-datum,
          lv_min    TYPE afko-gamng,
          lv_any    TYPE abap_bool.

    CLEAR: es_data, es_datax.
    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_obj = 'C_AFKO_AWK' iv_actvt = '02'
                 IMPORTING es_ord = es_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    lv_aufnr = es_ord-aufnr.
    SHIFT lv_aufnr LEFT DELETING LEADING '0'.
    cs_result-pp_status = status_text( es_ord-objnr ).

    IF is_closed( lt_stats ) = abap_true.
      lv_text = |Order { lv_aufnr } is technically completed, closed or flagged for deletion (status: { cs_result-pp_status })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-new_quantity IS INITIAL AND is_params-new_start IS INITIAL
       AND is_params-new_finish IS INITIAL.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'Give new_quantity, new_start or new_finish: nothing to change'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    IF is_params-new_quantity IS NOT INITIAL.
      to_qty( EXPORTING iv_value = is_params-new_quantity IMPORTING ev_qty = lv_qty ev_ok = lv_qok ).
      IF lv_qok = abap_false OR lv_qty <= 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_quantity must be a positive number'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_min = es_ord-igmng.
      IF es_ord-wemng > lv_min.
        lv_min = es_ord-wemng.
      ENDIF.
      IF lv_qty < lv_min.
        lv_text = |new_quantity is below the confirmed or delivered quantity ({ fmt_qty( lv_min ) })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_qty <> es_ord-gamng.
        es_data-quantity      = lv_qty.
        es_data-quantity_uom  = es_ord-gmein.
        es_datax-quantity     = 'X'.
        es_datax-quantity_uom = 'X'.
        ls_chg-field     = 'QUANTITY'.
        ls_chg-old_value = fmt_qty( es_ord-gamng ).
        ls_chg-new_value = fmt_qty( lv_qty ).
        APPEND ls_chg TO cs_result-changes.
        lv_any = abap_true.
      ENDIF.
    ENDIF.

    lv_start  = es_ord-gstrp.
    lv_end    = es_ord-gltrp.
    IF is_params-new_start IS NOT INITIAL.
      lv_nstart = to_date( is_params-new_start ).
      IF lv_nstart IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_start must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_start = lv_nstart.
    ENDIF.
    IF is_params-new_finish IS NOT INITIAL.
      lv_nend = to_date( is_params-new_finish ).
      IF lv_nend IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_finish must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_end = lv_nend.
    ENDIF.
    IF lv_start > lv_end.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The start date is after the finish date'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lv_nstart IS NOT INITIAL AND lv_nstart <> es_ord-gstrp.
      es_data-basic_start_date  = lv_nstart.
      es_datax-basic_start_date = 'X'.
      ls_chg-field     = 'BASIC_START_DATE'.
      ls_chg-old_value = fmt_date( es_ord-gstrp ).
      ls_chg-new_value = fmt_date( lv_nstart ).
      APPEND ls_chg TO cs_result-changes.
      lv_any = abap_true.
    ENDIF.
    IF lv_nend IS NOT INITIAL AND lv_nend <> es_ord-gltrp.
      es_data-basic_end_date  = lv_nend.
      es_datax-basic_end_date = 'X'.
      ls_chg-field     = 'BASIC_END_DATE'.
      ls_chg-old_value = fmt_date( es_ord-gltrp ).
      ls_chg-new_value = fmt_date( lv_nend ).
      APPEND ls_chg TO cs_result-changes.
      lv_any = abap_true.
    ENDIF.

    IF lv_any = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The order already has these values: nothing to change'
               CHANGING  cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD call_change.
    DATA: lv_num   TYPE bapi_order_key-order_number,
          ls_ret   TYPE bapiret2,
          lt_ret2  TYPE ty_ret2,
          ls_data  TYPE bapi_pp_order_change,
          ls_datax TYPE bapi_pp_order_changex.

    lv_num   = is_ord-aufnr.
    ls_data  = is_data.
    ls_datax = is_datax.
    CALL FUNCTION 'BAPI_PRODORD_CHANGE'
      EXPORTING
        number        = lv_num
        orderdata     = ls_data
        orderdatax    = ls_datax
      IMPORTING
        return        = ls_ret
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    IF ls_ret IS NOT INITIAL.
      " The BAPI rolls back by itself when RETURN is filled.
      IF ls_ret-type NA 'EA'.
        ls_ret-type = 'E'.
      ENDIF.
      APPEND ls_ret TO lt_ret2.
      add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = cs_result ).
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = abap_false CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_false.
      wait_change( EXPORTING is_ord = is_ord is_data = ls_data is_datax = ls_datax
                   CHANGING  cs_result = cs_result ).
    ENDIF.
    cs_result-pp_status_new = status_text( is_ord-objnr ).
  ENDMETHOD.


  METHOD wait_change.
    DATA: lv_gamng TYPE afko-gamng,
          lv_gstrp TYPE afko-gstrp,
          lv_gltrp TYPE afko-gltrp,
          lv_ok    TYPE abap_bool,
          lv_text  TYPE string.

    " BAPI_PRODORD_CHANGE posts through the update task: wait until every requested value
    " has changed in the order (or 10 s). Then compare requested and actual values: a value
    " that did not change is an error (never report success without a change), a value moved
    " to another date by scheduling is a warning with the old and new values.
    DO 10 TIMES.
      SELECT SINGLE gamng gstrp gltrp FROM afko
        INTO (lv_gamng, lv_gstrp, lv_gltrp)
        WHERE aufnr = is_ord-aufnr.
      lv_ok = abap_true.
      IF is_datax-quantity = 'X' AND lv_gamng = is_ord-gamng.
        lv_ok = abap_false.
      ENDIF.
      IF is_datax-basic_start_date = 'X' AND lv_gstrp = is_ord-gstrp.
        lv_ok = abap_false.
      ENDIF.
      IF is_datax-basic_end_date = 'X' AND lv_gltrp = is_ord-gltrp AND is_datax-basic_start_date <> 'X'.
        lv_ok = abap_false.
      ENDIF.
      IF lv_ok = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.

    IF is_datax-quantity = 'X' AND lv_gamng <> is_data-quantity.
      lv_text = |The quantity was not changed: requested { fmt_qty( is_data-quantity ) }, the order has { fmt_qty( lv_gamng ) }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
    IF is_datax-basic_start_date = 'X' AND lv_gstrp <> is_data-basic_start_date.
      IF lv_gstrp = is_ord-gstrp.
        lv_text = |The start date was not changed: requested { fmt_date( is_data-basic_start_date ) }, the order still starts { fmt_date( lv_gstrp ) } and finishes { fmt_date( lv_gltrp ) } (scheduling of the order type may override basic dates)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      ELSE.
        lv_text = |The start date was rescheduled by the system: requested { fmt_date( is_data-basic_start_date ) }, now { fmt_date( lv_gstrp ) } (was { fmt_date( is_ord-gstrp ) })|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    IF is_datax-basic_end_date = 'X' AND lv_gltrp <> is_data-basic_end_date.
      IF lv_gltrp = is_ord-gltrp AND is_datax-basic_start_date <> 'X'.
        lv_text = |The finish date was not changed: requested { fmt_date( is_data-basic_end_date ) }, the order still finishes { fmt_date( lv_gltrp ) }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      ELSE.
        lv_text = |The finish date was rescheduled by the system: requested { fmt_date( is_data-basic_end_date ) }, now { fmt_date( lv_gltrp ) } (was { fmt_date( is_ord-gltrp ) })|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    " A quantity change makes the system schedule the order again: dates the user did not ask
    " to change can move. Say so (the order would otherwise show other dates than expected).
    IF is_datax-basic_end_date <> 'X' AND lv_gltrp <> is_ord-gltrp.
      lv_text = |The finish date was moved by the system from { fmt_date( is_ord-gltrp ) } to { fmt_date( lv_gltrp ) } (scheduling)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
    IF is_datax-basic_start_date <> 'X' AND lv_gstrp <> is_ord-gstrp.
      lv_text = |The start date was moved by the system from { fmt_date( is_ord-gstrp ) } to { fmt_date( lv_gstrp ) } (scheduling)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD prepare_confirm.
    DATA: lt_stats  TYPE ty_stats,
          lv_ok     TYPE abap_bool,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string,
          lv_aufnr  TYPE string,
          lv_vornr  TYPE afvc-vornr,
          lv_vobjnr TYPE afvc-objnr,
          lt_vstats TYPE ty_stats,
          lv_yield  TYPE afko-gamng,
          lv_scrap  TYPE afko-gamng,
          lv_yok    TYPE abap_bool,
          lv_sok    TYPE abap_bool,
          lv_final  TYPE string,
          lv_date   TYPE sy-datum,
          ls_tt     TYPE bapi_pp_timeticket,
          lv_new    TYPE afko-gamng.

    CLEAR et_tt.
    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_obj = 'C_AFRU_AWK' iv_actvt = '01'
                 IMPORTING es_ord = es_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    lv_aufnr = es_ord-aufnr.
    SHIFT lv_aufnr LEFT DELETING LEADING '0'.
    cs_result-pp_status = status_text( es_ord-objnr ).

    IF is_closed( lt_stats ) = abap_true.
      lv_text = |Order { lv_aufnr } is technically completed, closed or flagged for deletion (status: { cs_result-pp_status })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_false
       AND has_stat( it_stats = lt_stats iv_stat = c_pcnf ) = abap_false.
      lv_text = |Order { lv_aufnr } is not released: release it before confirming (status: { cs_result-pp_status })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Operation: must exist in the order and not be finally confirmed yet.
    lv_vornr = to_vornr( is_params-vornr ).
    IF lv_vornr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vornr is required (operation number, up to 4 digits)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE objnr FROM afvc INTO lv_vobjnr
      WHERE aufpl = es_ord-aufpl AND vornr = lv_vornr.
    IF sy-subrc <> 0.
      lv_text = |Operation { lv_vornr } not found in order { lv_aufnr }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lt_vstats = read_stats( lv_vobjnr ).
    IF has_stat( it_stats = lt_vstats iv_stat = c_cnf ) = abap_true.
      lv_text = |Operation { lv_vornr } is already finally confirmed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    to_qty( EXPORTING iv_value = is_params-yield IMPORTING ev_qty = lv_yield ev_ok = lv_yok ).
    IF lv_yok = abap_false OR lv_yield < 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'yield is required and must be zero or a positive number'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-scrap IS NOT INITIAL.
      to_qty( EXPORTING iv_value = is_params-scrap IMPORTING ev_qty = lv_scrap ev_ok = lv_sok ).
      IF lv_sok = abap_false OR lv_scrap < 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'scrap must be zero or a positive number'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    " FIN_CONF (domain AUERU_VS): ' ' partial, 'X' final, '1' automatic final.
    lv_final = is_params-final_conf.
    CASE lv_final.
      WHEN 'partial'.
        ls_tt-fin_conf = space.
      WHEN 'final'.
        ls_tt-fin_conf = 'X'.
      WHEN 'auto'.
        ls_tt-fin_conf = '1'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = 'final_conf is required: partial, final or auto'
                 CHANGING  cs_result = cs_result ).
        RETURN.
    ENDCASE.
    IF lv_yield = 0 AND lv_scrap = 0 AND lv_final = 'partial'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'Nothing to confirm: yield and scrap are zero in a partial confirmation'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_date = to_date( is_params-posting_date ).
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    " The confirmation TESTRUN does not check the posting period: check it here.
    lv_text = period_check( iv_werks = es_ord-werks iv_date = lv_date ).
    IF lv_text IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    ls_tt-orderid        = es_ord-aufnr.
    ls_tt-sequence       = '000000'.
    ls_tt-operation      = lv_vornr.
    ls_tt-plant          = es_ord-werks.
    ls_tt-conf_quan_unit = es_ord-gmein.
    ls_tt-yield          = lv_yield.
    ls_tt-scrap          = lv_scrap.
    ls_tt-postg_date     = lv_date.
    " Execution on the posting date: the activity proposal (and its rate keys) use this date.
    ls_tt-exec_start_date = lv_date.
    ls_tt-exec_fin_date   = lv_date.
    APPEND ls_tt TO et_tt.

    lv_new = es_ord-igmng + lv_yield.
    ls_chg-field     = 'CONFIRMED_YIELD'.
    ls_chg-old_value = fmt_qty( es_ord-igmng ).
    ls_chg-new_value = fmt_qty( lv_new ).
    APPEND ls_chg TO cs_result-changes.
    ls_chg-field     = 'FIN_CONF'.
    CLEAR ls_chg-old_value.
    ls_chg-new_value = lv_final.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD call_confirm.
    DATA: lt_tt   TYPE ty_tt,
          lt_det  TYPE ty_cret,
          ls_det  TYPE bapi_coru_return,
          ls_ret  TYPE bapiret1,
          ls_r2   TYPE bapiret2,
          lt_ret2 TYPE ty_ret2,
          lv_test TYPE bapi_coru_param-testrun.

    lt_tt   = it_tt.
    lv_test = iv_testrun.
    CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
      EXPORTING
        testrun       = lv_test
      IMPORTING
        return        = ls_ret
      TABLES
        timetickets   = lt_tt
        detail_return = lt_det
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    " DETAIL_RETURN first: it carries the reason; the RETURN header only counts the errors.
    add_cret( EXPORTING it_return = lt_det CHANGING cs_result = cs_result ).
    IF ls_ret IS NOT INITIAL.
      MOVE-CORRESPONDING ls_ret TO ls_r2.
      APPEND ls_r2 TO lt_ret2.
      add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = cs_result ).
    ENDIF.
    LOOP AT lt_det INTO ls_det WHERE conf_no IS NOT INITIAL.
      cs_result-conf_no  = ls_det-conf_no.
      cs_result-conf_cnt = ls_det-conf_cnt.
    ENDLOOP.
    commit_or_rollback( EXPORTING iv_testrun = iv_testrun CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD period_check.
    " Posting period of the plant's company code: MM period (MARV, current period, previous
    " period only with backposting allowed) and FI period (posting period variant, all accounts).
    DATA: lv_bwkey TYPE t001w-bwkey,
          lv_bukrs TYPE t001k-bukrs,
          lv_gjahr TYPE bkpf-gjahr,
          lv_monat TYPE bkpf-monat,
          lv_poper TYPE t009b-poper,
          ls_marv  TYPE marv,
          lv_ok    TYPE abap_bool,
          lv_frye  TYPE t001b-frye1,
          lv_frpe  TYPE t001b-frpe1.

    SELECT SINGLE bwkey FROM t001w INTO lv_bwkey WHERE werks = iv_werks.
    SELECT SINGLE bukrs FROM t001k INTO lv_bukrs WHERE bwkey = lv_bwkey.
    IF lv_bukrs IS INITIAL.
      rv_text = |No company code found for plant { iv_werks }|.
      RETURN.
    ENDIF.
    CALL FUNCTION 'FI_PERIOD_DETERMINE'
      EXPORTING
        i_budat        = iv_date
        i_bukrs        = lv_bukrs
      IMPORTING
        e_gjahr        = lv_gjahr
        e_monat        = lv_monat
        e_poper        = lv_poper
      EXCEPTIONS
        fiscal_year    = 1
        period         = 2
        period_version = 3
        posting_period = 4
        special_period = 5
        version        = 6
        posting_date   = 7
        OTHERS         = 8.
    IF sy-subrc <> 0.
      rv_text = |No fiscal period for posting date { fmt_date( iv_date ) } in company code { lv_bukrs }|.
      RETURN.
    ENDIF.

    SELECT SINGLE * FROM marv INTO ls_marv WHERE bukrs = lv_bukrs.
    IF sy-subrc = 0.
      IF lv_gjahr = ls_marv-lfgja AND lv_monat = ls_marv-lfmon.
        lv_ok = abap_true.
      ELSEIF lv_gjahr = ls_marv-vmgja AND lv_monat = ls_marv-vmmon AND ls_marv-xruem = abap_true.
        lv_ok = abap_true.
      ENDIF.
      IF lv_ok = abap_false.
        rv_text = |Posting date { fmt_date( iv_date ) } is in period { lv_monat }/{ lv_gjahr }: the MM period of company code { lv_bukrs } is { ls_marv-lfmon }/{ ls_marv-lfgja }|.
        IF ls_marv-xruem = abap_true.
          rv_text = |{ rv_text } (previous period { ls_marv-vmmon }/{ ls_marv-vmgja } also open)|.
        ENDIF.
        RETURN.
      ENDIF.
    ENDIF.

    " FI_PERIOD_CHECK types: year T001B-FRYE1, period T001B-FRPE1 (3 digits).
    lv_frye = lv_gjahr.
    lv_frpe = lv_monat.
    CALL FUNCTION 'FI_PERIOD_CHECK'
      EXPORTING
        i_bukrs          = lv_bukrs
        i_gjahr          = lv_frye
        i_koart          = '+'
        i_monat          = lv_frpe
      EXCEPTIONS
        error_period     = 1
        error_period_acc = 2
        invalid_input    = 3
        OTHERS           = 4.
    IF sy-subrc <> 0.
      rv_text = |FI posting period { lv_monat }/{ lv_gjahr } is not open in company code { lv_bukrs }|.
    ENDIF.
  ENDMETHOD.


  METHOD propose_confirm.
    " Activities and automatic goods movements as the dialog proposes them (CO11N).
    " Quantities, dates and the final flag of the request are kept.
    DATA: ls_prop  TYPE bapi_pp_conf_prop,
          lt_prop  TYPE ty_tt,
          ls_tt    TYPE bapi_pp_timeticket,
          ls_new   TYPE bapi_pp_timeticket,
          lt_gm    TYPE ty_gm_items,
          ls_gm    TYPE bapi2017_gm_item_create,
          lt_link  TYPE STANDARD TABLE OF bapi_link_conf_goodsmov,
          lt_det   TYPE ty_cret,
          ls_ret   TYPE bapiret1,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_tabix TYPE sy-tabix,
          lv_text  TYPE string,
          lv_n     TYPE i.

    " 1st try: activities + goods movements on the posting date / execution dates of the
    " request (no date proposal: it would use today). Quantities, dates and final flag are kept.
    ls_prop-activity      = abap_true.
    ls_prop-goodsmovement = abap_true.
    lt_prop = ct_tt.
    CALL FUNCTION 'BAPI_PRODORDCONF_GET_TT_PROP'
      EXPORTING
        propose            = ls_prop
      IMPORTING
        return             = ls_ret
      TABLES
        timetickets        = lt_prop
        goodsmovements     = lt_gm
        link_conf_goodsmov = lt_link
        detail_return      = lt_det
      EXCEPTIONS
        error_message      = 1
        OTHERS             = 2.
    IF sy-subrc <> 0 OR ls_ret-type CA 'EA'.
      IF sy-subrc <> 0.
        MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
          WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_text.
      ELSE.
        lv_text = ls_ret-message.
      ENDIF.
      lv_text = |Activities are not proposed ({ lv_text }): the confirmation carries quantities only; add the activities in CO11N if needed|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
      " 2nd try: goods movements only, so the automatic goods movements can still be listed.
      CLEAR: ls_prop, ls_ret, lt_gm, lt_link, lt_det.
      ls_prop-goodsmovement = abap_true.
      lt_prop = ct_tt.
      CALL FUNCTION 'BAPI_PRODORDCONF_GET_TT_PROP'
        EXPORTING
          propose            = ls_prop
        IMPORTING
          return             = ls_ret
        TABLES
          timetickets        = lt_prop
          goodsmovements     = lt_gm
          link_conf_goodsmov = lt_link
          detail_return      = lt_det
        EXCEPTIONS
          error_message      = 1
          OTHERS             = 2.
      IF sy-subrc <> 0 OR ls_ret-type CA 'EA'.
        IF sy-subrc <> 0.
          MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_text.
        ELSE.
          lv_text = ls_ret-message.
        ENDIF.
        lv_text = |The goods movement proposal failed ({ lv_text }): the backflush components are taken from the reservation|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
        CLEAR lt_gm.
      ENDIF.
      CLEAR lt_prop.
    ENDIF.

    LOOP AT ct_tt INTO ls_tt.
      lv_tabix = sy-tabix.
      READ TABLE lt_prop INTO ls_new INDEX lv_tabix.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      ls_tt-conf_acti_unit1 = ls_new-conf_acti_unit1.
      ls_tt-conf_activity1  = ls_new-conf_activity1.
      ls_tt-conf_acti_unit2 = ls_new-conf_acti_unit2.
      ls_tt-conf_activity2  = ls_new-conf_activity2.
      ls_tt-conf_acti_unit3 = ls_new-conf_acti_unit3.
      ls_tt-conf_activity3  = ls_new-conf_activity3.
      ls_tt-conf_acti_unit4 = ls_new-conf_acti_unit4.
      ls_tt-conf_activity4  = ls_new-conf_activity4.
      ls_tt-conf_acti_unit5 = ls_new-conf_acti_unit5.
      ls_tt-conf_activity5  = ls_new-conf_activity5.
      ls_tt-conf_acti_unit6 = ls_new-conf_acti_unit6.
      ls_tt-conf_activity6  = ls_new-conf_activity6.
      MODIFY ct_tt FROM ls_tt INDEX lv_tabix.
      CLEAR ls_chg.
      ls_chg-field     = 'ACTIVITIES'.
      ls_chg-new_value = |{ fmt_qty( ls_tt-conf_activity1 ) } { ls_tt-conf_acti_unit1 }; { fmt_qty( ls_tt-conf_activity2 ) } { ls_tt-conf_acti_unit2 }; { fmt_qty( ls_tt-conf_activity3 ) } { ls_tt-conf_acti_unit3 }|.
      APPEND ls_chg TO cs_result-changes.
    ENDLOOP.

    " Goods movements the confirmation posts by itself (backflush 261, automatic goods receipt 101).
    LOOP AT lt_gm INTO ls_gm.
      lv_n = lv_n + 1.
      CLEAR ls_chg.
      ls_chg-field     = |GOODS_MOVEMENT { ls_gm-move_type } { ls_gm-material ALPHA = OUT }|.
      ls_chg-old_value = |plant { ls_gm-plant } storage location { ls_gm-stge_loc }|.
      ls_chg-new_value = |{ fmt_qty( ls_gm-entry_qnt ) } { ls_gm-entry_uom }|.
      APPEND ls_chg TO cs_result-changes.
    ENDLOOP.
    IF lv_n = 0.
      " The proposal gave none: list the backflush components of the reservation anyway.
      lv_n = backflush_resb( EXPORTING is_ord = is_ord it_tt = ct_tt CHANGING cs_result = cs_result ).
    ENDIF.
    IF lv_n > 0.
      lv_text = |The confirmation also posts { lv_n } goods movements automatically (backflush / automatic goods receipt): see changes GOODS_MOVEMENT|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
    ELSE.
      add_msg( EXPORTING iv_type = 'I' iv_text = 'No automatic goods movements are proposed for this confirmation'
               CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD backflush_resb.
    " Backflush components of the confirmed operation (RESB-RGEKZ), quantity in proportion to
    " the confirmed yield + scrap. Used when the goods movement proposal gives nothing.
    DATA: lt_resb TYPE STANDARD TABLE OF resb,
          ls_resb TYPE resb,
          ls_tt   TYPE bapi_pp_timeticket,
          lv_qty  TYPE afko-gamng,
          lv_need TYPE resb-bdmng,
          ls_chg  TYPE zif_mcp_biz_action=>ty_change.

    READ TABLE it_tt INTO ls_tt INDEX 1.
    IF sy-subrc <> 0 OR is_ord-rsnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_qty = ls_tt-yield + ls_tt-scrap.
    SELECT * FROM resb INTO TABLE lt_resb
      WHERE rsnum = is_ord-rsnum AND rgekz = 'X' AND xloek = space AND kzear = space.
    LOOP AT lt_resb INTO ls_resb.
      IF ls_resb-vornr IS NOT INITIAL AND ls_resb-vornr <> ls_tt-operation.
        CONTINUE.
      ENDIF.
      IF is_ord-gamng > 0.
        lv_need = ls_resb-bdmng * lv_qty / is_ord-gamng.
      ELSE.
        lv_need = ls_resb-bdmng.
      ENDIF.
      rv_n = rv_n + 1.
      CLEAR ls_chg.
      ls_chg-field     = |GOODS_MOVEMENT 261 { ls_resb-matnr ALPHA = OUT } (backflush, from the reservation)|.
      ls_chg-old_value = |plant { ls_resb-werks } storage location { ls_resb-lgort }|.
      ls_chg-new_value = |about { lv_need } { ls_resb-meins }|.
      CONDENSE ls_chg-new_value.
      APPEND ls_chg TO cs_result-changes.
    ENDLOOP.
  ENDMETHOD.


  METHOD prepare_gm.
    DATA: lt_stats TYPE ty_stats,
          lv_ok    TYPE abap_bool,
          lv_text  TYPE string,
          lv_aufnr TYPE string,
          ls_gm    TYPE bapi2017_gm_item_create,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_qty   TYPE afko-gamng,
          lv_qok   TYPE abap_bool,
          lv_open  TYPE afko-gamng,
          lv_date  TYPE sy-datum,
          lv_xchpf TYPE marc-xchpf,
          lv_matnr TYPE afpo-matnr,
          lv_plant TYPE aufk-werks,
          lv_resb  TYPE abap_bool,
          lv_rsnum TYPE resb-rsnum,
          lv_rspos TYPE resb-rspos,
          lv_lgort TYPE resb-lgort,
          lv_meins TYPE resb-meins,
          lv_bdmng TYPE resb-bdmng,
          lv_enmng TYPE resb-enmng,
          lv_rgekz TYPE resb-rgekz,
          lv_rvorn TYPE resb-vornr,
          lt_resb  TYPE STANDARD TABLE OF resb,
          ls_resb  TYPE resb.

    CLEAR: es_head, es_code, et_item.
    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_obj = 'C_AFKO_AWK' iv_actvt = '02'
                 IMPORTING es_ord = es_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    lv_aufnr = es_ord-aufnr.
    SHIFT lv_aufnr LEFT DELETING LEADING '0'.
    cs_result-pp_status = status_text( es_ord-objnr ).

    IF is_closed( lt_stats ) = abap_true.
      lv_text = |Order { lv_aufnr } is technically completed, closed or flagged for deletion (status: { cs_result-pp_status })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_false
       AND has_stat( it_stats = lt_stats iv_stat = c_pcnf ) = abap_false.
      lv_text = |Order { lv_aufnr } is not released: goods movements need a released order (status: { cs_result-pp_status })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    to_qty( EXPORTING iv_value = is_params-quantity IMPORTING ev_qty = lv_qty ev_ok = lv_qok ).
    IF lv_qok = abap_false OR lv_qty <= 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'quantity must be a positive number'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_date = to_date( is_params-posting_date ).
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    ls_gm-orderid   = es_ord-aufnr.
    ls_gm-entry_qnt = lv_qty.

    IF iv_action = 'PP.ORD.GOODS_RECEIPT'.
      " 101 for the finished product of the order (first item).
      IF es_ord-items > 1.
        add_msg( EXPORTING iv_type = 'W'
                           iv_text = 'The order has several items: the first item is received'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
      lv_open = es_ord-psmng - es_ord-wemng.
      IF lv_qty > lv_open.
        lv_text = |quantity exceeds the open quantity of the order ({ fmt_qty( lv_open ) })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_matnr = es_ord-matnr.
      lv_plant = es_ord-dwerk.
      IF lv_plant IS INITIAL.
        lv_plant = es_ord-werks.
      ENDIF.
      ls_gm-move_type = '101'.
      ls_gm-mvt_ind   = 'F'.
      ls_gm-entry_uom = es_ord-amein.
      IF is_params-lgort IS NOT INITIAL.
        ls_gm-stge_loc = to_upper( is_params-lgort ).
      ELSE.
        ls_gm-stge_loc = es_ord-lgort.
      ENDIF.
      es_code-gm_code = '02'.
      ls_chg-field     = 'GR_QUANTITY'.
      ls_chg-old_value = fmt_qty( es_ord-wemng ).
      lv_open          = es_ord-wemng + lv_qty.
      ls_chg-new_value = fmt_qty( lv_open ).
    ELSE.
      " 261 for a component: the order reservation is used when there is one.
      IF is_params-matnr IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr is required (the component to issue)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_matnr = to_matnr( is_params-matnr ).
      lv_plant = es_ord-werks.
      IF es_ord-rsnum IS NOT INITIAL.
        SELECT * FROM resb INTO TABLE lt_resb
          WHERE rsnum = es_ord-rsnum AND matnr = lv_matnr AND xloek = space.
      ENDIF.
      LOOP AT lt_resb INTO ls_resb.
        IF ls_resb-kzear = space.
          lv_resb  = abap_true.
          lv_rsnum = ls_resb-rsnum.
          lv_rspos = ls_resb-rspos.
          lv_lgort = ls_resb-lgort.
          lv_meins = ls_resb-meins.
          lv_bdmng = ls_resb-bdmng.
          lv_enmng = ls_resb-enmng.
          lv_rgekz = ls_resb-rgekz.
          lv_rvorn = ls_resb-vornr.
          EXIT.
        ENDIF.
      ENDLOOP.
      ls_gm-move_type = '261'.
      IF lv_resb = abap_true AND lv_rgekz = 'X'.
        lv_text = |Component { is_params-matnr } is backflushed: it is issued automatically when operation { lv_rvorn } is confirmed. Confirm the operation (PP.ORD.CONFIRM) instead of a manual goods issue|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_resb = abap_true.
        lv_open = lv_bdmng - lv_enmng.
        IF lv_qty > lv_open.
          lv_text = |quantity exceeds the open reservation quantity ({ fmt_qty( lv_open ) })|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        ls_gm-reserv_no = lv_rsnum.
        ls_gm-res_item  = lv_rspos.
        ls_gm-entry_uom = lv_meins.
      ELSEIF lt_resb IS NOT INITIAL.
        lv_text = |The reservation of material { is_params-matnr } in order { lv_aufnr } is already finally issued|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ELSE.
        lv_text = |Material { is_params-matnr } is not a component of order { lv_aufnr }: the issue would be unplanned|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
        SELECT SINGLE meins FROM mara INTO lv_meins WHERE matnr = lv_matnr.
        ls_gm-entry_uom = lv_meins.
      ENDIF.
      IF is_params-lgort IS NOT INITIAL.
        ls_gm-stge_loc = to_upper( is_params-lgort ).
      ELSE.
        ls_gm-stge_loc = lv_lgort.
      ENDIF.
      es_code-gm_code = '03'.
      ls_chg-field     = 'GI_QUANTITY'.
      ls_chg-old_value = fmt_qty( lv_enmng ).
      lv_open          = lv_enmng + lv_qty.
      ls_chg-new_value = fmt_qty( lv_open ).
    ENDIF.

    ls_gm-material = lv_matnr.
    ls_gm-plant    = lv_plant.
    IF ls_gm-stge_loc IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lgort is required: no storage location is known for this movement'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Batch: required for batch-managed materials, refused otherwise.
    SELECT SINGLE xchpf FROM marc INTO lv_xchpf
      WHERE matnr = lv_matnr AND werks = lv_plant.
    IF lv_xchpf IS NOT INITIAL.
      IF is_params-charg IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'charg is required: the material is batch-managed'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_gm-batch = to_upper( is_params-charg ).
    ELSEIF is_params-charg IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'charg is not allowed: the material is not batch-managed'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    APPEND ls_gm TO et_item.
    es_head-pstng_date = lv_date.
    es_head-doc_date   = lv_date.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD call_gm.
    DATA: lt_item TYPE ty_gm_items,
          lt_ret2 TYPE ty_ret2,
          ls_code TYPE bapi2017_gm_code,
          lv_test TYPE bapi2017_gm_gen-testrun.

    lt_item = it_item.
    ls_code = is_code.
    lv_test = iv_testrun.

    CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
      EXPORTING
        goodsmvt_header  = is_head
        goodsmvt_code    = ls_code
        testrun          = lv_test
      IMPORTING
        materialdocument = cs_result-mat_doc
        matdocumentyear  = cs_result-mat_doc_year
      TABLES
        goodsmvt_item    = lt_item
        return           = lt_ret2
      EXCEPTIONS
        error_message    = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = cs_result ).
    commit_or_rollback( EXPORTING iv_testrun = iv_testrun CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD to_aufnr.
    DATA lv_in TYPE c LENGTH 12.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 12 OR iv_value CN '0123456789 '.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = rv_aufnr.
  ENDMETHOD.


  METHOD to_vornr.
    DATA lv_in TYPE c LENGTH 4.

    IF iv_value IS NOT INITIAL AND strlen( iv_value ) <= 4 AND iv_value CO '0123456789'.
      lv_in = iv_value.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_in
        IMPORTING output = rv_vornr.
    ENDIF.
  ENDMETHOD.


  METHOD to_matnr.
    DATA lv_in TYPE c LENGTH 40.

    lv_in = to_upper( iv_value ).
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


  METHOD to_date.
    DATA lv_text TYPE string.

    lv_text = iv_value.
    REPLACE ALL OCCURRENCES OF '-' IN lv_text WITH ``.
    IF strlen( lv_text ) <> 8 OR lv_text CN '0123456789'.
      RETURN.
    ENDIF.
    rv_date = lv_text.
    CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'
      EXPORTING
        date                      = rv_date
      EXCEPTIONS
        plausibility_check_failed = 1
        OTHERS                    = 2.
    IF sy-subrc <> 0.
      CLEAR rv_date.
    ENDIF.
  ENDMETHOD.


  METHOD to_qty.
    DATA lv_text TYPE string.

    CLEAR: ev_qty, ev_ok.
    lv_text = iv_value.
    CONDENSE lv_text NO-GAPS.
    IF lv_text IS INITIAL.
      RETURN.
    ENDIF.
    TRY.
        ev_qty = lv_text.
        ev_ok  = abap_true.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_overflow.
        CLEAR ev_qty.
    ENDTRY.
  ENDMETHOD.


  METHOD fmt_qty.
    rv_text = iv_qty.
    CONDENSE rv_text.
  ENDMETHOD.


  METHOD fmt_date.
    IF iv_date IS NOT INITIAL.
      rv_text = |{ iv_date DATE = ISO }|.
    ENDIF.
  ENDMETHOD.


  METHOD add_msg.
    DATA ls_msg TYPE zif_mcp_biz_action=>ty_message.

    ls_msg-type    = iv_type.
    ls_msg-message = iv_text.
    APPEND ls_msg TO cs_result-messages.
  ENDMETHOD.


  METHOD add_sy_msg.
    DATA: ls_msg  TYPE zif_mcp_biz_action=>ty_message,
          lv_text TYPE string.

    MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
      WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_text.
    ls_msg-type    = 'E'.
    ls_msg-id      = sy-msgid.
    ls_msg-number  = sy-msgno.
    ls_msg-message = lv_text.
    APPEND ls_msg TO cs_result-messages.
  ENDMETHOD.


  METHOD add_ret2.
    DATA: ls_ret TYPE bapiret2,
          ls_msg TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT it_return INTO ls_ret.
      CLEAR ls_msg.
      ls_msg-type    = ls_ret-type.
      ls_msg-id      = ls_ret-id.
      ls_msg-number  = ls_ret-number.
      ls_msg-message = ls_ret-message.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_oret.
    DATA: ls_ret TYPE bapi_order_return,
          ls_msg TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT it_return INTO ls_ret.
      CLEAR ls_msg.
      ls_msg-type    = ls_ret-type.
      ls_msg-id      = ls_ret-id.
      ls_msg-number  = ls_ret-number.
      ls_msg-message = ls_ret-message.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_cret.
    DATA: ls_ret  TYPE bapi_coru_return,
          ls_msg  TYPE zif_mcp_biz_action=>ty_message,
          lv_id   TYPE sy-msgid,
          lv_no   TYPE sy-msgno,
          lv_text TYPE string.

    LOOP AT it_return INTO ls_ret.
      IF ls_ret-type IS INITIAL AND ls_ret-message IS INITIAL AND ls_ret-id IS INITIAL.
        CONTINUE.
      ENDIF.
      CLEAR ls_msg.
      ls_msg-type    = ls_ret-type.
      ls_msg-id      = ls_ret-id.
      ls_msg-number  = ls_ret-number.
      ls_msg-message = ls_ret-message.
      " Some detail rows carry only the message key: build the text from it.
      IF ls_msg-message IS INITIAL AND ls_ret-id IS NOT INITIAL.
        lv_id = ls_ret-id.
        lv_no = ls_ret-number.
        MESSAGE ID lv_id TYPE 'E' NUMBER lv_no
          WITH ls_ret-message_v1 ls_ret-message_v2 ls_ret-message_v3 ls_ret-message_v4
          INTO lv_text.
        ls_msg-message = lv_text.
      ENDIF.
      IF ls_ret-conf_no IS NOT INITIAL AND ls_ret-type CA 'EA'.
        lv_text = ls_msg-message.
        ls_msg-message = |Confirmation { ls_ret-conf_no }: { lv_text }|.
      ENDIF.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD finish.
    FIELD-SYMBOLS <ls_msg> TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT cs_result-messages ASSIGNING <ls_msg> WHERE type = 'E' OR type = 'A'.
      cs_result-failed = abap_true.
      EXIT.
    ENDLOOP.
  ENDMETHOD.


  METHOD commit_or_rollback.
    DATA: ls_ret  TYPE bapiret2,
          lv_text TYPE string.

    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_true OR cs_result-failed = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
        IMPORTING
          return = ls_ret.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait   = 'X'
        IMPORTING
          return = ls_ret.
      IF ls_ret-type CA 'EA'.
        lv_text = ls_ret-message.
        add_msg( EXPORTING iv_type = ls_ret-type iv_text = lv_text
                 CHANGING  cs_result = cs_result ).
        finish( CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD bom_read.
    TYPES: BEGIN OF ty_r,
             posnr TYPE stpox-posnr,
             postp TYPE stpox-postp,
             idnrk TYPE stpox-idnrk,
             ojtxp TYPE stpox-ojtxp,
             menge TYPE stpox-menge,
             meins TYPE stpox-meins,
           END OF ty_r.
    DATA: lv_matnr TYPE afpo-matnr,
          lv_werks TYPE marc-werks,
          lv_stlan TYPE mast-stlan,
          lv_date  TYPE sy-datum,
          lt_stb   TYPE STANDARD TABLE OF stpox,
          ls_stb   TYPE stpox,
          ls_r     TYPE ty_r,
          lv_row   TYPE i,
          lv_n     TYPE i,
          lv_text  TYPE string.

    IF is_params-matnr IS INITIAL OR is_params-werks IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr and werks are required (material, plant)'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_matnr = to_matnr( is_params-matnr ).
    lv_werks = to_upper( is_params-werks ).
    lv_stlan = is_params-stlan.
    IF lv_stlan IS INITIAL.
      lv_stlan = '1'.
    ENDIF.
    IF is_params-key_date IS INITIAL.
      lv_date = sy-datum.
    ELSE.
      lv_date = to_date( is_params-key_date ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'key_date must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
      EXPORTING
        capid                 = 'PP01'
        datuv                 = lv_date
        mehrs                 = space
        mtnrv                 = lv_matnr
        stlan                 = lv_stlan
        werks                 = lv_werks
      TABLES
        stb                   = lt_stb
      EXCEPTIONS
        alt_not_found         = 1
        call_invalid          = 2
        material_not_found    = 3
        missing_authorization = 4
        no_bom_found          = 5
        no_plant_data         = 6
        no_suitable_bom_found = 7
        conversion_error      = 8
        OTHERS                = 9.
    CASE sy-subrc.
      WHEN 0.
      WHEN 3 OR 6.
        lv_text = |Material { is_params-matnr } does not exist in plant { lv_werks }|.
      WHEN 4.
        lv_text = |No authorization to display the BOM of { is_params-matnr }|.
      WHEN 1 OR 5 OR 7.
        lv_text = |No BOM with usage { lv_stlan } valid on { lv_date DATE = ISO } for { is_params-matnr } in plant { lv_werks }|.
      WHEN OTHERS.
        lv_text = |BOM explosion failed (CS_BOM_EXPL_MAT_V2 exception { sy-subrc })|.
    ENDCASE.
    IF lv_text IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    LOOP AT lt_stb INTO ls_stb.
      MOVE-CORRESPONDING ls_stb TO ls_r.
      lv_row = lv_row + 1.
      add_rows( EXPORTING is_data = ls_r iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_n = lines( lt_stb ).
    rs_result-summary = |BOM of { is_params-matnr }, plant { lv_werks }, usage { lv_stlan }, valid on |
                     && |{ lv_date DATE = ISO }: { lv_n } items (single level)|.
  ENDMETHOD.

  METHOD add_rows.
    " One name / value pair per filled elementary column of a record (generic query result).
    DATA: lo_desc TYPE REF TO cl_abap_structdescr,
          ls_kv   TYPE zif_mcp_biz_action=>ty_kv.
    FIELD-SYMBOLS: <ls_c> TYPE abap_compdescr,
                   <lv_f> TYPE any.

    lo_desc ?= cl_abap_typedescr=>describe_by_data( is_data ).
    LOOP AT lo_desc->components ASSIGNING <ls_c>.
      ASSIGN COMPONENT <ls_c>-name OF STRUCTURE is_data TO <lv_f>.
      IF sy-subrc = 0 AND <lv_f> IS NOT INITIAL.
        ls_kv-row   = iv_row.
        ls_kv-name  = <ls_c>-name.
        ls_kv-value = <lv_f>.
        CONDENSE ls_kv-value.
        APPEND ls_kv TO ct_rows.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
