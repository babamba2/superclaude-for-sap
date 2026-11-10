CLASS zcl_mcp_biz_sys_s4 DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* System-family reads for S/4HANA (ZIF_MCP_BIZ_SYS). INSTALL ON S/4HANA ONLY: this class
* uses S/4-only fields and tables statically. The factory ZCL_MCP_BIZ_SYS picks it up by name.
*
* SD status (SAP Note 2198647): VBUK / VBUP are not filled; the status fields live in
* VBAK / VBAP / LIKP / LIPS / VBRK under the same names. Order side has no delivery-related
* billing status: FKSTK <- VBAK-FKSAK, FKSTA <- VBAP-FKSAA (order-related billing); a
* delivery-related billing of an order item is read from the document flow (verified on
* S4-DEV 2026-11-10: the order item -> invoice VBFA row is written).

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_sys.

  PRIVATE SECTION.
    DATA mv_ledger TYPE finsc_ledger-rldnr.

    "! Leading ledger of the Universal Journal (FINSC_LEDGER-XLEADING), default 0L
    METHODS leading_ledger
      RETURNING VALUE(rv_rldnr) TYPE finsc_ledger-rldnr.
ENDCLASS.


CLASS zcl_mcp_biz_sys_s4 IMPLEMENTATION.

  METHOD zif_mcp_biz_sys~family.
    rv_family = zif_mcp_biz_sys=>c_family_s4.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_status_from.
    DATA lv_base TYPE string.

    " Status columns are in the base table itself: join it to itself as alias u.
    lv_base = to_lower( iv_base ).
    IF lv_base = 'vbap' OR lv_base = 'lips'.
      rv_from = |{ lv_base } AS { iv_alias } LEFT OUTER JOIN { lv_base } AS u | &&
                |ON u~vbeln = { iv_alias }~vbeln AND u~posnr = { iv_alias }~posnr|.
    ELSE.
      rv_from = |{ lv_base } AS { iv_alias } INNER JOIN { lv_base } AS u ON u~vbeln = { iv_alias }~vbeln|.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_status_cols.
    DATA: lt_tok  TYPE string_table,
          lv_tok  TYPE string,
          lv_base TYPE string.

    lv_base = to_upper( iv_base ).
    SPLIT condense( iv_cols ) AT space INTO TABLE lt_tok.
    LOOP AT lt_tok INTO lv_tok.
      IF lv_tok IS INITIAL.
        CONTINUE.
      ENDIF.
      IF lv_base = 'VBAK' AND to_lower( lv_tok ) = 'u~fkstk'.
        lv_tok = `u~fksak AS fkstk`.
      ELSEIF lv_base = 'VBAP' AND to_lower( lv_tok ) = 'u~fksta'.
        lv_tok = `u~fksaa AS fksta`.
      ENDIF.
      IF rv_cols IS INITIAL.
        rv_cols = lv_tok.
      ELSE.
        rv_cols = |{ rv_cols } { lv_tok }|.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_read_vbuk.
    DATA: lv_table TYPE string,
          ls_vbak  TYPE vbak,
          ls_likp  TYPE likp,
          ls_vbrk  TYPE vbrk.

    CLEAR: es_vbuk, ev_found.
    lv_table = to_upper( iv_table ).
    IF lv_table IS INITIAL OR lv_table = 'VBAK'.
      SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = iv_vbeln.
      IF sy-subrc = 0.
        MOVE-CORRESPONDING ls_vbak TO es_vbuk.
        es_vbuk-fkstk = ls_vbak-fksak.
        ev_found = abap_true.
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_table IS INITIAL OR lv_table = 'LIKP'.
      SELECT SINGLE * FROM likp INTO ls_likp WHERE vbeln = iv_vbeln.
      IF sy-subrc = 0.
        MOVE-CORRESPONDING ls_likp TO es_vbuk.
        ev_found = abap_true.
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_table IS INITIAL OR lv_table = 'VBRK'.
      SELECT SINGLE * FROM vbrk INTO ls_vbrk WHERE vbeln = iv_vbeln.
      IF sy-subrc = 0.
        MOVE-CORRESPONDING ls_vbrk TO es_vbuk.
        ev_found = abap_true.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_read_vbup.
    DATA: lv_table TYPE string,
          ls_vbap  TYPE vbap,
          ls_lips  TYPE lips.

    CLEAR: es_vbup, ev_found.
    lv_table = to_upper( iv_table ).
    IF lv_table IS INITIAL OR lv_table = 'VBAP'.
      SELECT SINGLE * FROM vbap INTO ls_vbap WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
      IF sy-subrc = 0.
        MOVE-CORRESPONDING ls_vbap TO es_vbup.
        es_vbup-fksta = ls_vbap-fksaa.
        ev_found = abap_true.
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_table IS INITIAL OR lv_table = 'LIPS'.
      SELECT SINGLE * FROM lips INTO ls_lips WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
      IF sy-subrc = 0.
        MOVE-CORRESPONDING ls_lips TO es_vbup.
        ev_found = abap_true.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~credit_read.
    " FSCM Credit Management: customer -> business partner (CVI_CUST_LINK), credit control area
    " -> credit segment (UKM_KKBER2SGM, else the main segment), limit / block (UKMBP_CMS_SGM),
    " risk class (UKMBP_CMS), exposure (UKM_TOTALS, statistical commitment types left out).
    " Commitment type mapping (SAP defaults, verify per system): 100 open orders, 200 open
    " deliveries, 300 open billing documents, 400 open items; any other type counts as special
    " liability. No name or address data.
    TYPES: BEGIN OF ty_tot,
             comm_typ TYPE ukm_totals-comm_typ,
             currency TYPE ukm_totals-currency,
             amount   TYPE ukm_totals-amount,
           END OF ty_tot.
    DATA: lv_guid    TYPE cvi_cust_link-partner_guid,
          lv_partner TYPE but000-partner,
          lv_sgmnt   TYPE ukm_kkber2sgm-credit_sgmnt,
          ls_sgm     TYPE ukmbp_cms_sgm,
          lv_risk    TYPE ukmbp_cms-risk_class,
          lt_tot     TYPE STANDARD TABLE OF ty_tot,
          ls_tot     TYPE ty_tot,
          lv_stat    TYPE ukmcomm_types-statistical_val.

    CLEAR: es_credit, ev_found, ev_denied, ev_text.
    es_credit-kkber = iv_kkber.
    es_credit-knkli = iv_kunnr.
    es_credit-source = 'UKM'.

    SELECT SINGLE credit_sgmnt FROM ukm_kkber2sgm INTO lv_sgmnt WHERE kkber = iv_kkber.
    IF sy-subrc <> 0 OR lv_sgmnt IS INITIAL.
      SELECT SINGLE credit_sgmnt FROM ukmcred_sgm0c INTO lv_sgmnt WHERE main_cred_sgmnt = abap_true.
    ENDIF.
    IF lv_sgmnt IS INITIAL.
      ev_text = |Credit control area { iv_kkber } has no credit segment in Credit Management|.
      RETURN.
    ENDIF.
    es_credit-segment = lv_sgmnt.

    AUTHORITY-CHECK OBJECT 'F_UKM_SGMT' ID 'ACTVT' FIELD '03' ID 'UKM_SGMNT' FIELD lv_sgmnt.
    IF sy-subrc <> 0.
      ev_denied = abap_true.
      ev_text = |No authorization to display credit data of credit segment { lv_sgmnt }|.
      RETURN.
    ENDIF.

    SELECT SINGLE partner_guid FROM cvi_cust_link INTO lv_guid WHERE customer = iv_kunnr.
    IF sy-subrc = 0.
      SELECT SINGLE partner FROM but000 INTO lv_partner WHERE partner_guid = lv_guid.
    ENDIF.
    IF lv_partner IS INITIAL.
      ev_text = |Customer { iv_kunnr } has no business partner link (CVI)|.
      RETURN.
    ENDIF.

    SELECT SINGLE * FROM ukmbp_cms_sgm INTO ls_sgm WHERE partner = lv_partner AND credit_sgmnt = lv_sgmnt.
    IF sy-subrc <> 0.
      ev_text = |Customer { iv_kunnr } (business partner { lv_partner }) has no credit account in segment { lv_sgmnt }: no credit check applies|.
      RETURN.
    ENDIF.
    ev_found = abap_true.
    es_credit-klimk = ls_sgm-credit_limit.
    es_credit-crblb = ls_sgm-xblocked.
    SELECT SINGLE risk_class FROM ukmbp_cms INTO lv_risk WHERE partner = lv_partner.
    es_credit-ctlpc = lv_risk.
    SELECT SINGLE currency FROM ukmcred_sgm0c INTO es_credit-waers WHERE credit_sgmnt = lv_sgmnt.

    SELECT comm_typ currency amount FROM ukm_totals INTO TABLE lt_tot
      WHERE partner = lv_partner AND credit_sgmnt = lv_sgmnt.
    LOOP AT lt_tot INTO ls_tot.
      CLEAR lv_stat.
      SELECT SINGLE statistical_val FROM ukmcomm_types INTO lv_stat WHERE comm_typ = ls_tot-comm_typ.
      IF lv_stat IS NOT INITIAL.
        CONTINUE.
      ENDIF.
      CASE ls_tot-comm_typ.
        WHEN '100'.
          es_credit-oeikw = es_credit-oeikw + ls_tot-amount.
        WHEN '200'.
          es_credit-olikw = es_credit-olikw + ls_tot-amount.
        WHEN '300'.
          es_credit-ofakw = es_credit-ofakw + ls_tot-amount.
        WHEN '400'.
          es_credit-skfor = es_credit-skfor + ls_tot-amount.
        WHEN OTHERS.
          es_credit-ssobl = es_credit-ssobl + ls_tot-amount.
      ENDCASE.
    ENDLOOP.
    es_credit-exposure = es_credit-skfor + es_credit-ssobl + es_credit-oeikw + es_credit-olikw + es_credit-ofakw.
  ENDMETHOD.


  METHOD leading_ledger.
    IF mv_ledger IS INITIAL.
      SELECT SINGLE rldnr FROM finsc_ledger INTO mv_ledger WHERE xleading = abap_true.
      IF sy-subrc <> 0.
        mv_ledger = '0L'.
      ENDIF.
    ENDIF.
    rv_rldnr = mv_ledger.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~fi_gl_open_items.
    " ACDOCA, leading ledger: G/L line items (BUZEI <> 000) posted up to the key date and
    " not cleared or cleared after it; normal documents only (BSTAT space).
    " Document splitting writes several ledger lines per entry-view line item (BUZEI), even
    " with opposite signs: they are summed signed per BELNR / GJAHR / BUZEI so that one open
    " item = one BSEG line, and returned unsigned with the debit / credit indicator (as BSIS).
    " Verified on S4-DEV 2026-11-10 against BSIS + BSAS (count, keys, amounts).
    TYPES: BEGIN OF ty_a,
             belnr TYPE acdoca-belnr,
             gjahr TYPE acdoca-gjahr,
             buzei TYPE acdoca-buzei,
             budat TYPE acdoca-budat,
             blart TYPE acdoca-blart,
             hsl   TYPE acdoca-hsl,
             wsl   TYPE acdoca-wsl,
             rwcur TYPE acdoca-rwcur,
             zuonr TYPE acdoca-zuonr,
             sgtxt TYPE acdoca-sgtxt,
           END OF ty_a.
    DATA: lt_a     TYPE STANDARD TABLE OF ty_a,
          ls_a     TYPE ty_a,
          ls_open  TYPE zif_mcp_biz_action=>ty_fi_open,
          lv_rldnr TYPE finsc_ledger-rldnr,
          lv_fetch TYPE i.

    CLEAR et_open.
    lv_rldnr = leading_ledger( ).
    lv_fetch = iv_fetch * 2.
    SELECT belnr gjahr buzei MAX( budat ) AS budat MAX( blart ) AS blart SUM( hsl ) AS hsl SUM( wsl ) AS wsl
           MAX( rwcur ) AS rwcur MAX( zuonr ) AS zuonr MAX( sgtxt ) AS sgtxt
      FROM acdoca INTO CORRESPONDING FIELDS OF TABLE lt_a UP TO lv_fetch ROWS
      WHERE rldnr = lv_rldnr AND rbukrs = iv_bukrs AND racct = iv_hkont
        AND budat <= iv_date AND bstat = space AND buzei <> '000'
        AND ( augbl = space OR augdt > iv_date )
      GROUP BY belnr gjahr buzei
      ORDER BY belnr gjahr buzei.
    LOOP AT lt_a INTO ls_a.
      CLEAR ls_open.
      ls_open-belnr = ls_a-belnr.
      ls_open-gjahr = ls_a-gjahr.
      ls_open-buzei = ls_a-buzei.
      ls_open-budat = ls_a-budat.
      ls_open-blart = ls_a-blart.
      IF ls_a-hsl < 0.
        ls_open-shkzg = 'H'.
      ELSE.
        ls_open-shkzg = 'S'.
      ENDIF.
      ls_open-dmbtr = abs( ls_a-hsl ).
      ls_open-wrbtr = abs( ls_a-wsl ).
      ls_open-waers = ls_a-rwcur.
      ls_open-zuonr = ls_a-zuonr.
      ls_open-sgtxt = ls_a-sgtxt.
      APPEND ls_open TO et_open.
    ENDLOOP.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~fi_ledger_text.
    DATA lv_rldnr TYPE finsc_ledger-rldnr.

    lv_rldnr = leading_ledger( ).
    SELECT SINGLE sgtxt FROM acdoca INTO rv_text
      WHERE rldnr = lv_rldnr AND rbukrs = iv_bukrs AND gjahr = iv_gjahr
        AND belnr = iv_belnr AND buzei = iv_buzei.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~co_totals.
    " Plan: classic plan data through COSP / COSS (same as ECC). Actual: ACDOCA, leading
    " ledger, CO object and posting periods, amount in CO area currency (KSL) per cost
    " element (RACCT). Compared with the COSP / COSS compatibility views at test time.
    TYPES: BEGIN OF ty_act,
             racct TYPE acdoca-racct,
             ksl   TYPE acdoca-ksl,
           END OF ty_act.
    DATA: lo_ecc   TYPE REF TO zif_mcp_biz_sys,
          lt_act   TYPE STANDARD TABLE OF ty_act,
          ls_act   TYPE ty_act,
          ls_tot   TYPE zif_mcp_biz_sys=>ty_co_tot,
          lv_rldnr TYPE finsc_ledger-rldnr,
          lv_pf    TYPE acdoca-poper,
          lv_pt    TYPE acdoca-poper.
    FIELD-SYMBOLS <ls_t> TYPE zif_mcp_biz_sys=>ty_co_tot.

    CREATE OBJECT lo_ecc TYPE zcl_mcp_biz_sys_ecc.
    lo_ecc->co_totals( EXPORTING iv_kokrs = iv_kokrs iv_objnr = iv_objnr iv_gjahr = iv_gjahr
                                 iv_from  = iv_from  iv_to    = iv_to    iv_versn = iv_versn
                       IMPORTING et_tot   = et_tot ).
    LOOP AT et_tot ASSIGNING <ls_t>.
      CLEAR <ls_t>-act.
    ENDLOOP.

    lv_rldnr = leading_ledger( ).
    lv_pf = iv_from.
    lv_pt = iv_to.
    SELECT racct SUM( ksl ) FROM acdoca INTO TABLE lt_act
      WHERE rldnr = lv_rldnr AND kokrs = iv_kokrs AND objnr = iv_objnr
        AND ryear = iv_gjahr AND poper BETWEEN lv_pf AND lv_pt
      GROUP BY racct.
    LOOP AT lt_act INTO ls_act.
      READ TABLE et_tot ASSIGNING <ls_t> WITH KEY kstar = ls_act-racct.
      IF sy-subrc <> 0.
        CLEAR ls_tot.
        ls_tot-kstar = ls_act-racct.
        APPEND ls_tot TO et_tot ASSIGNING <ls_t>.
      ENDIF.
      <ls_t>-act = <ls_t>-act + ls_act-ksl.
    ENDLOOP.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~output_requests.
    " APOC_C_OBJ_ACT activation 1 = active. Output request root per object, items per output;
    " item status 1 in preparation, 2 to be output, 3 pending, 4 completed, 5 error.
    TYPES: BEGIN OF ty_item,
             status             TYPE apoc_d_or_item-status,
             output_type        TYPE apoc_d_or_item-output_type,
             channel            TYPE apoc_d_or_item-channel,
             form_template_name TYPE apoc_d_or_item-form_template_name,
           END OF ty_item.
    DATA: lv_act   TYPE apoc_c_obj_act-activation_code,
          lv_type  TYPE apoc_c_obj_act-appl_obj_type,
          lv_id    TYPE apoc_d_or_root-appl_object_id,
          lv_root  TYPE apoc_d_or_root-db_key,
          lv_chg   TYPE apoc_d_or_root-total_lchg_date_time,
          lt_item  TYPE STANDARD TABLE OF ty_item,
          ls_item  TYPE ty_item,
          ls_out   TYPE zif_mcp_biz_sys=>ty_output.

    CLEAR: et_out, ev_active.
    lv_type = to_upper( iv_object_type ).
    SELECT SINGLE activation_code FROM apoc_c_obj_act INTO lv_act WHERE appl_obj_type = lv_type.
    IF lv_act <> '1'.
      RETURN.
    ENDIF.
    ev_active = abap_true.
    lv_id = iv_object_id.
    SELECT SINGLE db_key total_lchg_date_time FROM apoc_d_or_root INTO (lv_root, lv_chg)
      WHERE appl_object_type = lv_type AND appl_object_id = lv_id.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    SELECT status output_type channel form_template_name FROM apoc_d_or_item INTO TABLE lt_item
      WHERE parent_key = lv_root.
    LOOP AT lt_item INTO ls_item.
      CLEAR ls_out.
      ls_out-output_type = ls_item-output_type.
      ls_out-channel     = ls_item-channel.
      CASE ls_item-status.
        WHEN '1'. ls_out-status = 'in preparation'.
        WHEN '2'. ls_out-status = 'to be output'.
        WHEN '3'. ls_out-status = 'pending'.
        WHEN '4'. ls_out-status = 'completed'.
        WHEN '5'. ls_out-status = 'error'.
        WHEN OTHERS. ls_out-status = ls_item-status.
      ENDCASE.
      ls_out-form    = ls_item-form_template_name.
      IF lv_chg IS NOT INITIAL.
        ls_out-changed = |{ lv_chg TIMESTAMP = ISO }|.
      ENDIF.
      APPEND ls_out TO et_out.
    ENDLOOP.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_item_dlv_billing.
    " Delivery items of the order item (flow J) and their delivery-related billing status.
    TYPES: BEGIN OF ty_f,
             vbeln TYPE vbfa-vbeln,
             posnn TYPE vbfa-posnn,
           END OF ty_f.
    DATA: lt_f     TYPE STANDARD TABLE OF ty_f,
          ls_f     TYPE ty_f,
          lv_fksta TYPE lips-fksta,
          lv_any   TYPE abap_bool,
          lv_all   TYPE abap_bool.

    CLEAR rv_fksta.
    SELECT vbeln posnn FROM vbfa INTO TABLE lt_f
      WHERE vbelv = iv_vbeln AND posnv = iv_posnr AND vbtyp_n = 'J'.
    IF lt_f IS INITIAL.
      RETURN.
    ENDIF.
    lv_all = abap_true.
    LOOP AT lt_f INTO ls_f.
      CLEAR lv_fksta.
      SELECT SINGLE fksta FROM lips INTO lv_fksta WHERE vbeln = ls_f-vbeln AND posnr = ls_f-posnn.
      IF lv_fksta = 'B' OR lv_fksta = 'C'.
        lv_any = abap_true.
      ENDIF.
      IF lv_fksta <> 'C'.
        lv_all = abap_false.
      ENDIF.
    ENDLOOP.
    IF lv_any = abap_false.
      RETURN.
    ENDIF.
    IF lv_all = abap_true AND iv_lfsta = 'C'.
      rv_fksta = 'C'.
    ELSE.
      rv_fksta = 'B'.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_order_dlv_billing.
    TYPES: BEGIN OF ty_i,
             posnr TYPE vbap-posnr,
             lfsta TYPE vbap-lfsta,
             fksaa TYPE vbap-fksaa,
             abgru TYPE vbap-abgru,
           END OF ty_i.
    DATA: lt_i   TYPE STANDARD TABLE OF ty_i,
          ls_i   TYPE ty_i,
          lv_st  TYPE vbup-fksta,
          lv_n   TYPE i,
          lv_c   TYPE i,
          lv_any TYPE abap_bool.

    CLEAR rv_fkstk.
    SELECT posnr lfsta fksaa abgru FROM vbap INTO TABLE lt_i WHERE vbeln = iv_vbeln.
    LOOP AT lt_i INTO ls_i WHERE abgru IS INITIAL.
      lv_n = lv_n + 1.
      lv_st = ls_i-fksaa.
      IF lv_st IS INITIAL.
        lv_st = zif_mcp_biz_sys~sd_item_dlv_billing( iv_vbeln = iv_vbeln iv_posnr = ls_i-posnr iv_lfsta = ls_i-lfsta ).
      ENDIF.
      IF lv_st = 'B' OR lv_st = 'C'.
        lv_any = abap_true.
      ENDIF.
      IF lv_st = 'C'.
        lv_c = lv_c + 1.
      ENDIF.
    ENDLOOP.
    IF lv_any = abap_false.
      RETURN.
    ENDIF.
    IF lv_c = lv_n.
      rv_fkstk = 'C'.
    ELSE.
      rv_fkstk = 'B'.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
