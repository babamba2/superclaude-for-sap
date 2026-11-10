CLASS zcl_mcp_biz_fi DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_FI - FI accounting document business actions for ZMCP_BIZ_EXECUTE.
*
* Catalog: sc4sap configs/FI/actions.json. Action IDs must match it.
* Reads:  FI_DOCUMENT_READ (document by key), BSIS / BSAS (open items),
*         BAPI_GL_ACC_GETDETAIL. Only whitelisted fields leave the class: no
*         vendor / customer master data, no partner numbers.
* Writes: GL.POST and DOC.REVERSE have a CHECK function module: preview =
*         BAPI_ACC_DOCUMENT_CHECK / _REV_CHECK + rollback (the check runs the customer
*         validations and substitutions of the system, they are not copied here).
*         ITEM.SET_PAYMENT_BLOCK has no test mode: preview = static checks; execute =
*         FI_ITEMS_MASS_CHANGE (FB02 batch input: runs the document-change validations).
*         ITEM.CHANGE_TEXT: FI_DOCUMENT_CHANGE, which skips the validations (said in the
*         preview).
*         execute = BAPI + BAPI_TRANSACTION_COMMIT / _ROLLBACK.
* Authorization: own AUTHORITY-CHECKs (F_BKPF_BUK, F_BKPF_BLA, F_BKPF_KOA, F_SKA1_BUK)
*         before any read or write; a failed check refuses (fail closed).
* Parameter "lines" of GL.POST: one string per line, name=value pairs separated by ;
*         values percent-encoded for % ; = . Names: account, amount (+ debit, - credit,
*         document currency), cost_center, order, profit_center, text, tax_code,
*         business_area, assignment.
* Amounts leave the class in the real currency amount (SAP stores two decimals for every currency).
* 7.31 syntax (no inline declarations, no constructor operators, no string
* templates in method call parameters) so one source serves ECC 7.31,
* ECC 7.40 and S/4HANA.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    CONSTANTS:
      c_max_lines TYPE i VALUE 200.

    TYPES:
      ty_ret2  TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
      ty_gl    TYPE STANDARD TABLE OF bapiacgl09 WITH DEFAULT KEY,
      ty_cur   TYPE STANDARD TABLE OF bapiaccr09 WITH DEFAULT KEY,
      ty_bseg  TYPE STANDARD TABLE OF bseg WITH DEFAULT KEY,
      ty_bkpf  TYPE STANDARD TABLE OF bkpf WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_line,
        account       TYPE bapiacgl09-gl_account,
        amount        TYPE bapiaccr09-amt_doccur,
        cost_center   TYPE bapiacgl09-costcenter,
        order_id      TYPE bapiacgl09-orderid,
        profit_center TYPE bapiacgl09-profit_ctr,
        text          TYPE bapiacgl09-item_text,
        tax_code      TYPE bapiacgl09-tax_code,
        business_area TYPE bapiacgl09-bus_area,
        assignment    TYPE bapiacgl09-alloc_nmbr,
      END OF ty_line,
      ty_lines TYPE STANDARD TABLE OF ty_line WITH DEFAULT KEY.

    METHODS run
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS get_detail
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS list_open_items
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS get_account
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_post
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_head   TYPE bapiache09
                et_gl     TYPE ty_gl
                et_cur    TYPE ty_cur
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_post
      IMPORTING is_head    TYPE bapiache09
                it_gl      TYPE ty_gl
                it_cur     TYPE ty_cur
                iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_reverse
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_rev    TYPE bapiacrev
                es_bkpf   TYPE bkpf
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_reverse
      IMPORTING is_rev     TYPE bapiacrev
                iv_testrun TYPE abap_bool
      CHANGING  cs_result  TYPE zif_mcp_biz_action=>ty_result.

    METHODS prepare_item
      IMPORTING iv_action TYPE string
                is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_bkpf   TYPE bkpf
                es_bseg   TYPE bseg
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_block
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
                is_bkpf   TYPE bkpf
                is_bseg   TYPE bseg
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS call_text
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
                is_bkpf   TYPE bkpf
                is_bseg   TYPE bseg
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS read_doc
      IMPORTING iv_bukrs TYPE bkpf-bukrs
                iv_belnr TYPE bkpf-belnr
                iv_gjahr TYPE bkpf-gjahr
      EXPORTING es_bkpf  TYPE bkpf
                et_bseg  TYPE ty_bseg
                ev_found TYPE abap_bool.

    METHODS doc_key
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING ev_bukrs  TYPE bkpf-bukrs
                ev_belnr  TYPE bkpf-belnr
                ev_gjahr  TYPE bkpf-gjahr
                ev_ok     TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " ---- step 5 (2026-11-10): result in rows
    METHODS period_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS credit_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_rows
      IMPORTING is_data TYPE any
                iv_row  TYPE i
      CHANGING  ct_rows TYPE zif_mcp_biz_action=>ty_kvs.

    METHODS auth_buk
      IMPORTING iv_bukrs     TYPE bkpf-bukrs
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_bla
      IMPORTING iv_blart     TYPE bkpf-blart
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS auth_koa
      IMPORTING iv_koart     TYPE c
                iv_actvt     TYPE c
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    METHODS parse_line
      IMPORTING iv_line  TYPE string
      EXPORTING es_line  TYPE ty_line
                ev_ok    TYPE abap_bool
                ev_error TYPE string.

    METHODS ext_amount
      IMPORTING iv_amount        TYPE bseg-dmbtr
                iv_waers         TYPE waers
      RETURNING VALUE(rv_amount) TYPE bseg-dmbtr.

    METHODS alpha_out
      IMPORTING iv_value       TYPE clike
      RETURNING VALUE(rv_text) TYPE string.

    METHODS decode
      IMPORTING iv_in         TYPE string
      RETURNING VALUE(rv_out) TYPE string.

    METHODS to_date
      IMPORTING iv_value       TYPE string
      RETURNING VALUE(rv_date) TYPE sy-datum.

    METHODS to_amount
      IMPORTING iv_value  TYPE string
      EXPORTING ev_amount TYPE bapiaccr09-amt_doccur
                ev_ok     TYPE abap_bool.

    METHODS to_rate
      IMPORTING iv_value TYPE string
      EXPORTING ev_rate  TYPE bapiaccr09-exch_rate
                ev_ok    TYPE abap_bool.

    METHODS err_text
      IMPORTING is_err         TYPE any
      RETURNING VALUE(rv_text) TYPE string.

    METHODS to_belnr
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_belnr) TYPE bkpf-belnr.

    METHODS missing_text
      IMPORTING iv_bukrs       TYPE bkpf-bukrs
                iv_belnr       TYPE bkpf-belnr
                iv_gjahr       TYPE bkpf-gjahr
      RETURNING VALUE(rv_text) TYPE string.

    METHODS alpha_in
      IMPORTING iv_value       TYPE string
                iv_length      TYPE i
      RETURNING VALUE(rv_value) TYPE string.

    METHODS to_hkont
      IMPORTING iv_value        TYPE string
      RETURNING VALUE(rv_hkont) TYPE bseg-hkont.

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



