CLASS zcl_mcp_biz_sys_ecc DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* System-family reads for ECC (ZIF_MCP_BIZ_SYS). Installed on every system; the factory
* ZCL_MCP_BIZ_SYS uses it when ZCL_MCP_BIZ_SYS_S4 is not installed. Written in 7.31 syntax.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_sys.
ENDCLASS.


CLASS zcl_mcp_biz_sys_ecc IMPLEMENTATION.

  METHOD zif_mcp_biz_sys~family.
    rv_family = zif_mcp_biz_sys=>c_family_ecc.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_status_from.
    DATA lv_base TYPE string.

    lv_base = to_lower( iv_base ).
    IF lv_base = 'vbap' OR lv_base = 'lips'.
      rv_from = |{ lv_base } AS { iv_alias } LEFT OUTER JOIN vbup AS u | &&
                |ON u~vbeln = { iv_alias }~vbeln AND u~posnr = { iv_alias }~posnr|.
    ELSE.
      rv_from = |{ lv_base } AS { iv_alias } INNER JOIN vbuk AS u ON u~vbeln = { iv_alias }~vbeln|.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_status_cols.
    rv_cols = iv_cols.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_read_vbuk.
    CLEAR: es_vbuk, ev_found.
    SELECT SINGLE * FROM vbuk INTO es_vbuk WHERE vbeln = iv_vbeln.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_read_vbup.
    CLEAR: es_vbup, ev_found.
    SELECT SINGLE * FROM vbup INTO es_vbup WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~sd_item_dlv_billing.
    " The order item carries no delivery-related billing status (VBUP-FKSTA is kept on
    " the delivery item): read the delivery items of the order item (flow J).
    TYPES: BEGIN OF ty_f,
             vbeln TYPE vbfa-vbeln,
             posnn TYPE vbfa-posnn,
           END OF ty_f.
    DATA: lt_f     TYPE STANDARD TABLE OF ty_f,
          ls_f     TYPE ty_f,
          lv_fksta TYPE vbup-fksta,
          lv_any   TYPE abap_bool,
          lv_open  TYPE abap_bool,
          lv_all   TYPE abap_bool.

    CLEAR rv_fksta.
    " Order-related billing: VBUP-FKSAA of the order item.
    SELECT SINGLE fksaa FROM vbup INTO rv_fksta WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
    IF rv_fksta = 'B' OR rv_fksta = 'C'.
      RETURN.
    ENDIF.
    CLEAR rv_fksta.
    SELECT vbeln posnn FROM vbfa INTO TABLE lt_f
      WHERE vbelv = iv_vbeln AND posnv = iv_posnr AND vbtyp_n = 'J'.
    IF lt_f IS INITIAL.
      RETURN.
    ENDIF.
    lv_all = abap_true.
    LOOP AT lt_f INTO ls_f.
      CLEAR lv_fksta.
      SELECT SINGLE fksta FROM vbup INTO lv_fksta WHERE vbeln = ls_f-vbeln AND posnr = ls_f-posnn.
      IF lv_fksta = 'B' OR lv_fksta = 'C'.
        lv_any = abap_true.
      ELSEIF lv_fksta = 'A'.
        lv_open = abap_true.
      ENDIF.
      IF lv_fksta <> 'C'.
        lv_all = abap_false.
      ENDIF.
    ENDLOOP.
    IF lv_any = abap_false.
      " Delivered, nothing billed (or the billing was cancelled): billing open.
      IF lv_open = abap_true.
        rv_fksta = 'A'.
      ENDIF.
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
             abgru TYPE vbap-abgru,
           END OF ty_i.
    DATA: lt_i   TYPE STANDARD TABLE OF ty_i,
          ls_i   TYPE ty_i,
          ls_u   TYPE vbup,
          lv_st  TYPE vbup-fksta,
          lv_n   TYPE i,
          lv_c   TYPE i,
          lv_open TYPE abap_bool,
          lv_any TYPE abap_bool.

    CLEAR rv_fkstk.
    SELECT posnr abgru FROM vbap INTO TABLE lt_i WHERE vbeln = iv_vbeln.
    LOOP AT lt_i INTO ls_i WHERE abgru IS INITIAL.
      lv_n = lv_n + 1.
      CLEAR ls_u.
      SELECT SINGLE * FROM vbup INTO ls_u WHERE vbeln = iv_vbeln AND posnr = ls_i-posnr.
      lv_st = ls_u-fksaa.
      IF lv_st IS INITIAL.
        lv_st = zif_mcp_biz_sys~sd_item_dlv_billing( iv_vbeln = iv_vbeln iv_posnr = ls_i-posnr iv_lfsta = ls_u-lfsta ).
      ENDIF.
      IF lv_st = 'B' OR lv_st = 'C'.
        lv_any = abap_true.
      ELSEIF lv_st = 'A'.
        lv_open = abap_true.
      ENDIF.
      IF lv_st = 'C'.
        lv_c = lv_c + 1.
      ENDIF.
    ENDLOOP.
    IF lv_any = abap_false.
      IF lv_open = abap_true.
        rv_fkstk = 'A'.
      ENDIF.
      RETURN.
    ENDIF.
    IF lv_c = lv_n.
      rv_fkstk = 'C'.
    ELSE.
      rv_fkstk = 'B'.
    ENDIF.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~credit_read.
    " KNKK + open order / delivery / billing values S066 / S067. No name or address data.
    CLEAR: es_credit, ev_found, ev_denied, ev_text.
    AUTHORITY-CHECK OBJECT 'F_KNKA_KKB' ID 'ACTVT' FIELD '03' ID 'KKBER' FIELD iv_kkber.
    IF sy-subrc <> 0.
      ev_denied = abap_true.
      ev_text = |No authorization to display credit data of credit control area { iv_kkber }|.
      RETURN.
    ENDIF.
    SELECT SINGLE kkber knkli klimk skfor ssobl ctlpc crblb FROM knkk
      INTO (es_credit-kkber, es_credit-knkli, es_credit-klimk, es_credit-skfor, es_credit-ssobl,
            es_credit-ctlpc, es_credit-crblb)
      WHERE kunnr = iv_kunnr AND kkber = iv_kkber.
    IF sy-subrc <> 0.
      ev_text = |Customer { iv_kunnr } has no credit data in credit control area { iv_kkber }: no credit check applies|.
      RETURN.
    ENDIF.
    ev_found = abap_true.
    es_credit-source = 'KNKK'.
    SELECT SINGLE waers FROM t014 INTO es_credit-waers WHERE kkber = iv_kkber.
    SELECT SUM( oeikw ) FROM s066 INTO es_credit-oeikw WHERE knkli = es_credit-knkli AND kkber = iv_kkber.
    SELECT SUM( olikw ) SUM( ofakw ) FROM s067 INTO (es_credit-olikw, es_credit-ofakw)
      WHERE knkli = es_credit-knkli AND kkber = iv_kkber.
    es_credit-exposure = es_credit-skfor + es_credit-ssobl + es_credit-oeikw + es_credit-olikw + es_credit-ofakw.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~fi_gl_open_items.
    DATA lt_clr TYPE zif_mcp_biz_action=>ty_fi_opens.

    CLEAR et_open.
    " Open today and posted up to the key date, plus items cleared after the key date.
    SELECT belnr gjahr buzei budat blart shkzg dmbtr wrbtr waers zuonr sgtxt
      FROM bsis INTO CORRESPONDING FIELDS OF TABLE et_open UP TO iv_fetch ROWS
      WHERE bukrs = iv_bukrs AND hkont = iv_hkont AND budat <= iv_date
      ORDER BY budat belnr buzei.
    SELECT belnr gjahr buzei budat blart shkzg dmbtr wrbtr waers zuonr sgtxt
      FROM bsas INTO CORRESPONDING FIELDS OF TABLE lt_clr UP TO iv_fetch ROWS
      WHERE bukrs = iv_bukrs AND hkont = iv_hkont AND budat <= iv_date AND augdt > iv_date
      ORDER BY budat belnr buzei.
    APPEND LINES OF lt_clr TO et_open.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~output_requests.
    CLEAR: et_out, ev_active.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~fi_ledger_text.
    SELECT SINGLE sgtxt FROM bseg INTO rv_text
      WHERE bukrs = iv_bukrs AND belnr = iv_belnr AND gjahr = iv_gjahr AND buzei = iv_buzei.
  ENDMETHOD.


  METHOD zif_mcp_biz_sys~co_totals.
    DATA: lt_p   TYPE STANDARD TABLE OF cosp,
          lt_s   TYPE STANDARD TABLE OF coss,
          ls_tot TYPE zif_mcp_biz_sys=>ty_co_tot,
          lv_per TYPE i,
          lv_nam TYPE string,
          lv_v   TYPE p LENGTH 15 DECIMALS 2.
    FIELD-SYMBOLS: <ls_p> TYPE cosp,
                   <ls_s> TYPE coss,
                   <lv_w> TYPE any,
                   <ls_t> TYPE zif_mcp_biz_sys=>ty_co_tot.

    CLEAR et_tot.
    " Actual = value type 04 (version 000); plan = value type 01 of the requested version.
    SELECT * FROM cosp INTO TABLE lt_p
      WHERE lednr = '00' AND objnr = iv_objnr AND gjahr = iv_gjahr
        AND ( ( wrttp = '04' AND versn = '000' ) OR ( wrttp = '01' AND versn = iv_versn ) ).
    SELECT * FROM coss INTO TABLE lt_s
      WHERE lednr = '00' AND objnr = iv_objnr AND gjahr = iv_gjahr
        AND ( ( wrttp = '04' AND versn = '000' ) OR ( wrttp = '01' AND versn = iv_versn ) ).

    LOOP AT lt_p ASSIGNING <ls_p>.
      lv_v = 0.
      lv_per = iv_from.
      WHILE lv_per <= iv_to.
        lv_nam = |WKG{ lv_per WIDTH = 3 ALIGN = RIGHT PAD = '0' }|.
        ASSIGN COMPONENT lv_nam OF STRUCTURE <ls_p> TO <lv_w>.
        IF sy-subrc = 0.
          lv_v = lv_v + <lv_w>.
        ENDIF.
        lv_per = lv_per + 1.
      ENDWHILE.
      READ TABLE et_tot ASSIGNING <ls_t> WITH KEY kstar = <ls_p>-kstar.
      IF sy-subrc <> 0.
        CLEAR ls_tot.
        ls_tot-kstar = <ls_p>-kstar.
        APPEND ls_tot TO et_tot ASSIGNING <ls_t>.
      ENDIF.
      IF <ls_p>-wrttp = '04'.
        <ls_t>-act = <ls_t>-act + lv_v.
      ELSE.
        <ls_t>-plan = <ls_t>-plan + lv_v.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_s ASSIGNING <ls_s>.
      lv_v = 0.
      lv_per = iv_from.
      WHILE lv_per <= iv_to.
        lv_nam = |WKG{ lv_per WIDTH = 3 ALIGN = RIGHT PAD = '0' }|.
        ASSIGN COMPONENT lv_nam OF STRUCTURE <ls_s> TO <lv_w>.
        IF sy-subrc = 0.
          lv_v = lv_v + <lv_w>.
        ENDIF.
        lv_per = lv_per + 1.
      ENDWHILE.
      READ TABLE et_tot ASSIGNING <ls_t> WITH KEY kstar = <ls_s>-kstar.
      IF sy-subrc <> 0.
        CLEAR ls_tot.
        ls_tot-kstar = <ls_s>-kstar.
        APPEND ls_tot TO et_tot ASSIGNING <ls_t>.
      ENDIF.
      IF <ls_s>-wrttp = '04'.
        <ls_t>-act = <ls_t>-act + lv_v.
      ELSE.
        <ls_t>-plan = <ls_t>-plan + lv_v.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
