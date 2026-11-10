CLASS zcl_mcp_biz_ewm DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Business actions on embedded EWM (configs/EWM/actions.json). S/4HANA only: the class reads
* /SCWM/* and /SCDL/* tables and is installed only where EWM runs. Queries only, no writes.
*
* Queries  EWM.WHS.LIST (/SCWM/T300, T300T, TMAPWHNUM, T320)
*          EWM.WT.LIST_OPEN / GET_DETAIL / LIST_CONFIRMED (/SCWM/ORDIM_O, /SCWM/ORDIM_C)
*          EWM.WO.GET_DETAIL (/SCWM/WHO), EWM.BIN.GET_DETAIL / LIST_EMPTY / LIST_BLOCKED (/SCWM/LAGP)
*          EWM.STOCK.BY_PRODUCT / BY_BIN (/SCWM/AQUA), EWM.HU.GET_DETAIL (/SCWM/HUHDR + AQUA)
*          EWM.DLV.WAREHOUSE_STATUS / LIST_OPEN (/SCDL/DB_REFDOC, DB_PROCH_O/I, DB_PROCI_O/I)
* Products: MARA-SCM_MATID_GUID16 maps the EWM product GUID to the material number.
* Authorization: an EWM authorization for the warehouse number, fail closed: warehouse monitor
* (/SCWM/MO) or warehouse request processing (/SCWM/DLV2); other fields DUMMY.
* No person names are returned (creator / confirmer / processor fields are left out).

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    TYPES ty_r_lgtyp TYPE RANGE OF /scwm/lgtyp.
    " Initial item GUID: header rows of /SCDL/DB_REFDOC.
    CLASS-DATA gv_noitem TYPE /scdl/db_refdoc-itemid.

    METHODS wh_auth
      IMPORTING iv_lgnum     TYPE /scwm/lgnum
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS check_wh
      IMPORTING iv_lgnum  TYPE string
      EXPORTING ev_lgnum  TYPE /scwm/lgnum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS product_id
      IMPORTING iv_matnr  TYPE string
      EXPORTING ev_matid  TYPE /scwm/ordim_o-matid
                ev_matnr  TYPE matnr
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS product_no
      IMPORTING iv_matid        TYPE /scwm/ordim_o-matid
      RETURNING VALUE(rv_matnr) TYPE string.

    METHODS lgtyp_range
      IMPORTING iv_lgtyp        TYPE string
      RETURNING VALUE(rt_range) TYPE ty_r_lgtyp.

    METHODS max_rows
      IMPORTING iv_text       TYPE string
      RETURNING VALUE(rv_max) TYPE i.

    METHODS to_date
      IMPORTING iv_text  TYPE string
      EXPORTING ev_date  TYPE d
                ev_ok    TYPE abap_bool.

    METHODS ts_date
      IMPORTING iv_ts          TYPE timestamp
      RETURNING VALUE(rv_text) TYPE string.

    METHODS qty
      IMPORTING iv_qty         TYPE any
      RETURNING VALUE(rv_text) TYPE string.

    METHODS wt_status
      IMPORTING iv_tostat      TYPE /scwm/ordim_o-tostat
      RETURNING VALUE(rv_text) TYPE string.

    METHODS dlv_status
      IMPORTING iv_value       TYPE any
      RETURNING VALUE(rv_text) TYPE string.

    METHODS erp_delivery
      IMPORTING iv_vbeln  TYPE string
      EXPORTING ev_docid  TYPE /scdl/db_refdoc-docid
                ev_doccat TYPE /scdl/db_refdoc-doccat
                ev_vbeln  TYPE vbeln_vl
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS whs_list      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS wt_list_open  IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS wt_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS wt_list_conf  IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS wo_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS bin_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS bin_list
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_blocked       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS stock_by_product IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS stock_by_bin  IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS hu_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_status_of IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_kv
      IMPORTING iv_row   TYPE i
                iv_name  TYPE string
                iv_value TYPE any
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.

    METHODS add_msg
      IMPORTING iv_type   TYPE symsgty
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.



CLASS zcl_mcp_biz_ewm IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/EWM/actions.json.
    ls_def-kind = 'query'. ls_def-risk = 'none'.
    ls_def-id = 'EWM.WHS.LIST'.             APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.WT.LIST_OPEN'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.WT.GET_DETAIL'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.WT.LIST_CONFIRMED'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.WO.GET_DETAIL'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.BIN.GET_DETAIL'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.BIN.LIST_EMPTY'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.BIN.LIST_BLOCKED'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.STOCK.BY_PRODUCT'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.STOCK.BY_BIN'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.HU.GET_DETAIL'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.DLV.WAREHOUSE_STATUS'. APPEND ls_def TO rt_actions.
    ls_def-id = 'EWM.DLV.LIST_OPEN'.        APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    CASE iv_action.
      WHEN 'EWM.WHS.LIST'.
        rs_result = whs_list( is_params ).
      WHEN 'EWM.WT.LIST_OPEN'.
        rs_result = wt_list_open( is_params ).
      WHEN 'EWM.WT.GET_DETAIL'.
        rs_result = wt_get_detail( is_params ).
      WHEN 'EWM.WT.LIST_CONFIRMED'.
        rs_result = wt_list_conf( is_params ).
      WHEN 'EWM.WO.GET_DETAIL'.
        rs_result = wo_get_detail( is_params ).
      WHEN 'EWM.BIN.GET_DETAIL'.
        rs_result = bin_get_detail( is_params ).
      WHEN 'EWM.BIN.LIST_EMPTY'.
        rs_result = bin_list( is_params = is_params iv_blocked = abap_false ).
      WHEN 'EWM.BIN.LIST_BLOCKED'.
        rs_result = bin_list( is_params = is_params iv_blocked = abap_true ).
      WHEN 'EWM.STOCK.BY_PRODUCT'.
        rs_result = stock_by_product( is_params ).
      WHEN 'EWM.STOCK.BY_BIN'.
        rs_result = stock_by_bin( is_params ).
      WHEN 'EWM.HU.GET_DETAIL'.
        rs_result = hu_get_detail( is_params ).
      WHEN 'EWM.DLV.WAREHOUSE_STATUS'.
        rs_result = dlv_status_of( is_params ).
      WHEN 'EWM.DLV.LIST_OPEN'.
        rs_result = dlv_list_open( is_params ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a query action|
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    rs_result-action = iv_action.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    rs_result-action = iv_action.
    rs_result-mode = 'PREVIEW'.
    add_msg( EXPORTING iv_type = 'E' iv_text = 'EWM actions are queries only: nothing to preview or execute'
             CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    rs_result-action = iv_action.
    rs_result-mode = 'EXECUTE'.
    add_msg( EXPORTING iv_type = 'E' iv_text = 'EWM actions are queries only: nothing to preview or execute'
             CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD check_wh.
    DATA lv_in TYPE string.

    CLEAR ev_lgnum.
    lv_in = to_upper( condense( iv_lgnum ) ).
    IF lv_in IS INITIAL OR strlen( lv_in ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lgnum is required (EWM warehouse number, up to 4 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE lgnum FROM /scwm/t300 WHERE lgnum = @lv_in INTO @DATA(lv_t300).
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |EWM warehouse { lv_in } does not exist|
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF wh_auth( lv_t300 ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization for EWM warehouse { lv_in } (/SCWM/MO or /SCWM/DLV2)|
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_lgnum = lv_t300.
  ENDMETHOD.


  METHOD wh_auth.
    AUTHORITY-CHECK OBJECT '/SCWM/MO' ID '/SCWM/LGNU' FIELD iv_lgnum ID '/SCWM/MONI' DUMMY
                                      ID '/SCWM/OBCL' DUMMY ID '/SCWM/METH' DUMMY.
    IF sy-subrc = 0.
      rv_ok = abap_true.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT '/SCWM/DLV2' ID '/SCWM/LGNU' FIELD iv_lgnum ID '/SCWM/ENTL' DUMMY
                                        ID '/SCWM/ORG' DUMMY ID '/SCDL/CAT' DUMMY.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD product_id.
    DATA lv_matnr TYPE matnr.

    CLEAR: ev_matid, ev_matnr.
    IF iv_matnr IS INITIAL OR strlen( condense( iv_matnr ) ) > 40.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr is required (product number, up to 40 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_matnr = to_upper( condense( iv_matnr ) ).
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
      EXPORTING
        input        = lv_matnr
      IMPORTING
        output       = lv_matnr
      EXCEPTIONS
        length_error = 1
        OTHERS       = 2.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Product { iv_matnr } is not a valid number|
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE matnr, scm_matid_guid16 FROM mara WHERE matnr = @lv_matnr INTO @DATA(ls_mara).
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Product { iv_matnr } does not exist|
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_mara-scm_matid_guid16 IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Product { iv_matnr } is not known to EWM (no product GUID)|
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_matid = ls_mara-scm_matid_guid16.
    ev_matnr = ls_mara-matnr.
  ENDMETHOD.


  METHOD product_no.
    DATA lv_matnr TYPE matnr.

    IF iv_matid IS INITIAL.
      RETURN.
    ENDIF.
    SELECT SINGLE matnr FROM mara WHERE scm_matid_guid16 = @iv_matid INTO @lv_matnr.
    IF sy-subrc = 0.
      rv_matnr = |{ condense( |{ lv_matnr ALPHA = OUT }| ) }|.
    ENDIF.
  ENDMETHOD.


  METHOD lgtyp_range.
    DATA lv_in TYPE string.

    lv_in = to_upper( condense( iv_lgtyp ) ).
    IF lv_in IS INITIAL.
      RETURN.
    ENDIF.
    IF lv_in CA '*+'.
      APPEND VALUE #( sign = 'I' option = 'CP' low = lv_in ) TO rt_range.
    ELSE.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_in ) TO rt_range.
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


  METHOD to_date.
    DATA lv_in TYPE string.

    CLEAR: ev_date, ev_ok.
    lv_in = condense( iv_text ).
    REPLACE ALL OCCURRENCES OF '-' IN lv_in WITH ''.
    IF strlen( lv_in ) <> 8 OR lv_in CN '0123456789'.
      RETURN.
    ENDIF.
    ev_date = lv_in.
    CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'
      EXPORTING
        date                      = ev_date
      EXCEPTIONS
        plausibility_check_failed = 1
        OTHERS                    = 2.
    IF sy-subrc = 0.
      ev_ok = abap_true.
    ELSE.
      CLEAR ev_date.
    ENDIF.
  ENDMETHOD.


  METHOD ts_date.
    DATA: lv_d TYPE d,
          lv_t TYPE t.

    IF iv_ts IS INITIAL.
      RETURN.
    ENDIF.
    CONVERT TIME STAMP iv_ts TIME ZONE 'UTC' INTO DATE lv_d TIME lv_t.
    rv_text = |{ lv_d+0(4) }-{ lv_d+4(2) }-{ lv_d+6(2) }|.
  ENDMETHOD.


  METHOD qty.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 3.

    lv_p = iv_qty.
    rv_text = |{ lv_p NUMBER = RAW }|.
    IF rv_text CS '.'.
      SHIFT rv_text RIGHT DELETING TRAILING '0'.
      SHIFT rv_text RIGHT DELETING TRAILING '.'.
      CONDENSE rv_text.
    ENDIF.
  ENDMETHOD.


  METHOD wt_status.
    CASE iv_tostat.
      WHEN space. rv_text = 'open'.
      WHEN 'B'.   rv_text = 'waiting'.
      WHEN 'C'.   rv_text = 'confirmed'.
      WHEN 'A'.   rv_text = 'cancelled'.
      WHEN OTHERS. rv_text = |status { iv_tostat }|.
    ENDCASE.
  ENDMETHOD.


  METHOD dlv_status.
    DATA lv_v TYPE c LENGTH 1.

    lv_v = iv_value.
    CASE lv_v.
      WHEN '0' OR space. rv_text = 'not relevant'.
      WHEN '1'.          rv_text = 'not started'.
      WHEN '2'.          rv_text = 'partly done'.
      WHEN '9'.          rv_text = 'completed'.
      WHEN OTHERS.       rv_text = |status { lv_v }|.
    ENDCASE.
  ENDMETHOD.


  METHOD erp_delivery.
    DATA lv_vbeln TYPE vbeln_vl.

    CLEAR: ev_docid, ev_doccat, ev_vbeln.
    IF iv_vbeln IS INITIAL OR condense( iv_vbeln ) CN '0123456789' OR strlen( condense( iv_vbeln ) ) > 10.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (delivery number, digits, up to 10)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_vbeln = |{ CONV vbeln_vl( condense( iv_vbeln ) ) ALPHA = IN }|.
    SELECT docid, doccat FROM /scdl/db_refdoc
      WHERE refdoccat = 'ERP' AND refdocno = @lv_vbeln AND itemid = @gv_noitem
        AND doccat IN ( 'PDO', 'PDI' )
      INTO TABLE @DATA(lt_ref) UP TO 1 ROWS.
    READ TABLE lt_ref INTO DATA(ls_ref) INDEX 1.
    IF sy-subrc <> 0.
      SELECT SINGLE vbeln FROM likp WHERE vbeln = @lv_vbeln INTO @DATA(lv_likp).
      IF sy-subrc = 0.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = |Delivery { iv_vbeln } is not handled by EWM (no warehouse request)|
                 CHANGING cs_result = cs_result ).
      ELSE.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Delivery { iv_vbeln } not found|
                 CHANGING cs_result = cs_result ).
      ENDIF.
      RETURN.
    ENDIF.
    ev_docid = ls_ref-docid.
    ev_doccat = ls_ref-doccat.
    ev_vbeln = lv_vbeln.
  ENDMETHOD.


  METHOD whs_list.
    DATA: lv_row   TYPE i,
          lv_werks TYPE werks_d,
          lv_text  TYPE string,
          lv_plnts TYPE string,
          lv_erp   TYPE /scwm/tmapwhnum-whnumerp.

    IF is_params-werks IS NOT INITIAL.
      lv_werks = to_upper( condense( is_params-werks ) ).
    ENDIF.
    SELECT t~lgnum, x~lnumt FROM /scwm/t300 AS t
      LEFT OUTER JOIN /scwm/t300t AS x ON x~lgnum = t~lgnum AND x~spras = @sy-langu
      ORDER BY t~lgnum INTO TABLE @DATA(lt_wh).
    SELECT whnumerp, whnumwme FROM /scwm/tmapwhnum INTO TABLE @DATA(lt_map).
    SELECT werks, lgort, lgnum FROM t320 INTO TABLE @DATA(lt_t320).

    LOOP AT lt_wh INTO DATA(ls_wh).
      IF is_params-lgnum IS NOT INITIAL AND ls_wh-lgnum <> to_upper( condense( is_params-lgnum ) ).
        CONTINUE.
      ENDIF.
      CLEAR lv_plnts.
      CLEAR lv_erp.
      LOOP AT lt_map INTO DATA(ls_map) WHERE whnumwme = ls_wh-lgnum.
        lv_erp = ls_map-whnumerp.
        LOOP AT lt_t320 INTO DATA(ls_320) WHERE lgnum = ls_map-whnumerp.
          IF lv_plnts NS ls_320-werks.
            lv_plnts = COND #( WHEN lv_plnts IS INITIAL THEN ls_320-werks ELSE |{ lv_plnts } { ls_320-werks }| ).
          ENDIF.
        ENDLOOP.
        EXIT.
      ENDLOOP.
      IF lv_werks IS NOT INITIAL AND lv_plnts NS lv_werks.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WAREHOUSE' iv_value = ls_wh-lgnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT' iv_value = ls_wh-lnumt CHANGING ct_rows = rs_result-rows ).
      IF lv_erp IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'ERP_WAREHOUSE' iv_value = lv_erp CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF lv_plnts IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANTS' iv_value = lv_plnts CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    lv_text = |{ lv_row } EWM warehouses|.
    IF lv_werks IS NOT INITIAL.
      lv_text = |{ lv_text } for plant { lv_werks }|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD wt_list_open.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_matid TYPE /scwm/ordim_o-matid,
          lv_matnr TYPE matnr,
          lv_docid TYPE /scdl/db_refdoc-docid,
          lv_dcat  TYPE /scdl/db_refdoc-doccat,
          lv_vbeln TYPE vbeln_vl,
          lv_who   TYPE /scwm/ordim_o-who,
          lr_lgtyp TYPE ty_r_lgtyp,
          lr_matid TYPE RANGE OF /scwm/ordim_o-matid,
          lr_docid TYPE RANGE OF /scwm/ordim_o-rdocid,
          lr_who   TYPE RANGE OF /scwm/ordim_o-who,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_n     TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-matnr IS NOT INITIAL.
      product_id( EXPORTING iv_matnr = is_params-matnr IMPORTING ev_matid = lv_matid ev_matnr = lv_matnr
                  CHANGING cs_result = rs_result ).
      IF lv_matid IS INITIAL.
        RETURN.
      ENDIF.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_matid ) TO lr_matid.
    ENDIF.
    IF is_params-vbeln IS NOT INITIAL.
      erp_delivery( EXPORTING iv_vbeln = is_params-vbeln IMPORTING ev_docid = lv_docid ev_doccat = lv_dcat ev_vbeln = lv_vbeln
                    CHANGING cs_result = rs_result ).
      IF lv_docid IS INITIAL.
        RETURN.
      ENDIF.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_docid ) TO lr_docid.
    ENDIF.
    IF is_params-who IS NOT INITIAL.
      IF condense( is_params-who ) CN '0123456789' OR strlen( condense( is_params-who ) ) > 10.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'who must be a warehouse order number (digits, up to 10)'
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_who = |{ condense( is_params-who ) ALPHA = IN }|.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_who ) TO lr_who.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).

    SELECT tanum, procty, tostat, created_at, matid, vsolm, meins, vltyp, vlpla, nltyp, nlpla, vlenr, nlenr, who, rdoccat
      FROM /scwm/ordim_o
      WHERE lgnum = @lv_lgnum AND matid IN @lr_matid AND rdocid IN @lr_docid AND who IN @lr_who
      ORDER BY created_at DESCENDING, tanum DESCENDING
      INTO TABLE @DATA(lt_wt) UP TO 5000 ROWS.
    IF lr_lgtyp IS NOT INITIAL.
      DELETE lt_wt WHERE NOT ( vltyp IN lr_lgtyp OR nltyp IN lr_lgtyp ).
    ENDIF.
    lv_n = lines( lt_wt ).
    LOOP AT lt_wt INTO DATA(ls_wt).
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WT' iv_value = |{ condense( |{ ls_wt-tanum ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PROCESS_TYPE' iv_value = ls_wt-procty CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = wt_status( ls_wt-tostat ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED' iv_value = ts_date( ls_wt-created_at ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = product_no( ls_wt-matid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_wt-vsolm ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_wt-meins CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FROM' iv_value = |{ ls_wt-vltyp } { ls_wt-vlpla }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO' iv_value = |{ ls_wt-nltyp } { ls_wt-nlpla }| CHANGING ct_rows = rs_result-rows ).
      IF ls_wt-vlenr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'HU' iv_value = |{ condense( |{ ls_wt-vlenr ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_wt-who IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'WAREHOUSE_ORDER' iv_value = |{ condense( |{ ls_wt-who ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.

    lv_text = |Warehouse { lv_lgnum }: { lv_n } open warehouse tasks|.
    IF lv_vbeln IS NOT INITIAL.
      lv_text = |{ lv_text } of delivery { condense( |{ lv_vbeln ALPHA = OUT }| ) }|.
    ENDIF.
    IF lv_matnr IS NOT INITIAL.
      lv_text = |{ lv_text } for product { condense( |{ lv_matnr ALPHA = OUT }| ) }|.
    ENDIF.
    IF lr_lgtyp IS NOT INITIAL.
      lv_text = |{ lv_text } touching storage type { to_upper( is_params-lgtyp ) }|.
    ENDIF.
    IF lv_who IS NOT INITIAL.
      lv_text = |{ lv_text } in warehouse order { condense( |{ lv_who ALPHA = OUT }| ) }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD wt_get_detail.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_tanum TYPE /scwm/ordim_o-tanum,
          lv_row   TYPE i.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-tanum IS INITIAL OR condense( is_params-tanum ) CN '0123456789' OR strlen( condense( is_params-tanum ) ) > 12.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tanum is required (warehouse task number, digits, up to 12)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_tanum = |{ condense( is_params-tanum ) ALPHA = IN }|.

    SELECT SINGLE tanum, procty, trart, tostat, created_at, matid, cat, charg, vsolm, meins, vltyp, vlpla, vlenr,
                  nltyp, nlpla, nlenr, who, rdoccat, rdocid, act_type
      FROM /scwm/ordim_o WHERE lgnum = @lv_lgnum AND tanum = @lv_tanum INTO @DATA(ls_o).
    IF sy-subrc = 0.
      lv_row = 1.
      add_kv( EXPORTING iv_row = 1 iv_name = 'WT' iv_value = |{ condense( |{ ls_o-tanum ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS' iv_value = wt_status( ls_o-tostat ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'PROCESS_TYPE' iv_value = ls_o-procty CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'ACTIVITY' iv_value = ls_o-act_type CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'CREATED' iv_value = ts_date( ls_o-created_at ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'PRODUCT' iv_value = product_no( ls_o-matid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'STOCK_TYPE' iv_value = ls_o-cat CHANGING ct_rows = rs_result-rows ).
      IF ls_o-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = 1 iv_name = 'BATCH' iv_value = ls_o-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = 1 iv_name = 'QUANTITY' iv_value = qty( ls_o-vsolm ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'UNIT' iv_value = ls_o-meins CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'FROM' iv_value = |{ ls_o-vltyp } { ls_o-vlpla }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'TO' iv_value = |{ ls_o-nltyp } { ls_o-nlpla }| CHANGING ct_rows = rs_result-rows ).
      IF ls_o-vlenr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = 1 iv_name = 'SOURCE_HU' iv_value = |{ condense( |{ ls_o-vlenr ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_o-nlenr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = 1 iv_name = 'DEST_HU' iv_value = |{ condense( |{ ls_o-nlenr ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_o-who IS NOT INITIAL.
        add_kv( EXPORTING iv_row = 1 iv_name = 'WAREHOUSE_ORDER' iv_value = |{ condense( |{ ls_o-who ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_o-rdocid IS NOT INITIAL.
        SELECT SINGLE refdocno FROM /scdl/db_refdoc
          WHERE docid = @ls_o-rdocid AND refdoccat = 'ERP' AND itemid = @gv_noitem
          INTO @DATA(lv_ref).
        IF sy-subrc = 0.
          add_kv( EXPORTING iv_row = 1 iv_name = 'DELIVERY' iv_value = |{ condense( |{ lv_ref ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
        ENDIF.
      ENDIF.
      rs_result-summary = |Warehouse task { condense( |{ ls_o-tanum ALPHA = OUT }| ) } in warehouse { lv_lgnum }: { wt_status( ls_o-tostat ) }, | &&
                          |{ qty( ls_o-vsolm ) } { ls_o-meins } from { ls_o-vlpla } to { ls_o-nlpla }|.
      RETURN.
    ENDIF.

    SELECT tapos, procty, tostat, confirmed_at, matid, cat, charg, vsolm, nista, meins, vltyp, vlpla, nltyp, nlpla, who
      FROM /scwm/ordim_c WHERE lgnum = @lv_lgnum AND tanum = @lv_tanum
      ORDER BY tapos INTO TABLE @DATA(lt_c).
    IF lt_c IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Warehouse task { is_params-tanum } not found in warehouse { lv_lgnum }|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    LOOP AT lt_c INTO DATA(ls_c).
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WT' iv_value = |{ condense( |{ lv_tanum ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM' iv_value = ls_c-tapos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = wt_status( ls_c-tostat ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PROCESS_TYPE' iv_value = ls_c-procty CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CONFIRMED' iv_value = ts_date( ls_c-confirmed_at ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = product_no( ls_c-matid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_TYPE' iv_value = ls_c-cat CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TARGET_QTY' iv_value = qty( ls_c-vsolm ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ACTUAL_QTY' iv_value = qty( ls_c-nista ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_c-meins CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FROM' iv_value = |{ ls_c-vltyp } { ls_c-vlpla }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO' iv_value = |{ ls_c-nltyp } { ls_c-nlpla }| CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    READ TABLE lt_c INTO ls_c INDEX 1.
    rs_result-summary = |Warehouse task { condense( |{ lv_tanum ALPHA = OUT }| ) } in warehouse { lv_lgnum }: { wt_status( ls_c-tostat ) } | &&
                        |on { ts_date( ls_c-confirmed_at ) }, { lv_row } item(s)|.
  ENDMETHOD.


  METHOD wt_list_conf.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_from  TYPE d,
          lv_to    TYPE d,
          lv_ok    TYPE abap_bool,
          lv_tsf   TYPE timestamp,
          lv_tst   TYPE timestamp,
          lv_matid TYPE /scwm/ordim_o-matid,
          lv_matnr TYPE matnr,
          lr_matid TYPE RANGE OF /scwm/ordim_o-matid,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_n     TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    to_date( EXPORTING iv_text = is_params-date_from IMPORTING ev_date = lv_from ev_ok = lv_ok ).
    IF lv_ok = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'date_from is required (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-date_to IS INITIAL.
      lv_to = sy-datum.
    ELSE.
      to_date( EXPORTING iv_text = is_params-date_to IMPORTING ev_date = lv_to ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_to must be a valid date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_to < lv_from.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'date_to is before date_from' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-matnr IS NOT INITIAL.
      product_id( EXPORTING iv_matnr = is_params-matnr IMPORTING ev_matid = lv_matid ev_matnr = lv_matnr
                  CHANGING cs_result = rs_result ).
      IF lv_matid IS INITIAL.
        RETURN.
      ENDIF.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_matid ) TO lr_matid.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    CONVERT DATE lv_from TIME '000000' INTO TIME STAMP lv_tsf TIME ZONE 'UTC'.
    CONVERT DATE lv_to TIME '235959' INTO TIME STAMP lv_tst TIME ZONE 'UTC'.

    SELECT tanum, tapos, procty, confirmed_at, matid, nista, meins, vltyp, vlpla, nltyp, nlpla
      FROM /scwm/ordim_c
      WHERE lgnum = @lv_lgnum AND tostat = 'C' AND confirmed_at BETWEEN @lv_tsf AND @lv_tst AND matid IN @lr_matid
      ORDER BY confirmed_at DESCENDING, tanum DESCENDING, tapos
      INTO TABLE @DATA(lt_c) UP TO 10000 ROWS.
    IF lr_lgtyp IS NOT INITIAL.
      DELETE lt_c WHERE NOT ( vltyp IN lr_lgtyp OR nltyp IN lr_lgtyp ).
    ENDIF.
    lv_n = lines( lt_c ).
    LOOP AT lt_c INTO DATA(ls_c).
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WT' iv_value = |{ condense( |{ ls_c-tanum ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM' iv_value = ls_c-tapos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CONFIRMED' iv_value = ts_date( ls_c-confirmed_at ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PROCESS_TYPE' iv_value = ls_c-procty CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = product_no( ls_c-matid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ACTUAL_QTY' iv_value = qty( ls_c-nista ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_c-meins CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FROM' iv_value = |{ ls_c-vltyp } { ls_c-vlpla }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TO' iv_value = |{ ls_c-nltyp } { ls_c-nlpla }| CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_text = |Warehouse { lv_lgnum }: { lv_n } confirmed warehouse task items from { lv_from DATE = ISO } to { lv_to DATE = ISO }|.
    IF lv_matnr IS NOT INITIAL.
      lv_text = |{ lv_text } for product { condense( |{ lv_matnr ALPHA = OUT }| ) }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD wo_get_detail.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_who   TYPE /scwm/ordim_o-who,
          lv_open  TYPE i,
          lv_conf  TYPE i,
          lv_stat  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-who IS INITIAL OR condense( is_params-who ) CN '0123456789' OR strlen( condense( is_params-who ) ) > 10.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'who is required (warehouse order number, digits, up to 10)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_who = |{ condense( is_params-who ) ALPHA = IN }|.
    SELECT SINGLE who, status, wcr, queue, areawho, created_at, confirmed_at, wave
      FROM /scwm/who WHERE lgnum = @lv_lgnum AND who = @lv_who INTO @DATA(ls_who).
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Warehouse order { is_params-who } not found in warehouse { lv_lgnum }|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT COUNT(*) FROM /scwm/ordim_o WHERE lgnum = @lv_lgnum AND who = @lv_who INTO @lv_open.
    SELECT COUNT(*) FROM /scwm/ordim_c WHERE lgnum = @lv_lgnum AND who = @lv_who AND tostat = 'C' INTO @lv_conf.
    CASE ls_who-status.
      WHEN space. lv_stat = 'open'.
      WHEN 'C'.   lv_stat = 'confirmed'.
      WHEN 'D'.   lv_stat = 'in process'.
      WHEN 'A'.   lv_stat = 'cancelled'.
      WHEN OTHERS. lv_stat = |status { ls_who-status }|.
    ENDCASE.
    add_kv( EXPORTING iv_row = 1 iv_name = 'WAREHOUSE_ORDER' iv_value = |{ condense( |{ ls_who-who ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS' iv_value = lv_stat CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CREATION_RULE' iv_value = ls_who-wcr CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'QUEUE' iv_value = ls_who-queue CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'ACTIVITY_AREA' iv_value = ls_who-areawho CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CREATED' iv_value = ts_date( ls_who-created_at ) CHANGING ct_rows = rs_result-rows ).
    IF ls_who-confirmed_at IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'CONFIRMED' iv_value = ts_date( ls_who-confirmed_at ) CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_who-wave IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'WAVE' iv_value = |{ condense( |{ ls_who-wave ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_TASKS' iv_value = lv_open CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CONFIRMED_TASKS' iv_value = lv_conf CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Warehouse order { condense( |{ ls_who-who ALPHA = OUT }| ) } in warehouse { lv_lgnum }: { lv_stat }, | &&
                        |{ lv_open } open and { lv_conf } confirmed tasks|.
  ENDMETHOD.


  METHOD bin_get_detail.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_lgpla TYPE /scwm/lgpla,
          lv_in    TYPE i,
          lv_out   TYPE i,
          lv_row   TYPE i,
          lv_stat  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-lgpla IS INITIAL OR strlen( condense( is_params-lgpla ) ) > 18.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lgpla is required (storage bin, up to 18 characters)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_lgpla = to_upper( condense( is_params-lgpla ) ).
    SELECT SINGLE lgpla, lgtyp, lgber, lptyp, kzler, skzua, skzue, skzsi, anzle, maxle, weight, max_weight, unit_w
      FROM /scwm/lagp WHERE lgnum = @lv_lgnum AND lgpla = @lv_lgpla INTO @DATA(ls_b).
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Storage bin { is_params-lgpla } not found in warehouse { lv_lgnum }|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT COUNT(*) FROM /scwm/ordim_o WHERE lgnum = @lv_lgnum AND nlpla = @lv_lgpla INTO @lv_in.
    SELECT COUNT(*) FROM /scwm/ordim_o WHERE lgnum = @lv_lgnum AND vlpla = @lv_lgpla INTO @lv_out.
    IF ls_b-kzler = abap_true.
      lv_stat = 'empty'.
    ELSE.
      lv_stat = 'occupied'.
    ENDIF.
    IF ls_b-skzue = abap_true.
      lv_stat = |{ lv_stat }, blocked for putaway|.
    ENDIF.
    IF ls_b-skzua = abap_true.
      lv_stat = |{ lv_stat }, blocked for removal|.
    ENDIF.
    IF ls_b-skzsi = abap_true.
      lv_stat = |{ lv_stat }, blocked by physical inventory|.
    ENDIF.
    lv_row = 1.
    add_kv( EXPORTING iv_row = 1 iv_name = 'BIN' iv_value = ls_b-lgpla CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STORAGE_TYPE' iv_value = ls_b-lgtyp CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'SECTION' iv_value = ls_b-lgber CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'BIN_TYPE' iv_value = ls_b-lptyp CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS' iv_value = lv_stat CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_TASKS_IN' iv_value = lv_in CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_TASKS_OUT' iv_value = lv_out CHANGING ct_rows = rs_result-rows ).

    SELECT matid, cat, charg, huident, quan, unit FROM /scwm/aqua
      WHERE lgnum = @lv_lgnum AND lgpla = @lv_lgpla INTO TABLE @DATA(lt_q) UP TO 200 ROWS.
    LOOP AT lt_q INTO DATA(ls_q).
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = product_no( ls_q-matid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_TYPE' iv_value = ls_q-cat CHANGING ct_rows = rs_result-rows ).
      IF ls_q-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_q-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_q-huident IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'HU' iv_value = |{ condense( |{ ls_q-huident ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_q-quan ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_q-unit CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-summary = |Storage bin { ls_b-lgpla } (type { ls_b-lgtyp }) in warehouse { lv_lgnum }: { lv_stat }, | &&
                        |{ lines( lt_q ) } stock lines, { lv_in } open tasks in, { lv_out } out|.
  ENDMETHOD.


  METHOD bin_list.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_n     TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    IF iv_blocked = abap_true.
      SELECT lgpla, lgtyp, lgber, kzler, skzua, skzue, skzsi FROM /scwm/lagp
        WHERE lgnum = @lv_lgnum AND lgtyp IN @lr_lgtyp
          AND ( skzua = @abap_true OR skzue = @abap_true OR skzsi = @abap_true )
        ORDER BY lgtyp, lgpla INTO TABLE @DATA(lt_b).
    ELSE.
      SELECT lgpla, lgtyp, lgber, kzler, skzua, skzue, skzsi FROM /scwm/lagp
        WHERE lgnum = @lv_lgnum AND lgtyp IN @lr_lgtyp AND kzler = @abap_true
          AND skzua = @space AND skzue = @space AND skzsi = @space
        ORDER BY lgtyp, lgpla INTO TABLE @lt_b.
    ENDIF.
    lv_n = lines( lt_b ).
    LOOP AT lt_b INTO DATA(ls_b).
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN' iv_value = ls_b-lgpla CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STORAGE_TYPE' iv_value = ls_b-lgtyp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'SECTION' iv_value = ls_b-lgber CHANGING ct_rows = rs_result-rows ).
      IF iv_blocked = abap_true.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PUTAWAY_BLOCK' iv_value = ls_b-skzue CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'REMOVAL_BLOCK' iv_value = ls_b-skzua CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'INVENTORY_BLOCK' iv_value = ls_b-skzsi CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'EMPTY' iv_value = ls_b-kzler CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    IF iv_blocked = abap_true.
      lv_text = |Warehouse { lv_lgnum }: { lv_n } blocked storage bins|.
    ELSE.
      lv_text = |Warehouse { lv_lgnum }: { lv_n } empty storage bins free for putaway|.
    ENDIF.
    IF lr_lgtyp IS NOT INITIAL.
      lv_text = |{ lv_text } in storage type { to_upper( is_params-lgtyp ) }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD stock_by_product.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_matid TYPE /scwm/ordim_o-matid,
          lv_matnr TYPE matnr,
          lr_lgnum TYPE RANGE OF /scwm/lgnum,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_sum   TYPE p LENGTH 16 DECIMALS 3,
          lv_unit  TYPE meins,
          lv_text  TYPE string.

    product_id( EXPORTING iv_matnr = is_params-matnr IMPORTING ev_matid = lv_matid ev_matnr = lv_matnr
                CHANGING cs_result = rs_result ).
    IF lv_matid IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-lgnum IS NOT INITIAL.
      check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
      IF lv_lgnum IS INITIAL.
        RETURN.
      ENDIF.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_lgnum ) TO lr_lgnum.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    SELECT lgnum, lgtyp, lgpla, huident, cat, charg, quan, unit FROM /scwm/aqua
      WHERE matid = @lv_matid AND lgnum IN @lr_lgnum AND lgtyp IN @lr_lgtyp
      ORDER BY lgnum, lgtyp, lgpla INTO TABLE @DATA(lt_q) UP TO 5000 ROWS.
    " Without a warehouse: only warehouses the user may display.
    IF lv_lgnum IS INITIAL.
      DATA(lt_whs) = lt_q.
      SORT lt_whs BY lgnum.
      DELETE ADJACENT DUPLICATES FROM lt_whs COMPARING lgnum.
      LOOP AT lt_whs INTO DATA(ls_chk).
        IF wh_auth( ls_chk-lgnum ) = abap_false.
          DELETE lt_q WHERE lgnum = ls_chk-lgnum.
          rs_result-hidden_no_auth = rs_result-hidden_no_auth + 1.
        ENDIF.
      ENDLOOP.
    ENDIF.
    LOOP AT lt_q INTO DATA(ls_q).
      lv_sum = lv_sum + ls_q-quan.
      lv_unit = ls_q-unit.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WAREHOUSE' iv_value = ls_q-lgnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STORAGE_TYPE' iv_value = ls_q-lgtyp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN' iv_value = ls_q-lgpla CHANGING ct_rows = rs_result-rows ).
      IF ls_q-huident IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'HU' iv_value = |{ condense( |{ ls_q-huident ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_TYPE' iv_value = ls_q-cat CHANGING ct_rows = rs_result-rows ).
      IF ls_q-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_q-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_q-quan ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_q-unit CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    lv_text = |Product { condense( |{ lv_matnr ALPHA = OUT }| ) }: { lines( lt_q ) } stock lines, total { qty( lv_sum ) } { lv_unit }|.
    IF lv_lgnum IS NOT INITIAL.
      lv_text = |{ lv_text } in warehouse { lv_lgnum }|.
    ENDIF.
    IF lr_lgtyp IS NOT INITIAL.
      lv_text = |{ lv_text }, storage type { to_upper( is_params-lgtyp ) }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD stock_by_bin.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lr_lgpla TYPE RANGE OF /scwm/lgpla,
          lr_lgtyp TYPE ty_r_lgtyp,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_text  TYPE string.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    IF is_params-lgpla IS INITIAL AND is_params-lgtyp IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lgpla (storage bin) or lgtyp (storage type) is required'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-lgpla IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = to_upper( condense( is_params-lgpla ) ) ) TO lr_lgpla.
    ENDIF.
    lr_lgtyp = lgtyp_range( is_params-lgtyp ).
    lv_max = max_rows( is_params-max_rows ).
    SELECT lgtyp, lgpla, matid, huident, cat, charg, quan, unit FROM /scwm/aqua
      WHERE lgnum = @lv_lgnum AND lgpla IN @lr_lgpla AND lgtyp IN @lr_lgtyp
      ORDER BY lgtyp, lgpla INTO TABLE @DATA(lt_q) UP TO 5000 ROWS.
    LOOP AT lt_q INTO DATA(ls_q).
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STORAGE_TYPE' iv_value = ls_q-lgtyp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BIN' iv_value = ls_q-lgpla CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = product_no( ls_q-matid ) CHANGING ct_rows = rs_result-rows ).
      IF ls_q-huident IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'HU' iv_value = |{ condense( |{ ls_q-huident ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_TYPE' iv_value = ls_q-cat CHANGING ct_rows = rs_result-rows ).
      IF ls_q-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_q-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_q-quan ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_q-unit CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF is_params-lgpla IS NOT INITIAL.
      lv_text = |Storage bin { to_upper( condense( is_params-lgpla ) ) } in warehouse { lv_lgnum }: { lines( lt_q ) } stock lines|.
    ELSE.
      lv_text = |Storage type { to_upper( is_params-lgtyp ) } in warehouse { lv_lgnum }: { lines( lt_q ) } stock lines|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD hu_get_detail.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_hu    TYPE /scwm/huhdr-huident,
          lr_lgnum TYPE RANGE OF /scwm/lgnum,
          lv_row   TYPE i,
          lv_where TYPE string.

    IF is_params-exidv IS INITIAL OR strlen( condense( is_params-exidv ) ) > 20.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'exidv is required (handling unit number, up to 20 characters)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-lgnum IS NOT INITIAL.
      check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
      IF lv_lgnum IS INITIAL.
        RETURN.
      ENDIF.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_lgnum ) TO lr_lgnum.
    ENDIF.
    DATA(lv_in) = to_upper( condense( is_params-exidv ) ).
    lv_hu = lv_in.
    IF lv_in CO '0123456789'.
      lv_hu = |{ lv_hu ALPHA = IN }|.
    ENDIF.
    SELECT huident, lgnum, letyp, g_weight, unit_gw, g_volume, unit_gv, copst
      FROM /scwm/huhdr WHERE huident = @lv_hu AND lgnum IN @lr_lgnum
      INTO TABLE @DATA(lt_h) UP TO 1 ROWS.
    READ TABLE lt_h INTO DATA(ls_h) INDEX 1.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Handling unit { is_params-exidv } not found|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_lgnum IS INITIAL.
      check_wh( EXPORTING iv_lgnum = CONV string( ls_h-lgnum ) IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
      IF lv_lgnum IS INITIAL.
        RETURN.
      ENDIF.
    ENDIF.
    SELECT lgtyp, lgpla, matid, cat, charg, quan, unit FROM /scwm/aqua
      WHERE lgnum = @lv_lgnum AND huident = @lv_hu INTO TABLE @DATA(lt_q) UP TO 200 ROWS.
    READ TABLE lt_q INTO DATA(ls_loc) INDEX 1.
    IF sy-subrc = 0.
      lv_where = |{ ls_loc-lgtyp } { ls_loc-lgpla }|.
    ELSE.
      lv_where = 'no stock in a bin (empty or nested HU)'.
    ENDIF.
    lv_row = 1.
    add_kv( EXPORTING iv_row = 1 iv_name = 'HU' iv_value = |{ condense( |{ ls_h-huident ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'WAREHOUSE' iv_value = ls_h-lgnum CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'HU_TYPE' iv_value = ls_h-letyp CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'LOCATION' iv_value = lv_where CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'GROSS_WEIGHT' iv_value = |{ qty( ls_h-g_weight ) } { ls_h-unit_gw }| CHANGING ct_rows = rs_result-rows ).
    LOOP AT lt_q INTO DATA(ls_q).
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = product_no( ls_q-matid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STOCK_TYPE' iv_value = ls_q-cat CHANGING ct_rows = rs_result-rows ).
      IF ls_q-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'BATCH' iv_value = ls_q-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_q-quan ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_q-unit CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-summary = |Handling unit { condense( |{ ls_h-huident ALPHA = OUT }| ) } in warehouse { ls_h-lgnum } at { lv_where }: | &&
                        |{ lines( lt_q ) } stock lines|.
  ENDMETHOD.


  METHOD dlv_status_of.
    DATA: lv_docid TYPE /scdl/db_refdoc-docid,
          lv_dcat  TYPE /scdl/db_refdoc-doccat,
          lv_vbeln TYPE vbeln_vl,
          lv_row   TYPE i,
          lv_done  TYPE i,
          lv_items TYPE i,
          lv_open  TYPE i,
          lv_lgnum TYPE /scwm/lgnum,
          lv_text  TYPE string.

    erp_delivery( EXPORTING iv_vbeln = is_params-vbeln IMPORTING ev_docid = lv_docid ev_doccat = lv_dcat ev_vbeln = lv_vbeln
                  CHANGING cs_result = rs_result ).
    IF lv_docid IS INITIAL.
      RETURN.
    ENDIF.
    IF lv_dcat = 'PDO'.
      SELECT SINGLE docno, doctype FROM /scdl/db_proch_o WHERE docid = @lv_docid INTO @DATA(ls_ho).
      SELECT itemno, productno, qty, uom, status_pick, status_gi, status_compl, /scwm/whno AS whno
        FROM /scdl/db_proci_o WHERE docid = @lv_docid ORDER BY itemno INTO TABLE @DATA(lt_io).
      READ TABLE lt_io INTO DATA(ls_first) INDEX 1.
      IF sy-subrc = 0.
        lv_lgnum = ls_first-whno.
      ENDIF.
      IF lv_lgnum IS NOT INITIAL.
        check_wh( EXPORTING iv_lgnum = CONV string( lv_lgnum ) IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
        IF lv_lgnum IS INITIAL.
          RETURN.
        ENDIF.
      ENDIF.
      LOOP AT lt_io INTO DATA(ls_io).
        lv_row = lv_row + 1.
        lv_items = lv_items + 1.
        IF ls_io-status_gi = '9'.
          lv_done = lv_done + 1.
        ENDIF.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM' iv_value = |{ condense( |{ ls_io-itemno ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = |{ condense( |{ ls_io-productno ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_io-qty ) CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_io-uom CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PICKING' iv_value = dlv_status( ls_io-status_pick ) CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'GOODS_ISSUE' iv_value = dlv_status( ls_io-status_gi ) CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      SELECT COUNT(*) FROM /scwm/ordim_o WHERE lgnum = @lv_lgnum AND rdocid = @lv_docid INTO @lv_open.
      lv_text = |Outbound delivery { condense( |{ lv_vbeln ALPHA = OUT }| ) } (warehouse request { condense( |{ ls_ho-docno ALPHA = OUT }| ) }, type { ls_ho-doctype }, | &&
                |warehouse { lv_lgnum }): { lv_done } of { lv_items } items goods issued, { lv_open } open warehouse tasks|.
    ELSE.
      SELECT SINGLE docno, doctype FROM /scdl/db_proch_i WHERE docid = @lv_docid INTO @DATA(ls_hi).
      SELECT itemno, productno, qty, uom, status_gr, status_compl, /scwm/whno AS whno
        FROM /scdl/db_proci_i WHERE docid = @lv_docid ORDER BY itemno INTO TABLE @DATA(lt_ii).
      READ TABLE lt_ii INTO DATA(ls_firsti) INDEX 1.
      IF sy-subrc = 0.
        lv_lgnum = ls_firsti-whno.
      ENDIF.
      IF lv_lgnum IS NOT INITIAL.
        check_wh( EXPORTING iv_lgnum = CONV string( lv_lgnum ) IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
        IF lv_lgnum IS INITIAL.
          RETURN.
        ENDIF.
      ENDIF.
      LOOP AT lt_ii INTO DATA(ls_ii).
        lv_row = lv_row + 1.
        lv_items = lv_items + 1.
        IF ls_ii-status_gr = '9'.
          lv_done = lv_done + 1.
        ENDIF.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM' iv_value = |{ condense( |{ ls_ii-itemno ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PRODUCT' iv_value = |{ condense( |{ ls_ii-productno ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'QUANTITY' iv_value = qty( ls_ii-qty ) CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'UNIT' iv_value = ls_ii-uom CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'GOODS_RECEIPT' iv_value = dlv_status( ls_ii-status_gr ) CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'COMPLETION' iv_value = dlv_status( ls_ii-status_compl ) CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      SELECT COUNT(*) FROM /scwm/ordim_o WHERE lgnum = @lv_lgnum AND rdocid = @lv_docid INTO @lv_open.
      lv_text = |Inbound delivery { condense( |{ lv_vbeln ALPHA = OUT }| ) } (warehouse request { condense( |{ ls_hi-docno ALPHA = OUT }| ) }, type { ls_hi-doctype }, | &&
                |warehouse { lv_lgnum }): { lv_done } of { lv_items } items goods received, { lv_open } open warehouse tasks|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD dlv_list_open.
    TYPES: BEGIN OF ty_doc,
             docid TYPE /scdl/db_refdoc-docid,
             items TYPE i,
             open  TYPE i,
           END OF ty_doc.
    DATA: lv_lgnum TYPE /scwm/lgnum,
          lv_cat   TYPE string,
          lt_doc   TYPE SORTED TABLE OF ty_doc WITH UNIQUE KEY docid,
          ls_doc   TYPE ty_doc,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_text  TYPE string.
    FIELD-SYMBOLS <ls_doc> TYPE ty_doc.

    check_wh( EXPORTING iv_lgnum = is_params-lgnum IMPORTING ev_lgnum = lv_lgnum CHANGING cs_result = rs_result ).
    IF lv_lgnum IS INITIAL.
      RETURN.
    ENDIF.
    lv_cat = to_lower( condense( is_params-doc_category ) ).
    IF lv_cat IS INITIAL.
      lv_cat = 'outbound'.
    ENDIF.
    IF lv_cat <> 'outbound' AND lv_cat <> 'inbound'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'doc_category must be outbound or inbound'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).
    IF lv_cat = 'outbound'.
      SELECT docid, status_gi AS st FROM /scdl/db_proci_o
        WHERE /scwm/whno = @lv_lgnum INTO TABLE @DATA(lt_it).
    ELSE.
      SELECT docid, status_gr AS st FROM /scdl/db_proci_i
        WHERE /scwm/whno = @lv_lgnum INTO TABLE @lt_it.
    ENDIF.
    LOOP AT lt_it INTO DATA(ls_it).
      READ TABLE lt_doc ASSIGNING <ls_doc> WITH TABLE KEY docid = ls_it-docid.
      IF sy-subrc <> 0.
        CLEAR ls_doc.
        ls_doc-docid = ls_it-docid.
        INSERT ls_doc INTO TABLE lt_doc ASSIGNING <ls_doc>.
      ENDIF.
      <ls_doc>-items = <ls_doc>-items + 1.
      IF ls_it-st = '1' OR ls_it-st = '2'.
        <ls_doc>-open = <ls_doc>-open + 1.
      ENDIF.
    ENDLOOP.
    DELETE lt_doc WHERE open = 0.
    IF lt_doc IS NOT INITIAL.
      SELECT docid, refdocno FROM /scdl/db_refdoc FOR ALL ENTRIES IN @lt_doc
        WHERE docid = @lt_doc-docid AND refdoccat = 'ERP' AND itemid = @gv_noitem
        INTO TABLE @DATA(lt_ref).
      SORT lt_ref BY docid.
      IF lv_cat = 'outbound'.
        SELECT docid, docno, doctype, cretst FROM /scdl/db_proch_o FOR ALL ENTRIES IN @lt_doc
          WHERE docid = @lt_doc-docid INTO TABLE @DATA(lt_h).
      ELSE.
        SELECT docid, docno, doctype, cretst FROM /scdl/db_proch_i FOR ALL ENTRIES IN @lt_doc
          WHERE docid = @lt_doc-docid INTO TABLE @lt_h.
      ENDIF.
      SORT lt_h BY cretst DESCENDING docno DESCENDING.
    ENDIF.
    LOOP AT lt_h INTO DATA(ls_h).
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      READ TABLE lt_doc INTO ls_doc WITH TABLE KEY docid = ls_h-docid.
      lv_row = lv_row + 1.
      READ TABLE lt_ref INTO DATA(ls_ref) WITH KEY docid = ls_h-docid BINARY SEARCH.
      IF sy-subrc = 0.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'DELIVERY' iv_value = |{ condense( |{ ls_ref-refdocno ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WAREHOUSE_REQUEST' iv_value = |{ condense( |{ ls_h-docno ALPHA = OUT }| ) }| CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TYPE' iv_value = ls_h-doctype CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED' iv_value = ts_date( ls_h-cretst ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEMS' iv_value = ls_doc-items CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OPEN_ITEMS' iv_value = ls_doc-open CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF lv_cat = 'outbound'.
      lv_text = |Warehouse { lv_lgnum }: { lines( lt_doc ) } outbound deliveries with goods issue not completed|.
    ELSE.
      lv_text = |Warehouse { lv_lgnum }: { lines( lt_doc ) } inbound deliveries with goods receipt not completed|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
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


  METHOD finish.
    LOOP AT cs_result-messages TRANSPORTING NO FIELDS WHERE type = 'E' OR type = 'A'.
      cs_result-failed = abap_true.
      EXIT.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
