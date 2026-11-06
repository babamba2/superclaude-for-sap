FUNCTION zmcp_adt_ddic_tabl_read
  IMPORTING
    VALUE(iv_name)    TYPE string
    VALUE(iv_version) TYPE string DEFAULT 'A'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_DDIC_TABL_READ - read transparent table OR structure metadata.
*
* Bridge for legacy ECC kernels (BASIS < 7.50) where the standard ADT
* endpoint /sap/bc/adt/ddic/tables is missing. Reads DDIC system tables
* directly and returns a JSON skeleton compatible with the ADT shape
* expected by the marketplace handlers handleGetTable / handleGetStructure.
*
* Sources (verified against ECC 7.40 kernel via cl_abap_structdescr):
*   DD02L(TABNAME, AS4LOCAL, TABCLASS, CONTFLAG, BUFFERED, ...) - header
*   DD02T(TABNAME, DDLANGUAGE, AS4LOCAL, DDTEXT)               - description
*   DD03L(TABNAME, FIELDNAME, AS4LOCAL, POSITION, KEYFLAG,
*         ROLLNAME, CHECKTABLE, INTTYPE, INTLEN, NOTNULL,
*         DATATYPE, LENG, DECIMALS, DOMNAME, COMPTYPE, ...)    - fields
*   DD04T(ROLLNAME, DDLANGUAGE, AS4LOCAL, DDTEXT, ...)         - DTEL labels
*   DD08L(TABNAME, FIELDNAME, CHECKTABLE, FRKART, CARD, CARDLEFT) - foreign keys
*   DD05S(TABNAME, FIELDNAME, PRIMPOS, FORTABLE, FORKEY)        - FK field map
*         (no CHECKTABLE / CHECKFIELD on 7.31 or 7.40: the check table comes
*         from DD08L, the check field is its PRIMPOS-th key field)
*   DD35L(TABNAME, FIELDNAME, SHLPNAME)                         - field search helps
*   DD26S(VIEWNAME, TABNAME, TABPOS, FORTABNAME, FORFIELD)      - view base tables
*   TADIR                                                       - package
*
* Version: 'A' active (AS4LOCAL='A'), 'I' inactive (AS4LOCAL='N').
* Coverage: TRANSP / CLUSTER / POOL / VIEW / STRUCTURE / INTTAB / APPEND.

  TYPES: BEGIN OF ty_field,
           fieldname   TYPE c LENGTH 30,
           position    TYPE i,
           key         TYPE abap_bool,
           mandatory   TYPE abap_bool,
           rollname    TYPE c LENGTH 30,
           checktable  TYPE c LENGTH 30,
           datatype    TYPE c LENGTH 4,
           leng        TYPE i,
           decimals    TYPE i,
           domname     TYPE c LENGTH 30,
           comptype    TYPE c LENGTH 1,
           precfield   TYPE c LENGTH 30,
           reftable    TYPE c LENGTH 30,
           reffield    TYPE c LENGTH 30,
           shlpname    TYPE c LENGTH 30,
           notnull     TYPE abap_bool,
           description TYPE string,
         END OF ty_field.

  TYPES: BEGIN OF ty_fk,
           fieldname  TYPE c LENGTH 30,
           checktable TYPE c LENGTH 30,
           frkart     TYPE c LENGTH 10,
           card       TYPE c LENGTH 2,
           cardleft   TYPE c LENGTH 2,
         END OF ty_fk.

  TYPES: BEGIN OF ty_fkf,
           fieldname  TYPE c LENGTH 30,
           primpos    TYPE i,
           checkfield TYPE c LENGTH 30,
           fortable   TYPE c LENGTH 30,
           forkey     TYPE c LENGTH 30,
         END OF ty_fkf.

  TYPES: BEGIN OF ty_base,
           tabname    TYPE c LENGTH 30,
           tabpos     TYPE i,
           fortabname TYPE c LENGTH 30,
           forfield   TYPE c LENGTH 30,
         END OF ty_base.

  TYPES: BEGIN OF ty_result,
           name           TYPE string,
           kind           TYPE string,
           tabclass       TYPE string,
           delivery_class TYPE string,
           buffered       TYPE string,
           description    TYPE string,
           package        TYPE devclass,
           fields         TYPE STANDARD TABLE OF ty_field WITH DEFAULT KEY,
           foreign_keys       TYPE STANDARD TABLE OF ty_fk WITH DEFAULT KEY,
           foreign_key_fields TYPE STANDARD TABLE OF ty_fkf WITH DEFAULT KEY,
           base_tables        TYPE STANDARD TABLE OF ty_base WITH DEFAULT KEY,
         END OF ty_result.

  DATA: lv_name     TYPE c LENGTH 30,
        lv_as4local TYPE c LENGTH 1,
        ls_dd02l    TYPE dd02l,
        ls_dd02t    TYPE dd02t,
        lt_dd03l    TYPE STANDARD TABLE OF dd03l WITH DEFAULT KEY,
        ls_dd03l    TYPE dd03l,
        lt_dd04t    TYPE STANDARD TABLE OF dd04t WITH DEFAULT KEY,
        ls_dd04t    TYPE dd04t,
        ls_field    TYPE ty_field,
        lt_dd08l    TYPE STANDARD TABLE OF dd08l WITH DEFAULT KEY,
        ls_dd08l    TYPE dd08l,
        lt_dd05s    TYPE STANDARD TABLE OF dd05s WITH DEFAULT KEY,
        ls_dd05s    TYPE dd05s,
        lt_dd35l    TYPE STANDARD TABLE OF dd35l WITH DEFAULT KEY,
        ls_dd35l    TYPE dd35l,
        lt_dd26s    TYPE STANDARD TABLE OF dd26s WITH DEFAULT KEY,
        ls_dd26s    TYPE dd26s,
        ls_fk       TYPE ty_fk,
        ls_fkf      TYPE ty_fkf,
        ls_base     TYPE ty_base,
        ls_result   TYPE ty_result,
        lv_devclass TYPE devclass.

  FIELD-SYMBOLS <lv_comp> TYPE any.

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
*     === Step 1: header (DD02L) ===
      SELECT SINGLE * FROM dd02l INTO ls_dd02l
        WHERE tabname  = lv_name
          AND as4local = lv_as4local.

      IF sy-subrc <> 0.
        ev_subrc   = 4.
        ev_message = |Table/structure { lv_name } not in DD02L (version { iv_version })|.
        ev_result  = /ui2/cl_json=>serialize(
          data        = ls_result
          compress    = abap_true
          pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
        RETURN.
      ENDIF.

      ls_result-tabclass       = ls_dd02l-tabclass.
      ls_result-delivery_class = ls_dd02l-contflag.
      ls_result-buffered       = ls_dd02l-buffered.

      CASE ls_dd02l-tabclass.
        WHEN 'TRANSP' OR 'CLUSTER' OR 'POOL' OR 'VIEW'.
          ls_result-kind = 'TABL'.
        WHEN 'STRUCTURE' OR 'INTTAB' OR 'APPEND'.
          ls_result-kind = 'STRU'.
        WHEN OTHERS.
          ls_result-kind = ls_dd02l-tabclass.
      ENDCASE.

*     === Step 2: description (DD02T, prefer logon language, fallback EN) ===
      SELECT SINGLE * FROM dd02t INTO ls_dd02t
        WHERE tabname    = lv_name
          AND ddlanguage = sy-langu
          AND as4local   = lv_as4local.
      IF sy-subrc <> 0.
        SELECT SINGLE * FROM dd02t INTO ls_dd02t
          WHERE tabname    = lv_name
            AND ddlanguage = 'E'
            AND as4local   = lv_as4local.
      ENDIF.
      IF sy-subrc = 0.
        ls_result-description = ls_dd02t-ddtext.
      ENDIF.

*     === Step 3: package (TADIR) ===
      SELECT SINGLE devclass FROM tadir
        INTO lv_devclass
        WHERE pgmid = 'R3TR' AND object = 'TABL'
          AND obj_name = lv_name.
      IF sy-subrc = 0.
        ls_result-package = lv_devclass.
      ENDIF.

*     === Step 4: fields (DD03L) ===
      SELECT * FROM dd03l INTO TABLE lt_dd03l
        WHERE tabname  = lv_name
          AND as4local = lv_as4local
        ORDER BY position.

*     === Step 4b: field search helps (DD35L) ===
      SELECT * FROM dd35l INTO TABLE lt_dd35l
        WHERE tabname  = lv_name
          AND as4local = lv_as4local.

*     === Step 5: batch DTEL labels in logon language ===
      IF lt_dd03l IS NOT INITIAL.
        SELECT * FROM dd04t INTO TABLE lt_dd04t
          FOR ALL ENTRIES IN lt_dd03l
          WHERE rollname   = lt_dd03l-rollname
            AND ddlanguage = sy-langu
            AND as4local   = lv_as4local.
      ENDIF.

      LOOP AT lt_dd03l INTO ls_dd03l.
        CLEAR ls_field.
        ls_field-fieldname  = ls_dd03l-fieldname.
        ls_field-position   = ls_dd03l-position.
        ls_field-rollname   = ls_dd03l-rollname.
        ls_field-checktable = ls_dd03l-checktable.
        ls_field-datatype   = ls_dd03l-datatype.
        ls_field-leng       = ls_dd03l-leng.
        ls_field-decimals   = ls_dd03l-decimals.
        ls_field-domname    = ls_dd03l-domname.
        ls_field-comptype   = ls_dd03l-comptype.
        ls_field-precfield  = ls_dd03l-precfield.
        ls_field-reftable   = ls_dd03l-reftable.
        ls_field-reffield   = ls_dd03l-reffield.
        READ TABLE lt_dd35l INTO ls_dd35l
          WITH KEY fieldname = ls_dd03l-fieldname.
        IF sy-subrc = 0.
          ls_field-shlpname = ls_dd35l-shlpname.
        ENDIF.
        IF ls_dd03l-keyflag = 'X'.
          ls_field-key = abap_true.
        ENDIF.
        IF ls_dd03l-mandatory = 'X'.
          ls_field-mandatory = abap_true.
        ENDIF.
        IF ls_dd03l-notnull = 'X'.
          ls_field-notnull = abap_true.
        ENDIF.

        IF ls_dd03l-rollname IS NOT INITIAL.
          READ TABLE lt_dd04t INTO ls_dd04t
            WITH KEY rollname = ls_dd03l-rollname.
          IF sy-subrc = 0.
            ls_field-description = ls_dd04t-ddtext.
          ELSE.
*           per-row EN fallback (rare path)
            SELECT SINGLE ddtext FROM dd04t
              INTO ls_field-description
              WHERE rollname   = ls_dd03l-rollname
                AND ddlanguage = 'E'
                AND as4local   = lv_as4local.
          ENDIF.
        ENDIF.

        APPEND ls_field TO ls_result-fields.
      ENDLOOP.

*     === Step 6: foreign keys (DD08L header, DD05S field map) ===
      SELECT * FROM dd08l INTO TABLE lt_dd08l
        WHERE tabname  = lv_name
          AND as4local = lv_as4local
          AND as4vers  = '0000'.
      LOOP AT lt_dd08l INTO ls_dd08l.
        CLEAR ls_fk.
        ls_fk-fieldname  = ls_dd08l-fieldname.
        ls_fk-checktable = ls_dd08l-checktable.
        ASSIGN COMPONENT 'FRKART' OF STRUCTURE ls_dd08l TO <lv_comp>.
        IF sy-subrc = 0.
          ls_fk-frkart = <lv_comp>.
        ENDIF.
        ASSIGN COMPONENT 'CARD' OF STRUCTURE ls_dd08l TO <lv_comp>.
        IF sy-subrc = 0.
          ls_fk-card = <lv_comp>.
        ENDIF.
        ASSIGN COMPONENT 'CARDLEFT' OF STRUCTURE ls_dd08l TO <lv_comp>.
        IF sy-subrc = 0.
          ls_fk-cardleft = <lv_comp>.
        ENDIF.
        APPEND ls_fk TO ls_result-foreign_keys.
      ENDLOOP.
      IF lt_dd08l IS NOT INITIAL.
        SELECT * FROM dd05s INTO TABLE lt_dd05s
          WHERE tabname  = lv_name
            AND as4local = lv_as4local
            AND as4vers  = '0000'.
        SORT lt_dd05s BY fieldname primpos.
        LOOP AT lt_dd05s INTO ls_dd05s.
          CLEAR ls_fkf.
          ls_fkf-fieldname  = ls_dd05s-fieldname.
          ls_fkf-primpos    = ls_dd05s-primpos.
          ASSIGN COMPONENT 'CHECKFIELD' OF STRUCTURE ls_dd05s TO <lv_comp>.
          IF sy-subrc = 0.
            ls_fkf-checkfield = <lv_comp>.
          ENDIF.
          ASSIGN COMPONENT 'FORTABLE' OF STRUCTURE ls_dd05s TO <lv_comp>.
          IF sy-subrc = 0.
            ls_fkf-fortable = <lv_comp>.
          ENDIF.
          ASSIGN COMPONENT 'FORKEY' OF STRUCTURE ls_dd05s TO <lv_comp>.
          IF sy-subrc = 0.
            ls_fkf-forkey = <lv_comp>.
          ENDIF.
          APPEND ls_fkf TO ls_result-foreign_key_fields.
        ENDLOOP.
      ENDIF.

*     === Step 7: view base tables (DD26S, database / projection views) ===
      IF ls_dd02l-tabclass = 'VIEW'.
        SELECT * FROM dd26s INTO TABLE lt_dd26s
          WHERE viewname = lv_name
            AND as4local = lv_as4local
            AND as4vers  = '0000'.
        SORT lt_dd26s BY tabpos.
        LOOP AT lt_dd26s INTO ls_dd26s.
          CLEAR ls_base.
          ls_base-tabname    = ls_dd26s-tabname.
          ls_base-tabpos     = ls_dd26s-tabpos.
          ASSIGN COMPONENT 'FORTABNAME' OF STRUCTURE ls_dd26s TO <lv_comp>.
          IF sy-subrc = 0.
            ls_base-fortabname = <lv_comp>.
          ENDIF.
          ASSIGN COMPONENT 'FORFIELD' OF STRUCTURE ls_dd26s TO <lv_comp>.
          IF sy-subrc = 0.
            ls_base-forfield = <lv_comp>.
          ENDIF.
          APPEND ls_base TO ls_result-base_tables.
        ENDLOOP.
      ENDIF.

      ev_result = /ui2/cl_json=>serialize(
        data        = ls_result
        compress    = abap_true
        pretty_name = /ui2/cl_json=>pretty_mode-low_case ).

      ev_subrc   = 0.
      ev_message = |{ ls_result-kind } { lv_name }: { lines( ls_result-fields ) } field(s), tabclass={ ls_result-tabclass }|.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.