CLASS zcl_mcp_biz_fi IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/FI/actions.json.
    ls_def-id = 'FI.DOC.GET_DETAIL'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.DOC.LIST_OPEN_ITEMS'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.GL.GET_ACCOUNT'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.GL.POST'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.DOC.REVERSE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.ITEM.SET_PAYMENT_BLOCK'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.ITEM.CHANGE_TEXT'. ls_def-kind = 'write'. ls_def-risk = 'medium'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.PERIOD.GET_STATUS'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'FI.AR.GET_CREDIT_STATUS'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    DATA lv_text TYPE string.

    CASE iv_action.
      WHEN 'FI.DOC.GET_DETAIL'.
        rs_result = get_detail( is_params ).
      WHEN 'FI.DOC.LIST_OPEN_ITEMS'.
        rs_result = list_open_items( is_params ).
      WHEN 'FI.GL.GET_ACCOUNT'.
        rs_result = get_account( is_params ).
      WHEN 'FI.PERIOD.GET_STATUS'.
        rs_result = period_status( is_params ).
      WHEN 'FI.AR.GET_CREDIT_STATUS'.
        rs_result = credit_status( is_params ).
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
    DATA: ls_head TYPE bapiache09,
          lt_gl   TYPE ty_gl,
          lt_cur  TYPE ty_cur,
          ls_rev  TYPE bapiacrev,
          ls_bkpf TYPE bkpf,
          ls_bseg TYPE bseg,
          lv_test TYPE abap_bool,
          lv_text TYPE string.

    IF iv_execute = abap_false.
      lv_test = abap_true.
    ENDIF.

    " Every check of the preview runs again on the current data at EXECUTE.
    CASE iv_action.
      WHEN 'FI.GL.POST'.
        prepare_post( EXPORTING is_params = is_params
                      IMPORTING es_head = ls_head et_gl = lt_gl et_cur = lt_cur
                      CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_post( EXPORTING is_head = ls_head it_gl = lt_gl it_cur = lt_cur iv_testrun = lv_test
                     CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN 'FI.DOC.REVERSE'.
        prepare_reverse( EXPORTING is_params = is_params
                         IMPORTING es_rev = ls_rev es_bkpf = ls_bkpf
                         CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          call_reverse( EXPORTING is_rev = ls_rev iv_testrun = lv_test
                        CHANGING  cs_result = rs_result ).
        ENDIF.

      WHEN 'FI.ITEM.SET_PAYMENT_BLOCK' OR 'FI.ITEM.CHANGE_TEXT'.
        prepare_item( EXPORTING iv_action = iv_action is_params = is_params
                      IMPORTING es_bkpf = ls_bkpf es_bseg = ls_bseg
                      CHANGING  cs_result = rs_result ).
        finish( CHANGING cs_result = rs_result ).
        IF rs_result-failed = abap_false.
          IF iv_execute = abap_false.
            IF iv_action = 'FI.ITEM.SET_PAYMENT_BLOCK'.
              add_msg( EXPORTING iv_type = 'I'
                                 iv_text = 'No test mode: this preview is the static check of the document and line. EXECUTE runs the FB02 validations of the system'
                       CHANGING  cs_result = rs_result ).
            ELSE.
              add_msg( EXPORTING iv_type = 'W'
                                 iv_text = 'FI_DOCUMENT_CHANGE has no test mode and skips the customer validations: this preview is the static check only'
                       CHANGING  cs_result = rs_result ).
            ENDIF.
          ELSEIF iv_action = 'FI.ITEM.SET_PAYMENT_BLOCK'.
            call_block( EXPORTING is_params = is_params is_bkpf = ls_bkpf is_bseg = ls_bseg
                        CHANGING  cs_result = rs_result ).
          ELSE.
            call_text( EXPORTING is_params = is_params is_bkpf = ls_bkpf is_bseg = ls_bseg
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


  METHOD get_detail.
    DATA: lv_bukrs TYPE bkpf-bukrs,
          lv_belnr TYPE bkpf-belnr,
          lv_gjahr TYPE bkpf-gjahr,
          lv_ok    TYPE abap_bool,
          lv_found TYPE abap_bool,
          ls_bkpf  TYPE bkpf,
          lt_bseg  TYPE ty_bseg,
          ls_line  TYPE zif_mcp_biz_action=>ty_fi_line,
          lv_local TYPE t001-waers,
          lv_n     TYPE i,
          lv_text  TYPE string.
    FIELD-SYMBOLS <ls_bseg> TYPE bseg.

    doc_key( EXPORTING is_params = is_params
             IMPORTING ev_bukrs = lv_bukrs ev_belnr = lv_belnr ev_gjahr = lv_gjahr ev_ok = lv_ok
             CHANGING  cs_result = rs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    IF auth_buk( iv_bukrs = lv_bukrs iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display documents of company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    read_doc( EXPORTING iv_bukrs = lv_bukrs iv_belnr = lv_belnr iv_gjahr = lv_gjahr
              IMPORTING es_bkpf = ls_bkpf et_bseg = lt_bseg ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = missing_text( iv_bukrs = lv_bukrs iv_belnr = lv_belnr iv_gjahr = lv_gjahr ).
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_bla( iv_blart = ls_bkpf-blart iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display document type { ls_bkpf-blart }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    MOVE-CORRESPONDING ls_bkpf TO rs_result-fi_header.
    SELECT SINGLE waers FROM t001 INTO lv_local WHERE bukrs = lv_bukrs.
    LOOP AT lt_bseg ASSIGNING <ls_bseg>.
      CLEAR ls_line.
      MOVE-CORRESPONDING <ls_bseg> TO ls_line.
      ls_line-dmbtr = ext_amount( iv_amount = <ls_bseg>-dmbtr iv_waers = lv_local ).
      ls_line-wrbtr = ext_amount( iv_amount = <ls_bseg>-wrbtr iv_waers = <ls_bseg>-pswsl ).
      APPEND ls_line TO rs_result-fi_lines.
    ENDLOOP.
    lv_n = lines( rs_result-fi_lines ).
    lv_text = |Document { alpha_out( lv_belnr ) } { lv_gjahr }: type { ls_bkpf-blart }, posting date { fmt_date( ls_bkpf-budat ) }, { lv_n } lines|.
    IF ls_bkpf-stblg IS NOT INITIAL.
      lv_text = |{ lv_text }, reversed by { alpha_out( ls_bkpf-stblg ) }|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD list_open_items.
    DATA: lv_bukrs TYPE bkpf-bukrs,
          lv_hkont TYPE bseg-hkont,
          lv_date  TYPE sy-datum,
          lv_max   TYPE i,
          lv_fetch TYPE i,
          lv_open  TYPE skb1-xopvw,
          lt_open  TYPE zif_mcp_biz_action=>ty_fi_opens,
          ls_open  TYPE zif_mcp_biz_action=>ty_fi_open,
          lv_local TYPE t001-waers,
          lv_text  TYPE string,
          lv_n     TYPE i.

    lv_bukrs = to_upper( is_params-bukrs ).
    lv_hkont = to_hkont( is_params-hkont ).
    lv_date  = to_date( is_params-key_date ).
    IF lv_bukrs IS INITIAL OR strlen( is_params-bukrs ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code, 4 characters)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_hkont IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'hkont is required (G/L account, up to 10 digits)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'key_date is required (YYYY-MM-DD)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    IF auth_buk( iv_bukrs = lv_bukrs iv_actvt = '03' ) = abap_false
       OR auth_koa( iv_koart = 'S' iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization to display G/L line items of company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE xopvw FROM skb1 INTO lv_open WHERE bukrs = lv_bukrs AND saknr = lv_hkont.
    IF sy-subrc <> 0.
      lv_text = |G/L account { alpha_out( lv_hkont ) } does not exist in company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_open IS INITIAL.
      lv_text = |G/L account { alpha_out( lv_hkont ) } is not open item managed: it has no open items|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
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

    " Open at the key date: ECC BSIS + BSAS, S/4 ACDOCA (ZIF_MCP_BIZ_SYS).
    zcl_mcp_biz_sys=>get( )->fi_gl_open_items( EXPORTING iv_bukrs = lv_bukrs iv_hkont = lv_hkont
                                                         iv_date  = lv_date  iv_fetch = lv_fetch
                                               IMPORTING et_open  = lt_open ).
    SORT lt_open BY budat belnr buzei.
    lv_n = lines( lt_open ).
    IF lv_n > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_open FROM lv_fetch.
      lv_n = lv_max.
    ENDIF.
    SELECT SINGLE waers FROM t001 INTO lv_local WHERE bukrs = lv_bukrs.
    LOOP AT lt_open INTO ls_open.
      ls_open-wrbtr = ext_amount( iv_amount = ls_open-wrbtr iv_waers = ls_open-waers ).
      ls_open-dmbtr = ext_amount( iv_amount = ls_open-dmbtr iv_waers = lv_local ).
      APPEND ls_open TO rs_result-fi_open_items.
    ENDLOOP.
    lv_text = |{ lv_n } open items of G/L account { alpha_out( lv_hkont ) } at { fmt_date( lv_date ) }|.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_max } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD get_account.
    DATA: lv_bukrs TYPE bapi3006_0-comp_code,
          lv_hkont TYPE bapi3006_0-gl_account,
          ls_ret   TYPE bapireturn,
          ls_det   TYPE bapi3006_2,
          lv_text  TYPE string,
          lv_h     TYPE bseg-hkont.

    lv_bukrs = to_upper( is_params-bukrs ).
    lv_h     = to_hkont( is_params-saknr ).
    lv_hkont = lv_h.
    IF lv_bukrs IS INITIAL OR strlen( is_params-bukrs ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code, 4 characters)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_hkont IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'saknr is required (G/L account, up to 10 digits)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'F_SKA1_BUK'
      ID 'BUKRS' FIELD lv_bukrs
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      lv_text = |No authorization to display G/L accounts of company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_GL_ACC_GETDETAIL'
      EXPORTING
        companycode    = lv_bukrs
        glacct         = lv_hkont
      IMPORTING
        return         = ls_ret
        account_detail = ls_det
      EXCEPTIONS
        error_message  = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_ret-type CA 'EA'.
      lv_text = ls_ret-message.
      add_msg( EXPORTING iv_type = ls_ret-type iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    rs_result-gl_detail = ls_det.
    lv_text = |G/L account { alpha_out( lv_h ) } in company code { lv_bukrs }|.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD prepare_post.
    DATA: lv_bukrs  TYPE bapiache09-comp_code,
          lv_blart  TYPE t003-blart,
          lv_pdate  TYPE sy-datum,
          lv_ddate  TYPE sy-datum,
          lv_waers  TYPE tcurc-waers,
          lv_line   TYPE string,
          ls_line   TYPE ty_line,
          lv_ok     TYPE abap_bool,
          lv_err    TYPE string,
          lv_text   TYPE string,
          lv_n      TYPE i,
          lv_sum    TYPE bapiaccr09-amt_doccur,
          lv_item   TYPE bapiacgl09-itemno_acc,
          ls_gl     TYPE bapiacgl09,
          ls_cur    TYPE bapiaccr09,
          lv_rate   TYPE bapiaccr09-exch_rate,
          lv_rok    TYPE abap_bool,
          lv_t001   TYPE t001-bukrs.

    CLEAR: es_head, et_gl, et_cur.
    lv_bukrs = to_upper( is_params-bukrs ).
    lv_blart = to_upper( is_params-doc_type ).
    IF lv_bukrs IS INITIAL OR strlen( is_params-bukrs ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code, 4 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE bukrs FROM t001 INTO lv_t001 WHERE bukrs = lv_bukrs.
    IF sy-subrc <> 0.
      lv_text = |Company code { lv_bukrs } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lv_blart IS INITIAL OR strlen( is_params-doc_type ) > 2.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'doc_type is required (document type, 2 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE blart FROM t003 INTO lv_blart WHERE blart = lv_blart.
    IF sy-subrc <> 0.
      lv_text = |Document type { is_params-doc_type } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_pdate = to_date( is_params-posting_date ).
    IF lv_pdate IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_ddate = to_date( is_params-doc_date ).
    IF lv_ddate IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'doc_date must be a valid date (YYYY-MM-DD)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_waers = to_upper( is_params-currency ).
    IF lv_waers IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'currency is required (document currency)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE waers FROM tcurc INTO lv_waers WHERE waers = lv_waers.
    IF sy-subrc <> 0.
      lv_text = |Currency { is_params-currency } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lines( is_params-lines ) < 2.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lines needs at least two lines (debit and credit)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lines( is_params-lines ) > c_max_lines.
      lv_text = |lines has more than { c_max_lines } lines|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-exchange_rate IS NOT INITIAL.
      to_rate( EXPORTING iv_value = is_params-exchange_rate IMPORTING ev_rate = lv_rate ev_ok = lv_rok ).
      IF lv_rok = abap_false OR lv_rate <= 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'exchange_rate must be a positive number'
                 CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    " Authorization (fail closed): company code, document type group, G/L account type.
    IF auth_buk( iv_bukrs = lv_bukrs iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization to post in company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_bla( iv_blart = lv_blart iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization to post document type { lv_blart }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_koa( iv_koart = 'S' iv_actvt = '01' ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'No authorization to post to G/L accounts'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    es_head-comp_code  = lv_bukrs.
    es_head-doc_type   = lv_blart.
    es_head-pstng_date = lv_pdate.
    es_head-doc_date   = lv_ddate.
    es_head-header_txt = is_params-header_text.
    es_head-ref_doc_no = is_params-reference.
    es_head-username   = sy-uname.
    es_head-bus_act    = 'RFBU'.
    " Optional posting period (special periods 13 to 16 for closing postings).
    IF is_params-fis_period IS NOT INITIAL.
      IF strlen( is_params-fis_period ) > 3 OR is_params-fis_period CN '0123456789'.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'fis_period must be a posting period number (1 to 3 digits)'
                 CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      es_head-fis_period = is_params-fis_period.
      lv_text = |Posting period { is_params-fis_period } requested: a special period must be open in the posting period variant|.
      add_msg( EXPORTING iv_type = 'I' iv_text = lv_text CHANGING cs_result = cs_result ).
    ENDIF.
    IF strlen( is_params-header_text ) > 25.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'header_text is longer than 25 characters: the document header text keeps the first 25'
               CHANGING cs_result = cs_result ).
    ENDIF.
    IF strlen( is_params-reference ) > 16.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'reference is longer than 16 characters: the document keeps the first 16'
               CHANGING cs_result = cs_result ).
    ENDIF.

    lv_n = 0.
    LOOP AT is_params-lines INTO lv_line.
      lv_n = lv_n + 1.
      parse_line( EXPORTING iv_line = lv_line IMPORTING es_line = ls_line ev_ok = lv_ok ev_error = lv_err ).
      IF lv_ok = abap_false.
        lv_text = |Line { lv_n }: { lv_err }|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF ls_line-amount = 0.
        lv_text = |Line { lv_n }: amount must not be 0|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      lv_item = lv_n.
      CLEAR: ls_gl, ls_cur.
      ls_gl-itemno_acc = lv_item.
      ls_gl-gl_account = ls_line-account.
      ls_gl-item_text  = ls_line-text.
      ls_gl-costcenter = ls_line-cost_center.
      ls_gl-orderid    = ls_line-order_id.
      ls_gl-profit_ctr = ls_line-profit_center.
      ls_gl-tax_code   = ls_line-tax_code.
      ls_gl-bus_area   = ls_line-business_area.
      ls_gl-alloc_nmbr = ls_line-assignment.
      APPEND ls_gl TO et_gl.
      ls_cur-itemno_acc = lv_item.
      ls_cur-curr_type  = '00'.
      ls_cur-currency   = lv_waers.
      ls_cur-amt_doccur = ls_line-amount.
      IF lv_rate IS NOT INITIAL.
        ls_cur-exch_rate = lv_rate.
      ENDIF.
      APPEND ls_cur TO et_cur.
      lv_sum = lv_sum + ls_line-amount.
    ENDLOOP.
    IF lv_sum <> 0.
      lv_text = |The lines do not balance: the amounts add up to { lv_sum }, they must add up to 0|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_text = |Posting in company code { lv_bukrs }, type { lv_blart }, posting date { fmt_date( lv_pdate ) }, { lv_n } lines|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD call_post.
    DATA: ls_head   TYPE bapiache09,
          lt_gl     TYPE ty_gl,
          lt_cur    TYPE ty_cur,
          lt_gl0    TYPE ty_gl,
          lt_ret    TYPE ty_ret2,
          lv_type   TYPE bapiache09-obj_type,
          lv_key    TYPE bapiache09-obj_key,
          lv_sys    TYPE bapiache09-obj_sys,
          ls_chg    TYPE zif_mcp_biz_action=>ty_change,
          lv_text   TYPE string,
          ls_new    TYPE bapiacgl09,
          ls_old    TYPE bapiacgl09,
          lv_tabix  TYPE sy-tabix,
          lv_i      TYPE string.

    ls_head = is_head.
    lt_gl   = it_gl.
    lt_cur  = it_cur.
    lt_gl0  = it_gl.

    IF iv_testrun = abap_true.
      CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
        EXPORTING
          documentheader = ls_head
        TABLES
          accountgl      = lt_gl
          currencyamount = lt_cur
          return         = lt_ret
        EXCEPTIONS
          error_message  = 1
          OTHERS         = 2.
    ELSE.
      CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
        EXPORTING
          documentheader = ls_head
        IMPORTING
          obj_type       = lv_type
          obj_key        = lv_key
          obj_sys        = lv_sys
        TABLES
          accountgl      = lt_gl
          currencyamount = lt_cur
          return         = lt_ret
        EXCEPTIONS
          error_message  = 1
          OTHERS         = 2.
    ENDIF.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).

    " Substitutions of the system may change lines: show what changed.
    LOOP AT lt_gl INTO ls_new.
      lv_tabix = sy-tabix.
      READ TABLE lt_gl0 INTO ls_old INDEX lv_tabix.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      lv_i = ls_new-itemno_acc.
      SHIFT lv_i LEFT DELETING LEADING '0'.
      IF ls_new-costcenter <> ls_old-costcenter.
        CLEAR ls_chg.
        ls_chg-field = |LINE { lv_i } COSTCENTER|. ls_chg-old_value = ls_old-costcenter. ls_chg-new_value = ls_new-costcenter.
        APPEND ls_chg TO cs_result-changes.
      ENDIF.
      IF ls_new-orderid <> ls_old-orderid.
        CLEAR ls_chg.
        ls_chg-field = |LINE { lv_i } ORDERID|. ls_chg-old_value = ls_old-orderid. ls_chg-new_value = ls_new-orderid.
        APPEND ls_chg TO cs_result-changes.
      ENDIF.
      IF ls_new-profit_ctr <> ls_old-profit_ctr.
        CLEAR ls_chg.
        ls_chg-field = |LINE { lv_i } PROFIT_CTR|. ls_chg-old_value = ls_old-profit_ctr. ls_chg-new_value = ls_new-profit_ctr.
        APPEND ls_chg TO cs_result-changes.
      ENDIF.
      IF ls_new-bus_area <> ls_old-bus_area.
        CLEAR ls_chg.
        ls_chg-field = |LINE { lv_i } BUS_AREA|. ls_chg-old_value = ls_old-bus_area. ls_chg-new_value = ls_new-bus_area.
        APPEND ls_chg TO cs_result-changes.
      ENDIF.
      IF ls_new-func_area <> ls_old-func_area.
        CLEAR ls_chg.
        ls_chg-field = |LINE { lv_i } FUNC_AREA|. ls_chg-old_value = ls_old-func_area. ls_chg-new_value = ls_new-func_area.
        APPEND ls_chg TO cs_result-changes.
      ENDIF.
      IF ls_new-item_text <> ls_old-item_text.
        CLEAR ls_chg.
        ls_chg-field = |LINE { lv_i } ITEM_TEXT|. ls_chg-old_value = ls_old-item_text. ls_chg-new_value = ls_new-item_text.
        APPEND ls_chg TO cs_result-changes.
      ENDIF.
    ENDLOOP.

    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_false AND cs_result-failed = abap_false.
      " OBJ_KEY = document number (10) + company code (4) + fiscal year (4).
      IF strlen( lv_key ) >= 18.
        cs_result-doc_belnr = lv_key(10).
        cs_result-doc_bukrs = lv_key+10(4).
        cs_result-doc_gjahr = lv_key+14(4).
        lv_text = |Document { alpha_out( cs_result-doc_belnr ) } posted in company code { cs_result-doc_bukrs }, fiscal year { cs_result-doc_gjahr }|.
        cs_result-summary = lv_text.
        add_msg( EXPORTING iv_type = 'S' iv_text = lv_text CHANGING cs_result = cs_result ).
      ELSE.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'The posting returned no document number: check the posting before repeating it'
                 CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = iv_testrun CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD prepare_reverse.
    DATA: lv_bukrs TYPE bkpf-bukrs,
          lv_belnr TYPE bkpf-belnr,
          lv_gjahr TYPE bkpf-gjahr,
          lv_ok    TYPE abap_bool,
          lv_found TYPE abap_bool,
          lt_bseg  TYPE ty_bseg,
          lv_grd   TYPE t041c-stgrd,
          lv_date  TYPE sy-datum,
          lv_per   TYPE string,
          lv_text  TYPE string,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change.

    CLEAR: es_rev, es_bkpf.
    doc_key( EXPORTING is_params = is_params
             IMPORTING ev_bukrs = lv_bukrs ev_belnr = lv_belnr ev_gjahr = lv_gjahr ev_ok = lv_ok
             CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    IF is_params-reason IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'reason is required (reversal reason)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_date = to_date( is_params-posting_date ).
    IF lv_date IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_buk( iv_bukrs = lv_bukrs iv_actvt = '01' ) = abap_false
       OR auth_buk( iv_bukrs = lv_bukrs iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to reverse documents of company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    read_doc( EXPORTING iv_bukrs = lv_bukrs iv_belnr = lv_belnr iv_gjahr = lv_gjahr
              IMPORTING es_bkpf = es_bkpf et_bseg = lt_bseg ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = missing_text( iv_bukrs = lv_bukrs iv_belnr = lv_belnr iv_gjahr = lv_gjahr ).
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_bla( iv_blart = es_bkpf-blart iv_actvt = '01' ) = abap_false.
      lv_text = |No authorization for document type { es_bkpf-blart }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_bkpf-stblg IS NOT INITIAL.
      lv_text = |Document { alpha_out( lv_belnr ) } is already reversed by document { alpha_out( es_bkpf-stblg ) }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_bkpf-bstat IS NOT INITIAL.
      lv_text = |Document { alpha_out( lv_belnr ) } is not a normal posted document (status { es_bkpf-bstat })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_bkpf-awtyp IS NOT INITIAL AND es_bkpf-awtyp <> 'BKPF' AND es_bkpf-awtyp <> 'BKPFF'.
      lv_text = |Document { alpha_out( lv_belnr ) } was created by another application (origin { es_bkpf-awtyp }): reverse it there|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    " The reversal BAPI does not accept reference type BKPF (FB01 and other classic FI
    " dialog postings end in RW 628). BKPFF is left to the BAPI: interface postings
    " reverse, Enjoy dialog postings come back with F5A 009 (hint added in call_reverse).
    IF es_bkpf-awtyp IS INITIAL OR es_bkpf-awtyp = 'BKPF'.
      lv_text = |Document { alpha_out( lv_belnr ) } was posted in the FI dialog (transaction { es_bkpf-tcode }): | &&
                |reverse it with FB08 - the reversal interface reverses only interface postings|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_grd = to_upper( is_params-reason ).
    SELECT SINGLE stgrd FROM t041c INTO lv_grd WHERE stgrd = lv_grd.
    IF sy-subrc <> 0.
      lv_text = |Reversal reason { is_params-reason } is not defined|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_per = is_params-fis_period.
    IF lv_per IS NOT INITIAL AND ( strlen( lv_per ) > 3 OR lv_per CN '0123456789' ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'fis_period must be a posting period number (1 to 3 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    es_rev-obj_type   = es_bkpf-awtyp.
    IF es_rev-obj_type IS INITIAL.
      es_rev-obj_type = 'BKPF'.
    ENDIF.
    es_rev-obj_key_r  = |{ lv_belnr }{ lv_bukrs }{ lv_gjahr }|.
    es_rev-obj_sys    = es_bkpf-awsys.
    es_rev-comp_code  = lv_bukrs.
    es_rev-pstng_date = lv_date.
    es_rev-reason_rev = lv_grd.
    es_rev-username   = sy-uname.
    IF lv_per IS NOT INITIAL.
      es_rev-fis_period = lv_per.
    ENDIF.
    ls_chg-field     = 'BKPF-STBLG'.
    ls_chg-new_value = 'reversal document'.
    APPEND ls_chg TO cs_result-changes.
    cs_result-irreversible = abap_true.
    lv_text = |Reversal of document { alpha_out( lv_belnr ) } { lv_gjahr } in company code { lv_bukrs }, posting date { fmt_date( lv_date ) }|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD call_reverse.
    DATA: ls_rev  TYPE bapiacrev,
          lt_ret  TYPE ty_ret2,
          lv_type TYPE bapiacrev-obj_type,
          lv_key  TYPE bapiacrev-obj_key,
          lv_sys  TYPE bapiacrev-obj_sys,
          lv_bus  TYPE bapiache09-bus_act,
          lv_text TYPE string.

    ls_rev = is_rev.
    lv_bus = 'RFBU'.
    IF iv_testrun = abap_true.
      CALL FUNCTION 'BAPI_ACC_DOCUMENT_REV_CHECK'
        EXPORTING
          reversal      = ls_rev
          bus_act       = lv_bus
        TABLES
          return        = lt_ret
        EXCEPTIONS
          error_message = 1
          OTHERS        = 2.
    ELSE.
      CALL FUNCTION 'BAPI_ACC_DOCUMENT_REV_POST'
        EXPORTING
          reversal      = ls_rev
          bus_act       = lv_bus
        IMPORTING
          obj_type      = lv_type
          obj_key       = lv_key
          obj_sys       = lv_sys
        TABLES
          return        = lt_ret
        EXCEPTIONS
          error_message = 1
          OTHERS        = 2.
    ENDIF.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    add_ret2( EXPORTING it_return = lt_ret CHANGING cs_result = cs_result ).
    " F5A 009: the reference is not an interface posting (Enjoy / dialog entry).
    READ TABLE lt_ret TRANSPORTING NO FIELDS WITH KEY id = 'F5A' number = '009'.
    IF sy-subrc = 0.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'The document was entered in the FI dialog: reverse it with FB08 - the reversal interface reverses only interface postings'
               CHANGING  cs_result = cs_result ).
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
    IF iv_testrun = abap_false AND cs_result-failed = abap_false.
      IF strlen( lv_key ) >= 18.
        cs_result-doc_belnr = lv_key(10).
        cs_result-doc_bukrs = lv_key+10(4).
        cs_result-doc_gjahr = lv_key+14(4).
        lv_text = |Reversal document { alpha_out( cs_result-doc_belnr ) } posted in company code { cs_result-doc_bukrs }, fiscal year { cs_result-doc_gjahr }|.
        cs_result-summary = lv_text.
        add_msg( EXPORTING iv_type = 'S' iv_text = lv_text CHANGING cs_result = cs_result ).
      ELSE.
        add_msg( EXPORTING iv_type = 'W' iv_text = 'The reversal returned no document number: check the document before repeating it'
                 CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = iv_testrun CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD prepare_item.
    DATA: lv_bukrs TYPE bkpf-bukrs,
          lv_belnr TYPE bkpf-belnr,
          lv_gjahr TYPE bkpf-gjahr,
          lv_buzei TYPE bseg-buzei,
          lv_ok    TYPE abap_bool,
          lv_found TYPE abap_bool,
          lt_bseg  TYPE ty_bseg,
          lv_key   TYPE t008-zahls,
          lv_text  TYPE string,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change.

    CLEAR: es_bkpf, es_bseg.
    doc_key( EXPORTING is_params = is_params
             IMPORTING ev_bukrs = lv_bukrs ev_belnr = lv_belnr ev_gjahr = lv_gjahr ev_ok = lv_ok
             CHANGING  cs_result = cs_result ).
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.
    IF is_params-buzei IS INITIAL OR strlen( is_params-buzei ) > 3 OR is_params-buzei CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'buzei is required (line item number, up to 3 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_buzei = is_params-buzei.
    IF auth_buk( iv_bukrs = lv_bukrs iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to change documents of company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    read_doc( EXPORTING iv_bukrs = lv_bukrs iv_belnr = lv_belnr iv_gjahr = lv_gjahr
              IMPORTING es_bkpf = es_bkpf et_bseg = lt_bseg ev_found = lv_found ).
    IF lv_found = abap_false.
      lv_text = missing_text( iv_bukrs = lv_bukrs iv_belnr = lv_belnr iv_gjahr = lv_gjahr ).
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF auth_bla( iv_blart = es_bkpf-blart iv_actvt = '02' ) = abap_false.
      lv_text = |No authorization to change document type { es_bkpf-blart }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF es_bkpf-bstat IS NOT INITIAL.
      lv_text = |Document { alpha_out( lv_belnr ) } is not a normal posted document (status { es_bkpf-bstat })|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    READ TABLE lt_bseg INTO es_bseg WITH KEY buzei = lv_buzei.
    IF sy-subrc <> 0.
      lv_text = |Line { lv_buzei } not found in document { alpha_out( lv_belnr ) }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.

    IF iv_action = 'FI.ITEM.SET_PAYMENT_BLOCK'.
      IF es_bseg-koart <> 'K' AND es_bseg-koart <> 'D'.
        lv_text = |Line { lv_buzei } is not a vendor or customer line (account type { es_bseg-koart }): it has no payment block|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF es_bseg-augbl IS NOT INITIAL.
        lv_text = |Line { lv_buzei } is already cleared (clearing document { alpha_out( es_bseg-augbl ) })|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF is_params-block_key IS INITIAL OR strlen( is_params-block_key ) > 1.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'block_key is required: a payment block key (1 character) or - to remove the block'
                 CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF is_params-block_key <> '-'.
        lv_key = to_upper( is_params-block_key ).
        SELECT SINGLE zahls FROM t008 INTO lv_key WHERE zahls = lv_key.
        IF sy-subrc <> 0.
          lv_text = |Payment block key { is_params-block_key } is not defined|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        IF lv_key = es_bseg-zlspr.
          lv_text = |Line { lv_buzei } already has payment block { lv_key }: nothing to change|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
        ls_chg-new_value = lv_key.
      ELSE.
        IF es_bseg-zlspr IS INITIAL.
          lv_text = |Line { lv_buzei } has no payment block: nothing to change|.
          add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
          RETURN.
        ENDIF.
      ENDIF.
      ls_chg-field     = 'BSEG-ZLSPR'.
      ls_chg-old_value = es_bseg-zlspr.
      APPEND ls_chg TO cs_result-changes.
    ELSE.
      " Clearing a line text is not offered: an empty text is refused.
      IF is_params-text IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'text is required: clearing a line text is not offered'
                 CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF strlen( is_params-text ) > 50.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'text is longer than 50 characters (line item text)'
                 CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      IF is_params-text = es_bseg-sgtxt.
        lv_text = |Line { lv_buzei } already has this text: nothing to change|.
        add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
        RETURN.
      ENDIF.
      ls_chg-field     = 'BSEG-SGTXT'.
      ls_chg-old_value = es_bseg-sgtxt.
      ls_chg-new_value = is_params-text.
      APPEND ls_chg TO cs_result-changes.
    ENDIF.
    lv_text = |Document { alpha_out( lv_belnr ) } { lv_gjahr }, line { lv_buzei }|.
    cs_result-summary = lv_text.
  ENDMETHOD.


  METHOD call_block.
    DATA: ls_bseg   TYPE bseg,
          lt_buz    TYPE tpit_t_buztab,
          ls_buz    TYPE tpit_buztab,
          lt_fld    TYPE tpit_t_fname,
          ls_fld    TYPE tpit_fname,
          lt_err    TYPE tpit_t_errdoc,
          ls_err    TYPE tpit_errdoc,
          lv_text   TYPE string,
          lv_now    TYPE bseg-zlspr,
          ls_msg    TYPE zif_mcp_biz_action=>ty_message.

    CLEAR ls_bseg.
    IF is_params-block_key <> '-'.
      ls_bseg-zlspr = to_upper( is_params-block_key ).
    ENDIF.
    ls_buz-bukrs = is_bseg-bukrs.
    ls_buz-belnr = is_bseg-belnr.
    ls_buz-gjahr = is_bseg-gjahr.
    ls_buz-buzei = is_bseg-buzei.
    ls_buz-koart = is_bseg-koart.
    ls_buz-umskz = is_bseg-umskz.
    ls_buz-bschl = is_bseg-bschl.
    ls_buz-bstat = is_bkpf-bstat.
    APPEND ls_buz TO lt_buz.
    ls_fld-fname = 'ZLSPR'.
    ls_fld-aenkz = 'X'.
    APPEND ls_fld TO lt_fld.

    CALL FUNCTION 'FI_ITEMS_MASS_CHANGE'
      EXPORTING
        s_bseg     = ls_bseg
      IMPORTING
        errtab     = lt_err
      TABLES
        it_buztab  = lt_buz
        it_fldtab  = lt_fld
      EXCEPTIONS
        bdc_errors = 1
        OTHERS     = 2.
    IF sy-subrc <> 0.
      LOOP AT lt_err INTO ls_err.
        CLEAR ls_msg.
        ls_msg-type    = 'E'.
        ls_msg-message = err_text( ls_err-err ).
        APPEND ls_msg TO cs_result-messages.
      ENDLOOP.
      IF lt_err IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'FB02 (batch input) reported an error without a message'
                 CHANGING cs_result = cs_result ).
      ENDIF.
    ENDIF.
    finish( CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    " FB02 runs as batch input with its own update: wait for it and read the line back
    " before answering (never report success before the value is in BSEG).
    COMMIT WORK AND WAIT.
    DO 15 TIMES.
      SELECT SINGLE zlspr FROM bseg INTO lv_now
        WHERE bukrs = is_bseg-bukrs AND belnr = is_bseg-belnr
          AND gjahr = is_bseg-gjahr AND buzei = is_bseg-buzei.
      IF lv_now = ls_bseg-zlspr.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_now <> ls_bseg-zlspr.
      lv_text = |Payment block of line { is_bseg-buzei } not applied after 15 s: BSEG-ZLSPR is '{ lv_now }', requested '{ ls_bseg-zlspr }' (the FB02 update may have failed or still run: check FB03 / SM13)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      finish( CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_text = |Payment block of line { is_bseg-buzei } is now '{ lv_now }' (read back; set through FB02, all document-change validations ran)|.
    add_msg( EXPORTING iv_type = 'S' iv_text = lv_text CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD call_text.
    DATA: lt_chg   TYPE STANDARD TABLE OF accchg,
          ls_chg   TYPE accchg,
          lv_bukrs TYPE bukrs,
          lv_belnr TYPE belnr_d,
          lv_gjahr TYPE gjahr,
          lv_buzei TYPE bseg-buzei,
          lv_want  TYPE bseg-sgtxt,
          lv_now   TYPE bseg-sgtxt,
          lv_text  TYPE string.

    ls_chg-fdname = 'SGTXT'.
    ls_chg-newval = is_params-text.
    APPEND ls_chg TO lt_chg.
    lv_bukrs = is_bseg-bukrs.
    lv_belnr = is_bseg-belnr.
    lv_gjahr = is_bseg-gjahr.
    lv_buzei = is_bseg-buzei.

    CALL FUNCTION 'FI_DOCUMENT_CHANGE'
      EXPORTING
        i_bukrs              = lv_bukrs
        i_belnr              = lv_belnr
        i_gjahr              = lv_gjahr
        i_buzei              = lv_buzei
      TABLES
        t_accchg             = lt_chg
      EXCEPTIONS
        no_reference         = 1
        no_document          = 2
        many_documents       = 3
        wrong_input          = 4
        overwrite_creditcard = 5
        error_message        = 6
        OTHERS               = 7.
    IF sy-subrc <> 0.
      add_sy_msg( CHANGING cs_result = cs_result ).
    ENDIF.
    commit_or_rollback( EXPORTING iv_testrun = abap_false CHANGING cs_result = cs_result ).
    IF cs_result-failed = abap_true.
      RETURN.
    ENDIF.
    " Read the line back before answering.
    lv_want = is_params-text.
    DO 10 TIMES.
      SELECT SINGLE sgtxt FROM bseg INTO lv_now
        WHERE bukrs = lv_bukrs AND belnr = lv_belnr AND gjahr = lv_gjahr AND buzei = lv_buzei.
      IF lv_now = lv_want.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_now <> lv_want.
      lv_text = |Text of line { is_bseg-buzei } not applied after 10 s: BSEG-SGTXT is '{ lv_now }'|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      finish( CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    " S/4: the Universal Journal must carry the same text (ECC: reads BSEG again).
    lv_now = zcl_mcp_biz_sys=>get( )->fi_ledger_text( iv_bukrs = lv_bukrs iv_belnr = lv_belnr
                                                      iv_gjahr = lv_gjahr iv_buzei = lv_buzei ).
    IF lv_now <> lv_want.
      lv_text = |Text of line { is_bseg-buzei } is in BSEG but not in the ledger (ACDOCA-SGTXT '{ lv_now }')|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      finish( CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_text = |Line { is_bseg-buzei } text changed and read back (FI_DOCUMENT_CHANGE: the document-change validations were not run)|.
    add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = cs_result ).
  ENDMETHOD.


  METHOD read_doc.
    DATA lt_bkpf TYPE ty_bkpf.

    CLEAR: es_bkpf, et_bseg, ev_found.
    CALL FUNCTION 'FI_DOCUMENT_READ'
      EXPORTING
        i_bukrs     = iv_bukrs
        i_belnr     = iv_belnr
        i_gjahr     = iv_gjahr
      TABLES
        t_bkpf      = lt_bkpf
        t_bseg      = et_bseg
      EXCEPTIONS
        wrong_input = 1
        not_found   = 2
        OTHERS      = 3.
    IF sy-subrc <> 0.
      CLEAR et_bseg.
      RETURN.
    ENDIF.
    READ TABLE lt_bkpf INTO es_bkpf INDEX 1.
    IF sy-subrc = 0.
      ev_found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD doc_key.
    CLEAR: ev_bukrs, ev_belnr, ev_gjahr, ev_ok.
    IF is_params-bukrs IS INITIAL OR strlen( is_params-bukrs ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code, 4 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_belnr = to_belnr( is_params-belnr ).
    IF ev_belnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'belnr is required (document number, up to 10 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF is_params-gjahr IS INITIAL OR strlen( is_params-gjahr ) <> 4 OR is_params-gjahr CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'gjahr is required (fiscal year, 4 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_bukrs = to_upper( is_params-bukrs ).
    ev_gjahr = is_params-gjahr.
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD auth_buk.
    AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
      ID 'BUKRS' FIELD iv_bukrs
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_bla.
    DATA lv_brgru TYPE t003-brgru.

    SELECT SINGLE brgru FROM t003 INTO lv_brgru WHERE blart = iv_blart.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'F_BKPF_BLA'
      ID 'BRGRU' FIELD lv_brgru
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_koa.
    AUTHORITY-CHECK OBJECT 'F_BKPF_KOA'
      ID 'KOART' FIELD iv_koart
      ID 'ACTVT' FIELD iv_actvt.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD parse_line.
    DATA: lt_pairs TYPE string_table,
          lv_pair  TYPE string,
          lv_off   TYPE i,
          lv_pos   TYPE i,
          lv_name  TYPE string,
          lv_value TYPE string,
          lv_amt   TYPE abap_bool,
          lv_have  TYPE abap_bool.

    CLEAR: es_line, ev_ok, ev_error.
    SPLIT iv_line AT ';' INTO TABLE lt_pairs.
    LOOP AT lt_pairs INTO lv_pair.
      IF lv_pair IS INITIAL.
        CONTINUE.
      ENDIF.
      lv_off = find( val = lv_pair sub = '=' ).
      IF lv_off < 1.
        ev_error = |"{ lv_pair }" is not name=value|.
        RETURN.
      ENDIF.
      lv_name  = to_lower( substring( val = lv_pair len = lv_off ) ).
      lv_pos   = lv_off + 1.
      lv_value = decode( substring( val = lv_pair off = lv_pos ) ).
      CASE lv_name.
        WHEN 'account'.
          es_line-account = to_hkont( lv_value ).
        WHEN 'amount'.
          to_amount( EXPORTING iv_value = lv_value IMPORTING ev_amount = es_line-amount ev_ok = lv_amt ).
          IF lv_amt = abap_false.
            ev_error = |amount "{ lv_value }" is not a number|.
            RETURN.
          ENDIF.
          lv_have = abap_true.
        WHEN 'cost_center'.
          es_line-cost_center = alpha_in( iv_value = to_upper( lv_value ) iv_length = 10 ).
        WHEN 'order'.
          es_line-order_id = alpha_in( iv_value = to_upper( lv_value ) iv_length = 12 ).
        WHEN 'profit_center'.
          es_line-profit_center = alpha_in( iv_value = to_upper( lv_value ) iv_length = 10 ).
        WHEN 'text'.
          es_line-text = lv_value.
        WHEN 'tax_code'.
          es_line-tax_code = to_upper( lv_value ).
        WHEN 'business_area'.
          es_line-business_area = to_upper( lv_value ).
        WHEN 'assignment'.
          es_line-assignment = lv_value.
        WHEN OTHERS.
          ev_error = |unknown line field "{ lv_name }"|.
          RETURN.
      ENDCASE.
    ENDLOOP.
    IF es_line-account IS INITIAL.
      ev_error = 'account is required'.
      RETURN.
    ENDIF.
    IF lv_have = abap_false.
      ev_error = 'amount is required'.
      RETURN.
    ENDIF.
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD ext_amount.
    DATA lv_dec TYPE tcurx-currdec.

    rv_amount = iv_amount.
    SELECT SINGLE currdec FROM tcurx INTO lv_dec WHERE currkey = iv_waers.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    " Internal format: two decimals for every currency. Currencies without decimals (KRW, JPY)
    " are stored divided by 100, three-decimal currencies multiplied by 10.
    IF lv_dec = 0.
      rv_amount = iv_amount * 100.
    ELSEIF lv_dec = 3.
      rv_amount = iv_amount / 10.
    ENDIF.
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


  METHOD to_rate.
    DATA lv_text TYPE string.

    CLEAR: ev_rate, ev_ok.
    lv_text = iv_value.
    CONDENSE lv_text NO-GAPS.
    IF lv_text IS INITIAL OR lv_text CN '0123456789.'.
      RETURN.
    ENDIF.
    TRY.
        ev_rate = lv_text.
        ev_ok   = abap_true.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_overflow.
        CLEAR ev_rate.
    ENDTRY.
  ENDMETHOD.


  METHOD err_text.
    DATA: lv_id TYPE sy-msgid,
          lv_no TYPE sy-msgno,
          lv_v1 TYPE sy-msgv1,
          lv_v2 TYPE sy-msgv2,
          lv_v3 TYPE sy-msgv3,
          lv_v4 TYPE sy-msgv4.
    FIELD-SYMBOLS <lv_f> TYPE any.

    ASSIGN COMPONENT 'MSGID' OF STRUCTURE is_err TO <lv_f>.
    IF sy-subrc = 0.
      lv_id = <lv_f>.
    ENDIF.
    ASSIGN COMPONENT 'MSGNR' OF STRUCTURE is_err TO <lv_f>.
    IF sy-subrc = 0.
      lv_no = <lv_f>.
    ENDIF.
    ASSIGN COMPONENT 'MSGV1' OF STRUCTURE is_err TO <lv_f>.
    IF sy-subrc = 0.
      lv_v1 = <lv_f>.
    ENDIF.
    ASSIGN COMPONENT 'MSGV2' OF STRUCTURE is_err TO <lv_f>.
    IF sy-subrc = 0.
      lv_v2 = <lv_f>.
    ENDIF.
    ASSIGN COMPONENT 'MSGV3' OF STRUCTURE is_err TO <lv_f>.
    IF sy-subrc = 0.
      lv_v3 = <lv_f>.
    ENDIF.
    ASSIGN COMPONENT 'MSGV4' OF STRUCTURE is_err TO <lv_f>.
    IF sy-subrc = 0.
      lv_v4 = <lv_f>.
    ENDIF.
    IF lv_id IS INITIAL.
      rv_text = 'FB02 batch input reported an error'.
      RETURN.
    ENDIF.
    MESSAGE ID lv_id TYPE 'E' NUMBER lv_no WITH lv_v1 lv_v2 lv_v3 lv_v4 INTO rv_text.
  ENDMETHOD.


  METHOD to_belnr.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10 OR iv_value CN '0123456789 '.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = rv_belnr.
  ENDMETHOD.


  METHOD missing_text.
    " Why FI_DOCUMENT_READ found nothing: a parked, noted or sample document has a
    " header but is not a posted document.
    DATA lv_bstat TYPE bkpf-bstat.

    SELECT SINGLE bstat FROM bkpf INTO lv_bstat
      WHERE bukrs = iv_bukrs AND belnr = iv_belnr AND gjahr = iv_gjahr.
    IF sy-subrc <> 0.
      rv_text = |Document { alpha_out( iv_belnr ) } { iv_gjahr } not found in company code { iv_bukrs }|.
      RETURN.
    ENDIF.
    CASE lv_bstat.
      WHEN 'V' OR 'W'.
        rv_text = |Document { alpha_out( iv_belnr ) } { iv_gjahr } is parked, not posted: post or delete the parked document in FBV0 first|.
      WHEN 'D'.
        rv_text = |Document { alpha_out( iv_belnr ) } { iv_gjahr } is a recurring entry original document, not a posting|.
      WHEN 'M'.
        rv_text = |Document { alpha_out( iv_belnr ) } { iv_gjahr } is a sample document, not a posting|.
      WHEN 'S'.
        rv_text = |Document { alpha_out( iv_belnr ) } { iv_gjahr } is a noted item, not a posting|.
      WHEN OTHERS.
        rv_text = |Document { alpha_out( iv_belnr ) } { iv_gjahr } could not be read (status { lv_bstat })|.
    ENDCASE.
  ENDMETHOD.


  METHOD alpha_in.
    " Numeric keys get their leading zeros (order 11000180 -> 000011000180);
    " other values stay as given.
    DATA lv_in TYPE c LENGTH 12.

    rv_value = iv_value.
    IF iv_value IS INITIAL OR strlen( iv_value ) > iv_length OR iv_value CN '0123456789'.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    SHIFT lv_in RIGHT DELETING TRAILING space.
    OVERLAY lv_in WITH '000000000000'.
    rv_value = substring( val = lv_in off = 12 - iv_length len = iv_length ).
  ENDMETHOD.


  METHOD to_hkont.
    DATA lv_in TYPE c LENGTH 10.

    IF iv_value IS INITIAL OR strlen( iv_value ) > 10 OR iv_value CN '0123456789 '.
      RETURN.
    ENDIF.
    lv_in = iv_value.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_in
      IMPORTING output = rv_hkont.
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


  METHOD period_status.
    " Open posting periods of a company code for a posting date (T001B of the posting period variant).
    TYPES: BEGIN OF ty_p,
             mkoar TYPE t001b-mkoar,
             bkont TYPE t001b-bkont,
             vkont TYPE t001b-vkont,
             frye1 TYPE t001b-frye1,
             frpe1 TYPE t001b-frpe1,
             toye1 TYPE t001b-toye1,
             tope1 TYPE t001b-tope1,
             frye2 TYPE t001b-frye2,
             frpe2 TYPE t001b-frpe2,
             toye2 TYPE t001b-toye2,
             tope2 TYPE t001b-tope2,
           END OF ty_p,
           BEGIN OF ty_o,
             mkoar     TYPE t001b-mkoar,
             bkont     TYPE t001b-bkont,
             vkont     TYPE t001b-vkont,
             interval1 TYPE string,
             interval2 TYPE string,
             open      TYPE string,
           END OF ty_o.
    DATA: lv_bukrs  TYPE t001-bukrs,
          lv_opvar  TYPE t001-opvar,
          lv_date   TYPE sy-datum,
          lv_gjahr  TYPE bkpf-gjahr,
          lv_monat  TYPE bkpf-monat,
          lv_poper  TYPE t009b-poper,
          lv_key    TYPE i,
          lv_f      TYPE i,
          lv_t      TYPE i,
          ls_p      TYPE ty_p,
          lt_p      TYPE STANDARD TABLE OF ty_p,
          ls_o      TYPE ty_o,
          lv_row    TYPE i,
          lv_open   TYPE string,
          lv_closed TYPE string,
          lv_text   TYPE string.

    lv_bukrs = to_upper( is_params-bukrs ).
    IF lv_bukrs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'bukrs is required (company code)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-posting_date IS INITIAL.
      lv_date = sy-datum.
    ELSE.
      lv_date = to_date( is_params-posting_date ).
      IF lv_date IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a valid date (YYYY-MM-DD)'
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF auth_buk( iv_bukrs = lv_bukrs iv_actvt = '03' ) = abap_false.
      lv_text = |No authorization for company code { lv_bukrs }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE opvar FROM t001 INTO lv_opvar WHERE bukrs = lv_bukrs.
    IF sy-subrc <> 0.
      lv_text = |Company code { lv_bukrs } does not exist|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'FI_PERIOD_DETERMINE'
      EXPORTING
        i_budat = lv_date
        i_bukrs = lv_bukrs
      IMPORTING
        e_gjahr = lv_gjahr
        e_monat = lv_monat
        e_poper = lv_poper
      EXCEPTIONS
        OTHERS  = 1.
    IF sy-subrc <> 0.
      lv_text = |No fiscal period for { lv_date DATE = ISO } in company code { lv_bukrs } (fiscal year variant)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_key = lv_gjahr * 1000 + lv_poper.
    SELECT mkoar bkont vkont frye1 frpe1 toye1 tope1 frye2 frpe2 toye2 tope2
      FROM t001b INTO TABLE lt_p WHERE rrcty = '0' AND bukrs = lv_opvar.
    LOOP AT lt_p INTO ls_p.
      CLEAR ls_o.
      ls_o-mkoar = ls_p-mkoar.
      ls_o-bkont = ls_p-bkont.
      ls_o-vkont = ls_p-vkont.
      ls_o-interval1 = |{ ls_p-frpe1 }/{ ls_p-frye1 } - { ls_p-tope1 }/{ ls_p-toye1 }|.
      ls_o-interval2 = |{ ls_p-frpe2 }/{ ls_p-frye2 } - { ls_p-tope2 }/{ ls_p-toye2 }|.
      ls_o-open = 'NO'.
      lv_f = ls_p-frye1 * 1000 + ls_p-frpe1.
      lv_t = ls_p-toye1 * 1000 + ls_p-tope1.
      IF lv_key >= lv_f AND lv_key <= lv_t.
        ls_o-open = 'YES'.
      ENDIF.
      lv_f = ls_p-frye2 * 1000 + ls_p-frpe2.
      lv_t = ls_p-toye2 * 1000 + ls_p-tope2.
      IF lv_key >= lv_f AND lv_key <= lv_t AND lv_t > 0.
        ls_o-open = 'YES'.
      ENDIF.
      lv_row = lv_row + 1.
      add_rows( EXPORTING is_data = ls_o iv_row = lv_row CHANGING ct_rows = rs_result-rows ).
      IF ls_p-bkont IS INITIAL AND ls_p-vkont IS INITIAL.
        lv_text = ls_p-mkoar.
      ELSE.
        lv_text = |{ ls_p-mkoar } { ls_p-vkont }-{ ls_p-bkont }|.
      ENDIF.
      IF ls_o-open = 'YES'.
        lv_open = |{ lv_open }, { lv_text }|.
      ELSE.
        lv_closed = |{ lv_closed }, { lv_text }|.
      ENDIF.
    ENDLOOP.
    SHIFT lv_open LEFT BY 2 PLACES.
    SHIFT lv_closed LEFT BY 2 PLACES.
    IF lv_open IS INITIAL.
      lv_open = 'none'.
    ENDIF.
    IF lv_closed IS INITIAL.
      lv_closed = 'none'.
    ENDIF.
    rs_result-summary = |{ lv_date DATE = ISO } is period { lv_poper }/{ lv_gjahr } of company code { lv_bukrs } |
                     && |(variant { lv_opvar }). Open for account types: { lv_open }. Closed: { lv_closed }|.
  ENDMETHOD.


  METHOD credit_status.
    " Credit limit, exposure and block of a customer in the credit control area of a company code.
    " Read by the system family (ZIF_MCP_BIZ_SYS): ECC KNKK + S066 / S067, S/4 FSCM Credit Management.
    " No name or address data.
    TYPES: BEGIN OF ty_c.
             INCLUDE TYPE zif_mcp_biz_sys=>ty_credit.
    TYPES:   used_pct TYPE p LENGTH 8 DECIMALS 1,
           END OF ty_c.
    DATA: lv_kunnr  TYPE knkk-kunnr,
          lv_bukrs  TYPE t001-bukrs,
          lv_kkber  TYPE t001-kkber,
          ls_credit TYPE zif_mcp_biz_sys=>ty_credit,
          ls_c      TYPE ty_c,
          lv_found  TYPE abap_bool,
          lv_denied TYPE abap_bool,
          lv_block  TYPE string,
          lv_scope  TYPE string,
          lv_text   TYPE string.

    lv_bukrs = to_upper( is_params-bukrs ).
    IF is_params-kunnr IS INITIAL OR lv_bukrs IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kunnr and bukrs are required (customer, company code)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_kunnr = to_upper( is_params-kunnr ).
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = lv_kunnr
      IMPORTING output = lv_kunnr.
    SELECT SINGLE kkber FROM t001 INTO lv_kkber WHERE bukrs = lv_bukrs.
    IF sy-subrc <> 0 OR lv_kkber IS INITIAL.
      lv_text = |Company code { lv_bukrs } has no credit control area|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    zcl_mcp_biz_sys=>get( )->credit_read( EXPORTING iv_kunnr  = lv_kunnr
                                                    iv_kkber  = lv_kkber
                                          IMPORTING es_credit = ls_credit
                                                    ev_found  = lv_found
                                                    ev_denied = lv_denied
                                                    ev_text   = lv_text ).
    IF lv_denied = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    MOVE-CORRESPONDING ls_credit TO ls_c.
    IF ls_c-klimk > 0.
      ls_c-used_pct = ls_c-exposure * 100 / ls_c-klimk.
    ENDIF.
    add_rows( EXPORTING is_data = ls_c iv_row = 1 CHANGING ct_rows = rs_result-rows ).
    IF ls_c-crblb IS NOT INITIAL.
      lv_block = ', blocked in credit management'.
    ENDIF.
    IF ls_c-segment IS NOT INITIAL.
      lv_scope = |credit segment { ls_c-segment }|.
    ELSE.
      lv_scope = |credit control area { lv_kkber }|.
    ENDIF.
    rs_result-summary = |Customer { is_params-kunnr }, { lv_scope }: limit { ls_c-klimk } { ls_c-waers }, |
                     && |exposure { ls_c-exposure } ({ ls_c-used_pct } %), risk category { ls_c-ctlpc }{ lv_block }|.
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
