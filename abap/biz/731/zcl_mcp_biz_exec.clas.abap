CLASS zcl_mcp_biz_exec DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_EXEC - executor behind ZMCP_BIZ_EXECUTE (business actions).
*
* Enforced here, not in the MCP server or the skill:
*   - whitelist: only action IDs a handler lists in get_actions
*   - kind: QUERY only for query actions, PREVIEW / EXECUTE only for writes
*   - parameter names: only the names the catalog declares for the action
*     (allowed_params); an unknown name is refused, never ignored
*   - production block: no PREVIEW / EXECUTE when T000-CCCATEGORY = 'P'
*   - preview token: EXECUTE needs an unused token of the same user, the
*     same action and the same parameters, younger than c_token_ttl
*   - idempotency key: a repeated EXECUTE returns the stored result
*   - log: every PREVIEW and EXECUTE in ZMCP_BIZ_LOG
*   - PRECHECK (read only, any client, not logged): document field values and
*     true / false answers for the customer check rules, see ZCL_MCP_BIZ_PRECHECK
*     (SD.* actions: facts by ZCL_MCP_BIZ_PRECHECK=>RUN_SD)
*   - handlers: one class per module (ZCL_MCP_BIZ_MM / _PP / _SD / _FI / _CO)
*
* Variant: ECC BASIS 7.31 (ZCL_MCP_JSON, installed with the 7.31 helpers).
* Differs from the 7.40 / S/4 source only in parse_params / to_json.

  PUBLIC SECTION.
    CONSTANTS c_token_ttl TYPE i VALUE 600.

    CLASS-METHODS run
      IMPORTING
        iv_action   TYPE string
        iv_mode     TYPE string
        iv_params   TYPE string
        iv_token    TYPE string
        iv_idem_key TYPE string
      EXPORTING
        ev_subrc    TYPE i
        ev_message  TYPE string
        ev_result   TYPE string
        ev_token    TYPE string.

  PRIVATE SECTION.
    CLASS-METHODS get_handler
      IMPORTING iv_action         TYPE string
      RETURNING VALUE(ro_handler) TYPE REF TO zif_mcp_biz_action.

    CLASS-METHODS list_actions
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    CLASS-METHODS is_production
      RETURNING VALUE(rv_prod) TYPE abap_bool.

    CLASS-METHODS parse_params
      IMPORTING iv_json          TYPE string
      RETURNING VALUE(rs_params) TYPE zif_mcp_biz_action=>ty_params.

    CLASS-METHODS json_keys
      IMPORTING iv_json        TYPE string
      EXPORTING et_keys        TYPE string_table
                ev_valid       TYPE abap_bool.

    CLASS-METHODS allowed_params
      IMPORTING iv_action       TYPE string
      RETURNING VALUE(rt_names) TYPE string_table.

    CLASS-METHODS check_param_names
      IMPORTING iv_action         TYPE string
                iv_mode           TYPE string
                iv_json           TYPE string
      RETURNING VALUE(rv_message) TYPE string.

    CLASS-METHODS to_json
      IMPORTING is_data        TYPE any
      RETURNING VALUE(rv_json) TYPE string.

    CLASS-METHODS params_hash
      IMPORTING is_params      TYPE zif_mcp_biz_action=>ty_params
      RETURNING VALUE(rv_hash) TYPE string.

    CLASS-METHODS do_preview
      IMPORTING io_handler TYPE REF TO zif_mcp_biz_action
                iv_action  TYPE string
                iv_params  TYPE string
                is_params  TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_result  TYPE zif_mcp_biz_action=>ty_result
                ev_token   TYPE string
                ev_message TYPE string.

    CLASS-METHODS do_execute
      IMPORTING io_handler  TYPE REF TO zif_mcp_biz_action
                iv_action   TYPE string
                is_params   TYPE zif_mcp_biz_action=>ty_params
                iv_token    TYPE string
                iv_idem_key TYPE string
      EXPORTING es_result   TYPE zif_mcp_biz_action=>ty_result
                ev_result   TYPE string
                ev_message  TYPE string
                ev_done     TYPE abap_bool.

ENDCLASS.



