CLASS zcl_mcp_biz_sd DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_SD - SD business actions of ZMCP_BIZ_EXECUTE in one class: sales orders
* (SD.SO.*), outbound deliveries (SD.DLV.*) and billing documents (SD.BIL.*).
* Merged 2026-11-10 from ZCL_MCP_BIZ_SD_BASE + _SD_SO + _SD_DLV + _SD_BIL (old classes kept).
* Methods that existed in more than one of them carry the prefix so_ / dlv_ / bil_.
* Catalog: sc4sap configs/SD/actions.json. Action IDs must match it.
* 7.31 syntax (no inline declarations, no constructor operators, no string
* templates in method call parameters) so one source serves ECC 7.31,
* ECC 7.40 and S/4HANA.
*
* ---- shared helpers (was ZCL_MCP_BIZ_SD_BASE)
* ZCL_MCP_BIZ_SD_BASE - helpers shared by the SD business action handlers
* (ZCL_MCP_BIZ_SD_SO sales orders, ZCL_MCP_BIZ_SD_DLV deliveries,
* ZCL_MCP_BIZ_SD_BIL billing documents) of ZMCP_BIZ_EXECUTE.
* Messages, key and date conversion, quantity parsing and the authorization
* checks of the SD objects. The handlers never read or return customer master,
* partner or address data; no customer-specific names live here.
* Amounts: the tables hold currency amounts with two decimals for every currency
* (KRW 1,500 is stored as 15.00). Amounts returned to the caller are converted
* to the real value of the currency (ext_amount).
*
* ---- sales orders (was ZCL_MCP_BIZ_SD_SO)
* ZCL_MCP_BIZ_SD_SO - SD sales order business actions for ZMCP_BIZ_EXECUTE.
* Catalog: sc4sap configs/SD/actions.json. Action IDs must match it.
* Reads: SELECT on VBAK / VBAP / VBEP / VBUK / VBUP (S/4: status fields in VBAK / VBAP) / VBFA (display authorization
*        V_VBAK_VKO + V_VBAK_AAT). No customer, partner or address data.
*        Amounts are returned as real amounts of the currency (ext_amount).
* Writes: BAPI_SALESORDER_CHANGE (preview = SIMULATION + rollback) and
*         BAPI_SALESORDER_CREATEFROMDAT2 (preview = TESTRUN + rollback).
*         SIMULATION skips the save step of the document, so rules of the save
*         exits are not seen by the preview: they belong to the STATIC check
*         (customer rules of the system, evaluated outside SAP).
*         execute = BAPI + BAPI_TRANSACTION_COMMIT, then read back.
*         CHANGE_PRICE: new_price is the real price in the document currency
*         (KRW 1600 = 1,600 KRW); the BAPI converts it to the table format.
*
* ---- deliveries (was ZCL_MCP_BIZ_SD_DLV)
* ZCL_MCP_BIZ_SD_DLV - SD outbound delivery business actions for ZMCP_BIZ_EXECUTE.
* Catalog: sc4sap configs/SD/actions.json. Action IDs must match it.
* Reads: SELECT on LIKP / LIPS / VBUK / VBUP (S/4: LIKP / LIPS) (display authorization V_LIKP_VST).
*        No customer, partner or address data.
* Writes: BAPI_OUTB_DELIVERY_CREATE_SLS (no test mode: the preview is the static
*         check of status, blocks and configuration), WS_DELIVERY_UPDATE_2 for the
*         goods issue and WS_REVERSE_GOODS_ISSUE for its reversal. These function
*         modules have no authorization check of their own: this class checks the
*         shipping point (V_LIKP_VST) and the movement type / plant (M_MSEG_BWA,
*         M_MSEG_WWA) before PREVIEW and EXECUTE and fails closed.
*         Goods issue preview = WS_DELIVERY_UPDATE_2 with IF_DATABASE_UPDATE_1 = 2 (check
*         only: it runs the goods movement and the accounting checks, saves nothing; verified
*         with a commit after the call) + rollback. The reversal has no usable test mode
*         (I_SIMULATE does not find the delivery): its preview is the static check
*         (status, billing, MM period).
*         execute = FM + BAPI_TRANSACTION_COMMIT, then read back from the tables.
*
* ---- billing documents (was ZCL_MCP_BIZ_SD_BIL)
* ZCL_MCP_BIZ_SD_BIL - SD billing document business actions for ZMCP_BIZ_EXECUTE.
* Catalog: sc4sap configs/SD/actions.json. Action IDs must match it.
* Reads: SELECT on VKDFS (billing due index), VBRK, VBRP, VBFA (display authorization
*        V_VBRK_VKO + V_VBRK_FKA). No customer, partner or address data.
* Writes: BAPI_BILLINGDOC_CREATEMULTIPLE and BAPI_BILLINGDOC_CANCEL1, both with a
*         test run (preview = TESTRUN + rollback). The BAPIs have no authorization
*         check of their own: this class checks V_VBRK_FKA / V_VBRK_VKO (activity 01)
*         before PREVIEW and EXECUTE and fails closed. The test run does not post to
*         accounting (posting type F): rules of the accounting interface are seen at
*         EXECUTE only, the accounting status of the new document is read back.
*         execute = BAPI + BAPI_TRANSACTION_COMMIT, then read back from the tables.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    " ---- from ZCL_MCP_BIZ_SD_BASE
    CONSTANTS:
      c_max_default TYPE i VALUE 200,
      c_max_limit   TYPE i VALUE 1000.

    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_sy_msg
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    " Any BAPI return table with the columns TYPE, ID, NUMBER, MESSAGE
    " (BAPIRET2, BAPIRET1, BAPIRETURN1).
    METHODS add_ret
      IMPORTING it_return TYPE ANY TABLE
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS do_rollback.

    METHODS commit_wait
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS to_vbeln
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_vbeln) TYPE vbak-vbeln.

    METHODS to_posnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_posnr) TYPE vbap-posnr.

    METHODS to_matnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_matnr) TYPE vbap-matnr.

    METHODS to_kunnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_kunnr) TYPE kunnr.

    METHODS to_date
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_date) TYPE sy-datum.

    METHODS to_qty
      IMPORTING iv_value TYPE string
      EXPORTING ev_qty   TYPE vbap-kwmeng
                ev_ok    TYPE abap_bool.

    METHODS fmt_qty
      IMPORTING iv_qty         TYPE vbap-kwmeng
      RETURNING VALUE(rv_text) TYPE string.

    METHODS fmt_date
      IMPORTING iv_date        TYPE sy-datum
      RETURNING VALUE(rv_text) TYPE string.

    METHODS fmt_doc
      IMPORTING iv_vbeln       TYPE vbak-vbeln
      RETURNING VALUE(rv_text) TYPE string.

    METHODS max_rows
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_max)  TYPE i.

    METHODS word
      IMPORTING iv_code        TYPE c
      RETURNING VALUE(rv_text) TYPE string.

    " Table amount (two decimals) -> real amount of the currency (KRW: 15.00 -> 1500.00).
    METHODS ext_amount
      IMPORTING iv_amount        TYPE any
                iv_waers         TYPE waers
      RETURNING VALUE(rv_amount) TYPE vbak-netwr.

    METHODS auth_so
      IMPORTING iv_vkorg     TYPE vbak-vkorg
                iv_vtweg     TYPE vbak-vtweg
                iv_spart     TYPE vbak-spart
                iv_auart     TYPE vbak-auart
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_dlv
      IMPORTING iv_vstel     TYPE likp-vstel
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_gm
      IMPORTING iv_bwart     TYPE bwart
                iv_werks     TYPE werks_d
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_bil
      IMPORTING iv_fkart     TYPE vbrk-fkart
                iv_vkorg     TYPE vbrk-vkorg
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    " ---- from ZCL_MCP_BIZ_SD_SO
    TYPES:
      ty_so_ret2    TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
      ty_b_items TYPE STANDARD TABLE OF bapisditm WITH DEFAULT KEY,
      ty_b_itemx TYPE STANDARD TABLE OF bapisditmx WITH DEFAULT KEY,
      ty_b_sched TYPE STANDARD TABLE OF bapischdl WITH DEFAULT KEY,
      ty_b_schex TYPE STANDARD TABLE OF bapischdlx WITH DEFAULT KEY,
      ty_b_cond  TYPE STANDARD TABLE OF bapicond WITH DEFAULT KEY,
      ty_b_condx TYPE STANDARD TABLE OF bapicondx WITH DEFAULT KEY,
      ty_b_partn TYPE STANDARD TABLE OF bapiparnr WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_ord,
        vbeln TYPE vbak-vbeln,
        auart TYPE vbak-auart,
        vbtyp TYPE vbak-vbtyp,
        vkorg TYPE vbak-vkorg,
        vtweg TYPE vbak-vtweg,
        spart TYPE vbak-spart,
        erdat TYPE vbak-erdat,
        vdatu TYPE vbak-vdatu,
        netwr TYPE vbak-netwr,
        waerk TYPE vbak-waerk,
        lifsk TYPE vbak-lifsk,
        faksk TYPE vbak-faksk,
        lfstk TYPE vbuk-lfstk,
        wbstk TYPE vbuk-wbstk,
        fkstk TYPE vbuk-fkstk,
        abstk TYPE vbuk-abstk,
        gbstk TYPE vbuk-gbstk,
        cmgst TYPE vbuk-cmgst,
        uvall TYPE vbuk-uvall,
      END OF ty_ord,
      ty_ords TYPE STANDARD TABLE OF ty_ord WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_it,
        posnr  TYPE vbap-posnr,
        matnr  TYPE vbap-matnr,
        arktx  TYPE vbap-arktx,
        werks  TYPE vbap-werks,
        lgort  TYPE vbap-lgort,
        kwmeng TYPE vbap-kwmeng,
        vrkme  TYPE vbap-vrkme,
        meins  TYPE vbap-meins,
        umvkz  TYPE vbap-umvkz,
        umvkn  TYPE vbap-umvkn,
        pstyv  TYPE vbap-pstyv,
        abgru  TYPE vbap-abgru,
        netwr  TYPE vbap-netwr,
        netpr  TYPE vbap-netpr,
        lfsta  TYPE vbup-lfsta,
        wbsta  TYPE vbup-wbsta,
        fksta  TYPE vbup-fksta,
        gbsta  TYPE vbup-gbsta,
        absta  TYPE vbup-absta,
      END OF ty_it,
      ty_its TYPE STANDARD TABLE OF ty_it WITH DEFAULT KEY.

    " Payload of BAPI_SALESORDER_CHANGE plus what the read back must find.
    TYPES:
      BEGIN OF ty_pl,
        head   TYPE bapisdh1,
        headx  TYPE bapisdh1x,
        it     TYPE ty_b_items,
        itx    TYPE ty_b_itemx,
        sl     TYPE ty_b_sched,
        slx    TYPE ty_b_schex,
        co     TYPE ty_b_cond,
        cox    TYPE ty_b_condx,
        posnr  TYPE vbap-posnr,
        etenr  TYPE vbep-etenr,
        qty    TYPE vbep-wmeng,
        edatu  TYPE vbep-edatu,
        reason TYPE c LENGTH 4,
        kschl  TYPE t685-kschl,
        amount TYPE bapicond-cond_value,
        netpr  TYPE vbap-netpr,
        netwr  TYPE vbap-netwr,
      END OF ty_pl.

    TYPES:
      BEGIN OF ty_newit,
        matnr TYPE vbap-matnr,
        qty   TYPE vbap-kwmeng,
        werks TYPE vbap-werks,
        meins TYPE vbap-meins,
      END OF ty_newit,
      ty_newits TYPE STANDARD TABLE OF ty_newit WITH DEFAULT KEY.

    METHODS so_run
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS so_list_open
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS so_get_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS check_order
      IMPORTING iv_vbeln  TYPE string
                iv_actvt  TYPE c
      EXPORTING es_ord    TYPE ty_ord
                et_items  TYPE ty_its
                ev_ok     TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS load_order
      IMPORTING iv_vbeln TYPE vbak-vbeln
      EXPORTING es_ord   TYPE ty_ord
                ev_found TYPE abap_bool.

    METHODS load_items
      IMPORTING iv_vbeln TYPE vbak-vbeln
      EXPORTING et_items TYPE ty_its.

    METHODS so_delivered_su
      IMPORTING is_it         TYPE ty_it
                iv_vbeln      TYPE vbak-vbeln
      RETURNING VALUE(rv_qty) TYPE vbap-kwmeng.

    METHODS so_status_text
      IMPORTING is_ord         TYPE ty_ord
      RETURNING VALUE(rv_text) TYPE string.

    METHODS so_doc_row
      IMPORTING is_ord        TYPE ty_ord
      RETURNING VALUE(rs_doc) TYPE zif_mcp_biz_action=>ty_sd_doc.

    METHODS pick_item
      IMPORTING iv_posnr  TYPE string
                it_items  TYPE ty_its
      EXPORTING es_it     TYPE ty_it
                ev_ok     TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_change
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_ord    TYPE ty_ord
                es_pl     TYPE ty_pl
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prep_qty_date
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
                is_ord    TYPE ty_ord
                it_items  TYPE ty_its
      CHANGING  cs_pl     TYPE ty_pl
                cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prep_block
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
                is_ord    TYPE ty_ord
      CHANGING  cs_pl     TYPE ty_pl
                cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prep_reject
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
                it_items  TYPE ty_its
      CHANGING  cs_pl     TYPE ty_pl
                cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prep_price
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
                is_ord    TYPE ty_ord
                it_items  TYPE ty_its
      CHANGING  cs_pl     TYPE ty_pl
                cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_change
      IMPORTING iv_vbeln    TYPE vbak-vbeln
                is_pl       TYPE ty_pl
                iv_simulate TYPE abap_bool
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result.

    METHODS read_back
      IMPORTING iv_action     TYPE string
                iv_vbeln      TYPE vbak-vbeln
                is_pl         TYPE ty_pl
      CHANGING  cs_result     TYPE zif_mcp_biz_action=>ty_result.

    METHODS so_prepare_create
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_head   TYPE bapisdhd1
                et_items  TYPE ty_b_items
                et_sched  TYPE ty_b_sched
                et_partn  TYPE ty_b_partn
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS parse_new_items
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING et_new    TYPE ty_newits
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS so_call_create
      IMPORTING is_head     TYPE bapisdhd1
                it_items    TYPE ty_b_items
                it_sched    TYPE ty_b_sched
                it_partn    TYPE ty_b_partn
                iv_testrun  TYPE abap_bool
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result.

    " ---- ZCL_MCP_BIZ_SD_SO interface methods, now private
    METHODS so_get_actions
      RETURNING VALUE(rt_actions) TYPE zif_mcp_biz_action=>ty_action_defs.

    METHODS so_query
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS so_preview
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS so_execute
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " ---- from ZCL_MCP_BIZ_SD_DLV
    CONSTANTS:
      " WS_DELIVERY_UPDATE_2 IF_DATABASE_UPDATE_1 = 2 (domain LESHP_DATABASE_UPDATE): check only.
      c_gi_check TYPE leshp_database_update VALUE '2',
      c_gi_save  TYPE leshp_database_update VALUE '1'.

    TYPES:
      ty_dlv_ret2 TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_dlv,
        vbeln     TYPE likp-vbeln,
        lfart     TYPE likp-lfart,
        vbtyp     TYPE likp-vbtyp,
        vstel     TYPE likp-vstel,
        vkorg     TYPE likp-vkorg,
        wadat     TYPE likp-wadat,
        wadat_ist TYPE likp-wadat_ist,
        lifsk     TYPE likp-lifsk,
        faksk     TYPE likp-faksk,
        erdat     TYPE likp-erdat,
        wbstk     TYPE vbuk-wbstk,
        fkstk     TYPE vbuk-fkstk,
        kostk     TYPE vbuk-kostk,
        lvstk     TYPE vbuk-lvstk,
        gbstk     TYPE vbuk-gbstk,
      END OF ty_dlv,
      ty_dlvs TYPE STANDARD TABLE OF ty_dlv WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_li,
        posnr TYPE lips-posnr,
        matnr TYPE lips-matnr,
        arktx TYPE lips-arktx,
        werks TYPE lips-werks,
        lgort TYPE lips-lgort,
        lfimg TYPE lips-lfimg,
        vrkme TYPE lips-vrkme,
        meins TYPE lips-meins,
        lgmng TYPE lips-lgmng,
        pstyv TYPE lips-pstyv,
        bwart TYPE lips-bwart,
        vgbel TYPE lips-vgbel,
        vgpos TYPE lips-vgpos,
        lgnum TYPE lips-lgnum,
        wbsta TYPE vbup-wbsta,
        kosta TYPE vbup-kosta,
        lvsta TYPE vbup-lvsta,
        fksta TYPE vbup-fksta,
      END OF ty_li,
      ty_lis TYPE STANDARD TABLE OF ty_li WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_so,
        vbeln TYPE vbak-vbeln,
        auart TYPE vbak-auart,
        vbtyp TYPE vbak-vbtyp,
        vkorg TYPE vbak-vkorg,
        vtweg TYPE vbak-vtweg,
        spart TYPE vbak-spart,
        lifsk TYPE vbak-lifsk,
        lfstk TYPE vbuk-lfstk,
        abstk TYPE vbuk-abstk,
        cmgst TYPE vbuk-cmgst,
        uvvls TYPE vbuk-uvvls,
      END OF ty_so.

    TYPES:
      BEGIN OF ty_si,
        posnr  TYPE vbap-posnr,
        kwmeng TYPE vbap-kwmeng,
        vrkme  TYPE vbap-vrkme,
        meins  TYPE vbap-meins,
        umvkz  TYPE vbap-umvkz,
        umvkn  TYPE vbap-umvkn,
        pstyv  TYPE vbap-pstyv,
        abgru  TYPE vbap-abgru,
        vstel  TYPE vbap-vstel,
        lfsta  TYPE vbup-lfsta,
      END OF ty_si,
      ty_sis TYPE STANDARD TABLE OF ty_si WITH DEFAULT KEY.

    " Selected order item with the quantity to deliver.
    TYPES:
      BEGIN OF ty_sel,
        posnr TYPE vbap-posnr,
        qty   TYPE vbap-kwmeng,
        vrkme TYPE vbap-vrkme,
        vstel TYPE vbap-vstel,
      END OF ty_sel,
      ty_sels TYPE STANDARD TABLE OF ty_sel WITH DEFAULT KEY.

    METHODS dlv_run
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS dlv_list_open
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS load_dlv
      IMPORTING iv_vbeln TYPE likp-vbeln
      EXPORTING es_dlv   TYPE ty_dlv
                ev_found TYPE abap_bool.

    METHODS load_dlv_items
      IMPORTING iv_vbeln TYPE likp-vbeln
      EXPORTING et_items TYPE ty_lis.

    METHODS dlv_doc_row
      IMPORTING is_dlv        TYPE ty_dlv
      RETURNING VALUE(rs_doc) TYPE zif_mcp_biz_action=>ty_sd_doc.

    METHODS dlv_status_text
      IMPORTING is_dlv         TYPE ty_dlv
      RETURNING VALUE(rv_text) TYPE string.

    METHODS dlv_prepare_create
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING ev_vbeln  TYPE vbak-vbeln
                et_sel    TYPE ty_sels
                ev_vstel  TYPE likp-vstel
                ev_due    TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS dlv_call_create
      IMPORTING iv_vbeln  TYPE vbak-vbeln
                it_sel    TYPE ty_sels
                iv_vstel  TYPE likp-vstel
                iv_due    TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_gi
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_dlv    TYPE ty_dlv
                et_items  TYPE ty_lis
                ev_date   TYPE sy-datum
                ev_pick   TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_gi
      IMPORTING is_dlv      TYPE ty_dlv
                it_items    TYPE ty_lis
                iv_date     TYPE sy-datum
                iv_pick     TYPE abap_bool
                iv_testrun  TYPE abap_bool
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_reverse
      IMPORTING is_dlv      TYPE ty_dlv
                iv_date     TYPE sy-datum
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result.

    METHODS check_period
      IMPORTING iv_werks  TYPE werks_d
                iv_date   TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_prot
      IMPORTING it_prot   TYPE ANY TABLE
                iv_idcomp TYPE string
                iv_nocomp TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS dlv_delivered_su
      IMPORTING is_si         TYPE ty_si
                iv_vbeln      TYPE vbak-vbeln
      RETURNING VALUE(rv_qty) TYPE vbap-kwmeng.

    METHODS mat_doc_of
      IMPORTING iv_vbeln TYPE likp-vbeln
                iv_cat   TYPE vbfa-vbtyp_n
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " ---- ZCL_MCP_BIZ_SD_DLV interface methods, now private
    METHODS dlv_get_actions
      RETURNING VALUE(rt_actions) TYPE zif_mcp_biz_action=>ty_action_defs.

    METHODS dlv_query
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS dlv_preview
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS dlv_execute
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " ---- from ZCL_MCP_BIZ_SD_BIL
    TYPES:
      ty_ret1  TYPE STANDARD TABLE OF bapiret1 WITH DEFAULT KEY,
      ty_retn1 TYPE STANDARD TABLE OF bapireturn1 WITH DEFAULT KEY,
      ty_succ  TYPE STANDARD TABLE OF bapivbrksuccess WITH DEFAULT KEY,
      ty_errs  TYPE STANDARD TABLE OF bapivbrkerrors WITH DEFAULT KEY,
      ty_bd    TYPE STANDARD TABLE OF bapivbrk WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_bil,
        vbeln TYPE vbrk-vbeln,
        fkart TYPE vbrk-fkart,
        vbtyp TYPE vbrk-vbtyp,
        vkorg TYPE vbrk-vkorg,
        fkdat TYPE vbrk-fkdat,
        erdat TYPE vbrk-erdat,
        netwr TYPE vbrk-netwr,
        waerk TYPE vbrk-waerk,
        fksto TYPE vbrk-fksto,
        sfakn TYPE vbrk-sfakn,
        rfbsk TYPE vbrk-rfbsk,
        belnr TYPE vbrk-belnr,
      END OF ty_bil.

    TYPES:
      BEGIN OF ty_due,
        vbeln TYPE vkdfs-vbeln,
        vbtyp TYPE vkdfs-vbtyp,
        fkart TYPE vkdfs-fkart,
        vkorg TYPE vkdfs-vkorg,
        vstel TYPE vkdfs-vstel,
        fkdat TYPE vkdfs-fkdat,
        netwr TYPE vkdfs-netwr,
        waerk TYPE vkdfs-waerk,
      END OF ty_due,
      ty_dues TYPE STANDARD TABLE OF ty_due WITH DEFAULT KEY.

    METHODS bil_run
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS list_due
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS bil_get_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS load_bil
      IMPORTING iv_vbeln TYPE vbrk-vbeln
      EXPORTING es_bil   TYPE ty_bil
                ev_found TYPE abap_bool.

    METHODS bil_doc_row
      IMPORTING is_bil        TYPE ty_bil
      RETURNING VALUE(rs_doc) TYPE zif_mcp_biz_action=>ty_sd_doc.

    METHODS bil_status_text
      IMPORTING is_bil         TYPE ty_bil
      RETURNING VALUE(rv_text) TYPE string.

    METHODS bil_prepare_create
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING ev_ref    TYPE vbak-vbeln
                ev_cat    TYPE vbtyp
                ev_type   TYPE fkart
                ev_date   TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS bil_call_create
      IMPORTING iv_ref      TYPE vbak-vbeln
                iv_cat      TYPE vbtyp
                iv_type     TYPE fkart
                iv_date     TYPE sy-datum
                iv_testrun  TYPE abap_bool
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_cancel
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_bil    TYPE ty_bil
                ev_date   TYPE sy-datum
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_cancel
      IMPORTING is_bil      TYPE ty_bil
                iv_date     TYPE sy-datum
                iv_testrun  TYPE abap_bool
      CHANGING  cs_result   TYPE zif_mcp_biz_action=>ty_result.

    METHODS new_doc_status
      IMPORTING iv_vbeln  TYPE vbrk-vbeln
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " ---- ZCL_MCP_BIZ_SD_BIL interface methods, now private
    METHODS bil_get_actions
      RETURNING VALUE(rt_actions) TYPE zif_mcp_biz_action=>ty_action_defs.

    METHODS bil_query
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS bil_preview
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS bil_execute
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.


