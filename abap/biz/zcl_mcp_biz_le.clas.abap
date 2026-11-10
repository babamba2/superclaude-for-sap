CLASS zcl_mcp_biz_le DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Business actions on shipping / transportation (configs/LE/actions.json). Written in 7.31 syntax.
* ECC only (LE-TRA shipments, shipment costs, picking, packing): on S/4HANA transportation runs
* in SAP TM, so every LE action is refused there.
*
* Shipments  LE.SHP.LIST / GET_DETAIL / LIST_OPEN_DLV (reads VTTK, VTTP, LIKP, VBUK)
*            LE.SHP.CREATE      BAPI_SHIPMENT_CREATE (no test mode: preview = rule checks)
*            LE.SHP.CHANGE      BAPI_SHIPMENT_CHANGE (deliveries, route, carrier, external IDs)
*            LE.SHP.SET_STATUS  BAPI_SHIPMENT_CHANGE status flags (cumulative up to the target)
*            BAPI_SHIPMENT_CHANGE commits by itself (proven on the test system): never called in a preview.
* Deliveries LE.DLV.LIST_TO_PICK / GET_STATUS (reads)
*            LE.DLV.PICK / LE.DLV.CHANGE / LE.HU.PACK  WS_DELIVERY_UPDATE_2, preview = check mode
*            (IF_DATABASE_UPDATE_1 = 2, saves nothing) followed by rollback
*            LE.DLV.SPLIT       BAPI_OUTB_DELIVERY_SPLIT_DEC (no test mode: preview = rule checks)
* Handling units LE.HU.LIST / GET_DETAIL (VEKP, VEPO), LE.HU.UNPACK BAPI_HU_UNPACK (rule preview)
* Shipment costs LE.SCD.GET_DETAIL / LIST_DUE (VFKK, VFKP), LE.SCD.SIMULATE BAPI_SHIPMENT_COST_ESTIMATE
*            (simulation only, nothing is created)
* Authorization (fail closed): V_VTTK_SHT (SHTYP), V_VTTK_TDS (TPLST), V_LIKP_VST (VSTEL), V_VFKK_FKA.
* No partner names or addresses are read; the carrier is shown as its vendor number only.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    CONSTANTS:
      c_db_check TYPE leshp_database_update VALUE '2',
      c_db_save  TYPE leshp_database_update VALUE '1',
      c_max_def  TYPE i VALUE 50,
      c_max_cap  TYPE i VALUE 500.

    TYPES:
      BEGIN OF ty_shp,
        tknum TYPE vttk-tknum,
        shtyp TYPE vttk-shtyp,
        tplst TYPE vttk-tplst,
        erdat TYPE vttk-erdat,
        sttrg TYPE vttk-sttrg,
        stdis TYPE vttk-stdis,
        streg TYPE vttk-streg,
        stlbg TYPE vttk-stlbg,
        stlad TYPE vttk-stlad,
        stabf TYPE vttk-stabf,
        sttbg TYPE vttk-sttbg,
        stten TYPE vttk-stten,
        dptbg TYPE vttk-dptbg,
        dpten TYPE vttk-dpten,
        datbg TYPE vttk-datbg,
        daten TYPE vttk-daten,
        route TYPE vttk-route,
        tdlnr TYPE vttk-tdlnr,
        exti1 TYPE vttk-exti1,
        exti2 TYPE vttk-exti2,
        frkrl TYPE vttk-frkrl,
      END OF ty_shp,
      ty_shps TYPE STANDARD TABLE OF ty_shp WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_dlv,
        vbeln TYPE likp-vbeln,
        vstel TYPE likp-vstel,
        lfart TYPE likp-lfart,
        wadat TYPE likp-wadat,
        kodat TYPE likp-kodat,
        route TYPE likp-route,
        lgnum TYPE likp-lgnum,
        kostk TYPE vbuk-kostk,
        lvstk TYPE vbuk-lvstk,
        pkstk TYPE vbuk-pkstk,
        wbstk TYPE vbuk-wbstk,
        fkstk TYPE vbuk-fkstk,
        trsta TYPE vbuk-trsta,
        vbtyp TYPE vbuk-vbtyp,
      END OF ty_dlv,
      ty_dlvs TYPE STANDARD TABLE OF ty_dlv WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_li,
        posnr TYPE lips-posnr,
        matnr TYPE lips-matnr,
        werks TYPE lips-werks,
        lgort TYPE lips-lgort,
        charg TYPE lips-charg,
        lfimg TYPE lips-lfimg,
        lgmng TYPE lips-lgmng,
        vrkme TYPE lips-vrkme,
        meins TYPE lips-meins,
        lgnum TYPE lips-lgnum,
        uecha TYPE lips-uecha,
        kosta TYPE vbup-kosta,
        lvsta TYPE vbup-lvsta,
        pksta TYPE vbup-pksta,
        wbsta TYPE vbup-wbsta,
        picked TYPE lips-lfimg,
      END OF ty_li,
      ty_lis TYPE STANDARD TABLE OF ty_li WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_req,
        posnr TYPE lips-posnr,
        qty   TYPE lips-lfimg,
      END OF ty_req,
      ty_reqs TYPE STANDARD TABLE OF ty_req WITH DEFAULT KEY.

    TYPES: ty_ret       TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
           ty_shp_items TYPE STANDARD TABLE OF bapishipmentitem WITH DEFAULT KEY,
           ty_shp_iacts TYPE STANDARD TABLE OF bapishipmentitemaction WITH DEFAULT KEY,
           ty_poks      TYPE STANDARD TABLE OF vbpok WITH DEFAULT KEY,
           ty_verkos    TYPE STANDARD TABLE OF verko WITH DEFAULT KEY,
           ty_verpos    TYPE STANDARD TABLE OF verpo WITH DEFAULT KEY,
           ty_prots     TYPE STANDARD TABLE OF prott WITH DEFAULT KEY.

    METHODS family_ok
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    " ---- shipments
    METHODS shp_list
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS shp_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS shp_open_dlv
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS shp_create
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS shp_change
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS shp_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS load_shp
      IMPORTING iv_tknum      TYPE vttk-tknum
      EXPORTING es_shp        TYPE ty_shp
                ev_found      TYPE abap_bool.
    METHODS shp_rows
      IMPORTING is_shp   TYPE ty_shp
                iv_row   TYPE i
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.
    METHODS shp_status_text
      IMPORTING iv_sttrg       TYPE vttk-sttrg
      RETURNING VALUE(rv_text) TYPE string.
    METHODS check_dlv_for_shp
      IMPORTING iv_vbeln  TYPE likp-vbeln
                iv_tknum  TYPE vttk-tknum OPTIONAL
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS check_shp_head
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS call_shp_change
      IMPORTING is_head   TYPE bapishipmentheader
                is_act    TYPE bapishipmentheaderaction
                it_item   TYPE ty_shp_items OPTIONAL
                it_iact   TYPE ty_shp_iacts OPTIONAL
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " ---- deliveries
    METHODS dlv_to_pick
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_pick
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_change
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_split
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS load_dlv
      IMPORTING iv_vbeln  TYPE likp-vbeln
      EXPORTING es_dlv    TYPE ty_dlv
                et_items  TYPE ty_lis
                ev_found  TYPE abap_bool.
    METHODS open_dlv
      IMPORTING iv_in     TYPE string
                iv_actvt  TYPE activ_auth
      EXPORTING es_dlv    TYPE ty_dlv
                et_items  TYPE ty_lis
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS dlv_rows
      IMPORTING is_dlv   TYPE ty_dlv
                iv_row   TYPE i
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.
    METHODS parse_reqs
      IMPORTING it_items  TYPE string_table
      EXPORTING et_reqs   TYPE ty_reqs
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS call_ws
      IMPORTING iv_vbeln   TYPE likp-vbeln
                is_ok      TYPE vbkok
                it_pok     TYPE ty_poks OPTIONAL
                it_verko   TYPE ty_verkos OPTIONAL
                it_verpo   TYPE ty_verpos OPTIONAL
                iv_picking TYPE abap_bool DEFAULT abap_false
                iv_execute TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    " ---- handling units
    METHODS hu_list
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS hu_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS hu_pack
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS hu_unpack
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " ---- shipment costs
    METHODS scd_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS scd_due
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS scd_simulate
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " ---- helpers
    METHODS auth_shp
      IMPORTING iv_shtyp     TYPE vttk-shtyp
                iv_tplst     TYPE vttk-tplst
                iv_actvt     TYPE activ_auth
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS check_period
      IMPORTING iv_werks  TYPE werks_d
                iv_date   TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS auth_dlv
      IMPORTING iv_vstel     TYPE likp-vstel
                iv_actvt     TYPE activ_auth
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS to_doc
      IMPORTING iv_in         TYPE string
      RETURNING VALUE(rv_doc) TYPE vbeln_vl.
    METHODS to_date
      IMPORTING iv_in          TYPE string
      RETURNING VALUE(rv_date) TYPE d.
    METHODS to_qty
      IMPORTING iv_in        TYPE string
      EXPORTING ev_qty       TYPE lips-lfimg
                ev_ok        TYPE abap_bool.
    METHODS max_rows
      IMPORTING iv_in       TYPE string
      RETURNING VALUE(rv_n) TYPE i.
    METHODS fmt_doc
      IMPORTING iv_doc        TYPE clike
      RETURNING VALUE(rv_txt) TYPE string.
    METHODS fmt_qty
      IMPORTING iv_qty        TYPE numeric
      RETURNING VALUE(rv_txt) TYPE string.
    METHODS add_kv
      IMPORTING iv_row   TYPE i
                iv_name  TYPE string
                iv_value TYPE any
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.
    METHODS add_chg
      IMPORTING iv_field  TYPE string
                iv_old    TYPE any
                iv_new    TYPE any
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS add_sy_msg
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS add_ret
      IMPORTING it_return TYPE ty_ret
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS add_prot
      IMPORTING it_prot   TYPE ty_prots
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS do_rollback.
    METHODS commit_wait
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.