CLASS zcl_mcp_biz_exec IMPLEMENTATION.

  METHOD run.
    DATA: lv_action  TYPE string,
          lv_mode    TYPE string,
          lo_handler TYPE REF TO zif_mcp_biz_action,
          lt_defs    TYPE zif_mcp_biz_action=>ty_action_defs,
          ls_def     TYPE zif_mcp_biz_action=>ty_action_def,
          ls_params  TYPE zif_mcp_biz_action=>ty_params,
          ls_result  TYPE zif_mcp_biz_action=>ty_result,
          lv_done    TYPE abap_bool.

    CLEAR: ev_subrc, ev_message, ev_result, ev_token.
    lv_action = to_upper( iv_action ).
    lv_mode   = to_upper( iv_mode ).

    IF lv_mode = 'LIST'.
      ls_result = list_actions( ).
      ls_result-mode = lv_mode.
      ev_result  = to_json( ls_result ).
      ev_message = 'OK'.
      RETURN.
    ENDIF.

    lo_handler = get_handler( lv_action ).
    IF lo_handler IS NOT BOUND.
      ev_subrc   = 4.
      ev_message = |Unknown action { lv_action }|.
      RETURN.
    ENDIF.
    lt_defs = lo_handler->get_actions( ).
    READ TABLE lt_defs INTO ls_def WITH KEY id = lv_action.
    IF sy-subrc <> 0.
      ev_subrc   = 4.
      ev_message = |Action { lv_action } is not allowed|.
      RETURN.
    ENDIF.

    " Every parameter name must be declared for the action (catalog
    " configs/<MODULE>/actions.json): an unknown name is refused, never ignored.
    ev_message = check_param_names( iv_action = lv_action iv_mode = lv_mode iv_json = iv_params ).
    IF ev_message IS NOT INITIAL.
      ev_subrc = 4.
      RETURN.
    ENDIF.

    ls_params = parse_params( iv_params ).

    CASE lv_mode.
      WHEN 'QUERY'.
        IF ls_def-kind <> 'query'.
          ev_subrc   = 4.
          ev_message = |{ lv_action } is a write action: use PREVIEW and EXECUTE|.
          RETURN.
        ENDIF.
        ls_result = lo_handler->query( iv_action = lv_action is_params = ls_params ).

      WHEN 'PREVIEW' OR 'EXECUTE'.
        IF ls_def-kind <> 'write'.
          ev_subrc   = 4.
          ev_message = |{ lv_action } is a query action: use QUERY|.
          RETURN.
        ENDIF.
        IF is_production( ) = abap_true.
          ev_subrc   = 8.
          ev_message = 'Business writes are blocked in a production client'.
          RETURN.
        ENDIF.
        IF lv_mode = 'PREVIEW'.
          do_preview( EXPORTING io_handler = lo_handler iv_action = lv_action
                                iv_params = iv_params is_params = ls_params
                      IMPORTING es_result = ls_result ev_token = ev_token
                                ev_message = ev_message ).
        ELSE.
          do_execute( EXPORTING io_handler = lo_handler iv_action = lv_action
                                is_params = ls_params iv_token = iv_token
                                iv_idem_key = iv_idem_key
                      IMPORTING es_result = ls_result ev_result = ev_result
                                ev_message = ev_message ev_done = lv_done ).
          IF lv_done = abap_true.
            " Answer already complete (refused token or idempotent repeat).
            IF ev_message IS NOT INITIAL AND ev_result IS INITIAL.
              ev_subrc = 4.
            ENDIF.
            RETURN.
          ENDIF.
        ENDIF.

      WHEN 'PRECHECK'.
        IF lv_action CP 'SD.*'.
          zcl_mcp_biz_precheck=>run_sd(
            EXPORTING iv_action  = lv_action
                      is_params  = ls_params
            IMPORTING ev_subrc   = ev_subrc
                      ev_message = ev_message
                      et_facts   = ls_result-precheck_facts
                      et_answers = ls_result-precheck_answers ).
        ELSE.
          zcl_mcp_biz_precheck=>run(
            EXPORTING iv_action  = lv_action
                      is_params  = ls_params
            IMPORTING ev_subrc   = ev_subrc
                      ev_message = ev_message
                      et_facts   = ls_result-precheck_facts
                      et_answers = ls_result-precheck_answers ).
        ENDIF.
        IF ev_subrc <> 0.
          RETURN.
        ENDIF.

      WHEN OTHERS.
        ev_subrc   = 4.
        ev_message = |Unknown mode { lv_mode }: LIST, QUERY, PREVIEW, EXECUTE or PRECHECK|.
        RETURN.
    ENDCASE.

    ls_result-action = lv_action.
    ls_result-mode   = lv_mode.
    ev_result = to_json( ls_result ).
    IF ls_result-failed = abap_true.
      ev_subrc = 4.
      IF ev_message IS INITIAL.
        ev_message = 'Action failed: see messages'.
      ENDIF.
    ELSEIF ev_message IS INITIAL.
      ev_message = 'OK'.
    ENDIF.
  ENDMETHOD.


  METHOD get_handler.
    " Registry: one handler class per module. Add a module here.
    IF iv_action CP 'MM.*'.
      CREATE OBJECT ro_handler TYPE zcl_mcp_biz_mm.
    ELSEIF iv_action CP 'PP.*'.
      CREATE OBJECT ro_handler TYPE zcl_mcp_biz_pp.
    ELSEIF iv_action CP 'SD.*'.
      CREATE OBJECT ro_handler TYPE zcl_mcp_biz_sd.
    ELSEIF iv_action CP 'FI.*'.
      CREATE OBJECT ro_handler TYPE zcl_mcp_biz_fi.
    ELSEIF iv_action CP 'CO.*'.
      CREATE OBJECT ro_handler TYPE zcl_mcp_biz_co.
    ENDIF.
  ENDMETHOD.


  METHOD list_actions.
    DATA: lo_handler TYPE REF TO zif_mcp_biz_action,
          lt_actions TYPE zif_mcp_biz_action=>ty_action_defs.

    CREATE OBJECT lo_handler TYPE zcl_mcp_biz_mm.
    rs_result-actions = lo_handler->get_actions( ).
    CREATE OBJECT lo_handler TYPE zcl_mcp_biz_pp.
    lt_actions = lo_handler->get_actions( ).
    APPEND LINES OF lt_actions TO rs_result-actions.
    CREATE OBJECT lo_handler TYPE zcl_mcp_biz_sd.
    lt_actions = lo_handler->get_actions( ).
    APPEND LINES OF lt_actions TO rs_result-actions.
    CREATE OBJECT lo_handler TYPE zcl_mcp_biz_fi.
    lt_actions = lo_handler->get_actions( ).
    APPEND LINES OF lt_actions TO rs_result-actions.
    CREATE OBJECT lo_handler TYPE zcl_mcp_biz_co.
    lt_actions = lo_handler->get_actions( ).
    APPEND LINES OF lt_actions TO rs_result-actions.
    IF is_production( ) = abap_true.
      rs_result-summary = 'Production client: only query actions run here'.
    ENDIF.
  ENDMETHOD.


  METHOD is_production.
    DATA lv_cat TYPE t000-cccategory.

    SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt.
    IF lv_cat = 'P'.
      rv_prod = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD do_preview.
    DATA: ls_log  TYPE zmcp_biz_log,
          lv_uuid TYPE sysuuid_c32,
          lv_ts   TYPE timestampl.

    CLEAR: es_result, ev_token, ev_message.
    es_result = io_handler->preview( iv_action = iv_action is_params = is_params ).
    IF es_result-failed = abap_true.
      RETURN.
    ENDIF.

    TRY.
        lv_uuid = cl_system_uuid=>create_uuid_c32_static( ).
      CATCH cx_uuid_error.
        es_result-failed = abap_true.
        ev_message = 'Could not create a preview token'.
        RETURN.
    ENDTRY.
    GET TIME STAMP FIELD lv_ts.

    ls_log-token       = lv_uuid.
    ls_log-action_id   = iv_action.
    ls_log-status      = 'P'.
    ls_log-uname       = sy-uname.
    ls_log-params_hash = params_hash( is_params ).
    ls_log-created_at  = lv_ts.
    ls_log-params_json = iv_params.
    INSERT zmcp_biz_log FROM ls_log.
    COMMIT WORK.

    ev_token = lv_uuid.
  ENDMETHOD.


  METHOD do_execute.
    DATA: ls_log    TYPE zmcp_biz_log,
          ls_prev   TYPE zmcp_biz_log,
          lv_token  TYPE zmcp_biz_log-token,
          lv_idem   TYPE zmcp_biz_log-idem_key,
          lv_now    TYPE timestampl,
          lv_secs   TYPE tzntstmpl,
          lv_status TYPE zmcp_biz_log-status,
          lv_json   TYPE string.

    CLEAR: es_result, ev_result, ev_message, ev_done.
    lv_token = iv_token.
    lv_idem  = iv_idem_key.

    " Idempotent repeat: the same key already executed for this user.
    IF lv_idem IS NOT INITIAL.
      SELECT SINGLE * FROM zmcp_biz_log INTO ls_prev
        WHERE idem_key = lv_idem AND uname = sy-uname AND status = 'E'.
      IF sy-subrc = 0.
        ev_result  = ls_prev-result_json.
        ev_message = 'Already executed with this idempotency key'.
        ev_done    = abap_true.
        RETURN.
      ENDIF.
    ENDIF.

    " Preview token checks.
    ev_done = abap_true.
    IF lv_token IS INITIAL.
      ev_message = 'EXECUTE needs the token returned by PREVIEW'.
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM zmcp_biz_log INTO ls_log WHERE token = lv_token.
    IF sy-subrc <> 0.
      ev_message = 'Unknown preview token'.
      RETURN.
    ENDIF.
    IF ls_log-uname <> sy-uname.
      ev_message = 'The preview token belongs to another user'.
      RETURN.
    ENDIF.
    IF ls_log-action_id <> iv_action.
      ev_message = 'The preview token was issued for another action'.
      RETURN.
    ENDIF.
    IF ls_log-status <> 'P'.
      ev_message = 'The preview token was already used'.
      RETURN.
    ENDIF.
    IF ls_log-params_hash <> params_hash( is_params ).
      ev_message = 'The parameters differ from the preview: run PREVIEW again'.
      RETURN.
    ENDIF.
    GET TIME STAMP FIELD lv_now.
    lv_secs = cl_abap_tstmp=>subtract( tstmp1 = lv_now tstmp2 = ls_log-created_at ).
    IF lv_secs > c_token_ttl.
      ev_message = 'The preview token expired: run PREVIEW again'.
      RETURN.
    ENDIF.

    " Claim the token before the BAPI runs (one execution per token).
    UPDATE zmcp_biz_log SET status = 'X' idem_key = lv_idem
      WHERE token = lv_token AND status = 'P'.
    IF sy-dbcnt <> 1.
      ev_message = 'The preview token was already used'.
      RETURN.
    ENDIF.
    COMMIT WORK.
    ev_done = abap_false.

    es_result = io_handler->execute( iv_action = iv_action is_params = is_params ).
    es_result-action = iv_action.
    es_result-mode   = 'EXECUTE'.
    lv_json = to_json( es_result ).

    IF es_result-failed = abap_true.
      lv_status = 'F'.
    ELSE.
      lv_status = 'E'.
    ENDIF.
    GET TIME STAMP FIELD lv_now.
    UPDATE zmcp_biz_log SET status = lv_status executed_at = lv_now result_json = lv_json
      WHERE token = lv_token.
    COMMIT WORK.
  ENDMETHOD.


  METHOD params_hash.
    DATA lv_data TYPE string.

    lv_data = to_json( is_params ).
    TRY.
        cl_abap_message_digest=>calculate_hash_for_char(
          EXPORTING if_algorithm  = 'SHA1'
                    if_data       = lv_data
          IMPORTING ef_hashstring = rv_hash ).
      CATCH cx_abap_message_digest.
        rv_hash = lv_data.
    ENDTRY.
  ENDMETHOD.


  METHOD parse_params.
    " Contract: a flat JSON object, every scalar a JSON string,
    " "ebelp" a JSON array of strings. Names are lower case.
    DATA lt_members TYPE zcl_mcp_json=>ty_members.

    IF iv_json IS INITIAL.
      RETURN.
    ENDIF.
    lt_members = zcl_mcp_json=>parse_object( iv_json ).
    rs_params-ebeln              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'ebeln' ).
    rs_params-ebelp              = zcl_mcp_json=>get_strings( it_members = lt_members iv_name = 'ebelp' ).
    rs_params-etenr              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'etenr' ).
    rs_params-new_date           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'new_date' ).
    rs_params-new_quantity       = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'new_quantity' ).
    rs_params-quantity           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'quantity' ).
    rs_params-lgort              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'lgort' ).
    rs_params-charg              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'charg' ).
    rs_params-cbo                = zcl_mcp_json=>get_strings( it_members = lt_members iv_name = 'cbo' ).
    rs_params-posting_date       = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'posting_date' ).
    rs_params-rel_code           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'rel_code' ).
    rs_params-date_basis         = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'date_basis' ).
    rs_params-ekgrp              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'ekgrp' ).
    rs_params-lifnr              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'lifnr' ).
    rs_params-werks              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'werks' ).
    rs_params-include_unreleased = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'include_unreleased' ).
    rs_params-max_rows           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'max_rows' ).
    rs_params-aufnr             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'aufnr' ).
    rs_params-vornr             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'vornr' ).
    rs_params-yield             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'yield' ).
    rs_params-scrap             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'scrap' ).
    rs_params-final_conf        = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'final_conf' ).
    rs_params-new_start         = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'new_start' ).
    rs_params-new_finish        = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'new_finish' ).
    rs_params-status            = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'status' ).
    rs_params-dispo             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'dispo' ).
    rs_params-matnr             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'matnr' ).
    rs_params-fields            = zcl_mcp_json=>get_strings( it_members = lt_members iv_name = 'fields' ).
    rs_params-exists            = zcl_mcp_json=>get_strings( it_members = lt_members iv_name = 'exists' ).
    rs_params-bukrs               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'bukrs' ).
    rs_params-belnr               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'belnr' ).
    rs_params-gjahr               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'gjahr' ).
    rs_params-buzei               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'buzei' ).
    rs_params-kokrs               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'kokrs' ).
    rs_params-kostl               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'kostl' ).
    rs_params-hkont               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'hkont' ).
    rs_params-saknr               = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'saknr' ).
    rs_params-doc_type            = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'doc_type' ).
    rs_params-doc_date            = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'doc_date' ).
    rs_params-header_text         = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'header_text' ).
    rs_params-reference           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'reference' ).
    rs_params-exchange_rate       = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'exchange_rate' ).
    rs_params-fis_period          = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'fis_period' ).
    rs_params-block_key           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'block_key' ).
    rs_params-text                = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'text' ).
    rs_params-key_date            = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'key_date' ).
    rs_params-target              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'target' ).
    rs_params-order_type          = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'order_type' ).
    rs_params-fiscal_year         = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'fiscal_year' ).
    rs_params-from_period         = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'from_period' ).
    rs_params-to_period           = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'to_period' ).
    rs_params-version             = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'version' ).
    rs_params-lines              = zcl_mcp_json=>get_strings( it_members = lt_members iv_name = 'lines' ).
    rs_params-currency            = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'currency' ).
    rs_params-reason              = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'reason' ).
    rs_params-vbeln = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'vbeln' ).
    rs_params-posnr = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'posnr' ).
    rs_params-sched_line = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'sched_line' ).
    rs_params-vkorg = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'vkorg' ).
    rs_params-vtweg = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'vtweg' ).
    rs_params-spart = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'spart' ).
    rs_params-auart = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'auart' ).
    rs_params-doc_category = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'doc_category' ).
    rs_params-created_from = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'created_from' ).
    rs_params-vstel = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'vstel' ).
    rs_params-ship_point = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'ship_point' ).
    rs_params-due_date = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'due_date' ).
    rs_params-cond_type = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'cond_type' ).
    rs_params-new_price = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'new_price' ).
    rs_params-sold_to = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'sold_to' ).
    rs_params-ship_to = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'ship_to' ).
    rs_params-cust_po = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'cust_po' ).
    rs_params-req_date = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'req_date' ).
    rs_params-unit = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'unit' ).
    rs_params-items = zcl_mcp_json=>get_strings( it_members = lt_members iv_name = 'items' ).
    rs_params-ref_doc = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'ref_doc' ).
    rs_params-billing_date = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'billing_date' ).
    rs_params-billing_type = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'billing_type' ).
    rs_params-billing_date_to = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'billing_date_to' ).
    rs_params-pick_all = zcl_mcp_json=>get_string( it_members = lt_members iv_name = 'pick_all' ).
  ENDMETHOD.


  METHOD check_param_names.
    " Returns an error text when the JSON is not a flat object or names a
    " parameter the action does not declare. PRECHECK may also send fields / exists.
    DATA: lt_keys    TYPE string_table,
          lt_allowed TYPE string_table,
          lv_valid   TYPE abap_bool,
          lv_key     TYPE string,
          lv_bad     TYPE string,
          lv_list    TYPE string.

    IF iv_json IS INITIAL.
      RETURN.
    ENDIF.
    json_keys( EXPORTING iv_json = iv_json IMPORTING et_keys = lt_keys ev_valid = lv_valid ).
    IF lv_valid = abap_false.
      rv_message = 'Parameters must be one flat JSON object of strings (and string arrays)'.
      RETURN.
    ENDIF.
    lt_allowed = allowed_params( iv_action ).
    IF iv_mode = 'PRECHECK'.
      APPEND 'fields' TO lt_allowed.
      APPEND 'exists' TO lt_allowed.
    ENDIF.
    LOOP AT lt_keys INTO lv_key.
      READ TABLE lt_allowed WITH KEY table_line = lv_key TRANSPORTING NO FIELDS.
      IF sy-subrc <> 0.
        IF lv_bad IS NOT INITIAL.
          lv_bad = |{ lv_bad }, |.
        ENDIF.
        lv_bad = |{ lv_bad }{ lv_key }|.
      ENDIF.
    ENDLOOP.
    IF lv_bad IS INITIAL.
      RETURN.
    ENDIF.
    CONCATENATE LINES OF lt_allowed INTO lv_list SEPARATED BY `, `.
    IF lv_list IS INITIAL.
      lv_list = '(none)'.
    ENDIF.
    rv_message = |Unknown parameter(s) for { iv_action }: { lv_bad }. Allowed: { lv_list }|.
  ENDMETHOD.


  METHOD json_keys.
    " Top-level member names of a JSON object, lower case (sXML JSON reader,
    " available on 7.31 and later). Nested objects are not part of the contract.
    DATA: lv_xjson  TYPE xstring,
          lo_reader TYPE REF TO if_sxml_reader,
          lo_node   TYPE REF TO if_sxml_node,
          lo_open   TYPE REF TO if_sxml_open_element,
          lt_attr   TYPE if_sxml_attribute=>attributes,
          lo_attr   TYPE REF TO if_sxml_attribute,
          lv_depth  TYPE i,
          lv_root   TYPE string,
          lv_name   TYPE string.

    CLEAR: et_keys, ev_valid.
    TRY.
        lv_xjson = cl_abap_codepage=>convert_to( iv_json ).
        lo_reader = cl_sxml_string_reader=>create( lv_xjson ).
        DO.
          lo_node = lo_reader->read_next_node( ).
          IF lo_node IS INITIAL.
            EXIT.
          ENDIF.
          CASE lo_node->type.
            WHEN if_sxml_node=>co_nt_element_open.
              lv_depth = lv_depth + 1.
              lo_open ?= lo_node.
              IF lv_depth = 1.
                lv_root = lo_open->qname-name.
                IF lv_root <> 'object'.
                  RETURN.
                ENDIF.
              ELSEIF lv_depth = 2.
                IF lo_open->qname-name = 'object'.
                  RETURN.
                ENDIF.
                lt_attr = lo_open->get_attributes( ).
                LOOP AT lt_attr INTO lo_attr.
                  IF lo_attr->qname-name = 'name'.
                    lv_name = lo_attr->get_value( ).
                    TRANSLATE lv_name TO LOWER CASE.
                    APPEND lv_name TO et_keys.
                  ENDIF.
                ENDLOOP.
              ELSEIF lo_open->qname-name = 'object' OR lo_open->qname-name = 'array'.
                RETURN.
              ENDIF.
            WHEN if_sxml_node=>co_nt_element_close.
              lv_depth = lv_depth - 1.
          ENDCASE.
        ENDDO.
      CATCH cx_root.
        RETURN.
    ENDTRY.
    IF lv_root = 'object'.
      ev_valid = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD allowed_params.
    " Generated from configs/*/actions.json (params[].name). Keep in sync:
    " tests/validation/assist-actions.test.ts compares both lists.
    DATA lv_list TYPE string.

    CASE iv_action.
      WHEN 'MM.PO.LIST_OPEN'.
        lv_list = 'date_basis ekgrp lifnr werks include_unreleased max_rows'.
      WHEN 'MM.PO.GET_DETAIL'.
        lv_list = 'ebeln'.
      WHEN 'MM.PO.GET_HISTORY'.
        lv_list = 'ebeln ebelp'.
      WHEN 'MM.PO.SET_DELIVERY_COMPLETE'.
        lv_list = 'ebeln ebelp cbo'.
      WHEN 'MM.PO.UNSET_DELIVERY_COMPLETE'.
        lv_list = 'ebeln ebelp cbo'.
      WHEN 'MM.PO.SET_FINAL_INVOICE'.
        lv_list = 'ebeln ebelp cbo'.
      WHEN 'MM.PO.CHANGE_DELIVERY_DATE'.
        lv_list = 'ebeln ebelp etenr new_date cbo'.
      WHEN 'MM.PO.CHANGE_QUANTITY'.
        lv_list = 'ebeln ebelp new_quantity cbo'.
      WHEN 'MM.PO.RELEASE'.
        lv_list = 'ebeln rel_code'.
      WHEN 'MM.PO.RESET_RELEASE'.
        lv_list = 'ebeln rel_code'.
      WHEN 'MM.PO.DELETE_ITEM'.
        lv_list = 'ebeln ebelp cbo'.
      WHEN 'MM.GR.POST'.
        lv_list = 'ebeln ebelp quantity lgort charg posting_date stock_type'.
      WHEN 'MM.VENDOR.GET_STATUS'.
        lv_list = 'lifnr bukrs'.
      WHEN 'MM.PERIOD.GET'.
        lv_list = 'bukrs'.
      WHEN 'MM.STOCK.GET'.
        lv_list = 'matnr werks lgort'.
      WHEN 'MM.IV.LIST_BLOCKED'.
        lv_list = 'bukrs lifnr max_rows'.
      WHEN 'PP.ORD.LIST_OPEN'.
        lv_list = 'werks status date_basis dispo matnr max_rows'.
      WHEN 'PP.ORD.GET_DETAIL'.
        lv_list = 'aufnr'.
      WHEN 'PP.ORD.RELEASE'.
        lv_list = 'aufnr'.
      WHEN 'PP.ORD.CHANGE_QTY_DATES'.
        lv_list = 'aufnr new_quantity new_start new_finish'.
      WHEN 'PP.ORD.CONFIRM'.
        lv_list = 'aufnr vornr yield scrap final_conf posting_date'.
      WHEN 'PP.ORD.COMPLETE_TECH'.
        lv_list = 'aufnr'.
      WHEN 'PP.ORD.GOODS_ISSUE'.
        lv_list = 'aufnr matnr quantity lgort charg posting_date'.
      WHEN 'PP.ORD.GOODS_RECEIPT'.
        lv_list = 'aufnr quantity lgort charg posting_date'.
      WHEN 'PP.BOM.READ'.
        lv_list = 'matnr werks stlan key_date'.
      WHEN 'SD.SO.LIST_OPEN'.
        lv_list = 'vkorg status doc_category auart vtweg created_from max_rows'.
      WHEN 'SD.SO.GET_DETAIL'.
        lv_list = 'vbeln'.
      WHEN 'SD.SO.CREATE'.
        lv_list = 'auart vkorg vtweg spart sold_to items cust_po req_date ship_to matnr quantity werks unit'.
      WHEN 'SD.SO.CHANGE_QTY_DATE'.
        lv_list = 'vbeln posnr new_quantity new_date sched_line'.
      WHEN 'SD.SO.CHANGE_PRICE'.
        lv_list = 'vbeln posnr cond_type new_price currency'.
      WHEN 'SD.SO.SET_DELIVERY_BLOCK'.
        lv_list = 'vbeln reason'.
      WHEN 'SD.SO.REMOVE_DELIVERY_BLOCK'.
        lv_list = 'vbeln'.
      WHEN 'SD.SO.SET_BILLING_BLOCK'.
        lv_list = 'vbeln reason'.
      WHEN 'SD.SO.REMOVE_BILLING_BLOCK'.
        lv_list = 'vbeln'.
      WHEN 'SD.SO.REJECT_ITEM'.
        lv_list = 'vbeln posnr reason'.
      WHEN 'SD.SO.UNREJECT_ITEM'.
        lv_list = 'vbeln posnr'.
      WHEN 'SD.DLV.LIST_OPEN'.
        lv_list = 'vstel status date_basis max_rows'.
      WHEN 'SD.DLV.CREATE'.
        lv_list = 'vbeln posnr quantity items ship_point due_date'.
      WHEN 'SD.DLV.POST_GI'.
        lv_list = 'vbeln posting_date pick_all'.
      WHEN 'SD.DLV.REVERSE_GI'.
        lv_list = 'vbeln posting_date'.
      WHEN 'SD.BIL.LIST_DUE'.
        lv_list = 'vkorg billing_date_to max_rows'.
      WHEN 'SD.BIL.GET_DETAIL'.
        lv_list = 'vbeln'.
      WHEN 'SD.BIL.CREATE'.
        lv_list = 'ref_doc billing_date billing_type'.
      WHEN 'SD.BIL.CANCEL'.
        lv_list = 'vbeln billing_date'.
      WHEN 'FI.DOC.GET_DETAIL'.
        lv_list = 'bukrs belnr gjahr'.
      WHEN 'FI.DOC.LIST_OPEN_ITEMS'.
        lv_list = 'bukrs hkont key_date max_rows'.
      WHEN 'FI.GL.GET_ACCOUNT'.
        lv_list = 'bukrs saknr'.
      WHEN 'FI.GL.POST'.
        lv_list = 'bukrs doc_type posting_date doc_date currency header_text reference exchange_rate lines fis_period'.
      WHEN 'FI.DOC.REVERSE'.
        lv_list = 'bukrs belnr gjahr reason posting_date fis_period'.
      WHEN 'FI.ITEM.SET_PAYMENT_BLOCK'.
        lv_list = 'bukrs belnr gjahr buzei block_key'.
      WHEN 'FI.ITEM.CHANGE_TEXT'.
        lv_list = 'bukrs belnr gjahr buzei text'.
      WHEN 'FI.PERIOD.GET_STATUS'.
        lv_list = 'bukrs posting_date'.
      WHEN 'FI.AR.GET_CREDIT_STATUS'.
        lv_list = 'kunnr bukrs'.
      WHEN 'CO.ORD.GET_DETAIL'.
        lv_list = 'aufnr'.
      WHEN 'CO.ORD.LIST'.
        lv_list = 'kokrs bukrs order_type status max_rows'.
      WHEN 'CO.ORD.SET_STATUS'.
        lv_list = 'aufnr target'.
      WHEN 'CO.CC.GET_DETAIL'.
        lv_list = 'kokrs kostl key_date'.
      WHEN 'CO.CC.GET_ACTUALS'.
        lv_list = 'kokrs kostl fiscal_year from_period to_period version'.
      WHEN 'CO.PLAN.READ_PRIMARY'.
        lv_list = 'kokrs fiscal_year version kostl'.
      WHEN 'CO.REPOST.COSTS'.
        lv_list = 'kokrs posting_date header_text lines'.
      WHEN 'CO.REPOST.REVERSE'.
        lv_list = 'kokrs belnr posting_date header_text'.
      WHEN 'CO.ACT.ALLOC'.
        lv_list = 'kokrs posting_date header_text lines'.
      WHEN 'CO.PLAN.PRIMARY'.
        lv_list = 'kokrs fiscal_year version from_period to_period kostl lines header_text'.
      WHEN OTHERS.
        CLEAR lv_list.
    ENDCASE.
    SPLIT lv_list AT space INTO TABLE rt_names.
    DELETE rt_names WHERE table_line IS INITIAL.
  ENDMETHOD.


  METHOD to_json.
    rv_json = zcl_mcp_json=>serialize( is_data     = is_data
                                       iv_lower    = abap_true
                                       iv_compress = abap_true ).
  ENDMETHOD.

ENDCLASS.