CLASS zcl_mcp_biz_sd IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA lt_actions TYPE zif_mcp_biz_action=>ty_action_defs.

    rt_actions = so_get_actions( ).
    lt_actions = dlv_get_actions( ).
    APPEND LINES OF lt_actions TO rt_actions.
    lt_actions = bil_get_actions( ).
    APPEND LINES OF lt_actions TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    DATA lv_text TYPE string.

    IF iv_action CP 'SD.SO.*'.
      rs_result = so_query( iv_action = iv_action is_params = is_params ).
    ELSEIF iv_action CP 'SD.DLV.*'.
      rs_result = dlv_query( iv_action = iv_action is_params = is_params ).
    ELSEIF iv_action CP 'SD.BIL.*'.
      rs_result = bil_query( iv_action = iv_action is_params = is_params ).
    ELSE.
      lv_text = |{ iv_action } is not an action of this module|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    DATA lv_text TYPE string.

    IF iv_action CP 'SD.SO.*'.
      rs_result = so_preview( iv_action = iv_action is_params = is_params ).
    ELSEIF iv_action CP 'SD.DLV.*'.
      rs_result = dlv_preview( iv_action = iv_action is_params = is_params ).
    ELSEIF iv_action CP 'SD.BIL.*'.
      rs_result = bil_preview( iv_action = iv_action is_params = is_params ).
    ELSE.
      lv_text = |{ iv_action } is not an action of this module|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    DATA lv_text TYPE string.

    IF iv_action CP 'SD.SO.*'.
      rs_result = so_execute( iv_action = iv_action is_params = is_params ).
    ELSEIF iv_action CP 'SD.DLV.*'.
      rs_result = dlv_execute( iv_action = iv_action is_params = is_params ).
    ELSEIF iv_action CP 'SD.BIL.*'.
      rs_result = bil_execute( iv_action = iv_action is_params = is_params ).
    ELSE.
      lv_text = |{ iv_action } is not an action of this module|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
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


  METHOD add_ret.
    DATA ls_msg TYPE zif_mcp_biz_action=>ty_message.
    FIELD-SYMBOLS: <ls_ret> TYPE any,
                   <lv_f>   TYPE any.

    LOOP AT it_return ASSIGNING <ls_ret>.
      CLEAR ls_msg.
      ASSIGN COMPONENT 'TYPE' OF STRUCTURE <ls_ret> TO <lv_f>.
      IF sy-subrc = 0.
        ls_msg-type = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'ID' OF STRUCTURE <ls_ret> TO <lv_f>.
      IF sy-subrc = 0.
        ls_msg-id = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'NUMBER' OF STRUCTURE <ls_ret> TO <lv_f>.
      IF sy-subrc = 0.
        ls_msg-number = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'MESSAGE' OF STRUCTURE <ls_ret> TO <lv_f>.
      IF sy-subrc = 0.
        ls_msg-message = <lv_f>.
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
      add_msg( EXPORTING iv_type = ls_ret-type iv_text = lv_text
               CHANGING  cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD to_vbeln.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10 OR iv_value CN '0123456789 '.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = rv_vbeln.
  ENDMETHOD.


  METHOD to_posnr.
    DATA lv_in TYPE c LENGTH 6.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 6 OR iv_value CN '0123456789 '.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    CONDENSE lv_in NO-GAPS.
    rv_posnr = lv_in.
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


  METHOD to_kunnr.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10.
      RETURN.
    ENDIF.
    lv_in = to_upper( iv_value ).
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = rv_kunnr.
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


  METHOD fmt_doc.
    rv_text = iv_vbeln.
    SHIFT rv_text LEFT DELETING LEADING '0'.
  ENDMETHOD.


  METHOD max_rows.
    rv_max = c_max_default.
    IF iv_value IS NOT INITIAL AND iv_value CO '0123456789'.
      rv_max = iv_value.
    ENDIF.
    IF rv_max > c_max_limit.
      rv_max = c_max_limit.
    ENDIF.
    IF rv_max < 1.
      rv_max = c_max_default.
    ENDIF.
  ENDMETHOD.


  METHOD word.
    CASE iv_code.
      WHEN 'A'.
        rv_text = 'open'.
      WHEN 'B'.
        rv_text = 'partly'.
      WHEN 'C'.
        rv_text = 'complete'.
      WHEN OTHERS.
        rv_text = 'n/a'.
    ENDCASE.
  ENDMETHOD.


  METHOD ext_amount.
    DATA: lv_in  TYPE bapicurr-bapicurr,
          lv_out TYPE bapicurr-bapicurr.

    rv_amount = iv_amount.
    IF iv_waers IS INITIAL.
      RETURN.
    ENDIF.
    lv_in = iv_amount.
    CALL FUNCTION 'CURRENCY_AMOUNT_SAP_TO_BAPI'
      EXPORTING
        currency    = iv_waers
        sap_amount  = lv_in
      IMPORTING
        bapi_amount = lv_out.
    rv_amount = lv_out.
  ENDMETHOD.


  METHOD auth_so.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD iv_vkorg
      ID 'VTWEG' FIELD iv_vtweg
      ID 'SPART' FIELD iv_spart
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VBAK_AAT'
      ID 'AUART' FIELD iv_auart
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_dlv.
    AUTHORITY-CHECK OBJECT 'V_LIKP_VST'
      ID 'VSTEL' FIELD iv_vstel
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_gm.
    " Goods movement: movement type and plant (the delivery FMs check neither).
    AUTHORITY-CHECK OBJECT 'M_MSEG_BWA'
      ID 'ACTVT' FIELD '01'
      ID 'BWART' FIELD iv_bwart.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'M_MSEG_WWA'
      ID 'ACTVT' FIELD '01'
      ID 'WERKS' FIELD iv_werks.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_bil.
    AUTHORITY-CHECK OBJECT 'V_VBRK_FKA'
      ID 'FKART' FIELD iv_fkart
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VBRK_VKO'
      ID 'VKORG' FIELD iv_vkorg
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD so_get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/SD/actions.json.
    ls_def-id = 'SD.SO.LIST_OPEN'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.CREATE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.CHANGE_QTY_DATE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.CHANGE_PRICE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.SET_DELIVERY_BLOCK'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.REMOVE_DELIVERY_BLOCK'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.SET_BILLING_BLOCK'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.REMOVE_BILLING_BLOCK'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.REJECT_ITEM'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.SO.UNREJECT_ITEM'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD so_query.
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'SD.SO.LIST_OPEN'.
        rs_result = so_list_open( is_params ).
      WHEN 'SD.SO.GET_DETAIL'.
        rs_result = so_get_detail( is_params ).
      WHEN OTHERS.
        lv_text = |{ iv_action } is not a query action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD so_preview.
    rs_result = so_run( iv_action = iv_action is_params = is_params iv_execute = abap_false ).
  ENDMETHOD.


  METHOD so_execute.
    rs_result = so_run( iv_action = iv_action is_params = is_params iv_execute = abap_true ).
  ENDMETHOD.


  METHOD so_run.
    DATA: ls_ord   TYPE ty_ord,
          ls_pl    TYPE ty_pl,
          ls_head  TYPE bapisdhd1,
          lt_items TYPE ty_b_items,
          lt_sched TYPE ty_b_sched,
          lt_partn TYPE ty_b_partn,
          lv_test  TYPE abap_bool,
          lv_text  TYPE string.

    IF iv_execute = abap_false.
      lv_test = abap_true.
    ENDIF.

    " Every check of the preview runs again on the current data at EXECUTE.
    CASE iv_action.
      WHEN 'SD.SO.CREATE'.
        so_prepare_create( EXPORTING is_params = is_params
                        IMPORTING es_head = ls_head et_items = lt_items
                                  et_sched = lt_sched et_partn = lt_partn
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          so_call_create( EXPORTING is_head = ls_head it_items = lt_items
                                 it_sched = lt_sched it_partn = lt_partn
                                 iv_testrun = lv_test
                       CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN 'SD.SO.CHANGE_QTY_DATE' OR 'SD.SO.CHANGE_PRICE'
        OR 'SD.SO.SET_DELIVERY_BLOCK' OR 'SD.SO.REMOVE_DELIVERY_BLOCK'
        OR 'SD.SO.SET_BILLING_BLOCK' OR 'SD.SO.REMOVE_BILLING_BLOCK'
        OR 'SD.SO.REJECT_ITEM' OR 'SD.SO.UNREJECT_ITEM'.
        prepare_change( EXPORTING iv_action = iv_action is_params = is_params
                        IMPORTING es_ord = ls_ord es_pl = ls_pl
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_change( EXPORTING iv_vbeln = ls_ord-vbeln is_pl = ls_pl
                                 iv_simulate = lv_test
                       CHANGING  cs_result = rs_result ).
          IF iv_execute = abap_true AND rs_result-failed = abap_false.
            read_back( EXPORTING iv_action = iv_action iv_vbeln = ls_ord-vbeln is_pl = ls_pl
                       CHANGING  cs_result = rs_result ).
          ELSEIF iv_execute = abap_false AND rs_result-failed = abap_false.
            add_msg( EXPORTING iv_type = 'I'
                               iv_text = 'Preview = BAPI simulation: the save-time checks of the document are not run'
                     CHANGING  cs_result = rs_result ).
          ENDIF.
        ENDIF.

      WHEN OTHERS.
        lv_text = |{ iv_action } is not a write action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING  cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD so_list_open.
    DATA: lv_vkorg  TYPE vbak-vkorg,
          lv_status TYPE string,
          lv_cat    TYPE string,
          lv_max    TYPE i,
          lv_fetch  TYPE i,
          lv_from   TYPE i,
          lv_lines  TYPE i,
          lv_date   TYPE sy-datum,
          lv_key    TYPE string,
          lv_text   TYPE string,
          lt_where  TYPE string_table,
          lv_sql_cols TYPE string,
          lv_sql_from TYPE string,
          lr_auart  TYPE RANGE OF vbak-auart,
          ls_auart  LIKE LINE OF lr_auart,
          lr_vtweg  TYPE RANGE OF vbak-vtweg,
          ls_vtweg  LIKE LINE OF lr_vtweg,
          lr_vbtyp  TYPE RANGE OF vbak-vbtyp,
          ls_vbtyp  LIKE LINE OF lr_vbtyp,
          lr_erdat  TYPE RANGE OF vbak-erdat,
          ls_erdat  LIKE LINE OF lr_erdat,
          lt_rows   TYPE ty_ords,
          ls_doc    TYPE zif_mcp_biz_action=>ty_sd_doc,
          lt_ok     TYPE STANDARD TABLE OF string WITH DEFAULT KEY,
          lt_no     TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
    FIELD-SYMBOLS <ls_row> TYPE ty_ord.

    " Business-meaning parameters have no defaults: the skill asks them.
    lv_vkorg  = to_upper( is_params-vkorg ).
    lv_status = is_params-status.
    IF lv_vkorg IS INITIAL OR strlen( is_params-vkorg ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vkorg is required (sales organization)'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    IF lv_status <> 'not_delivered' AND lv_status <> 'partly_delivered'
       AND lv_status <> 'delivery_blocked' AND lv_status <> 'credit_blocked'
       AND lv_status <> 'incomplete' AND lv_status <> 'all_open'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'status is required: not_delivered, partly_delivered, delivery_blocked, credit_blocked, incomplete or all_open'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    lv_cat = is_params-doc_category.
    IF lv_cat IS NOT INITIAL AND lv_cat <> 'standard' AND lv_cat <> 'free_of_charge'
       AND lv_cat <> 'return' AND lv_cat <> 'credit_memo_request' AND lv_cat <> 'debit_memo_request'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'doc_category: standard, free_of_charge, return, credit_memo_request or debit_memo_request'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    IF is_params-created_from IS NOT INITIAL.
      lv_date = to_date( is_params-created_from ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'created_from must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = rs_result ).
      ENDIF.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    lv_max   = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.

    IF is_params-auart IS NOT INITIAL.
      ls_auart-sign = 'I'. ls_auart-option = 'EQ'. ls_auart-low = to_upper( is_params-auart ).
      APPEND ls_auart TO lr_auart.
    ENDIF.
    IF is_params-vtweg IS NOT INITIAL.
      ls_vtweg-sign = 'I'. ls_vtweg-option = 'EQ'. ls_vtweg-low = to_upper( is_params-vtweg ).
      APPEND ls_vtweg TO lr_vtweg.
    ENDIF.
    IF lv_date IS NOT INITIAL.
      ls_erdat-sign = 'I'. ls_erdat-option = 'GE'. ls_erdat-low = lv_date.
      APPEND ls_erdat TO lr_erdat.
    ENDIF.
    ls_vbtyp-sign = 'I'. ls_vbtyp-option = 'EQ'.
    CASE lv_cat.
      WHEN 'standard'.
        ls_vbtyp-low = 'C'. APPEND ls_vbtyp TO lr_vbtyp.
      WHEN 'free_of_charge'.
        ls_vbtyp-low = 'I'. APPEND ls_vbtyp TO lr_vbtyp.
      WHEN 'return'.
        ls_vbtyp-low = 'H'. APPEND ls_vbtyp TO lr_vbtyp.
      WHEN 'credit_memo_request'.
        ls_vbtyp-low = 'K'. APPEND ls_vbtyp TO lr_vbtyp.
      WHEN 'debit_memo_request'.
        ls_vbtyp-low = 'L'. APPEND ls_vbtyp TO lr_vbtyp.
      WHEN OTHERS.
        ls_vbtyp-low = 'C'. APPEND ls_vbtyp TO lr_vbtyp.
        ls_vbtyp-low = 'H'. APPEND ls_vbtyp TO lr_vbtyp.
        ls_vbtyp-low = 'I'. APPEND ls_vbtyp TO lr_vbtyp.
        ls_vbtyp-low = 'K'. APPEND ls_vbtyp TO lr_vbtyp.
        ls_vbtyp-low = 'L'. APPEND ls_vbtyp TO lr_vbtyp.
    ENDCASE.

    " Status conditions: fixed fragments only, no user input inside.
    CASE lv_status.
      WHEN 'not_delivered'.
        APPEND `u~lfstk = 'A' AND u~abstk <> 'C'` TO lt_where.
      WHEN 'partly_delivered'.
        APPEND `u~lfstk = 'B' AND u~abstk <> 'C'` TO lt_where.
      WHEN 'delivery_blocked'.
        APPEND `k~lifsk <> ' ' AND u~gbstk <> 'C' AND u~abstk <> 'C'` TO lt_where.
      WHEN 'credit_blocked'.
        APPEND `u~cmgst = 'B' AND u~gbstk <> 'C' AND u~abstk <> 'C'` TO lt_where.
      WHEN 'incomplete'.
        APPEND `( u~uvall = 'A' OR u~uvall = 'B' ) AND u~gbstk <> 'C' AND u~abstk <> 'C'` TO lt_where.
      WHEN OTHERS.
        APPEND `u~gbstk <> 'C' AND u~abstk <> 'C'` TO lt_where.
    ENDCASE.

    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `VBAK`
                           iv_cols = `k~vbeln k~auart k~vbtyp k~vkorg k~vtweg k~spart k~erdat k~vdatu ` &&
                                     `k~netwr k~waerk k~lifsk k~faksk ` &&
                                     `u~lfstk u~wbstk u~fkstk u~abstk u~gbstk u~cmgst u~uvall` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `VBAK` iv_alias = `k` ).
    SELECT (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF TABLE lt_rows
      UP TO lv_fetch ROWS
      WHERE k~vkorg = lv_vkorg
        AND k~vtweg IN lr_vtweg
        AND k~auart IN lr_auart
        AND k~vbtyp IN lr_vbtyp
        AND k~erdat IN lr_erdat
        AND (lt_where)
      ORDER BY k~erdat DESCENDING k~vbeln DESCENDING.

    " Display authorization per sales area and order type.
    LOOP AT lt_rows ASSIGNING <ls_row>.
      lv_key = |{ <ls_row>-vtweg }{ <ls_row>-spart }{ <ls_row>-auart }|.
      READ TABLE lt_ok TRANSPORTING NO FIELDS WITH KEY table_line = lv_key.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_no TRANSPORTING NO FIELDS WITH KEY table_line = lv_key.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      IF auth_so( iv_vkorg = <ls_row>-vkorg iv_vtweg = <ls_row>-vtweg iv_spart = <ls_row>-spart
                  iv_auart = <ls_row>-auart iv_actvt = '03' ) = abap_true.
        APPEND lv_key TO lt_ok.
      ELSE.
        APPEND lv_key TO lt_no.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_no INTO lv_key.
      lv_lines = lines( lt_rows ).
      DELETE lt_rows WHERE vtweg = lv_key(2) AND spart = lv_key+2(2) AND auart = lv_key+4.
      rs_result-hidden_no_auth = rs_result-hidden_no_auth + lv_lines - lines( lt_rows ).
    ENDLOOP.

    IF lines( lt_rows ) > lv_max.
      rs_result-truncated = abap_true.
      lv_from = lv_max + 1.
      DELETE lt_rows FROM lv_from.
    ENDIF.

    LOOP AT lt_rows ASSIGNING <ls_row>.
      ls_doc = so_doc_row( <ls_row> ).
      APPEND ls_doc TO rs_result-sd_docs.
    ENDLOOP.

    lv_lines = lines( rs_result-sd_docs ).
    lv_text = |{ lv_lines } open sales documents|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD so_get_detail.
    DATA: ls_ord   TYPE ty_ord,
          lt_items TYPE ty_its,
          ls_it    TYPE ty_it,
          ls_out   TYPE zif_mcp_biz_action=>ty_sd_item,
          lt_sc    TYPE STANDARD TABLE OF vbep WITH DEFAULT KEY,
          ls_sc    TYPE vbep,
          ls_osc   TYPE zif_mcp_biz_action=>ty_sd_sched,
          lt_fl    TYPE STANDARD TABLE OF vbfa WITH DEFAULT KEY,
          ls_fl    TYPE vbfa,
          ls_ofl   TYPE zif_mcp_biz_action=>ty_sd_flow,
          lv_ok    TYPE abap_bool,
          lv_dl    TYPE vbap-kwmeng,
          lv_n     TYPE i,
          lv_text  TYPE string.

    check_order( EXPORTING iv_vbeln = is_params-vbeln iv_actvt = '03'
                 IMPORTING es_ord = ls_ord et_items = lt_items ev_ok = lv_ok
                 CHANGING  cs_result = rs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.

    rs_result-sd_header = so_doc_row( ls_ord ).
    rs_result-sd_header-items = lines( lt_items ).

    LOOP AT lt_items INTO ls_it.
      CLEAR ls_out.
      MOVE-CORRESPONDING ls_it TO ls_out.
      ls_out-vbeln = ls_ord-vbeln.
      ls_out-qty   = ls_it-kwmeng.
      ls_out-netwr = ext_amount( iv_amount = ls_it-netwr iv_waers = ls_ord-waerk ).
      ls_out-netpr = ext_amount( iv_amount = ls_it-netpr iv_waers = ls_ord-waerk ).
      IF ls_it-lfsta IS NOT INITIAL.
        lv_dl = so_delivered_su( is_it = ls_it iv_vbeln = ls_ord-vbeln ).
        ls_out-open_qty = ls_it-kwmeng - lv_dl.
        IF ls_out-open_qty < 0.
          ls_out-open_qty = 0.
        ENDIF.
      ENDIF.
      APPEND ls_out TO rs_result-sd_items.
    ENDLOOP.

    SELECT * FROM vbep INTO TABLE lt_sc WHERE vbeln = ls_ord-vbeln ORDER BY posnr etenr.
    LOOP AT lt_sc INTO ls_sc.
      CLEAR ls_osc.
      MOVE-CORRESPONDING ls_sc TO ls_osc.
      APPEND ls_osc TO rs_result-sd_sched.
    ENDLOOP.

    SELECT * FROM vbfa INTO TABLE lt_fl UP TO 200 ROWS
      WHERE vbelv = ls_ord-vbeln ORDER BY vbeln posnn.
    LOOP AT lt_fl INTO ls_fl.
      CLEAR ls_ofl.
      MOVE-CORRESPONDING ls_fl TO ls_ofl.
      APPEND ls_ofl TO rs_result-sd_flow.
    ENDLOOP.

    lv_n = lines( lt_items ).
    lv_text = |Order { fmt_doc( ls_ord-vbeln ) }: { lv_n } items, { rs_result-sd_header-status }|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD check_order.
    DATA: lv_vbeln TYPE vbak-vbeln,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    CLEAR: es_ord, et_items, ev_ok.
    lv_vbeln = to_vbeln( iv_vbeln ).
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (digits, up to 10)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_order( EXPORTING iv_vbeln = lv_vbeln
                IMPORTING es_ord = es_ord ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Sales document { fmt_doc( lv_vbeln ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_ord-vbtyp NA 'ABCGHIKL'.
      lv_text = |Document { fmt_doc( lv_vbeln ) } is not a sales order, quotation, return or request|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_so( iv_vkorg = es_ord-vkorg iv_vtweg = es_ord-vtweg iv_spart = es_ord-spart
                iv_auart = es_ord-auart iv_actvt = iv_actvt ) = abap_false.
      lv_text = |No authorization for document { fmt_doc( lv_vbeln ) } (sales area { es_ord-vkorg }/{ es_ord-vtweg }/{ es_ord-spart }, order type { es_ord-auart })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_items( EXPORTING iv_vbeln = lv_vbeln IMPORTING et_items = et_items ).
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD load_order.
    DATA: lv_sql_cols TYPE string,
          lv_sql_from TYPE string.

    CLEAR: es_ord, ev_found.
    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `VBAK`
                           iv_cols = `k~vbeln k~auart k~vbtyp k~vkorg k~vtweg k~spart k~erdat k~vdatu ` &&
                                     `k~netwr k~waerk k~lifsk k~faksk ` &&
                                     `u~lfstk u~wbstk u~fkstk u~abstk u~gbstk u~cmgst u~uvall` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `VBAK` iv_alias = `k` ).
    SELECT SINGLE (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF es_ord
      WHERE k~vbeln = iv_vbeln.
    IF sy-subrc = 0.
      ev_found = abap_true.
      " S/4: delivery-related billing leaves no status on the order header (ECC: no-op).
      IF es_ord-fkstk IS INITIAL.
        es_ord-fkstk = zcl_mcp_biz_sys=>get( )->sd_order_dlv_billing( iv_vbeln ).
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD load_items.
    DATA: lv_sql_cols TYPE string,
          lv_sql_from TYPE string.
    FIELD-SYMBOLS <ls_it> LIKE LINE OF et_items.

    CLEAR et_items.
    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `VBAP`
                           iv_cols = `p~posnr p~matnr p~arktx p~werks p~lgort p~kwmeng p~vrkme p~meins ` &&
                                     `p~umvkz p~umvkn p~pstyv p~abgru p~netwr p~netpr ` &&
                                     `u~lfsta u~wbsta u~fksta u~gbsta u~absta` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `VBAP` iv_alias = `p` ).
    SELECT (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF TABLE et_items
      WHERE p~vbeln = iv_vbeln.
    SORT et_items BY posnr.
    " Delivery-related billing leaves no status on an S/4 order item: the flow tells (ECC: no-op).
    LOOP AT et_items ASSIGNING <ls_it> WHERE fksta IS INITIAL.
      <ls_it>-fksta = zcl_mcp_biz_sys=>get( )->sd_item_dlv_billing( iv_vbeln = iv_vbeln iv_posnr = <ls_it>-posnr
                                                                    iv_lfsta = <ls_it>-lfsta ).
    ENDLOOP.
  ENDMETHOD.


  METHOD so_delivered_su.
    DATA: lv_base TYPE vbfa-rfmng,
          lv_sum  TYPE p LENGTH 15 DECIMALS 3.

    " Delivered quantity of an order item in sales units: referenced quantity of the
    " delivery documents (base unit) converted with the item conversion factors.
    SELECT SUM( rfmng ) FROM vbfa INTO lv_base
      WHERE vbelv = iv_vbeln AND posnv = is_it-posnr
        AND ( vbtyp_n = 'J' OR vbtyp_n = 'T' ).
    lv_sum = lv_base.
    IF is_it-umvkz > 0 AND is_it-umvkn > 0 AND is_it-vrkme <> is_it-meins.
      lv_sum = lv_sum * is_it-umvkn / is_it-umvkz.
    ENDIF.
    rv_qty = lv_sum.
  ENDMETHOD.


  METHOD so_status_text.
    DATA lv_text TYPE string.

    lv_text = |delivery { word( is_ord-lfstk ) }, billing { word( is_ord-fkstk ) }|.
    IF is_ord-abstk = 'C'.
      lv_text = lv_text && ', rejected'.
    ELSEIF is_ord-abstk = 'B'.
      lv_text = lv_text && ', partly rejected'.
    ENDIF.
    IF is_ord-lifsk IS NOT INITIAL.
      lv_text = lv_text && ', delivery block ' && is_ord-lifsk.
    ENDIF.
    IF is_ord-faksk IS NOT INITIAL.
      lv_text = lv_text && ', billing block ' && is_ord-faksk.
    ENDIF.
    IF is_ord-cmgst = 'B'.
      lv_text = lv_text && ', credit blocked'.
    ENDIF.
    IF is_ord-uvall = 'A' OR is_ord-uvall = 'B'.
      lv_text = lv_text && ', incomplete'.
    ENDIF.
    rv_text = lv_text.
  ENDMETHOD.


  METHOD so_doc_row.
    MOVE-CORRESPONDING is_ord TO rs_doc.
    rs_doc-doc_type = is_ord-auart.
    rs_doc-date1    = is_ord-vdatu.
    rs_doc-netwr    = ext_amount( iv_amount = is_ord-netwr iv_waers = is_ord-waerk ).
    rs_doc-status   = so_status_text( is_ord ).
  ENDMETHOD.


  METHOD pick_item.
    DATA: lv_posnr TYPE vbap-posnr,
          lv_text  TYPE string.

    CLEAR: es_it, ev_ok.
    IF iv_posnr IS INITIAL.
      IF lines( it_items ) = 1.
        READ TABLE it_items INTO es_it INDEX 1.
        ev_ok = abap_true.
        RETURN.
      ENDIF.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posnr is required: the order has several items'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_posnr = to_posnr( iv_posnr ).
    IF lv_posnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posnr must be digits (item number, up to 6)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    READ TABLE it_items INTO es_it WITH KEY posnr = lv_posnr.
    IF sy-subrc <> 0.
      lv_text = |Item { lv_posnr } not found in the order|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD prepare_change.
    DATA: lt_items TYPE ty_its,
          lv_ok    TYPE abap_bool,
          lv_text  TYPE string.

    CLEAR es_pl.
    check_order( EXPORTING iv_vbeln = is_params-vbeln iv_actvt = '02'
                 IMPORTING es_ord = es_ord et_items = lt_items ev_ok = lv_ok
                 CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    cs_result-sd_status_new = so_status_text( es_ord ).
    IF es_ord-abstk = 'C' AND iv_action <> 'SD.SO.UNREJECT_ITEM'.
      lv_text = |Order { fmt_doc( es_ord-vbeln ) } is rejected completely|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    CASE iv_action.
      WHEN 'SD.SO.CHANGE_QTY_DATE'.
        prep_qty_date( EXPORTING is_params = is_params is_ord = es_ord it_items = lt_items
                       CHANGING  cs_pl = es_pl cs_result = cs_result ).
      WHEN 'SD.SO.CHANGE_PRICE'.
        prep_price( EXPORTING is_params = is_params is_ord = es_ord it_items = lt_items
                    CHANGING  cs_pl = es_pl cs_result = cs_result ).
      WHEN 'SD.SO.REJECT_ITEM' OR 'SD.SO.UNREJECT_ITEM'.
        prep_reject( EXPORTING iv_action = iv_action is_params = is_params it_items = lt_items
                     CHANGING  cs_pl = es_pl cs_result = cs_result ).
      WHEN OTHERS.
        prep_block( EXPORTING iv_action = iv_action is_params = is_params is_ord = es_ord
                    CHANGING  cs_pl = es_pl cs_result = cs_result ).
    ENDCASE.
  ENDMETHOD.


  METHOD prep_qty_date.
    DATA: ls_it    TYPE ty_it,
          lv_ok    TYPE abap_bool,
          lt_sc    TYPE STANDARD TABLE OF vbep WITH DEFAULT KEY,
          ls_sc    TYPE vbep,
          ls_scx   TYPE vbep,
          lv_n     TYPE i,
          lv_etenr TYPE vbep-etenr,
          lv_qty   TYPE vbap-kwmeng,
          lv_qok   TYPE abap_bool,
          lv_dl    TYPE vbap-kwmeng,
          lv_old   TYPE vbap-kwmeng,
          lv_date  TYPE sy-datum,
          lv_req   TYPE vbap-kwmeng,
          lv_rdate TYPE sy-datum,
          ls_b     TYPE bapisditm,
          ls_bx    TYPE bapisditmx,
          ls_s     TYPE bapischdl,
          ls_sx    TYPE bapischdlx,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_text  TYPE string.

    pick_item( EXPORTING iv_posnr = is_params-posnr it_items = it_items
               IMPORTING es_it = ls_it ev_ok = lv_ok
               CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    IF is_params-new_quantity IS INITIAL AND is_params-new_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Give new_quantity or new_date: nothing to change'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_it-abgru IS NOT INITIAL.
      lv_text = |Item { ls_it-posnr } is rejected (reason { ls_it-abgru }): it cannot be changed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_it-lfsta = 'C'.
      lv_text = |Item { ls_it-posnr } is delivered completely: quantity and date are fixed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Schedule line: the given one, or the only line with a quantity.
    SELECT * FROM vbep INTO TABLE lt_sc
      WHERE vbeln = is_ord-vbeln AND posnr = ls_it-posnr ORDER BY etenr.
    LOOP AT lt_sc INTO ls_sc WHERE wmeng > 0.
      lv_n = lv_n + 1.
    ENDLOOP.
    IF lv_n = 0.
      lv_n = lines( lt_sc ).
    ENDIF.
    IF is_params-sched_line IS NOT INITIAL.
      IF strlen( is_params-sched_line ) > 4 OR is_params-sched_line CN '0123456789'.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'sched_line must be digits (up to 4)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_etenr = is_params-sched_line.
    ELSEIF lv_n = 1.
      LOOP AT lt_sc INTO ls_sc.
        IF ls_sc-wmeng > 0 OR lines( lt_sc ) = 1.
          lv_etenr = ls_sc-etenr.
          EXIT.
        ENDIF.
      ENDLOOP.
    ELSEIF lv_n > 1.
      lv_text = |Item { ls_it-posnr } has { lv_n } schedule lines: give sched_line|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    READ TABLE lt_sc INTO ls_scx WITH KEY etenr = lv_etenr.
    IF sy-subrc <> 0.
      lv_text = |Schedule line { lv_etenr } not found for item { ls_it-posnr }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    lv_req   = ls_scx-wmeng.
    lv_old   = ls_scx-wmeng.
    lv_rdate = ls_scx-edatu.
    IF is_params-new_quantity IS NOT INITIAL.
      to_qty( EXPORTING iv_value = is_params-new_quantity IMPORTING ev_qty = lv_qty ev_ok = lv_qok ).
      IF lv_qok = abap_false OR lv_qty <= 0.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = 'new_quantity must be a positive number (to remove the item use SD.SO.REJECT_ITEM)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_dl = so_delivered_su( is_it = ls_it iv_vbeln = is_ord-vbeln ).
      IF lv_qty < lv_dl.
        lv_text = |new_quantity is below the delivered quantity ({ fmt_qty( lv_dl ) })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_qty = lv_old.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'The schedule line already has this quantity: nothing to change'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_req = lv_qty.
      ls_chg-field     = |ITEM { ls_it-posnr } SCHEDULE { lv_etenr } QUANTITY|.
      ls_chg-old_value = fmt_qty( lv_old ).
      ls_chg-new_value = fmt_qty( lv_qty ).
      APPEND ls_chg TO cs_result-changes.
    ENDIF.
    IF is_params-new_date IS NOT INITIAL.
      lv_date = to_date( is_params-new_date ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_date must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_date = ls_scx-edatu.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'The schedule line already has this date: nothing to change'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_date < sy-datum.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'new_date is in the past'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
      lv_rdate = lv_date.
      ls_chg-field     = |ITEM { ls_it-posnr } SCHEDULE { lv_etenr } DATE|.
      ls_chg-old_value = fmt_date( ls_scx-edatu ).
      ls_chg-new_value = fmt_date( lv_date ).
      APPEND ls_chg TO cs_result-changes.
    ENDIF.
    IF ls_it-lfsta = 'B'.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The item is delivered partly: only the open quantity is affected'
               CHANGING  cs_result = cs_result ).
    ENDIF.

    " Item quantity follows the schedule line when the item has only one.
    IF is_params-new_quantity IS NOT INITIAL AND lv_n <= 1.
      ls_b-itm_number  = ls_it-posnr.
      ls_b-target_qty  = lv_req.
      ls_bx-itm_number = ls_it-posnr.
      ls_bx-updateflag = 'U'.
      ls_bx-target_qty = 'X'.
      APPEND ls_b TO cs_pl-it.
      APPEND ls_bx TO cs_pl-itx.
    ENDIF.
    ls_s-itm_number  = ls_it-posnr.
    ls_s-sched_line  = lv_etenr.
    ls_s-req_qty     = lv_req.
    ls_s-req_date    = lv_rdate.
    ls_sx-itm_number = ls_it-posnr.
    ls_sx-sched_line = lv_etenr.
    ls_sx-updateflag = 'U'.
    ls_sx-req_qty    = 'X'.
    ls_sx-req_date   = 'X'.
    APPEND ls_s TO cs_pl-sl.
    APPEND ls_sx TO cs_pl-slx.
    cs_pl-posnr = ls_it-posnr.
    cs_pl-etenr = lv_etenr.
    cs_pl-qty   = lv_req.
    cs_pl-edatu = lv_rdate.
  ENDMETHOD.


  METHOD prep_block.
    DATA: lv_reason TYPE c LENGTH 2,
          lv_cur    TYPE c LENGTH 2,
          lv_set    TYPE abap_bool,
          lv_deliv  TYPE abap_bool,
          lv_chk    TYPE c LENGTH 2,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string.

    IF iv_action = 'SD.SO.SET_DELIVERY_BLOCK' OR iv_action = 'SD.SO.REMOVE_DELIVERY_BLOCK'.
      lv_deliv = abap_true.
      lv_cur   = is_ord-lifsk.
    ELSE.
      lv_cur = is_ord-faksk.
    ENDIF.
    IF iv_action = 'SD.SO.SET_DELIVERY_BLOCK' OR iv_action = 'SD.SO.SET_BILLING_BLOCK'.
      lv_set = abap_true.
    ENDIF.

    IF lv_set = abap_true.
      IF is_params-reason IS INITIAL OR strlen( is_params-reason ) > 2.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'reason is required (block reason, up to 2 characters)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_reason = to_upper( is_params-reason ).
      IF lv_deliv = abap_true.
        SELECT SINGLE lifsp FROM tvls INTO lv_chk WHERE lifsp = lv_reason.
      ELSE.
        SELECT SINGLE faksp FROM tvfs INTO lv_chk WHERE faksp = lv_reason.
      ENDIF.
      IF sy-subrc <> 0.
        IF lv_deliv = abap_true.
          lv_text = |Delivery block reason { lv_reason } does not exist|.
        ELSE.
          lv_text = |Billing block reason { lv_reason } does not exist|.
        ENDIF.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_reason = lv_cur.
        lv_text = |Order { fmt_doc( is_ord-vbeln ) } already has block { lv_cur }: nothing to change|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_cur IS NOT INITIAL.
        lv_text = |The existing block { lv_cur } is replaced|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
      ENDIF.
    ELSE.
      IF lv_cur IS INITIAL.
        lv_text = |Order { fmt_doc( is_ord-vbeln ) } has no block: nothing to change|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    cs_pl-headx-updateflag = 'U'.
    IF lv_deliv = abap_true.
      cs_pl-head-dlv_block  = lv_reason.
      cs_pl-headx-dlv_block = 'X'.
      ls_chg-field = 'DELIVERY_BLOCK'.
    ELSE.
      cs_pl-head-bill_block  = lv_reason.
      cs_pl-headx-bill_block = 'X'.
      ls_chg-field = 'BILLING_BLOCK'.
    ENDIF.
    cs_pl-reason     = lv_reason.
    ls_chg-old_value = lv_cur.
    ls_chg-new_value = lv_reason.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD prep_reject.
    DATA: ls_it     TYPE ty_it,
          lv_ok     TYPE abap_bool,
          lv_reason TYPE c LENGTH 2,
          lv_chk    TYPE tvag-abgru,
          ls_b      TYPE bapisditm,
          ls_bx     TYPE bapisditmx,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string.

    pick_item( EXPORTING iv_posnr = is_params-posnr it_items = it_items
               IMPORTING es_it = ls_it ev_ok = lv_ok
               CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    IF iv_action = 'SD.SO.REJECT_ITEM'.
      IF is_params-reason IS INITIAL OR strlen( is_params-reason ) > 2.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'reason is required (reason for rejection, up to 2 characters)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_reason = to_upper( is_params-reason ).
      SELECT SINGLE abgru FROM tvag INTO lv_chk WHERE abgru = lv_reason.
      IF sy-subrc <> 0.
        lv_text = |Reason for rejection { lv_reason } does not exist|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ls_it-abgru IS NOT INITIAL.
        lv_text = |Item { ls_it-posnr } is already rejected (reason { ls_it-abgru })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ls_it-lfsta = 'B' OR ls_it-lfsta = 'C' OR ls_it-fksta = 'B' OR ls_it-fksta = 'C'.
        lv_text = |Item { ls_it-posnr } is already delivered or billed (partly): it cannot be rejected|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ELSE.
      IF ls_it-abgru IS INITIAL.
        lv_text = |Item { ls_it-posnr } is not rejected: nothing to change|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    ls_b-itm_number  = ls_it-posnr.
    ls_b-reason_rej  = lv_reason.
    ls_bx-itm_number = ls_it-posnr.
    ls_bx-updateflag = 'U'.
    ls_bx-reason_rej = 'X'.
    APPEND ls_b TO cs_pl-it.
    APPEND ls_bx TO cs_pl-itx.
    cs_pl-posnr  = ls_it-posnr.
    cs_pl-reason = lv_reason.
    ls_chg-field     = |ITEM { ls_it-posnr } REASON_FOR_REJECTION|.
    ls_chg-old_value = ls_it-abgru.
    ls_chg-new_value = lv_reason.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD prep_price.
    DATA: ls_it    TYPE ty_it,
          lv_ok    TYPE abap_bool,
          lv_kschl TYPE t685-kschl,
          lv_krech TYPE t685a-krech,
          lv_amt   TYPE bapicond-cond_value,
          lv_text  TYPE string,
          lv_cur   TYPE tcurc-waers,
          lv_chk   TYPE tcurc-waers,
          lv_old   TYPE vbak-netwr,
          ls_c     TYPE bapicond,
          ls_cx    TYPE bapicondx,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change.

    pick_item( EXPORTING iv_posnr = is_params-posnr it_items = it_items
               IMPORTING es_it = ls_it ev_ok = lv_ok
               CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    IF is_params-cond_type IS INITIAL OR strlen( is_params-cond_type ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'cond_type is required (pricing condition type, up to 4 characters)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_kschl = to_upper( is_params-cond_type ).
    SELECT SINGLE kschl FROM t685 INTO lv_kschl
      WHERE kvewe = 'A' AND kappl = 'V' AND kschl = lv_kschl.
    IF sy-subrc <> 0.
      lv_text = |Condition type { lv_kschl } does not exist for sales pricing|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE krech FROM t685a INTO lv_krech WHERE kappl = 'V' AND kschl = lv_kschl.
    IF is_params-new_price IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'new_price is required' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_text = is_params-new_price.
    CONDENSE lv_text NO-GAPS.
    TRY.
        lv_amt = lv_text.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_overflow.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_price must be a number' CHANGING cs_result = cs_result ).
        RETURN.
    ENDTRY.
    IF lv_amt < 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'new_price must not be negative' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_it-abgru IS NOT INITIAL.
      lv_text = |Item { ls_it-posnr } is rejected: the price cannot be changed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_it-fksta = 'B' OR ls_it-fksta = 'C'.
      lv_text = |Item { ls_it-posnr } is already billed (partly): the price cannot be changed|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_it-lfsta = 'B' OR ls_it-lfsta = 'C'.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = 'The item is already delivered (partly): the new price applies to the billing'
               CHANGING  cs_result = cs_result ).
    ENDIF.

    " Currency only for amount conditions (not for percentages, calculation type A).
    IF lv_krech <> 'A'.
      lv_cur = is_ord-waerk.
      IF is_params-currency IS NOT INITIAL.
        lv_cur = to_upper( is_params-currency ).
        SELECT SINGLE waers FROM tcurc INTO lv_chk WHERE waers = lv_cur.
        IF sy-subrc <> 0.
          lv_text = |Currency { lv_cur } does not exist|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
      ENDIF.
    ENDIF.

    ls_c-itm_number  = ls_it-posnr.
    ls_c-cond_type   = lv_kschl.
    ls_c-cond_value  = lv_amt.
    ls_c-currency    = lv_cur.
    ls_cx-itm_number = ls_it-posnr.
    ls_cx-cond_type  = lv_kschl.
    ls_cx-updateflag = 'U'.
    ls_cx-cond_value = 'X'.
    IF lv_cur IS NOT INITIAL.
      ls_cx-currency = 'X'.
    ENDIF.
    APPEND ls_c TO cs_pl-co.
    APPEND ls_cx TO cs_pl-cox.
    cs_pl-posnr  = ls_it-posnr.
    cs_pl-kschl  = lv_kschl.
    cs_pl-amount = lv_amt.
    cs_pl-netpr  = ls_it-netpr.
    cs_pl-netwr  = ls_it-netwr.
    lv_old = ext_amount( iv_amount = ls_it-netwr iv_waers = is_ord-waerk ).
    ls_chg-field     = |ITEM { ls_it-posnr } CONDITION { lv_kschl }|.
    ls_chg-old_value = |item net value { lv_old } { is_ord-waerk }|.
    ls_chg-new_value = lv_text.
    CONDENSE ls_chg-old_value.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD call_change.
    DATA: lt_ret   TYPE ty_so_ret2,
          ls_head  TYPE bapisdh1,
          ls_headx TYPE bapisdh1x,
          lt_it    TYPE ty_b_items,
          lt_itx   TYPE ty_b_itemx,
          lt_sl    TYPE ty_b_sched,
          lt_slx   TYPE ty_b_schex,
          lt_co    TYPE ty_b_cond,
          lt_cox   TYPE ty_b_condx,
          lv_sim   TYPE bapiflag-bapiflag,
          lv_doc   TYPE bapivbeln-vbeln.

    ls_head  = is_pl-head.
    ls_headx = is_pl-headx.
    " The BAPI wants the update flag of the header structure for every change.
    ls_headx-updateflag = 'U'.
    lt_it    = is_pl-it.
    lt_itx   = is_pl-itx.
    lt_sl    = is_pl-sl.
    lt_slx   = is_pl-slx.
    lt_co    = is_pl-co.
    lt_cox   = is_pl-cox.
    lv_doc   = iv_vbeln.
    IF iv_simulate = abap_true.
      lv_sim = 'X'.
    ENDIF.

    CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
      EXPORTING
        salesdocument    = lv_doc
        order_header_in  = ls_head
        order_header_inx = ls_headx
        simulation       = lv_sim
      TABLES
        return           = lt_ret
        order_item_in    = lt_it
        order_item_inx   = lt_itx
        schedule_lines   = lt_sl
        schedule_linesx  = lt_slx
        conditions_in    = lt_co
        conditions_inx   = lt_cox
      EXCEPTIONS
        error_message    = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF iv_simulate = abap_true OR cs_result-failed = abap_true.
      do_rollback( ).
    ELSE.
      commit_wait( CHANGING cs_result = cs_result ).
      finish( CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD read_back.
    DATA: lv_ok    TYPE abap_bool,
          lv_lifsk TYPE vbak-lifsk,
          lv_faksk TYPE vbak-faksk,
          lv_abgru TYPE vbap-abgru,
          lv_wmeng TYPE vbep-wmeng,
          lv_edatu TYPE vbep-edatu,
          lv_netpr TYPE vbap-netpr,
          lv_netwr TYPE vbap-netwr,
          lv_waerk TYPE vbak-waerk,
          lv_oldx  TYPE vbak-netwr,
          lv_newx  TYPE vbak-netwr,
          ls_ord   TYPE ty_ord,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    " The BAPI saves in the update task: wait until the new value shows up in the tables.
    DO 10 TIMES.
      lv_ok = abap_false.
      CASE iv_action.
        WHEN 'SD.SO.SET_DELIVERY_BLOCK' OR 'SD.SO.REMOVE_DELIVERY_BLOCK'.
          SELECT SINGLE lifsk FROM vbak INTO lv_lifsk WHERE vbeln = iv_vbeln.
          IF lv_lifsk = is_pl-reason.
            lv_ok = abap_true.
          ENDIF.
        WHEN 'SD.SO.SET_BILLING_BLOCK' OR 'SD.SO.REMOVE_BILLING_BLOCK'.
          SELECT SINGLE faksk FROM vbak INTO lv_faksk WHERE vbeln = iv_vbeln.
          IF lv_faksk = is_pl-reason.
            lv_ok = abap_true.
          ENDIF.
        WHEN 'SD.SO.REJECT_ITEM' OR 'SD.SO.UNREJECT_ITEM'.
          SELECT SINGLE abgru FROM vbap INTO lv_abgru WHERE vbeln = iv_vbeln AND posnr = is_pl-posnr.
          IF lv_abgru = is_pl-reason.
            lv_ok = abap_true.
          ENDIF.
        WHEN 'SD.SO.CHANGE_QTY_DATE'.
          SELECT SINGLE wmeng edatu FROM vbep INTO (lv_wmeng, lv_edatu)
            WHERE vbeln = iv_vbeln AND posnr = is_pl-posnr AND etenr = is_pl-etenr.
          IF lv_wmeng = is_pl-qty AND lv_edatu = is_pl-edatu.
            lv_ok = abap_true.
          ENDIF.
        WHEN 'SD.SO.CHANGE_PRICE'.
          SELECT SINGLE netpr netwr FROM vbap INTO (lv_netpr, lv_netwr)
            WHERE vbeln = iv_vbeln AND posnr = is_pl-posnr.
          IF lv_netpr <> is_pl-netpr OR lv_netwr <> is_pl-netwr.
            lv_ok = abap_true.
          ENDIF.
      ENDCASE.
      IF lv_ok = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.

    IF iv_action = 'SD.SO.CHANGE_PRICE'.
      IF lv_ok = abap_true.
        SELECT SINGLE waerk FROM vbak INTO lv_waerk WHERE vbeln = iv_vbeln.
        lv_oldx = ext_amount( iv_amount = is_pl-netwr iv_waers = lv_waerk ).
        lv_newx = ext_amount( iv_amount = lv_netwr iv_waers = lv_waerk ).
        lv_text = |Item { is_pl-posnr } net value { lv_oldx } -> { lv_newx } { lv_waerk }|.
        CONDENSE lv_text.
        add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = cs_result ).
      ELSE.
        add_msg( EXPORTING iv_type = 'W'
                           iv_text = 'The item price did not change: check that the condition exists in the item and can be changed'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
    ELSEIF lv_ok = abap_false.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = 'The change is not visible in the order yet: the update may still be running'
               CHANGING  cs_result = cs_result ).
    ENDIF.
    load_order( EXPORTING iv_vbeln = iv_vbeln IMPORTING es_ord = ls_ord ev_found = lv_found ).
    IF lv_found = abap_true.
      cs_result-sd_status_new = so_status_text( ls_ord ).
      cs_result-sd_header = so_doc_row( ls_ord ).
    ENDIF.
  ENDMETHOD.


  METHOD parse_new_items.
    DATA: lv_spec  TYPE string,
          lv_m     TYPE string,
          lv_q     TYPE string,
          lv_w     TYPE string,
          ls_new   TYPE ty_newit,
          lv_ok    TYPE abap_bool,
          lv_text  TYPE string,
          lv_chk   TYPE marc-werks,
          lt_specs TYPE string_table.

    CLEAR et_new.
    lt_specs = is_params-items.
    IF lt_specs IS INITIAL AND is_params-matnr IS NOT INITIAL.
      lv_spec = |{ is_params-matnr }:{ is_params-quantity }:{ is_params-werks }|.
      APPEND lv_spec TO lt_specs.
    ENDIF.
    IF lt_specs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Give the items: items ("MATNR:QTY[:WERKS]") or matnr + quantity'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lines( lt_specs ) > 50.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'At most 50 items per order' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    LOOP AT lt_specs INTO lv_spec.
      CLEAR: lv_m, lv_q, lv_w, ls_new.
      SPLIT lv_spec AT ':' INTO lv_m lv_q lv_w.
      CONDENSE: lv_m, lv_q, lv_w.
      IF lv_m IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'An item has no material' CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_new-matnr = to_matnr( lv_m ).
      to_qty( EXPORTING iv_value = lv_q IMPORTING ev_qty = ls_new-qty ev_ok = lv_ok ).
      IF lv_ok = abap_false OR ls_new-qty <= 0.
        lv_text = |Quantity of material { lv_m } must be a positive number|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      SELECT SINGLE meins FROM mara INTO ls_new-meins WHERE matnr = ls_new-matnr.
      IF sy-subrc <> 0.
        lv_text = |Material { lv_m } not found|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_w IS NOT INITIAL.
        ls_new-werks = to_upper( lv_w ).
        SELECT SINGLE werks FROM marc INTO lv_chk WHERE matnr = ls_new-matnr AND werks = ls_new-werks.
        IF sy-subrc <> 0.
          lv_text = |Material { lv_m } is not maintained in plant { ls_new-werks }|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
      ENDIF.
      APPEND ls_new TO et_new.
    ENDLOOP.
  ENDMETHOD.


  METHOD so_prepare_create.
    DATA: lv_auart  TYPE vbak-auart,
          lv_vbtyp  TYPE tvak-vbtyp,
          lv_vkorg  TYPE vbak-vkorg,
          lv_vtweg  TYPE vbak-vtweg,
          lv_spart  TYPE vbak-spart,
          lv_chk    TYPE tvta-vkorg,
          lv_kunnr  TYPE kunnr,
          lv_date   TYPE sy-datum,
          lt_new    TYPE ty_newits,
          ls_new    TYPE ty_newit,
          ls_it     TYPE bapisditm,
          ls_sc     TYPE bapischdl,
          ls_pa     TYPE bapiparnr,
          lv_posnr  TYPE vbap-posnr,
          lv_num    TYPE i,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string.

    CLEAR: es_head, et_items, et_sched, et_partn.
    IF is_params-auart IS INITIAL OR strlen( is_params-auart ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'auart is required (sales document type)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_auart = to_upper( is_params-auart ).
    SELECT SINGLE vbtyp FROM tvak INTO lv_vbtyp WHERE auart = lv_auart.
    IF sy-subrc <> 0.
      lv_text = |Sales document type { lv_auart } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lv_vbtyp NA 'ABCGHIKL'.
      lv_text = |Sales document type { lv_auart } is not an order type|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-vkorg IS INITIAL OR is_params-vtweg IS INITIAL OR is_params-spart IS INITIAL
       OR strlen( is_params-vkorg ) > 4 OR strlen( is_params-vtweg ) > 2 OR strlen( is_params-spart ) > 2.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vkorg, vtweg and spart are required (sales area)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_vkorg = to_upper( is_params-vkorg ).
    lv_vtweg = to_upper( is_params-vtweg ).
    lv_spart = to_upper( is_params-spart ).
    SELECT SINGLE vkorg FROM tvta INTO lv_chk
      WHERE vkorg = lv_vkorg AND vtweg = lv_vtweg AND spart = lv_spart.
    IF sy-subrc <> 0.
      lv_text = |Sales area { lv_vkorg }/{ lv_vtweg }/{ lv_spart } is not defined|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_so( iv_vkorg = lv_vkorg iv_vtweg = lv_vtweg iv_spart = lv_spart
                iv_auart = lv_auart iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization to create { lv_auart } in sales area { lv_vkorg }/{ lv_vtweg }/{ lv_spart }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_kunnr = to_kunnr( is_params-sold_to ).
    IF lv_kunnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'sold_to is required (customer number)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-req_date IS NOT INITIAL.
      lv_date = to_date( is_params-req_date ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'req_date must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF lv_date < sy-datum.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'req_date is in the past' CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    parse_new_items( EXPORTING is_params = is_params
                     IMPORTING et_new = lt_new
                     CHANGING  cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.

    es_head-doc_type   = lv_auart.
    es_head-sales_org  = lv_vkorg.
    es_head-distr_chan = lv_vtweg.
    es_head-division   = lv_spart.
    es_head-purch_no_c = is_params-cust_po.
    es_head-req_date_h = lv_date.

    LOOP AT lt_new INTO ls_new.
      lv_num   = lv_num + 10.
      lv_posnr = lv_num.
      CLEAR: ls_it, ls_sc.
      ls_it-itm_number = lv_posnr.
      ls_it-material   = ls_new-matnr.
      ls_it-plant      = ls_new-werks.
      ls_it-target_qty = ls_new-qty.
      IF is_params-unit IS NOT INITIAL.
        ls_it-target_qu = to_upper( is_params-unit ).
      ELSE.
        ls_it-target_qu = ls_new-meins.
      ENDIF.
      APPEND ls_it TO et_items.
      ls_sc-itm_number = lv_posnr.
      ls_sc-req_qty    = ls_new-qty.
      ls_sc-req_date   = lv_date.
      APPEND ls_sc TO et_sched.
      ls_chg-field     = |ITEM { lv_posnr } NEW|.
      lv_text          = |material { ls_new-matnr } quantity { fmt_qty( ls_new-qty ) } plant { ls_new-werks }|.
      ls_chg-new_value = lv_text.
      APPEND ls_chg TO cs_result-changes.
    ENDLOOP.
    ls_pa-partn_role = 'AG'.
    ls_pa-partn_numb = lv_kunnr.
    APPEND ls_pa TO et_partn.
    IF is_params-ship_to IS NOT INITIAL.
      ls_pa-partn_role = 'WE'.
      ls_pa-partn_numb = to_kunnr( is_params-ship_to ).
      APPEND ls_pa TO et_partn.
    ENDIF.
  ENDMETHOD.


  METHOD so_call_create.
    DATA: lt_ret   TYPE ty_so_ret2,
          lt_items TYPE ty_b_items,
          lt_sched TYPE ty_b_sched,
          lt_partn TYPE ty_b_partn,
          ls_head  TYPE bapisdhd1,
          lv_test  TYPE bapiflag-bapiflag,
          lv_doc   TYPE bapivbeln-vbeln,
          lv_vbeln TYPE vbak-vbeln,
          lv_found TYPE abap_bool,
          ls_ord   TYPE ty_ord,
          lv_text  TYPE string.

    ls_head  = is_head.
    lt_items = it_items.
    lt_sched = it_sched.
    lt_partn = it_partn.
    IF iv_testrun = abap_true.
      lv_test = 'X'.
    ENDIF.

    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in    = ls_head
        testrun            = lv_test
      IMPORTING
        salesdocument      = lv_doc
      TABLES
        return             = lt_ret
        order_items_in     = lt_items
        order_partners     = lt_partn
        order_schedules_in = lt_sched
      EXCEPTIONS
        error_message      = 1
        OTHERS             = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_true OR cs_result-failed = abap_true.
      do_rollback( ).
      IF iv_testrun = abap_true AND cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'I' iv_text = 'Preview = BAPI test run: no order is saved'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
      RETURN.
    ENDIF.

    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    lv_vbeln = lv_doc.
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The BAPI returned no document number' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    " The order is saved in the update task: wait for it.
    DO 10 TIMES.
      load_order( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_ord = ls_ord ev_found = lv_found ).
      IF lv_found = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    lv_text = fmt_doc( lv_vbeln ).
    APPEND lv_text TO cs_result-sd_new_docs.
    IF lv_found = abap_true.
      cs_result-sd_header     = so_doc_row( ls_ord ).
      cs_result-sd_status_new = so_status_text( ls_ord ).
      lv_text = |Order { fmt_doc( lv_vbeln ) } created|.
    ELSE.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = 'The order is not visible yet: the update may still be running'
               CHANGING  cs_result = cs_result ).
      lv_text = |Order { fmt_doc( lv_vbeln ) } created (not visible yet)|.
    ENDIF.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD dlv_get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/SD/actions.json.
    ls_def-id = 'SD.DLV.LIST_OPEN'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.DLV.CREATE'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.DLV.POST_GI'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.DLV.REVERSE_GI'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD dlv_query.
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'SD.DLV.LIST_OPEN'.
        rs_result = dlv_list_open( is_params ).
      WHEN OTHERS.
        lv_text = |{ iv_action } is not a query action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD dlv_preview.
    rs_result = dlv_run( iv_action = iv_action is_params = is_params iv_execute = abap_false ).
  ENDMETHOD.


  METHOD dlv_execute.
    rs_result = dlv_run( iv_action = iv_action is_params = is_params iv_execute = abap_true ).
  ENDMETHOD.


  METHOD dlv_run.
    DATA: lv_vbeln TYPE vbak-vbeln,
          lt_sel   TYPE ty_sels,
          lv_vstel TYPE likp-vstel,
          lv_due   TYPE sy-datum,
          ls_dlv   TYPE ty_dlv,
          lt_items TYPE ty_lis,
          lv_date  TYPE sy-datum,
          lv_pick  TYPE abap_bool,
          lv_test  TYPE abap_bool,
          lv_text  TYPE string.

    IF iv_execute = abap_false.
      lv_test = abap_true.
    ENDIF.

    " Every check of the preview runs again on the current data at EXECUTE.
    CASE iv_action.
      WHEN 'SD.DLV.CREATE'.
        dlv_prepare_create( EXPORTING is_params = is_params
                        IMPORTING ev_vbeln = lv_vbeln et_sel = lt_sel ev_vstel = lv_vstel ev_due = lv_due
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          IF iv_execute = abap_true.
            dlv_call_create( EXPORTING iv_vbeln = lv_vbeln it_sel = lt_sel iv_vstel = lv_vstel iv_due = lv_due
                         CHANGING  cs_result = rs_result ).
          ELSE.
            add_msg( EXPORTING iv_type = 'I'
                               iv_text = 'The BAPI has no test mode: this preview is the status and configuration check only'
                     CHANGING  cs_result = rs_result ).
          ENDIF.
        ENDIF.

      WHEN 'SD.DLV.POST_GI' OR 'SD.DLV.REVERSE_GI'.
        prepare_gi( EXPORTING iv_action = iv_action is_params = is_params
                    IMPORTING es_dlv = ls_dlv et_items = lt_items ev_date = lv_date ev_pick = lv_pick
                    CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          IF iv_action = 'SD.DLV.POST_GI'.
            call_gi( EXPORTING is_dlv = ls_dlv it_items = lt_items iv_date = lv_date
                               iv_pick = lv_pick iv_testrun = lv_test
                     CHANGING  cs_result = rs_result ).
          ELSEIF iv_execute = abap_true.
            call_reverse( EXPORTING is_dlv = ls_dlv iv_date = lv_date
                          CHANGING  cs_result = rs_result ).
          ELSE.
            add_msg( EXPORTING iv_type = 'I'
                               iv_text = 'The reversal has no usable test mode: this preview is the status and posting period check only'
                     CHANGING  cs_result = rs_result ).
          ENDIF.
        ENDIF.

      WHEN OTHERS.
        lv_text = |{ iv_action } is not a write action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING  cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD dlv_list_open.
    DATA: lv_vstel  TYPE likp-vstel,
          lv_status TYPE string,
          lv_basis  TYPE string,
          lv_max    TYPE i,
          lv_fetch  TYPE i,
          lv_from   TYPE i,
          lv_lines  TYPE i,
          lv_chk    TYPE tvst-vstel,
          lv_text   TYPE string,
          lt_where  TYPE string_table,
          lv_sql_cols TYPE string,
          lv_sql_from TYPE string,
          lr_wadat  TYPE RANGE OF likp-wadat,
          ls_wadat  LIKE LINE OF lr_wadat,
          lt_rows   TYPE ty_dlvs,
          ls_row    TYPE ty_dlv,
          ls_doc    TYPE zif_mcp_biz_action=>ty_sd_doc.

    " Business-meaning parameters have no defaults: the skill asks them.
    lv_vstel  = to_upper( is_params-vstel ).
    lv_status = is_params-status.
    lv_basis  = is_params-date_basis.
    IF lv_vstel IS INITIAL OR strlen( is_params-vstel ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vstel is required (shipping point)'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    IF lv_status <> 'to_issue' AND lv_status <> 'issued_unbilled' AND lv_status <> 'all_open'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'status is required: to_issue, issued_unbilled or all_open'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    IF lv_basis <> 'planned_today' AND lv_basis <> 'planned_overdue_until_today' AND lv_basis <> 'all'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'date_basis is required: planned_today, planned_overdue_until_today or all'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    SELECT SINGLE vstel FROM tvst INTO lv_chk WHERE vstel = lv_vstel.
    IF sy-subrc <> 0.
      lv_text = |Shipping point { lv_vstel } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_dlv( iv_vstel = lv_vstel iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display deliveries of shipping point { lv_vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    lv_max   = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.

    CASE lv_basis.
      WHEN 'planned_today'.
        ls_wadat-sign = 'I'. ls_wadat-option = 'EQ'. ls_wadat-low = sy-datum.
        APPEND ls_wadat TO lr_wadat.
      WHEN 'planned_overdue_until_today'.
        ls_wadat-sign = 'I'. ls_wadat-option = 'LE'. ls_wadat-low = sy-datum.
        APPEND ls_wadat TO lr_wadat.
    ENDCASE.

    " Status conditions: fixed fragments only, no user input inside.
    CASE lv_status.
      WHEN 'to_issue'.
        APPEND `( u~wbstk = 'A' OR u~wbstk = 'B' )` TO lt_where.
      WHEN 'issued_unbilled'.
        APPEND `u~wbstk = 'C' AND ( u~fkstk = 'A' OR u~fkstk = 'B' )` TO lt_where.
      WHEN OTHERS.
        APPEND `( u~wbstk = 'A' OR u~wbstk = 'B' OR ( u~wbstk = 'C' AND ( u~fkstk = 'A' OR u~fkstk = 'B' ) ) )` TO lt_where.
    ENDCASE.

    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `LIKP`
                           iv_cols = `k~vbeln k~lfart k~vbtyp k~vstel k~vkorg k~wadat k~wadat_ist k~lifsk k~faksk k~erdat ` &&
                                     `u~wbstk u~fkstk u~kostk u~lvstk u~gbstk` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `LIKP` iv_alias = `k` ).
    SELECT (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF TABLE lt_rows
      UP TO lv_fetch ROWS
      WHERE k~vstel = lv_vstel
        AND k~wadat IN lr_wadat
        AND (lt_where)
      ORDER BY k~wadat k~vbeln.

    IF lines( lt_rows ) > lv_max.
      rs_result-truncated = abap_true.
      lv_from = lv_max + 1.
      DELETE lt_rows FROM lv_from.
    ENDIF.
    LOOP AT lt_rows INTO ls_row.
      ls_doc = dlv_doc_row( ls_row ).
      APPEND ls_doc TO rs_result-sd_docs.
    ENDLOOP.

    lv_lines = lines( rs_result-sd_docs ).
    lv_text = |{ lv_lines } open deliveries|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD load_dlv.
    DATA: lv_sql_cols TYPE string,
          lv_sql_from TYPE string.

    CLEAR: es_dlv, ev_found.
    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `LIKP`
                           iv_cols = `k~vbeln k~lfart k~vbtyp k~vstel k~vkorg k~wadat k~wadat_ist k~lifsk k~faksk k~erdat ` &&
                                     `u~wbstk u~fkstk u~kostk u~lvstk u~gbstk` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `LIKP` iv_alias = `k` ).
    SELECT SINGLE (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF es_dlv
      WHERE k~vbeln = iv_vbeln.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD load_dlv_items.
    DATA: lv_sql_cols TYPE string,
          lv_sql_from TYPE string.

    CLEAR et_items.
    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `LIPS`
                           iv_cols = `p~posnr p~matnr p~arktx p~werks p~lgort p~lfimg p~vrkme p~meins p~lgmng ` &&
                                     `p~pstyv p~bwart p~vgbel p~vgpos p~lgnum ` &&
                                     `u~wbsta u~kosta u~lvsta u~fksta` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `LIPS` iv_alias = `p` ).
    SELECT (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF TABLE et_items
      WHERE p~vbeln = iv_vbeln.
    SORT et_items BY posnr.
  ENDMETHOD.


  METHOD dlv_doc_row.
    MOVE-CORRESPONDING is_dlv TO rs_doc.
    rs_doc-doc_type = is_dlv-lfart.
    rs_doc-date1    = is_dlv-wadat.
    rs_doc-date2    = is_dlv-wadat_ist.
    rs_doc-status   = dlv_status_text( is_dlv ).
  ENDMETHOD.


  METHOD dlv_status_text.
    DATA lv_text TYPE string.

    lv_text = |goods issue { word( is_dlv-wbstk ) }, picking { word( is_dlv-kostk ) }, billing { word( is_dlv-fkstk ) }|.
    IF is_dlv-lifsk IS NOT INITIAL.
      lv_text = lv_text && ', delivery block ' && is_dlv-lifsk.
    ENDIF.
    IF is_dlv-faksk IS NOT INITIAL.
      lv_text = lv_text && ', billing block ' && is_dlv-faksk.
    ENDIF.
    rv_text = lv_text.
  ENDMETHOD.


  METHOD dlv_delivered_su.
    DATA: lv_base TYPE vbfa-rfmng,
          lv_sum  TYPE p LENGTH 15 DECIMALS 3.

    SELECT SUM( rfmng ) FROM vbfa INTO lv_base
      WHERE vbelv = iv_vbeln AND posnv = is_si-posnr
        AND ( vbtyp_n = 'J' OR vbtyp_n = 'T' ).
    lv_sum = lv_base.
    IF is_si-umvkz > 0 AND is_si-umvkn > 0 AND is_si-vrkme <> is_si-meins.
      lv_sum = lv_sum * is_si-umvkn / is_si-umvkz.
    ENDIF.
    rv_qty = lv_sum.
  ENDMETHOD.


  METHOD dlv_prepare_create.
    DATA: lv_vbeln  TYPE vbak-vbeln,
          ls_so     TYPE ty_so,
          lt_si     TYPE ty_sis,
          ls_si     TYPE ty_si,
          lv_sql_cols TYPE string,
          lv_sql_from TYPE string,
          lv_lfarv  TYPE tvak-lfarv,
          lv_spelf  TYPE tvls-spelf,
          lt_spec   TYPE string_table,
          lv_spec   TYPE string,
          lv_p      TYPE string,
          lv_q      TYPE string,
          lv_posnr  TYPE vbap-posnr,
          lv_qty    TYPE vbap-kwmeng,
          lv_qok    TYPE abap_bool,
          lv_dl     TYPE vbap-kwmeng,
          lv_open   TYPE vbap-kwmeng,
          lv_conf   TYPE vbap-kwmeng,
          lv_sum    TYPE vbep-bmeng,
          lv_last   TYPE vbep-edatu,
          lv_edatu  TYPE vbep-edatu,
          lv_asked  TYPE abap_bool,
          lv_n      TYPE i,
          ls_sel    TYPE ty_sel,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string.

    CLEAR: ev_vbeln, et_sel, ev_vstel, ev_due.
    lv_vbeln = to_vbeln( is_params-vbeln ).
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (sales order, digits up to 10)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `VBAK`
                           iv_cols = `k~vbeln k~auart k~vbtyp k~vkorg k~vtweg k~spart k~lifsk ` &&
                                     `u~lfstk u~abstk u~cmgst u~uvvls` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `VBAK` iv_alias = `k` ).
    SELECT SINGLE (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF ls_so
      WHERE k~vbeln = lv_vbeln.
    IF sy-subrc <> 0.
      lv_text = |Sales order { fmt_doc( lv_vbeln ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_so( iv_vkorg = ls_so-vkorg iv_vtweg = ls_so-vtweg iv_spart = ls_so-spart
                iv_auart = ls_so-auart iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization for order { fmt_doc( lv_vbeln ) } (sales area { ls_so-vkorg }/{ ls_so-vtweg }/{ ls_so-spart }, order type { ls_so-auart })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Order level: status, blocks, configuration.
    SELECT SINGLE lfarv FROM tvak INTO lv_lfarv WHERE auart = ls_so-auart.
    IF lv_lfarv IS INITIAL.
      lv_text = |Order type { ls_so-auart } has no delivery type: it cannot be delivered|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_so-abstk = 'C'.
      lv_text = |Order { fmt_doc( lv_vbeln ) } is rejected completely|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_so-lfstk = 'C'.
      lv_text = |Order { fmt_doc( lv_vbeln ) } is delivered completely|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_so-lfstk IS INITIAL.
      lv_text = |Order { fmt_doc( lv_vbeln ) } is not relevant for delivery|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_so-cmgst = 'B'.
      lv_text = |Order { fmt_doc( lv_vbeln ) } is blocked by the credit check|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_so-uvvls = 'A' OR ls_so-uvvls = 'B'.
      lv_text = |Order { fmt_doc( lv_vbeln ) } is incomplete for delivery|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_so-lifsk IS NOT INITIAL.
      SELECT SINGLE spelf FROM tvls INTO lv_spelf WHERE lifsp = ls_so-lifsk.
      IF lv_spelf = 'X'.
        lv_text = |Order { fmt_doc( lv_vbeln ) } has delivery block { ls_so-lifsk }: no delivery can be created|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_text = |Order has delivery block { ls_so-lifsk } (not blocking delivery creation)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.

    IF is_params-due_date IS NOT INITIAL.
      ev_due = to_date( is_params-due_date ).
      IF ev_due IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'due_date must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_asked = abap_true.
    ENDIF.

    " Items asked for: items "POSNR:QTY", or posnr + quantity, or all open items.
    lt_spec = is_params-items.
    IF lt_spec IS INITIAL AND is_params-posnr IS NOT INITIAL.
      lv_spec = |{ is_params-posnr }:{ is_params-quantity }|.
      APPEND lv_spec TO lt_spec.
    ENDIF.

    lv_sql_cols = zcl_mcp_biz_sys=>get( )->sd_status_cols( iv_base = `VBAP`
                           iv_cols = `p~posnr p~kwmeng p~vrkme p~meins p~umvkz p~umvkn p~pstyv p~abgru p~vstel u~lfsta` ).
    lv_sql_from = zcl_mcp_biz_sys=>get( )->sd_status_from( iv_base = `VBAP` iv_alias = `p` ).
    SELECT (lv_sql_cols)
      FROM (lv_sql_from)
      INTO CORRESPONDING FIELDS OF TABLE lt_si
      WHERE p~vbeln = lv_vbeln.
    SORT lt_si BY posnr.

    IF lt_spec IS NOT INITIAL.
      LOOP AT lt_spec INTO lv_spec.
        CLEAR: lv_p, lv_q.
        SPLIT lv_spec AT ':' INTO lv_p lv_q.
        CONDENSE: lv_p, lv_q.
        lv_posnr = to_posnr( lv_p ).
        READ TABLE lt_si INTO ls_si WITH KEY posnr = lv_posnr.
        IF lv_posnr IS INITIAL OR sy-subrc <> 0.
          lv_text = |Item { lv_p } not found in order { fmt_doc( lv_vbeln ) }|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        CLEAR lv_qty.
        IF lv_q IS NOT INITIAL.
          to_qty( EXPORTING iv_value = lv_q IMPORTING ev_qty = lv_qty ev_ok = lv_qok ).
          IF lv_qok = abap_false OR lv_qty <= 0.
            lv_text = |Quantity of item { lv_posnr } must be a positive number|.
            add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
            RETURN.
          ENDIF.
        ENDIF.
        CLEAR ls_sel.
        ls_sel-posnr = lv_posnr.
        ls_sel-qty   = lv_qty.
        APPEND ls_sel TO et_sel.
      ENDLOOP.
    ELSE.
      LOOP AT lt_si INTO ls_si.
        CLEAR ls_sel.
        ls_sel-posnr = ls_si-posnr.
        APPEND ls_sel TO et_sel.
      ENDLOOP.
    ENDIF.

    " Per item: rejected / delivered / not delivery relevant items are skipped (all items) or
    " refused (asked for); quantity must not exceed the open quantity. Delivery relevance =
    " item status LFSTA (it follows the item category and the schedule line category).
    lv_n = lines( et_sel ).
    DO lv_n TIMES.
      READ TABLE et_sel INTO ls_sel INDEX sy-index.
      IF sy-subrc <> 0.
        EXIT.
      ENDIF.
      READ TABLE lt_si INTO ls_si WITH KEY posnr = ls_sel-posnr.
      lv_dl   = dlv_delivered_su( is_si = ls_si iv_vbeln = lv_vbeln ).
      lv_open = ls_si-kwmeng - lv_dl.
      CLEAR lv_text.
      IF ls_si-abgru IS NOT INITIAL.
        lv_text = |Item { ls_si-posnr } is rejected|.
      ELSEIF ls_si-lfsta IS INITIAL.
        lv_text = |Item { ls_si-posnr } (item category { ls_si-pstyv }) is not relevant for delivery|.
      ELSEIF ls_si-lfsta = 'C' OR lv_open <= 0.
        lv_text = |Item { ls_si-posnr } is delivered completely|.
      ELSEIF ls_si-vstel IS INITIAL.
        lv_text = |Item { ls_si-posnr } has no shipping point|.
      ENDIF.
      IF lv_text IS NOT INITIAL.
        IF lt_spec IS NOT INITIAL.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        CLEAR ls_sel-qty.
        ls_sel-vstel = '#SK'.
        MODIFY et_sel FROM ls_sel INDEX sy-index.
        add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      IF ls_sel-qty > lv_open.
        lv_text = |Quantity of item { ls_si-posnr } exceeds the open quantity ({ fmt_qty( lv_open ) })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ls_sel-qty IS INITIAL.
        ls_sel-qty = lv_open.
      ENDIF.
      ls_sel-vrkme = ls_si-vrkme.
      ls_sel-vstel = ls_si-vstel.
      MODIFY et_sel FROM ls_sel INDEX sy-index.
    ENDDO.
    DELETE et_sel WHERE vstel = '#SK'.
    IF et_sel IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Nothing to deliver: no open delivery-relevant item'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Selection date: the last schedule line date of the selected items, when none is given.
    LOOP AT et_sel INTO ls_sel.
      SELECT SUM( bmeng ) FROM vbep INTO lv_sum
        WHERE vbeln = lv_vbeln AND posnr = ls_sel-posnr AND bmeng > 0.
      SELECT MAX( edatu ) FROM vbep INTO lv_edatu
        WHERE vbeln = lv_vbeln AND posnr = ls_sel-posnr AND bmeng > 0.
      IF lv_edatu > lv_last.
        lv_last = lv_edatu.
      ENDIF.
      IF lv_sum < ls_sel-qty.
        lv_conf = lv_sum.
        lv_text = |Item { ls_sel-posnr }: confirmed quantity { fmt_qty( lv_conf ) } is below the quantity to deliver|.
        add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
      ENDIF.
    ENDLOOP.
    IF lv_asked = abap_false.
      ev_due = lv_last.
      IF ev_due < sy-datum.
        ev_due = sy-datum.
      ENDIF.
      lv_text = |due_date not given: all open schedule lines up to { fmt_date( ev_due ) } are delivered|.
      add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.

    " Shipping point and authorization (the BAPI checks none).
    IF is_params-ship_point IS NOT INITIAL.
      ev_vstel = to_upper( is_params-ship_point ).
    ENDIF.
    LOOP AT et_sel INTO ls_sel.
      IF ev_vstel IS NOT INITIAL AND ev_vstel <> ls_sel-vstel.
        CONTINUE.
      ENDIF.
      IF auth_dlv( iv_vstel = ls_sel-vstel iv_actvt = '01' ) = abap_false.
        lv_text = |No authorization to create deliveries for shipping point { ls_sel-vstel }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_chg-field     = |ITEM { ls_sel-posnr } DELIVERY_QUANTITY|.
      ls_chg-old_value = '0'.
      ls_chg-new_value = fmt_qty( ls_sel-qty ).
      APPEND ls_chg TO cs_result-changes.
    ENDLOOP.
    IF ev_vstel IS NOT INITIAL.
      READ TABLE et_sel TRANSPORTING NO FIELDS WITH KEY vstel = ev_vstel.
      IF sy-subrc <> 0.
        lv_text = |No selected item belongs to shipping point { ev_vstel }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    ev_vbeln = lv_vbeln.
  ENDMETHOD.


  METHOD dlv_call_create.
    DATA: lt_items TYPE STANDARD TABLE OF bapidlvreftosalesorder WITH DEFAULT KEY,
          ls_item  TYPE bapidlvreftosalesorder,
          lt_dlv   TYPE STANDARD TABLE OF bapishpdelivnumb WITH DEFAULT KEY,
          ls_dlv   TYPE bapishpdelivnumb,
          lt_cr    TYPE STANDARD TABLE OF bapidlvitemcreated WITH DEFAULT KEY,
          lt_ret   TYPE ty_dlv_ret2,
          lv_ship  TYPE bapidlvcreateheader-ship_point,
          lv_due   TYPE bapidlvcreateheader-due_date,
          lv_first TYPE bapishpdelivnumb-deliv_numb,
          lv_num   TYPE bapidlvcreateheader-num_deliveries,
          lv_vbeln TYPE likp-vbeln,
          ls_head  TYPE ty_dlv,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.
    FIELD-SYMBOLS <ls_sel> TYPE ty_sel.

    LOOP AT it_sel ASSIGNING <ls_sel>.
      IF iv_vstel IS NOT INITIAL AND iv_vstel <> <ls_sel>-vstel.
        CONTINUE.
      ENDIF.
      CLEAR ls_item.
      ls_item-ref_doc    = iv_vbeln.
      ls_item-ref_item   = <ls_sel>-posnr.
      ls_item-dlv_qty    = <ls_sel>-qty.
      ls_item-sales_unit = <ls_sel>-vrkme.
      APPEND ls_item TO lt_items.
    ENDLOOP.
    lv_ship = iv_vstel.
    lv_due  = iv_due.

    CALL FUNCTION 'BAPI_OUTB_DELIVERY_CREATE_SLS'
      EXPORTING
        ship_point        = lv_ship
        due_date          = lv_due
      IMPORTING
        delivery          = lv_first
        num_deliveries    = lv_num
      TABLES
        sales_order_items = lt_items
        deliveries        = lt_dlv
        created_items     = lt_cr
        return            = lt_ret
      EXCEPTIONS
        error_message     = 1
        OTHERS            = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    IF lt_dlv IS INITIAL AND lv_first IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No delivery was created' CHANGING cs_result = cs_result ).
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      do_rollback( ).
      RETURN.
    ENDIF.

    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF lt_dlv IS INITIAL.
      ls_dlv-deliv_numb = lv_first.
      APPEND ls_dlv TO lt_dlv.
    ENDIF.
    LOOP AT lt_dlv INTO ls_dlv.
      lv_vbeln = ls_dlv-deliv_numb.
      " The delivery is saved in the update task: wait for it.
      DO 10 TIMES.
        load_dlv( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_dlv = ls_head ev_found = lv_found ).
        IF lv_found = abap_true.
          EXIT.
        ENDIF.
        WAIT UP TO 1 SECONDS.
      ENDDO.
      lv_text = fmt_doc( lv_vbeln ).
      APPEND lv_text TO cs_result-sd_new_docs.
      IF lv_found = abap_true AND cs_result-sd_header IS INITIAL.
        cs_result-sd_header     = dlv_doc_row( ls_head ).
        cs_result-sd_status_new = dlv_status_text( ls_head ).
      ELSEIF lv_found = abap_false.
        add_msg( EXPORTING iv_type = 'W'
                           iv_text = 'A delivery is not visible yet: the update may still be running'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
    ENDLOOP.
    lv_num = lines( lt_dlv ).
    lv_text = |{ lv_num } delivery(ies) created|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD check_period.
    DATA: lv_bukrs TYPE t001k-bukrs,
          lv_periv TYPE t001-periv,
          ls_marv  TYPE marv,
          lv_buper TYPE t009b-poper,
          lv_gjahr TYPE t009b-bdatj,
          lv_cur   TYPE string,
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
    IF lv_gjahr = ls_marv-lfgja AND lv_buper = ls_marv-lfmon.
      RETURN.
    ENDIF.
    IF lv_gjahr = ls_marv-vmgja AND lv_buper = ls_marv-vmmon.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = 'The posting date is in the previous MM period (allowed while it is open)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_cur  = |{ ls_marv-lfmon }/{ ls_marv-lfgja }|.
    lv_text = |Posting date { fmt_date( iv_date ) } is outside the open MM periods (current { lv_cur }) of company code { lv_bukrs }|.
    add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD prepare_gi.
    DATA: lv_vbeln  TYPE likp-vbeln,
          lv_found  TYPE abap_bool,
          lv_pick   TYPE string,
          lv_spewa  TYPE tvls-spewa,
          ls_it     TYPE ty_li,
          lv_bwart  TYPE bwart,
          lt_done   TYPE STANDARD TABLE OF string WITH DEFAULT KEY,
          lv_key    TYPE string,
          lv_rev    TYPE abap_bool,
          lv_text   TYPE string.

    CLEAR: es_dlv, et_items, ev_date, ev_pick.
    IF iv_action = 'SD.DLV.REVERSE_GI'.
      lv_rev = abap_true.
    ENDIF.
    lv_vbeln = to_vbeln( is_params-vbeln ).
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (delivery, digits up to 10)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_dlv( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_dlv = es_dlv ev_found = lv_found ).
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
    IF auth_dlv( iv_vstel = es_dlv-vstel iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to change deliveries of shipping point { es_dlv-vstel }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_dlv_items( EXPORTING iv_vbeln = lv_vbeln IMPORTING et_items = et_items ).
    IF et_items IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The delivery has no items' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    cs_result-sd_status_new = dlv_status_text( es_dlv ).

    " Goods movement authorization per movement type and plant: the FM checks neither.
    LOOP AT et_items INTO ls_it.
      lv_bwart = ls_it-bwart.
      IF lv_bwart IS INITIAL.
        IF lv_rev = abap_true.
          lv_bwart = '602'.
        ELSE.
          lv_bwart = '601'.
        ENDIF.
      ELSEIF lv_rev = abap_true.
        " The reversal posts the reversing movement type (601 -> 602).
        lv_bwart = lv_bwart+0(2).
        lv_bwart = lv_bwart && '2'.
      ENDIF.
      lv_key = |{ lv_bwart }{ ls_it-werks }|.
      READ TABLE lt_done TRANSPORTING NO FIELDS WITH KEY table_line = lv_key.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      APPEND lv_key TO lt_done.
      IF auth_gm( iv_bwart = lv_bwart iv_werks = ls_it-werks ) = abap_false.
        lv_text = |No authorization for goods movement { lv_bwart } in plant { ls_it-werks }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDLOOP.

    ev_date = to_date( is_params-posting_date ).
    IF ev_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date is required and must be a valid date (YYYY-MM-DD)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.

    IF lv_rev = abap_true.
      IF es_dlv-wbstk <> 'C'.
        lv_text = |Delivery { fmt_doc( lv_vbeln ) } has no posted goods issue to reverse|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF es_dlv-fkstk = 'B' OR es_dlv-fkstk = 'C'.
        lv_text = |Delivery { fmt_doc( lv_vbeln ) } is billed (partly): cancel the billing document first|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      READ TABLE et_items INTO ls_it INDEX 1.
      check_period( EXPORTING iv_werks = ls_it-werks iv_date = ev_date CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Goods issue.
    IF es_dlv-wbstk = 'C'.
      lv_text = |Goods issue of delivery { fmt_doc( lv_vbeln ) } is already posted|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_dlv-wbstk IS INITIAL.
      lv_text = |Delivery { fmt_doc( lv_vbeln ) } is not relevant for goods issue|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_dlv-lifsk IS NOT INITIAL.
      SELECT SINGLE spewa FROM tvls INTO lv_spewa WHERE lifsp = es_dlv-lifsk.
      IF lv_spewa = 'X'.
        lv_text = |Delivery { fmt_doc( lv_vbeln ) } has block { es_dlv-lifsk }: goods issue is blocked|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    lv_pick = to_upper( is_params-pick_all ).
    IF lv_pick = 'X' OR lv_pick = 'TRUE' OR lv_pick = 'YES'.
      ev_pick = abap_true.
    ENDIF.
    LOOP AT et_items INTO ls_it WHERE kosta = 'A' OR kosta = 'B'.
      IF ls_it-lgnum IS NOT INITIAL OR ls_it-lvsta = 'A' OR ls_it-lvsta = 'B'.
        lv_text = |Item { ls_it-posnr } is warehouse managed: confirm the transfer order before the goods issue|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ev_pick = abap_false.
        lv_text = |Item { ls_it-posnr } is not picked completely: set pick_all to pick the delivery quantity first|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDLOOP.
    READ TABLE et_items INTO ls_it INDEX 1.
    check_period( EXPORTING iv_werks = ls_it-werks iv_date = ev_date CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD add_prot.
    DATA: ls_msg  TYPE zif_mcp_biz_action=>ty_message,
          lv_ty   TYPE c LENGTH 1,
          lv_id   TYPE sy-msgid,
          lv_no   TYPE sy-msgno,
          lv_v1   TYPE sy-msgv1,
          lv_v2   TYPE sy-msgv2,
          lv_v3   TYPE sy-msgv3,
          lv_v4   TYPE sy-msgv4,
          lv_text TYPE string.
    FIELD-SYMBOLS: <ls_p> TYPE any,
                   <lv_f> TYPE any.

    LOOP AT it_prot ASSIGNING <ls_p>.
      CLEAR: lv_ty, lv_id, lv_no, lv_v1, lv_v2, lv_v3, lv_v4, lv_text.
      ASSIGN COMPONENT 'MSGTY' OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_ty = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT iv_idcomp OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_id = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT iv_nocomp OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_no = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'MSGV1' OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_v1 = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'MSGV2' OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_v2 = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'MSGV3' OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_v3 = <lv_f>.
      ENDIF.
      ASSIGN COMPONENT 'MSGV4' OF STRUCTURE <ls_p> TO <lv_f>.
      IF sy-subrc = 0.
        lv_v4 = <lv_f>.
      ENDIF.
      IF lv_id IS INITIAL.
        CONTINUE.
      ENDIF.
      MESSAGE ID lv_id TYPE 'S' NUMBER lv_no WITH lv_v1 lv_v2 lv_v3 lv_v4 INTO lv_text.
      IF lv_ty IS INITIAL.
        lv_ty = 'E'.
      ENDIF.
      CLEAR ls_msg.
      ls_msg-type    = lv_ty.
      ls_msg-id      = lv_id.
      ls_msg-number  = lv_no.
      ls_msg-message = lv_text.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD mat_doc_of.
    DATA: lv_doc TYPE vbfa-vbeln,
          lv_yr  TYPE vbfa-mjahr.

    SELECT vbeln mjahr FROM vbfa UP TO 1 ROWS INTO (lv_doc, lv_yr)
      WHERE vbelv = iv_vbeln AND vbtyp_n = iv_cat
      ORDER BY erdat DESCENDING erzet DESCENDING.
    ENDSELECT.
    IF sy-subrc = 0.
      cs_result-mat_doc      = lv_doc.
      cs_result-mat_doc_year = lv_yr.
    ENDIF.
  ENDMETHOD.


  METHOD call_gi.
    DATA: ls_ok    TYPE vbkok,
          lt_pick  TYPE STANDARD TABLE OF vbpok WITH DEFAULT KEY,
          ls_pick  TYPE vbpok,
          lt_prot  TYPE STANDARD TABLE OF prott WITH DEFAULT KEY,
          ls_it    TYPE ty_li,
          lv_any   TYPE xfeld,
          lv_upd   TYPE rvsel-xfeld,
          lv_dbu   TYPE leshp_database_update,
          lv_state TYPE vbuk-wbstk,
          ls_state TYPE vbuk,
          ls_head  TYPE ty_dlv,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_text  TYPE string.

    ls_ok-vbeln_vl  = is_dlv-vbeln.
    ls_ok-vbtyp_vl  = 'J'.
    ls_ok-wabuc     = 'X'.
    ls_ok-wadat_ist = iv_date.
    IF iv_pick = abap_true.
      lv_upd = 'X'.
      LOOP AT it_items INTO ls_it WHERE kosta = 'A' OR kosta = 'B'.
        CLEAR ls_pick.
        ls_pick-vbeln_vl = is_dlv-vbeln.
        ls_pick-posnr_vl = ls_it-posnr.
        ls_pick-vbeln    = is_dlv-vbeln.
        ls_pick-posnn    = ls_it-posnr.
        ls_pick-matnr    = ls_it-matnr.
        ls_pick-werks    = ls_it-werks.
        ls_pick-charg    = space.
        ls_pick-lfimg    = ls_it-lfimg.
        ls_pick-pikmg    = ls_it-lgmng.
        APPEND ls_pick TO lt_pick.
      ENDLOOP.
    ENDIF.
    IF iv_testrun = abap_true.
      lv_dbu = c_gi_check.
    ELSE.
      lv_dbu = c_gi_save.
    ENDIF.

    CALL FUNCTION 'WS_DELIVERY_UPDATE_2'
      EXPORTING
        vbkok_wa             = ls_ok
        delivery             = is_dlv-vbeln
        update_picking       = lv_upd
        if_database_update_1 = lv_dbu
      IMPORTING
        ef_error_any         = lv_any
      TABLES
        vbpok_tab            = lt_pick
        prot                 = lt_prot
      EXCEPTIONS
        error_message        = 1
        OTHERS               = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_prot( EXPORTING it_prot = lt_prot iv_idcomp = 'MSGID' iv_nocomp = 'MSGNO'
              CHANGING  cs_result = cs_result ).
    IF lv_any = 'X'.
      finish( CHANGING cs_result = cs_result ).
      IF cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'The goods issue check reported an error' CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_true OR cs_result-failed = abap_true.
      do_rollback( ).
      IF iv_testrun = abap_true AND cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'I' iv_text = 'Preview = goods issue check (nothing is posted)'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
      RETURN.
    ENDIF.

    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    " The material document and the accounting document are posted in the update task:
    " an error there (closed period, customer check) leaves the delivery unchanged.
    DO 15 TIMES.
      zcl_mcp_biz_sys=>get( )->sd_read_vbuk( EXPORTING iv_vbeln = is_dlv-vbeln iv_table = `LIKP` IMPORTING es_vbuk = ls_state ).
      lv_state = ls_state-wbstk.
      IF lv_state = 'C'.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_state <> 'C'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'The goods issue was not posted: the update was terminated (see the update log SM13)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    mat_doc_of( EXPORTING iv_vbeln = is_dlv-vbeln iv_cat = 'R' CHANGING cs_result = cs_result ).
    load_dlv( EXPORTING iv_vbeln = is_dlv-vbeln IMPORTING es_dlv = ls_head ev_found = lv_found ).
    IF lv_found = abap_true.
      cs_result-sd_header     = dlv_doc_row( ls_head ).
      cs_result-sd_status_new = dlv_status_text( ls_head ).
    ENDIF.
    ls_chg-field     = 'GOODS_ISSUE_STATUS'.
    ls_chg-old_value = 'open'.
    ls_chg-new_value = 'complete'.
    APPEND ls_chg TO cs_result-changes.
    lv_text = |Goods issue of delivery { fmt_doc( is_dlv-vbeln ) } posted|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD call_reverse.
    DATA: lt_mesg  TYPE STANDARD TABLE OF mesg WITH DEFAULT KEY,
          lv_budat TYPE sy-datlo,
          lv_tcode TYPE sy-tcode,
          lv_state TYPE vbuk-wbstk,
          ls_state TYPE vbuk,
          ls_head  TYPE ty_dlv,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_text  TYPE string.

    lv_budat = iv_date.
    lv_tcode = 'VL09'.

    CALL FUNCTION 'WS_REVERSE_GOODS_ISSUE'
      EXPORTING
        i_vbeln                   = is_dlv-vbeln
        i_budat                   = lv_budat
        i_tcode                   = lv_tcode
        i_vbtyp                   = 'J'
      TABLES
        t_mesg                    = lt_mesg
      EXCEPTIONS
        error_reverse_goods_issue = 1
        error_message             = 2
        OTHERS                    = 3.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The goods issue cannot be reversed (see messages)'
               CHANGING  cs_result = cs_result ).
    ENDIF.
    add_prot( EXPORTING it_prot = lt_mesg iv_idcomp = 'ARBGB' iv_nocomp = 'TXTNR'
              CHANGING  cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      do_rollback( ).
      RETURN.
    ENDIF.

    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    DO 15 TIMES.
      zcl_mcp_biz_sys=>get( )->sd_read_vbuk( EXPORTING iv_vbeln = is_dlv-vbeln iv_table = `LIKP` IMPORTING es_vbuk = ls_state ).
      lv_state = ls_state-wbstk.
      IF lv_state <> 'C'.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_state = 'C'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'The reversal was not posted: the update was terminated (see the update log SM13)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_dlv( EXPORTING iv_vbeln = is_dlv-vbeln IMPORTING es_dlv = ls_head ev_found = lv_found ).
    IF lv_found = abap_true.
      cs_result-sd_header     = dlv_doc_row( ls_head ).
      cs_result-sd_status_new = dlv_status_text( ls_head ).
    ENDIF.
    ls_chg-field     = 'GOODS_ISSUE_STATUS'.
    ls_chg-old_value = 'complete'.
    ls_chg-new_value = 'open'.
    APPEND ls_chg TO cs_result-changes.
    lv_text = |Goods issue of delivery { fmt_doc( is_dlv-vbeln ) } reversed|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD bil_get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/SD/actions.json.
    ls_def-id = 'SD.BIL.LIST_DUE'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.BIL.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.BIL.CREATE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'SD.BIL.CANCEL'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD bil_query.
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'SD.BIL.LIST_DUE'.
        rs_result = list_due( is_params ).
      WHEN 'SD.BIL.GET_DETAIL'.
        rs_result = bil_get_detail( is_params ).
      WHEN OTHERS.
        lv_text = |{ iv_action } is not a query action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD bil_preview.
    rs_result = bil_run( iv_action = iv_action is_params = is_params iv_execute = abap_false ).
  ENDMETHOD.


  METHOD bil_execute.
    rs_result = bil_run( iv_action = iv_action is_params = is_params iv_execute = abap_true ).
  ENDMETHOD.


  METHOD bil_run.
    DATA: lv_ref   TYPE vbak-vbeln,
          lv_cat   TYPE vbtyp,
          lv_type  TYPE fkart,
          lv_date  TYPE sy-datum,
          ls_bil   TYPE ty_bil,
          lv_test  TYPE abap_bool,
          lv_text  TYPE string.

    IF iv_execute = abap_false.
      lv_test = abap_true.
    ENDIF.

    " Every check of the preview runs again on the current data at EXECUTE.
    CASE iv_action.
      WHEN 'SD.BIL.CREATE'.
        bil_prepare_create( EXPORTING is_params = is_params
                        IMPORTING ev_ref = lv_ref ev_cat = lv_cat ev_type = lv_type ev_date = lv_date
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          bil_call_create( EXPORTING iv_ref = lv_ref iv_cat = lv_cat iv_type = lv_type iv_date = lv_date
                                 iv_testrun = lv_test
                       CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN 'SD.BIL.CANCEL'.
        prepare_cancel( EXPORTING is_params = is_params
                        IMPORTING es_bil = ls_bil ev_date = lv_date
                        CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_cancel( EXPORTING is_bil = ls_bil iv_date = lv_date iv_testrun = lv_test
                       CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN OTHERS.
        lv_text = |{ iv_action } is not a write action|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text
                 CHANGING  cs_result = rs_result ).
    ENDCASE.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD list_due.
    DATA: lv_vkorg TYPE vkdfs-vkorg,
          lv_date  TYPE sy-datum,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_from  TYPE i,
          lv_lines TYPE i,
          lt_rows  TYPE ty_dues,
          ls_row   TYPE ty_due,
          ls_doc   TYPE zif_mcp_biz_action=>ty_sd_doc,
          lv_text  TYPE string.

    lv_vkorg = to_upper( is_params-vkorg ).
    IF lv_vkorg IS INITIAL OR strlen( is_params-vkorg ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vkorg is required (sales organization)'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    lv_date = to_date( is_params-billing_date_to ).
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'billing_date_to is required (YYYY-MM-DD)'
               CHANGING  cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VBRK_VKO'
      ID 'VKORG' FIELD lv_vkorg
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      lv_text = |No authorization to display billing documents of sales organization { lv_vkorg }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    lv_max   = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.

    " VKDFS = billing due index (the source of the billing due list). Documents with a
    " billing block are not due. The sold-to party column is never read.
    SELECT vbeln vbtyp fkart vkorg vstel fkdat netwr waerk
      FROM vkdfs
      INTO CORRESPONDING FIELDS OF TABLE lt_rows
      UP TO lv_fetch ROWS
      WHERE vkorg = lv_vkorg
        AND fkdat <= lv_date
        AND faksk = space
      ORDER BY fkdat vbeln.

    IF lines( lt_rows ) > lv_max.
      rs_result-truncated = abap_true.
      lv_from = lv_max + 1.
      DELETE lt_rows FROM lv_from.
    ENDIF.
    LOOP AT lt_rows INTO ls_row.
      CLEAR ls_doc.
      ls_doc-vbeln    = ls_row-vbeln.
      ls_doc-vbtyp    = ls_row-vbtyp.
      ls_doc-doc_type = ls_row-fkart.
      ls_doc-vkorg    = ls_row-vkorg.
      ls_doc-vstel    = ls_row-vstel.
      ls_doc-date1    = ls_row-fkdat.
      ls_doc-netwr    = ext_amount( iv_amount = ls_row-netwr iv_waers = ls_row-waerk ).
      ls_doc-waerk    = ls_row-waerk.
      APPEND ls_doc TO rs_result-sd_docs.
    ENDLOOP.

    lv_lines = lines( rs_result-sd_docs ).
    lv_text = |{ lv_lines } documents due for billing|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD bil_get_detail.
    DATA: lv_vbeln TYPE vbrk-vbeln,
          ls_bil   TYPE ty_bil,
          lv_found TYPE abap_bool,
          lt_vp    TYPE STANDARD TABLE OF vbrp WITH DEFAULT KEY,
          ls_vp    TYPE vbrp,
          ls_out   TYPE zif_mcp_biz_action=>ty_sd_item,
          lt_fl    TYPE STANDARD TABLE OF vbfa WITH DEFAULT KEY,
          ls_fl    TYPE vbfa,
          ls_ofl   TYPE zif_mcp_biz_action=>ty_sd_flow,
          lv_n     TYPE i,
          lv_text  TYPE string.

    lv_vbeln = to_vbeln( is_params-vbeln ).
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (billing document, digits up to 10)'
               CHANGING  cs_result = rs_result ).
      RETURN.
    ENDIF.
    load_bil( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_bil = ls_bil ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Billing document { fmt_doc( lv_vbeln ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_bil( iv_fkart = ls_bil-fkart iv_vkorg = ls_bil-vkorg iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization for billing document { fmt_doc( lv_vbeln ) } (sales organization { ls_bil-vkorg }, billing type { ls_bil-fkart })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    rs_result-sd_header = bil_doc_row( ls_bil ).
    SELECT * FROM vbrp INTO TABLE lt_vp WHERE vbeln = lv_vbeln ORDER BY posnr.
    LOOP AT lt_vp INTO ls_vp.
      CLEAR ls_out.
      ls_out-vbeln    = ls_vp-vbeln.
      ls_out-posnr    = ls_vp-posnr.
      ls_out-matnr    = ls_vp-matnr.
      ls_out-arktx    = ls_vp-arktx.
      ls_out-werks    = ls_vp-werks.
      ls_out-qty      = ls_vp-fkimg.
      ls_out-vrkme    = ls_vp-vrkme.
      ls_out-netwr    = ext_amount( iv_amount = ls_vp-netwr iv_waers = ls_bil-waerk ).
      ls_out-ref_doc  = ls_vp-vgbel.
      ls_out-ref_item = ls_vp-vgpos.
      APPEND ls_out TO rs_result-sd_items.
    ENDLOOP.
    lv_n = lines( lt_vp ).
    rs_result-sd_header-items = lv_n.

    " Document flow: the documents this billing document refers to.
    SELECT * FROM vbfa INTO TABLE lt_fl UP TO 200 ROWS
      WHERE vbeln = lv_vbeln ORDER BY vbelv posnv.
    LOOP AT lt_fl INTO ls_fl.
      CLEAR ls_ofl.
      MOVE-CORRESPONDING ls_fl TO ls_ofl.
      APPEND ls_ofl TO rs_result-sd_flow.
    ENDLOOP.

    lv_text = |Billing document { fmt_doc( lv_vbeln ) }: { lv_n } items, { rs_result-sd_header-status }|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD load_bil.
    CLEAR: es_bil, ev_found.
    SELECT SINGLE vbeln fkart vbtyp vkorg fkdat erdat netwr waerk fksto sfakn rfbsk belnr
      FROM vbrk INTO CORRESPONDING FIELDS OF es_bil
      WHERE vbeln = iv_vbeln.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD bil_doc_row.
    MOVE-CORRESPONDING is_bil TO rs_doc.
    rs_doc-doc_type = is_bil-fkart.
    rs_doc-date1    = is_bil-fkdat.
    rs_doc-netwr    = ext_amount( iv_amount = is_bil-netwr iv_waers = is_bil-waerk ).
    rs_doc-status   = bil_status_text( is_bil ).
  ENDMETHOD.


  METHOD bil_status_text.
    DATA lv_text TYPE string.

    CASE is_bil-rfbsk.
      WHEN 'C'.
        lv_text = 'accounting document posted'.
        IF is_bil-belnr IS NOT INITIAL.
          lv_text = |accounting document { is_bil-belnr } posted|.
        ENDIF.
      WHEN space.
        lv_text = 'not relevant for accounting'.
      WHEN 'A'.
        lv_text = 'accounting: not yet posted'.
      WHEN OTHERS.
        lv_text = |accounting status { is_bil-rfbsk } (not posted: see the accounting error list)|.
    ENDCASE.
    IF is_bil-fksto = 'X'.
      lv_text = lv_text && ', cancelled'.
    ENDIF.
    IF is_bil-sfakn IS NOT INITIAL.
      lv_text = lv_text && ', cancellation document ' && is_bil-sfakn.
    ENDIF.
    rv_text = lv_text.
  ENDMETHOD.


  METHOD bil_prepare_create.
    DATA: lv_ref    TYPE vbak-vbeln,
          ls_k      TYPE likp,
          ls_u      TYPE vbuk,
          lv_u_found TYPE abap_bool,
          lv_vkorg  TYPE vbrk-vkorg,
          lv_fkarv  TYPE tvak-fkarv,
          lv_chk    TYPE tvfk-fkart,
          lv_auart  TYPE vbak-auart,
          lv_faksk  TYPE vbak-faksk,
          lv_text   TYPE string.

    CLEAR: ev_ref, ev_cat, ev_type, ev_date.
    lv_ref = to_vbeln( is_params-ref_doc ).
    IF lv_ref IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ref_doc is required (delivery or order, digits up to 10)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_date = to_date( is_params-billing_date ).
    IF ev_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'billing_date is required and must be a valid date (YYYY-MM-DD)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    " S/4: an order reference reads FKSAK (order-related billing) as FKSTK.
    zcl_mcp_biz_sys=>get( )->sd_read_vbuk( EXPORTING iv_vbeln = lv_ref IMPORTING es_vbuk = ls_u ev_found = lv_u_found ).
    IF lv_u_found = abap_false.
      lv_text = |Document { fmt_doc( lv_ref ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Delivery-related (document category J) or order-related billing.
    SELECT SINGLE * FROM likp INTO ls_k WHERE vbeln = lv_ref.
    IF sy-subrc = 0.
      ev_cat   = 'J'.
      lv_vkorg = ls_k-vkorg.
      lv_fkarv = ls_k-fkarv.
      lv_faksk = ls_k-faksk.
      IF ls_u-wbstk = 'A' OR ls_u-wbstk = 'B'.
        lv_text = |Delivery { fmt_doc( lv_ref ) }: the goods issue is not posted yet|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ELSE.
      SELECT SINGLE vkorg auart vbtyp faksk FROM vbak
        INTO (lv_vkorg, lv_auart, ev_cat, lv_faksk) WHERE vbeln = lv_ref.
      IF sy-subrc <> 0.
        lv_text = |Document { fmt_doc( lv_ref ) } is neither a delivery nor a sales order|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      " Order-related billing type of the order type.
      SELECT SINGLE fkara FROM tvak INTO lv_fkarv WHERE auart = lv_auart.
      IF ls_u-abstk = 'C'.
        lv_text = |Order { fmt_doc( lv_ref ) } is rejected completely|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF ls_u-fkstk IS INITIAL.
      lv_text = |Document { fmt_doc( lv_ref ) } is not relevant for billing|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_u-fkstk = 'C'.
      lv_text = |Document { fmt_doc( lv_ref ) } is billed completely|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lv_faksk IS NOT INITIAL.
      lv_text = |Document { fmt_doc( lv_ref ) } has billing block { lv_faksk }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    " Billing type: asked for, or the one proposed for the document.
    IF is_params-billing_type IS NOT INITIAL.
      ev_type = to_upper( is_params-billing_type ).
      SELECT SINGLE fkart FROM tvfk INTO lv_chk WHERE fkart = ev_type.
      IF sy-subrc <> 0.
        lv_text = |Billing type { ev_type } does not exist|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ELSE.
      ev_type = lv_fkarv.
    ENDIF.
    IF ev_type IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No billing type is defined for this document: give billing_type'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_bil( iv_fkart = ev_type iv_vkorg = lv_vkorg iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization to create billing type { ev_type } for sales organization { lv_vkorg }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF ls_u-fkstk = 'B'.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The document is billed partly: the open part is billed'
               CHANGING  cs_result = cs_result ).
    ENDIF.
    ev_ref = lv_ref.
  ENDMETHOD.


  METHOD bil_call_create.
    DATA: lt_bd   TYPE ty_bd,
          ls_bd   TYPE bapivbrk,
          lt_ret  TYPE ty_ret1,
          lt_succ TYPE ty_succ,
          ls_succ TYPE bapivbrksuccess,
          lt_err  TYPE ty_errs,
          lv_test TYPE bapivbrktestrun-testrun,
          lv_doc  TYPE vbrk-vbeln,
          lv_prev TYPE vbrk-vbeln,
          lv_num  TYPE i,
          ls_chg  TYPE zif_mcp_biz_action=>ty_change,
          lv_text TYPE string.

    ls_bd-ref_doc    = iv_ref.
    ls_bd-ref_doc_ca = iv_cat.
    ls_bd-doc_type   = iv_type.
    ls_bd-bill_date  = iv_date.
    APPEND ls_bd TO lt_bd.
    IF iv_testrun = abap_true.
      lv_test = 'X'.
    ENDIF.

    CALL FUNCTION 'BAPI_BILLINGDOC_CREATEMULTIPLE'
      EXPORTING
        testrun       = lv_test
      TABLES
        billingdatain = lt_bd
        errors        = lt_err
        return        = lt_ret
        success       = lt_succ
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    IF lt_succ IS INITIAL.
      finish( CHANGING cs_result = cs_result ).
      IF cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'No billing document was created: nothing is open for billing'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_true OR cs_result-failed = abap_true.
      IF iv_testrun = abap_true AND cs_result-failed = abap_false.
        LOOP AT lt_succ INTO ls_succ.
          IF ls_succ-bill_doc <> lv_prev.
            lv_prev = ls_succ-bill_doc.
            ls_chg-field     = 'BILLING_DOCUMENT (test run)'.
            lv_text          = |net value { ls_succ-net_value } { ls_succ-currency }, tax { ls_succ-tax_value }|.
            CONDENSE lv_text.
            ls_chg-new_value = lv_text.
            APPEND ls_chg TO cs_result-changes.
          ENDIF.
        ENDLOOP.
        add_msg( EXPORTING iv_type = 'I'
                           iv_text = 'Preview = BAPI test run: nothing is saved and nothing is posted to accounting'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
      do_rollback( ).
      RETURN.
    ENDIF.

    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    CLEAR lv_prev.
    LOOP AT lt_succ INTO ls_succ.
      IF ls_succ-bill_doc = lv_prev.
        CONTINUE.
      ENDIF.
      lv_prev = ls_succ-bill_doc.
      lv_doc  = ls_succ-bill_doc.
      lv_text = fmt_doc( lv_doc ).
      APPEND lv_text TO cs_result-sd_new_docs.
      lv_num = lv_num + 1.
      IF lv_num = 1.
        new_doc_status( EXPORTING iv_vbeln = lv_doc CHANGING cs_result = cs_result ).
      ENDIF.
    ENDLOOP.
    lv_text = |{ lv_num } billing document(s) created|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD new_doc_status.
    DATA: ls_bil   TYPE ty_bil,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    " The billing document is saved in the update task: wait for it. The accounting document
    " is posted when the document is saved: an error of the accounting interface (closed
    " period, customer check) leaves the billing document without accounting document.
    DO 10 TIMES.
      load_bil( EXPORTING iv_vbeln = iv_vbeln IMPORTING es_bil = ls_bil ev_found = lv_found ).
      IF lv_found = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The billing document is not visible yet: the update may still be running'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    cs_result-sd_header     = bil_doc_row( ls_bil ).
    cs_result-sd_status_new = bil_status_text( ls_bil ).
    IF ls_bil-rfbsk <> 'C' AND ls_bil-rfbsk IS NOT INITIAL.
      lv_text = |Billing document { fmt_doc( iv_vbeln ) } was created but the accounting document is not posted (status { ls_bil-rfbsk }): see the accounting error list|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD prepare_cancel.
    DATA: lv_vbeln TYPE vbrk-vbeln,
          lv_found TYPE abap_bool,
          lv_text  TYPE string.

    CLEAR: es_bil, ev_date.
    lv_vbeln = to_vbeln( is_params-vbeln ).
    IF lv_vbeln IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vbeln is required (billing document, digits up to 10)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    load_bil( EXPORTING iv_vbeln = lv_vbeln IMPORTING es_bil = es_bil ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = |Billing document { fmt_doc( lv_vbeln ) } not found|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_bil( iv_fkart = es_bil-fkart iv_vkorg = es_bil-vkorg iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization to cancel billing documents of type { es_bil-fkart } (sales organization { es_bil-vkorg })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_bil-vbtyp = 'N' OR es_bil-vbtyp = 'S'.
      lv_text = |Document { fmt_doc( lv_vbeln ) } is a cancellation document: it cannot be cancelled|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_bil-fksto = 'X'.
      lv_text = |Billing document { fmt_doc( lv_vbeln ) } is already cancelled|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-billing_date IS NOT INITIAL.
      ev_date = to_date( is_params-billing_date ).
      IF ev_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'billing_date must be a valid date (YYYY-MM-DD)'
                 CHANGING  cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    cs_result-sd_status_new = bil_status_text( es_bil ).
    IF es_bil-rfbsk <> 'C' AND es_bil-rfbsk IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The accounting document of this billing document is not posted'
               CHANGING  cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD call_cancel.
    DATA: lt_ret   TYPE ty_retn1,
          lt_succ  TYPE ty_succ,
          ls_succ  TYPE bapivbrksuccess,
          lv_doc   TYPE bapivbrksuccess-bill_doc,
          lv_test  TYPE bapivbrktestrun-testrun,
          lv_nocom TYPE bapi_ncomt,
          lv_bdate TYPE bf_datm1eb,
          lv_state TYPE vbrk-fksto,
          lv_new   TYPE vbrk-vbeln,
          ls_bil   TYPE ty_bil,
          lv_found TYPE abap_bool,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_text  TYPE string.

    lv_doc = is_bil-vbeln.
    lv_bdate = iv_date.
    lv_nocom = 'X'.
    IF iv_testrun = abap_true.
      lv_test = 'X'.
    ENDIF.

    CALL FUNCTION 'BAPI_BILLINGDOC_CANCEL1'
      EXPORTING
        billingdocument = lv_doc
        testrun         = lv_test
        no_commit       = lv_nocom
        billingdate     = lv_bdate
      TABLES
        return          = lt_ret
        success         = lt_succ
      EXCEPTIONS
        error_message   = 1
        OTHERS          = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    IF lt_succ IS INITIAL.
      finish( CHANGING cs_result = cs_result ).
      IF cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'No cancellation document was created' CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_true OR cs_result-failed = abap_true.
      IF iv_testrun = abap_true AND cs_result-failed = abap_false.
        add_msg( EXPORTING iv_type = 'I'
                           iv_text = 'Preview = BAPI test run: nothing is saved and nothing is posted to accounting'
                 CHANGING  cs_result = cs_result ).
      ENDIF.
      do_rollback( ).
      RETURN.
    ENDIF.

    commit_wait( CHANGING cs_result = cs_result ).
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    DO 15 TIMES.
      SELECT SINGLE fksto FROM vbrk INTO lv_state WHERE vbeln = is_bil-vbeln.
      IF lv_state = 'X'.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_state <> 'X'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'The cancellation was not saved: the update was terminated (see the update log SM13)'
               CHANGING  cs_result = cs_result ).
      RETURN.
    ENDIF.
    READ TABLE lt_succ INTO ls_succ INDEX 1.
    lv_new = ls_succ-bill_doc.
    lv_text = fmt_doc( lv_new ).
    APPEND lv_text TO cs_result-sd_new_docs.
    load_bil( EXPORTING iv_vbeln = is_bil-vbeln IMPORTING es_bil = ls_bil ev_found = lv_found ).
    IF lv_found = abap_true.
      cs_result-sd_header     = bil_doc_row( ls_bil ).
      cs_result-sd_status_new = bil_status_text( ls_bil ).
    ENDIF.
    ls_chg-field     = 'CANCELLED'.
    ls_chg-new_value = 'X'.
    APPEND ls_chg TO cs_result-changes.
    lv_text = |Billing document { fmt_doc( is_bil-vbeln ) } cancelled by { fmt_doc( lv_new ) }|.
    cs_result-summary = lv_text.
  ENDMETHOD.

ENDCLASS.
