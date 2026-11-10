CLASS zcl_mcp_biz_co DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_CO - CO controlling business actions for ZMCP_BIZ_EXECUTE.
*
* Catalog: sc4sap configs/CO/actions.json. Action IDs must match it.
* Reads:  AUFK / JEST (internal orders), BAPI_INTERNALORDER_GETDETAIL (allowed business
*         transactions), CSKS / CSKT, COSP / COSS (cost center actual totals and primary plan values).
*         Whitelisted fields only: no person responsible.
* Writes: REPOST.COSTS, ACT.ALLOC and PLAN.PRIMARY have a CHECK function module: preview =
*         BAPI_ACC_MANUAL_ALLOC_CHECK / BAPI_ACC_ACTIVITY_ALLOC_CHECK /
*         BAPI_COSTACTPLN_CHECKPRIMCOST + rollback. ORD.SET_STATUS: preview =
*         STATUS_CHANGE_FOR_ACTIVITY with CHECK_ONLY. REPOST.REVERSE has no check mode:
*         preview = static checks of the CO document.
*         execute = BAPI + BAPI_TRANSACTION_COMMIT / _ROLLBACK, read back from the tables.
* Authorization: own AUTHORITY-CHECKs (K_ORDER, K_CSKS, K_CSKS_PLA, K_CCA) before any read
*         or write; a failed check refuses (fail closed). The BAPIs check again.
* Parameter "lines": one string per line, name=value pairs separated by ; values
*         percent-encoded for % ; = .
*         REPOST.COSTS: from_cc | from_order, to_cc | to_order, cost_element, amount, text
*         ACT.ALLOC:    from_cc, activity_type, to_cc | to_order, quantity, unit
*         PLAN.PRIMARY: cost_element, amount (per period, fixed)
* Cost center totals leave the class in the real currency amount (SAP stores two decimals for every currency).
* 7.31 syntax (no inline declarations, no constructor operators, no string
* templates in method call parameters) so one source serves ECC 7.31,
* ECC 7.40 and S/4HANA.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    CONSTANTS:
      c_max_lines TYPE i VALUE 100,
      c_crtd      TYPE jest-stat VALUE 'I0001',
      c_rel       TYPE jest-stat VALUE 'I0002',
      c_lkd       TYPE jest-stat VALUE 'I0043',
      c_teco      TYPE jest-stat VALUE 'I0045',
      c_clsd      TYPE jest-stat VALUE 'I0046',
      c_dlfl      TYPE jest-stat VALUE 'I0076',
      c_dlt       TYPE jest-stat VALUE 'I0013'.

    TYPES:
      ty_ret2  TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
      ty_stats TYPE STANDARD TABLE OF jest-stat WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_kv,
        name  TYPE string,
        value TYPE string,
      END OF ty_kv,
      ty_kvs TYPE STANDARD TABLE OF ty_kv WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_ord,
        aufnr TYPE aufk-aufnr,
        autyp TYPE aufk-autyp,
        auart TYPE aufk-auart,
        ktext TYPE aufk-ktext,
        kokrs TYPE aufk-kokrs,
        bukrs TYPE aufk-bukrs,
        waers TYPE aufk-waers,
        erdat TYPE aufk-erdat,
        objnr TYPE aufk-objnr,
      END OF ty_ord,
      ty_ords TYPE STANDARD TABLE OF ty_ord WITH DEFAULT KEY.

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

    METHODS ord_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS ord_list
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS cc_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS cc_actuals
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS plan_read
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS set_status
      IMPORTING is_params  TYPE zif_mcp_biz_action=>ty_params
                iv_execute TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS repost
      IMPORTING is_params  TYPE zif_mcp_biz_action=>ty_params
                iv_execute TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS act_alloc
      IMPORTING is_params  TYPE zif_mcp_biz_action=>ty_params
                iv_execute TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS plan_post
      IMPORTING is_params  TYPE zif_mcp_biz_action=>ty_params
                iv_execute TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS repost_reverse
      IMPORTING is_params  TYPE zif_mcp_biz_action=>ty_params
                iv_execute TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS check_order
      IMPORTING iv_aufnr  TYPE string
                iv_action TYPE c
      EXPORTING es_ord    TYPE ty_ord
                et_stats  TYPE ty_stats
                ev_ok     TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS load_order
      IMPORTING iv_aufnr TYPE aufk-aufnr
      EXPORTING es_ord   TYPE ty_ord
                ev_found TYPE abap_bool.

    METHODS auth_order
      IMPORTING iv_auart     TYPE aufk-auart
                iv_action    TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_csks
      IMPORTING iv_kokrs     TYPE csks-kokrs
                iv_kostl     TYPE csks-kostl
                iv_actvt     TYPE c
                iv_plan      TYPE abap_bool
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_cca
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS read_stats
      IMPORTING iv_objnr        TYPE aufk-objnr
      RETURNING VALUE(rt_stats) TYPE ty_stats.

    METHODS has_stat
      IMPORTING it_stats      TYPE ty_stats
                iv_stat       TYPE jest-stat
      RETURNING VALUE(rv_has) TYPE abap_bool.

    METHODS status_label
      IMPORTING it_stats       TYPE ty_stats
      RETURNING VALUE(rv_text) TYPE string.

    METHODS status_text
      IMPORTING iv_objnr       TYPE aufk-objnr
      RETURNING VALUE(rv_text) TYPE string.

    METHODS co_params
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING ev_kokrs  TYPE tka01-kokrs
                ev_date   TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS parse_pairs
      IMPORTING iv_line  TYPE string
      EXPORTING et_pairs TYPE ty_kvs
                ev_error TYPE string.

    METHODS pair
      IMPORTING it_pairs        TYPE ty_kvs
                iv_name         TYPE string
      RETURNING VALUE(rv_value) TYPE string.

    METHODS only_names
      IMPORTING it_pairs     TYPE ty_kvs
                iv_names     TYPE string
      EXPORTING ev_bad       TYPE string.

    METHODS ext_amount
      IMPORTING iv_waers  TYPE waers
      CHANGING  cv_amount TYPE any.

    METHODS alpha_out
      IMPORTING iv_value       TYPE clike
      RETURNING VALUE(rv_text) TYPE string.

    METHODS settle_rule
      IMPORTING iv_objnr  TYPE aufk-objnr
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS decode
      IMPORTING iv_in         TYPE string
      RETURNING VALUE(rv_out) TYPE string.

    METHODS to_aufnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_aufnr) TYPE aufk-aufnr.

    METHODS to_kostl
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_kostl) TYPE csks-kostl.

    METHODS to_kstar
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_kstar) TYPE cskb-kstar.

    METHODS to_date
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_date) TYPE sy-datum.

    METHODS to_amount
      IMPORTING iv_value  TYPE string
      EXPORTING ev_amount TYPE bapimaitm-value_tcur
                ev_ok     TYPE abap_bool.

    METHODS version_ok
      IMPORTING iv_kokrs     TYPE csks-kokrs
                iv_versn     TYPE cosp-versn
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS to_versn
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_versn) TYPE cosp-versn.

    METHODS to_period
      IMPORTING iv_value         TYPE string
      RETURNING VALUE(rv_period) TYPE i.

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

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS commit_or_rollback
      IMPORTING iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

ENDCLASS.



