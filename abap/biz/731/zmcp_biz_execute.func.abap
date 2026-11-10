FUNCTION zmcp_biz_execute
  IMPORTING
    VALUE(iv_action) TYPE string
    VALUE(iv_mode) TYPE string
    VALUE(iv_params) TYPE string OPTIONAL
    VALUE(iv_token) TYPE string OPTIONAL
    VALUE(iv_idem_key) TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc) TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result) TYPE string
    VALUE(ev_token) TYPE string.

* ZMCP_BIZ_EXECUTE - business action entry point for the sc4sap MCP server
* (/sc4sap:assist). Must be RFC-enabled (SE37 > Attributes > Remote-Enabled
* Module: TFDIR-FMODE is not writable through ADT).
*
* IV_MODE    LIST | QUERY | PREVIEW | EXECUTE
* IV_ACTION  catalog ID, e.g. MM.PO.SET_DELIVERY_COMPLETE (not needed for LIST)
* IV_PARAMS  flat JSON object, scalars as strings, "ebelp" as array of strings
* IV_TOKEN   token from PREVIEW (EXECUTE only)
* IV_IDEM_KEY optional key: a repeated EXECUTE returns the stored result
* EV_SUBRC   0 ok, 4 refused or failed, 8 blocked (production client)
* EV_RESULT  JSON (lower-case names, initial fields dropped)

  DATA lx_root TYPE REF TO cx_root.

  TRY.
      zcl_mcp_biz_exec=>run(
        EXPORTING iv_action   = iv_action
                  iv_mode     = iv_mode
                  iv_params   = iv_params
                  iv_token    = iv_token
                  iv_idem_key = iv_idem_key
        IMPORTING ev_subrc    = ev_subrc
                  ev_message  = ev_message
                  ev_result   = ev_result
                  ev_token    = ev_token ).
    CATCH cx_root INTO lx_root.
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.