CLASS zcl_mcp_biz_le IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/LE/actions.json.
    ls_def-kind = 'query'. ls_def-risk = 'none'.
    ls_def-id = 'LE.SHP.LIST'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SHP.GET_DETAIL'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SHP.LIST_OPEN_DLV'. APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.DLV.LIST_TO_PICK'. APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.DLV.GET_STATUS'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.HU.LIST'.          APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.HU.GET_DETAIL'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SCD.GET_DETAIL'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SCD.LIST_DUE'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SCD.SIMULATE'.     APPEND ls_def TO rt_actions.
    ls_def-kind = 'write'. ls_def-risk = 'medium'.
    ls_def-id = 'LE.SHP.CREATE'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SHP.CHANGE'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.SHP.SET_STATUS'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.DLV.PICK'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.DLV.CHANGE'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.DLV.SPLIT'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.HU.PACK'.          APPEND ls_def TO rt_actions.
    ls_def-id = 'LE.HU.UNPACK'.        APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    DATA lv_text TYPE string.

    family_ok( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_false.
      CASE iv_action.
        WHEN 'LE.SHP.LIST'.
          rs_result = shp_list( is_params ).
        WHEN 'LE.SHP.GET_DETAIL'.
          rs_result = shp_detail( is_params ).
        WHEN 'LE.SHP.LIST_OPEN_DLV'.
          rs_result = shp_open_dlv( is_params ).
        WHEN 'LE.DLV.LIST_TO_PICK'.
          rs_result = dlv_to_pick( is_params ).
        WHEN 'LE.DLV.GET_STATUS'.
          rs_result = dlv_status( is_params ).
        WHEN 'LE.HU.LIST'.
          rs_result = hu_list( is_params ).
        WHEN 'LE.HU.GET_DETAIL'.
          rs_result = hu_detail( is_params ).
        WHEN 'LE.SCD.GET_DETAIL'.
          rs_result = scd_detail( is_params ).
        WHEN 'LE.SCD.LIST_DUE'.
          rs_result = scd_due( is_params ).
        WHEN 'LE.SCD.SIMULATE'.
          rs_result = scd_simulate( is_params ).
        WHEN OTHERS.
          lv_text = |{ iv_action } is not a query action|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDCASE.
    ENDIF.
    rs_result-action = iv_action.
    rs_result-mode   = 'QUERY'.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    DATA lv_text TYPE string.

    family_ok( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_false.
      CASE iv_action.
        WHEN 'LE.SHP.CREATE'.
          rs_result = shp_create( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.SHP.CHANGE'.
          rs_result = shp_change( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.SHP.SET_STATUS'.
          rs_result = shp_status( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.DLV.PICK'.
          rs_result = dlv_pick( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.DLV.CHANGE'.
          rs_result = dlv_change( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.DLV.SPLIT'.
          rs_result = dlv_split( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.HU.PACK'.
          rs_result = hu_pack( is_params = is_params iv_execute = abap_false ).
        WHEN 'LE.HU.UNPACK'.
          rs_result = hu_unpack( is_params = is_params iv_execute = abap_false ).
        WHEN OTHERS.
          lv_text = |{ iv_action } is not a write action|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDCASE.
    ENDIF.
    rs_result-action = iv_action.
    rs_result-mode   = 'PREVIEW'.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    DATA lv_text TYPE string.

    " Every check of the preview runs again on the current data.
    family_ok( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_false.
      CASE iv_action.
        WHEN 'LE.SHP.CREATE'.
          rs_result = shp_create( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.SHP.CHANGE'.
          rs_result = shp_change( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.SHP.SET_STATUS'.
          rs_result = shp_status( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.DLV.PICK'.
          rs_result = dlv_pick( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.DLV.CHANGE'.
          rs_result = dlv_change( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.DLV.SPLIT'.
          rs_result = dlv_split( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.HU.PACK'.
          rs_result = hu_pack( is_params = is_params iv_execute = abap_true ).
        WHEN 'LE.HU.UNPACK'.
          rs_result = hu_unpack( is_params = is_params iv_execute = abap_true ).
        WHEN OTHERS.
          lv_text = |{ iv_action } is not a write action|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      ENDCASE.
    ENDIF.
    rs_result-action = iv_action.
    rs_result-mode   = 'EXECUTE'.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD family_ok.
    IF zcl_mcp_biz_sys=>get( )->family( ) = zif_mcp_biz_sys=>c_family_s4.
      cs_result-failed = abap_true.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'LE actions are not offered on S/4HANA: transportation runs in SAP TM there'
               CHANGING  cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD load_shp.
    CLEAR: es_shp, ev_found.
    SELECT SINGLE tknum shtyp tplst erdat sttrg stdis streg stlbg stlad stabf sttbg stten
                  dptbg dpten datbg daten route tdlnr exti1 exti2 frkrl
      FROM vttk INTO es_shp WHERE tknum = iv_tknum.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD shp_status_text.
    CASE iv_sttrg.
      WHEN '0'. rv_text = 'created'.
      WHEN '1'. rv_text = 'planned'.
      WHEN '2'. rv_text = 'checked in'.
      WHEN '3'. rv_text = 'loading started'.
      WHEN '4'. rv_text = 'loading ended'.
      WHEN '5'. rv_text = 'shipment completed (processing)'.
      WHEN '6'. rv_text = 'shipment started'.
      WHEN '7'. rv_text = 'shipment ended'.
      WHEN OTHERS. rv_text = iv_sttrg.
    ENDCASE.
  ENDMETHOD.


  METHOD shp_rows.
    DATA lv_n TYPE i.

    add_kv( EXPORTING iv_row = iv_row iv_name = 'tknum' iv_value = is_shp-tknum CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'shtyp' iv_value = is_shp-shtyp CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'tplst' iv_value = is_shp-tplst CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'status' iv_value = shp_status_text( is_shp-sttrg ) CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'sttrg' iv_value = is_shp-sttrg CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'erdat' iv_value = is_shp-erdat CHANGING ct_rows = ct_rows ).
    IF is_shp-dptbg IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'planned_start' iv_value = is_shp-dptbg CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-dpten IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'planned_end' iv_value = is_shp-dpten CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-datbg IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'actual_start' iv_value = is_shp-datbg CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-daten IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'actual_end' iv_value = is_shp-daten CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-route IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'route' iv_value = is_shp-route CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-tdlnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'carrier' iv_value = is_shp-tdlnr CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-exti1 IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'exti1' iv_value = is_shp-exti1 CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_shp-exti2 IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'exti2' iv_value = is_shp-exti2 CHANGING ct_rows = ct_rows ).
    ENDIF.
    SELECT COUNT(*) FROM vttp INTO lv_n WHERE tknum = is_shp-tknum.
    add_kv( EXPORTING iv_row = iv_row iv_name = 'deliveries' iv_value = lv_n CHANGING ct_rows = ct_rows ).
  ENDMETHOD.


  METHOD shp_list.
    DATA: lt_shp   TYPE ty_shps,
          ls_shp   TYPE ty_shp,
          lv_tplst TYPE vttk-tplst,
          lv_shtyp TYPE vttk-shtyp,
          lv_stat  TYPE string,
          lv_basis TYPE string,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_row   TYPE i,
          lv_hidden TYPE i,
          lv_from  TYPE d,
          lt_sttrg TYPE RANGE OF vttk-sttrg,
          ls_sttrg LIKE LINE OF lt_sttrg,
          lt_dptbg TYPE RANGE OF vttk-dptbg,
          ls_dptbg LIKE LINE OF lt_dptbg,
          lt_erdat TYPE RANGE OF vttk-erdat,
          ls_erdat LIKE LINE OF lt_erdat,
          lt_shtyp TYPE RANGE OF vttk-shtyp,
          ls_shtyp LIKE LINE OF lt_shtyp,
          lv_text  TYPE string.

    lv_tplst = to_upper( is_params-tplst ).
    IF lv_tplst IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tplst is required (transportation planning point)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE tplst FROM ttds INTO lv_tplst WHERE tplst = lv_tplst.
    IF sy-subrc <> 0.
      lv_text = |Transportation planning point { to_upper( is_params-tplst ) } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_stat = to_lower( is_params-status ).
    IF lv_stat IS INITIAL.
      lv_stat = 'not_started'.
    ENDIF.
    ls_sttrg-sign = 'I'.
    CASE lv_stat.
      WHEN 'not_started'.
        ls_sttrg-option = 'LT'. ls_sttrg-low = '6'. APPEND ls_sttrg TO lt_sttrg.
      WHEN 'started'.
        ls_sttrg-option = 'EQ'. ls_sttrg-low = '6'. APPEND ls_sttrg TO lt_sttrg.
      WHEN 'completed'.
        ls_sttrg-option = 'EQ'. ls_sttrg-low = '7'. APPEND ls_sttrg TO lt_sttrg.
      WHEN 'all'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'status must be not_started, started, completed or all' CHANGING cs_result = rs_result ).
        RETURN.
    ENDCASE.
    lv_basis = to_lower( is_params-date_basis ).
    IF lv_basis IS INITIAL.
      lv_basis = 'all'.
    ENDIF.
    CASE lv_basis.
      WHEN 'start_today'.
        ls_dptbg-sign = 'I'. ls_dptbg-option = 'EQ'. ls_dptbg-low = sy-datum. APPEND ls_dptbg TO lt_dptbg.
      WHEN 'start_overdue'.
        ls_dptbg-sign = 'I'. ls_dptbg-option = 'BT'. ls_dptbg-low = '19000101'. ls_dptbg-high = sy-datum.
        APPEND ls_dptbg TO lt_dptbg.
        IF lt_sttrg IS INITIAL.
          ls_sttrg-option = 'LT'. ls_sttrg-low = '6'. APPEND ls_sttrg TO lt_sttrg.
        ENDIF.
      WHEN 'created_last_30'.
        lv_from = sy-datum - 30.
        ls_erdat-sign = 'I'. ls_erdat-option = 'GE'. ls_erdat-low = lv_from. APPEND ls_erdat TO lt_erdat.
      WHEN 'all'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_basis must be start_today, start_overdue, created_last_30 or all'
                 CHANGING cs_result = rs_result ).
        RETURN.
    ENDCASE.
    lv_shtyp = to_upper( is_params-shtyp ).
    IF lv_shtyp IS NOT INITIAL.
      ls_shtyp-sign = 'I'. ls_shtyp-option = 'EQ'. ls_shtyp-low = lv_shtyp. APPEND ls_shtyp TO lt_shtyp.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.

    SELECT tknum shtyp tplst erdat sttrg stdis streg stlbg stlad stabf sttbg stten
           dptbg dpten datbg daten route tdlnr exti1 exti2 frkrl
      FROM vttk INTO TABLE lt_shp UP TO lv_fetch ROWS
      WHERE tplst = lv_tplst AND shtyp IN lt_shtyp AND sttrg IN lt_sttrg
        AND dptbg IN lt_dptbg AND erdat IN lt_erdat
      ORDER BY PRIMARY KEY.
    IF lines( lt_shp ) > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_shp FROM lv_fetch.
    ENDIF.
    LOOP AT lt_shp INTO ls_shp.
      IF auth_shp( iv_shtyp = ls_shp-shtyp iv_tplst = ls_shp-tplst iv_actvt = '03' ) = abap_false.
        lv_hidden = lv_hidden + 1.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      shp_rows( EXPORTING is_shp = ls_shp iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-hidden_no_auth = lv_hidden.
    rs_result-summary = |{ lv_row } shipments of planning point { lv_tplst } ({ lv_stat }, { lv_basis })|.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; more exist, raise max_rows|.
    ENDIF.
  ENDMETHOD.


  METHOD shp_detail.
    DATA: lv_tknum TYPE vttk-tknum,
          ls_shp   TYPE ty_shp,
          lv_found TYPE abap_bool,
          lt_vbeln TYPE STANDARD TABLE OF vttp-vbeln WITH DEFAULT KEY,
          lv_vbeln TYPE vttp-vbeln,
          ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          lv_row   TYPE i,
          lv_text  TYPE string.

    lv_tknum = to_doc( is_params-tknum ).
    IF lv_tknum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tknum is required (shipment, digits up to 10)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    load_shp( EXPORTING iv_tknum = lv_tknum IMPORTING es_shp = ls_shp ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_shp( iv_shtyp = ls_shp-shtyp iv_tplst = ls_shp-tplst iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display shipments of type { ls_shp-shtyp } / planning point { ls_shp-tplst }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    shp_rows( EXPORTING is_shp = ls_shp iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_planned'      iv_value = ls_shp-stdis CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_checked_in'   iv_value = ls_shp-streg CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_load_start'   iv_value = ls_shp-stlbg CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_load_end'     iv_value = ls_shp-stlad CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_completion'   iv_value = ls_shp-stabf CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_start'        iv_value = ls_shp-sttbg CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'step_end'          iv_value = ls_shp-stten CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'cost_relevant'     iv_value = ls_shp-frkrl CHANGING ct_rows = rs_result-rows ).
    SELECT vbeln FROM vttp INTO TABLE lt_vbeln WHERE tknum = lv_tknum ORDER BY tpnum.
    LOOP AT lt_vbeln INTO lv_vbeln.
      load_dlv( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_dlv = ls_dlv et_items = lt_items ev_found = lv_found ).
      IF lv_found = abap_true.
        lv_row = lv_row + 1.
        dlv_rows( EXPORTING is_dlv = ls_dlv iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |Shipment { fmt_doc( lv_tknum ) } ({ ls_shp-shtyp }): { shp_status_text( ls_shp-sttrg ) }, { lv_row } deliveries|.
  ENDMETHOD.


  METHOD shp_open_dlv.
    DATA: lv_vstel TYPE likp-vstel,
          lv_basis TYPE string,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_row   TYPE i,
          lt_dlv   TYPE ty_dlvs,
          ls_dlv   TYPE ty_dlv,
          lt_wadat TYPE RANGE OF likp-wadat,
          ls_wadat LIKE LINE OF lt_wadat,
          lv_text  TYPE string.

    lv_vstel = to_upper( is_params-vstel ).
    IF lv_vstel IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vstel is required (shipping point)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_dlv( iv_vstel = lv_vstel iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display deliveries of shipping point { lv_vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_basis = to_lower( is_params-date_basis ).
    IF lv_basis IS INITIAL.
      lv_basis = 'all'.
    ENDIF.
    CASE lv_basis.
      WHEN 'gi_today'.
        ls_wadat-sign = 'I'. ls_wadat-option = 'EQ'. ls_wadat-low = sy-datum. APPEND ls_wadat TO lt_wadat.
      WHEN 'gi_overdue_until_today'.
        ls_wadat-sign = 'I'. ls_wadat-option = 'LE'. ls_wadat-low = sy-datum. APPEND ls_wadat TO lt_wadat.
      WHEN 'all'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_basis must be gi_today, gi_overdue_until_today or all'
                 CHANGING cs_result = rs_result ).
        RETURN.
    ENDCASE.
    lv_max = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.
    " Outbound deliveries not issued yet and not planned in a shipment (VBUK-TRSTA A).
    SELECT l~vbeln l~vstel l~lfart l~wadat l~kodat l~route l~lgnum
           u~kostk u~lvstk u~pkstk u~wbstk u~fkstk u~trsta u~vbtyp
      FROM likp AS l INNER JOIN vbuk AS u ON u~vbeln = l~vbeln
      INTO TABLE lt_dlv UP TO lv_fetch ROWS
      WHERE l~vstel = lv_vstel AND u~vbtyp = 'J' AND u~trsta = 'A'
        AND u~wbstk <> 'C' AND l~wadat IN lt_wadat
      ORDER BY l~wadat l~vbeln.
    IF lines( lt_dlv ) > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_dlv FROM lv_fetch.
    ENDIF.
    LOOP AT lt_dlv INTO ls_dlv.
      lv_row = lv_row + 1.
      dlv_rows( EXPORTING is_dlv = ls_dlv iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-summary = |{ lv_row } deliveries of shipping point { lv_vstel } without shipment ({ lv_basis })|.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; more exist, raise max_rows|.
    ENDIF.
  ENDMETHOD.


  METHOD check_shp_head.
    " Route, carrier and external IDs shared by CREATE and CHANGE.
    DATA: lv_route TYPE tvro-route,
          lv_lifnr TYPE lfa1-lifnr,
          lv_text  TYPE string.

    IF is_params-route IS NOT INITIAL.
      lv_route = to_upper( is_params-route ).
      SELECT SINGLE route FROM tvro INTO lv_route WHERE route = lv_route.
      IF sy-subrc <> 0.
        lv_text = |Route { to_upper( is_params-route ) } does not exist|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    IF is_params-tdlnr IS NOT INITIAL.
      lv_lifnr = to_doc( is_params-tdlnr ).
      IF lv_lifnr IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'tdlnr must be the vendor number of the carrier (digits up to 10)'
                 CHANGING cs_result = cs_result ).
      ELSE.
        SELECT SINGLE lifnr FROM lfa1 INTO lv_lifnr WHERE lifnr = lv_lifnr.
        IF sy-subrc <> 0.
          lv_text = |Carrier (vendor) { fmt_doc( lv_lifnr ) } does not exist|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        ENDIF.
      ENDIF.
    ENDIF.
    IF strlen( is_params-exti1 ) > 20 OR strlen( is_params-exti2 ) > 20.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'exti1 / exti2 can hold up to 20 characters' CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD check_dlv_for_shp.
    DATA: ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          lv_found TYPE abap_bool,
          lv_tk    TYPE vttp-tknum,
          lv_text  TYPE string.

    load_dlv( EXPORTING iv_vbeln = iv_vbeln IMPORTING es_dlv = ls_dlv et_items = lt_items ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Delivery { fmt_doc( iv_vbeln ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_dlv-vbtyp <> 'J'.
      lv_text = |Document { fmt_doc( iv_vbeln ) } is not an outbound delivery|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_dlv( iv_vstel = ls_dlv-vstel iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to change deliveries of shipping point { ls_dlv-vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_dlv-trsta = 'C'.
      SELECT tknum FROM vttp UP TO 1 ROWS INTO lv_tk WHERE vbeln = iv_vbeln.
      ENDSELECT.
      IF lv_tk <> iv_tknum.
        lv_text = |Delivery { fmt_doc( iv_vbeln ) } is already planned completely in shipment { fmt_doc( lv_tk ) }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ELSEIF ls_dlv-trsta IS INITIAL.
      lv_text = |Delivery { fmt_doc( iv_vbeln ) } is not relevant for transportation planning|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ELSE.
      SELECT tknum FROM vttp UP TO 1 ROWS INTO lv_tk WHERE vbeln = iv_vbeln AND tknum <> iv_tknum.
      ENDSELECT.
      IF lv_tk IS NOT INITIAL.
        lv_text = |Delivery { fmt_doc( iv_vbeln ) } is already in shipment { fmt_doc( lv_tk ) } (not planned completely): | &&
                  |it would be in two shipments|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    IF ls_dlv-wbstk = 'C'.
      lv_text = |Delivery { fmt_doc( iv_vbeln ) }: goods issue is already posted|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD shp_create.
    DATA: ls_head  TYPE bapishipmentheader,
          lt_item  TYPE ty_shp_items,
          ls_item  TYPE bapishipmentitem,
          lt_ret   TYPE ty_ret,
          lv_tk    TYPE bapishipmentids-shipmentnum,
          lv_shtyp TYPE tvtk-shtyp,
          lv_tplst TYPE ttds-tplst,
          lv_in    TYPE string,
          lv_vbeln TYPE likp-vbeln,
          lt_seen  TYPE STANDARD TABLE OF likp-vbeln WITH DEFAULT KEY,
          ls_shp   TYPE ty_shp,
          lv_found TYPE abap_bool,
          lv_pos   TYPE i,
          lv_text  TYPE string.

    lv_shtyp = to_upper( is_params-shtyp ).
    lv_tplst = to_upper( is_params-tplst ).
    IF lv_shtyp IS INITIAL OR lv_tplst IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'shtyp (shipment type) and tplst (transportation planning point) are required'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE shtyp FROM tvtk INTO lv_shtyp WHERE shtyp = lv_shtyp.
    IF sy-subrc <> 0.
      lv_text = |Shipment type { to_upper( is_params-shtyp ) } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE tplst FROM ttds INTO lv_tplst WHERE tplst = lv_tplst.
    IF sy-subrc <> 0.
      lv_text = |Transportation planning point { to_upper( is_params-tplst ) } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_shp( iv_shtyp = lv_shtyp iv_tplst = lv_tplst iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization to create shipments of type { lv_shtyp } / planning point { lv_tplst }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-dlv_list IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'dlv_list is required: the deliveries of the shipment' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lines( is_params-dlv_list ) > 50.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Up to 50 deliveries per shipment' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    check_shp_head( EXPORTING is_params = is_params CHANGING cs_result = rs_result ).
    LOOP AT is_params-dlv_list INTO lv_in.
      lv_vbeln = to_doc( lv_in ).
      IF lv_vbeln IS INITIAL.
        lv_text = |Delivery { lv_in } is not a valid number (digits up to 10)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      READ TABLE lt_seen TRANSPORTING NO FIELDS WITH KEY table_line = lv_vbeln.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      APPEND lv_vbeln TO lt_seen.
      check_dlv_for_shp( EXPORTING iv_vbeln = lv_vbeln CHANGING cs_result = rs_result ).
      lv_pos = lv_pos + 1.
      CLEAR ls_item.
      ls_item-delivery  = lv_vbeln.
      ls_item-itenerary = lv_pos * 10.
      APPEND ls_item TO lt_item.
    ENDLOOP.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    ls_head-shipment_type = lv_shtyp.
    ls_head-trans_plan_pt = lv_tplst.
    IF is_params-route IS NOT INITIAL.
      ls_head-shipment_route = to_upper( is_params-route ).
    ENDIF.
    IF is_params-tdlnr IS NOT INITIAL.
      ls_head-service_agent_id = to_doc( is_params-tdlnr ).
    ENDIF.
    ls_head-external_id_1 = is_params-exti1.
    ls_head-external_id_2 = is_params-exti2.

    IF iv_execute = abap_false.
      lv_text = |New shipment: type { lv_shtyp }, planning point { lv_tplst }, { lines( lt_item ) } deliveries|.
      add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = rs_result ).
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'The shipment BAPI has no test mode: this preview is the rule check (type, planning point, deliveries, route, carrier, authorization)'
               CHANGING  cs_result = rs_result ).
      LOOP AT lt_item INTO ls_item.
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'delivery' iv_value = ls_item-delivery CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      rs_result-summary = lv_text.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_SHIPMENT_CREATE'
      EXPORTING
        headerdata    = ls_head
      IMPORTING
        transport     = lv_tk
      TABLES
        itemdata      = lt_item
        return        = lt_ret
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true OR lv_tk IS INITIAL.
      do_rollback( ).
      IF rs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'No shipment was created (no number returned)' CHANGING cs_result = rs_result ).
      ENDIF.
      RETURN.
    ENDIF.
    commit_wait( CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    DO 10 TIMES.
      load_shp( EXPORTING iv_tknum = lv_tk IMPORTING es_shp = ls_shp ev_found = lv_found ).
      IF lv_found = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_found = abap_false.
      lv_text = |Shipment { fmt_doc( lv_tk ) } is not visible yet: check VT03N|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ELSE.
      shp_rows( EXPORTING is_shp = ls_shp iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    APPEND lv_tk TO rs_result-sd_new_docs.
    add_chg( EXPORTING iv_field = 'SHIPMENT' iv_old = '' iv_new = lv_tk CHANGING cs_result = rs_result ).
    rs_result-summary = |Shipment { fmt_doc( lv_tk ) } created with { lines( lt_item ) } deliveries|.
  ENDMETHOD.


  METHOD shp_change.
    DATA: lv_tknum TYPE vttk-tknum,
          ls_shp   TYPE ty_shp,
          ls_new   TYPE ty_shp,
          lv_found TYPE abap_bool,
          ls_head  TYPE bapishipmentheader,
          ls_act   TYPE bapishipmentheaderaction,
          lt_item  TYPE ty_shp_items,
          lt_iact  TYPE ty_shp_iacts,
          ls_item  TYPE bapishipmentitem,
          ls_iact  TYPE bapishipmentitemaction,
          lv_in    TYPE string,
          lv_del   TYPE abap_bool,
          lv_vbeln TYPE likp-vbeln,
          lv_tpnum TYPE vttp-tpnum,
          lv_maxtp TYPE vttp-tpnum,
          lv_any   TYPE abap_bool,
          lv_n0    TYPE i,
          lv_n1    TYPE i,
          lv_text  TYPE string.

    lv_tknum = to_doc( is_params-tknum ).
    IF lv_tknum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tknum is required (shipment, digits up to 10)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    load_shp( EXPORTING iv_tknum = lv_tknum IMPORTING es_shp = ls_shp ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_shp( iv_shtyp = ls_shp-shtyp iv_tplst = ls_shp-tplst iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to change shipments of type { ls_shp-shtyp } / planning point { ls_shp-tplst }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_shp-sttrg >= '6'.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } is { shp_status_text( ls_shp-sttrg ) }: it cannot be changed any more|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    check_shp_head( EXPORTING is_params = is_params CHANGING cs_result = rs_result ).

    ls_head-shipment_num = lv_tknum.
    IF is_params-route IS NOT INITIAL.
      ls_head-shipment_route = to_upper( is_params-route ).
      ls_act-shipment_route  = 'C'.
      lv_any = abap_true.
    ENDIF.
    IF is_params-tdlnr IS NOT INITIAL.
      ls_head-service_agent_id = to_doc( is_params-tdlnr ).
      ls_act-service_agent_id  = 'C'.
      lv_any = abap_true.
    ENDIF.
    IF is_params-exti1 IS NOT INITIAL.
      ls_head-external_id_1 = is_params-exti1.
      ls_act-external_id_1  = 'C'.
      lv_any = abap_true.
    ENDIF.
    IF is_params-exti2 IS NOT INITIAL.
      ls_head-external_id_2 = is_params-exti2.
      ls_act-external_id_2  = 'C'.
      lv_any = abap_true.
    ENDIF.

    " dlv_list: "8100000001" adds the delivery, "-8100000001" removes it.
    SELECT MAX( tpnum ) FROM vttp INTO lv_maxtp WHERE tknum = lv_tknum.
    LOOP AT is_params-dlv_list INTO lv_in.
      CONDENSE lv_in NO-GAPS.
      lv_del = abap_false.
      IF strlen( lv_in ) > 1 AND lv_in(1) = '-'.
        lv_del = abap_true.
        SHIFT lv_in LEFT BY 1 PLACES.
      ELSEIF strlen( lv_in ) > 1 AND lv_in(1) = '+'.
        SHIFT lv_in LEFT BY 1 PLACES.
      ENDIF.
      lv_vbeln = to_doc( lv_in ).
      IF lv_vbeln IS INITIAL.
        lv_text = |Delivery { lv_in } is not a valid number (digits up to 10)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      CLEAR lv_tpnum.
      SELECT SINGLE tpnum FROM vttp INTO lv_tpnum WHERE tknum = lv_tknum AND vbeln = lv_vbeln.
      CLEAR: ls_item, ls_iact.
      ls_item-delivery = lv_vbeln.
      ls_iact-delivery = 'X'.
      IF lv_del = abap_true.
        IF lv_tpnum IS INITIAL.
          lv_text = |Delivery { fmt_doc( lv_vbeln ) } is not in shipment { fmt_doc( lv_tknum ) }|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
          CONTINUE.
        ENDIF.
        ls_item-itenerary = lv_tpnum.
        ls_iact-itenerary = 'D'.
        ls_iact-delivery  = 'D'.
      ELSE.
        IF lv_tpnum IS NOT INITIAL.
          lv_text = |Delivery { fmt_doc( lv_vbeln ) } is already in shipment { fmt_doc( lv_tknum ) }|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
          CONTINUE.
        ENDIF.
        check_dlv_for_shp( EXPORTING iv_vbeln = lv_vbeln iv_tknum = lv_tknum CHANGING cs_result = rs_result ).
        lv_maxtp = lv_maxtp + 10.
        ls_item-itenerary = lv_maxtp.
        ls_iact-itenerary = 'A'.
        ls_iact-delivery  = 'A'.
      ENDIF.
      APPEND ls_item TO lt_item.
      APPEND ls_iact TO lt_iact.
      lv_any = abap_true.
    ENDLOOP.
    IF lt_item IS NOT INITIAL AND ls_shp-stdis IS NOT INITIAL.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } is already planned (status "planned" set): | &&
                |deliveries can be added or removed only before planning (VT02N)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_any = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Nothing to change: give dlv_list, route, tdlnr, exti1 or exti2'
               CHANGING cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    IF iv_execute = abap_false.
      shp_rows( EXPORTING is_shp = ls_shp iv_row = 0 CHANGING ct_rows = rs_result-rows ).
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'BAPI_SHIPMENT_CHANGE saves by itself and has no test mode: this preview is the rule check only'
               CHANGING  cs_result = rs_result ).
      rs_result-summary = |Change shipment { fmt_doc( lv_tknum ) }: { lines( lt_item ) } delivery changes|.
      RETURN.
    ENDIF.

    SELECT COUNT(*) FROM vttp INTO lv_n0 WHERE tknum = lv_tknum.
    call_shp_change( EXPORTING is_head = ls_head is_act = ls_act it_item = lt_item it_iact = lt_iact
                     CHANGING  cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    load_shp( EXPORTING iv_tknum = lv_tknum IMPORTING es_shp = ls_new ev_found = lv_found ).
    SELECT COUNT(*) FROM vttp INTO lv_n1 WHERE tknum = lv_tknum.
    IF ls_new-route <> ls_shp-route.
      add_chg( EXPORTING iv_field = 'ROUTE' iv_old = ls_shp-route iv_new = ls_new-route CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_new-tdlnr <> ls_shp-tdlnr.
      add_chg( EXPORTING iv_field = 'CARRIER' iv_old = ls_shp-tdlnr iv_new = ls_new-tdlnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_new-exti1 <> ls_shp-exti1.
      add_chg( EXPORTING iv_field = 'EXTI1' iv_old = ls_shp-exti1 iv_new = ls_new-exti1 CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_new-exti2 <> ls_shp-exti2.
      add_chg( EXPORTING iv_field = 'EXTI2' iv_old = ls_shp-exti2 iv_new = ls_new-exti2 CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_n1 <> lv_n0.
      add_chg( EXPORTING iv_field = 'DELIVERIES' iv_old = lv_n0 iv_new = lv_n1 CHANGING cs_result = rs_result ).
    ENDIF.
    IF rs_result-changes IS INITIAL.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The shipment shows no change after the save: check VT03N'
               CHANGING cs_result = rs_result ).
    ENDIF.
    shp_rows( EXPORTING is_shp = ls_new iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Shipment { fmt_doc( lv_tknum ) } changed|.
  ENDMETHOD.


  METHOD shp_status.
    " Status steps in their order; the BAPI sets every step up to the target that is still open.
    DATA: lv_tknum  TYPE vttk-tknum,
          ls_shp    TYPE ty_shp,
          ls_new    TYPE ty_shp,
          lv_found  TYPE abap_bool,
          lv_target TYPE string,
          lv_level  TYPE i,
          lv_cur    TYPE i,
          ls_head   TYPE bapishipmentheader,
          ls_act    TYPE bapishipmentheaderaction,
          lt_vbeln  TYPE STANDARD TABLE OF vttp-vbeln WITH DEFAULT KEY,
          lv_vbeln  TYPE vttp-vbeln,
          ls_dlv    TYPE ty_dlv,
          lt_items  TYPE ty_lis,
          ls_it     TYPE ty_li,
          lv_prof   TYPE tvtk-tbg_actprf,
          lt_werks  TYPE STANDARD TABLE OF werks_d WITH DEFAULT KEY,
          lv_werks  TYPE werks_d,
          lv_text   TYPE string.

    lv_tknum = to_doc( is_params-tknum ).
    IF lv_tknum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tknum is required (shipment, digits up to 10)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_target = to_lower( is_params-target ).
    CASE lv_target.
      WHEN 'planned'.      lv_level = 1.
      WHEN 'checked_in'.   lv_level = 2.
      WHEN 'load_start'.   lv_level = 3.
      WHEN 'load_end'.     lv_level = 4.
      WHEN 'completed'.    lv_level = 5.
      WHEN 'started'.      lv_level = 6.
      WHEN 'ended'.        lv_level = 7.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = 'target must be planned, checked_in, load_start, load_end, completed, started or ended'
                 CHANGING  cs_result = rs_result ).
        RETURN.
    ENDCASE.
    load_shp( EXPORTING iv_tknum = lv_tknum IMPORTING es_shp = ls_shp ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_shp( iv_shtyp = ls_shp-shtyp iv_tplst = ls_shp-tplst iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to change shipments of type { ls_shp-shtyp } / planning point { ls_shp-tplst }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_cur = ls_shp-sttrg.
    IF lv_cur >= lv_level.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } is already { shp_status_text( ls_shp-sttrg ) }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT vbeln FROM vttp INTO TABLE lt_vbeln WHERE tknum = lv_tknum.
    IF lt_vbeln IS INITIAL AND lv_level >= 5.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } has no deliveries|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_level >= 6 AND ls_shp-sttbg IS INITIAL.
      " Shipment start needs completely picked deliveries and may post the goods issue (activity profile).
      LOOP AT lt_vbeln INTO lv_vbeln.
        load_dlv( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_dlv = ls_dlv et_items = lt_items ev_found = lv_found ).
        IF lv_found = abap_true AND ( ls_dlv-kostk = 'A' OR ls_dlv-kostk = 'B' ).
          lv_text = |Delivery { fmt_doc( lv_vbeln ) } is not picked completely: shipment start is refused (VW 571)|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        ENDIF.
      ENDLOOP.
    ENDIF.
    " Shipment start / end with an activity profile can post the goods issue of the deliveries
    " (posting date today): a closed MM period then stops the save (M7 053) - check it up front.
    IF lv_level >= 6.
      IF lv_level = 6.
        SELECT SINGLE tbg_actprf FROM tvtk INTO lv_prof WHERE shtyp = ls_shp-shtyp.
      ELSE.
        SELECT SINGLE ten_actprf FROM tvtk INTO lv_prof WHERE shtyp = ls_shp-shtyp.
      ENDIF.
      IF lv_prof IS NOT INITIAL.
        LOOP AT lt_vbeln INTO lv_vbeln.
          load_dlv( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_dlv = ls_dlv et_items = lt_items ev_found = lv_found ).
          IF lv_found = abap_false OR ls_dlv-wbstk = 'C' OR ls_dlv-wbstk IS INITIAL.
            CONTINUE.
          ENDIF.
          LOOP AT lt_items INTO ls_it.
            READ TABLE lt_werks TRANSPORTING NO FIELDS WITH KEY table_line = ls_it-werks.
            IF sy-subrc <> 0.
              APPEND ls_it-werks TO lt_werks.
            ENDIF.
          ENDLOOP.
        ENDLOOP.
        IF lt_werks IS NOT INITIAL.
          lv_text = |Shipment type { ls_shp-shtyp } runs activity profile { lv_prof } at this step: | &&
                    |it can post the goods issue of the deliveries today|.
          add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
        ENDIF.
        LOOP AT lt_werks INTO lv_werks.
          check_period( EXPORTING iv_werks = lv_werks iv_date = sy-datum CHANGING cs_result = rs_result ).
        ENDLOOP.
      ENDIF.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    ls_head-shipment_num = lv_tknum.
    IF lv_level >= 1 AND ls_shp-stdis IS INITIAL.
      ls_head-status_plan = 'X'. ls_act-status_plan = 'C'.
    ENDIF.
    IF lv_level >= 2 AND ls_shp-streg IS INITIAL.
      ls_head-status_checkin = 'X'. ls_act-status_checkin = 'C'.
    ENDIF.
    IF lv_level >= 3 AND ls_shp-stlbg IS INITIAL.
      ls_head-status_load_start = 'X'. ls_act-status_load_start = 'C'.
    ENDIF.
    IF lv_level >= 4 AND ls_shp-stlad IS INITIAL.
      ls_head-status_load_end = 'X'. ls_act-status_load_end = 'C'.
    ENDIF.
    IF lv_level >= 5 AND ls_shp-stabf IS INITIAL.
      ls_head-status_compl = 'X'. ls_act-status_compl = 'C'.
    ENDIF.
    IF lv_level = 6 AND ls_shp-sttbg IS INITIAL.
      ls_head-status_shpmnt_start = 'X'. ls_act-status_shpmnt_start = 'C'.
    ENDIF.
    IF lv_level = 7 AND ls_shp-stten IS INITIAL.
      ls_head-status_shpmnt_end = 'X'. ls_act-status_shpmnt_end = 'C'.
    ENDIF.

    IF iv_execute = abap_false.
      shp_rows( EXPORTING is_shp = ls_shp iv_row = 0 CHANGING ct_rows = rs_result-rows ).
      lv_text = |Shipment { fmt_doc( lv_tknum ) }: { shp_status_text( ls_shp-sttrg ) } -> { lv_target }|.
      add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = rs_result ).
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'BAPI_SHIPMENT_CHANGE saves by itself and has no test mode: this preview is the rule check only'
               CHANGING  cs_result = rs_result ).
      rs_result-summary = lv_text.
      RETURN.
    ENDIF.

    call_shp_change( EXPORTING is_head = ls_head is_act = ls_act CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    load_shp( EXPORTING iv_tknum = lv_tknum IMPORTING es_shp = ls_new ev_found = lv_found ).
    IF ls_new-sttrg = ls_shp-sttrg.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The shipment status did not change (see messages)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    add_chg( EXPORTING iv_field = 'SHIPMENT_STATUS' iv_old = shp_status_text( ls_shp-sttrg )
                       iv_new = shp_status_text( ls_new-sttrg ) CHANGING cs_result = rs_result ).
    IF ls_new-sttrg < lv_level.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } reached "{ shp_status_text( ls_new-sttrg ) }", not "{ lv_target }"|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    shp_rows( EXPORTING is_shp = ls_new iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Shipment { fmt_doc( lv_tknum ) }: { shp_status_text( ls_new-sttrg ) }|.
  ENDMETHOD.


  METHOD call_shp_change.
    DATA: lt_ret  TYPE ty_ret,
          lt_item TYPE ty_shp_items,
          lt_iact TYPE ty_shp_iacts.

    lt_item = it_item.
    lt_iact = it_iact.
    CALL FUNCTION 'BAPI_SHIPMENT_CHANGE'
      EXPORTING
        headerdata       = is_head
        headerdataaction = is_act
      TABLES
        itemdata         = lt_item
        itemdataaction   = lt_iact
        return           = lt_ret
      EXCEPTIONS
        error_message    = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      do_rollback( ).
      RETURN.
    ENDIF.
    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD load_dlv.
    DATA: ls_vbuk  TYPE vbuk,
          ls_vbup  TYPE vbup,
          lv_found TYPE abap_bool,
          lv_q     TYPE vbfa-rfmng.
    FIELD-SYMBOLS <ls_it> TYPE ty_li.

    CLEAR: es_dlv, et_items, ev_found.
    SELECT SINGLE vbeln vstel lfart wadat kodat route lgnum
      FROM likp INTO CORRESPONDING FIELDS OF es_dlv WHERE vbeln = iv_vbeln.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    ev_found = abap_true.
    zcl_mcp_biz_sys=>get( )->sd_read_vbuk( EXPORTING iv_vbeln = iv_vbeln iv_table = `LIKP`
                                           IMPORTING es_vbuk = ls_vbuk ev_found = lv_found ).
    es_dlv-kostk = ls_vbuk-kostk.
    es_dlv-lvstk = ls_vbuk-lvstk.
    es_dlv-pkstk = ls_vbuk-pkstk.
    es_dlv-wbstk = ls_vbuk-wbstk.
    es_dlv-fkstk = ls_vbuk-fkstk.
    es_dlv-trsta = ls_vbuk-trsta.
    es_dlv-vbtyp = ls_vbuk-vbtyp.
    IF es_dlv-vbtyp IS INITIAL.
      SELECT SINGLE vbtyp FROM likp INTO es_dlv-vbtyp WHERE vbeln = iv_vbeln.
    ENDIF.
    SELECT posnr matnr werks lgort charg lfimg lgmng vrkme meins lgnum uecha
      FROM lips INTO CORRESPONDING FIELDS OF TABLE et_items
      WHERE vbeln = iv_vbeln ORDER BY posnr.
    LOOP AT et_items ASSIGNING <ls_it>.
      CLEAR ls_vbup.
      zcl_mcp_biz_sys=>get( )->sd_read_vbup( EXPORTING iv_vbeln = iv_vbeln iv_posnr = <ls_it>-posnr iv_table = `LIPS`
                                             IMPORTING es_vbup = ls_vbup ev_found = lv_found ).
      <ls_it>-kosta = ls_vbup-kosta.
      <ls_it>-lvsta = ls_vbup-lvsta.
      <ls_it>-pksta = ls_vbup-pksta.
      <ls_it>-wbsta = ls_vbup-wbsta.
      " Picked quantity: picking requests (document flow Q) of the item, sales units.
      CLEAR lv_q.
      SELECT SUM( rfmng ) FROM vbfa INTO lv_q
        WHERE vbelv = iv_vbeln AND posnv = <ls_it>-posnr AND vbtyp_n = 'Q'.
      <ls_it>-picked = lv_q.
    ENDLOOP.
  ENDMETHOD.


  METHOD open_dlv.
    " Common entry of the delivery write actions: number, existence, category, authorization, goods issue.
    DATA: lv_vbeln TYPE likp-vbeln,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    CLEAR: es_dlv, et_items.
    lv_vbeln = to_doc( iv_in ).
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (delivery, digits up to 10)' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_dlv( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_dlv = es_dlv et_items = et_items ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Delivery { fmt_doc( lv_vbeln ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_dlv-vbtyp <> 'J'.
      lv_text = |Document { fmt_doc( lv_vbeln ) } is not an outbound delivery|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_dlv( iv_vstel = es_dlv-vstel iv_actvt = iv_actvt ) = abap_false.
      lv_text = |No authorization for deliveries of shipping point { es_dlv-vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF iv_actvt = '02' AND es_dlv-wbstk = 'C'.
      lv_text = |Goods issue of delivery { fmt_doc( lv_vbeln ) } is already posted: the delivery cannot be changed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD dlv_rows.
    add_kv( EXPORTING iv_row = iv_row iv_name = 'vbeln' iv_value = is_dlv-vbeln CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'vstel' iv_value = is_dlv-vstel CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'lfart' iv_value = is_dlv-lfart CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'planned_gi' iv_value = is_dlv-wadat CHANGING ct_rows = ct_rows ).
    IF is_dlv-kodat IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'picking_date' iv_value = is_dlv-kodat CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_dlv-route IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'route' iv_value = is_dlv-route CHANGING ct_rows = ct_rows ).
    ENDIF.
    IF is_dlv-lgnum IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'lgnum' iv_value = is_dlv-lgnum CHANGING ct_rows = ct_rows ).
    ENDIF.
    add_kv( EXPORTING iv_row = iv_row iv_name = 'picking' iv_value = is_dlv-kostk CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'wm' iv_value = is_dlv-lvstk CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'packing' iv_value = is_dlv-pkstk CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'goods_issue' iv_value = is_dlv-wbstk CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'billing' iv_value = is_dlv-fkstk CHANGING ct_rows = ct_rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'transport' iv_value = is_dlv-trsta CHANGING ct_rows = ct_rows ).
  ENDMETHOD.


  METHOD dlv_to_pick.
    DATA: lv_vstel TYPE likp-vstel,
          lv_basis TYPE string,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_row   TYPE i,
          lt_dlv   TYPE ty_dlvs,
          ls_dlv   TYPE ty_dlv,
          lt_kodat TYPE RANGE OF likp-kodat,
          ls_kodat LIKE LINE OF lt_kodat,
          lv_text  TYPE string.

    lv_vstel = to_upper( is_params-vstel ).
    IF lv_vstel IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vstel is required (shipping point)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_dlv( iv_vstel = lv_vstel iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display deliveries of shipping point { lv_vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_basis = to_lower( is_params-date_basis ).
    IF lv_basis IS INITIAL.
      lv_basis = 'all'.
    ENDIF.
    CASE lv_basis.
      WHEN 'pick_today'.
        ls_kodat-sign = 'I'. ls_kodat-option = 'EQ'. ls_kodat-low = sy-datum. APPEND ls_kodat TO lt_kodat.
      WHEN 'pick_overdue_until_today'.
        ls_kodat-sign = 'I'. ls_kodat-option = 'LE'. ls_kodat-low = sy-datum. APPEND ls_kodat TO lt_kodat.
      WHEN 'all'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_basis must be pick_today, pick_overdue_until_today or all'
                 CHANGING cs_result = rs_result ).
        RETURN.
    ENDCASE.
    lv_max = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.
    SELECT l~vbeln l~vstel l~lfart l~wadat l~kodat l~route l~lgnum
           u~kostk u~lvstk u~pkstk u~wbstk u~fkstk u~trsta u~vbtyp
      FROM likp AS l INNER JOIN vbuk AS u ON u~vbeln = l~vbeln
      INTO TABLE lt_dlv UP TO lv_fetch ROWS
      WHERE l~vstel = lv_vstel AND u~vbtyp = 'J'
        AND ( u~kostk = 'A' OR u~kostk = 'B' ) AND u~wbstk <> 'C'
        AND l~kodat IN lt_kodat
      ORDER BY l~kodat l~vbeln.
    IF lines( lt_dlv ) > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_dlv FROM lv_fetch.
    ENDIF.
    LOOP AT lt_dlv INTO ls_dlv.
      lv_row = lv_row + 1.
      dlv_rows( EXPORTING is_dlv = ls_dlv iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-summary = |{ lv_row } deliveries of shipping point { lv_vstel } to pick ({ lv_basis })|.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; more exist, raise max_rows|.
    ENDIF.
  ENDMETHOD.


  METHOD dlv_status.
    DATA: ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          ls_it    TYPE ty_li,
          lv_tk    TYPE vttp-tknum,
          lv_hus   TYPE i,
          lv_row   TYPE i.

    open_dlv( EXPORTING iv_in = is_params-vbeln iv_actvt = '03'
              IMPORTING es_dlv = ls_dlv et_items = lt_items
              CHANGING  cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    dlv_rows( EXPORTING is_dlv = ls_dlv iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    SELECT tknum FROM vttp UP TO 1 ROWS INTO lv_tk WHERE vbeln = ls_dlv-vbeln.
    ENDSELECT.
    IF lv_tk IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 0 iv_name = 'shipment' iv_value = lv_tk CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    SELECT COUNT(*) FROM vekp INTO lv_hus WHERE vpobj = '01' AND vpobjkey = ls_dlv-vbeln.
    add_kv( EXPORTING iv_row = 0 iv_name = 'handling_units' iv_value = lv_hus CHANGING ct_rows = rs_result-rows ).
    LOOP AT lt_items INTO ls_it.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'posnr' iv_value = ls_it-posnr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'matnr' iv_value = ls_it-matnr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'werks' iv_value = ls_it-werks CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'lgort' iv_value = ls_it-lgort CHANGING ct_rows = rs_result-rows ).
      IF ls_it-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'charg' iv_value = ls_it-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'qty' iv_value = fmt_qty( ls_it-lfimg ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'picked' iv_value = fmt_qty( ls_it-picked ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'unit' iv_value = ls_it-vrkme CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'picking' iv_value = ls_it-kosta CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'wm' iv_value = ls_it-lvsta CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'packing' iv_value = ls_it-pksta CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'goods_issue' iv_value = ls_it-wbsta CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-summary = |Delivery { fmt_doc( ls_dlv-vbeln ) }: picking { ls_dlv-kostk }, WM { ls_dlv-lvstk }, | &&
                        |packing { ls_dlv-pkstk }, goods issue { ls_dlv-wbstk }, billing { ls_dlv-fkstk }, | &&
                        |transport { ls_dlv-trsta }, { lines( lt_items ) } items|.
  ENDMETHOD.


  METHOD parse_reqs.
    " "POSNR:QTY" rows.
    DATA: lv_in   TYPE string,
          lv_pos  TYPE string,
          lv_qtx  TYPE string,
          ls_req  TYPE ty_req,
          lv_ok   TYPE abap_bool,
          lv_text TYPE string.

    CLEAR et_reqs.
    LOOP AT it_items INTO lv_in.
      CONDENSE lv_in NO-GAPS.
      SPLIT lv_in AT ':' INTO lv_pos lv_qtx.
      IF lv_pos IS INITIAL OR lv_pos CN '0123456789' OR strlen( lv_pos ) > 6 OR lv_qtx IS INITIAL.
        lv_text = |Item entry { lv_in } must look like POSNR:QTY (e.g. 10:5)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      CLEAR ls_req.
      ls_req-posnr = lv_pos.
      to_qty( EXPORTING iv_in = lv_qtx IMPORTING ev_qty = ls_req-qty ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        lv_text = |Quantity { lv_qtx } of item { lv_pos } must be a number of 0 or more|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      APPEND ls_req TO et_reqs.
    ENDLOOP.
  ENDMETHOD.


  METHOD call_ws.
    DATA: lt_pok   TYPE ty_poks,
          lt_verko TYPE ty_verkos,
          lt_verpo TYPE ty_verpos,
          lt_prot  TYPE ty_prots,
          lv_any   TYPE xfeld,
          lv_upd   TYPE rvsel-xfeld,
          lv_dbu   TYPE leshp_database_update.

    lt_pok   = it_pok.
    lt_verko = it_verko.
    lt_verpo = it_verpo.
    IF iv_picking = abap_true.
      lv_upd = 'X'.
    ENDIF.
    IF iv_execute = abap_true.
      lv_dbu = c_db_save.
    ELSE.
      lv_dbu = c_db_check.
    ENDIF.
    CALL FUNCTION 'WS_DELIVERY_UPDATE_2'
      EXPORTING
        vbkok_wa             = is_ok
        delivery             = iv_vbeln
        update_picking       = lv_upd
        if_database_update_1 = lv_dbu
      IMPORTING
        ef_error_any         = lv_any
      TABLES
        vbpok_tab            = lt_pok
        prot                 = lt_prot
        verko_tab            = lt_verko
        verpo_tab            = lt_verpo
      EXCEPTIONS
        error_message        = 1
        OTHERS               = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_prot( EXPORTING it_prot = lt_prot CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF lv_any = 'X' AND cs_result-failed = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The delivery update reported an error' CHANGING cs_result = cs_result ).
      finish( CHANGING cs_result = cs_result ).
    ENDIF.
    IF iv_execute = abap_false OR cs_result-failed = abap_true.
      do_rollback( ).
      IF iv_execute = abap_false AND cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'I' iv_text = 'Preview = delivery update in check mode (nothing is saved)'
                 CHANGING cs_result = cs_result ).
      ENDIF.
      RETURN.
    ENDIF.
    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD dlv_pick.
    DATA: ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          ls_it    TYPE ty_li,
          lt_reqs  TYPE ty_reqs,
          ls_req   TYPE ty_req,
          ls_ok    TYPE vbkok,
          lt_pok   TYPE ty_poks,
          ls_pok   TYPE vbpok,
          lv_all   TYPE abap_bool,
          lv_pick  TYPE string,
          ls_new   TYPE ty_dlv,
          lt_new   TYPE ty_lis,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    open_dlv( EXPORTING iv_in = is_params-vbeln iv_actvt = '02'
              IMPORTING es_dlv = ls_dlv et_items = lt_items
              CHANGING  cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF ls_dlv-kostk IS INITIAL.
      lv_text = |Delivery { fmt_doc( ls_dlv-vbeln ) } is not relevant for picking|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_pick = to_upper( is_params-pick_all ).
    IF lv_pick = 'X' OR lv_pick = 'TRUE' OR lv_pick = 'YES'.
      lv_all = abap_true.
    ENDIF.
    IF lv_all = abap_true AND is_params-items IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Give either pick_all or items (POSNR:QTY), not both' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_all = abap_false AND is_params-items IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Give items (POSNR:QTY picked) or pick_all = X' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_all = abap_true.
      LOOP AT lt_items INTO ls_it WHERE kosta = 'A' OR kosta = 'B'.
        ls_req-posnr = ls_it-posnr.
        ls_req-qty   = ls_it-lfimg.
        APPEND ls_req TO lt_reqs.
      ENDLOOP.
      IF lt_reqs IS INITIAL.
        lv_text = |Delivery { fmt_doc( ls_dlv-vbeln ) } has no item left to pick|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ELSE.
      parse_reqs( EXPORTING it_items = is_params-items IMPORTING et_reqs = lt_reqs CHANGING cs_result = rs_result ).
    ENDIF.
    LOOP AT lt_reqs INTO ls_req.
      READ TABLE lt_items INTO ls_it WITH KEY posnr = ls_req-posnr.
      IF sy-subrc <> 0.
        lv_text = |Item { ls_req-posnr } does not exist in delivery { fmt_doc( ls_dlv-vbeln ) }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      IF ls_it-kosta IS INITIAL.
        lv_text = |Item { ls_it-posnr } is not relevant for picking|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      IF ls_it-lgnum IS NOT INITIAL OR ls_it-lvsta = 'A' OR ls_it-lvsta = 'B'.
        lv_text = |Item { ls_it-posnr } is warehouse managed (WM { ls_it-lgnum }): pick it by confirming the transfer order|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      " The update accepts over-picking without a message (seen on the test system): refuse it here.
      IF ls_req-qty > ls_it-lfimg.
        lv_text = |Item { ls_it-posnr }: picked quantity { fmt_qty( ls_req-qty ) } is above the delivery quantity { fmt_qty( ls_it-lfimg ) } { ls_it-vrkme }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      CLEAR ls_pok.
      ls_pok-vbeln_vl = ls_dlv-vbeln.
      ls_pok-posnr_vl = ls_it-posnr.
      ls_pok-vbeln    = ls_dlv-vbeln.
      ls_pok-posnn    = ls_it-posnr.
      ls_pok-matnr    = ls_it-matnr.
      ls_pok-werks    = ls_it-werks.
      ls_pok-charg    = ls_it-charg.
      ls_pok-lfimg    = ls_it-lfimg.
      ls_pok-pikmg    = ls_req-qty.
      ls_pok-vrkme    = ls_it-vrkme.
      APPEND ls_pok TO lt_pok.
    ENDLOOP.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    ls_ok-vbeln_vl = ls_dlv-vbeln.
    ls_ok-vbtyp_vl = 'J'.
    call_ws( EXPORTING iv_vbeln = ls_dlv-vbeln is_ok = ls_ok it_pok = lt_pok iv_picking = abap_true
                       iv_execute = iv_execute
             CHANGING  cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF iv_execute = abap_false.
      LOOP AT lt_pok INTO ls_pok.
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'posnr' iv_value = ls_pok-posnr_vl CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'pick_qty' iv_value = fmt_qty( ls_pok-pikmg ) CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      rs_result-summary = |Pick { lines( lt_pok ) } items of delivery { fmt_doc( ls_dlv-vbeln ) }|.
      RETURN.
    ENDIF.
    DO 10 TIMES.
      load_dlv( EXPORTING iv_vbeln = ls_dlv-vbeln IMPORTING es_dlv = ls_new et_items = lt_new ev_found = lv_found ).
      IF ls_new-kostk <> ls_dlv-kostk.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    add_chg( EXPORTING iv_field = 'PICKING_STATUS' iv_old = ls_dlv-kostk iv_new = ls_new-kostk CHANGING cs_result = rs_result ).
    IF ls_new-kostk = ls_dlv-kostk.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The picking status did not change yet: check VL03N' CHANGING cs_result = rs_result ).
    ENDIF.
    dlv_rows( EXPORTING is_dlv = ls_new iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Delivery { fmt_doc( ls_dlv-vbeln ) } picked: picking status { ls_dlv-kostk } -> { ls_new-kostk }|.
  ENDMETHOD.


  METHOD dlv_change.
    DATA: ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          ls_it    TYPE ty_li,
          ls_ok    TYPE vbkok,
          lt_pok   TYPE ty_poks,
          ls_pok   TYPE vbpok,
          lv_date  TYPE d,
          lv_posnr TYPE lips-posnr,
          lv_qty   TYPE lips-lfimg,
          lv_ok    TYPE abap_bool,
          ls_new   TYPE ty_dlv,
          lt_new   TYPE ty_lis,
          ls_nit   TYPE ty_li,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    open_dlv( EXPORTING iv_in = is_params-vbeln iv_actvt = '02'
              IMPORTING es_dlv = ls_dlv et_items = lt_items
              CHANGING  cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF is_params-new_date IS INITIAL AND is_params-new_quantity IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Nothing to change: give new_date (planned goods issue) and / or posnr + new_quantity'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    ls_ok-vbeln_vl = ls_dlv-vbeln.
    ls_ok-vbtyp_vl = 'J'.
    IF is_params-new_date IS NOT INITIAL.
      lv_date = to_date( is_params-new_date ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_date must be a valid date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_date = ls_dlv-wadat.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'The planned goods issue date is already this date' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_date < sy-datum.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'new_date is in the past' CHANGING cs_result = rs_result ).
      ENDIF.
      ls_ok-wadat = lv_date.
      ls_ok-kzwad = 'X'.
    ENDIF.
    IF is_params-new_quantity IS NOT INITIAL.
      IF is_params-posnr IS INITIAL OR is_params-posnr CN '0123456789' OR strlen( is_params-posnr ) > 6.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'posnr is required with new_quantity (item, digits up to 6)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_posnr = is_params-posnr.
      READ TABLE lt_items INTO ls_it WITH KEY posnr = lv_posnr.
      IF sy-subrc <> 0.
        lv_text = |Item { lv_posnr } does not exist in delivery { fmt_doc( ls_dlv-vbeln ) }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      to_qty( EXPORTING iv_in = is_params-new_quantity IMPORTING ev_qty = lv_qty ev_ok = lv_ok ).
      IF lv_ok = abap_false OR lv_qty <= 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_quantity must be a number above 0 (deleting items is not offered)'
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_qty = ls_it-lfimg.
        lv_text = |Item { lv_posnr } already has delivery quantity { fmt_qty( lv_qty ) } { ls_it-vrkme }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF ls_it-picked > 0 AND lv_qty < ls_it-picked.
        lv_text = |Item { lv_posnr } is picked { fmt_qty( ls_it-picked ) }: the delivery quantity cannot go below it (VL 019)|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF ls_it-lvsta = 'B' OR ls_it-lvsta = 'C'.
        lv_text = |Item { lv_posnr } has a transfer order: change the quantity in WM first|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_qty > ls_it-lfimg.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'A higher delivery quantity is checked against the order and availability at save'
                 CHANGING cs_result = rs_result ).
      ENDIF.
      CLEAR ls_pok.
      ls_pok-vbeln_vl = ls_dlv-vbeln.
      ls_pok-posnr_vl = ls_it-posnr.
      ls_pok-vbeln    = ls_dlv-vbeln.
      ls_pok-posnn    = ls_it-posnr.
      ls_pok-matnr    = ls_it-matnr.
      ls_pok-werks    = ls_it-werks.
      ls_pok-charg    = ls_it-charg.
      ls_pok-lfimg    = lv_qty.
      ls_pok-vrkme    = ls_it-vrkme.
      ls_pok-lianp    = 'X'.
      APPEND ls_pok TO lt_pok.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    call_ws( EXPORTING iv_vbeln = ls_dlv-vbeln is_ok = ls_ok it_pok = lt_pok iv_execute = iv_execute
             CHANGING  cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF iv_execute = abap_false.
      IF lv_date IS NOT INITIAL.
        add_chg( EXPORTING iv_field = 'PLANNED_GI_DATE' iv_old = ls_dlv-wadat iv_new = lv_date CHANGING cs_result = rs_result ).
      ENDIF.
      IF lt_pok IS NOT INITIAL.
        add_chg( EXPORTING iv_field = |QTY { lv_posnr }| iv_old = fmt_qty( ls_it-lfimg ) iv_new = fmt_qty( lv_qty )
                 CHANGING cs_result = rs_result ).
      ENDIF.
      rs_result-summary = |Change delivery { fmt_doc( ls_dlv-vbeln ) }|.
      RETURN.
    ENDIF.
    load_dlv( EXPORTING iv_vbeln = ls_dlv-vbeln IMPORTING es_dlv = ls_new et_items = lt_new ev_found = lv_found ).
    IF lv_date IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'PLANNED_GI_DATE' iv_old = ls_dlv-wadat iv_new = ls_new-wadat CHANGING cs_result = rs_result ).
      IF ls_new-wadat <> lv_date.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'The planned goods issue date read back differs from the request (rescheduling)'
                 CHANGING cs_result = rs_result ).
      ENDIF.
    ENDIF.
    IF lt_pok IS NOT INITIAL.
      READ TABLE lt_new INTO ls_nit WITH KEY posnr = lv_posnr.
      add_chg( EXPORTING iv_field = |QTY { lv_posnr }| iv_old = fmt_qty( ls_it-lfimg ) iv_new = fmt_qty( ls_nit-lfimg )
               CHANGING cs_result = rs_result ).
      IF ls_nit-lfimg <> lv_qty.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'The delivery quantity read back differs from the request: check VL03N'
                 CHANGING cs_result = rs_result ).
      ENDIF.
    ENDIF.
    dlv_rows( EXPORTING is_dlv = ls_new iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Delivery { fmt_doc( ls_dlv-vbeln ) } changed|.
  ENDMETHOD.


  METHOD dlv_split.
    DATA: ls_dlv    TYPE ty_dlv,
          lt_items  TYPE ty_lis,
          ls_it     TYPE ty_li,
          lt_reqs   TYPE ty_reqs,
          ls_req    TYPE ty_req,
          lt_data   TYPE STANDARD TABLE OF bapiobdlvitemdsp WITH DEFAULT KEY,
          ls_data   TYPE bapiobdlvitemdsp,
          lt_ret    TYPE ty_ret,
          ls_ret    TYPE bapiret2,
          lv_pmode  TYPE tvdss-pmode,
          lv_new    TYPE likp-vbeln,
          lv_cand   TYPE likp-vbeln,
          lv_cnt    TYPE i,
          lv_text   TYPE string.

    open_dlv( EXPORTING iv_in = is_params-vbeln iv_actvt = '02'
              IMPORTING es_dlv = ls_dlv et_items = lt_items
              CHANGING  cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF is_params-items IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'items is required: POSNR:QTY that move to the new delivery'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_dlv-lvstk = 'B' OR ls_dlv-lvstk = 'C'.
      lv_text = |Delivery { fmt_doc( ls_dlv-vbeln ) } has transfer orders: split it in WM first|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_dlv-trsta = 'B' OR ls_dlv-trsta = 'C'.
      lv_text = |Delivery { fmt_doc( ls_dlv-vbeln ) } is in a shipment: the split can move items out of the shipment planning|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    parse_reqs( EXPORTING it_items = is_params-items IMPORTING et_reqs = lt_reqs CHANGING cs_result = rs_result ).
    LOOP AT lt_reqs INTO ls_req.
      READ TABLE lt_items INTO ls_it WITH KEY posnr = ls_req-posnr.
      IF sy-subrc <> 0.
        lv_text = |Item { ls_req-posnr } does not exist in delivery { fmt_doc( ls_dlv-vbeln ) }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      IF ls_req-qty <= 0 OR ls_req-qty > ls_it-lfimg.
        lv_text = |Item { ls_it-posnr }: split quantity must be above 0 and at most { fmt_qty( ls_it-lfimg ) } { ls_it-vrkme }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      IF ls_it-picked > 0.
        lv_text = |Item { ls_it-posnr } is already picked: reset the picking before the split|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      CLEAR ls_data.
      ls_data-deliv_numb = ls_dlv-vbeln.
      ls_data-deliv_item = ls_it-posnr.
      ls_data-dlv_qty    = ls_req-qty.
      ls_data-sales_unit = ls_it-vrkme.
      SELECT SINGLE umvkz umvkn FROM lips INTO (ls_data-sales_qty_num, ls_data-sales_qty_denom)
        WHERE vbeln = ls_dlv-vbeln AND posnr = ls_it-posnr.
      IF ls_data-sales_qty_num IS INITIAL OR ls_data-sales_qty_denom IS INITIAL.
        ls_data-sales_qty_num   = 1.
        ls_data-sales_qty_denom = 1.
      ENDIF.
      ls_data-base_uom      = ls_it-meins.
      ls_data-dlv_qty_stock = ls_req-qty * ls_data-sales_qty_num / ls_data-sales_qty_denom.
      ls_data-convfactor    = ls_data-sales_qty_num / ls_data-sales_qty_denom.
      APPEND ls_data TO lt_data.
    ENDLOOP.
    lv_cnt = 0.
    LOOP AT lt_reqs INTO ls_req.
      READ TABLE lt_items INTO ls_it WITH KEY posnr = ls_req-posnr.
      IF sy-subrc = 0 AND ls_req-qty = ls_it-lfimg.
        lv_cnt = lv_cnt + 1.
      ENDIF.
    ENDLOOP.
    IF lv_cnt = lines( lt_items ) AND lv_cnt > 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Every item would move completely: nothing would stay in the delivery'
               CHANGING cs_result = rs_result ).
    ENDIF.
    " Split profile (TVDSS): standard 0001 when it exists, else the first one.
    SELECT SINGLE pmode FROM tvdss INTO lv_pmode WHERE pmode = '0001'.
    IF sy-subrc <> 0.
      SELECT pmode FROM tvdss UP TO 1 ROWS INTO lv_pmode ORDER BY pmode.
      ENDSELECT.
    ENDIF.
    IF lv_pmode IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No delivery split profile is configured (TVDSS)' CHANGING cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    IF iv_execute = abap_false.
      LOOP AT lt_data INTO ls_data.
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'posnr' iv_value = ls_data-deliv_item CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'move_qty' iv_value = fmt_qty( ls_data-dlv_qty ) CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'The split BAPI has no test mode: this preview is the rule check (status, quantities, picking, WM, split profile)'
               CHANGING  cs_result = rs_result ).
      rs_result-summary = |Split { lines( lt_data ) } items of delivery { fmt_doc( ls_dlv-vbeln ) } into a new delivery (profile { lv_pmode })|.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_OUTB_DELIVERY_SPLIT_DEC'
      EXPORTING
        delivery              = ls_dlv-vbeln
        deliverynew           = lv_new
        deliveryitemsbelongto = 'N'
        businessprocess       = lv_pmode
      TABLES
        itemdata              = lt_data
        return                = lt_ret
      EXCEPTIONS
        error_message         = 1
        OTHERS                = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      do_rollback( ).
      RETURN.
    ENDIF.
    commit_wait( CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    " New delivery: a 10-digit number in the messages other than the original one.
    LOOP AT lt_ret INTO ls_ret.
      lv_cand = ls_ret-message_v1.
      IF lv_cand CO '0123456789 ' AND lv_cand IS NOT INITIAL.
        CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
          EXPORTING input  = lv_cand
          IMPORTING output = lv_cand.
        IF lv_cand <> ls_dlv-vbeln.
          SELECT SINGLE vbeln FROM likp INTO lv_cand WHERE vbeln = lv_cand.
          IF sy-subrc = 0.
            lv_new = lv_cand.
            EXIT.
          ENDIF.
        ENDIF.
      ENDIF.
    ENDLOOP.
    IF lv_new IS NOT INITIAL.
      APPEND lv_new TO rs_result-sd_new_docs.
      add_chg( EXPORTING iv_field = 'NEW_DELIVERY' iv_old = '' iv_new = lv_new CHANGING cs_result = rs_result ).
      rs_result-summary = |Delivery { fmt_doc( ls_dlv-vbeln ) } split: new delivery { fmt_doc( lv_new ) }|.
    ELSE.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The new delivery number was not returned: check the document flow (VL03N)'
               CHANGING cs_result = rs_result ).
      rs_result-summary = |Delivery { fmt_doc( ls_dlv-vbeln ) } split|.
    ENDIF.
  ENDMETHOD.


  METHOD hu_list.
    TYPES: BEGIN OF ty_hu,
             venum    TYPE vekp-venum,
             exidv    TYPE vekp-exidv,
             vhilm    TYPE vekp-vhilm,
             werks    TYPE vekp-werks,
             lgort    TYPE vekp-lgort,
             vpobj    TYPE vekp-vpobj,
             vpobjkey TYPE vekp-vpobjkey,
             brgew    TYPE vekp-brgew,
             gewei    TYPE vekp-gewei,
             erdat    TYPE vekp-erdat,
           END OF ty_hu.
    DATA: lt_hu    TYPE STANDARD TABLE OF ty_hu WITH DEFAULT KEY,
          ls_hu    TYPE ty_hu,
          lv_vbeln TYPE likp-vbeln,
          ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          lv_werks TYPE vekp-werks,
          lv_lgort TYPE vekp-lgort,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_row   TYPE i,
          lv_n     TYPE i,
          lv_key   TYPE vekp-vpobjkey,
          lt_lgort TYPE RANGE OF vekp-lgort,
          ls_lgort LIKE LINE OF lt_lgort.

    lv_max = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.
    IF is_params-vbeln IS NOT INITIAL.
      open_dlv( EXPORTING iv_in = is_params-vbeln iv_actvt = '03'
                IMPORTING es_dlv = ls_dlv et_items = lt_items
                CHANGING  cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
      IF rs_result-failed = abap_true.
        RETURN.
      ENDIF.
      lv_vbeln = ls_dlv-vbeln.
      lv_key = lv_vbeln.
      SELECT venum exidv vhilm werks lgort vpobj vpobjkey brgew gewei erdat
        FROM vekp INTO TABLE lt_hu UP TO lv_fetch ROWS
        WHERE vpobj = '01' AND vpobjkey = lv_key ORDER BY venum.
    ELSE.
      lv_werks = to_upper( is_params-werks ).
      IF lv_werks IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'Give vbeln (HUs of a delivery) or werks [+ lgort] (HUs in stock)'
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_lgort = to_upper( is_params-lgort ).
      IF lv_lgort IS NOT INITIAL.
        ls_lgort-sign = 'I'. ls_lgort-option = 'EQ'. ls_lgort-low = lv_lgort. APPEND ls_lgort TO lt_lgort.
      ENDIF.
      " HUs in stock (packing object 12 = non-assigned HU) of the plant / storage location.
      SELECT venum exidv vhilm werks lgort vpobj vpobjkey brgew gewei erdat
        FROM vekp INTO TABLE lt_hu UP TO lv_fetch ROWS
        WHERE werks = lv_werks AND lgort IN lt_lgort AND vpobj = '12'
        ORDER BY venum.
    ENDIF.
    IF lines( lt_hu ) > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_hu FROM lv_fetch.
    ENDIF.
    LOOP AT lt_hu INTO ls_hu.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'exidv' iv_value = ls_hu-exidv CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'packaging' iv_value = ls_hu-vhilm CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'werks' iv_value = ls_hu-werks CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'lgort' iv_value = ls_hu-lgort CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'object' iv_value = ls_hu-vpobj CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'object_key' iv_value = ls_hu-vpobjkey CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'gross_weight' iv_value = ls_hu-brgew CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'weight_unit' iv_value = ls_hu-gewei CHANGING ct_rows = rs_result-rows ).
      SELECT COUNT(*) FROM vepo INTO lv_n WHERE venum = ls_hu-venum.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'items' iv_value = lv_n CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF lv_vbeln IS NOT INITIAL.
      rs_result-summary = |{ lv_row } handling units on delivery { fmt_doc( lv_vbeln ) }|.
    ELSE.
      rs_result-summary = |{ lv_row } handling units in stock in plant { lv_werks }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; more exist, raise max_rows|.
    ENDIF.
  ENDMETHOD.


  METHOD hu_detail.
    TYPES: BEGIN OF ty_vp,
             vepos TYPE vepo-vepos,
             velin TYPE vepo-velin,
             vbeln TYPE vepo-vbeln,
             posnr TYPE vepo-posnr,
             matnr TYPE vepo-matnr,
             charg TYPE vepo-charg,
             vemng TYPE vepo-vemng,
             vemeh TYPE vepo-vemeh,
             werks TYPE vepo-werks,
             lgort TYPE vepo-lgort,
             unvel TYPE vepo-unvel,
           END OF ty_vp.
    DATA: lv_exidv TYPE vekp-exidv,
          lv_venum TYPE vekp-venum,
          lv_vhilm TYPE vekp-vhilm,
          lv_werks TYPE vekp-werks,
          lv_lgort TYPE vekp-lgort,
          lv_vpobj TYPE vekp-vpobj,
          lv_key   TYPE vekp-vpobjkey,
          lv_vstel TYPE likp-vstel,
          lt_vp    TYPE STANDARD TABLE OF ty_vp WITH DEFAULT KEY,
          ls_vp    TYPE ty_vp,
          lv_row   TYPE i,
          lv_text  TYPE string.

    lv_exidv = is_params-exidv.
    CONDENSE lv_exidv NO-GAPS.
    IF lv_exidv IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'exidv is required (handling unit number)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_exidv CO '0123456789 '.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_exidv
        IMPORTING output = lv_exidv.
    ENDIF.
    SELECT SINGLE venum vhilm werks lgort vpobj vpobjkey
      FROM vekp INTO (lv_venum, lv_vhilm, lv_werks, lv_lgort, lv_vpobj, lv_key)
      WHERE exidv = lv_exidv.
    IF sy-subrc <> 0.
      lv_text = |Handling unit { is_params-exidv } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_vpobj = '01'.
      SELECT SINGLE vstel FROM likp INTO lv_vstel WHERE vbeln = lv_key(10).
      IF lv_vstel IS NOT INITIAL AND auth_dlv( iv_vstel = lv_vstel iv_actvt = '03' ) = abap_false.
        lv_text = |No authorization to display deliveries of shipping point { lv_vstel }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    add_kv( EXPORTING iv_row = 0 iv_name = 'exidv' iv_value = lv_exidv CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'packaging' iv_value = lv_vhilm CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'werks' iv_value = lv_werks CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'lgort' iv_value = lv_lgort CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'object' iv_value = lv_vpobj CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'object_key' iv_value = lv_key CHANGING ct_rows = rs_result-rows ).
    SELECT vepos velin vbeln posnr matnr charg vemng vemeh werks lgort unvel
      FROM vepo INTO TABLE lt_vp WHERE venum = lv_venum ORDER BY vepos.
    LOOP AT lt_vp INTO ls_vp.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'item' iv_value = ls_vp-vepos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'type' iv_value = ls_vp-velin CHANGING ct_rows = rs_result-rows ).
      IF ls_vp-vbeln IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'vbeln' iv_value = ls_vp-vbeln CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'posnr' iv_value = ls_vp-posnr CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'matnr' iv_value = ls_vp-matnr CHANGING ct_rows = rs_result-rows ).
      IF ls_vp-charg IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'charg' iv_value = ls_vp-charg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'qty' iv_value = ls_vp-vemng CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'unit' iv_value = ls_vp-vemeh CHANGING ct_rows = rs_result-rows ).
      IF ls_vp-unvel IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'inner_hu' iv_value = ls_vp-unvel CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |Handling unit { is_params-exidv }: packaging { lv_vhilm }, { lv_row } items|.
  ENDMETHOD.


  METHOD hu_pack.
    " One new handling unit on the delivery, packed with the given items (or every unpacked item).
    DATA: ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          ls_it    TYPE ty_li,
          lt_reqs  TYPE ty_reqs,
          ls_req   TYPE ty_req,
          lv_vhilm TYPE mara-matnr,
          lv_vhart TYPE mara-vhart,
          lv_packed TYPE vepo-vemng,
          lv_open  TYPE lips-lfimg,
          ls_ok    TYPE vbkok,
          lt_verko TYPE ty_verkos,
          ls_verko TYPE verko,
          lt_verpo TYPE ty_verpos,
          ls_verpo TYPE verpo,
          lv_n0    TYPE i,
          lv_n1    TYPE i,
          lv_key   TYPE vekp-vpobjkey,
          lv_exidv TYPE vekp-exidv,
          lv_text  TYPE string.

    open_dlv( EXPORTING iv_in = is_params-vbeln iv_actvt = '02'
              IMPORTING es_dlv = ls_dlv et_items = lt_items
              CHANGING  cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    lv_vhilm = to_upper( is_params-vhilm ).
    IF lv_vhilm IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vhilm is required (packaging material)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
      EXPORTING  input  = lv_vhilm
      IMPORTING  output = lv_vhilm
      EXCEPTIONS OTHERS = 1.
    SELECT SINGLE vhart FROM mara INTO lv_vhart WHERE matnr = lv_vhilm.
    IF sy-subrc <> 0.
      lv_text = |Packaging material { to_upper( is_params-vhilm ) } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_vhart IS INITIAL.
      lv_text = |Material { to_upper( is_params-vhilm ) } is not a packaging material (no packaging material type)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    READ TABLE lt_items INTO ls_it INDEX 1.
    SELECT SINGLE matnr FROM marc INTO lv_vhilm WHERE matnr = lv_vhilm AND werks = ls_it-werks.
    IF sy-subrc <> 0.
      lv_text = |Packaging material { to_upper( is_params-vhilm ) } is not maintained in plant { ls_it-werks } (VL 411): | &&
                |extend it to the plant first (MM01)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    " Temporary HU id: links the items to the new HU; the real number comes from the HU number range.
    lv_exidv = '$1'.
    IF is_params-items IS INITIAL.
      LOOP AT lt_items INTO ls_it WHERE lfimg > 0 AND uecha IS INITIAL.
        ls_req-posnr = ls_it-posnr.
        ls_req-qty   = 0.
        APPEND ls_req TO lt_reqs.
      ENDLOOP.
    ELSE.
      parse_reqs( EXPORTING it_items = is_params-items IMPORTING et_reqs = lt_reqs CHANGING cs_result = rs_result ).
    ENDIF.
    lv_key = ls_dlv-vbeln.
    LOOP AT lt_reqs INTO ls_req.
      READ TABLE lt_items INTO ls_it WITH KEY posnr = ls_req-posnr.
      IF sy-subrc <> 0.
        lv_text = |Item { ls_req-posnr } does not exist in delivery { fmt_doc( ls_dlv-vbeln ) }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      CLEAR lv_packed.
      SELECT SUM( vemng ) FROM vepo INTO lv_packed WHERE vbeln = ls_dlv-vbeln AND posnr = ls_it-posnr AND velin = '1'.
      lv_open = ls_it-lgmng - lv_packed.
      IF ls_req-qty = 0.
        ls_req-qty = lv_open.
        IF ls_req-qty <= 0.
          CONTINUE.
        ENDIF.
      ELSEIF ls_req-qty > lv_open.
        lv_text = |Item { ls_it-posnr }: pack quantity { fmt_qty( ls_req-qty ) } is above the unpacked quantity { fmt_qty( lv_open ) } { ls_it-meins }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      CLEAR ls_verpo.
      ls_verpo-exidv_ob = lv_exidv.
      ls_verpo-velin    = '1'.
      ls_verpo-vbeln    = ls_dlv-vbeln.
      ls_verpo-posnr    = ls_it-posnr.
      ls_verpo-tmeng    = ls_req-qty.
      ls_verpo-vrkme    = ls_it-meins.
      ls_verpo-matnr    = ls_it-matnr.
      ls_verpo-charg    = ls_it-charg.
      ls_verpo-werks    = ls_it-werks.
      ls_verpo-lgort    = ls_it-lgort.
      APPEND ls_verpo TO lt_verpo.
    ENDLOOP.
    IF lt_verpo IS INITIAL AND rs_result-messages IS INITIAL.
      lv_text = |Delivery { fmt_doc( ls_dlv-vbeln ) } has nothing left to pack|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    " New HU: temporary id $1 on header and items (number assigned at save).
    ls_verko-exidv = lv_exidv.
    ls_verko-vhilm = lv_vhilm.
    READ TABLE lt_items INTO ls_it INDEX 1.
    ls_verko-werks = ls_it-werks.
    ls_verko-lgort = ls_it-lgort.
    ls_verko-vstel = ls_dlv-vstel.
    ls_verko-object = '01'.
    ls_verko-objkey = ls_dlv-vbeln.
    APPEND ls_verko TO lt_verko.
    ls_ok-vbeln_vl = ls_dlv-vbeln.
    ls_ok-vbtyp_vl = 'J'.
    SELECT COUNT(*) FROM vekp INTO lv_n0 WHERE vpobj = '01' AND vpobjkey = lv_key.
    call_ws( EXPORTING iv_vbeln = ls_dlv-vbeln is_ok = ls_ok it_verko = lt_verko it_verpo = lt_verpo
                       iv_execute = iv_execute
             CHANGING  cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF iv_execute = abap_false.
      LOOP AT lt_verpo INTO ls_verpo.
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'posnr' iv_value = ls_verpo-posnr CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'pack_qty' iv_value = ls_verpo-tmeng CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'unit' iv_value = ls_verpo-vrkme CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      rs_result-summary = |Pack { lines( lt_verpo ) } items of delivery { fmt_doc( ls_dlv-vbeln ) } into one new HU ({ to_upper( is_params-vhilm ) })|.
      RETURN.
    ENDIF.
    DO 10 TIMES.
      SELECT COUNT(*) FROM vekp INTO lv_n1 WHERE vpobj = '01' AND vpobjkey = lv_key.
      IF lv_n1 > lv_n0.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_n1 <= lv_n0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No new handling unit is visible on the delivery after the save (see messages, VL03N)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT exidv FROM vekp UP TO 1 ROWS INTO lv_exidv
      WHERE vpobj = '01' AND vpobjkey = lv_key ORDER BY venum DESCENDING.
    ENDSELECT.
    APPEND lv_exidv TO rs_result-sd_new_docs.
    add_chg( EXPORTING iv_field = 'HANDLING_UNITS' iv_old = lv_n0 iv_new = lv_n1 CHANGING cs_result = rs_result ).
    rs_result-summary = |Handling unit { lv_exidv } packed on delivery { fmt_doc( ls_dlv-vbeln ) }|.
  ENDMETHOD.


  METHOD hu_unpack.
    TYPES: BEGIN OF ty_vp,
             vepos TYPE vepo-vepos,
             velin TYPE vepo-velin,
             vbeln TYPE vepo-vbeln,
             posnr TYPE vepo-posnr,
             matnr TYPE vepo-matnr,
             charg TYPE vepo-charg,
             vemng TYPE vepo-vemng,
             vemeh TYPE vepo-vemeh,
             werks TYPE vepo-werks,
             lgort TYPE vepo-lgort,
           END OF ty_vp.
    DATA: lv_exidv TYPE vekp-exidv,
          lv_venum TYPE vekp-venum,
          lv_vpobj TYPE vekp-vpobj,
          lv_key   TYPE vekp-vpobjkey,
          ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          lv_found TYPE abap_bool,
          lt_vp    TYPE STANDARD TABLE OF ty_vp WITH DEFAULT KEY,
          ls_vp    TYPE ty_vp,
          ls_unp   TYPE bapihuitmunpack,
          ls_hdr   TYPE bapihuheader,
          lt_ret   TYPE ty_ret,
          lv_hukey TYPE bapihukey-hu_exid,
          lv_n1    TYPE i,
          lv_dlvin TYPE string,
          lv_text  TYPE string.

    lv_exidv = is_params-exidv.
    CONDENSE lv_exidv NO-GAPS.
    IF lv_exidv IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'exidv is required (handling unit number)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_exidv CO '0123456789 '.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = lv_exidv
        IMPORTING output = lv_exidv.
    ENDIF.
    SELECT SINGLE venum vpobj vpobjkey FROM vekp INTO (lv_venum, lv_vpobj, lv_key) WHERE exidv = lv_exidv.
    IF sy-subrc <> 0.
      lv_text = |Handling unit { is_params-exidv } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_vpobj <> '01'.
      lv_text = |Handling unit { is_params-exidv } is not packed on an outbound delivery: unpack it in HU management (HUMO)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_dlvin = lv_key(10).
    open_dlv( EXPORTING iv_in = lv_dlvin iv_actvt = '02'
              IMPORTING es_dlv = ls_dlv et_items = lt_items
              CHANGING  cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF is_params-vbeln IS NOT INITIAL AND to_doc( is_params-vbeln ) <> ls_dlv-vbeln.
      lv_text = |Handling unit { is_params-exidv } belongs to delivery { fmt_doc( ls_dlv-vbeln ) }, not { is_params-vbeln }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT vepos velin vbeln posnr matnr charg vemng vemeh werks lgort
      FROM vepo INTO TABLE lt_vp WHERE venum = lv_venum AND velin = '1' ORDER BY vepos.
    IF lt_vp IS INITIAL.
      lv_text = |Handling unit { is_params-exidv } contains no delivery items|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF iv_execute = abap_false.
      LOOP AT lt_vp INTO ls_vp.
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'posnr' iv_value = ls_vp-posnr CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'qty' iv_value = ls_vp-vemng CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'unit' iv_value = ls_vp-vemeh CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'The unpack BAPI has no test mode: this preview is the rule check (HU on the delivery, goods issue open, authorization)'
               CHANGING  cs_result = rs_result ).
      rs_result-summary = |Unpack { lines( lt_vp ) } items from handling unit { is_params-exidv } (delivery { fmt_doc( ls_dlv-vbeln ) })|.
      RETURN.
    ENDIF.
    lv_hukey = lv_exidv.
    LOOP AT lt_vp INTO ls_vp.
      CLEAR: ls_unp, lt_ret.
      ls_unp-hu_item_type   = '1'.
      ls_unp-hu_item_number = ls_vp-vepos.
      ls_unp-material       = ls_vp-matnr.
      ls_unp-batch          = ls_vp-charg.
      ls_unp-pack_qty       = ls_vp-vemng.
      ls_unp-base_unit_qty  = ls_vp-vemeh.
      ls_unp-plant          = ls_vp-werks.
      ls_unp-stge_loc       = ls_vp-lgort.
      CALL FUNCTION 'BAPI_HU_UNPACK'
        EXPORTING
          hukey         = lv_hukey
          itemunpack    = ls_unp
        IMPORTING
          huheader      = ls_hdr
        TABLES
          return        = lt_ret
        EXCEPTIONS
          error_message = 1
          OTHERS        = 2.
      IF sy-subrc <> 0.
        add_sy_msg( CHANGING cs_result = rs_result ).
      ENDIF.
      add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
      IF rs_result-failed = abap_true.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF rs_result-failed = abap_true.
      do_rollback( ).
      RETURN.
    ENDIF.
    commit_wait( CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    DO 10 TIMES.
      SELECT COUNT(*) FROM vepo INTO lv_n1 WHERE venum = lv_venum AND velin = '1'.
      IF lv_n1 = 0.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    add_chg( EXPORTING iv_field = 'HU_ITEMS' iv_old = lines( lt_vp ) iv_new = lv_n1 CHANGING cs_result = rs_result ).
    IF lv_n1 > 0.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The handling unit still shows items after the save: check VL03N / HUMO'
               CHANGING cs_result = rs_result ).
    ENDIF.
    load_dlv( EXPORTING iv_vbeln = ls_dlv-vbeln IMPORTING es_dlv = ls_dlv et_items = lt_items ev_found = lv_found ).
    dlv_rows( EXPORTING is_dlv = ls_dlv iv_row = 0 CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Handling unit { is_params-exidv } unpacked ({ lines( lt_vp ) } items, delivery { fmt_doc( ls_dlv-vbeln ) })|.
  ENDMETHOD.


  METHOD scd_detail.
    TYPES: BEGIN OF ty_fp,
             fkpos TYPE vfkp-fkpos,
             rebel TYPE vfkp-rebel,
             tdlnr TYPE vfkp-tdlnr,
             netwr TYPE vfkp-netwr,
             waers TYPE vfkp-waers,
             stabr TYPE vfkp-stabr,
             stber TYPE vfkp-stber,
             ebeln TYPE vfkp-ebeln,
             budat TYPE vfkp-budat,
           END OF ty_fp.
    DATA: lv_fknum TYPE vfkk-fknum,
          lv_fkart TYPE vfkk-fkart,
          lv_erdat TYPE vfkk-erdat,
          lv_stber TYPE vfkk-stber,
          lv_stabr TYPE vfkk-stabr,
          lt_fp    TYPE STANDARD TABLE OF ty_fp WITH DEFAULT KEY,
          ls_fp    TYPE ty_fp,
          lv_sum   TYPE vfkp-netwr,
          lv_waers TYPE vfkp-waers,
          lv_row   TYPE i,
          lv_text  TYPE string.

    lv_fknum = to_doc( is_params-fknum ).
    IF lv_fknum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'fknum is required (shipment cost document, digits up to 10)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE fkart erdat stber stabr FROM vfkk INTO (lv_fkart, lv_erdat, lv_stber, lv_stabr)
      WHERE fknum = lv_fknum.
    IF sy-subrc <> 0.
      lv_text = |Shipment cost document { fmt_doc( lv_fknum ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VFKK_FKA' ID 'FKARTT' FIELD lv_fkart ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      lv_text = |No authorization to display shipment cost documents of type { lv_fkart }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    add_kv( EXPORTING iv_row = 0 iv_name = 'fknum' iv_value = lv_fknum CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'fkart' iv_value = lv_fkart CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'erdat' iv_value = lv_erdat CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'calculation' iv_value = lv_stber CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 0 iv_name = 'settlement' iv_value = lv_stabr CHANGING ct_rows = rs_result-rows ).
    SELECT fkpos rebel tdlnr netwr waers stabr stber ebeln budat
      FROM vfkp INTO TABLE lt_fp WHERE fknum = lv_fknum ORDER BY fkpos.
    LOOP AT lt_fp INTO ls_fp.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'item' iv_value = ls_fp-fkpos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'shipment' iv_value = ls_fp-rebel CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'carrier' iv_value = ls_fp-tdlnr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'net_value' iv_value = ls_fp-netwr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'currency' iv_value = ls_fp-waers CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'calculation' iv_value = ls_fp-stber CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'settlement' iv_value = ls_fp-stabr CHANGING ct_rows = rs_result-rows ).
      IF ls_fp-ebeln IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'purchase_order' iv_value = ls_fp-ebeln CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_fp-budat IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'posting_date' iv_value = ls_fp-budat CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      lv_sum = lv_sum + ls_fp-netwr.
      lv_waers = ls_fp-waers.
    ENDLOOP.
    rs_result-summary = |Shipment cost document { fmt_doc( lv_fknum ) } ({ lv_fkart }): { lv_row } items, net { lv_sum } { lv_waers }, | &&
                        |calculation { lv_stber }, settlement { lv_stabr }|.
  ENDMETHOD.


  METHOD scd_due.
    DATA: lt_shp   TYPE ty_shps,
          ls_shp   TYPE ty_shp,
          lv_tplst TYPE vttk-tplst,
          lv_basis TYPE string,
          lv_from  TYPE d,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_row   TYPE i,
          lv_hidden TYPE i,
          lt_daten TYPE RANGE OF vttk-daten,
          ls_daten LIKE LINE OF lt_daten,
          lv_text  TYPE string.

    lv_tplst = to_upper( is_params-tplst ).
    IF lv_tplst IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tplst is required (transportation planning point)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE tplst FROM ttds INTO lv_tplst WHERE tplst = lv_tplst.
    IF sy-subrc <> 0.
      lv_text = |Transportation planning point { to_upper( is_params-tplst ) } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_basis = to_lower( is_params-date_basis ).
    IF lv_basis IS INITIAL.
      lv_basis = 'all'.
    ENDIF.
    CASE lv_basis.
      WHEN 'ended_last_30'.
        lv_from = sy-datum - 30.
        ls_daten-sign = 'I'. ls_daten-option = 'GE'. ls_daten-low = lv_from. APPEND ls_daten TO lt_daten.
      WHEN 'all'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_basis must be ended_last_30 or all' CHANGING cs_result = rs_result ).
        RETURN.
    ENDCASE.
    lv_max = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.
    " Ended shipments without a shipment cost item (VFKP-REBEL = shipment).
    SELECT tknum shtyp tplst erdat sttrg stdis streg stlbg stlad stabf sttbg stten
           dptbg dpten datbg daten route tdlnr exti1 exti2 frkrl
      FROM vttk INTO TABLE lt_shp UP TO lv_fetch ROWS
      WHERE tplst = lv_tplst AND sttrg = '7' AND daten IN lt_daten
        AND NOT EXISTS ( SELECT fknum FROM vfkp WHERE rebel = vttk~tknum )
      ORDER BY daten DESCENDING tknum.
    IF lines( lt_shp ) > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_shp FROM lv_fetch.
    ENDIF.
    LOOP AT lt_shp INTO ls_shp.
      IF auth_shp( iv_shtyp = ls_shp-shtyp iv_tplst = ls_shp-tplst iv_actvt = '03' ) = abap_false.
        lv_hidden = lv_hidden + 1.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      shp_rows( EXPORTING is_shp = ls_shp iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-hidden_no_auth = lv_hidden.
    rs_result-summary = |{ lv_row } ended shipments of planning point { lv_tplst } without shipment costs ({ lv_basis })|.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; more exist, raise max_rows|.
    ENDIF.
  ENDMETHOD.


  METHOD scd_simulate.
    DATA: lv_tknum TYPE vttk-tknum,
          ls_shp   TYPE ty_shp,
          lv_found TYPE abap_bool,
          ls_head  TYPE bapishipmentheader,
          lt_item  TYPE STANDARD TABLE OF bapishipmentitem WITH DEFAULT KEY,
          ls_item  TYPE bapishipmentitem,
          lt_cost  TYPE STANDARD TABLE OF bapishipmentcarriercosts WITH DEFAULT KEY,
          ls_cost  TYPE bapishipmentcarriercosts,
          lt_ret   TYPE ty_ret,
          lv_vbeln TYPE vttp-vbeln,
          lv_tpnum TYPE vttp-tpnum,
          lv_row   TYPE i,
          lv_text  TYPE string.

    lv_tknum = to_doc( is_params-tknum ).
    IF lv_tknum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tknum is required (shipment, digits up to 10)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    load_shp( EXPORTING iv_tknum = lv_tknum IMPORTING es_shp = ls_shp ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_shp( iv_shtyp = ls_shp-shtyp iv_tplst = ls_shp-tplst iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display shipments of type { ls_shp-shtyp } / planning point { ls_shp-tplst }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    ls_head-shipment_type    = ls_shp-shtyp.
    ls_head-trans_plan_pt    = ls_shp-tplst.
    ls_head-service_agent_id = ls_shp-tdlnr.
    ls_head-shipment_route   = ls_shp-route.
    SELECT vbeln tpnum FROM vttp INTO (lv_vbeln, lv_tpnum) WHERE tknum = lv_tknum ORDER BY tpnum.
      CLEAR ls_item.
      ls_item-delivery  = lv_vbeln.
      ls_item-itenerary = lv_tpnum.
      APPEND ls_item TO lt_item.
    ENDSELECT.
    IF lt_item IS INITIAL.
      lv_text = |Shipment { fmt_doc( lv_tknum ) } has no deliveries: nothing to estimate|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_SHIPMENT_COST_ESTIMATE'
      EXPORTING
        headerdata    = ls_head
      TABLES
        itemdata      = lt_item
        returncosts   = lt_cost
        return        = lt_ret
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = rs_result ).
    " Estimate only: never saved.
    do_rollback( ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    LOOP AT lt_cost INTO ls_cost.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'carrier' iv_value = ls_cost-carrierid CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'cost' iv_value = ls_cost-carriercost CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'no_rates' iv_value = ls_cost-no_rates_ind CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF lv_row = 0.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'No carrier cost was determined (no freight rates or no carrier for this shipment)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |Shipment cost estimate for shipment { fmt_doc( lv_tknum ) }: { lv_row } carrier results (nothing is saved)|.
  ENDMETHOD.


  METHOD check_period.
    DATA: lv_bukrs TYPE t001k-bukrs,
          lv_periv TYPE t001-periv,
          ls_marv  TYPE marv,
          lv_buper TYPE t009b-poper,
          lv_gjahr TYPE t009b-bdatj,
          lv_text  TYPE string.

    " MM posting period: current or previous period of the company code (table MARV).
    SELECT SINGLE bukrs FROM t001k INTO lv_bukrs WHERE bwkey = iv_werks.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM marv INTO ls_marv WHERE bukrs = lv_bukrs.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    SELECT SINGLE periv FROM t001 INTO lv_periv WHERE bukrs = lv_bukrs.
    CALL FUNCTION 'DATE_TO_PERIOD_CONVERT'
      EXPORTING
        i_date         = iv_date
        i_periv        = lv_periv
      IMPORTING
        e_buper        = lv_buper
        e_gjahr        = lv_gjahr
      EXCEPTIONS
        input_false    = 1
        t009_notfound  = 2
        t009b_notfound = 3
        OTHERS         = 4.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    IF ( lv_gjahr = ls_marv-lfgja AND lv_buper = ls_marv-lfmon ) OR
       ( lv_gjahr = ls_marv-vmgja AND lv_buper = ls_marv-vmmon ).
      RETURN.
    ENDIF.
    lv_text = |Today is outside the open MM periods (current { ls_marv-lfmon }/{ ls_marv-lfgja }) of company code { lv_bukrs } | &&
              |(plant { iv_werks }): the goods issue of this shipment step cannot be posted (M7 053)|.
    add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD auth_shp.
    rv_ok = abap_false.
    AUTHORITY-CHECK OBJECT 'V_VTTK_SHT' ID 'SHTYP' FIELD iv_shtyp ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VTTK_TDS' ID 'TPLST' FIELD iv_tplst ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_dlv.
    AUTHORITY-CHECK OBJECT 'V_LIKP_VST' ID 'VSTEL' FIELD iv_vstel ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD to_doc.
    DATA lv_in TYPE string.

    lv_in = iv_in.
    CONDENSE lv_in NO-GAPS.
    IF lv_in IS INITIAL OR lv_in CN '0123456789' OR strlen( lv_in ) > 10.
      CLEAR rv_doc.
      RETURN.
    ENDIF.
    rv_doc = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = rv_doc
      IMPORTING output = rv_doc.
  ENDMETHOD.


  METHOD to_date.
    DATA: lv_in   TYPE string,
          lv_date TYPE d.

    lv_in = iv_in.
    CONDENSE lv_in NO-GAPS.
    REPLACE ALL OCCURRENCES OF '-' IN lv_in WITH ''.
    IF strlen( lv_in ) <> 8 OR lv_in CN '0123456789'.
      RETURN.
    ENDIF.
    lv_date = lv_in.
    CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'
      EXPORTING
        date                      = lv_date
      EXCEPTIONS
        plausibility_check_failed = 1
        OTHERS                    = 2.
    IF sy-subrc = 0.
      rv_date = lv_date.
    ENDIF.
  ENDMETHOD.


  METHOD to_qty.
    DATA lv_in TYPE string.

    CLEAR: ev_qty, ev_ok.
    lv_in = iv_in.
    CONDENSE lv_in NO-GAPS.
    IF lv_in IS INITIAL OR lv_in CN '0123456789.'.
      RETURN.
    ENDIF.
    TRY.
        ev_qty = lv_in.
        ev_ok = abap_true.
      CATCH cx_sy_conversion_error.
        CLEAR ev_qty.
    ENDTRY.
  ENDMETHOD.


  METHOD max_rows.
    DATA lv_in TYPE string.

    rv_n = c_max_def.
    lv_in = iv_in.
    CONDENSE lv_in NO-GAPS.
    IF lv_in IS NOT INITIAL AND lv_in CO '0123456789' AND strlen( lv_in ) <= 6.
      rv_n = lv_in.
    ENDIF.
    IF rv_n < 1.
      rv_n = 1.
    ELSEIF rv_n > c_max_cap.
      rv_n = c_max_cap.
    ENDIF.
  ENDMETHOD.


  METHOD fmt_doc.
    rv_txt = iv_doc.
    SHIFT rv_txt LEFT DELETING LEADING '0'.
    IF rv_txt IS INITIAL.
      rv_txt = '0'.
    ENDIF.
  ENDMETHOD.


  METHOD fmt_qty.
    DATA lv_c TYPE c LENGTH 20.

    WRITE iv_qty TO lv_c LEFT-JUSTIFIED NO-GROUPING DECIMALS 3.
    rv_txt = lv_c.
    TRANSLATE rv_txt USING ',.'.
    CONDENSE rv_txt NO-GAPS.
    IF rv_txt CS '.'.
      SHIFT rv_txt RIGHT DELETING TRAILING '0'.
      SHIFT rv_txt RIGHT DELETING TRAILING '.'.
      CONDENSE rv_txt NO-GAPS.
    ENDIF.
  ENDMETHOD.


  METHOD add_kv.
    DATA ls_kv TYPE zif_mcp_biz_action=>ty_kv.

    ls_kv-row   = iv_row.
    ls_kv-name  = iv_name.
    ls_kv-value = iv_value.
    CONDENSE ls_kv-value.
    APPEND ls_kv TO ct_rows.
  ENDMETHOD.


  METHOD add_chg.
    DATA ls_chg TYPE zif_mcp_biz_action=>ty_change.

    ls_chg-field     = iv_field.
    ls_chg-old_value = iv_old.
    ls_chg-new_value = iv_new.
    CONDENSE: ls_chg-old_value, ls_chg-new_value.
    APPEND ls_chg TO cs_result-changes.
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


  METHOD add_ret.
    DATA: ls_ret TYPE bapiret2,
          ls_msg TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT it_return INTO ls_ret.
      IF ls_ret-type IS INITIAL.
        CONTINUE.
      ENDIF.
      CLEAR ls_msg.
      ls_msg-type    = ls_ret-type.
      ls_msg-id      = ls_ret-id.
      ls_msg-number  = ls_ret-number.
      ls_msg-message = ls_ret-message.
      IF ls_msg-message IS INITIAL AND ls_ret-id IS NOT INITIAL.
        MESSAGE ID ls_ret-id TYPE 'S' NUMBER ls_ret-number
          WITH ls_ret-message_v1 ls_ret-message_v2 ls_ret-message_v3 ls_ret-message_v4 INTO ls_msg-message.
      ENDIF.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_prot.
    DATA: ls_p    TYPE prott,
          ls_msg  TYPE zif_mcp_biz_action=>ty_message,
          lv_text TYPE string.

    LOOP AT it_prot INTO ls_p.
      IF ls_p-msgid IS INITIAL.
        CONTINUE.
      ENDIF.
      MESSAGE ID ls_p-msgid TYPE 'S' NUMBER ls_p-msgno
        WITH ls_p-msgv1 ls_p-msgv2 ls_p-msgv3 ls_p-msgv4 INTO lv_text.
      CLEAR ls_msg.
      ls_msg-type = ls_p-msgty.
      IF ls_msg-type IS INITIAL.
        ls_msg-type = 'E'.
      ENDIF.
      ls_msg-id      = ls_p-msgid.
      ls_msg-number  = ls_p-msgno.
      ls_msg-message = lv_text.
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


  METHOD do_rollback.
    DATA ls_ret TYPE bapiret2.

    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
      IMPORTING
        return = ls_ret.
  ENDMETHOD.


  METHOD commit_wait.
    DATA: ls_ret  TYPE bapiret2,
          lv_text TYPE string.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait   = 'X'
      IMPORTING
        return = ls_ret.
    IF ls_ret-type CA 'EA'.
      lv_text = ls_ret-message.
      add_msg( EXPORTING iv_type = ls_ret-type iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
