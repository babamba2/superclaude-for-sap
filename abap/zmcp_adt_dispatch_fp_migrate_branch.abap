* ZMCP_ADT_DISPATCH - action FP_MIGRATE (SmartForm -> Adobe form, DEV write).
*
* NOT a standalone object. A snippet to paste into the LIVE dispatcher of
* the target system - never deploy the repo copies of the dispatchers (they
* may be older than the system). Read and back up the live source first.
*
* Prerequisite: FM ZMCP_FP_MIGRATE (abap/zmcp_fp_migrate.abap) exists and is
* active (function group ZMCP_FP). BASIS 7.40 or later (/UI2/CL_JSON).
*
* FP_MIGRATE (MCP tool CreateAdobeFormFromSmartForm) - writes NEW $TMP objects
*   params: source (SAP SmartForm), form / interface (ZSC4SAP_AFM_*),
*           preset (FULL), sender_country (optional T005 key for address
*           nodes without one)
* result: EV_RESULT of ZMCP_FP_MIGRATE unchanged
* subrc : 0 ok, 8 refused or SAP's migration raised - EV_MESSAGE says why


*======================================================================*
* 1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*    WHEN OTHERS:
*
*        WHEN 'FP_MIGRATE'.
*          PERFORM fp_migrate_call USING iv_params CHANGING ev_subrc ev_message ev_result.
*
*    and add to the "Supported actions" header comment:
*      FP_MIGRATE - SAP example SmartForm -> new $TMP Adobe form (ZMCP_FP_MIGRATE)
*
* 2. Append at the end of the function group include:
*======================================================================*

*&---------------------------------------------------------------------*
*& Form FP_MIGRATE_CALL - SmartForm -> Adobe form into new $TMP objects
*&---------------------------------------------------------------------*
FORM fp_migrate_call USING iv_params TYPE string
                     CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          source    TYPE string,
          form      TYPE string,
          interface TYPE string,
          preset    TYPE string,
          sender_country TYPE string,
        END OF ls_input.
  DATA lv_ctry TYPE land1.
  DATA lv_subrc TYPE sysubrc.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  IF ls_input-preset IS INITIAL.
    ls_input-preset = 'FULL'.
  ENDIF.
  " sender country: optional T005 key (checked in ZMCP_FP_MIGRATE); longer input refused here
  ls_input-sender_country = to_upper( condense( ls_input-sender_country ) ).
  IF strlen( ls_input-sender_country ) > 3.
    ev_subrc = 8. ev_message = |FP_MIGRATE: sender_country refused (a T005 country key)|. ev_result = '{}'.
    RETURN.
  ENDIF.
  lv_ctry = ls_input-sender_country.
  " every name check (lengths, patterns, existence, SAP source) is in ZMCP_FP_MIGRATE
  CALL FUNCTION 'ZMCP_FP_MIGRATE'
    EXPORTING
      iv_source    = ls_input-source
      iv_form      = ls_input-form
      iv_interface = ls_input-interface
      iv_preset    = ls_input-preset
      iv_sender_country = lv_ctry
    IMPORTING
      ev_subrc     = lv_subrc
      ev_message   = ev_message
      ev_result    = ev_result.
  ev_subrc = lv_subrc.
ENDFORM.
