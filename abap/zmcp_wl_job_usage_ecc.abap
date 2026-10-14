FUNCTION zmcp_wl_job_usage
  IMPORTING
    VALUE(iv_programs) TYPE string
    VALUE(iv_months)   TYPE string DEFAULT '12'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_oldest)  TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_WL_JOB_USAGE - read-only: is each program a step of a background
* job that is scheduled now or that ran in the last IV_MONTHS months?
* Source: job overview TBTCO (header) + TBTCP (steps). Dialog runs from
* SE38/SA38 are NOT counted - only programs set up as a job step.
*
*   IV_PROGRAMS  comma-separated ABAP program names (required)
*   IV_MONTHS    months back including the current one (1-36, default 12)
*   EV_OLDEST    start date (YYYYMMDD) of the oldest finished/cancelled
*                job still kept; job reorganization (SAP_REORG_JOBS)
*                deletes older ones, so a false only means "no job since
*                EV_OLDEST" when that date is inside the window
*   EV_RESULT    {"ZPROG1":true,"ZPROG2":false,...}
*
* Used = a step of a job with status
*   S released, Y ready, R active, Z released/suspended  (scheduled now;
*     periodic jobs always keep one released successor), or
*   F finished, A cancelled  with start or end date inside the window.
* P (scheduled but never released) does not count - it cannot run.
* Read-only. User names are never read.

  TYPES: BEGIN OF ty_prog,
           progname TYPE btcprog,
           used     TYPE abap_bool,
         END OF ty_prog,
         BEGIN OF ty_step,
           jobname  TYPE btcjob,
           jobcount TYPE btcjobcnt,
           progname TYPE btcprog,
         END OF ty_step,
         BEGIN OF ty_job,
           jobname  TYPE btcjob,
           jobcount TYPE btcjobcnt,
           status   TYPE btcstatus,
           strtdate TYPE btcxdate,
           enddate  TYPE btcxdate,
         END OF ty_job.

  DATA: lt_prog   TYPE SORTED TABLE OF ty_prog WITH UNIQUE KEY progname,
        ls_prog   TYPE ty_prog,
        lt_step   TYPE STANDARD TABLE OF ty_step,
        ls_step   TYPE ty_step,
        lt_job    TYPE SORTED TABLE OF ty_job WITH UNIQUE KEY jobname jobcount,
        ls_job    TYPE ty_job,
        lt_parts  TYPE STANDARD TABLE OF string,
        lv_part   TYPE string,
        lv_months TYPE i,
        lv_back   TYPE i,
        lv_cutoff TYPE d,
        lv_oldest TYPE d,
        lv_used   TYPE abap_bool,
        lv_name   TYPE string,
        lv_bool   TYPE string,
        lv_sep    TYPE string.

  FIELD-SYMBOLS <ls_prog> TYPE ty_prog.

  ev_subrc = 0.
  CLEAR: ev_message, ev_oldest, ev_result.

  SPLIT iv_programs AT ',' INTO TABLE lt_parts.
  LOOP AT lt_parts INTO lv_part.
    CONDENSE lv_part NO-GAPS.
    TRANSLATE lv_part TO UPPER CASE.
    IF lv_part IS NOT INITIAL.
      ls_prog-progname = lv_part.
      ls_prog-used     = abap_false.
      INSERT ls_prog INTO TABLE lt_prog.
    ENDIF.
  ENDLOOP.
  IF lt_prog IS INITIAL.
    ev_subrc   = 8.
    ev_message = 'IV_PROGRAMS is empty'.
    ev_result  = '{}'.
    RETURN.
  ENDIF.

  lv_months = iv_months.
  IF lv_months < 1.
    lv_months = 1.
  ELSEIF lv_months > 36.
    lv_months = 36.
  ENDIF.

* First day of the oldest month in the window (same window as
* ZMCP_WL_TCODE_USAGE: current month + lv_months - 1 earlier ones).
  lv_back = lv_months - 1.
  lv_cutoff = sy-datum.
  lv_cutoff+6(2) = '01'.
  DO lv_back TIMES.
    lv_cutoff = lv_cutoff - 1.
    lv_cutoff+6(2) = '01'.
  ENDDO.

  SELECT jobname jobcount progname
    FROM tbtcp
    INTO TABLE lt_step
    FOR ALL ENTRIES IN lt_prog
    WHERE progname = lt_prog-progname.

  IF lt_step IS NOT INITIAL.
    SELECT jobname jobcount status strtdate enddate
      FROM tbtco
      INTO TABLE lt_job
      FOR ALL ENTRIES IN lt_step
      WHERE jobname  = lt_step-jobname
        AND jobcount = lt_step-jobcount.
  ENDIF.

  LOOP AT lt_step INTO ls_step.
    READ TABLE lt_prog ASSIGNING <ls_prog> WITH TABLE KEY progname = ls_step-progname.
    IF sy-subrc <> 0 OR <ls_prog>-used = abap_true.
      CONTINUE.
    ENDIF.
    READ TABLE lt_job INTO ls_job
      WITH TABLE KEY jobname = ls_step-jobname jobcount = ls_step-jobcount.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
    lv_used = abap_false.
    CASE ls_job-status.
      WHEN 'S' OR 'Y' OR 'R' OR 'Z'.
        lv_used = abap_true.
      WHEN 'F' OR 'A'.
        IF ls_job-strtdate >= lv_cutoff OR ls_job-enddate >= lv_cutoff.
          lv_used = abap_true.
        ENDIF.
    ENDCASE.
    IF lv_used = abap_true.
      <ls_prog>-used = abap_true.
    ENDIF.
  ENDLOOP.

  SELECT MIN( strtdate )
    FROM tbtco
    INTO lv_oldest
    WHERE ( status = 'F' OR status = 'A' )
      AND strtdate > '00000000'.
  IF lv_oldest IS NOT INITIAL.
    ev_oldest = lv_oldest.
  ENDIF.

  LOOP AT lt_prog INTO ls_prog.
    lv_name = ls_prog-progname.
    REPLACE ALL OCCURRENCES OF '\' IN lv_name WITH '\\'.
    REPLACE ALL OCCURRENCES OF '"' IN lv_name WITH '\"'.
    IF ls_prog-used = abap_true.
      lv_bool = 'true'.
    ELSE.
      lv_bool = 'false'.
    ENDIF.
    ev_result = |{ ev_result }{ lv_sep }"{ lv_name }":{ lv_bool }|.
    lv_sep = ','.
  ENDLOOP.
  ev_result = |\{{ ev_result }\}|.

  IF lv_oldest IS INITIAL.
    ev_message = 'No finished job history kept - only currently scheduled jobs were checked'.
  ELSEIF lv_oldest > lv_cutoff.
    ev_message = |Job history kept only since { lv_oldest } (window starts { lv_cutoff })|.
  ELSE.
    ev_message = |Job history covers the whole window since { lv_cutoff }|.
  ENDIF.

ENDFUNCTION.
