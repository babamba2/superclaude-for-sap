CLASS zcl_mcp_biz_mm DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_MM - MM business actions of ZMCP_BIZ_EXECUTE in one class (all MM areas:
* purchasing, goods movements, and the customer include fields of a purchase order).
* Merged 2026-11-10 from ZCL_MCP_BIZ_MM_PUR + ZCL_MCP_BIZ_PO_CBO (old classes kept).
* Methods of PO_CBO that clashed carry the prefix cbo_; PO_CBO methods stay static.
* Catalog: sc4sap configs/MM/actions.json. Action IDs must match it.
* 7.31 syntax (no inline declarations, no constructor operators) so one source serves
* ECC 7.31, ECC 7.40 and S/4HANA.
*
* ---- purchasing (was ZCL_MCP_BIZ_MM_PUR)
* ZCL_MCP_BIZ_MM_PUR - MM purchasing business actions for ZMCP_BIZ_EXECUTE.
* Catalog: sc4sap configs/MM/actions.json. Action IDs must match it.
* Authorization is left to the standard BAPIs (never NO_AUTHORITY);
* the SELECT-based list checks M_BEST_EKG itself.
* Writes: preview = BAPI with TESTRUN + rollback (release: GETRELINFO only),
*         execute = BAPI + BAPI_TRANSACTION_COMMIT / _ROLLBACK.
* Release differences are
* handled at runtime (FUPARAREF for NO_COMMIT).
*
* ---- PO customer include fields (was ZCL_MCP_BIZ_PO_CBO)
* ZCL_MCP_BIZ_PO_CBO - customer include fields (CI_EKKODB / CI_EKPODB) of
* a purchase order for the ZMCP_BIZ PO change actions.
* collect: lists the fields with their current values (PREVIEW shows them
*          so the user can say whether any must change with the action).
* apply:   turns the "cbo" parameter into EXTENSIONIN rows.
* STRUCTURE in EXTENSIONIN must stay BAPI_TE_MEPOHEADER / BAPI_TE_MEPOITEM
* (FG 2012 move_extensionin drops other names). The value part uses the
* standard layout when the CI include is character-like. Otherwise the
* system needs a character-only copy of BAPI_TE_* that its
* ME_BAPI_PO_CUST~MAP2I_EXTENSIONIN implementation reads; its name is set
* per system in TVARVC ZMCP_BIZ_TE_MEPOHEADER / ZMCP_BIZ_TE_MEPOITEM.
* No customer object names in this source.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    " ---- from ZCL_MCP_BIZ_MM_PUR
    TYPES:
      ty_itemsx   TYPE STANDARD TABLE OF bapimepoitemx WITH DEFAULT KEY,
      ty_schedsx  TYPE STANDARD TABLE OF bapimeposchedulx WITH DEFAULT KEY,
      ty_ret2     TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
      ty_retn     TYPE STANDARD TABLE OF bapireturn WITH DEFAULT KEY,
      ty_ebelps   TYPE STANDARD TABLE OF ekpo-ebelp WITH DEFAULT KEY,
      ty_gm_items TYPE STANDARD TABLE OF bapi2017_gm_item_create WITH DEFAULT KEY,
      ty_parex    TYPE STANDARD TABLE OF bapiparex WITH DEFAULT KEY.

    METHODS list_open
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " ---- step 5 query actions (2026-11-10): result in rows (name / value pairs)
    METHODS vendor_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS mm_period
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS stock_get
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS iv_blocked
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS to_matnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_matnr) TYPE mara-matnr.

    METHODS add_rows
      IMPORTING is_data TYPE any
                iv_row  TYPE i
      CHANGING  ct_rows TYPE zif_mcp_biz_action=>ty_kvs.

    METHODS get_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_history       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS load_po
      IMPORTING iv_ebeln  TYPE ekko-ebeln
                iv_history TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_po_change
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING ev_ebeln  TYPE ekko-ebeln
                et_item   TYPE zif_mcp_biz_action=>ty_po_items
                et_itemx  TYPE ty_itemsx
                et_sched  TYPE zif_mcp_biz_action=>ty_po_schedules
                et_schedx TYPE ty_schedsx
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_flag
      IMPORTING iv_field  TYPE string
                iv_value  TYPE c
                it_sel    TYPE ty_ebelps
                iv_all_if_empty TYPE abap_bool
      EXPORTING et_item   TYPE zif_mcp_biz_action=>ty_po_items
                et_itemx  TYPE ty_itemsx
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_po_change
      IMPORTING iv_ebeln   TYPE ekko-ebeln
                iv_testrun TYPE abap_bool
                it_item    TYPE zif_mcp_biz_action=>ty_po_items
                it_itemx   TYPE ty_itemsx
                it_sched   TYPE zif_mcp_biz_action=>ty_po_schedules
                it_schedx  TYPE ty_schedsx
                it_ext     TYPE ty_parex OPTIONAL
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_release
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING ev_ebeln  TYPE ekko-ebeln
                ev_code   TYPE bapimmpara-po_rel_cod
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_release
      IMPORTING iv_fm     TYPE string
                iv_ebeln  TYPE ekko-ebeln
                iv_code   TYPE bapimmpara-po_rel_cod
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_gr
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_head   TYPE bapi2017_gm_head_01
                et_item   TYPE ty_gm_items
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_gr
      IMPORTING is_head    TYPE bapi2017_gm_head_01
                it_item    TYPE ty_gm_items
                iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS selected_items
      IMPORTING is_params     TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rt_sel) TYPE ty_ebelps.

    METHODS find_item
      IMPORTING iv_ebelp TYPE ekpo-ebelp
                is_result TYPE zif_mcp_biz_action=>ty_result
      EXPORTING es_item  TYPE bapimepoitem
                ev_found TYPE abap_bool.

    METHODS no_commit_supported
      IMPORTING iv_fm        TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS to_ebeln
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_ebeln) TYPE ekko-ebeln.

    METHODS to_ebelp
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_ebelp) TYPE ekpo-ebelp.

    METHODS to_date
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_date) TYPE sy-datum.

    METHODS to_qty
      IMPORTING iv_value TYPE string
      EXPORTING ev_qty   TYPE ekpo-menge
                ev_ok    TYPE abap_bool.

    METHODS is_true
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_true) TYPE abap_bool.

    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_sy_msg
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_ret2
      IMPORTING it_return TYPE ty_ret2
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_retn
      IMPORTING it_return TYPE ty_retn
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    " Successful answer without own message (ME 887 goes to suppressed): one I line first.
    METHODS ok_msg
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    " Foreign lock on the purchase order (EMEKKOE): E with the locking user.
    METHODS check_lock
      IMPORTING iv_ebeln     TYPE ekko-ebeln
      CHANGING  cs_result    TYPE zif_mcp_biz_action=>ty_result
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS commit_or_rollback
      IMPORTING iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    " ---- from ZCL_MCP_BIZ_PO_CBO (static)

    CLASS-METHODS collect
      IMPORTING iv_ebeln  TYPE ekko-ebeln
                it_sel    TYPE ty_ebelps
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    CLASS-METHODS apply
      IMPORTING iv_ebeln  TYPE ekko-ebeln
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING et_ext    TYPE ty_parex
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " After EXECUTE: re-read the PO and warn about requested values that
    " were not saved (fields recalculated by customer logic on save).
    CLASS-METHODS verify
      IMPORTING iv_ebeln  TYPE ekko-ebeln
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    CLASS-METHODS cbo_layout
      IMPORTING iv_level    TYPE c
      EXPORTING ev_te       TYPE string
                ev_layout   TYPE string
                ev_ci       TYPE string
                ev_settable TYPE abap_bool
                ev_note     TYPE string.

    CLASS-METHODS ddic_fields
      IMPORTING iv_name          TYPE csequence
      RETURNING VALUE(rt_fields) TYPE ddfields.

    CLASS-METHODS char_like
      IMPORTING it_fields    TYPE ddfields
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS cbo_text
      IMPORTING iv_value       TYPE any
                iv_inttype     TYPE c
      RETURNING VALUE(rv_text) TYPE string.

    CLASS-METHODS domain_values
      IMPORTING iv_domname       TYPE domname
      RETURNING VALUE(rv_values) TYPE string.

    CLASS-METHODS cbo_to_date
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_date) TYPE sy-datum.

    CLASS-METHODS cbo_to_ebelp
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_ebelp) TYPE ekpo-ebelp.

    CLASS-METHODS cbo_add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.



