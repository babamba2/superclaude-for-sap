CLASS zcl_mcp_biz_out DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Business actions on document output (configs/OUT/actions.json). Written in 7.31 syntax.
*
* OUT.DOC.STATUS  (query)  output of a purchase order (PO), sales order (SO), delivery (DLV)
*                          or billing document (BIL): message records (NAST) on every system,
*                          plus S/4 Output Control requests (ZIF_MCP_BIZ_SYS~output_requests).
* OUT.DOC.REISSUE (write)  repeat the last PRINT message record of one output type (NAST):
*                          RV_MESSAGE_UPDATE_SINGLE + WFMC_MESSAGE_SINGLE, read back the status.
*                          Refused on S/4HANA (decision 2026-11-10) and for every medium other
*                          than print (1): e-mail, fax, EDI, ALE and special functions are never sent.
* Reads: NAST, EKKO, VBAK, LIKP, VBRK (document authorization), TNAPR. No partner names.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_doc,
        category TYPE string,
        kappl    TYPE nast-kappl,
        objky    TYPE nast-objky,
        apoc     TYPE string,
        number   TYPE vbak-vbeln,
      END OF ty_doc.

    METHODS read_doc
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
                iv_actvt  TYPE activ_auth
      EXPORTING es_doc    TYPE ty_doc
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS reissue
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS medium_text
      IMPORTING iv_nacha       TYPE nast-nacha
      RETURNING VALUE(rv_text) TYPE string.

    METHODS state_text
      IMPORTING iv_vstat       TYPE nast-vstat
      RETURNING VALUE(rv_text) TYPE string.

    METHODS add_kv
      IMPORTING iv_row   TYPE i
                iv_name  TYPE string
                iv_value TYPE any
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.

    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.


