FUNCTION zmcp_adt_ddic_dtel_read
  IMPORTING
    VALUE(iv_name)    TYPE string
    VALUE(iv_version) TYPE string DEFAULT 'A'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_DDIC_DTEL_READ - read data element metadata.
*
* Bridge for legacy ECC kernels (BASIS < 7.50) where the standard ADT
* endpoint for DDIC reads is missing. Returns a JSON skeleton compatible
* with the marketplace handler handleGetDataElement.
*
* Sources (verified against ECC 7.40 kernel):
*   DD04L(ROLLNAME, AS4LOCAL, DOMNAME, DATATYPE, LENG, DECIMALS,
*         OUTPUTLEN, LOWERCASE, SIGNFLAG, CONVEXIT, ...)        - header
*   DD04T(ROLLNAME, DDLANGUAGE, AS4LOCAL, DDTEXT, REPTEXT,
*         SCRTEXT_S, SCRTEXT_M, SCRTEXT_L)                      - texts
*   TADIR                                                        - package
*
* Version: 'A' active (AS4LOCAL='A'), 'I' inactive (AS4LOCAL='N').

  TYPES: BEGIN OF ty_result,
           name         TYPE string,
           domname      TYPE string,
           shlpname     TYPE string,
           shlpfield    TYPE string,
           datatype     TYPE string,
           leng         TYPE i,
           decimals     TYPE i,
           outputlen    TYPE i,
           lowercase    TYPE abap_bool,
           signflag     TYPE abap_bool,
           convexit     TYPE string,
           description  TYPE string,
           heading      TYPE string,
           short_label  TYPE string,
           medium_label TYPE string,
           long_label   TYPE string,
           package      TYPE devclass,
         END OF ty_result.

  DATA: lv_name     TYPE c LENGTH 30,
        lv_as4local TYPE c LENGTH 1,
        ls_dd04l    TYPE dd04l,
        ls_dd04t    TYPE dd04t,
        ls_result   TYPE ty_result,
        lv_devclass TYPE devclass.

  CLEAR: ev_subrc, ev_message, ev_result.

  IF iv_name IS INITIAL.
    ev_subrc   = 4.
    ev_message = 'iv_name is required'.
    RETURN.
  ENDIF.

  lv_name = to_upper( iv_name ).
  ls_result-name = lv_name.

  IF iv_version = 'I'.
    lv_as4local = 'N'.
  ELSE.
    lv_as4local = 'A'.
  ENDIF.

  TRY.
*     === Step 1: header (DD04L) ===
      SELECT SINGLE * FROM dd04l INTO ls_dd04l
        WHERE rollname = lv_name
          AND as4local = lv_as4local.

      IF sy-subrc <> 0.
        ev_subrc   = 4.
        ev_message = |DataElement { lv_name } not in DD04L (version { iv_version })|.
        ev_result  = /ui2/cl_json=>serialize(
          data        = ls_result
          compress    = abap_true
          pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
        RETURN.
      ENDIF.

      ls_result-domname   = ls_dd04l-domname.
      ls_result-shlpname  = ls_dd04l-shlpname.
      ls_result-shlpfield = ls_dd04l-shlpfield.
      ls_result-datatype  = ls_dd04l-datatype.
      ls_result-leng      = ls_dd04l-leng.
      ls_result-decimals  = ls_dd04l-decimals.
      ls_result-outputlen = ls_dd04l-outputlen.
      ls_result-convexit  = ls_dd04l-convexit.
      IF ls_dd04l-lowercase = 'X'.
        ls_result-lowercase = abap_true.
      ENDIF.
      IF ls_dd04l-signflag = 'X'.
        ls_result-signflag = abap_true.
      ENDIF.

*     === Step 2: texts (DD04T, prefer logon language, fallback EN) ===
      SELECT SINGLE * FROM dd04t INTO ls_dd04t
        WHERE rollname   = lv_name
          AND ddlanguage = sy-langu
          AND as4local   = lv_as4local.
      IF sy-subrc <> 0.
        SELECT SINGLE * FROM dd04t INTO ls_dd04t
          WHERE rollname   = lv_name
            AND ddlanguage = 'E'
            AND as4local   = lv_as4local.
      ENDIF.
      IF sy-subrc = 0.
        ls_result-description  = ls_dd04t-ddtext.
        ls_result-heading      = ls_dd04t-reptext.
        ls_result-short_label  = ls_dd04t-scrtext_s.
        ls_result-medium_label = ls_dd04t-scrtext_m.
        ls_result-long_label   = ls_dd04t-scrtext_l.
      ENDIF.

*     === Step 3: package (TADIR) ===
      SELECT SINGLE devclass FROM tadir
        INTO lv_devclass
        WHERE pgmid = 'R3TR' AND object = 'DTEL'
          AND obj_name = lv_name.
      IF sy-subrc = 0.
        ls_result-package = lv_devclass.
      ENDIF.

      ev_result = /ui2/cl_json=>serialize(
        data        = ls_result
        compress    = abap_true
        pretty_name = /ui2/cl_json=>pretty_mode-low_case ).

      ev_subrc   = 0.
      ev_message = |DTEL { lv_name }: domain={ ls_result-domname }, type={ ls_result-datatype }({ ls_result-leng })|.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.
