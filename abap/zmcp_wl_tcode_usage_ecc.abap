FUNCTION zmcp_wl_tcode_usage
  IMPORTING
    VALUE(iv_tcodes) TYPE string
    VALUE(iv_months) TYPE string DEFAULT '12'
    VALUE(iv_rfcdest) TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc)    TYPE i
    VALUE(ev_message)  TYPE string
    VALUE(ev_coverage) TYPE i
    VALUE(ev_result)   TYPE string
    VALUE(ev_sysid)    TYPE string.

* ZMCP_WL_TCODE_USAGE - read-only: was each transaction used in the last
* IV_MONTHS months? Source: workload monitor (ST03N) monthly aggregates,
* SWNC_COLLECTOR_GET_AGGREGATES COMPONENT 'TOTAL' PERIODTYPE 'M', table
* USERTCODE (ENTRY_ID = TCODE 40 + BTCJOB 32 + ENTRY_TYPE 1, 'T' = tcode).
*
*   IV_TCODES    comma-separated transaction codes (required)
*   IV_MONTHS    months back including the current one (1-36, default 12)
*   IV_RFCDEST   optional SM59 destination: read the aggregates of THAT
*                system (QA / PRD) instead of this one - the collector FM is
*                remote-enabled (Solution Manager uses it the same way)
*   EV_SYSID     system the statistics come from (RFC_SYSTEM_INFO remote)
*   EV_COVERAGE  months in that window that hold any workload rows; when
*                it is below IV_MONTHS a false means "not used in the
*                last EV_COVERAGE months", not "not used in IV_MONTHS"
*   EV_RESULT    {"VA01":true,"ZXX01":false,...}
*
* Read-only. User names are never read out of the aggregates.

  TYPES: BEGIN OF ty_tcode,
           tcode TYPE c LENGTH 40,
           used  TYPE abap_bool,
         END OF ty_tcode.

  DATA: lt_tcode  TYPE SORTED TABLE OF ty_tcode WITH UNIQUE KEY tcode,
        ls_tcode  TYPE ty_tcode,
        lt_parts  TYPE STANDARD TABLE OF string,
        lv_part   TYPE string,
        lt_ut     TYPE STANDARD TABLE OF swncaggusertcode,
        ls_ut     TYPE swncaggusertcode,
        ls_eid    TYPE swnc_entry_id,
        lv_months TYPE i,
        lv_first  TYPE d,
        lv_name   TYPE string,
        lv_bool   TYPE string,
        lv_sep    TYPE string,
        lv_dest   TYPE rfcdest,
        lv_rfcmsg TYPE c LENGTH 255,
        ls_rfcsi  TYPE rfcsi.

  FIELD-SYMBOLS <ls_tcode> TYPE ty_tcode.

  ev_subrc = 0.
  CLEAR: ev_message, ev_coverage, ev_result, ev_sysid.

  lv_dest = iv_rfcdest.
  CONDENSE lv_dest NO-GAPS.
  IF lv_dest IS INITIAL.
    ev_sysid = sy-sysid.
  ELSE.
    CALL FUNCTION 'RFC_SYSTEM_INFO'
      DESTINATION lv_dest
      IMPORTING
        rfcsi_export          = ls_rfcsi
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_rfcmsg
        system_failure        = 2 MESSAGE lv_rfcmsg
        OTHERS                = 3.
    IF sy-subrc <> 0.
      ev_subrc   = 12.
      ev_message = |RFC destination { lv_dest } failed: { lv_rfcmsg }|.
      ev_result  = '{}'.
      RETURN.
    ENDIF.
    ev_sysid = ls_rfcsi-rfcsysid.
  ENDIF.

  SPLIT iv_tcodes AT ',' INTO TABLE lt_parts.
  LOOP AT lt_parts INTO lv_part.
    CONDENSE lv_part NO-GAPS.
    TRANSLATE lv_part TO UPPER CASE.
    IF lv_part IS NOT INITIAL.
      ls_tcode-tcode = lv_part.
      ls_tcode-used  = abap_false.
      INSERT ls_tcode INTO TABLE lt_tcode.
    ENDIF.
  ENDLOOP.
  IF lt_tcode IS INITIAL.
    ev_subrc   = 8.
    ev_message = 'IV_TCODES is empty'.
    ev_result  = '{}'.
    RETURN.
  ENDIF.

  lv_months = iv_months.
  IF lv_months < 1.
    lv_months = 1.
  ELSEIF lv_months > 36.
    lv_months = 36.
  ENDIF.

  lv_first = sy-datum.
  lv_first+6(2) = '01'.

  DO lv_months TIMES.
    CLEAR lt_ut.
    IF lv_dest IS INITIAL.
      CALL FUNCTION 'SWNC_COLLECTOR_GET_AGGREGATES'
        EXPORTING
          component     = 'TOTAL'
          periodtype    = 'M'
          periodstrt    = lv_first
        TABLES
          usertcode     = lt_ut
        EXCEPTIONS
          no_data_found = 1
          OTHERS        = 2.
    ELSE.
      CALL FUNCTION 'SWNC_COLLECTOR_GET_AGGREGATES'
        DESTINATION lv_dest
        EXPORTING
          component             = 'TOTAL'
          periodtype            = 'M'
          periodstrt            = lv_first
        TABLES
          usertcode             = lt_ut
        EXCEPTIONS
          no_data_found         = 1
          communication_failure = 3 MESSAGE lv_rfcmsg
          system_failure        = 4 MESSAGE lv_rfcmsg
          OTHERS                = 2.
      IF sy-subrc = 3 OR sy-subrc = 4.
        ev_subrc   = 12.
        ev_message = |RFC { lv_dest } ({ ev_sysid }) failed: { lv_rfcmsg }|.
        ev_result  = '{}'.
        CLEAR ev_coverage.
        RETURN.
      ENDIF.
    ENDIF.
    IF sy-subrc = 0 AND lt_ut IS NOT INITIAL.
      ev_coverage = ev_coverage + 1.
      LOOP AT lt_ut INTO ls_ut.
        ls_eid = ls_ut-entry_id.
        IF ls_eid-entry_type <> 'T'.
          CONTINUE.
        ENDIF.
        READ TABLE lt_tcode ASSIGNING <ls_tcode> WITH TABLE KEY tcode = ls_eid-tcode.
        IF sy-subrc = 0.
          <ls_tcode>-used = abap_true.
        ENDIF.
      ENDLOOP.
    ENDIF.

    lv_first = lv_first - 1.
    lv_first+6(2) = '01'.
  ENDDO.

  LOOP AT lt_tcode INTO ls_tcode.
    lv_name = ls_tcode-tcode.
    REPLACE ALL OCCURRENCES OF '\' IN lv_name WITH '\\'.
    REPLACE ALL OCCURRENCES OF '"' IN lv_name WITH '\"'.
    IF ls_tcode-used = abap_true.
      lv_bool = 'true'.
    ELSE.
      lv_bool = 'false'.
    ENDIF.
    ev_result = |{ ev_result }{ lv_sep }"{ lv_name }":{ lv_bool }|.
    lv_sep = ','.
  ENDLOOP.
  ev_result = |\{{ ev_result }\}|.

  IF ev_coverage = 0.
    ev_subrc   = 4.
    ev_message = 'No workload rows in the requested months - usage unknown'.
  ELSEIF ev_coverage < lv_months.
    ev_message = |Workload data covers { ev_coverage } of { lv_months } months|.
  ELSE.
    ev_message = |Workload data covers all { lv_months } months|.
  ENDIF.

ENDFUNCTION.