CLASS zcl_mcp_biz_out IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/OUT/actions.json.
    ls_def-id = 'OUT.DOC.STATUS'. ls_def-kind = 'query'. ls_def-risk = 'none'.
    APPEND ls_def TO rt_actions.
    ls_def-id = 'OUT.DOC.REISSUE'. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    IF iv_action = 'OUT.DOC.STATUS'.
      rs_result = status( is_params ).
    ELSE.
      add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a query action|
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-action = iv_action.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    IF iv_action = 'OUT.DOC.REISSUE'.
      rs_result = reissue( is_params = is_params iv_execute = abap_false ).
    ELSE.
      add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a write action|
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-action = iv_action.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    IF iv_action = 'OUT.DOC.REISSUE'.
      rs_result = reissue( is_params = is_params iv_execute = abap_true ).
    ELSE.
      add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a write action|
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-action = iv_action.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD read_doc.
    DATA: lv_cat   TYPE string,
          lv_in    TYPE string,
          lv_ekorg TYPE ekko-ekorg,
          lv_vkorg TYPE vbak-vkorg,
          lv_vtweg TYPE vbak-vtweg,
          lv_spart TYPE vbak-spart,
          lv_vstel TYPE likp-vstel,
          lv_text  TYPE string.

    CLEAR es_doc.
    lv_cat = to_upper( is_params-doc_category ).
    IF lv_cat = 'PO'.
      lv_in = is_params-ebeln.
    ELSE.
      lv_in = is_params-vbeln.
    ENDIF.
    IF lv_cat <> 'PO' AND lv_cat <> 'SO' AND lv_cat <> 'DLV' AND lv_cat <> 'BIL'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'doc_category is required: PO, SO, DLV or BIL'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    IF lv_in IS INITIAL OR strlen( lv_in ) > 10 OR lv_in CN '0123456789'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'document number is required: ebeln for PO, vbeln otherwise (digits, up to 10)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    es_doc-category = lv_cat.
    es_doc-number = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = es_doc-number
      IMPORTING output = es_doc-number.
    es_doc-objky = es_doc-number.

    CASE lv_cat.
      WHEN 'PO'.
        es_doc-kappl = 'EF'.
        es_doc-apoc  = 'PURCHASE_ORDER'.
        SELECT SINGLE ekorg FROM ekko INTO lv_ekorg WHERE ebeln = es_doc-number.
        IF sy-subrc = 0.
          AUTHORITY-CHECK OBJECT 'M_BEST_EKO' ID 'EKORG' FIELD lv_ekorg ID 'ACTVT' FIELD iv_actvt.
        ENDIF.
      WHEN 'SO'.
        es_doc-kappl = 'V1'.
        es_doc-apoc  = 'SALES_DOCUMENT'.
        SELECT SINGLE vkorg vtweg spart FROM vbak INTO (lv_vkorg, lv_vtweg, lv_spart) WHERE vbeln = es_doc-number.
        IF sy-subrc = 0.
          AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'VKORG' FIELD lv_vkorg ID 'VTWEG' FIELD lv_vtweg
                                              ID 'SPART' FIELD lv_spart ID 'ACTVT' FIELD iv_actvt.
        ENDIF.
      WHEN 'DLV'.
        es_doc-kappl = 'V2'.
        SELECT SINGLE vstel FROM likp INTO lv_vstel WHERE vbeln = es_doc-number.
        IF sy-subrc = 0.
          AUTHORITY-CHECK OBJECT 'V_LIKP_VST' ID 'VSTEL' FIELD lv_vstel ID 'ACTVT' FIELD iv_actvt.
        ENDIF.
      WHEN 'BIL'.
        es_doc-kappl = 'V3'.
        es_doc-apoc  = 'BILLING_DOCUMENT'.
        SELECT SINGLE vkorg FROM vbrk INTO lv_vkorg WHERE vbeln = es_doc-number.
        IF sy-subrc = 0.
          AUTHORITY-CHECK OBJECT 'V_VBRK_VKO' ID 'VKORG' FIELD lv_vkorg ID 'ACTVT' FIELD iv_actvt.
        ENDIF.
    ENDCASE.
    IF sy-subrc <> 0.
      lv_text = |No authorization for { lv_cat } { lv_in } (or the document does not exist)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = cs_result ).
      CLEAR es_doc.
    ENDIF.
  ENDMETHOD.


  METHOD status.
    TYPES: BEGIN OF ty_n,
             kschl TYPE nast-kschl,
             nacha TYPE nast-nacha,
             parvw TYPE nast-parvw,
             erdat TYPE nast-erdat,
             eruhr TYPE nast-eruhr,
             datvr TYPE nast-datvr,
             uhrvr TYPE nast-uhrvr,
             vstat TYPE nast-vstat,
             ldest TYPE nast-ldest,
           END OF ty_n.
    DATA: ls_doc    TYPE ty_doc,
          lt_n      TYPE STANDARD TABLE OF ty_n,
          ls_n      TYPE ty_n,
          lt_out    TYPE zif_mcp_biz_sys=>ty_outputs,
          ls_out    TYPE zif_mcp_biz_sys=>ty_output,
          lv_active TYPE abap_bool,
          lv_obj_id TYPE string,
          lv_row    TYPE i,
          lv_text   TYPE string.

    read_doc( EXPORTING is_params = is_params iv_actvt = '03'
              IMPORTING es_doc = ls_doc CHANGING cs_result = rs_result ).
    IF ls_doc IS INITIAL.
      RETURN.
    ENDIF.

    SELECT kschl nacha parvw erdat eruhr datvr uhrvr vstat ldest FROM nast INTO TABLE lt_n
      WHERE kappl = ls_doc-kappl AND objky = ls_doc-objky
      ORDER BY erdat DESCENDING eruhr DESCENDING.
    LOOP AT lt_n INTO ls_n.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'SOURCE'      iv_value = 'NAST'       CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OUTPUT_TYPE' iv_value = ls_n-kschl   CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MEDIUM'      iv_value = medium_text( ls_n-nacha ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PARTNER_FUNCTION' iv_value = ls_n-parvw CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'      iv_value = state_text( ls_n-vstat ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED'     iv_value = |{ ls_n-erdat } { ls_n-eruhr }| CHANGING ct_rows = rs_result-rows ).
      IF ls_n-datvr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PROCESSED' iv_value = |{ ls_n-datvr } { ls_n-uhrvr }| CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'DEVICE'      iv_value = ls_n-ldest   CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.

    IF ls_doc-apoc IS NOT INITIAL.
      lv_obj_id = ls_doc-number.
      zcl_mcp_biz_sys=>get( )->output_requests( EXPORTING iv_object_type = ls_doc-apoc iv_object_id = lv_obj_id
                                                IMPORTING et_out = lt_out ev_active = lv_active ).
      LOOP AT lt_out INTO ls_out.
        lv_row = lv_row + 1.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'SOURCE'      iv_value = 'OUTPUT_CONTROL'   CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'OUTPUT_TYPE' iv_value = ls_out-output_type CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'MEDIUM'      iv_value = ls_out-channel     CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'      iv_value = ls_out-status      CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'FORM'        iv_value = ls_out-form        CHANGING ct_rows = rs_result-rows ).
        IF ls_out-changed IS NOT INITIAL.
          add_kv( EXPORTING iv_row = lv_row iv_name = 'CHANGED'     iv_value = ls_out-changed     CHANGING ct_rows = rs_result-rows ).
        ENDIF.
      ENDLOOP.
    ENDIF.

    lv_text = |{ ls_doc-category } { ls_doc-number }: { lines( lt_n ) } message records (NAST)|.
    IF lv_active = abap_true.
      lv_text = |{ lv_text }, { lines( lt_out ) } Output Control outputs (Output Control is active for this document type)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD reissue.
    DATA: ls_doc   TYPE ty_doc,
          lv_kschl TYPE nast-kschl,
          ls_old   TYPE nast,
          ls_new   TYPE nast,
          lv_prog  TYPE tnapr-pgnam,
          lv_rc    TYPE sy-subrc,
          lv_vstat TYPE nast-vstat,
          ls_chg   TYPE zif_mcp_biz_action=>ty_change,
          lv_text  TYPE string.

    " Decision 2026-11-10: re-issue only on ECC (S/4: read only).
    IF zcl_mcp_biz_sys=>get( )->family( ) = zif_mcp_biz_sys=>c_family_s4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Re-issuing output is not offered on S/4HANA: use OUT.DOC.STATUS to read it'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    read_doc( EXPORTING is_params = is_params iv_actvt = '03'
              IMPORTING es_doc = ls_doc CHANGING cs_result = rs_result ).
    IF ls_doc IS INITIAL.
      RETURN.
    ENDIF.
    lv_kschl = to_upper( is_params-kschl ).
    IF lv_kschl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kschl is required (output type to re-issue)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    " The last record of this output type is the one that is repeated.
    SELECT * FROM nast INTO ls_old UP TO 1 ROWS
      WHERE kappl = ls_doc-kappl AND objky = ls_doc-objky AND kschl = lv_kschl
      ORDER BY erdat DESCENDING eruhr DESCENDING.
    ENDSELECT.
    IF sy-subrc <> 0.
      lv_text = |{ ls_doc-category } { ls_doc-number } has no message record of output type { lv_kschl }|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    " Never send anything outside: print only.
    IF ls_old-nacha <> '1'.
      lv_text = |Output type { lv_kschl } goes out as { medium_text( ls_old-nacha ) }: only print output (medium 1) is re-issued here; | &&
                |e-mail, fax, EDI and other sending media are refused|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE pgnam FROM tnapr INTO lv_prog
      WHERE kschl = lv_kschl AND nacha = '1' AND kappl = ls_doc-kappl.
    IF sy-subrc <> 0 OR lv_prog IS INITIAL.
      lv_text = |Output type { lv_kschl } has no print program for medium 1 (TNAPR)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    ls_new = ls_old.
    ls_new-erdat = sy-datum.
    ls_new-eruhr = sy-uzeit.
    ls_new-usnam = sy-uname.
    ls_new-vstat = '0'.
    ls_new-manue = 'X'.
    CLEAR: ls_new-datvr, ls_new-uhrvr, ls_new-cmfpnr.

    ls_chg-field     = |NAST { lv_kschl } print|.
    ls_chg-old_value = |last { ls_old-erdat } { ls_old-eruhr }, { state_text( ls_old-vstat ) }|.
    ls_chg-new_value = |new print request on device { ls_new-ldest } (program { lv_prog })|.
    APPEND ls_chg TO rs_result-changes.

    IF iv_execute = abap_false.
      lv_text = |Preview: a new print request of { lv_kschl } for { ls_doc-category } { ls_doc-number } goes to device { ls_new-ldest }. | &&
                |Nothing was created.|.
      rs_result-summary = lv_text.
      RETURN.
    ENDIF.

    CALL FUNCTION 'RV_MESSAGE_UPDATE_SINGLE'
      EXPORTING msg_nast = ls_new.
    COMMIT WORK AND WAIT.
    CALL FUNCTION 'WFMC_MESSAGE_SINGLE'
      EXPORTING pi_nast  = ls_new
      IMPORTING pe_rcode = lv_rc.
    COMMIT WORK AND WAIT.
    rs_result-irreversible = abap_true.

    " Read the new record back (status 1 = processed, 2 = error).
    SELECT SINGLE vstat FROM nast INTO lv_vstat
      WHERE kappl = ls_new-kappl AND objky = ls_new-objky AND kschl = ls_new-kschl
        AND spras = ls_new-spras AND parnr = ls_new-parnr AND parvw = ls_new-parvw
        AND erdat = ls_new-erdat AND eruhr = ls_new-eruhr.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'The new message record was not found after the update'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_vstat <> '1' OR lv_rc <> 0.
      lv_text = |Print request created but not processed: status { state_text( lv_vstat ) }, return code { lv_rc } (see the processing log of the output)|.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_text CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    rs_result-summary = |{ lv_kschl } of { ls_doc-category } { ls_doc-number } printed again on device { ls_new-ldest } | &&
                        |(record { ls_new-erdat } { ls_new-eruhr }, status processed)|.
  ENDMETHOD.


  METHOD medium_text.
    CASE iv_nacha.
      WHEN '1'. rv_text = 'print'.
      WHEN '2'. rv_text = 'fax'.
      WHEN '4'. rv_text = 'telex'.
      WHEN '5'. rv_text = 'external send (e-mail)'.
      WHEN '6'. rv_text = 'EDI'.
      WHEN '7'. rv_text = 'simple mail'.
      WHEN '8'. rv_text = 'special function'.
      WHEN '9'. rv_text = 'events (workflow)'.
      WHEN 'A'. rv_text = 'distribution (ALE)'.
      WHEN OTHERS. rv_text = |medium { iv_nacha }|.
    ENDCASE.
  ENDMETHOD.


  METHOD state_text.
    CASE iv_vstat.
      WHEN '0'. rv_text = 'not processed'.
      WHEN '1'. rv_text = 'processed'.
      WHEN '2'. rv_text = 'error'.
      WHEN OTHERS. rv_text = |status { iv_vstat }|.
    ENDCASE.
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
    FIELD-SYMBOLS <ls_msg> TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT cs_result-messages ASSIGNING <ls_msg> WHERE type = 'E' OR type = 'A'.
      cs_result-failed = abap_true.
      EXIT.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