CLASS zcl_mcp_biz_co IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/CO/actions.json.
    ls_def-id = 'CO.ORD.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.ORD.LIST'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.ORD.SET_STATUS'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.CC.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.CC.GET_ACTUALS'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.PLAN.READ_PRIMARY'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.REPOST.COSTS'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.REPOST.REVERSE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.ACT.ALLOC'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'CO.PLAN.PRIMARY'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'CO.ORD.GET_DETAIL'.
        rs_result = ord_detail( is_params ).
      WHEN 'CO.ORD.LIST'.
        rs_result = ord_list( is_params ).
      WHEN 'CO.CC.GET_DETAIL'.
        rs_result = cc_detail( is_params ).
      WHEN 'CO.CC.GET_ACTUALS'.
        rs_result = cc_actuals( is_params ).
      WHEN 'CO.PLAN.READ_PRIMARY'.
        rs_result = plan_read( is_params ).
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
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'CO.ORD.SET_STATUS'.
        set_status( EXPORTING is_params = is_params iv_execute = iv_execute
                    CHANGING  cs_result = rs_result ).
      WHEN 'CO.REPOST.COSTS'.
        repost( EXPORTING is_params = is_params iv_execute = iv_execute
                CHANGING  cs_result = rs_result ).
      WHEN 'CO.REPOST.REVERSE'.
        repost_reverse( EXPORTING is_params = is_params iv_execute = iv_execute
                        CHANGING  cs_result = rs_result ).
      WHEN 'CO.ACT.ALLOC'.
        act_alloc( EXPORTING is_params = is_params iv_execute = iv_execute
                   CHANGING  cs_result = rs_result ).
      WHEN 'CO.PLAN.PRIMARY'.
        plan_post( EXPORTING is_params = is_params iv_execute = iv_execute
                   CHANGING  cs_result = rs_result ).
      WHEN OTHERS.
        lv_text = |{ iv_action } is not a write action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING  cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD ord_detail.
    DATA: ls_ord   TYPE ty_ord,
          lt_stats TYPE ty_stats,
          lv_ok    TYPE abap_bool,
          lv_num   TYPE bapi2075_2-order,
          ls_md    TYPE bapi2075_2,
          ls_ret   TYPE bapireturn,
          lt_sys   TYPE STANDARD TABLE OF bapi2075_3,
          lt_usr   TYPE STANDARD TABLE OF bapi2075_4,
          lt_allow TYPE STANDARD TABLE OF bapi2075_5,
          ls_allow TYPE bapi2075_5,
          lo_desc  TYPE REF TO cl_abap_structdescr,
          lv_text  TYPE string,
          lv_row   TYPE string,
          lv_n     TYPE i.
    FIELD-SYMBOLS: <lv_f> TYPE any,
                   <ls_c> TYPE abap_compdescr.

    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_action = '0003'
                 IMPORTING es_ord = ls_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = rs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    MOVE-CORRESPONDING ls_ord TO rs_result-co_order.
    rs_result-co_order-status = status_text( ls_ord-objnr ).

    lv_num = ls_ord-aufnr.
    CALL FUNCTION 'BAPI_INTERNALORDER_GETDETAIL'
      EXPORTING
        orderid           = lv_num
      IMPORTING
        master_data       = ls_md
        return            = ls_ret
      TABLES
        system_status     = lt_sys
        user_status       = lt_usr
        allowed_bus_tract = lt_allow
      EXCEPTIONS
        error_message     = 1
        OTHERS            = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
    ELSE.
      " Allowed business transactions: every elementary column of the row, joined (texts and keys).
      lo_desc ?= cl_abap_typedescr=>describe_by_data( ls_allow ).
      LOOP AT lt_allow INTO ls_allow.
        CLEAR lv_row.
        LOOP AT lo_desc->components ASSIGNING <ls_c>.
          ASSIGN COMPONENT <ls_c>-name OF STRUCTURE ls_allow TO <lv_f>.
          IF sy-subrc = 0 AND <lv_f> IS NOT INITIAL.
            lv_row = |{ lv_row } { <lv_f> }|.
          ENDIF.
        ENDLOOP.
        CONDENSE lv_row.
        APPEND lv_row TO rs_result-co_allowed.
      ENDLOOP.
    ENDIF.
    lv_n = lines( rs_result-co_allowed ).
    lv_text = |Order { alpha_out( ls_ord-aufnr ) } ({ ls_ord-auart }): { rs_result-co_order-status }, { lv_n } business transactions allowed|.
    rs_result-summary = lv_text.

    " Settlement rule (COBRB) and status warnings (step 5, 2026-11-10).
    settle_rule( EXPORTING iv_objnr = ls_ord-objnr CHANGING cs_result = rs_result ).
    IF has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_true.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The order is closed (CLSD): no postings and no settlement are possible'
               CHANGING cs_result = rs_result ).
    ELSEIF has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_true.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = 'The order is technically completed (TECO): no new planning or commitments; actual postings and settlement are still possible'
               CHANGING cs_result = rs_result ).
    ENDIF.
    IF rs_result-co_settle IS INITIAL.
      add_msg( EXPORTING iv_type = 'I' iv_text = 'The order has no settlement rule: settlement (KO88) needs one first'
               CHANGING cs_result = rs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD settle_rule.
    TYPES: BEGIN OF ty_br,
             konty      TYPE cobrb-konty,
             kostl      TYPE cobrb-kostl,
             aufnr      TYPE cobrb-aufnr,
             hkont      TYPE cobrb-hkont,
             prctr      TYPE cobrb-prctr,
             ps_psp_pnr TYPE cobrb-ps_psp_pnr,
             anln1      TYPE cobrb-anln1,
             matnr      TYPE cobrb-matnr,
             prozs      TYPE cobrb-prozs,
             perbz      TYPE cobrb-perbz,
             gabja      TYPE cobrb-gabja,
             gabpe      TYPE cobrb-gabpe,
             gbisj      TYPE cobrb-gbisj,
             gbisp      TYPE cobrb-gbisp,
           END OF ty_br.
    DATA: lt_br  TYPE STANDARD TABLE OF ty_br,
          ls_br  TYPE ty_br,
          ls_set TYPE zif_mcp_biz_action=>ty_co_settle,
          lv_key TYPE string.

    SELECT konty kostl aufnr hkont prctr ps_psp_pnr anln1 matnr prozs perbz gabja gabpe gbisj gbisp
      FROM cobrb INTO TABLE lt_br WHERE objnr = iv_objnr.
    LOOP AT lt_br INTO ls_br.
      CLEAR ls_set.
      MOVE-CORRESPONDING ls_br TO ls_set.
      IF ls_br-kostl IS NOT INITIAL.
        lv_key = alpha_out( ls_br-kostl ).
      ELSEIF ls_br-aufnr IS NOT INITIAL.
        lv_key = alpha_out( ls_br-aufnr ).
      ELSEIF ls_br-hkont IS NOT INITIAL.
        lv_key = alpha_out( ls_br-hkont ).
      ELSEIF ls_br-prctr IS NOT INITIAL.
        lv_key = alpha_out( ls_br-prctr ).
      ELSEIF ls_br-anln1 IS NOT INITIAL.
        lv_key = alpha_out( ls_br-anln1 ).
      ELSEIF ls_br-ps_psp_pnr IS NOT INITIAL.
        lv_key = ls_br-ps_psp_pnr.
      ELSE.
        lv_key = ls_br-matnr.
      ENDIF.
      ls_set-receiver = |{ ls_br-konty } { lv_key }|.
      APPEND ls_set TO cs_result-co_settle.
    ENDLOOP.
  ENDMETHOD.


  METHOD ord_list.
    DATA: lv_kokrs  TYPE aufk-kokrs,
          lv_status TYPE string,
          lv_max    TYPE i,
          lr_auart  TYPE RANGE OF aufk-auart,
          ls_auart  LIKE LINE OF lr_auart,
          lr_bukrs  TYPE RANGE OF aufk-bukrs,
          ls_bukrs  LIKE LINE OF lr_bukrs,
          lt_ords   TYPE ty_ords,
          lt_js     TYPE ty_jss,
          lt_stats  TYPE ty_stats,
          ls_js     TYPE ty_js,
          lv_keep   TYPE abap_bool,
          ls_out    TYPE zif_mcp_biz_action=>ty_co_order,
          lv_text   TYPE string,
          lv_hidden TYPE i,
          lv_n      TYPE i.
    FIELD-SYMBOLS <ls_ord> TYPE ty_ord.

    lv_kokrs  = to_upper( is_params-kokrs ).
    lv_status = is_params-status.
    IF lv_kokrs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs is required (controlling area)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_status <> 'created' AND lv_status <> 'released' AND lv_status <> 'teco'
       AND lv_status <> 'closed' AND lv_status <> 'locked' AND lv_status <> 'all_open'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'status is required: created, released, teco, closed, locked or all_open'
               CHANGING cs_result = rs_result ).
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
    IF is_params-order_type IS NOT INITIAL.
      ls_auart-sign = 'I'. ls_auart-option = 'EQ'. ls_auart-low = to_upper( is_params-order_type ).
      APPEND ls_auart TO lr_auart.
    ENDIF.
    IF is_params-bukrs IS NOT INITIAL.
      ls_bukrs-sign = 'I'. ls_bukrs-option = 'EQ'. ls_bukrs-low = to_upper( is_params-bukrs ).
      APPEND ls_bukrs TO lr_bukrs.
    ENDIF.

    SELECT aufnr autyp auart ktext kokrs bukrs waers erdat objnr
      FROM aufk INTO CORRESPONDING FIELDS OF TABLE lt_ords UP TO 5000 ROWS
      WHERE ( autyp = '01' OR autyp = '30' ) AND kokrs = lv_kokrs AND bukrs IN lr_bukrs AND auart IN lr_auart
        AND loekz = space
      ORDER BY aufnr.
    IF lt_ords IS NOT INITIAL.
      SELECT objnr stat FROM jest INTO TABLE lt_js
        FOR ALL ENTRIES IN lt_ords
        WHERE objnr = lt_ords-objnr AND inact = space.
      SORT lt_js BY objnr stat.
    ENDIF.

    LOOP AT lt_ords ASSIGNING <ls_ord>.
      CLEAR lt_stats.
      LOOP AT lt_js INTO ls_js WHERE objnr = <ls_ord>-objnr.
        APPEND ls_js-stat TO lt_stats.
      ENDLOOP.
      lv_keep = abap_false.
      CASE lv_status.
        WHEN 'created'.
          IF has_stat( it_stats = lt_stats iv_stat = c_crtd ) = abap_true
             AND has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_false
             AND has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_false
             AND has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_false.
            lv_keep = abap_true.
          ENDIF.
        WHEN 'released'.
          IF has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_true
             AND has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_false
             AND has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_false.
            lv_keep = abap_true.
          ENDIF.
        WHEN 'teco'.
          IF has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_true
             AND has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_false.
            lv_keep = abap_true.
          ENDIF.
        WHEN 'closed'.
          lv_keep = has_stat( it_stats = lt_stats iv_stat = c_clsd ).
        WHEN 'locked'.
          lv_keep = has_stat( it_stats = lt_stats iv_stat = c_lkd ).
        WHEN 'all_open'.
          IF has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_false
             AND has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_false
             AND has_stat( it_stats = lt_stats iv_stat = c_dlfl ) = abap_false.
            lv_keep = abap_true.
          ENDIF.
      ENDCASE.
      IF lv_keep = abap_false.
        CONTINUE.
      ENDIF.
      IF auth_order( iv_auart = <ls_ord>-auart iv_action = '0003' ) = abap_false.
        lv_hidden = lv_hidden + 1.
        CONTINUE.
      ENDIF.
      IF lv_n >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      CLEAR ls_out.
      MOVE-CORRESPONDING <ls_ord> TO ls_out.
      ls_out-status = status_label( lt_stats ).
      APPEND ls_out TO rs_result-co_orders.
      lv_n = lv_n + 1.
    ENDLOOP.
    rs_result-hidden_no_auth = lv_hidden.
    lv_text = |{ lv_n } orders with status { lv_status } in controlling area { lv_kokrs }|.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_max } shown)|.
    ENDIF.
    IF lv_hidden > 0.
      lv_text = |{ lv_text }, { lv_hidden } not shown (no authorization)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD cc_detail.
    DATA: lv_kokrs TYPE csks-kokrs,
          lv_kostl TYPE csks-kostl,
          lv_date  TYPE sy-datum,
          ls_cc    TYPE zif_mcp_biz_action=>ty_co_cc,
          ls_csks  TYPE csks,
          lv_lock  TYPE string,
          lv_text  TYPE string.

    lv_kokrs = to_upper( is_params-kokrs ).
    lv_kostl = to_kostl( is_params-kostl ).
    IF lv_kokrs IS INITIAL OR lv_kostl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs and kostl are required (controlling area, cost center)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-key_date IS INITIAL.
      lv_date = sy-datum.
    ELSE.
      lv_date = to_date( is_params-key_date ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'key_date must be a valid date (YYYY-MM-DD)'
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF auth_csks( iv_kokrs = lv_kokrs iv_kostl = lv_kostl iv_actvt = '03' iv_plan = abap_false ) = abap_false.
      lv_text = |No authorization to display cost center { lv_kostl } of controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM csks INTO ls_csks
      WHERE kokrs = lv_kokrs AND kostl = lv_kostl AND datab <= lv_date AND datbi >= lv_date.
    IF sy-subrc <> 0.
      lv_text = |Cost center { lv_kostl } not found in controlling area { lv_kokrs } at { fmt_date( lv_date ) }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    MOVE-CORRESPONDING ls_csks TO ls_cc.
    SELECT SINGLE ktext FROM cskt INTO ls_cc-ktext
      WHERE spras = sy-langu AND kokrs = lv_kokrs AND kostl = lv_kostl AND datbi = ls_csks-datbi.
    rs_result-co_cc = ls_cc.
    lv_text = |Cost center { lv_kostl }, valid { fmt_date( ls_cc-datab ) } to { fmt_date( ls_cc-datbi ) }|.
    IF ls_cc-prctr IS NOT INITIAL.
      lv_text = |{ lv_text }, profit center { alpha_out( ls_cc-prctr ) }|.
    ENDIF.
    CLEAR lv_lock.
    IF ls_cc-bkzkp IS NOT INITIAL. lv_lock = |{ lv_lock }, actual primary costs|. ENDIF.
    IF ls_cc-bkzks IS NOT INITIAL. lv_lock = |{ lv_lock }, actual secondary costs|. ENDIF.
    IF ls_cc-bkzer IS NOT INITIAL. lv_lock = |{ lv_lock }, actual revenues|. ENDIF.
    IF ls_cc-bkzob IS NOT INITIAL. lv_lock = |{ lv_lock }, commitments|. ENDIF.
    IF ls_cc-pkzkp IS NOT INITIAL. lv_lock = |{ lv_lock }, plan primary costs|. ENDIF.
    IF ls_cc-pkzks IS NOT INITIAL. lv_lock = |{ lv_lock }, plan secondary costs|. ENDIF.
    IF ls_cc-pkzer IS NOT INITIAL. lv_lock = |{ lv_lock }, plan revenues|. ENDIF.
    IF lv_lock IS NOT INITIAL.
      SHIFT lv_lock LEFT BY 2 PLACES.
      lv_text = |{ lv_text }; locked for: { lv_lock }|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD cc_actuals.
    DATA: lv_kokrs  TYPE csks-kokrs,
          lv_kostl  TYPE csks-kostl,
          lv_objnr  TYPE csks-objnr,
          lv_gjahr  TYPE cosp-gjahr,
          lv_from   TYPE i,
          lv_to     TYPE i,
          lv_ver    TYPE cosp-versn,
          lt_tot    TYPE zif_mcp_biz_sys=>ty_co_tots,
          ls_tot    TYPE zif_mcp_biz_sys=>ty_co_tot,
          ls_row    TYPE zif_mcp_biz_action=>ty_co_amount,
          lv_text   TYPE string,
          lv_cur    TYPE tka01-waers.

    lv_kokrs = to_upper( is_params-kokrs ).
    lv_kostl = to_kostl( is_params-kostl ).
    lv_from  = to_period( is_params-from_period ).
    lv_to    = to_period( is_params-to_period ).
    IF lv_kokrs IS INITIAL OR lv_kostl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs and kostl are required (controlling area, cost center)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-fiscal_year IS INITIAL OR strlen( is_params-fiscal_year ) <> 4 OR is_params-fiscal_year CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'fiscal_year is required (4 digits)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_from < 1 OR lv_to < 1 OR lv_from > 16 OR lv_to > 16 OR lv_from > lv_to.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'from_period and to_period are required: periods 1 to 16, from not after to'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_gjahr = is_params-fiscal_year.
    lv_ver = '000'.
    IF is_params-version IS NOT INITIAL.
      lv_ver = to_versn( is_params-version ).
      IF version_ok( iv_kokrs = lv_kokrs iv_versn = lv_ver ) = abap_false.
        lv_text = |Plan version { is_params-version } does not exist in controlling area { lv_kokrs }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF auth_csks( iv_kokrs = lv_kokrs iv_kostl = lv_kostl iv_actvt = '03' iv_plan = abap_false ) = abap_false.
      lv_text = |No authorization to display cost center { lv_kostl } of controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT objnr FROM csks INTO lv_objnr UP TO 1 ROWS
      WHERE kokrs = lv_kokrs AND kostl = lv_kostl ORDER BY datbi DESCENDING.
    ENDSELECT.
    IF sy-subrc <> 0.
      lv_text = |Cost center { lv_kostl } not found in controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    " Actual (value type 04, version 000) and plan (value type 01 of the requested version) per cost
    " element: ECC COSP / COSS, S/4 ACDOCA for the actual (ZIF_MCP_BIZ_SYS).
    zcl_mcp_biz_sys=>get( )->co_totals( EXPORTING iv_kokrs = lv_kokrs iv_objnr = lv_objnr iv_gjahr = lv_gjahr
                                                  iv_from  = lv_from  iv_to    = lv_to    iv_versn = lv_ver
                                        IMPORTING et_tot   = lt_tot ).
    SELECT SINGLE waers FROM tka01 INTO lv_cur WHERE kokrs = lv_kokrs.
    SORT lt_tot BY kstar.
    LOOP AT lt_tot INTO ls_tot.
      ext_amount( EXPORTING iv_waers = lv_cur CHANGING cv_amount = ls_tot-plan ).
      ext_amount( EXPORTING iv_waers = lv_cur CHANGING cv_amount = ls_tot-act ).
      CLEAR ls_row.
      ls_row-kostl  = lv_kostl.
      ls_row-kstar  = ls_tot-kstar.
      ls_row-period = '0'.
      ls_row-plan   = ls_tot-plan.
      ls_row-actual = ls_tot-act.
      CONDENSE: ls_row-plan, ls_row-actual.
      APPEND ls_row TO rs_result-co_amounts.
    ENDLOOP.
    lv_text = |Cost center { lv_kostl }, { lv_gjahr } periods { lv_from } to { lv_to }: { lines( lt_tot ) } cost elements, plan version { lv_ver }|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD plan_read.
    TYPES: BEGIN OF ty_pv,
             kstar TYPE cosp-kstar,
             per   TYPE i,
             val   TYPE p LENGTH 15 DECIMALS 2,
           END OF ty_pv.
    DATA: lv_kokrs TYPE csks-kokrs,
          lv_kostl TYPE csks-kostl,
          lv_objnr TYPE csks-objnr,
          lv_gjahr TYPE cosp-gjahr,
          lv_ver   TYPE cosp-versn,
          lt_p     TYPE STANDARD TABLE OF cosp,
          lt_pv    TYPE STANDARD TABLE OF ty_pv,
          ls_pv    TYPE ty_pv,
          lv_per   TYPE i,
          lv_name  TYPE string,
          lv_v     TYPE p LENGTH 15 DECIMALS 2,
          lv_cur   TYPE tka01-waers,
          ls_row   TYPE zif_mcp_biz_action=>ty_co_amount,
          lv_text  TYPE string.
    FIELD-SYMBOLS: <ls_p> TYPE cosp,
                   <lv_w> TYPE any,
                   <ls_v> TYPE ty_pv.

    lv_kokrs = to_upper( is_params-kokrs ).
    lv_kostl = to_kostl( is_params-kostl ).
    IF lv_kokrs IS INITIAL OR lv_kostl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs and kostl are required (controlling area, cost center)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-fiscal_year IS INITIAL OR strlen( is_params-fiscal_year ) <> 4 OR is_params-fiscal_year CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'fiscal_year is required (4 digits)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-version IS INITIAL OR strlen( is_params-version ) > 3.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'version is required (plan version, up to 3 characters)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_csks( iv_kokrs = lv_kokrs iv_kostl = lv_kostl iv_actvt = '03' iv_plan = abap_true ) = abap_false.
      lv_text = |No authorization to display plan data of cost center { lv_kostl }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT objnr FROM csks INTO lv_objnr UP TO 1 ROWS
      WHERE kokrs = lv_kokrs AND kostl = lv_kostl ORDER BY datbi DESCENDING.
    ENDSELECT.
    IF sy-subrc <> 0.
      lv_text = |Cost center { lv_kostl } not found in controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_gjahr = is_params-fiscal_year.
    lv_ver   = to_versn( is_params-version ).
    IF version_ok( iv_kokrs = lv_kokrs iv_versn = lv_ver ) = abap_false.
      lv_text = |Plan version { is_params-version } does not exist in controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    " Primary plan values = value type 01 of the plan version (the read BAPI returns nothing for period plans).
    SELECT * FROM cosp INTO TABLE lt_p
      WHERE lednr = '00' AND objnr = lv_objnr AND gjahr = lv_gjahr AND wrttp = '01' AND versn = lv_ver.
    LOOP AT lt_p ASSIGNING <ls_p>.
      lv_per = 1.
      WHILE lv_per <= 16.
        lv_name = |WKG{ lv_per WIDTH = 3 ALIGN = RIGHT PAD = '0' }|.
        ASSIGN COMPONENT lv_name OF STRUCTURE <ls_p> TO <lv_w>.
        IF sy-subrc = 0.
          lv_v = <lv_w>.
          IF lv_v <> 0.
            READ TABLE lt_pv ASSIGNING <ls_v> WITH KEY kstar = <ls_p>-kstar per = lv_per.
            IF sy-subrc = 0.
              <ls_v>-val = <ls_v>-val + lv_v.
            ELSE.
              CLEAR ls_pv.
              ls_pv-kstar = <ls_p>-kstar.
              ls_pv-per   = lv_per.
              ls_pv-val   = lv_v.
              APPEND ls_pv TO lt_pv.
            ENDIF.
          ENDIF.
        ENDIF.
        lv_per = lv_per + 1.
      ENDWHILE.
    ENDLOOP.

    SELECT SINGLE waers FROM tka01 INTO lv_cur WHERE kokrs = lv_kokrs.
    SORT lt_pv BY kstar per.
    LOOP AT lt_pv INTO ls_pv.
      ext_amount( EXPORTING iv_waers = lv_cur CHANGING cv_amount = ls_pv-val ).
      CLEAR ls_row.
      ls_row-kostl  = lv_kostl.
      ls_row-kstar  = ls_pv-kstar.
      ls_row-period = |{ ls_pv-per }|.
      ls_row-plan   = ls_pv-val.
      CONDENSE ls_row-plan.
      APPEND ls_row TO rs_result-co_amounts.
    ENDLOOP.
    lv_text = |{ lines( rs_result-co_amounts ) } plan values of cost center { lv_kostl }, version { is_params-version }, { is_params-fiscal_year }|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD set_status.
    DATA: ls_ord    TYPE ty_ord,
          lt_stats  TYPE ty_stats,
          lv_ok     TYPE abap_bool,
          lv_target TYPE string,
          lv_vrgng  TYPE tj01-vrgng,
          lv_act    TYPE c LENGTH 4,
          lv_objnr  TYPE jsto-objnr,
          lv_text   TYPE string,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_check  TYPE xfeld,
          lv_old    TYPE string,
          lt_after  TYPE ty_stats,
          lv_wait   TYPE i.

    lv_target = is_params-target.
    " TJ01 business transactions of internal orders.
    CASE lv_target.
      WHEN 'release'.
        lv_vrgng = 'FREI'. lv_act = '0011'.
      WHEN 'teco'.
        lv_vrgng = 'BTAB'. lv_act = '0013'.
      WHEN 'close'.
        lv_vrgng = 'BABS'. lv_act = '0014'.
      WHEN 'lock'.
        lv_vrgng = 'BLOC'. lv_act = '0015'.
      WHEN 'unlock'.
        lv_vrgng = 'BUNL'. lv_act = '0016'.
      WHEN 'revoke_close'.
        lv_vrgng = 'BUAB'. lv_act = '0014'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = 'target is required: release, teco, close, lock, unlock or revoke_close'
                 CHANGING cs_result = cs_result ).
        RETURN.
    ENDCASE.

    check_order( EXPORTING iv_aufnr = is_params-aufnr iv_action = lv_act
                 IMPORTING es_ord = ls_ord et_stats = lt_stats ev_ok = lv_ok
                 CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    lv_old = status_text( ls_ord-objnr ).
    " Business transaction by order category: internal orders (AUTYP 01) release with BFRE,
    " other categories (maintenance orders, AUTYP 30) with FREI. TECO / close / lock / unlock /
    " revoke close use the same transaction for both (BTAB, BABS, BLOC, BUNL, BUAB).
    IF lv_target = 'release' AND ls_ord-autyp = '01'.
      lv_vrgng = 'BFRE'.
    ENDIF.
    IF has_stat( it_stats = lt_stats iv_stat = c_dlfl ) = abap_true OR has_stat( it_stats = lt_stats iv_stat = c_dlt ) = abap_true.
      lv_text = |Order { alpha_out( ls_ord-aufnr ) } is flagged for deletion (status: { lv_old })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Checks the CHECK_ONLY run does not make (it also accepts "lock" on a locked order).
    lv_text = space.
    CASE lv_target.
      WHEN 'release'.
        IF has_stat( it_stats = lt_stats iv_stat = c_rel ) = abap_true.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is already released (status: { lv_old })|.
        ELSEIF has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_true OR has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_true.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is technically completed or closed (status: { lv_old })|.
        ENDIF.
      WHEN 'teco'.
        IF has_stat( it_stats = lt_stats iv_stat = c_teco ) = abap_true.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is already technically completed (status: { lv_old })|.
        ELSEIF has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_true.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is already closed (status: { lv_old })|.
        ENDIF.
      WHEN 'close'.
        IF has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_true.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is already closed (status: { lv_old })|.
        ENDIF.
      WHEN 'lock'.
        IF has_stat( it_stats = lt_stats iv_stat = c_lkd ) = abap_true.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is already locked (status: { lv_old })|.
        ENDIF.
      WHEN 'unlock'.
        IF has_stat( it_stats = lt_stats iv_stat = c_lkd ) = abap_false.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is not locked (status: { lv_old })|.
        ENDIF.
      WHEN 'revoke_close'.
        IF has_stat( it_stats = lt_stats iv_stat = c_clsd ) = abap_false.
          lv_text = |Order { alpha_out( ls_ord-aufnr ) } is not closed (status: { lv_old })|.
        ENDIF.
    ENDCASE.
    IF lv_text IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    lv_objnr = ls_ord-objnr.
    IF iv_execute = abap_false.
      lv_check = 'X'.
    ENDIF.
    CALL FUNCTION 'STATUS_CHANGE_FOR_ACTIVITY'
      EXPORTING
        check_only           = lv_check
        objnr                = lv_objnr
        vrgng                = lv_vrgng
      EXCEPTIONS
        activity_not_allowed = 1
        object_not_found     = 2
        status_inconsistent  = 3
        status_not_allowed   = 4
        wrong_input          = 5
        warning_occured      = 6
        error_message        = 7
        OTHERS               = 8.
    IF sy-subrc <> 0.
      lv_text = |Order { alpha_out( ls_ord-aufnr ) } (status: { lv_old }): the status change { lv_target } is not allowed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      IF sy-msgid IS NOT INITIAL.
        add_sy_msg( CHANGING cs_result = cs_result ).
      ENDIF.
      IF iv_execute = abap_true.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      ENDIF.
      RETURN.
    ENDIF.

    ls_chg-field     = 'SYSTEM_STATUS'.
    ls_chg-old_value = lv_old.
    IF iv_execute = abap_false.
      ls_chg-new_value = lv_target.
      APPEND ls_chg TO cs_result-changes.
      IF lv_target = 'teco' OR lv_target = 'release'.
        add_msg( EXPORTING iv_type = 'W'
                           iv_text = 'This status change cannot be undone with this action'
                 CHANGING cs_result = cs_result ).
        cs_result-irreversible = abap_true.
      ENDIF.
      lv_text = |Order { alpha_out( ls_ord-aufnr ) }: { lv_target } is allowed (status now: { lv_old })|.
      cs_result-summary = lv_text.
      RETURN.
    ENDIF.

    commit_or_rollback( EXPORTING iv_testrun = abap_false CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    " The status is written by the update task: wait until JEST shows it (up to 10 s).
    DO 10 TIMES.
      lt_after = read_stats( ls_ord-objnr ).
      IF lt_after <> lt_stats.
        EXIT.
      ENDIF.
      lv_wait = lv_wait + 1.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    cs_result-co_status_new = status_text( ls_ord-objnr ).
    IF lt_after = lt_stats.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'The status change was accepted but nothing changed in the order: its status profile (user status) may require another step first'
               CHANGING cs_result = cs_result ).
      finish( CHANGING cs_result = cs_result ).
    ENDIF.
    lv_text = |Order { alpha_out( ls_ord-aufnr ) }: status { lv_old } -> { cs_result-co_status_new }|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD repost.
    DATA: lv_kokrs  TYPE tka01-kokrs,
          lv_date   TYPE sy-datum,
          ls_head   TYPE bapidochdru12p,
          lt_items  TYPE STANDARD TABLE OF bapimaitm,
          ls_item   TYPE bapimaitm,
          lt_cust   TYPE STANDARD TABLE OF bapiextc,
          lt_ret    TYPE ty_ret2,
          lv_doc    TYPE bapidochdru12p-doc_no,
          lv_line   TYPE string,
          lt_pairs  TYPE ty_kvs,
          lv_err    TYPE string,
          lv_bad    TYPE string,
          lv_n      TYPE i,
          lv_amt    TYPE bapimaitm-value_tcur,
          lv_ok     TYPE abap_bool,
          lv_text   TYPE string,
          lv_x      TYPE string,
          lv_item   TYPE bapimaitm-itemno_acc.

    co_params( EXPORTING is_params = is_params
               IMPORTING ev_kokrs = lv_kokrs ev_date = lv_date
               CHANGING  cs_result = cs_result ).
    IF cs_result-failed = abap_true OR lv_kokrs IS INITIAL.
      RETURN.
    ENDIF.
    IF lines( is_params-lines ) < 1 OR lines( is_params-lines ) > c_max_lines.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lines needs 1 to 100 lines (from_cc | from_order, to_cc | to_order, cost_element, amount)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_cca( ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No authorization for actual postings in cost accounting (K_CCA)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    ls_head-co_area    = lv_kokrs.
    ls_head-docdate    = lv_date.
    ls_head-postgdate  = lv_date.
    ls_head-doc_hdr_tx = is_params-header_text.
    ls_head-username   = sy-uname.
    SELECT SINGLE waers FROM tka01 INTO ls_head-trans_curr WHERE kokrs = lv_kokrs.
    lv_n = 0.
    LOOP AT is_params-lines INTO lv_line.
      lv_n = lv_n + 1.
      parse_pairs( EXPORTING iv_line = lv_line IMPORTING et_pairs = lt_pairs ev_error = lv_err ).
      IF lv_err IS INITIAL.
        only_names( EXPORTING it_pairs = lt_pairs iv_names = '|from_cc|from_order|to_cc|to_order|cost_element|amount|text|'
                    IMPORTING ev_bad = lv_bad ).
        IF lv_bad IS NOT INITIAL.
          lv_err = |unknown line field "{ lv_bad }"|.
        ENDIF.
      ENDIF.
      IF lv_err IS NOT INITIAL.
        lv_text = |Line { lv_n }: { lv_err }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      CLEAR ls_item.
      lv_item = lv_n.
      ls_item-send_cctr = to_kostl( pair( it_pairs = lt_pairs iv_name = 'from_cc' ) ).
      ls_item-sen_order = to_aufnr( pair( it_pairs = lt_pairs iv_name = 'from_order' ) ).
      ls_item-rec_cctr  = to_kostl( pair( it_pairs = lt_pairs iv_name = 'to_cc' ) ).
      ls_item-rec_order = to_aufnr( pair( it_pairs = lt_pairs iv_name = 'to_order' ) ).
      ls_item-cost_elem = to_kstar( pair( it_pairs = lt_pairs iv_name = 'cost_element' ) ).
      ls_item-seg_text  = pair( it_pairs = lt_pairs iv_name = 'text' ).
      lv_x = pair( it_pairs = lt_pairs iv_name = 'amount' ).
      to_amount( EXPORTING iv_value = lv_x IMPORTING ev_amount = lv_amt ev_ok = lv_ok ).
      IF lv_ok = abap_false OR lv_amt <= 0.
        lv_text = |Line { lv_n }: amount must be a positive number|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_item-value_tcur = lv_amt.
      IF ls_item-cost_elem IS INITIAL.
        lv_text = |Line { lv_n }: cost_element is required|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ( ls_item-send_cctr IS INITIAL AND ls_item-sen_order IS INITIAL )
         OR ( ls_item-rec_cctr IS INITIAL AND ls_item-rec_order IS INITIAL ).
        lv_text = |Line { lv_n }: a sender (from_cc or from_order) and a receiver (to_cc or to_order) are required|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ls_item-send_cctr IS NOT INITIAL AND ls_item-send_cctr = ls_item-rec_cctr AND ls_item-sen_order IS INITIAL
         AND ls_item-rec_order IS INITIAL.
        lv_text = |Line { lv_n }: sender and receiver cost center are the same|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ls_item-send_cctr IS NOT INITIAL AND auth_csks( iv_kokrs = lv_kokrs iv_kostl = ls_item-send_cctr iv_actvt = '02' iv_plan = abap_false ) = abap_false.
        lv_text = |Line { lv_n }: no authorization for sender cost center { ls_item-send_cctr }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_item-itemno_acc = lv_item.
      APPEND ls_item TO lt_items.
    ENDLOOP.
    cs_result-summary = 'Manual cost repost'.

    IF iv_execute = abap_false.
      CALL FUNCTION 'BAPI_ACC_MANUAL_ALLOC_CHECK'
        EXPORTING
          doc_header      = ls_head
        TABLES
          doc_items       = lt_items
          return          = lt_ret
          customer_fields = lt_cust
        EXCEPTIONS
          error_message   = 1
          OTHERS          = 2.
    ELSE.
      CALL FUNCTION 'BAPI_ACC_MANUAL_ALLOC_POST'
        EXPORTING
          doc_header      = ls_head
        IMPORTING
          doc_no          = lv_doc
        TABLES
          doc_items       = lt_items
          return          = lt_ret
          customer_fields = lt_cust
        EXCEPTIONS
          error_message   = 1
          OTHERS          = 2.
    ENDIF.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF iv_execute = abap_true AND cs_result-failed = abap_false.
      cs_result-co_doc_no = lv_doc.
      lv_text = |CO document { lv_doc } posted in controlling area { lv_kokrs }|.
      cs_result-summary = lv_text.
      add_msg( EXPORTING iv_type = 'S' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
    lv_ok = abap_true.
    IF iv_execute = abap_true.
      lv_ok = abap_false.
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = lv_ok CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD act_alloc.
    DATA: lv_kokrs TYPE tka01-kokrs,
          lv_date  TYPE sy-datum,
          ls_head  TYPE bapidochdrp,
          lt_items TYPE STANDARD TABLE OF bapiaaitm,
          ls_item  TYPE bapiaaitm,
          lt_crit  TYPE STANDARD TABLE OF bapiackecr,
          lt_cust  TYPE STANDARD TABLE OF bapiextc,
          lt_ret   TYPE ty_ret2,
          lv_doc   TYPE bapidochdrp-doc_no,
          lv_line  TYPE string,
          lt_pairs TYPE ty_kvs,
          lv_err   TYPE string,
          lv_bad   TYPE string,
          lv_n     TYPE i,
          lv_qty   TYPE bapimaitm-value_tcur,
          lv_ok    TYPE abap_bool,
          lv_text  TYPE string,
          lv_x     TYPE string,
          lv_unit  TYPE csla-leinh,
          lv_item  TYPE bapiaaitm-itemno_acc,
          lv_lstar TYPE csla-lstar,
          lv_test  TYPE abap_bool.

    co_params( EXPORTING is_params = is_params
               IMPORTING ev_kokrs = lv_kokrs ev_date = lv_date
               CHANGING  cs_result = cs_result ).
    IF cs_result-failed = abap_true OR lv_kokrs IS INITIAL.
      RETURN.
    ENDIF.
    IF lines( is_params-lines ) < 1 OR lines( is_params-lines ) > c_max_lines.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lines needs 1 to 100 lines (from_cc, activity_type, to_cc | to_order, quantity)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_cca( ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No authorization for actual postings in cost accounting (K_CCA)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    ls_head-co_area    = lv_kokrs.
    ls_head-docdate    = lv_date.
    ls_head-postgdate  = lv_date.
    ls_head-doc_hdr_tx = is_params-header_text.
    ls_head-username   = sy-uname.
    lv_n = 0.
    LOOP AT is_params-lines INTO lv_line.
      lv_n = lv_n + 1.
      parse_pairs( EXPORTING iv_line = lv_line IMPORTING et_pairs = lt_pairs ev_error = lv_err ).
      IF lv_err IS INITIAL.
        only_names( EXPORTING it_pairs = lt_pairs iv_names = '|from_cc|activity_type|to_cc|to_order|quantity|unit|text|'
                    IMPORTING ev_bad = lv_bad ).
        IF lv_bad IS NOT INITIAL.
          lv_err = |unknown line field "{ lv_bad }"|.
        ENDIF.
      ENDIF.
      IF lv_err IS NOT INITIAL.
        lv_text = |Line { lv_n }: { lv_err }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      CLEAR ls_item.
      lv_item = lv_n.
      ls_item-itemno_acc = lv_item.
      ls_item-send_cctr  = to_kostl( pair( it_pairs = lt_pairs iv_name = 'from_cc' ) ).
      ls_item-acttype    = to_upper( pair( it_pairs = lt_pairs iv_name = 'activity_type' ) ).
      ls_item-rec_cctr   = to_kostl( pair( it_pairs = lt_pairs iv_name = 'to_cc' ) ).
      ls_item-rec_order  = to_aufnr( pair( it_pairs = lt_pairs iv_name = 'to_order' ) ).
      ls_item-seg_text   = pair( it_pairs = lt_pairs iv_name = 'text' ).
      lv_x = pair( it_pairs = lt_pairs iv_name = 'quantity' ).
      to_amount( EXPORTING iv_value = lv_x IMPORTING ev_amount = lv_qty ev_ok = lv_ok ).
      IF lv_ok = abap_false OR lv_qty <= 0.
        lv_text = |Line { lv_n }: quantity must be a positive number|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_item-actvty_qty = lv_qty.
      IF ls_item-send_cctr IS INITIAL OR ls_item-acttype IS INITIAL
         OR ( ls_item-rec_cctr IS INITIAL AND ls_item-rec_order IS INITIAL ).
        lv_text = |Line { lv_n }: from_cc, activity_type and a receiver (to_cc or to_order) are required|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF auth_csks( iv_kokrs = lv_kokrs iv_kostl = ls_item-send_cctr iv_actvt = '02' iv_plan = abap_false ) = abap_false.
        lv_text = |Line { lv_n }: no authorization for sender cost center { ls_item-send_cctr }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_x = pair( it_pairs = lt_pairs iv_name = 'unit' ).
      IF lv_x IS NOT INITIAL.
        ls_item-activityun = to_upper( lv_x ).
      ELSE.
        lv_lstar = ls_item-acttype.
        SELECT leinh FROM csla INTO lv_unit UP TO 1 ROWS
          WHERE kokrs = lv_kokrs AND lstar = lv_lstar AND datab <= lv_date AND datbi >= lv_date.
        ENDSELECT.
        IF sy-subrc <> 0.
          lv_text = |Line { lv_n }: activity type { ls_item-acttype } is not valid in controlling area { lv_kokrs } on { fmt_date( lv_date ) }|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        ls_item-activityun = lv_unit.
      ENDIF.
      APPEND ls_item TO lt_items.
    ENDLOOP.
    cs_result-summary = 'Activity allocation'.

    IF iv_execute = abap_false.
      lv_test = abap_true.
      CALL FUNCTION 'BAPI_ACC_ACTIVITY_ALLOC_CHECK'
        EXPORTING
          doc_header      = ls_head
        TABLES
          doc_items       = lt_items
          return          = lt_ret
          criteria        = lt_crit
          customer_fields = lt_cust
        EXCEPTIONS
          error_message   = 1
          OTHERS          = 2.
    ELSE.
      CALL FUNCTION 'BAPI_ACC_ACTIVITY_ALLOC_POST'
        EXPORTING
          doc_header      = ls_head
        IMPORTING
          doc_no          = lv_doc
        TABLES
          doc_items       = lt_items
          return          = lt_ret
          criteria        = lt_crit
          customer_fields = lt_cust
        EXCEPTIONS
          error_message   = 1
          OTHERS          = 2.
    ENDIF.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF iv_execute = abap_true AND cs_result-failed = abap_false.
      cs_result-co_doc_no = lv_doc.
      lv_text = |CO document { lv_doc } posted in controlling area { lv_kokrs }|.
      cs_result-summary = lv_text.
      add_msg( EXPORTING iv_type = 'S' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = lv_test CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD plan_post.
    DATA: lv_kokrs TYPE tka01-kokrs,
          lv_kostl TYPE csks-kostl,
          lv_from  TYPE i,
          lv_to    TYPE i,
          ls_head  TYPE bapiplnhdr,
          lt_idx   TYPE STANDARD TABLE OF bapiacpstru,
          ls_idx   TYPE bapiacpstru,
          lt_obj   TYPE STANDARD TABLE OF bapipcpobj,
          ls_obj   TYPE bapipcpobj,
          lt_val   TYPE STANDARD TABLE OF bapipcpval,
          ls_val   TYPE bapipcpval,
          lt_tot   TYPE STANDARD TABLE OF bapipcptot,
          lt_ctl   TYPE STANDARD TABLE OF bapipcpctrl,
          lt_ret   TYPE ty_ret2,
          lv_line  TYPE string,
          lt_pairs TYPE ty_kvs,
          lv_err   TYPE string,
          lv_bad   TYPE string,
          lv_n     TYPE i,
          lv_amt   TYPE bapimaitm-value_tcur,
          lv_ok    TYPE abap_bool,
          lv_text  TYPE string,
          lv_x     TYPE string,
          lv_slot  TYPE i,
          lv_name  TYPE string,
          lv_test  TYPE abap_bool,
          lv_cur   TYPE tka01-waers.
    FIELD-SYMBOLS <lv_f> TYPE any.

    lv_kokrs = to_upper( is_params-kokrs ).
    lv_kostl = to_kostl( is_params-kostl ).
    lv_from  = to_period( is_params-from_period ).
    lv_to    = to_period( is_params-to_period ).
    IF lv_kokrs IS INITIAL OR lv_kostl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs and kostl are required (controlling area, cost center)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-fiscal_year IS INITIAL OR strlen( is_params-fiscal_year ) <> 4 OR is_params-fiscal_year CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'fiscal_year is required (4 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-version IS INITIAL OR strlen( is_params-version ) > 3.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'version is required (plan version, up to 3 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lv_from < 1 OR lv_to < 1 OR lv_from > 16 OR lv_to > 16 OR lv_from > lv_to.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'from_period and to_period are required: periods 1 to 16, from not after to'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lines( is_params-lines ) < 1 OR lines( is_params-lines ) > c_max_lines.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lines needs 1 to 100 lines (cost_element, amount)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_csks( iv_kokrs = lv_kokrs iv_kostl = lv_kostl iv_actvt = '01' iv_plan = abap_true ) = abap_false.
      lv_text = |No authorization to plan cost center { lv_kostl } of controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE waers FROM tka01 INTO lv_cur WHERE kokrs = lv_kokrs.
    IF sy-subrc <> 0.
      lv_text = |Controlling area { lv_kokrs } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    ls_head-co_area     = lv_kokrs.
    ls_head-fisc_year   = is_params-fiscal_year.
    ls_head-period_from = lv_from.
    ls_head-period_to   = lv_to.
    ls_head-version     = is_params-version.
    ls_head-plan_currtype = 'C'.
    ls_head-doc_hdr_tx  = is_params-header_text.
    ls_obj-object_index = 1.
    ls_obj-costcenter   = lv_kostl.
    APPEND ls_obj TO lt_obj.

    lv_n = 0.
    LOOP AT is_params-lines INTO lv_line.
      lv_n = lv_n + 1.
      parse_pairs( EXPORTING iv_line = lv_line IMPORTING et_pairs = lt_pairs ev_error = lv_err ).
      IF lv_err IS INITIAL.
        only_names( EXPORTING it_pairs = lt_pairs iv_names = '|cost_element|amount|'
                    IMPORTING ev_bad = lv_bad ).
        IF lv_bad IS NOT INITIAL.
          lv_err = |unknown line field "{ lv_bad }"|.
        ENDIF.
      ENDIF.
      IF lv_err IS NOT INITIAL.
        lv_text = |Line { lv_n }: { lv_err }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_x = pair( it_pairs = lt_pairs iv_name = 'amount' ).
      to_amount( EXPORTING iv_value = lv_x IMPORTING ev_amount = lv_amt ev_ok = lv_ok ).
      IF lv_ok = abap_false OR lv_amt < 0.
        lv_text = |Line { lv_n }: amount must be zero or a positive number (per period)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      CLEAR ls_val.
      ls_val-value_index = lv_n.
      ls_val-cost_elem   = to_kstar( pair( it_pairs = lt_pairs iv_name = 'cost_element' ) ).
      IF ls_val-cost_elem IS INITIAL.
        lv_text = |Line { lv_n }: cost_element is required|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_val-trans_curr = lv_cur.
      " PERnn = the nn-th period counted from the first period of the header.
      lv_slot = 1.
      WHILE lv_slot <= lv_to - lv_from + 1.
        lv_name = |FIX_VAL_PER{ lv_slot WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
        ASSIGN COMPONENT lv_name OF STRUCTURE ls_val TO <lv_f>.
        IF sy-subrc = 0.
          <lv_f> = lv_amt.
        ENDIF.
        lv_slot = lv_slot + 1.
      ENDWHILE.
      APPEND ls_val TO lt_val.
      CLEAR ls_idx.
      ls_idx-object_index = 1.
      ls_idx-value_index  = lv_n.
      APPEND ls_idx TO lt_idx.
    ENDLOOP.
    cs_result-summary = 'Primary cost planning'.
    add_msg( EXPORTING iv_type = 'I'
                       iv_text = 'The planned values replace the existing plan values of these cost elements and periods'
             CHANGING cs_result = cs_result ).

    IF iv_execute = abap_false.
      lv_test = abap_true.
      CALL FUNCTION 'BAPI_COSTACTPLN_CHECKPRIMCOST'
        EXPORTING
          headerinfo     = ls_head
        TABLES
          indexstructure = lt_idx
          coobject       = lt_obj
          pervalue       = lt_val
          totvalue       = lt_tot
          contrl         = lt_ctl
          return         = lt_ret
        EXCEPTIONS
          error_message  = 1
          OTHERS         = 2.
    ELSE.
      CALL FUNCTION 'BAPI_COSTACTPLN_POSTPRIMCOST'
        EXPORTING
          headerinfo     = ls_head
        TABLES
          indexstructure = lt_idx
          coobject       = lt_obj
          pervalue       = lt_val
          totvalue       = lt_tot
          contrl         = lt_ctl
          return         = lt_ret
        EXCEPTIONS
          error_message  = 1
          OTHERS         = 2.
    ENDIF.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    commit_or_rollback( EXPORTING iv_testrun = lv_test CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD repost_reverse.
    DATA: lv_kokrs TYPE tka01-kokrs,
          lv_belnr TYPE cobk-belnr,
          lv_date  TYPE sy-datum,
          ls_cobk  TYPE cobk,
          ls_head  TYPE bapidochdrr,
          lt_doc   TYPE STANDARD TABLE OF bapidochdrr,
          lt_ret   TYPE ty_ret2,
          lv_text  TYPE string,
          lv_test  TYPE abap_bool,
          lv_in    TYPE c LENGTH 10.

    lv_kokrs = to_upper( is_params-kokrs ).
    IF lv_kokrs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs is required (controlling area)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-belnr IS INITIAL OR strlen( is_params-belnr ) > 10 OR is_params-belnr CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'belnr is required (CO document number, up to 10 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_in = is_params-belnr.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = lv_belnr.
    lv_date = to_date( is_params-posting_date ).
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_cca( ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No authorization for actual postings in cost accounting (K_CCA)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM cobk INTO ls_cobk WHERE kokrs = lv_kokrs AND belnr = lv_belnr.
    IF sy-subrc <> 0.
      lv_text = |CO document { alpha_out( lv_belnr ) } not found in controlling area { lv_kokrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_cobk-vrgng <> 'RKU1' AND ls_cobk-vrgng <> 'RKL' AND ls_cobk-vrgng <> 'KAMV'.
      lv_text = |CO document { alpha_out( lv_belnr ) } is not a manual repost or an activity allocation (business transaction { ls_cobk-vrgng })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_cobk-stflg IS NOT INITIAL.
      lv_text = |CO document { alpha_out( lv_belnr ) } is itself a reversal document|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_cobk-stokz IS NOT INITIAL.
      lv_text = |CO document { alpha_out( lv_belnr ) } is already reversed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_text = |Reversal of CO document { alpha_out( lv_belnr ) } of controlling area { lv_kokrs }|.
    cs_result-summary = lv_text.
    cs_result-irreversible = abap_true.
    IF iv_execute = abap_false.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'No test mode: this preview is the static check of the CO document'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    lv_test = abap_false.
    " The document to reverse goes into RVRS_NO (DOC_NO is the output table of the new documents).
    ls_head-co_area    = lv_kokrs.
    ls_head-rvrs_no    = lv_belnr.
    ls_head-docdate    = lv_date.
    ls_head-postgdate  = lv_date.
    ls_head-doc_hdr_tx = is_params-header_text.
    ls_head-username   = sy-uname.
    CALL FUNCTION 'BAPI_ACC_ACT_POSTINGS_REVERSE'
      EXPORTING
        doc_header     = ls_head
      TABLES
        doc_no         = lt_doc
        return         = lt_ret
      EXCEPTIONS
        error_message  = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_false.
      READ TABLE lt_doc INTO ls_head INDEX 1.
      IF sy-subrc = 0.
        cs_result-co_doc_no = ls_head-doc_no.
      ENDIF.
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = lv_test CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD check_order.
    DATA: lv_aufnr TYPE aufk-aufnr,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    CLEAR: es_ord, et_stats, ev_ok.
    lv_aufnr = to_aufnr( iv_aufnr ).
    IF lv_aufnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'aufnr is required (internal order number, digits, up to 12)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_order( EXPORTING iv_aufnr = lv_aufnr IMPORTING es_ord = es_ord ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Order { alpha_out( lv_aufnr ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    " Order categories: 01 = CO internal order, 30 = maintenance order (settled like one).
    IF es_ord-autyp <> '01' AND es_ord-autyp <> '30'.
      lv_text = |Order { alpha_out( lv_aufnr ) } is not a CO internal order (order category { es_ord-autyp }): use the module of that order|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_order( iv_auart = es_ord-auart iv_action = iv_action ) = abap_false.
      lv_text = |No authorization for order { alpha_out( lv_aufnr ) } (order type { es_ord-auart })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    et_stats = read_stats( es_ord-objnr ).
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD load_order.
    CLEAR: es_ord, ev_found.
    SELECT SINGLE aufnr autyp auart ktext kokrs bukrs waers erdat objnr
      FROM aufk INTO CORRESPONDING FIELDS OF es_ord
      WHERE aufnr = iv_aufnr.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_order.
    AUTHORITY-CHECK OBJECT 'K_ORDER'
      ID 'RESPAREA'  DUMMY
      ID 'AUFART'    FIELD iv_auart
      ID 'AUTHPHASE' DUMMY
      ID 'CO_ACTION' FIELD iv_action
      ID 'KSTAR'     DUMMY.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_csks.
    IF iv_plan = abap_true.
      AUTHORITY-CHECK OBJECT 'K_CSKS_PLA'
        ID 'KOKRS' FIELD iv_kokrs
        ID 'KOSTL' FIELD iv_kostl
        ID 'ACTVT' FIELD iv_actvt.
    ELSE.
      AUTHORITY-CHECK OBJECT 'K_CSKS'
        ID 'KOKRS' FIELD iv_kokrs
        ID 'KOSTL' FIELD iv_kostl
        ID 'ACTVT' FIELD iv_actvt.
    ENDIF.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_cca.
    " CO_ACTION 2076 = enter documents.
    AUTHORITY-CHECK OBJECT 'K_CCA'
      ID 'RESPAREA'  DUMMY
      ID 'CO_ACTION' FIELD '2076'
      ID 'KSTAR'     DUMMY.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD read_stats.
    SELECT stat FROM jest INTO TABLE rt_stats
      WHERE objnr = iv_objnr AND inact = space.
    SORT rt_stats.
  ENDMETHOD.


  METHOD has_stat.
    READ TABLE it_stats TRANSPORTING NO FIELDS WITH KEY table_line = iv_stat.
    IF sy-subrc = 0.
      rv_has = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD status_label.
    IF has_stat( it_stats = it_stats iv_stat = c_clsd ) = abap_true.
      rv_text = 'CLSD'.
    ELSEIF has_stat( it_stats = it_stats iv_stat = c_teco ) = abap_true.
      rv_text = 'TECO'.
    ELSEIF has_stat( it_stats = it_stats iv_stat = c_rel ) = abap_true.
      rv_text = 'REL'.
    ELSEIF has_stat( it_stats = it_stats iv_stat = c_crtd ) = abap_true.
      rv_text = 'CRTD'.
    ENDIF.
    IF has_stat( it_stats = it_stats iv_stat = c_lkd ) = abap_true.
      rv_text = |{ rv_text } LKD|.
    ENDIF.
    IF has_stat( it_stats = it_stats iv_stat = c_dlfl ) = abap_true.
      rv_text = |{ rv_text } DLFL|.
    ENDIF.
    CONDENSE rv_text.
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


  METHOD co_params.
    DATA: lv_text TYPE string,
          lv_k    TYPE tka01-kokrs.

    CLEAR: ev_kokrs, ev_date.
    IF is_params-kokrs IS INITIAL OR strlen( is_params-kokrs ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kokrs is required (controlling area, 4 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_k = to_upper( is_params-kokrs ).
    SELECT SINGLE kokrs FROM tka01 INTO lv_k WHERE kokrs = lv_k.
    IF sy-subrc <> 0.
      lv_text = |Controlling area { is_params-kokrs } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_date = to_date( is_params-posting_date ).
    IF ev_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_kokrs = lv_k.
  ENDMETHOD.


  METHOD parse_pairs.
    DATA: lt_parts TYPE string_table,
          lv_part  TYPE string,
          lv_off   TYPE i,
          lv_pos   TYPE i,
          ls_kv    TYPE ty_kv.

    CLEAR: et_pairs, ev_error.
    SPLIT iv_line AT ';' INTO TABLE lt_parts.
    LOOP AT lt_parts INTO lv_part.
      IF lv_part IS INITIAL.
        CONTINUE.
      ENDIF.
      lv_off = find( val = lv_part sub = '=' ).
      IF lv_off < 1.
        ev_error = |"{ lv_part }" is not name=value|.
        RETURN.
      ENDIF.
      CLEAR ls_kv.
      ls_kv-name = to_lower( substring( val = lv_part len = lv_off ) ).
      lv_pos = lv_off + 1.
      ls_kv-value = decode( substring( val = lv_part off = lv_pos ) ).
      APPEND ls_kv TO et_pairs.
    ENDLOOP.
  ENDMETHOD.


  METHOD pair.
    DATA ls_kv TYPE ty_kv.

    READ TABLE it_pairs INTO ls_kv WITH KEY name = iv_name.
    IF sy-subrc = 0.
      rv_value = ls_kv-value.
    ENDIF.
  ENDMETHOD.


  METHOD only_names.
    DATA: ls_kv TYPE ty_kv,
          lv_n  TYPE string.

    CLEAR ev_bad.
    LOOP AT it_pairs INTO ls_kv.
      lv_n = |\|{ ls_kv-name }\||.
      IF iv_names NS lv_n.
        ev_bad = ls_kv-name.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD ext_amount.
    DATA: lv_dec TYPE tcurx-currdec,
          lv_p   TYPE p LENGTH 15 DECIMALS 2.

    SELECT SINGLE currdec FROM tcurx INTO lv_dec WHERE currkey = iv_waers.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    " Internal format: two decimals for every currency (currencies without decimals are stored / 100).
    lv_p = cv_amount.
    IF lv_dec = 0.
      lv_p = lv_p * 100.
    ELSEIF lv_dec = 3.
      lv_p = lv_p / 10.
    ENDIF.
    cv_amount = lv_p.
  ENDMETHOD.


  METHOD alpha_out.
    rv_text = |{ iv_value ALPHA = OUT }|.
    CONDENSE rv_text.
  ENDMETHOD.


  METHOD decode.
    DATA: lv_len TYPE i,
          lv_i   TYPE i,
          lv_c   TYPE string,
          lv_t   TYPE string.

    lv_len = strlen( iv_in ).
    WHILE lv_i < lv_len.
      lv_c = substring( val = iv_in off = lv_i len = 1 ).
      lv_i = lv_i + 1.
      IF lv_c = '%' AND lv_i + 2 <= lv_len.
        lv_t = to_upper( substring( val = iv_in off = lv_i len = 2 ) ).
        CASE lv_t.
          WHEN '25'.
            lv_c = '%'.
            lv_i = lv_i + 2.
          WHEN '3B'.
            lv_c = ';'.
            lv_i = lv_i + 2.
          WHEN '3D'.
            lv_c = '='.
            lv_i = lv_i + 2.
        ENDCASE.
      ENDIF.
      rv_out = rv_out && lv_c.
    ENDWHILE.
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


  METHOD to_kostl.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10.
      RETURN.
    ENDIF.
    lv_in = to_upper( iv_value ).
    IF lv_in CO '0123456789 '.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_in
        IMPORTING output = rv_kostl.
    ELSE.
      rv_kostl = lv_in.
    ENDIF.
  ENDMETHOD.


  METHOD to_kstar.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10.
      RETURN.
    ENDIF.
    lv_in = to_upper( iv_value ).
    IF lv_in CO '0123456789 '.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_in
        IMPORTING output = rv_kstar.
    ELSE.
      rv_kstar = lv_in.
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


  METHOD to_amount.
    DATA lv_text TYPE string.

    CLEAR: ev_amount, ev_ok.
    lv_text = iv_value.
    CONDENSE lv_text NO-GAPS.
    IF lv_text IS INITIAL OR lv_text CN '0123456789.-+'.
      RETURN.
    ENDIF.
    TRY.
        ev_amount = lv_text.
        ev_ok     = abap_true.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_overflow.
        CLEAR ev_amount.
    ENDTRY.
  ENDMETHOD.


  METHOD version_ok.
    " CO version settings of the controlling area (TKA09); an unknown version is refused.
    DATA lv_versn TYPE cosp-versn.

    SELECT SINGLE versn FROM tka09 INTO lv_versn
      WHERE kokrs = iv_kokrs AND versn = iv_versn.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD to_versn.
    " Numeric versions are padded (0 -> 000); other values stay as given.
    DATA lv_n TYPE n LENGTH 3.

    IF iv_value CO '0123456789' AND strlen( iv_value ) <= 3.
      lv_n = iv_value.
      rv_versn = lv_n.
    ELSE.
      rv_versn = to_upper( iv_value ).
    ENDIF.
  ENDMETHOD.


  METHOD to_period.
    IF iv_value IS NOT INITIAL AND strlen( iv_value ) <= 3 AND iv_value CO '0123456789'.
      rv_period = iv_value.
    ENDIF.
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

ENDCLASS.