CLASS zcl_mcp_biz_mm IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/MM/actions.json.
    ls_def-id = 'MM.PO.LIST_OPEN'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.GET_HISTORY'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.SET_DELIVERY_COMPLETE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.UNSET_DELIVERY_COMPLETE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.SET_FINAL_INVOICE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.CHANGE_DELIVERY_DATE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.CHANGE_QUANTITY'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.RELEASE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.RESET_RELEASE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PO.DELETE_ITEM'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.GR.POST'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.VENDOR.GET_STATUS'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.PERIOD.GET'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.STOCK.GET'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'MM.IV.LIST_BLOCKED'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    CASE iv_action.
      WHEN 'MM.PO.LIST_OPEN'.
        rs_result = list_open( is_params ).
      WHEN 'MM.PO.GET_DETAIL'.
        rs_result = get_detail( is_params = is_params iv_history = abap_false ).
      WHEN 'MM.PO.GET_HISTORY'.
        rs_result = get_detail( is_params = is_params iv_history = abap_true ).
      WHEN 'MM.VENDOR.GET_STATUS'.
        rs_result = vendor_status( is_params ).
      WHEN 'MM.PERIOD.GET'.
        rs_result = mm_period( is_params ).
      WHEN 'MM.STOCK.GET'.
        rs_result = stock_get( is_params ).
      WHEN 'MM.IV.LIST_BLOCKED'.
        rs_result = iv_blocked( is_params ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a query action|
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
    ok_msg( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    DATA: lv_ebeln  TYPE ekko-ebeln,
          lv_code   TYPE bapimmpara-po_rel_cod,
          lt_item   TYPE zif_mcp_biz_action=>ty_po_items,
          lt_itemx  TYPE ty_itemsx,
          lt_sched  TYPE zif_mcp_biz_action=>ty_po_schedules,
          lt_schedx TYPE ty_schedsx,
          ls_head   TYPE bapi2017_gm_head_01,
          lt_gm     TYPE ty_gm_items,
          lt_ext    TYPE ty_parex.

    CASE iv_action.
      WHEN 'MM.PO.RELEASE' OR 'MM.PO.RESET_RELEASE'.
        " No TESTRUN on these BAPIs: the preview shows the release state only.
        prepare_release( EXPORTING iv_action = iv_action is_params = is_params
                         IMPORTING ev_ebeln = lv_ebeln ev_code = lv_code
                         CHANGING  cs_result = rs_result ).
      WHEN 'MM.GR.POST'.
        prepare_gr( EXPORTING is_params = is_params
                    IMPORTING es_head = ls_head et_item = lt_gm
                    CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_gr( EXPORTING is_head = ls_head it_item = lt_gm iv_testrun = abap_true
                   CHANGING  cs_result = rs_result ).
        ENDIF.
      WHEN OTHERS.
        prepare_po_change( EXPORTING iv_action = iv_action is_params = is_params
                           IMPORTING ev_ebeln = lv_ebeln et_item = lt_item et_itemx = lt_itemx
                                     et_sched = lt_sched et_schedx = lt_schedx
                           CHANGING  cs_result = rs_result ).
        IF lv_ebeln IS NOT INITIAL.
          collect( EXPORTING iv_ebeln = lv_ebeln it_sel = selected_items( is_params )
                                         CHANGING  cs_result = rs_result ).
        ENDIF.
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          apply( EXPORTING iv_ebeln = lv_ebeln is_params = is_params
                                       IMPORTING et_ext = lt_ext
                                       CHANGING  cs_result = rs_result ).
          finish( CHANGING cs_result = rs_result ).
        ENDIF.
        IF rs_result-failed = abap_false.
          call_po_change( EXPORTING iv_ebeln = lv_ebeln iv_testrun = abap_true
                                    it_item = lt_item it_itemx = lt_itemx
                                    it_sched = lt_sched it_schedx = lt_schedx
                                    it_ext = lt_ext
                          CHANGING  cs_result = rs_result ).
        ENDIF.
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
    ok_msg( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    DATA: lv_ebeln  TYPE ekko-ebeln,
          lv_code   TYPE bapimmpara-po_rel_cod,
          lv_fm     TYPE string,
          lt_item   TYPE zif_mcp_biz_action=>ty_po_items,
          lt_itemx  TYPE ty_itemsx,
          lt_sched  TYPE zif_mcp_biz_action=>ty_po_schedules,
          lt_schedx TYPE ty_schedsx,
          ls_head   TYPE bapi2017_gm_head_01,
          lt_gm     TYPE ty_gm_items,
          lt_ext    TYPE ty_parex.

    " Every check of the preview runs again on the current data.
    CASE iv_action.
      WHEN 'MM.PO.RELEASE' OR 'MM.PO.RESET_RELEASE'.
        prepare_release( EXPORTING iv_action = iv_action is_params = is_params
                         IMPORTING ev_ebeln = lv_ebeln ev_code = lv_code
                         CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          IF iv_action = 'MM.PO.RELEASE'.
            lv_fm = 'BAPI_PO_RELEASE'.
          ELSE.
            lv_fm = 'BAPI_PO_RESET_RELEASE'.
          ENDIF.
          call_release( EXPORTING iv_fm = lv_fm iv_ebeln = lv_ebeln iv_code = lv_code
                        CHANGING  cs_result = rs_result ).
        ENDIF.
      WHEN 'MM.GR.POST'.
        prepare_gr( EXPORTING is_params = is_params
                    IMPORTING es_head = ls_head et_item = lt_gm
                    CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_gr( EXPORTING is_head = ls_head it_item = lt_gm iv_testrun = abap_false
                   CHANGING  cs_result = rs_result ).
        ENDIF.
      WHEN OTHERS.
        prepare_po_change( EXPORTING iv_action = iv_action is_params = is_params
                           IMPORTING ev_ebeln = lv_ebeln et_item = lt_item et_itemx = lt_itemx
                                     et_sched = lt_sched et_schedx = lt_schedx
                           CHANGING  cs_result = rs_result ).
        IF lv_ebeln IS NOT INITIAL.
          collect( EXPORTING iv_ebeln = lv_ebeln it_sel = selected_items( is_params )
                                         CHANGING  cs_result = rs_result ).
        ENDIF.
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          apply( EXPORTING iv_ebeln = lv_ebeln is_params = is_params
                                       IMPORTING et_ext = lt_ext
                                       CHANGING  cs_result = rs_result ).
          finish( CHANGING cs_result = rs_result ).
        ENDIF.
        IF rs_result-failed = abap_false.
          call_po_change( EXPORTING iv_ebeln = lv_ebeln iv_testrun = abap_false
                                    it_item = lt_item it_itemx = lt_itemx
                                    it_sched = lt_sched it_schedx = lt_schedx
                                    it_ext = lt_ext
                          CHANGING  cs_result = rs_result ).
          finish( CHANGING cs_result = rs_result ).
          IF rs_result-failed = abap_false AND lt_ext IS NOT INITIAL.
            verify( EXPORTING iv_ebeln = lv_ebeln
                                        CHANGING  cs_result = rs_result ).
          ENDIF.
        ENDIF.
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
    ok_msg( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD list_open.
    DATA: lt_open   TYPE zif_mcp_biz_action=>ty_open_items,
          lr_ekgrp  TYPE RANGE OF ekko-ekgrp,
          ls_ekgrp  LIKE LINE OF lr_ekgrp,
          lr_lifnr  TYPE RANGE OF ekko-lifnr,
          ls_lifnr  LIKE LINE OF lr_lifnr,
          lr_werks  TYPE RANGE OF ekpo-werks,
          ls_werks  LIKE LINE OF lr_werks,
          lr_eindt  TYPE RANGE OF eket-eindt,
          ls_eindt  LIKE LINE OF lr_eindt,
          lr_frgrl  TYPE RANGE OF ekko-frgrl,
          ls_frgrl  LIKE LINE OF lr_frgrl,
          lv_max    TYPE i,
          lv_fetch  TYPE i,
          lv_basis  TYPE string,
          lv_incl   TYPE string,
          lt_grp    TYPE STANDARD TABLE OF ekko-ekgrp WITH DEFAULT KEY,
          lv_grp    TYPE ekko-ekgrp,
          lv_lines  TYPE i,
          lv_from   TYPE i.
    FIELD-SYMBOLS <ls_open> TYPE zif_mcp_biz_action=>ty_open_item.

    " Business-meaning parameters have no defaults: the skill asks them.
    lv_basis = is_params-date_basis.
    IF lv_basis <> 'due_today' AND lv_basis <> 'overdue_until_today'
       AND lv_basis <> 'all_open'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'date_basis is required: due_today, overdue_until_today or all_open'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    lv_incl = is_params-include_unreleased.
    IF lv_incl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'include_unreleased is required: true or false'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    lv_max = 200.
    IF is_params-max_rows CO '0123456789' AND is_params-max_rows IS NOT INITIAL.
      lv_max = is_params-max_rows.
    ENDIF.
    IF lv_max > 1000.
      lv_max = 1000.
    ENDIF.
    lv_fetch = lv_max + 1.

    IF is_params-ekgrp IS NOT INITIAL.
      ls_ekgrp-sign = 'I'. ls_ekgrp-option = 'EQ'.
      ls_ekgrp-low = to_upper( is_params-ekgrp ).
      APPEND ls_ekgrp TO lr_ekgrp.
    ENDIF.
    IF is_params-lifnr IS NOT INITIAL.
      ls_lifnr-sign = 'I'. ls_lifnr-option = 'EQ'.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = is_params-lifnr
        IMPORTING output = ls_lifnr-low.
      APPEND ls_lifnr TO lr_lifnr.
    ENDIF.
    IF is_params-werks IS NOT INITIAL.
      ls_werks-sign = 'I'. ls_werks-option = 'EQ'.
      ls_werks-low = to_upper( is_params-werks ).
      APPEND ls_werks TO lr_werks.
    ENDIF.
    CASE lv_basis.
      WHEN 'due_today'.
        ls_eindt-sign = 'I'. ls_eindt-option = 'EQ'. ls_eindt-low = sy-datum.
        APPEND ls_eindt TO lr_eindt.
      WHEN 'overdue_until_today'.
        ls_eindt-sign = 'I'. ls_eindt-option = 'LE'. ls_eindt-low = sy-datum.
        APPEND ls_eindt TO lr_eindt.
    ENDCASE.
    IF is_true( lv_incl ) = abap_false.
      " FRGRL = 'X': release not yet complete.
      ls_frgrl-sign = 'I'. ls_frgrl-option = 'EQ'. ls_frgrl-low = space.
      APPEND ls_frgrl TO lr_frgrl.
    ENDIF.

    SELECT k~ebeln p~ebelp e~etenr k~lifnr k~ekgrp k~frgrl p~matnr p~txz01
           p~werks p~lgort e~eindt e~menge e~wemng p~meins
      FROM ekko AS k
      INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
      INNER JOIN eket AS e ON e~ebeln = p~ebeln AND e~ebelp = p~ebelp
      INTO CORRESPONDING FIELDS OF TABLE lt_open
      UP TO lv_fetch ROWS
      WHERE k~bstyp = 'F'
        AND k~loekz = space
        AND p~loekz = space
        AND p~elikz = space
        AND k~ekgrp IN lr_ekgrp
        AND k~lifnr IN lr_lifnr
        AND p~werks IN lr_werks
        AND e~eindt IN lr_eindt
        AND k~frgrl IN lr_frgrl
        AND e~menge > e~wemng
      ORDER BY e~eindt k~ebeln p~ebelp e~etenr.

    IF lines( lt_open ) > lv_max.
      rs_result-truncated = abap_true.
      lv_from = lv_max + 1.
      DELETE lt_open FROM lv_from.
    ENDIF.

    " Display authorization per purchasing group.
    LOOP AT lt_open ASSIGNING <ls_open>.
      COLLECT <ls_open>-ekgrp INTO lt_grp.
    ENDLOOP.
    LOOP AT lt_grp INTO lv_grp.
      AUTHORITY-CHECK OBJECT 'M_BEST_EKG'
        ID 'ACTVT' FIELD '03'
        ID 'EKGRP' FIELD lv_grp.
      IF sy-subrc <> 0.
        lv_lines = lines( lt_open ).
        DELETE lt_open WHERE ekgrp = lv_grp.
        rs_result-hidden_no_auth = rs_result-hidden_no_auth + lv_lines - lines( lt_open ).
      ENDIF.
    ENDLOOP.

    LOOP AT lt_open ASSIGNING <ls_open>.
      <ls_open>-open_qty = <ls_open>-menge - <ls_open>-wemng.
    ENDLOOP.

    rs_result-open_items = lt_open.
    lv_lines = lines( lt_open ).
    rs_result-summary = |{ lv_lines } open schedule lines|.
  ENDMETHOD.


  METHOD get_detail.
    DATA lv_ebeln TYPE ekko-ebeln.

    lv_ebeln = to_ebeln( is_params-ebeln ).
    IF lv_ebeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ebeln is required'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    load_po( EXPORTING iv_ebeln = lv_ebeln iv_history = iv_history
             CHANGING  cs_result = rs_result ).
    IF iv_history = abap_true.
      CLEAR: rs_result-po_schedules.
    ENDIF.
    IF rs_result-po_header-po_number IS NOT INITIAL.
      rs_result-summary = |Purchase order { lv_ebeln ALPHA = OUT }: { lines( rs_result-po_items ) } items|.
    ENDIF.
  ENDMETHOD.


  METHOD load_po.
    DATA: lt_ret2  TYPE ty_ret2,
          lt_item  TYPE zif_mcp_biz_action=>ty_po_items,
          lt_sched TYPE zif_mcp_biz_action=>ty_po_schedules,
          lt_hist  TYPE zif_mcp_biz_action=>ty_po_history,
          lt_tot   TYPE zif_mcp_biz_action=>ty_po_totals.

    CALL FUNCTION 'BAPI_PO_GETDETAIL1'
      EXPORTING
        purchaseorder    = iv_ebeln
      IMPORTING
        poheader         = cs_result-po_header
      TABLES
        return           = lt_ret2
        poitem           = lt_item
        poschedule       = lt_sched
        pohistory        = lt_hist
        pohistory_totals = lt_tot
      EXCEPTIONS
        error_message    = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = cs_result ).

    IF cs_result-po_header-po_number IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Purchase order { iv_ebeln } not found|
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    cs_result-po_items     = lt_item.
    cs_result-po_schedules = lt_sched.
    IF iv_history = abap_true.
      cs_result-po_history        = lt_hist.
      cs_result-po_history_totals = lt_tot.
    ENDIF.
  ENDMETHOD.


  METHOD prepare_po_change.
    DATA: lt_sel     TYPE ty_ebelps,
          lv_ebelp   TYPE ekpo-ebelp,
          lv_etenr   TYPE eket-etenr,
          ls_item    TYPE bapimepoitem,
          ls_new     TYPE bapimepoitem,
          ls_x       TYPE bapimepoitemx,
          ls_sched   TYPE bapimeposchedule,
          ls_cur     TYPE bapimeposchedule,
          ls_schx    TYPE bapimeposchedulx,
          ls_change  TYPE zif_mcp_biz_action=>ty_change,
          lv_qty     TYPE ekpo-menge,
          lv_ok      TYPE abap_bool,
          lv_rec     TYPE eket-wemng,
          lv_date    TYPE sy-datum,
          lv_ext     TYPE c LENGTH 10,
          lv_count   TYPE i,
          lv_hist    TYPE ekbe-ebeln,
          lv_found   TYPE abap_bool.

    CLEAR: ev_ebeln, et_item, et_itemx, et_sched, et_schedx.

    ev_ebeln = to_ebeln( is_params-ebeln ).
    IF ev_ebeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ebeln is required'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_po( EXPORTING iv_ebeln = ev_ebeln iv_history = abap_false
             CHANGING  cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF check_lock( EXPORTING iv_ebeln = ev_ebeln CHANGING cs_result = cs_result ) = abap_false.
      RETURN.
    ENDIF.
    lt_sel = selected_items( is_params ).

    CASE iv_action.
      WHEN 'MM.PO.SET_DELIVERY_COMPLETE'.
        prepare_flag( EXPORTING iv_field = 'NO_MORE_GR' iv_value = 'X' it_sel = lt_sel
                                iv_all_if_empty = abap_true
                      IMPORTING et_item = et_item et_itemx = et_itemx
                      CHANGING  cs_result = cs_result ).
      WHEN 'MM.PO.UNSET_DELIVERY_COMPLETE'.
        prepare_flag( EXPORTING iv_field = 'NO_MORE_GR' iv_value = space it_sel = lt_sel
                                iv_all_if_empty = abap_false
                      IMPORTING et_item = et_item et_itemx = et_itemx
                      CHANGING  cs_result = cs_result ).
      WHEN 'MM.PO.SET_FINAL_INVOICE'.
        prepare_flag( EXPORTING iv_field = 'FINAL_INV' iv_value = 'X' it_sel = lt_sel
                                iv_all_if_empty = abap_false
                      IMPORTING et_item = et_item et_itemx = et_itemx
                      CHANGING  cs_result = cs_result ).

      WHEN 'MM.PO.CHANGE_QUANTITY'.
        READ TABLE lt_sel INTO lv_ebelp INDEX 1.
        find_item( EXPORTING iv_ebelp = lv_ebelp is_result = cs_result
                   IMPORTING es_item = ls_item ev_found = lv_found ).
        IF lines( lt_sel ) <> 1 OR lv_found = abap_false.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'exactly one existing ebelp is required'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        to_qty( EXPORTING iv_value = is_params-new_quantity IMPORTING ev_qty = lv_qty ev_ok = lv_ok ).
        IF lv_ok = abap_false OR lv_qty <= 0.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'new_quantity must be a positive number'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        SELECT SUM( wemng ) FROM eket INTO lv_rec
          WHERE ebeln = ev_ebeln AND ebelp = lv_ebelp.
        IF lv_qty < lv_rec.
          add_msg( EXPORTING iv_type = 'E'
                             iv_text = |new_quantity is below the quantity already received ({ lv_rec })|
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        IF lv_qty = ls_item-quantity.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'The item already has this quantity'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        ls_new-po_item  = lv_ebelp.
        ls_new-quantity = lv_qty.
        APPEND ls_new TO et_item.
        ls_x-po_item  = lv_ebelp.
        ls_x-po_itemx = 'X'.
        ls_x-quantity = 'X'.
        APPEND ls_x TO et_itemx.
        ls_change-ebelp     = lv_ebelp.
        ls_change-field     = 'QUANTITY'.
        ls_change-old_value = ls_item-quantity.
        ls_change-new_value = lv_qty.
        CONDENSE: ls_change-old_value, ls_change-new_value.
        APPEND ls_change TO cs_result-changes.

      WHEN 'MM.PO.CHANGE_DELIVERY_DATE'.
        READ TABLE lt_sel INTO lv_ebelp INDEX 1.
        find_item( EXPORTING iv_ebelp = lv_ebelp is_result = cs_result
                   IMPORTING es_item = ls_item ev_found = lv_found ).
        IF lines( lt_sel ) <> 1 OR lv_found = abap_false.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'exactly one existing ebelp is required'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        lv_date = to_date( is_params-new_date ).
        IF lv_date IS INITIAL.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'new_date must be a valid date (YYYY-MM-DD)'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        IF is_params-etenr IS NOT INITIAL AND is_params-etenr CO '0123456789'.
          lv_etenr = is_params-etenr.
          READ TABLE cs_result-po_schedules INTO ls_cur
            WITH KEY po_item = lv_ebelp sched_line = lv_etenr.
          IF sy-subrc <> 0.
            add_msg( EXPORTING iv_type = 'E' iv_text = |Schedule line { lv_etenr } not found|
                     CHANGING  cs_result = cs_result ).
            RETURN.
          ENDIF.
        ELSE.
          CLEAR lv_count.
          LOOP AT cs_result-po_schedules INTO ls_sched WHERE po_item = lv_ebelp.
            lv_count = lv_count + 1.
            ls_cur = ls_sched.
          ENDLOOP.
          IF lv_count <> 1.
            add_msg( EXPORTING iv_type = 'E'
                               iv_text = |etenr is required: the item has { lv_count } schedule lines|
                     CHANGING  cs_result = cs_result ).
            RETURN.
          ENDIF.
          lv_etenr = ls_cur-sched_line.
        ENDIF.
        CALL FUNCTION 'CONVERT_DATE_TO_EXTERNAL'
          EXPORTING
            date_internal            = lv_date
          IMPORTING
            date_external            = lv_ext
          EXCEPTIONS
            date_internal_is_invalid = 1
            OTHERS                   = 2.
        IF sy-subrc <> 0.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'new_date could not be converted'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        CLEAR ls_sched.
        ls_sched-po_item       = lv_ebelp.
        ls_sched-sched_line    = lv_etenr.
        ls_sched-delivery_date = lv_ext.
        APPEND ls_sched TO et_sched.
        ls_schx-po_item       = lv_ebelp.
        ls_schx-sched_line    = lv_etenr.
        ls_schx-po_itemx      = 'X'.
        ls_schx-sched_linex   = 'X'.
        ls_schx-delivery_date = 'X'.
        APPEND ls_schx TO et_schedx.
        ls_change-ebelp     = lv_ebelp.
        ls_change-etenr     = lv_etenr.
        ls_change-field     = 'DELIVERY_DATE'.
        ls_change-old_value = ls_cur-delivery_date.
        ls_change-new_value = lv_ext.
        APPEND ls_change TO cs_result-changes.

      WHEN 'MM.PO.DELETE_ITEM'.
        READ TABLE lt_sel INTO lv_ebelp INDEX 1.
        find_item( EXPORTING iv_ebelp = lv_ebelp is_result = cs_result
                   IMPORTING es_item = ls_item ev_found = lv_found ).
        IF lines( lt_sel ) <> 1 OR lv_found = abap_false.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'exactly one existing ebelp is required'
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        IF ls_item-delete_ind IS NOT INITIAL.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Item { lv_ebelp } is already deleted|
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        SELECT SINGLE ebeln FROM ekbe INTO lv_hist
          WHERE ebeln = ev_ebeln AND ebelp = lv_ebelp.
        IF sy-subrc = 0.
          add_msg( EXPORTING iv_type = 'E'
                             iv_text = |Item { lv_ebelp } has goods receipts or invoices: use delivery completed instead|
                   CHANGING  cs_result = cs_result ).
          RETURN.
        ENDIF.
        ls_new-po_item    = lv_ebelp.
        ls_new-delete_ind = 'L'.
        APPEND ls_new TO et_item.
        ls_x-po_item    = lv_ebelp.
        ls_x-po_itemx   = 'X'.
        ls_x-delete_ind = 'X'.
        APPEND ls_x TO et_itemx.
        ls_change-ebelp     = lv_ebelp.
        ls_change-field     = 'DELETE_IND'.
        ls_change-old_value = ls_item-delete_ind.
        ls_change-new_value = 'L'.
        APPEND ls_change TO cs_result-changes.

      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a write action|
                 CHANGING  cs_result = cs_result ).
    ENDCASE.
  ENDMETHOD.


  METHOD prepare_flag.
    DATA: ls_item   TYPE bapimepoitem,
          ls_new    TYPE bapimepoitem,
          ls_x      TYPE bapimepoitemx,
          ls_change TYPE zif_mcp_biz_action=>ty_change,
          lv_ebelp  TYPE ekpo-ebelp,
          lt_sel    TYPE ty_ebelps,
          lv_found  TYPE abap_bool.
    FIELD-SYMBOLS: <lv_old> TYPE any,
                   <lv_new> TYPE any,
                   <lv_x>   TYPE any.

    CLEAR: et_item, et_itemx.
    lt_sel = it_sel.
    IF lt_sel IS INITIAL.
      IF iv_all_if_empty = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'ebelp is required for this action'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      LOOP AT cs_result-po_items INTO ls_item WHERE delete_ind IS INITIAL.
        APPEND ls_item-po_item TO lt_sel.
      ENDLOOP.
    ENDIF.

    LOOP AT lt_sel INTO lv_ebelp.
      find_item( EXPORTING iv_ebelp = lv_ebelp is_result = cs_result
                 IMPORTING es_item = ls_item ev_found = lv_found ).
      IF lv_found = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Item { lv_ebelp } not found|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      IF ls_item-delete_ind IS NOT INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Item { lv_ebelp } is deleted|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      ASSIGN COMPONENT iv_field OF STRUCTURE ls_item TO <lv_old>.
      IF <lv_old> = iv_value.
        add_msg( EXPORTING iv_type = 'I' iv_text = |Item { lv_ebelp }: { iv_field } already has this value|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      CLEAR: ls_new, ls_x.
      ls_new-po_item = lv_ebelp.
      ASSIGN COMPONENT iv_field OF STRUCTURE ls_new TO <lv_new>.
      <lv_new> = iv_value.
      APPEND ls_new TO et_item.
      ls_x-po_item  = lv_ebelp.
      ls_x-po_itemx = 'X'.
      ASSIGN COMPONENT iv_field OF STRUCTURE ls_x TO <lv_x>.
      <lv_x> = 'X'.
      APPEND ls_x TO et_itemx.
      ls_change-ebelp     = lv_ebelp.
      ls_change-field     = iv_field.
      ls_change-old_value = <lv_old>.
      ls_change-new_value = iv_value.
      APPEND ls_change TO cs_result-changes.
    ENDLOOP.

    IF et_item IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Nothing to change'
               CHANGING  cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD call_po_change.
    DATA: lt_ret2   TYPE ty_ret2,
          lt_item   TYPE zif_mcp_biz_action=>ty_po_items,
          lt_itemx  TYPE ty_itemsx,
          lt_sched  TYPE zif_mcp_biz_action=>ty_po_schedules,
          lt_schedx TYPE ty_schedsx,
          lt_ext    TYPE ty_parex,
          lv_test   TYPE bapiflag-bapiflag.

    lt_ext    = it_ext.
    lt_item   = it_item.
    lt_itemx  = it_itemx.
    lt_sched  = it_sched.
    lt_schedx = it_schedx.
    lv_test   = iv_testrun.

    CALL FUNCTION 'BAPI_PO_CHANGE'
      EXPORTING
        purchaseorder = iv_ebeln
        testrun       = lv_test
      TABLES
        return        = lt_ret2
        poitem        = lt_item
        poitemx       = lt_itemx
        poschedule    = lt_sched
        poschedulex   = lt_schedx
        extensionin   = lt_ext
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret2 CHANGING cs_result = cs_result ).
    commit_or_rollback( EXPORTING iv_testrun = iv_testrun CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD prepare_release.
    DATA: lt_final  TYPE zif_mcp_biz_action=>ty_rel_codes,
          lt_retn   TYPE ty_retn,
          lv_comp   TYPE string,
          lv_posted TYPE abap_bool,
          lv_valid  TYPE abap_bool,
          ls_fin    TYPE bapirlcopo,
          lv_fm     TYPE string.
    FIELD-SYMBOLS <lv_relc> TYPE any.

    CLEAR: ev_ebeln, ev_code.
    ev_ebeln = to_ebeln( is_params-ebeln ).
    IF ev_ebeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ebeln is required'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_code = to_upper( is_params-rel_code ).
    IF check_lock( EXPORTING iv_ebeln = ev_ebeln CHANGING cs_result = cs_result ) = abap_false.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_PO_GETRELINFO'
      EXPORTING
        purchaseorder          = ev_ebeln
        po_rel_code            = ev_code
      IMPORTING
        general_release_info   = cs_result-rel_info
        release_prerequisites  = cs_result-rel_prereq
        release_already_posted = cs_result-rel_posted
      TABLES
        release_final          = lt_final
        return                 = lt_retn
      EXCEPTIONS
        error_message          = 1
        OTHERS                 = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_retn( EXPORTING it_return = lt_retn CHANGING cs_result = cs_result ).
    cs_result-rel_final = lt_final.

    " The release code is a business choice: no default, the skill asks.
    IF ev_code IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'rel_code is required (see rel_info / rel_final)'
               CHANGING  cs_result = cs_result ).
    ENDIF.

    " Refuse what the BAPI would refuse anyway, before EXECUTE.
    IF cs_result-rel_info-rel_strat IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |PO { ev_ebeln } has no release strategy|
               CHANGING  cs_result = cs_result ).
    ELSEIF ev_code IS NOT INITIAL.
      " The code must belong to the strategy of the PO: GETRELINFO gives a code text only for a valid
      " code, and release_final lists the codes of the strategy. Any other code is refused here.
      lv_valid = abap_false.
      IF cs_result-rel_info-rel_cod_tx IS NOT INITIAL.
        lv_valid = abap_true.
      ENDIF.
      LOOP AT cs_result-rel_final INTO ls_fin.
        DO 8 TIMES.
          lv_comp = |REL_CODE{ sy-index }|.
          ASSIGN COMPONENT lv_comp OF STRUCTURE ls_fin TO <lv_relc>.
          IF sy-subrc = 0 AND <lv_relc> = ev_code.
            lv_valid = abap_true.
          ENDIF.
        ENDDO.
      ENDLOOP.
      IF lv_valid = abap_false.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = |Release code { ev_code } does not belong to release strategy { cs_result-rel_info-rel_strat } of PO { ev_ebeln }|
                 CHANGING  cs_result = cs_result ).
      ELSE.
        lv_posted = abap_false.
        DO 8 TIMES.
          lv_comp = |REL_CODE{ sy-index }|.
          ASSIGN COMPONENT lv_comp OF STRUCTURE cs_result-rel_posted TO <lv_relc>.
          IF sy-subrc = 0 AND <lv_relc> = ev_code.
            lv_posted = abap_true.
          ENDIF.
        ENDDO.
        IF iv_action = 'MM.PO.RELEASE' AND lv_posted = abap_true.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Release code { ev_code } is already set on PO { ev_ebeln }|
                   CHANGING  cs_result = cs_result ).
        ELSEIF iv_action = 'MM.PO.RESET_RELEASE' AND lv_posted = abap_false.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Release code { ev_code } is not set on PO { ev_ebeln }: nothing to reset|
                   CHANGING  cs_result = cs_result ).
        ENDIF.
      ENDIF.
    ENDIF.

    IF iv_action = 'MM.PO.RELEASE'.
      lv_fm = 'BAPI_PO_RELEASE'.
    ELSE.
      lv_fm = 'BAPI_PO_RESET_RELEASE'.
    ENDIF.
    IF no_commit_supported( lv_fm ) = abap_false.
      cs_result-irreversible = abap_true.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = |{ lv_fm } commits by itself on this release: the change cannot be rolled back|
               CHANGING  cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD call_release.
    DATA: lt_ptab   TYPE abap_func_parmbind_tab,
          ls_p      TYPE abap_func_parmbind,
          lt_etab   TYPE abap_func_excpbind_tab,
          ls_e      TYPE abap_func_excpbind,
          lv_ebeln  TYPE bapimmpara-po_number,
          lv_code   TYPE bapimmpara-po_rel_cod,
          lv_noexc  TYPE bapimmpara-selection,
          lv_nocomm TYPE bapimmpara-selection,
          lv_status TYPE bapimmpara-rel_status,
          lv_ind    TYPE bapimmpara-po_rel_ind,
          lt_retn   TYPE ty_retn,
          lv_own    TYPE abap_bool.

    lv_ebeln  = iv_ebeln.
    lv_code   = iv_code.
    lv_noexc  = space.
    lv_nocomm = 'X'.
    lv_own    = no_commit_supported( iv_fm ).

    ls_p-kind = abap_func_exporting.
    ls_p-name = 'PURCHASEORDER'.  GET REFERENCE OF lv_ebeln INTO ls_p-value.
    INSERT ls_p INTO TABLE lt_ptab.
    ls_p-name = 'PO_REL_CODE'.    GET REFERENCE OF lv_code INTO ls_p-value.
    INSERT ls_p INTO TABLE lt_ptab.
    ls_p-name = 'USE_EXCEPTIONS'. GET REFERENCE OF lv_noexc INTO ls_p-value.
    INSERT ls_p INTO TABLE lt_ptab.
    IF lv_own = abap_true.
      ls_p-name = 'NO_COMMIT'.    GET REFERENCE OF lv_nocomm INTO ls_p-value.
      INSERT ls_p INTO TABLE lt_ptab.
    ENDIF.
    ls_p-kind = abap_func_importing.
    ls_p-name = 'REL_STATUS_NEW'.    GET REFERENCE OF lv_status INTO ls_p-value.
    INSERT ls_p INTO TABLE lt_ptab.
    ls_p-name = 'REL_INDICATOR_NEW'. GET REFERENCE OF lv_ind INTO ls_p-value.
    INSERT ls_p INTO TABLE lt_ptab.
    ls_p-kind = abap_func_tables.
    ls_p-name = 'RETURN'.            GET REFERENCE OF lt_retn INTO ls_p-value.
    INSERT ls_p INTO TABLE lt_ptab.

    ls_e-name = 'ERROR_MESSAGE'. ls_e-value = 98.
    INSERT ls_e INTO TABLE lt_etab.
    ls_e-name = 'OTHERS'.        ls_e-value = 99.
    INSERT ls_e INTO TABLE lt_etab.

    CALL FUNCTION iv_fm
      PARAMETER-TABLE lt_ptab
      EXCEPTION-TABLE lt_etab.
    IF sy-subrc <> 0.
      IF sy-msgid IS NOT INITIAL.
        add_sy_msg( CHANGING cs_result = cs_result ).
      ELSE.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_fm } raised exception { sy-subrc }|
                 CHANGING  cs_result = cs_result ).
      ENDIF.
    ENDIF.
    add_retn( EXPORTING it_return = lt_retn CHANGING cs_result = cs_result ).
    cs_result-rel_status_new = lv_status.

    IF lv_own = abap_true.
      commit_or_rollback( EXPORTING iv_testrun = abap_false CHANGING cs_result = cs_result ).
    ELSE.
      " The BAPI has already committed (or failed before saving).
      finish( CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD prepare_gr.
    DATA: lt_sel   TYPE ty_ebelps,
          lv_ebeln TYPE ekko-ebeln,
          lv_ebelp TYPE ekpo-ebelp,
          ls_item  TYPE bapimepoitem,
          ls_gm    TYPE bapi2017_gm_item_create,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_qty   TYPE ekpo-menge,
          lv_ok    TYPE abap_bool,
          lv_menge TYPE eket-menge,
          lv_wemng TYPE eket-wemng,
          lv_open  TYPE eket-menge,
          lv_date  TYPE sy-datum,
          lv_xchpf TYPE marc-xchpf,
          lv_found TYPE abap_bool.

    CLEAR: es_head, et_item.
    lv_ebeln = to_ebeln( is_params-ebeln ).
    IF lv_ebeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ebeln is required'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_po( EXPORTING iv_ebeln = lv_ebeln iv_history = abap_false
             CHANGING  cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.

    lt_sel = selected_items( is_params ).
    READ TABLE lt_sel INTO lv_ebelp INDEX 1.
    find_item( EXPORTING iv_ebelp = lv_ebelp is_result = cs_result
               IMPORTING es_item = ls_item ev_found = lv_found ).
    IF lines( lt_sel ) <> 1 OR lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'exactly one existing ebelp is required'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_item-delete_ind IS NOT INITIAL OR ls_item-no_more_gr IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Item { lv_ebelp } is deleted or delivery completed|
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    to_qty( EXPORTING iv_value = is_params-quantity IMPORTING ev_qty = lv_qty ev_ok = lv_ok ).
    IF lv_ok = abap_false OR lv_qty <= 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'quantity must be a positive number'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SUM( menge ) SUM( wemng ) FROM eket INTO (lv_menge, lv_wemng)
      WHERE ebeln = lv_ebeln AND ebelp = lv_ebelp.
    lv_open = lv_menge - lv_wemng.
    IF lv_qty > lv_open.
      add_msg( EXPORTING iv_type = 'E' iv_text = |quantity exceeds the open quantity ({ lv_open })|
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    lv_date = to_date( is_params-posting_date ).
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    ls_gm-po_number = lv_ebeln.
    ls_gm-po_item   = lv_ebelp.
    ls_gm-move_type = '101'.
    ls_gm-mvt_ind   = 'B'.
    ls_gm-entry_qnt = lv_qty.
    ls_gm-entry_uom = ls_item-po_unit.
    ls_gm-plant     = ls_item-plant.
    IF is_params-lgort IS NOT INITIAL.
      ls_gm-stge_loc = to_upper( is_params-lgort ).
    ELSE.
      ls_gm-stge_loc = ls_item-stge_loc.
    ENDIF.
    IF ls_gm-stge_loc IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lgort is required: the item has no storage location'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Batch: required for batch-managed materials, refused otherwise.
    SELECT SINGLE m~xchpf FROM ekpo AS p
      INNER JOIN marc AS m ON m~matnr = p~matnr AND m~werks = p~werks
      INTO lv_xchpf
      WHERE p~ebeln = lv_ebeln AND p~ebelp = lv_ebelp.
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

    " Stock type of the receipt: blank / F = unrestricted, X / Q = quality inspection, S / B = blocked.
    DATA lv_st TYPE string.
    lv_st = to_upper( is_params-stock_type ).
    CASE lv_st.
      WHEN space OR 'F'.
      WHEN 'X' OR 'Q'.
        ls_gm-stck_type = 'X'.
        add_msg( EXPORTING iv_type = 'I' iv_text = 'Receipt into quality inspection stock'
                 CHANGING  cs_result = cs_result ).
      WHEN 'S' OR 'B'.
        ls_gm-stck_type = 'S'.
        add_msg( EXPORTING iv_type = 'I' iv_text = 'Receipt into blocked stock'
                 CHANGING  cs_result = cs_result ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'stock_type must be F (unrestricted), X (quality inspection) or S (blocked)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
    ENDCASE.
    APPEND ls_gm TO et_item.

    es_head-pstng_date = lv_date.
    es_head-doc_date   = lv_date.

    ls_chg-ebelp     = lv_ebelp.
    ls_chg-field     = 'GR_QUANTITY'.
    ls_chg-old_value = lv_open.
    ls_chg-new_value = lv_qty.
    CONDENSE: ls_chg-old_value, ls_chg-new_value.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD call_gr.
    DATA: lt_item TYPE ty_gm_items,
          lt_ret2 TYPE ty_ret2,
          ls_code TYPE bapi2017_gm_code,
          lv_test TYPE bapi2017_gm_gen-testrun.

    lt_item         = it_item.
    ls_code-gm_code = '01'.
    lv_test         = iv_testrun.

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


  METHOD selected_items.
    DATA: lv_text  TYPE string,
          lv_ebelp TYPE ekpo-ebelp.

    LOOP AT is_params-ebelp INTO lv_text.
      lv_ebelp = to_ebelp( lv_text ).
      IF lv_ebelp IS NOT INITIAL.
        APPEND lv_ebelp TO rt_sel.
      ENDIF.
    ENDLOOP.
    SORT rt_sel.
    DELETE ADJACENT DUPLICATES FROM rt_sel.
  ENDMETHOD.


  METHOD find_item.
    CLEAR: es_item, ev_found.
    READ TABLE is_result-po_items INTO es_item WITH KEY po_item = iv_ebelp.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD no_commit_supported.
    DATA: lv_fm    TYPE fupararef-funcname,
          lv_param TYPE fupararef-parameter.

    lv_fm = iv_fm.
    SELECT SINGLE parameter FROM fupararef INTO lv_param
      WHERE funcname  = lv_fm
        AND r3state   = 'A'
        AND parameter = 'NO_COMMIT'.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD to_ebeln.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = rv_ebeln.
  ENDMETHOD.


  METHOD to_ebelp.
    IF iv_value IS NOT INITIAL AND iv_value CO '0123456789'
       AND strlen( iv_value ) <= 5.
      rv_ebelp = iv_value.
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


  METHOD is_true.
    DATA lv_text TYPE string.

    lv_text = to_upper( iv_value ).
    IF lv_text = 'X' OR lv_text = 'TRUE' OR lv_text = '1'.
      rv_true = abap_true.
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
      " ME 887 W: standard FG 2012 raises it on every PO BAPI call when the
      " CI include has packed fields (EXTENSIONOUT mapping). No effect.
      IF ls_ret-type = 'W' AND ls_ret-id = 'ME' AND ls_ret-number = '887'.
        APPEND ls_msg TO cs_result-suppressed.
        CONTINUE.
      ENDIF.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_retn.
    DATA: ls_ret TYPE bapireturn,
          ls_msg TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT it_return INTO ls_ret.
      CLEAR ls_msg.
      ls_msg-type    = ls_ret-type.
      ls_msg-id      = ls_ret-code.
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


  METHOD ok_msg.
    DATA lv_text TYPE string.

    IF cs_result-failed = abap_true OR cs_result-messages IS NOT INITIAL.
      RETURN.
    ENDIF.
    lv_text = cs_result-summary.
    IF lv_text IS INITIAL.
      lv_text = 'OK'.
    ENDIF.
    add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD check_lock.
    DATA lv_text TYPE string.

    CALL FUNCTION 'ENQUEUE_EMEKKOE'
      EXPORTING
        ebeln          = iv_ebeln
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    CASE sy-subrc.
      WHEN 0.
        CALL FUNCTION 'DEQUEUE_EMEKKOE'
          EXPORTING
            ebeln = iv_ebeln.
        rv_ok = abap_true.
      WHEN 1.
        lv_text = |Purchase order { iv_ebeln ALPHA = OUT } is locked by user { sy-msgv1 } (lock object EMEKKOE, e.g. open in ME22N): try again when the document is free|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      WHEN OTHERS.
        lv_text = |Purchase order { iv_ebeln ALPHA = OUT } could not be locked (enqueue error { sy-subrc })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDCASE.
  ENDMETHOD.


  METHOD cbo_layout.
    " Layout of the EXTENSIONIN value part for one level (H = header,
    " I = item). STRUCTURE stays the standard BAPI_TE_* name; only the
    " layout of VALUEPART may differ. Standard layout works when the CI
    " include is character-like. Otherwise the system needs a character-
    " only copy of BAPI_TE_* (plus a ME_BAPI_PO_CUST~MAP2I_EXTENSIONIN
    " implementation that reads it), named in TVARVC ZMCP_BIZ_TE_MEPO*.
    DATA: lv_ci    TYPE string,
          lv_tvar  TYPE tvarvc-name,
          lv_low   TYPE tvarvc-low,
          lt_te    TYPE ddfields,
          lt_lay   TYPE ddfields,
          ls_te    TYPE dfies,
          ls_lay   TYPE dfies,
          lv_idx   TYPE i.

    CLEAR: ev_te, ev_layout, ev_ci, ev_settable, ev_note.
    IF iv_level = 'H'.
      lv_ci    = 'CI_EKKODB'.
      ev_te    = 'BAPI_TE_MEPOHEADER'.
      lv_tvar  = 'ZMCP_BIZ_TE_MEPOHEADER'.
    ELSE.
      lv_ci    = 'CI_EKPODB'.
      ev_te    = 'BAPI_TE_MEPOITEM'.
      lv_tvar  = 'ZMCP_BIZ_TE_MEPOITEM'.
    ENDIF.

    lt_te = ddic_fields( lv_ci ).
    IF lt_te IS INITIAL.
      RETURN.                      " no customer include on this system
    ENDIF.
    ev_ci = lv_ci.

    IF char_like( lt_te ) = abap_true.
      ev_layout   = ev_te.
      ev_settable = abap_true.
      RETURN.
    ENDIF.

    SELECT SINGLE low FROM tvarvc INTO lv_low
      WHERE name = lv_tvar AND type = 'P' AND numb = '0000'.
    IF sy-subrc <> 0 OR lv_low IS INITIAL.
      ev_note = |{ lv_ci } has non-character fields: set TVARVC { lv_tvar } to a character-only copy of { ev_te } (see the CBO extension guide)|.
      RETURN.
    ENDIF.

    " The copy must have the same field names in the same order and be
    " character-like (the same check a MAP2I_EXTENSIONIN implementation does).
    lt_te  = ddic_fields( ev_te ).
    lt_lay = ddic_fields( lv_low ).
    IF lt_lay IS INITIAL OR char_like( lt_lay ) = abap_false OR lines( lt_lay ) <> lines( lt_te ).
      ev_note = |TVARVC { lv_tvar } = { lv_low }: not a character-only copy of { ev_te }|.
      RETURN.
    ENDIF.
    LOOP AT lt_te INTO ls_te.
      lv_idx = sy-tabix.
      READ TABLE lt_lay INTO ls_lay INDEX lv_idx.
      IF ls_lay-fieldname <> ls_te-fieldname.
        ev_note = |TVARVC { lv_tvar } = { lv_low }: field { ls_lay-fieldname } does not match { ev_te }-{ ls_te-fieldname }|.
        RETURN.
      ENDIF.
    ENDLOOP.
    ev_layout   = lv_low.
    ev_settable = abap_true.
  ENDMETHOD.


  METHOD ddic_fields.
    DATA: lo_type   TYPE REF TO cl_abap_typedescr,
          lo_struct TYPE REF TO cl_abap_structdescr.

    cl_abap_typedescr=>describe_by_name(
      EXPORTING  p_name         = iv_name
      RECEIVING  p_descr_ref    = lo_type
      EXCEPTIONS type_not_found = 1
                 OTHERS         = 2 ).
    IF sy-subrc <> 0 OR lo_type->kind <> cl_abap_typedescr=>kind_struct.
      RETURN.
    ENDIF.
    lo_struct ?= lo_type.
    lo_struct->get_ddic_field_list(
      RECEIVING  p_field_list = rt_fields
      EXCEPTIONS not_found    = 1
                 no_ddic_type = 2
                 OTHERS       = 3 ).
    IF sy-subrc <> 0.
      CLEAR rt_fields.
    ENDIF.
  ENDMETHOD.


  METHOD char_like.
    DATA ls_field TYPE dfies.

    rv_ok = abap_true.
    LOOP AT it_fields INTO ls_field.
      IF ls_field-inttype CN 'CNDT'.
        rv_ok = abap_false.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD collect.
    " Lists the customer include fields of the PO header and of the
    " items in scope with their current values, so the skill can ask
    " whether any of them must change together with the action.
    DATA: lt_fields  TYPE ddfields,
          ls_field   TYPE dfies,
          ls_cbo     TYPE zif_mcp_biz_action=>ty_cbo_field,
          ls_ekko    TYPE ekko,
          lt_ekpo    TYPE STANDARD TABLE OF ekpo,
          ls_ekpo    TYPE ekpo,
          lv_te      TYPE string,
          lv_layout  TYPE string,
          lv_ci      TYPE string,
          lv_set     TYPE abap_bool,
          lv_note    TYPE string.
    FIELD-SYMBOLS <lv_value> TYPE any.

    " Header
    cbo_layout( EXPORTING iv_level = 'H'
                IMPORTING ev_te = lv_te ev_layout = lv_layout ev_ci = lv_ci
                          ev_settable = lv_set ev_note = lv_note ).
    IF lv_ci IS NOT INITIAL.
      SELECT SINGLE * FROM ekko INTO ls_ekko WHERE ebeln = iv_ebeln.
      lt_fields = ddic_fields( lv_ci ).
      LOOP AT lt_fields INTO ls_field.
        CLEAR ls_cbo.
        ls_cbo-level    = 'H'.
        ls_cbo-field    = ls_field-fieldname.
        ls_cbo-text     = ls_field-fieldtext.
        ls_cbo-datatype = ls_field-datatype.
        ls_cbo-length   = ls_field-leng.
        ls_cbo-values   = domain_values( ls_field-domname ).
        ls_cbo-settable = lv_set.
        ls_cbo-note     = lv_note.
        ASSIGN COMPONENT ls_field-fieldname OF STRUCTURE ls_ekko TO <lv_value>.
        IF sy-subrc = 0.
          ls_cbo-value = cbo_text( iv_value = <lv_value> iv_inttype = ls_field-inttype ).
        ENDIF.
        APPEND ls_cbo TO cs_result-cbo_fields.
      ENDLOOP.
    ENDIF.

    " Items in scope (all undeleted items when none is selected)
    cbo_layout( EXPORTING iv_level = 'I'
                IMPORTING ev_te = lv_te ev_layout = lv_layout ev_ci = lv_ci
                          ev_settable = lv_set ev_note = lv_note ).
    IF lv_ci IS INITIAL.
      RETURN.
    ENDIF.
    SELECT * FROM ekpo INTO TABLE lt_ekpo WHERE ebeln = iv_ebeln AND loekz = space.
    lt_fields = ddic_fields( lv_ci ).
    LOOP AT lt_ekpo INTO ls_ekpo.
      IF it_sel IS NOT INITIAL.
        READ TABLE it_sel TRANSPORTING NO FIELDS WITH KEY table_line = ls_ekpo-ebelp.
        CHECK sy-subrc = 0.
      ENDIF.
      LOOP AT lt_fields INTO ls_field.
        CLEAR ls_cbo.
        ls_cbo-level    = 'I'.
        ls_cbo-ebelp    = ls_ekpo-ebelp.
        ls_cbo-field    = ls_field-fieldname.
        ls_cbo-text     = ls_field-fieldtext.
        ls_cbo-datatype = ls_field-datatype.
        ls_cbo-length   = ls_field-leng.
        ls_cbo-values   = domain_values( ls_field-domname ).
        ls_cbo-settable = lv_set.
        ls_cbo-note     = lv_note.
        ASSIGN COMPONENT ls_field-fieldname OF STRUCTURE ls_ekpo TO <lv_value>.
        IF sy-subrc = 0.
          ls_cbo-value = cbo_text( iv_value = <lv_value> iv_inttype = ls_field-inttype ).
        ENDIF.
        APPEND ls_cbo TO cs_result-cbo_fields.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.


  METHOD cbo_text.
    " Neutral text: dates as YYYY-MM-DD, numbers with '.' and no grouping.
    DATA lv_date TYPE d.

    CASE iv_inttype.
      WHEN 'D'.
        lv_date = iv_value.
        IF lv_date IS NOT INITIAL AND lv_date <> '00000000'.
          rv_text = |{ lv_date DATE = ISO }|.
        ENDIF.
      WHEN 'P' OR 'F' OR 'I' OR 'b' OR 's' OR '8'.
        IF iv_value IS NOT INITIAL.
          rv_text = iv_value.
          CONDENSE rv_text NO-GAPS.
        ENDIF.
      WHEN OTHERS.
        rv_text = iv_value.
        CONDENSE rv_text.
    ENDCASE.
  ENDMETHOD.


  METHOD apply.
    " Parameter "cbo": array of strings, one per field to set:
    "   H.<FIELD>=<value>            header field
    "   I.<ebelp>.<FIELD>=<value>    item field
    " Dates as YYYY-MM-DD, numbers with '.' as decimal separator.
    TYPES: BEGIN OF ty_row,
             level TYPE c LENGTH 1,
             ebelp TYPE ekpo-ebelp,
             data  TYPE REF TO data,
             datax TYPE REF TO data,
           END OF ty_row.
    DATA: lv_entry   TYPE string,
          lv_key     TYPE string,
          lv_value   TYPE string,
          lv_level   TYPE c LENGTH 1,
          lv_ebelp   TYPE ekpo-ebelp,
          lv_field   TYPE string,
          lv_rest    TYPE string,
          lv_item    TYPE string,
          lv_date    TYPE d,
          lv_text    TYPE string,
          lt_rows    TYPE STANDARD TABLE OF ty_row,
          ls_row     TYPE ty_row,
          ls_change  TYPE zif_mcp_biz_action=>ty_change,
          lv_te      TYPE string,
          lv_layout  TYPE string,
          lv_ci      TYPE string,
          lv_set     TYPE abap_bool,
          lv_note    TYPE string,
          lv_tex     TYPE string,
          lt_lay     TYPE ddfields,
          ls_lay     TYPE dfies,
          ls_parex   TYPE bapiparex,
          lv_cont    TYPE c LENGTH 960,
          lv_probe   TYPE string,
          lv_find    TYPE string,
          lv_tabix   TYPE i.
    FIELD-SYMBOLS: <ls_cbo>  TYPE zif_mcp_biz_action=>ty_cbo_field,
                   <ls_row>  TYPE ty_row,
                   <ls_data> TYPE any,
                   <ls_x>    TYPE any,
                   <lv_comp> TYPE any.

    CLEAR et_ext.
    LOOP AT is_params-cbo INTO lv_entry.
      SPLIT lv_entry AT '=' INTO lv_key lv_value.
      lv_key = to_upper( lv_key ).
      CONDENSE lv_key NO-GAPS.
      SPLIT lv_key AT '.' INTO lv_level lv_rest.
      CLEAR lv_ebelp.
      IF lv_level = 'I'.
        SPLIT lv_rest AT '.' INTO lv_item lv_field.
        lv_ebelp = cbo_to_ebelp( lv_item ).
      ELSEIF lv_level = 'H'.
        lv_field = lv_rest.
      ELSE.
        cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo entry "{ lv_entry }": use H.<FIELD>=<value> or I.<ebelp>.<FIELD>=<value>|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.

      READ TABLE cs_result-cbo_fields ASSIGNING <ls_cbo>
        WITH KEY level = lv_level ebelp = lv_ebelp field = lv_field.
      IF sy-subrc <> 0.
        cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo entry "{ lv_entry }": no such customer field in scope|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      IF <ls_cbo>-settable = abap_false.
        cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field } cannot be set: { <ls_cbo>-note }|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.

      cbo_layout( EXPORTING iv_level = lv_level
                  IMPORTING ev_te = lv_te ev_layout = lv_layout ev_ci = lv_ci
                            ev_settable = lv_set ev_note = lv_note ).
      lt_lay = ddic_fields( lv_layout ).
      READ TABLE lt_lay INTO ls_lay WITH KEY fieldname = lv_field.
      IF sy-subrc <> 0.
        cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field } is missing in { lv_layout }|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.

      " Fixed domain values: the value must be one of them (empty clears).
      IF <ls_cbo>-values IS NOT INITIAL AND lv_value IS NOT INITIAL.
        lv_probe = |, { <ls_cbo>-values }|.
        lv_find  = |, { lv_value }=|.
        IF lv_probe NS lv_find.
          cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field }: { lv_value } is not allowed ({ <ls_cbo>-values })|
                   CHANGING  cs_result = cs_result ).
          CONTINUE.
        ENDIF.
      ENDIF.

      " Value check and conversion into the layout field
      lv_text = lv_value.
      IF ls_lay-inttype = 'D'.
        IF lv_value IS NOT INITIAL.
          lv_date = cbo_to_date( lv_value ).
          IF lv_date IS INITIAL.
            cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field }: { lv_value } is not a date (YYYY-MM-DD)|
                     CHANGING  cs_result = cs_result ).
            CONTINUE.
          ENDIF.
          lv_text = lv_date.
        ENDIF.
      ELSEIF ls_lay-inttype = 'N' AND lv_value CN '0123456789'.
        cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field }: digits only|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ELSEIF <ls_cbo>-datatype = 'QUAN' OR <ls_cbo>-datatype = 'CURR' OR <ls_cbo>-datatype = 'DEC'.
        IF lv_value CN '0123456789.-'.
          cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field }: number with '.' as decimal separator|
                   CHANGING  cs_result = cs_result ).
          CONTINUE.
        ENDIF.
      ENDIF.
      IF strlen( lv_text ) > ls_lay-leng.
        cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |cbo field { lv_field }: value longer than { ls_lay-leng }|
                 CHANGING  cs_result = cs_result ).
        CONTINUE.
      ENDIF.

      " One EXTENSIONIN row (+ X row) per header / item
      READ TABLE lt_rows ASSIGNING <ls_row> WITH KEY level = lv_level ebelp = lv_ebelp.
      IF sy-subrc <> 0.
        CLEAR ls_row.
        ls_row-level = lv_level.
        ls_row-ebelp = lv_ebelp.
        CREATE DATA ls_row-data TYPE (lv_layout).
        lv_tex = |{ lv_te }X|.
        CREATE DATA ls_row-datax TYPE (lv_tex).
        APPEND ls_row TO lt_rows ASSIGNING <ls_row>.
        ASSIGN <ls_row>-data->* TO <ls_data>.
        ASSIGN <ls_row>-datax->* TO <ls_x>.
        IF lv_level = 'H'.
          ASSIGN COMPONENT 'PO_NUMBER' OF STRUCTURE <ls_data> TO <lv_comp>.
          <lv_comp> = iv_ebeln.
          ASSIGN COMPONENT 'PO_NUMBER' OF STRUCTURE <ls_x> TO <lv_comp>.
          <lv_comp> = iv_ebeln.
        ELSE.
          ASSIGN COMPONENT 'PO_ITEM' OF STRUCTURE <ls_data> TO <lv_comp>.
          <lv_comp> = lv_ebelp.
          ASSIGN COMPONENT 'PO_ITEM' OF STRUCTURE <ls_x> TO <lv_comp>.
          <lv_comp> = lv_ebelp.
        ENDIF.
      ENDIF.
      ASSIGN <ls_row>-data->* TO <ls_data>.
      ASSIGN <ls_row>-datax->* TO <ls_x>.
      ASSIGN COMPONENT lv_field OF STRUCTURE <ls_data> TO <lv_comp>.
      <lv_comp> = lv_text.
      ASSIGN COMPONENT lv_field OF STRUCTURE <ls_x> TO <lv_comp>.
      IF sy-subrc = 0.
        <lv_comp> = 'X'.
      ENDIF.

      <ls_cbo>-new_value = lv_value.
      CLEAR ls_change.
      ls_change-ebelp     = lv_ebelp.
      ls_change-field     = |CBO:{ lv_field }|.
      ls_change-old_value = <ls_cbo>-value.
      ls_change-new_value = lv_value.
      APPEND ls_change TO cs_result-changes.
    ENDLOOP.

    " Rows into BAPIPAREX (value part: 4 x 240 characters)
    LOOP AT lt_rows ASSIGNING <ls_row>.
      IF <ls_row>-level = 'H'.
        lv_te = 'BAPI_TE_MEPOHEADER'.
      ELSE.
        lv_te = 'BAPI_TE_MEPOITEM'.
      ENDIF.
      DO 2 TIMES.
        lv_tabix = sy-index.
        IF lv_tabix = 1.
          ASSIGN <ls_row>-data->* TO <ls_data>.
          ls_parex-structure = lv_te.
        ELSE.
          ASSIGN <ls_row>-datax->* TO <ls_data>.
          ls_parex-structure = |{ lv_te }X|.
        ENDIF.
        CLEAR lv_cont.
        cl_abap_container_utilities=>fill_container_c(
          EXPORTING  im_value     = <ls_data>
          IMPORTING  ex_container = lv_cont
          EXCEPTIONS illegal_parameter_type = 1
                     OTHERS                 = 2 ).
        IF sy-subrc <> 0.
          cbo_add_msg( EXPORTING iv_type = 'E' iv_text = |{ ls_parex-structure }: value part could not be built|
                   CHANGING  cs_result = cs_result ).
          CONTINUE.
        ENDIF.
        ls_parex-valuepart1 = lv_cont(240).
        ls_parex-valuepart2 = lv_cont+240(240).
        ls_parex-valuepart3 = lv_cont+480(240).
        ls_parex-valuepart4 = lv_cont+720(240).
        APPEND ls_parex TO et_ext.
      ENDDO.
    ENDLOOP.
  ENDMETHOD.


  METHOD verify.
    DATA: ls_ekko  TYPE ekko,
          ls_ekpo  TYPE ekpo,
          lt_head  TYPE ddfields,
          lt_item  TYPE ddfields,
          ls_field TYPE dfies,
          lr_want  TYPE REF TO data,
          lv_date  TYPE d,
          lv_now   TYPE string,
          lv_ok    TYPE abap_bool.
    FIELD-SYMBOLS: <ls_cbo>  TYPE zif_mcp_biz_action=>ty_cbo_field,
                   <lv_is>   TYPE any,
                   <lv_want> TYPE any.

    SELECT SINGLE * FROM ekko INTO ls_ekko WHERE ebeln = iv_ebeln.
    lt_head = ddic_fields( 'CI_EKKODB' ).
    lt_item = ddic_fields( 'CI_EKPODB' ).

    LOOP AT cs_result-cbo_fields ASSIGNING <ls_cbo> WHERE new_value IS NOT INITIAL.
      IF <ls_cbo>-level = 'H'.
        READ TABLE lt_head INTO ls_field WITH KEY fieldname = <ls_cbo>-field.
        ASSIGN COMPONENT <ls_cbo>-field OF STRUCTURE ls_ekko TO <lv_is>.
      ELSE.
        CLEAR ls_ekpo.
        SELECT SINGLE * FROM ekpo INTO ls_ekpo WHERE ebeln = iv_ebeln AND ebelp = <ls_cbo>-ebelp.
        READ TABLE lt_item INTO ls_field WITH KEY fieldname = <ls_cbo>-field.
        ASSIGN COMPONENT <ls_cbo>-field OF STRUCTURE ls_ekpo TO <lv_is>.
      ENDIF.
      CHECK sy-subrc = 0.

      " Requested value in the field's own type, then compare.
      CREATE DATA lr_want LIKE <lv_is>.
      ASSIGN lr_want->* TO <lv_want>.
      lv_ok = abap_true.
      TRY.
          IF ls_field-inttype = 'D'.
            lv_date = cbo_to_date( <ls_cbo>-new_value ).
            <lv_want> = lv_date.
          ELSE.
            <lv_want> = <ls_cbo>-new_value.
          ENDIF.
        CATCH cx_root.
          lv_ok = abap_false.
      ENDTRY.
      lv_now = cbo_text( iv_value = <lv_is> iv_inttype = ls_field-inttype ).
      <ls_cbo>-value = lv_now.
      IF lv_ok = abap_false OR <lv_want> <> <lv_is>.
        cbo_add_msg( EXPORTING iv_type = 'W'
                           iv_text = |CBO field { <ls_cbo>-field } was not saved as requested ({ <ls_cbo>-new_value }): | &&
                                     |the PO now has "{ lv_now }". The system recalculates or overwrites this field on save.|
                 CHANGING  cs_result = cs_result ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD domain_values.
    " Fixed values of the field's domain as "D=Domestic, E=Export ..." (max 30).
    DATA: lt_dd07v TYPE STANDARD TABLE OF dd07v,
          ls_dd07v TYPE dd07v,
          lv_count TYPE i.

    IF iv_domname IS INITIAL.
      RETURN.
    ENDIF.
    CALL FUNCTION 'DD_DOMVALUES_GET'
      EXPORTING
        domname        = iv_domname
        text           = 'X'
        langu          = sy-langu
      TABLES
        dd07v_tab      = lt_dd07v
      EXCEPTIONS
        wrong_textflag = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    LOOP AT lt_dd07v INTO ls_dd07v WHERE domvalue_l IS NOT INITIAL.
      lv_count = lv_count + 1.
      IF lv_count > 30.
        EXIT.
      ENDIF.
      IF rv_values IS NOT INITIAL.
        rv_values = |{ rv_values }, |.
      ENDIF.
      rv_values = |{ rv_values }{ ls_dd07v-domvalue_l }={ ls_dd07v-ddtext }|.
    ENDLOOP.
  ENDMETHOD.


  METHOD cbo_to_date.
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


  METHOD cbo_to_ebelp.
    IF iv_value IS NOT INITIAL AND iv_value CO '0123456789'
       AND strlen( iv_value ) <= 5.
      rv_ebelp = iv_value.
    ENDIF.
  ENDMETHOD.


  METHOD cbo_add_msg.
    DATA ls_msg TYPE zif_mcp_biz_action=>ty_message.

    ls_msg-type    = iv_type.
    ls_msg-message = iv_text.
    APPEND ls_msg TO cs_result-messages.
  ENDMETHOD.


  METHOD vendor_status.
    " Block and deletion flags of a vendor only (never name, address or bank data).
    TYPES: BEGIN OF ty_lvl,
             level TYPE string,
             sperr TYPE lfa1-sperr,
             sperm TYPE lfa1-sperm,
             loevm TYPE lfa1-loevm,
             zahls TYPE lfb1-zahls,
           END OF ty_lvl,
           BEGIN OF ty_b,
             bukrs TYPE lfb1-bukrs,
             sperr TYPE lfb1-sperr,
             loevm TYPE lfb1-loevm,
             zahls TYPE lfb1-zahls,
           END OF ty_b,
           BEGIN OF ty_m,
             ekorg TYPE lfm1-ekorg,
             sperm TYPE lfm1-sperm,
             loevm TYPE lfm1-loevm,
           END OF ty_m.
    DATA: lv_lifnr TYPE lfa1-lifnr,
          lv_bukrs TYPE lfb1-bukrs,
          ls_lvl   TYPE ty_lvl,
          ls_b     TYPE ty_b,
          lt_b     TYPE STANDARD TABLE OF ty_b,
          ls_m     TYPE ty_m,
          lt_m     TYPE STANDARD TABLE OF ty_m,
          lv_row   TYPE i,
          lv_block TYPE string,
          lv_text  TYPE string.

    IF is_params-lifnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lifnr is required (vendor number)'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_lifnr = to_upper( is_params-lifnr ).
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_lifnr
      IMPORTING output = lv_lifnr.
    SELECT SINGLE sperr sperm loevm FROM lfa1 INTO (ls_lvl-sperr, ls_lvl-sperm, ls_lvl-loevm)
      WHERE lifnr = lv_lifnr.
    IF sy-subrc <> 0.
      lv_text = |Vendor { is_params-lifnr } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    ls_lvl-level = 'GENERAL'.
    lv_row = 1.
    add_rows( EXPORTING is_data = ls_lvl iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    IF ls_lvl-sperr IS NOT INITIAL.
      lv_block = |{ lv_block }; posting block in all company codes|.
    ENDIF.
    IF ls_lvl-sperm IS NOT INITIAL.
      lv_block = |{ lv_block }; purchasing block in all purchasing organizations|.
    ENDIF.
    IF ls_lvl-loevm IS NOT INITIAL.
      lv_block = |{ lv_block }; central deletion flag|.
    ENDIF.

    lv_bukrs = to_upper( is_params-bukrs ).
    IF lv_bukrs IS INITIAL.
      SELECT bukrs sperr loevm zahls FROM lfb1 INTO TABLE lt_b WHERE lifnr = lv_lifnr.
    ELSE.
      SELECT bukrs sperr loevm zahls FROM lfb1 INTO TABLE lt_b WHERE lifnr = lv_lifnr AND bukrs = lv_bukrs.
      IF sy-subrc <> 0.
        lv_text = |Vendor { is_params-lifnr } is not created in company code { lv_bukrs }|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDIF.
    ENDIF.
    LOOP AT lt_b INTO ls_b.
      AUTHORITY-CHECK OBJECT 'F_LFA1_BUK' ID 'BUKRS' FIELD ls_b-bukrs ID 'ACTVT' FIELD '03'.
      IF sy-subrc <> 0.
        rs_result-hidden_no_auth = rs_result-hidden_no_auth + 1.
        CONTINUE.
      ENDIF.
      CLEAR ls_lvl.
      ls_lvl-level = |COMPANY CODE { ls_b-bukrs }|.
      ls_lvl-sperr = ls_b-sperr.
      ls_lvl-loevm = ls_b-loevm.
      ls_lvl-zahls = ls_b-zahls.
      lv_row = lv_row + 1.
      add_rows( EXPORTING is_data = ls_lvl iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
      IF ls_b-sperr IS NOT INITIAL.
        lv_block = |{ lv_block }; posting block in company code { ls_b-bukrs }|.
      ENDIF.
      IF ls_b-zahls IS NOT INITIAL.
        lv_block = |{ lv_block }; payment block { ls_b-zahls } in company code { ls_b-bukrs }|.
      ENDIF.
      IF ls_b-loevm IS NOT INITIAL.
        lv_block = |{ lv_block }; deletion flag in company code { ls_b-bukrs }|.
      ENDIF.
    ENDLOOP.

    SELECT ekorg sperm loevm FROM lfm1 INTO TABLE lt_m WHERE lifnr = lv_lifnr.
    LOOP AT lt_m INTO ls_m.
      CLEAR ls_lvl.
      ls_lvl-level = |PURCHASING ORG { ls_m-ekorg }|.
      ls_lvl-sperm = ls_m-sperm.
      ls_lvl-loevm = ls_m-loevm.
      lv_row = lv_row + 1.
      add_rows( EXPORTING is_data = ls_lvl iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
      IF ls_m-sperm IS NOT INITIAL.
        lv_block = |{ lv_block }; purchasing block in purchasing organization { ls_m-ekorg }|.
      ENDIF.
      IF ls_m-loevm IS NOT INITIAL.
        lv_block = |{ lv_block }; deletion flag in purchasing organization { ls_m-ekorg }|.
      ENDIF.
    ENDLOOP.

    IF lv_block IS INITIAL.
      rs_result-summary = |Vendor { is_params-lifnr }: no posting, purchasing or payment block|.
    ELSE.
      SHIFT lv_block LEFT BY 2 PLACES.
      rs_result-summary = |Vendor { is_params-lifnr }: { lv_block }|.
    ENDIF.
  ENDMETHOD.


  METHOD mm_period.
    TYPES: BEGIN OF ty_p,
             lfgja TYPE marv-lfgja,
             lfmon TYPE marv-lfmon,
             vmgja TYPE marv-vmgja,
             vmmon TYPE marv-vmmon,
             xruem TYPE marv-xruem,
             xruev TYPE marv-xruev,
           END OF ty_p.
    DATA: lv_bukrs TYPE marv-bukrs,
          ls_p     TYPE ty_p,
          lv_prev  TYPE string,
          lv_text  TYPE string.

    lv_bukrs = to_upper( is_params-bukrs ).
    IF lv_bukrs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code)'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE lfgja lfmon vmgja vmmon xruem xruev FROM marv INTO ls_p WHERE bukrs = lv_bukrs.
    IF sy-subrc <> 0.
      lv_text = |Company code { lv_bukrs } has no MM period (MARV)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    add_rows( EXPORTING is_data = ls_p iv_row = 1 CHANGING ct_rows = rs_result-rows ).
    IF ls_p-xruem IS INITIAL.
      lv_prev = 'not allowed'.
    ELSE.
      lv_prev = 'allowed'.
    ENDIF.
    rs_result-summary = |MM period of company code { lv_bukrs }: current { ls_p-lfmon }/{ ls_p-lfgja }, |
                     && |previous { ls_p-vmmon }/{ ls_p-vmgja }; goods movements into the previous period { lv_prev }. |
                     && |Other periods are closed (M7 053)|.
  ENDMETHOD.


  METHOD stock_get.
    TYPES: BEGIN OF ty_s,
             werks TYPE mard-werks,
             lgort TYPE mard-lgort,
             labst TYPE mard-labst,
             insme TYPE mard-insme,
             speme TYPE mard-speme,
             umlme TYPE mard-umlme,
             einme TYPE mard-einme,
             retme TYPE mard-retme,
             meins TYPE mara-meins,
           END OF ty_s.
    DATA: lv_matnr TYPE mara-matnr,
          lv_werks TYPE mard-werks,
          lv_lgort TYPE mard-lgort,
          lv_meins TYPE mara-meins,
          ls_s     TYPE ty_s,
          lt_s     TYPE STANDARD TABLE OF ty_s,
          lv_row   TYPE i,
          lv_sum   TYPE mard-labst,
          lv_n     TYPE i,
          lv_text  TYPE string.

    IF is_params-matnr IS INITIAL OR is_params-werks IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr and werks are required (material, plant)'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_matnr = to_matnr( is_params-matnr ).
    lv_werks = to_upper( is_params-werks ).
    lv_lgort = to_upper( is_params-lgort ).
    SELECT SINGLE meins FROM mara INTO lv_meins WHERE matnr = lv_matnr.
    IF sy-subrc <> 0.
      lv_text = |Material { is_params-matnr } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'ACTVT' FIELD '03' ID 'WERKS' FIELD lv_werks.
    IF sy-subrc <> 0.
      lv_text = |No authorization to display materials of plant { lv_werks }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_lgort IS INITIAL.
      SELECT werks lgort labst insme speme umlme einme retme FROM mard INTO TABLE lt_s
        WHERE matnr = lv_matnr AND werks = lv_werks AND lvorm = space.
    ELSE.
      SELECT werks lgort labst insme speme umlme einme retme FROM mard INTO TABLE lt_s
        WHERE matnr = lv_matnr AND werks = lv_werks AND lgort = lv_lgort AND lvorm = space.
    ENDIF.
    LOOP AT lt_s INTO ls_s.
      ls_s-meins = lv_meins.
      lv_row = lv_row + 1.
      add_rows( EXPORTING is_data = ls_s iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
      lv_sum = lv_sum + ls_s-labst.
    ENDLOOP.
    lv_n = lines( lt_s ).
    IF lv_n = 0.
      lv_text = |Material { is_params-matnr } has no storage location data in plant { lv_werks }|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |Material { is_params-matnr }, plant { lv_werks }: { lv_n } storage locations, |
                     && |unrestricted { lv_sum } { lv_meins } (quality inspection, blocked and transfer stock per row)|.
  ENDMETHOD.


  METHOD iv_blocked.
    " Supplier invoices blocked for payment by invoice verification (RBKP-ZLSPR = R): release in MRBR.
    TYPES: BEGIN OF ty_i,
             belnr TYPE rbkp-belnr,
             gjahr TYPE rbkp-gjahr,
             bukrs TYPE rbkp-bukrs,
             lifnr TYPE rbkp-lifnr,
             budat TYPE rbkp-budat,
             rmwwr TYPE rbkp-rmwwr,
             waers TYPE rbkp-waers,
             zlspr TYPE rbkp-zlspr,
           END OF ty_i.
    DATA: lv_bukrs TYPE rbkp-bukrs,
          lv_lifnr TYPE rbkp-lifnr,
          lr_lifnr TYPE RANGE OF rbkp-lifnr,
          ls_r     LIKE LINE OF lr_lifnr,
          ls_i     TYPE ty_i,
          lt_i     TYPE STANDARD TABLE OF ty_i,
          lv_max   TYPE i VALUE 200,
          lv_row   TYPE i,
          lv_n     TYPE i,
          lv_text  TYPE string.

    lv_bukrs = to_upper( is_params-bukrs ).
    IF lv_bukrs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code)'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD lv_bukrs ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      lv_text = |No authorization to display documents of company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-max_rows IS NOT INITIAL AND is_params-max_rows CO '0123456789'.
      lv_max = is_params-max_rows.
      IF lv_max > 1000 OR lv_max < 1.
        lv_max = 1000.
      ENDIF.
    ENDIF.
    IF is_params-lifnr IS NOT INITIAL.
      lv_lifnr = to_upper( is_params-lifnr ).
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_lifnr
        IMPORTING output = lv_lifnr.
      ls_r-sign = 'I'. ls_r-option = 'EQ'. ls_r-low = lv_lifnr.
      APPEND ls_r TO lr_lifnr.
    ENDIF.
    SELECT belnr gjahr bukrs lifnr budat rmwwr waers zlspr FROM rbkp INTO TABLE lt_i UP TO lv_max ROWS
      WHERE bukrs = lv_bukrs AND rbstat = '5' AND zlspr = 'R' AND stblg = space AND lifnr IN lr_lifnr
      ORDER BY PRIMARY KEY.
    LOOP AT lt_i INTO ls_i.
      lv_row = lv_row + 1.
      add_rows( EXPORTING is_data = ls_i iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_n = lines( lt_i ).
    IF lv_n >= lv_max.
      rs_result-truncated = abap_true.
    ENDIF.
    rs_result-summary = |{ lv_n } posted supplier invoices of company code { lv_bukrs } are blocked for payment |
                     && |by invoice verification (payment block R). The block is released in MRBR when the |
                     && |blocking reason (price, quantity, date) is cleared, or manually|.
  ENDMETHOD.


  METHOD to_matnr.
    DATA lv_in TYPE mara-matnr.

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
