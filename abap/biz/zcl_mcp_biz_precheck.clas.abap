CLASS zcl_mcp_biz_precheck DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* ZCL_MCP_BIZ_PRECHECK - PRECHECK mode of ZMCP_BIZ_EXECUTE.
* SD facts (merged 2026-11-10 from ZCL_MCP_BIZ_PRE_SD, old class kept): run_sd and the sd_* members.
*
* Purpose: the customer check rules of a system (user exits, BAdIs, validations)
* are evaluated OUTSIDE SAP (sc4sap scripts/assist/eval-rules.mjs). SAP only
* returns
*   (a) document field values ("facts") of a hard-coded set of standard tables,
*       read by the document keys, and
*   (b) true / false answers to existence queries on allow-listed tables.
* No table row ever leaves SAP.
*
* Facts scope (decided by the action id, fields validated against the DDIC):
*   MM.PO.* / MM.GR.*  EKKO (EBELN), EKPO + EKET (EBELN + selected EBELP, all
*                      items not deleted when none), MARA (EKPO-MATNR),
*                      MARC (MATNR + WERKS), MBEW (MATNR + BWKEY of the plant)
*   PP.ORD.*           AUFK, AFKO, AFPO (AUFNR), MARA / MARC (AFPO-MATNR / PWERK),
*                      plus two derived facts: JEST-STAT (one row per ACTIVE status of the
*                      order, level H) and T003O-STSMA (status profile of the order type)
*   FI.*               BKPF (header) + BSEG (lines) by bukrs + belnr + gjahr through FI_DOCUMENT_READ,
*                      T001 (bukrs); JEST-STAT / T003O-STSMA of the order given in aufnr. The partner
*                      fields BSEG-LIFNR / KUNNR / EMPFB are never returned.
*   CO.*               AUFK + JEST-STAT / T003O-STSMA of the internal order in aufnr
*   EKET = first schedule line of the item. Any other table: per-field error.
*
* Exists scope: the table must be listed in the TVARVC selection option
* ZMCP_BIZ_PRECHECK_TABLES (TYPE S, SIGN I, OPTI EQ, LOW = table name).
* Wire format of one query:  TABLE?COND&COND  with COND = COL=value or
* COL:op:value (op ne lt le gt ge); a column may carry a suffix #n; values are
* percent-encoded for % & = : ?; $UNAME / $DATUM are replaced here.
* Columns are validated against the DDIC, values are escaped (quotes doubled)
* and typed from the DDIC, never concatenated raw into the WHERE.
*
* Read only, logs nothing, allowed in production clients.
* 7.31 syntax (no inline declarations, no constructor operators, no string
* templates in method call parameters) so one source serves ECC 7.31,
* ECC 7.40 and S/4HANA.

  PUBLIC SECTION.
    CONSTANTS:
      c_allow_name TYPE tvarvc-name VALUE 'ZMCP_BIZ_PRECHECK_TABLES',
      c_max_fields TYPE i VALUE 300,
      c_max_exists TYPE i VALUE 100.

    CLASS-METHODS run
      IMPORTING
        iv_action  TYPE string
        is_params  TYPE zif_mcp_biz_action=>ty_params
      EXPORTING
        ev_subrc   TYPE i
        ev_message TYPE string
        et_facts   TYPE zif_mcp_biz_action=>ty_pc_facts
        et_answers TYPE zif_mcp_biz_action=>ty_pc_answers.

    " ---- from ZCL_MCP_BIZ_PRE_SD (PRECHECK of the SD actions)
    CONSTANTS:
      c_sd_max_fields TYPE i VALUE 300,
      c_sd_max_exists TYPE i VALUE 100.

    CLASS-METHODS run_sd
      IMPORTING
        iv_action  TYPE string
        is_params  TYPE zif_mcp_biz_action=>ty_params
      EXPORTING
        ev_subrc   TYPE i
        ev_message TYPE string
        et_facts   TYPE zif_mcp_biz_action=>ty_pc_facts
        et_answers TYPE zif_mcp_biz_action=>ty_pc_answers.

  PRIVATE SECTION.
    " ---- from ZCL_MCP_BIZ_PRE_SD
    TYPES:
      BEGIN OF ty_sd_req,
        tab   TYPE string,
        field TYPE string,
        name  TYPE string,
      END OF ty_sd_req,
      ty_sd_reqs   TYPE STANDARD TABLE OF ty_sd_req WITH DEFAULT KEY,
      ty_t_vbap TYPE STANDARD TABLE OF vbap WITH DEFAULT KEY,
      ty_t_lips TYPE STANDARD TABLE OF lips WITH DEFAULT KEY,
      ty_t_vbrp TYPE STANDARD TABLE OF vbrp WITH DEFAULT KEY.

    CLASS-METHODS sd_in_scope
      IMPORTING iv_scope     TYPE string
                iv_table     TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS sd_has_req
      IMPORTING it_req       TYPE ty_sd_reqs
                iv_table     TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS blocked
      IMPORTING iv_field     TYPE string
      RETURNING VALUE(rv_no) TYPE abap_bool.

    CLASS-METHODS sd_parse_requests
      IMPORTING iv_scope  TYPE string
                it_fields TYPE string_table
      EXPORTING et_req    TYPE ty_sd_reqs
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS sd_format_value
      IMPORTING iv_value        TYPE any
      RETURNING VALUE(rv_value) TYPE string.

    CLASS-METHODS sd_add_row_facts
      IMPORTING iv_table TYPE string
                iv_level TYPE c
                iv_item  TYPE string
                is_row   TYPE any
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS sd_add_missing
      IMPORTING iv_table TYPE string
                iv_level TYPE c
                iv_item  TYPE string
                iv_text  TYPE string
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS missing_set
      IMPORTING iv_scope TYPE string
                iv_text  TYPE string
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS add_marc
      IMPORTING iv_item  TYPE string
                iv_matnr TYPE mara-matnr
                iv_werks TYPE marc-werks
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_order
      IMPORTING iv_vbeln TYPE vbak-vbeln
                iv_posnr TYPE vbap-posnr
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_dlv
      IMPORTING iv_vbeln TYPE vbak-vbeln
                iv_posnr TYPE vbap-posnr
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_bil
      IMPORTING iv_vbeln TYPE vbak-vbeln
                iv_posnr TYPE vbap-posnr
                it_req   TYPE ty_sd_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    " ---- PRECHECK (MM, PP, FI, CO)
    TYPES:
      BEGIN OF ty_req,
        tab   TYPE string,
        field TYPE string,
        name  TYPE string,
      END OF ty_req,
      ty_reqs     TYPE STANDARD TABLE OF ty_req WITH DEFAULT KEY,
      ty_r_ebelp  TYPE RANGE OF ekpo-ebelp,
      ty_t_ekpo   TYPE STANDARD TABLE OF ekpo WITH DEFAULT KEY,
      ty_t_afpo   TYPE STANDARD TABLE OF afpo WITH DEFAULT KEY.

    CLASS-METHODS in_scope
      IMPORTING iv_scope     TYPE string
                iv_table     TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS has_req
      IMPORTING it_req       TYPE ty_reqs
                iv_table     TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS parse_requests
      IMPORTING iv_scope  TYPE string
                it_fields TYPE string_table
      EXPORTING et_req    TYPE ty_reqs
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS add_row_facts
      IMPORTING iv_table TYPE string
                iv_level TYPE c
                iv_item  TYPE string
                is_row   TYPE any
                it_req   TYPE ty_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS add_missing
      IMPORTING iv_table TYPE string
                iv_level TYPE c
                iv_item  TYPE string
                iv_text  TYPE string
                it_req   TYPE ty_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS format_value
      IMPORTING iv_value        TYPE any
      RETURNING VALUE(rv_value) TYPE string.

    CLASS-METHODS read_mm
      IMPORTING iv_key    TYPE string
                it_ebelp  TYPE string_table
                it_req    TYPE ty_reqs
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_pp
      IMPORTING iv_key    TYPE string
                it_req    TYPE ty_reqs
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS add_status_facts
      IMPORTING iv_objnr TYPE aufk-objnr
                iv_auart TYPE aufk-auart
                it_req   TYPE ty_reqs
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_fi
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
                iv_key    TYPE string
                it_req    TYPE ty_reqs
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_co
      IMPORTING iv_key    TYPE string
                it_req    TYPE ty_reqs
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS read_order_facts
      IMPORTING iv_aufnr  TYPE string
                it_req    TYPE ty_reqs
                iv_aufk   TYPE abap_bool
      CHANGING  ct_facts  TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS auth_order_pc
      IMPORTING iv_auart     TYPE aufk-auart
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS auth_doc_pc
      IMPORTING iv_bukrs     TYPE bkpf-bukrs
                iv_blart     TYPE bkpf-blart
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS auth_pp
      IMPORTING iv_werks     TYPE aufk-werks
                iv_auart     TYPE aufk-auart
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS add_material_facts
      IMPORTING iv_item  TYPE string
                iv_matnr TYPE mara-matnr
                iv_werks TYPE marc-werks
                it_req   TYPE ty_reqs
                iv_mbew  TYPE abap_bool
      CHANGING  ct_facts TYPE zif_mcp_biz_action=>ty_pc_facts.

    CLASS-METHODS answer_query
      IMPORTING iv_query         TYPE string
      RETURNING VALUE(rs_answer) TYPE zif_mcp_biz_action=>ty_pc_answer.

    CLASS-METHODS decode
      IMPORTING iv_in         TYPE string
      RETURNING VALUE(rv_out) TYPE string.

    CLASS-METHODS table_allowed
      IMPORTING iv_table     TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    CLASS-METHODS build_literal
      IMPORTING is_dfies   TYPE dfies
                iv_value   TYPE string
      EXPORTING ev_literal TYPE string
                ev_error   TYPE string.

ENDCLASS.



CLASS zcl_mcp_biz_precheck IMPLEMENTATION.

  METHOD run.
    DATA: lv_scope  TYPE string,
          lv_key    TYPE string,
          lt_req    TYPE ty_reqs,
          ls_fact   TYPE zif_mcp_biz_action=>ty_pc_fact,
          lv_query  TYPE string,
          ls_answer TYPE zif_mcp_biz_action=>ty_pc_answer.

    CLEAR: ev_subrc, ev_message, et_facts, et_answers.

    IF iv_action CP 'MM.PO.*' OR iv_action CP 'MM.GR.*'.
      lv_scope = 'MM'.
      lv_key   = is_params-ebeln.
    ELSEIF iv_action CP 'PP.ORD.*'.
      lv_scope = 'PP'.
      lv_key   = is_params-aufnr.
    ELSEIF iv_action CP 'FI.*'.
      lv_scope = 'FI'.
      lv_key   = is_params-belnr.
    ELSEIF iv_action CP 'CO.*'.
      lv_scope = 'CO'.
      lv_key   = is_params-aufnr.
    ELSE.
      ev_subrc   = 4.
      ev_message = 'PRECHECK is not available for this action'.
      RETURN.
    ENDIF.
    CONDENSE lv_key.

    IF lines( is_params-fields ) > c_max_fields OR lines( is_params-exists ) > c_max_exists.
      ev_subrc   = 4.
      ev_message = 'Too many fields or exists queries'.
      RETURN.
    ENDIF.
    IF strlen( lv_key ) > 12 OR ( ( lv_scope = 'MM' OR lv_scope = 'FI' ) AND strlen( lv_key ) > 10 ).
      ev_subrc   = 4.
      ev_message = 'Invalid document key'.
      RETURN.
    ENDIF.
    IF lv_key IS INITIAL AND lv_scope <> 'FI' AND ( is_params-fields IS NOT INITIAL OR is_params-exists IS INITIAL ).
      ev_subrc = 4.
      IF lv_scope = 'MM'.
        ev_message = 'PRECHECK needs the document key ebeln (or only exists queries)'.
      ELSE.
        ev_message = 'PRECHECK needs the document key aufnr (or only exists queries)'.
      ENDIF.
      RETURN.
    ENDIF.

    " Always-present facts.
    ls_fact-level = 'H'.
    ls_fact-name  = 'SY-UNAME'.
    ls_fact-value = sy-uname.
    APPEND ls_fact TO et_facts.
    ls_fact-name  = 'SY-DATUM'.
    ls_fact-value = sy-datum.
    APPEND ls_fact TO et_facts.

    IF is_params-fields IS NOT INITIAL AND ( lv_key IS NOT INITIAL OR lv_scope = 'FI' ).
      parse_requests( EXPORTING iv_scope  = lv_scope
                                it_fields = is_params-fields
                      IMPORTING et_req    = lt_req
                      CHANGING  ct_facts  = et_facts ).
      IF lt_req IS NOT INITIAL.
        CASE lv_scope.
          WHEN 'MM'.
            read_mm( EXPORTING iv_key   = lv_key
                               it_ebelp = is_params-ebelp
                               it_req   = lt_req
                     CHANGING  ct_facts = et_facts ).
          WHEN 'PP'.
            read_pp( EXPORTING iv_key   = lv_key
                               it_req   = lt_req
                     CHANGING  ct_facts = et_facts ).
          WHEN 'FI'.
            read_fi( EXPORTING is_params = is_params
                               iv_key    = lv_key
                               it_req    = lt_req
                     CHANGING  ct_facts  = et_facts ).
          WHEN 'CO'.
            read_co( EXPORTING iv_key   = lv_key
                               it_req   = lt_req
                     CHANGING  ct_facts = et_facts ).
        ENDCASE.
      ENDIF.
    ENDIF.

    LOOP AT is_params-exists INTO lv_query.
      ls_answer = answer_query( lv_query ).
      APPEND ls_answer TO et_answers.
    ENDLOOP.
  ENDMETHOD.


  METHOD in_scope.
    IF iv_scope = 'MM'.
      CASE iv_table.
        WHEN 'EKKO' OR 'EKPO' OR 'EKET' OR 'MARA' OR 'MARC' OR 'MBEW'.
          rv_ok = abap_true.
      ENDCASE.
    ELSEIF iv_scope = 'PP'.
      CASE iv_table.
        WHEN 'AUFK' OR 'AFKO' OR 'AFPO' OR 'MARA' OR 'MARC'.
          rv_ok = abap_true.
      ENDCASE.
    ELSEIF iv_scope = 'FI'.
      CASE iv_table.
        WHEN 'BKPF' OR 'BSEG' OR 'T001'.
          rv_ok = abap_true.
      ENDCASE.
    ELSEIF iv_scope = 'CO'.
      IF iv_table = 'AUFK'.
        rv_ok = abap_true.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD has_req.
    READ TABLE it_req TRANSPORTING NO FIELDS WITH KEY tab = iv_table.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD parse_requests.
    DATA: lv_field TYPE string,
          ls_req   TYPE ty_req,
          ls_fact  TYPE zif_mcp_biz_action=>ty_pc_fact.

    CLEAR et_req.
    LOOP AT it_fields INTO lv_field.
      CONDENSE lv_field.
      lv_field = to_upper( lv_field ).
      IF lv_field IS INITIAL OR lv_field = 'SY-UNAME' OR lv_field = 'SY-DATUM'.
        CONTINUE.
      ENDIF.
      CLEAR ls_fact.
      ls_fact-level = 'H'.
      ls_fact-name  = lv_field.
      " TABLE-FIELD only: no offsets; the field must not start with a digit
      " (ASSIGN COMPONENT would read it as a column index).
      FIND REGEX '^[A-Z0-9_/]+-[A-Z_/][A-Z0-9_/]*$' IN lv_field.
      IF sy-subrc <> 0.
        ls_fact-error = 'Invalid field name: use TABLE-FIELD'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      READ TABLE et_req TRANSPORTING NO FIELDS WITH KEY name = lv_field.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      CLEAR ls_req.
      SPLIT lv_field AT '-' INTO ls_req-tab ls_req-field.
      ls_req-name = lv_field.
      IF ( iv_scope = 'PP' OR iv_scope = 'CO' OR iv_scope = 'FI' )
         AND ( lv_field = 'JEST-STAT' OR lv_field = 'T003O-STSMA' ).
        APPEND ls_req TO et_req.
        CONTINUE.
      ENDIF.
      IF in_scope( iv_scope = iv_scope iv_table = ls_req-tab ) = abap_false.
        ls_fact-error = 'Table not allowed for this action'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      IF ls_req-tab = 'BSEG' AND ( ls_req-field = 'LIFNR' OR ls_req-field = 'KUNNR' OR ls_req-field = 'EMPFB' ).
        ls_fact-error = 'Partner fields are not returned'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      APPEND ls_req TO et_req.
    ENDLOOP.
  ENDMETHOD.


  METHOD format_value.
    DATA: lo_type TYPE REF TO cl_abap_typedescr,
          lv_len  TYPE i.

    lo_type = cl_abap_typedescr=>describe_by_data( iv_value ).
    rv_value = iv_value.
    CASE lo_type->type_kind.
      WHEN 'P' OR 'I' OR 'b' OR 's' OR '8' OR 'a' OR 'e' OR 'F'.
        " Numbers: no blanks, minus sign in front, '.' as decimal separator.
        CONDENSE rv_value.
        lv_len = strlen( rv_value ).
        IF lv_len > 1.
          lv_len = lv_len - 1.
          IF rv_value+lv_len(1) = '-'.
            rv_value = rv_value(lv_len).
            CONCATENATE '-' rv_value INTO rv_value.
          ENDIF.
        ENDIF.
    ENDCASE.
  ENDMETHOD.


  METHOD add_row_facts.
    DATA: ls_fact TYPE zif_mcp_biz_action=>ty_pc_fact,
          lo_desc TYPE REF TO cl_abap_typedescr,
          lo_str  TYPE REF TO cl_abap_structdescr,
          lv_name TYPE abap_compname.
    FIELD-SYMBOLS: <ls_req> TYPE ty_req,
                   <lv_val> TYPE any.

    lo_str ?= cl_abap_typedescr=>describe_by_data( is_row ).
    LOOP AT it_req ASSIGNING <ls_req> WHERE tab = iv_table.
      CLEAR ls_fact.
      ls_fact-level = iv_level.
      ls_fact-item  = iv_item.
      ls_fact-name  = <ls_req>-name.
      lv_name = <ls_req>-field.
      " DDIC check: the field must be a component of the DDIC structure.
      READ TABLE lo_str->components TRANSPORTING NO FIELDS WITH KEY name = lv_name.
      IF sy-subrc <> 0.
        ls_fact-error = 'Unknown field (not in the DDIC structure)'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      ASSIGN COMPONENT lv_name OF STRUCTURE is_row TO <lv_val>.
      IF sy-subrc <> 0.
        ls_fact-error = 'Unknown field (not in the DDIC structure)'.
      ELSE.
        lo_desc = cl_abap_typedescr=>describe_by_data( <lv_val> ).
        IF lo_desc->kind = cl_abap_typedescr=>kind_elem.
          ls_fact-value = format_value( <lv_val> ).
        ELSE.
          ls_fact-error = 'Not an elementary field'.
        ENDIF.
      ENDIF.
      APPEND ls_fact TO ct_facts.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_missing.
    DATA ls_fact TYPE zif_mcp_biz_action=>ty_pc_fact.
    FIELD-SYMBOLS <ls_req> TYPE ty_req.

    LOOP AT it_req ASSIGNING <ls_req> WHERE tab = iv_table.
      CLEAR ls_fact.
      ls_fact-level = iv_level.
      ls_fact-item  = iv_item.
      ls_fact-name  = <ls_req>-name.
      ls_fact-error = iv_text.
      APPEND ls_fact TO ct_facts.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_material_facts.
    DATA: ls_mara  TYPE mara,
          ls_marc  TYPE marc,
          ls_mbew  TYPE mbew,
          lv_bwkey TYPE t001w-bwkey.

    IF has_req( it_req = it_req iv_table = 'MARA' ) = abap_true.
      SELECT SINGLE * FROM mara INTO ls_mara WHERE matnr = iv_matnr.
      IF sy-subrc = 0.
        add_row_facts( EXPORTING iv_table = 'MARA' iv_level = 'I' iv_item = iv_item
                                 is_row = ls_mara it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        add_missing( EXPORTING iv_table = 'MARA' iv_level = 'I' iv_item = iv_item
                               iv_text = 'Material not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.
    IF has_req( it_req = it_req iv_table = 'MARC' ) = abap_true.
      SELECT SINGLE * FROM marc INTO ls_marc WHERE matnr = iv_matnr AND werks = iv_werks.
      IF sy-subrc = 0.
        add_row_facts( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = iv_item
                                 is_row = ls_marc it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = iv_item
                               iv_text = 'Material / plant data not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.
    IF iv_mbew = abap_true AND has_req( it_req = it_req iv_table = 'MBEW' ) = abap_true.
      SELECT SINGLE bwkey FROM t001w INTO lv_bwkey WHERE werks = iv_werks.
      IF sy-subrc = 0.
        SELECT SINGLE * FROM mbew INTO ls_mbew
          WHERE matnr = iv_matnr AND bwkey = lv_bwkey AND bwtar = space.
      ENDIF.
      IF sy-subrc = 0.
        add_row_facts( EXPORTING iv_table = 'MBEW' iv_level = 'I' iv_item = iv_item
                                 is_row = ls_mbew it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        add_missing( EXPORTING iv_table = 'MBEW' iv_level = 'I' iv_item = iv_item
                               iv_text = 'Valuation data not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD read_mm.
    DATA: lv_ebeln TYPE ekko-ebeln,
          ls_ekko  TYPE ekko,
          lt_ekpo  TYPE ty_t_ekpo,
          ls_ekpo  TYPE ekpo,
          ls_eket  TYPE eket,
          lr_ebelp TYPE ty_r_ebelp,
          ls_r     LIKE LINE OF lr_ebelp,
          lv_p     TYPE string,
          lv_posnr TYPE ekpo-ebelp,
          lv_item  TYPE string,
          lv_need  TYPE abap_bool.

    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = iv_key
      IMPORTING
        output = lv_ebeln.

    " Header: always read (the authorization check needs EKGRP).
    SELECT SINGLE * FROM ekko INTO ls_ekko WHERE ebeln = lv_ebeln.
    IF sy-subrc <> 0.
      add_missing( EXPORTING iv_table = 'EKKO' iv_level = 'H' iv_item = ''
                             iv_text = 'Purchasing document not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'M_BEST_EKG'
      ID 'ACTVT' FIELD '03'
      ID 'EKGRP' FIELD ls_ekko-ekgrp.
    IF sy-subrc <> 0.
      add_missing( EXPORTING iv_table = 'EKKO' iv_level = 'H' iv_item = ''
                             iv_text = 'No authorization for this purchasing group' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    IF has_req( it_req = it_req iv_table = 'EKKO' ) = abap_true.
      add_row_facts( EXPORTING iv_table = 'EKKO' iv_level = 'H' iv_item = ''
                               is_row = ls_ekko it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDIF.

    LOOP AT it_req TRANSPORTING NO FIELDS WHERE tab <> 'EKKO'.
      lv_need = abap_true.
      EXIT.
    ENDLOOP.
    IF lv_need = abap_false.
      RETURN.
    ENDIF.

    " Items: the selected EBELP, all items not deleted when none.
    LOOP AT it_ebelp INTO lv_p.
      CONDENSE lv_p.
      IF lv_p IS INITIAL OR strlen( lv_p ) > 5 OR lv_p CN '0123456789'.
        CONTINUE.
      ENDIF.
      lv_posnr = lv_p.
      ls_r-sign   = 'I'.
      ls_r-option = 'EQ'.
      ls_r-low    = lv_posnr.
      APPEND ls_r TO lr_ebelp.
    ENDLOOP.
    IF lr_ebelp IS INITIAL.
      SELECT * FROM ekpo INTO TABLE lt_ekpo
        WHERE ebeln = lv_ebeln AND loekz <> 'L'.
    ELSE.
      SELECT * FROM ekpo INTO TABLE lt_ekpo
        WHERE ebeln = lv_ebeln AND ebelp IN lr_ebelp.
    ENDIF.
    SORT lt_ekpo BY ebelp.
    IF lt_ekpo IS INITIAL.
      add_missing( EXPORTING iv_table = 'EKPO' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'EKET' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARA' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MBEW' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.

    LOOP AT lt_ekpo INTO ls_ekpo.
      lv_item = ls_ekpo-ebelp.
      IF has_req( it_req = it_req iv_table = 'EKPO' ) = abap_true.
        add_row_facts( EXPORTING iv_table = 'EKPO' iv_level = 'I' iv_item = lv_item
                                 is_row = ls_ekpo it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ENDIF.
      IF has_req( it_req = it_req iv_table = 'EKET' ) = abap_true.
        CLEAR ls_eket.
        SELECT * FROM eket INTO ls_eket UP TO 1 ROWS
          WHERE ebeln = ls_ekpo-ebeln AND ebelp = ls_ekpo-ebelp
          ORDER BY PRIMARY KEY.
        ENDSELECT.
        IF sy-subrc = 0.
          add_row_facts( EXPORTING iv_table = 'EKET' iv_level = 'I' iv_item = lv_item
                                   is_row = ls_eket it_req = it_req
                         CHANGING  ct_facts = ct_facts ).
        ELSE.
          add_missing( EXPORTING iv_table = 'EKET' iv_level = 'I' iv_item = lv_item
                                 iv_text = 'No schedule line' it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
        ENDIF.
      ENDIF.
      add_material_facts( EXPORTING iv_item = lv_item iv_matnr = ls_ekpo-matnr
                                    iv_werks = ls_ekpo-werks it_req = it_req
                                    iv_mbew = abap_true
                          CHANGING  ct_facts = ct_facts ).
    ENDLOOP.
  ENDMETHOD.


  METHOD add_status_facts.
    DATA: lt_stat  TYPE STANDARD TABLE OF jest-stat WITH DEFAULT KEY,
          lv_stat  TYPE jest-stat,
          lv_stsma TYPE t003o-stsma,
          ls_fact  TYPE zif_mcp_biz_action=>ty_pc_fact.

    " JEST-STAT: one row per ACTIVE status (system and user) of the order. No row = no active
    " status. The status profile STSMA of the order type is a customizing value, no business data.
    IF has_req( it_req = it_req iv_table = 'JEST' ) = abap_true.
      SELECT stat FROM jest INTO TABLE lt_stat WHERE objnr = iv_objnr AND inact = space.
      SORT lt_stat.
      LOOP AT lt_stat INTO lv_stat.
        CLEAR ls_fact.
        ls_fact-level = 'H'.
        ls_fact-name  = 'JEST-STAT'.
        ls_fact-value = lv_stat.
        APPEND ls_fact TO ct_facts.
      ENDLOOP.
    ENDIF.
    IF has_req( it_req = it_req iv_table = 'T003O' ) = abap_true.
      SELECT SINGLE stsma FROM t003o INTO lv_stsma WHERE auart = iv_auart.
      IF sy-subrc = 0.
        CLEAR ls_fact.
        ls_fact-level = 'H'.
        ls_fact-name  = 'T003O-STSMA'.
        ls_fact-value = lv_stsma.
        APPEND ls_fact TO ct_facts.
      ELSE.
        add_missing( EXPORTING iv_table = 'T003O' iv_level = 'H' iv_item = ''
                               iv_text = 'Order type not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD read_pp.
    DATA: lv_aufnr TYPE aufk-aufnr,
          ls_aufk  TYPE aufk,
          ls_afko  TYPE afko,
          lt_afpo  TYPE ty_t_afpo,
          ls_afpo  TYPE afpo,
          lv_item  TYPE string,
          lv_need  TYPE abap_bool.

    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = iv_key
      IMPORTING
        output = lv_aufnr.

    SELECT SINGLE * FROM aufk INTO ls_aufk WHERE aufnr = lv_aufnr.
    IF sy-subrc <> 0.
      add_missing( EXPORTING iv_table = 'AUFK' iv_level = 'H' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'AFKO' iv_level = 'H' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'AFPO' iv_level = 'I' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARA' iv_level = 'I' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'JEST' iv_level = 'H' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'T003O' iv_level = 'H' iv_item = ''
                             iv_text = 'Production order not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    IF auth_pp( iv_werks = ls_aufk-werks iv_auart = ls_aufk-auart ) = abap_false.
      add_missing( EXPORTING iv_table = 'AUFK' iv_level = 'H' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'AFKO' iv_level = 'H' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'AFPO' iv_level = 'I' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARA' iv_level = 'I' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'JEST' iv_level = 'H' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'T003O' iv_level = 'H' iv_item = ''
                             iv_text = 'No authorization for this plant / order type' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.

    IF has_req( it_req = it_req iv_table = 'AUFK' ) = abap_true.
      add_row_facts( EXPORTING iv_table = 'AUFK' iv_level = 'H' iv_item = ''
                               is_row = ls_aufk it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDIF.
    IF has_req( it_req = it_req iv_table = 'JEST' ) = abap_true OR has_req( it_req = it_req iv_table = 'T003O' ) = abap_true.
      add_status_facts( EXPORTING iv_objnr = ls_aufk-objnr iv_auart = ls_aufk-auart it_req = it_req
                        CHANGING  ct_facts = ct_facts ).
    ENDIF.
    IF has_req( it_req = it_req iv_table = 'AFKO' ) = abap_true.
      SELECT SINGLE * FROM afko INTO ls_afko WHERE aufnr = lv_aufnr.
      IF sy-subrc = 0.
        add_row_facts( EXPORTING iv_table = 'AFKO' iv_level = 'H' iv_item = ''
                                 is_row = ls_afko it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        add_missing( EXPORTING iv_table = 'AFKO' iv_level = 'H' iv_item = ''
                               iv_text = 'Order header data not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.

    LOOP AT it_req TRANSPORTING NO FIELDS WHERE tab = 'AFPO' OR tab = 'MARA' OR tab = 'MARC'.
      lv_need = abap_true.
      EXIT.
    ENDLOOP.
    IF lv_need = abap_false.
      RETURN.
    ENDIF.

    SELECT * FROM afpo INTO TABLE lt_afpo WHERE aufnr = lv_aufnr ORDER BY PRIMARY KEY.
    IF lt_afpo IS INITIAL.
      add_missing( EXPORTING iv_table = 'AFPO' iv_level = 'I' iv_item = ''
                             iv_text = 'No order item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARA' iv_level = 'I' iv_item = ''
                             iv_text = 'No order item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = ''
                             iv_text = 'No order item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    LOOP AT lt_afpo INTO ls_afpo.
      lv_item = ls_afpo-posnr.
      IF has_req( it_req = it_req iv_table = 'AFPO' ) = abap_true.
        add_row_facts( EXPORTING iv_table = 'AFPO' iv_level = 'I' iv_item = lv_item
                                 is_row = ls_afpo it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ENDIF.
      add_material_facts( EXPORTING iv_item = lv_item iv_matnr = ls_afpo-matnr
                                    iv_werks = ls_afpo-pwerk it_req = it_req
                                    iv_mbew = abap_false
                          CHANGING  ct_facts = ct_facts ).
    ENDLOOP.
  ENDMETHOD.


  METHOD read_fi.
    DATA: lv_bukrs TYPE bkpf-bukrs,
          lv_belnr TYPE bkpf-belnr,
          lv_gjahr TYPE bkpf-gjahr,
          lv_in    TYPE c LENGTH 10,
          lv_ok    TYPE abap_bool,
          lt_bkpf  TYPE STANDARD TABLE OF bkpf,
          ls_bkpf  TYPE bkpf,
          lt_bseg  TYPE STANDARD TABLE OF bseg,
          ls_bseg  TYPE bseg,
          lv_item  TYPE string,
          lv_text  TYPE string,
          ls_t001  TYPE t001.

    " Document header and lines: key = bukrs + belnr + gjahr, read by FI_DOCUMENT_READ.
    IF has_req( it_req = it_req iv_table = 'BKPF' ) = abap_true OR has_req( it_req = it_req iv_table = 'BSEG' ) = abap_true.
      lv_bukrs = to_upper( is_params-bukrs ).
      lv_gjahr = is_params-gjahr.
      IF iv_key IS NOT INITIAL AND iv_key CO '0123456789 '.
        lv_in = iv_key.
        CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
          EXPORTING
            input  = lv_in
          IMPORTING
            output = lv_belnr.
      ENDIF.
      IF lv_bukrs IS INITIAL OR strlen( is_params-bukrs ) > 4 OR lv_belnr IS INITIAL
         OR strlen( is_params-gjahr ) <> 4 OR is_params-gjahr CN '0123456789'.
        lv_text = 'Document key (bukrs, belnr, gjahr) is incomplete'.
      ELSEIF auth_doc_pc( iv_bukrs = lv_bukrs iv_blart = space ) = abap_false.
        lv_text = 'No authorization for this company code'.
      ELSE.
        CALL FUNCTION 'FI_DOCUMENT_READ'
          EXPORTING
            i_bukrs     = lv_bukrs
            i_belnr     = lv_belnr
            i_gjahr     = lv_gjahr
          TABLES
            t_bkpf      = lt_bkpf
            t_bseg      = lt_bseg
          EXCEPTIONS
            wrong_input = 1
            not_found   = 2
            OTHERS      = 3.
        IF sy-subrc <> 0.
          lv_text = 'Document not found'.
        ELSE.
          READ TABLE lt_bkpf INTO ls_bkpf INDEX 1.
          IF sy-subrc <> 0.
            lv_text = 'Document not found'.
          ELSEIF auth_doc_pc( iv_bukrs = lv_bukrs iv_blart = ls_bkpf-blart ) = abap_false.
            lv_text = 'No authorization for this document type'.
          ELSE.
            lv_ok = abap_true.
          ENDIF.
        ENDIF.
      ENDIF.
      IF lv_ok = abap_false.
        add_missing( EXPORTING iv_table = 'BKPF' iv_level = 'H' iv_item = ''
                               iv_text = lv_text it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
        add_missing( EXPORTING iv_table = 'BSEG' iv_level = 'I' iv_item = ''
                               iv_text = lv_text it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ELSE.
        IF has_req( it_req = it_req iv_table = 'BKPF' ) = abap_true.
          add_row_facts( EXPORTING iv_table = 'BKPF' iv_level = 'H' iv_item = ''
                                   is_row = ls_bkpf it_req = it_req
                         CHANGING  ct_facts = ct_facts ).
        ENDIF.
        IF has_req( it_req = it_req iv_table = 'BSEG' ) = abap_true.
          LOOP AT lt_bseg INTO ls_bseg.
            lv_item = ls_bseg-buzei.
            add_row_facts( EXPORTING iv_table = 'BSEG' iv_level = 'I' iv_item = lv_item
                                     is_row = ls_bseg it_req = it_req
                           CHANGING  ct_facts = ct_facts ).
          ENDLOOP.
        ENDIF.
      ENDIF.
    ENDIF.

    " Company code customizing (posting period variant, chart of accounts ...).
    IF has_req( it_req = it_req iv_table = 'T001' ) = abap_true.
      lv_bukrs = to_upper( is_params-bukrs ).
      SELECT SINGLE * FROM t001 INTO ls_t001 WHERE bukrs = lv_bukrs.
      IF sy-subrc = 0.
        add_row_facts( EXPORTING iv_table = 'T001' iv_level = 'H' iv_item = ''
                                 is_row = ls_t001 it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        add_missing( EXPORTING iv_table = 'T001' iv_level = 'H' iv_item = ''
                               iv_text = 'Company code not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.

    " Status of the order an FI line is posted to.
    IF has_req( it_req = it_req iv_table = 'JEST' ) = abap_true OR has_req( it_req = it_req iv_table = 'T003O' ) = abap_true.
      read_order_facts( EXPORTING iv_aufnr = is_params-aufnr it_req = it_req iv_aufk = abap_false
                        CHANGING  ct_facts = ct_facts ).
    ENDIF.
  ENDMETHOD.


  METHOD read_co.
    read_order_facts( EXPORTING iv_aufnr = iv_key it_req = it_req iv_aufk = abap_true
                      CHANGING  ct_facts = ct_facts ).
  ENDMETHOD.


  METHOD read_order_facts.
    DATA: lv_aufnr TYPE aufk-aufnr,
          lv_in    TYPE c LENGTH 12,
          ls_aufk  TYPE aufk,
          lv_text  TYPE string.

    IF iv_aufnr IS NOT INITIAL AND strlen( iv_aufnr ) <= 12 AND iv_aufnr CO '0123456789 '.
      lv_in = iv_aufnr.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING
          input  = lv_in
        IMPORTING
          output = lv_aufnr.
    ENDIF.
    IF lv_aufnr IS INITIAL.
      lv_text = 'Order number (aufnr) is missing or invalid'.
    ELSE.
      SELECT SINGLE * FROM aufk INTO ls_aufk WHERE aufnr = lv_aufnr.
      IF sy-subrc <> 0.
        lv_text = 'Order not found'.
      ELSEIF ( ls_aufk-autyp = '01' OR ls_aufk-autyp = '30' ) AND auth_order_pc( ls_aufk-auart ) = abap_false.
        lv_text = 'No authorization for this order type'.
      ELSEIF ls_aufk-autyp <> '01' AND ls_aufk-autyp <> '30' AND iv_aufk = abap_true.
        lv_text = 'Not a CO internal order (order category 01 or 30)'.
      ELSEIF ls_aufk-autyp <> '01' AND ls_aufk-autyp <> '30'.
        lv_text = 'Order category is not covered (CO internal orders 01 and 30 only)'.
      ENDIF.
    ENDIF.
    IF lv_text IS NOT INITIAL.
      add_missing( EXPORTING iv_table = 'AUFK' iv_level = 'H' iv_item = ''
                             iv_text = lv_text it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'JEST' iv_level = 'H' iv_item = ''
                             iv_text = lv_text it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      add_missing( EXPORTING iv_table = 'T003O' iv_level = 'H' iv_item = ''
                             iv_text = lv_text it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    IF iv_aufk = abap_true AND has_req( it_req = it_req iv_table = 'AUFK' ) = abap_true.
      add_row_facts( EXPORTING iv_table = 'AUFK' iv_level = 'H' iv_item = ''
                               is_row = ls_aufk it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDIF.
    add_status_facts( EXPORTING iv_objnr = ls_aufk-objnr iv_auart = ls_aufk-auart it_req = it_req
                      CHANGING  ct_facts = ct_facts ).
  ENDMETHOD.


  METHOD auth_order_pc.
    " K_ORDER, CO_ACTION 0003 = display master data.
    AUTHORITY-CHECK OBJECT 'K_ORDER'
      ID 'RESPAREA'  DUMMY
      ID 'AUFART'    FIELD iv_auart
      ID 'AUTHPHASE' DUMMY
      ID 'CO_ACTION' FIELD '0003'
      ID 'KSTAR'     DUMMY.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD auth_doc_pc.
    DATA lv_brgru TYPE t003-brgru.

    AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
      ID 'BUKRS' FIELD iv_bukrs
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    IF iv_blart IS NOT INITIAL.
      SELECT SINGLE brgru FROM t003 INTO lv_brgru WHERE blart = iv_blart.
      IF sy-subrc <> 0.
        RETURN.
      ENDIF.
      AUTHORITY-CHECK OBJECT 'F_BKPF_BLA'
        ID 'BRGRU' FIELD lv_brgru
        ID 'ACTVT' FIELD '03'.
      IF sy-subrc <> 0.
        RETURN.
      ENDIF.
    ENDIF.
    rv_ok = abap_true.
  ENDMETHOD.


  METHOD auth_pp.
    DATA: ls_tobj  TYPE tobj,
          lv_comp  TYPE string,
          lv_actvt TYPE abap_bool.
    FIELD-SYMBOLS <lv_f> TYPE any.

    " The field list of C_AFKO_AWK differs between systems: ACTVT is only
    " passed when the object has it (same logic as ZCL_MCP_BIZ_PP_ORD).
    SELECT SINGLE * FROM tobj INTO ls_tobj WHERE objct = 'C_AFKO_AWK'.
    DO 10 TIMES.
      lv_comp = |FIEL{ sy-index }|.
      ASSIGN COMPONENT lv_comp OF STRUCTURE ls_tobj TO <lv_f>.
      IF sy-subrc = 0 AND <lv_f> = 'ACTVT'.
        lv_actvt = abap_true.
      ENDIF.
    ENDDO.

    IF lv_actvt = abap_true.
      AUTHORITY-CHECK OBJECT 'C_AFKO_AWK'
        ID 'ACTVT'  FIELD '03'
        ID 'WERKS'  FIELD iv_werks
        ID 'AUFART' FIELD iv_auart.
    ELSE.
      AUTHORITY-CHECK OBJECT 'C_AFKO_AWK'
        ID 'WERKS'  FIELD iv_werks
        ID 'AUFART' FIELD iv_auart.
    ENDIF.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD table_allowed.
    DATA: lv_tab TYPE tvarvc-low,
          lv_low TYPE tvarvc-low.

    IF strlen( iv_table ) > 30.
      RETURN.
    ENDIF.
    lv_tab = iv_table.
    SELECT SINGLE low FROM tvarvc INTO lv_low
      WHERE name = c_allow_name AND type = 'S' AND sign = 'I' AND opti = 'EQ'
        AND low = lv_tab.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
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
        lv_t = substring( val = iv_in off = lv_i len = 2 ).
        lv_t = to_upper( lv_t ).
        CASE lv_t.
          WHEN '25'.
            lv_c = '%'.
            lv_i = lv_i + 2.
          WHEN '26'.
            lv_c = '&'.
            lv_i = lv_i + 2.
          WHEN '3D'.
            lv_c = '='.
            lv_i = lv_i + 2.
          WHEN '3A'.
            lv_c = ':'.
            lv_i = lv_i + 2.
          WHEN '3F'.
            lv_c = '?'.
            lv_i = lv_i + 2.
        ENDCASE.
      ENDIF.
      rv_out = rv_out && lv_c.
    ENDWHILE.
  ENDMETHOD.


  METHOD build_literal.
    DATA lv_len TYPE i.

    CLEAR: ev_literal, ev_error.
    CASE is_dfies-inttype.
      WHEN 'C' OR 'N'.
        lv_len = strlen( iv_value ).
        IF lv_len > is_dfies-leng.
          ev_error = |Value too long for column { is_dfies-fieldname }|.
          RETURN.
        ENDIF.
        ev_literal = iv_value.
        " Quotes are doubled: the value can never leave the literal.
        REPLACE ALL OCCURRENCES OF `'` IN ev_literal WITH `''`.
        ev_literal = `'` && ev_literal && `'`.
      WHEN 'D'.
        IF iv_value IS INITIAL.
          ev_literal = `'00000000'`.
        ELSEIF strlen( iv_value ) = 8 AND iv_value CO '0123456789'.
          ev_literal = `'` && iv_value && `'`.
        ELSE.
          ev_error = |Column { is_dfies-fieldname }: date must be YYYYMMDD|.
        ENDIF.
      WHEN 'T'.
        IF iv_value IS INITIAL.
          ev_literal = `'000000'`.
        ELSEIF strlen( iv_value ) = 6 AND iv_value CO '0123456789'.
          ev_literal = `'` && iv_value && `'`.
        ELSE.
          ev_error = |Column { is_dfies-fieldname }: time must be HHMMSS|.
        ENDIF.
      WHEN 'I' OR 'b' OR 's' OR 'P' OR 'F' OR '8'.
        FIND REGEX '^-?[0-9]+(\.[0-9]+)?$' IN iv_value.
        IF sy-subrc = 0.
          ev_literal = iv_value.
        ELSE.
          ev_error = |Column { is_dfies-fieldname }: number expected|.
        ENDIF.
      WHEN OTHERS.
        ev_error = |Column { is_dfies-fieldname } has a type that cannot be queried|.
    ENDCASE.
  ENDMETHOD.


  METHOD answer_query.
    DATA: lv_off     TYPE i,
          lv_off2    TYPE i,
          lv_eq      TYPE i,
          lv_co      TYPE i,
          lv_table   TYPE string,
          lv_rest    TYPE string,
          lt_conds   TYPE string_table,
          lv_cond    TYPE string,
          lv_col     TYPE string,
          lv_op      TYPE string,
          lv_val     TYPE string,
          lv_sym     TYPE string,
          lv_lit     TYPE string,
          lv_err     TYPE string,
          lv_line    TYPE string,
          lt_where   TYPE string_table,
          lo_type    TYPE REF TO cl_abap_typedescr,
          lo_struct  TYPE REF TO cl_abap_structdescr,
          lt_dfies   TYPE ddfields,
          ls_dfies   TYPE dfies,
          lv_cnt     TYPE i,
          lx_root    TYPE REF TO cx_root.

    rs_answer-query = iv_query.

    " TABLE?COND&COND
    FIND FIRST OCCURRENCE OF '?' IN iv_query MATCH OFFSET lv_off.
    IF sy-subrc <> 0.
      rs_answer-error = 'Query must be TABLE?COND&COND'.
      RETURN.
    ENDIF.
    lv_table = to_upper( substring( val = iv_query off = 0 len = lv_off ) ).
    lv_off   = lv_off + 1.
    lv_rest  = substring( val = iv_query off = lv_off ).
    FIND REGEX '^[A-Z0-9_/]+$' IN lv_table.
    IF sy-subrc <> 0.
      rs_answer-error = 'Invalid table name'.
      RETURN.
    ENDIF.
    IF table_allowed( lv_table ) = abap_false.
      rs_answer-error = 'table not allowed'.
      RETURN.
    ENDIF.
    IF lv_rest IS INITIAL.
      rs_answer-error = 'No condition'.
      RETURN.
    ENDIF.

    " DDIC column list.
    cl_abap_typedescr=>describe_by_name(
      EXPORTING  p_name       = lv_table
      RECEIVING  p_descr_ref  = lo_type
      EXCEPTIONS type_not_found = 1
                 OTHERS         = 2 ).
    IF sy-subrc <> 0 OR lo_type->kind <> cl_abap_typedescr=>kind_struct.
      rs_answer-error = 'Table not found in the DDIC'.
      RETURN.
    ENDIF.
    lo_struct ?= lo_type.
    CALL METHOD lo_struct->get_ddic_field_list
      RECEIVING
        p_field_list = lt_dfies
      EXCEPTIONS
        not_found    = 1
        no_ddic_type = 2
        OTHERS       = 3.
    IF sy-subrc <> 0 OR lt_dfies IS INITIAL.
      rs_answer-error = 'No DDIC field list for the table'.
      RETURN.
    ENDIF.

    SPLIT lv_rest AT '&' INTO TABLE lt_conds.
    LOOP AT lt_conds INTO lv_cond.
      IF lv_cond IS INITIAL.
        rs_answer-error = 'Empty condition'.
        RETURN.
      ENDIF.
      " The first '=' or ':' is the delimiter (values are encoded).
      lv_eq = -1.
      lv_co = -1.
      FIND FIRST OCCURRENCE OF '=' IN lv_cond MATCH OFFSET lv_off.
      IF sy-subrc = 0.
        lv_eq = lv_off.
      ENDIF.
      FIND FIRST OCCURRENCE OF ':' IN lv_cond MATCH OFFSET lv_off.
      IF sy-subrc = 0.
        lv_co = lv_off.
      ENDIF.
      IF lv_eq < 0 AND lv_co < 0.
        rs_answer-error = 'Condition must be COL=value or COL:op:value'.
        RETURN.
      ENDIF.
      IF lv_eq >= 0 AND ( lv_co < 0 OR lv_eq < lv_co ).
        lv_col = substring( val = lv_cond off = 0 len = lv_eq ).
        lv_off = lv_eq + 1.
        lv_val = substring( val = lv_cond off = lv_off ).
        lv_op  = '='.
      ELSE.
        lv_col = substring( val = lv_cond off = 0 len = lv_co ).
        lv_off = lv_co + 1.
        lv_rest = substring( val = lv_cond off = lv_off ).
        FIND FIRST OCCURRENCE OF ':' IN lv_rest MATCH OFFSET lv_off2.
        IF sy-subrc <> 0.
          rs_answer-error = 'Condition must be COL:op:value'.
          RETURN.
        ENDIF.
        lv_sym = to_lower( substring( val = lv_rest off = 0 len = lv_off2 ) ).
        lv_off2 = lv_off2 + 1.
        lv_val = substring( val = lv_rest off = lv_off2 ).
        CASE lv_sym.
          WHEN 'ne'.
            lv_op = '<>'.
          WHEN 'lt'.
            lv_op = '<'.
          WHEN 'le'.
            lv_op = '<='.
          WHEN 'gt'.
            lv_op = '>'.
          WHEN 'ge'.
            lv_op = '>='.
          WHEN OTHERS.
            rs_answer-error = |Unknown operator { lv_sym }|.
            RETURN.
        ENDCASE.
      ENDIF.

      " Column: strip the #n suffix, check against the DDIC.
      lv_col = to_upper( lv_col ).
      FIND FIRST OCCURRENCE OF '#' IN lv_col MATCH OFFSET lv_off.
      IF sy-subrc = 0.
        lv_col = substring( val = lv_col off = 0 len = lv_off ).
      ENDIF.
      FIND REGEX '^[A-Z_/][A-Z0-9_/]*$' IN lv_col.
      IF sy-subrc <> 0.
        rs_answer-error = 'Invalid column name'.
        RETURN.
      ENDIF.
      READ TABLE lt_dfies INTO ls_dfies WITH KEY fieldname = lv_col.
      IF sy-subrc <> 0.
        rs_answer-error = |Unknown column { lv_col }|.
        RETURN.
      ENDIF.
      IF ls_dfies-datatype = 'CLNT'.
        rs_answer-error = 'The client column cannot be queried'.
        RETURN.
      ENDIF.

      " Value: decode, substitute placeholders, type from the DDIC.
      lv_val = decode( lv_val ).
      IF lv_val = '$UNAME'.
        lv_val = sy-uname.
      ELSEIF lv_val = '$DATUM'.
        lv_val = sy-datum.
      ENDIF.
      build_literal( EXPORTING is_dfies = ls_dfies iv_value = lv_val
                     IMPORTING ev_literal = lv_lit ev_error = lv_err ).
      IF lv_err IS NOT INITIAL.
        rs_answer-error = lv_err.
        RETURN.
      ENDIF.

      lv_line = lv_col && ` ` && lv_op && ` ` && lv_lit.
      IF lt_where IS NOT INITIAL.
        lv_line = `AND ` && lv_line.
      ENDIF.
      APPEND lv_line TO lt_where.
    ENDLOOP.

    TRY.
        SELECT COUNT( * ) FROM (lv_table) INTO lv_cnt UP TO 1 ROWS
          WHERE (lt_where).
      CATCH cx_root INTO lx_root.
        rs_answer-error = lx_root->get_text( ).
        RETURN.
    ENDTRY.
    IF lv_cnt > 0.
      rs_answer-found = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD run_sd.
    DATA: lv_scope  TYPE string,
          lv_key    TYPE string,
          lv_vbeln  TYPE likp-vbeln,
          lv_chk    TYPE likp-vbeln,
          lv_posnr  TYPE vbap-posnr,
          lt_req    TYPE ty_sd_reqs,
          ls_fact   TYPE zif_mcp_biz_action=>ty_pc_fact,
          ls_ex     TYPE zif_mcp_biz_action=>ty_params,
          lv_rc     TYPE i,
          lv_msg    TYPE string.

    CLEAR: ev_subrc, ev_message, et_facts, et_answers.

    IF NOT iv_action CP 'SD.*'.
      ev_subrc   = 4.
      ev_message = 'PRECHECK is not available for this action'.
      RETURN.
    ENDIF.
    lv_key = is_params-vbeln.
    CASE iv_action.
      WHEN 'SD.DLV.POST_GI' OR 'SD.DLV.REVERSE_GI'.
        lv_scope = 'SDD'.
      WHEN 'SD.BIL.CANCEL' OR 'SD.BIL.GET_DETAIL'.
        lv_scope = 'SDB'.
      WHEN 'SD.BIL.CREATE'.
        lv_key   = is_params-ref_doc.
        lv_scope = 'SDO'.
      WHEN OTHERS.
        lv_scope = 'SDO'.
    ENDCASE.
    CONDENSE lv_key.

    IF lines( is_params-fields ) > c_sd_max_fields OR lines( is_params-exists ) > c_sd_max_exists.
      ev_subrc   = 4.
      ev_message = 'Too many fields or exists queries'.
      RETURN.
    ENDIF.
    IF strlen( lv_key ) > 10 OR ( lv_key IS NOT INITIAL AND lv_key CN '0123456789 ' ).
      ev_subrc   = 4.
      ev_message = 'Invalid document key'.
      RETURN.
    ENDIF.
    IF lv_key IS INITIAL AND ( is_params-fields IS NOT INITIAL OR is_params-exists IS INITIAL ).
      ev_subrc   = 4.
      ev_message = 'PRECHECK needs the document key vbeln (ref_doc for SD.BIL.CREATE) (or only exists queries)'.
      RETURN.
    ENDIF.

    " Always-present facts.
    ls_fact-level = 'H'.
    ls_fact-name  = 'SY-UNAME'.
    ls_fact-value = sy-uname.
    APPEND ls_fact TO et_facts.
    ls_fact-name  = 'SY-DATUM'.
    ls_fact-value = sy-datum.
    APPEND ls_fact TO et_facts.

    IF is_params-fields IS NOT INITIAL AND lv_key IS NOT INITIAL.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING
          input  = lv_key
        IMPORTING
          output = lv_vbeln.
      " Billing: a delivery as reference document is read like a delivery.
      IF iv_action = 'SD.BIL.CREATE'.
        SELECT SINGLE vbeln FROM likp INTO lv_chk WHERE vbeln = lv_vbeln.
        IF sy-subrc = 0.
          lv_scope = 'SDD'.
        ENDIF.
      ENDIF.
      IF is_params-posnr IS NOT INITIAL AND strlen( is_params-posnr ) <= 6 AND is_params-posnr CO '0123456789'.
        lv_posnr = is_params-posnr.
      ENDIF.
      sd_parse_requests( EXPORTING iv_scope  = lv_scope
                                it_fields = is_params-fields
                      IMPORTING et_req    = lt_req
                      CHANGING  ct_facts  = et_facts ).
      IF lt_req IS NOT INITIAL.
        CASE lv_scope.
          WHEN 'SDO'.
            read_order( EXPORTING iv_vbeln = lv_vbeln iv_posnr = lv_posnr it_req = lt_req
                        CHANGING  ct_facts = et_facts ).
          WHEN 'SDD'.
            read_dlv( EXPORTING iv_vbeln = lv_vbeln iv_posnr = lv_posnr it_req = lt_req
                      CHANGING  ct_facts = et_facts ).
          WHEN OTHERS.
            read_bil( EXPORTING iv_vbeln = lv_vbeln iv_posnr = lv_posnr it_req = lt_req
                      CHANGING  ct_facts = et_facts ).
        ENDCASE.
      ENDIF.
    ENDIF.

    " Existence queries: answered by the generic PRECHECK (exists-only call, no document key).
    IF is_params-exists IS NOT INITIAL.
      ls_ex-exists = is_params-exists.
      zcl_mcp_biz_precheck=>run( EXPORTING iv_action  = 'MM.PO.GET_DETAIL'
                                           is_params  = ls_ex
                                 IMPORTING ev_subrc   = lv_rc
                                           ev_message = lv_msg
                                           et_answers = et_answers ).
      IF lv_rc <> 0.
        ev_subrc   = lv_rc.
        ev_message = lv_msg.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD sd_in_scope.
    IF iv_scope = 'SDO'.
      CASE iv_table.
        WHEN 'VBAK' OR 'VBAP' OR 'VBEP' OR 'VBKD' OR 'VBUK' OR 'VBUP' OR 'MARC'.
          rv_ok = abap_true.
      ENDCASE.
    ELSEIF iv_scope = 'SDD'.
      CASE iv_table.
        WHEN 'LIKP' OR 'LIPS' OR 'VBUK' OR 'VBUP' OR 'MARC'.
          rv_ok = abap_true.
      ENDCASE.
    ELSEIF iv_scope = 'SDB'.
      CASE iv_table.
        WHEN 'VBRK' OR 'VBRP'.
          rv_ok = abap_true.
      ENDCASE.
    ENDIF.
  ENDMETHOD.


  METHOD sd_has_req.
    READ TABLE it_req TRANSPORTING NO FIELDS WITH KEY tab = iv_table.
    IF sy-subrc = 0.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD blocked.
    DATA lv_f TYPE string.

    " Columns with customer, partner or address data are never returned.
    lv_f = iv_field.
    IF lv_f CP 'KUN*' OR lv_f = 'KNKLI' OR lv_f CP 'ADR*' OR lv_f CP 'NAME*' OR lv_f CP 'LIFNR*'
       OR lv_f = 'STCEG' OR lv_f = 'XCPDK' OR lv_f CP 'TELF*' OR lv_f = 'STRAS' OR lv_f = 'ORT01'
       OR lv_f = 'PSTLZ' OR lv_f = 'LAND1' OR lv_f = 'REGIO'.
      rv_no = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD sd_parse_requests.
    DATA: lv_field TYPE string,
          ls_req   TYPE ty_sd_req,
          ls_fact  TYPE zif_mcp_biz_action=>ty_pc_fact.

    CLEAR et_req.
    LOOP AT it_fields INTO lv_field.
      CONDENSE lv_field.
      lv_field = to_upper( lv_field ).
      IF lv_field IS INITIAL OR lv_field = 'SY-UNAME' OR lv_field = 'SY-DATUM'.
        CONTINUE.
      ENDIF.
      CLEAR ls_fact.
      ls_fact-level = 'H'.
      ls_fact-name  = lv_field.
      " TABLE-FIELD only: no offsets; the field must not start with a digit
      " (ASSIGN COMPONENT would read it as a column index).
      FIND REGEX '^[A-Z0-9_/]+-[A-Z_/][A-Z0-9_/]*$' IN lv_field.
      IF sy-subrc <> 0.
        ls_fact-error = 'Invalid field name: use TABLE-FIELD'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      READ TABLE et_req TRANSPORTING NO FIELDS WITH KEY name = lv_field.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      CLEAR ls_req.
      SPLIT lv_field AT '-' INTO ls_req-tab ls_req-field.
      ls_req-name = lv_field.
      IF sd_in_scope( iv_scope = iv_scope iv_table = ls_req-tab ) = abap_false.
        ls_fact-error = 'Table not allowed for this action'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      IF blocked( ls_req-field ) = abap_true.
        ls_fact-error = 'Field not allowed (customer, partner or address data)'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      APPEND ls_req TO et_req.
    ENDLOOP.
  ENDMETHOD.


  METHOD sd_format_value.
    DATA: lo_type TYPE REF TO cl_abap_typedescr,
          lv_len  TYPE i.

    lo_type = cl_abap_typedescr=>describe_by_data( iv_value ).
    rv_value = iv_value.
    CASE lo_type->type_kind.
      WHEN 'P' OR 'I' OR 'b' OR 's' OR '8' OR 'a' OR 'e' OR 'F'.
        " Numbers: no blanks, minus sign in front, '.' as decimal separator.
        CONDENSE rv_value.
        lv_len = strlen( rv_value ).
        IF lv_len > 1.
          lv_len = lv_len - 1.
          IF rv_value+lv_len(1) = '-'.
            rv_value = rv_value(lv_len).
            CONCATENATE '-' rv_value INTO rv_value.
          ENDIF.
        ENDIF.
    ENDCASE.
  ENDMETHOD.


  METHOD sd_add_row_facts.
    DATA: ls_fact TYPE zif_mcp_biz_action=>ty_pc_fact,
          lo_desc TYPE REF TO cl_abap_typedescr,
          lo_str  TYPE REF TO cl_abap_structdescr,
          lv_name TYPE abap_compname.
    FIELD-SYMBOLS: <ls_req> TYPE ty_sd_req,
                   <lv_val> TYPE any.

    lo_str ?= cl_abap_typedescr=>describe_by_data( is_row ).
    LOOP AT it_req ASSIGNING <ls_req> WHERE tab = iv_table.
      CLEAR ls_fact.
      ls_fact-level = iv_level.
      ls_fact-item  = iv_item.
      ls_fact-name  = <ls_req>-name.
      lv_name = <ls_req>-field.
      " DDIC check: the field must be a component of the DDIC structure.
      READ TABLE lo_str->components TRANSPORTING NO FIELDS WITH KEY name = lv_name.
      IF sy-subrc <> 0.
        ls_fact-error = 'Unknown field (not in the DDIC structure)'.
        APPEND ls_fact TO ct_facts.
        CONTINUE.
      ENDIF.
      ASSIGN COMPONENT lv_name OF STRUCTURE is_row TO <lv_val>.
      IF sy-subrc <> 0.
        ls_fact-error = 'Unknown field (not in the DDIC structure)'.
      ELSE.
        lo_desc = cl_abap_typedescr=>describe_by_data( <lv_val> ).
        IF lo_desc->kind = cl_abap_typedescr=>kind_elem.
          ls_fact-value = sd_format_value( <lv_val> ).
        ELSE.
          ls_fact-error = 'Not an elementary field'.
        ENDIF.
      ENDIF.
      APPEND ls_fact TO ct_facts.
    ENDLOOP.
  ENDMETHOD.


  METHOD sd_add_missing.
    DATA ls_fact TYPE zif_mcp_biz_action=>ty_pc_fact.
    FIELD-SYMBOLS <ls_req> TYPE ty_sd_req.

    LOOP AT it_req ASSIGNING <ls_req> WHERE tab = iv_table.
      CLEAR ls_fact.
      ls_fact-level = iv_level.
      ls_fact-item  = iv_item.
      ls_fact-name  = <ls_req>-name.
      ls_fact-error = iv_text.
      APPEND ls_fact TO ct_facts.
    ENDLOOP.
  ENDMETHOD.


  METHOD missing_set.
    " The document level of every table of the scope gets the same per-field error.
    CASE iv_scope.
      WHEN 'SDO'.
        sd_add_missing( EXPORTING iv_table = 'VBAK' iv_level = 'H' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBUK' iv_level = 'H' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBKD' iv_level = 'H' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBAP' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBEP' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
      WHEN 'SDD'.
        sd_add_missing( EXPORTING iv_table = 'LIKP' iv_level = 'H' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBUK' iv_level = 'H' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'LIPS' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
      WHEN OTHERS.
        sd_add_missing( EXPORTING iv_table = 'VBRK' iv_level = 'H' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
        sd_add_missing( EXPORTING iv_table = 'VBRP' iv_level = 'I' iv_item = '' iv_text = iv_text it_req = it_req
                     CHANGING ct_facts = ct_facts ).
    ENDCASE.
  ENDMETHOD.


  METHOD add_marc.
    DATA ls_marc TYPE marc.

    IF sd_has_req( it_req = it_req iv_table = 'MARC' ) = abap_false.
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM marc INTO ls_marc WHERE matnr = iv_matnr AND werks = iv_werks.
    IF sy-subrc = 0.
      sd_add_row_facts( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = iv_item
                               is_row = ls_marc it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ELSE.
      sd_add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = iv_item
                             iv_text = 'Material / plant data not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
    ENDIF.
  ENDMETHOD.


  METHOD read_order.
    DATA: ls_vbak  TYPE vbak,
          ls_vbuk  TYPE vbuk,
          ls_vbkd  TYPE vbkd,
          lt_vbap  TYPE ty_t_vbap,
          ls_vbap  TYPE vbap,
          ls_vbup  TYPE vbup,
          ls_vbep  TYPE vbep,
          lv_item  TYPE string,
          lv_need  TYPE abap_bool.

    SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = iv_vbeln.
    IF sy-subrc <> 0.
      missing_set( EXPORTING iv_scope = 'SDO' iv_text = 'Sales document not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD ls_vbak-vkorg
      ID 'VTWEG' FIELD ls_vbak-vtweg
      ID 'SPART' FIELD ls_vbak-spart
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc = 0.
      AUTHORITY-CHECK OBJECT 'V_VBAK_AAT'
        ID 'AUART' FIELD ls_vbak-auart
        ID 'ACTVT' FIELD '03'.
    ENDIF.
    IF sy-subrc <> 0.
      missing_set( EXPORTING iv_scope = 'SDO' iv_text = 'No authorization for this sales area / order type'
                             it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'VBAK' ) = abap_true.
      sd_add_row_facts( EXPORTING iv_table = 'VBAK' iv_level = 'H' iv_item = ''
                               is_row = ls_vbak it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'VBUK' ) = abap_true.
      SELECT SINGLE * FROM vbuk INTO ls_vbuk WHERE vbeln = iv_vbeln.
      IF sy-subrc = 0.
        sd_add_row_facts( EXPORTING iv_table = 'VBUK' iv_level = 'H' iv_item = ''
                                 is_row = ls_vbuk it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        sd_add_missing( EXPORTING iv_table = 'VBUK' iv_level = 'H' iv_item = ''
                               iv_text = 'Header status not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'VBKD' ) = abap_true.
      SELECT SINGLE * FROM vbkd INTO ls_vbkd WHERE vbeln = iv_vbeln AND posnr = '000000'.
      IF sy-subrc = 0.
        sd_add_row_facts( EXPORTING iv_table = 'VBKD' iv_level = 'H' iv_item = ''
                                 is_row = ls_vbkd it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        sd_add_missing( EXPORTING iv_table = 'VBKD' iv_level = 'H' iv_item = ''
                               iv_text = 'Header business data not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.

    LOOP AT it_req TRANSPORTING NO FIELDS
      WHERE tab = 'VBAP' OR tab = 'VBUP' OR tab = 'VBEP' OR tab = 'VBKD' OR tab = 'MARC'.
      lv_need = abap_true.
      EXIT.
    ENDLOOP.
    IF lv_need = abap_false.
      RETURN.
    ENDIF.

    " Items: the selected POSNR, all items (up to 200) when none.
    IF iv_posnr IS INITIAL.
      SELECT * FROM vbap INTO TABLE lt_vbap UP TO 200 ROWS
        WHERE vbeln = iv_vbeln ORDER BY posnr.
    ELSE.
      SELECT * FROM vbap INTO TABLE lt_vbap
        WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
    ENDIF.
    IF lt_vbap IS INITIAL.
      sd_add_missing( EXPORTING iv_table = 'VBAP' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      sd_add_missing( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      sd_add_missing( EXPORTING iv_table = 'VBEP' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      sd_add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.

    LOOP AT lt_vbap INTO ls_vbap.
      lv_item = ls_vbap-posnr.
      IF sd_has_req( it_req = it_req iv_table = 'VBAP' ) = abap_true.
        sd_add_row_facts( EXPORTING iv_table = 'VBAP' iv_level = 'I' iv_item = lv_item
                                 is_row = ls_vbap it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ENDIF.
      IF sd_has_req( it_req = it_req iv_table = 'VBUP' ) = abap_true.
        SELECT SINGLE * FROM vbup INTO ls_vbup WHERE vbeln = iv_vbeln AND posnr = ls_vbap-posnr.
        IF sy-subrc = 0.
          sd_add_row_facts( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = lv_item
                                   is_row = ls_vbup it_req = it_req
                         CHANGING  ct_facts = ct_facts ).
        ELSE.
          sd_add_missing( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = lv_item
                                 iv_text = 'Item status not found' it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
        ENDIF.
      ENDIF.
      IF sd_has_req( it_req = it_req iv_table = 'VBEP' ) = abap_true.
        CLEAR ls_vbep.
        SELECT * FROM vbep INTO ls_vbep UP TO 1 ROWS
          WHERE vbeln = iv_vbeln AND posnr = ls_vbap-posnr
          ORDER BY PRIMARY KEY.
        ENDSELECT.
        IF sy-subrc = 0.
          sd_add_row_facts( EXPORTING iv_table = 'VBEP' iv_level = 'I' iv_item = lv_item
                                   is_row = ls_vbep it_req = it_req
                         CHANGING  ct_facts = ct_facts ).
        ELSE.
          sd_add_missing( EXPORTING iv_table = 'VBEP' iv_level = 'I' iv_item = lv_item
                                 iv_text = 'No schedule line' it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
        ENDIF.
      ENDIF.
      IF sd_has_req( it_req = it_req iv_table = 'VBKD' ) = abap_true.
        SELECT SINGLE * FROM vbkd INTO ls_vbkd WHERE vbeln = iv_vbeln AND posnr = ls_vbap-posnr.
        IF sy-subrc = 0.
          sd_add_row_facts( EXPORTING iv_table = 'VBKD' iv_level = 'I' iv_item = lv_item
                                   is_row = ls_vbkd it_req = it_req
                         CHANGING  ct_facts = ct_facts ).
        ENDIF.
      ENDIF.
      add_marc( EXPORTING iv_item = lv_item iv_matnr = ls_vbap-matnr iv_werks = ls_vbap-werks
                          it_req = it_req
                CHANGING  ct_facts = ct_facts ).
    ENDLOOP.
  ENDMETHOD.


  METHOD read_dlv.
    DATA: ls_likp  TYPE likp,
          ls_vbuk  TYPE vbuk,
          lt_lips  TYPE ty_t_lips,
          ls_lips  TYPE lips,
          ls_vbup  TYPE vbup,
          lv_item  TYPE string,
          lv_need  TYPE abap_bool.

    SELECT SINGLE * FROM likp INTO ls_likp WHERE vbeln = iv_vbeln.
    IF sy-subrc <> 0.
      missing_set( EXPORTING iv_scope = 'SDD' iv_text = 'Delivery not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_LIKP_VST'
      ID 'VSTEL' FIELD ls_likp-vstel
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      missing_set( EXPORTING iv_scope = 'SDD' iv_text = 'No authorization for this shipping point'
                             it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'LIKP' ) = abap_true.
      sd_add_row_facts( EXPORTING iv_table = 'LIKP' iv_level = 'H' iv_item = ''
                               is_row = ls_likp it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'VBUK' ) = abap_true.
      SELECT SINGLE * FROM vbuk INTO ls_vbuk WHERE vbeln = iv_vbeln.
      IF sy-subrc = 0.
        sd_add_row_facts( EXPORTING iv_table = 'VBUK' iv_level = 'H' iv_item = ''
                                 is_row = ls_vbuk it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ELSE.
        sd_add_missing( EXPORTING iv_table = 'VBUK' iv_level = 'H' iv_item = ''
                               iv_text = 'Header status not found' it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
      ENDIF.
    ENDIF.

    LOOP AT it_req TRANSPORTING NO FIELDS WHERE tab = 'LIPS' OR tab = 'VBUP' OR tab = 'MARC'.
      lv_need = abap_true.
      EXIT.
    ENDLOOP.
    IF lv_need = abap_false.
      RETURN.
    ENDIF.

    IF iv_posnr IS INITIAL.
      SELECT * FROM lips INTO TABLE lt_lips UP TO 200 ROWS
        WHERE vbeln = iv_vbeln ORDER BY posnr.
    ELSE.
      SELECT * FROM lips INTO TABLE lt_lips
        WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
    ENDIF.
    IF lt_lips IS INITIAL.
      sd_add_missing( EXPORTING iv_table = 'LIPS' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      sd_add_missing( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      sd_add_missing( EXPORTING iv_table = 'MARC' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.

    LOOP AT lt_lips INTO ls_lips.
      lv_item = ls_lips-posnr.
      IF sd_has_req( it_req = it_req iv_table = 'LIPS' ) = abap_true.
        sd_add_row_facts( EXPORTING iv_table = 'LIPS' iv_level = 'I' iv_item = lv_item
                                 is_row = ls_lips it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
      ENDIF.
      IF sd_has_req( it_req = it_req iv_table = 'VBUP' ) = abap_true.
        SELECT SINGLE * FROM vbup INTO ls_vbup WHERE vbeln = iv_vbeln AND posnr = ls_lips-posnr.
        IF sy-subrc = 0.
          sd_add_row_facts( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = lv_item
                                   is_row = ls_vbup it_req = it_req
                         CHANGING  ct_facts = ct_facts ).
        ELSE.
          sd_add_missing( EXPORTING iv_table = 'VBUP' iv_level = 'I' iv_item = lv_item
                                 iv_text = 'Item status not found' it_req = it_req
                       CHANGING  ct_facts = ct_facts ).
        ENDIF.
      ENDIF.
      add_marc( EXPORTING iv_item = lv_item iv_matnr = ls_lips-matnr iv_werks = ls_lips-werks
                          it_req = it_req
                CHANGING  ct_facts = ct_facts ).
    ENDLOOP.
  ENDMETHOD.


  METHOD read_bil.
    DATA: ls_vbrk  TYPE vbrk,
          lt_vbrp  TYPE ty_t_vbrp,
          ls_vbrp  TYPE vbrp,
          lv_item  TYPE string.

    SELECT SINGLE * FROM vbrk INTO ls_vbrk WHERE vbeln = iv_vbeln.
    IF sy-subrc <> 0.
      missing_set( EXPORTING iv_scope = 'SDB' iv_text = 'Billing document not found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    AUTHORITY-CHECK OBJECT 'V_VBRK_VKO'
      ID 'VKORG' FIELD ls_vbrk-vkorg
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc = 0.
      AUTHORITY-CHECK OBJECT 'V_VBRK_FKA'
        ID 'FKART' FIELD ls_vbrk-fkart
        ID 'ACTVT' FIELD '03'.
    ENDIF.
    IF sy-subrc <> 0.
      missing_set( EXPORTING iv_scope = 'SDB' iv_text = 'No authorization for this billing document'
                             it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'VBRK' ) = abap_true.
      sd_add_row_facts( EXPORTING iv_table = 'VBRK' iv_level = 'H' iv_item = ''
                               is_row = ls_vbrk it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDIF.
    IF sd_has_req( it_req = it_req iv_table = 'VBRP' ) = abap_false.
      RETURN.
    ENDIF.
    IF iv_posnr IS INITIAL.
      SELECT * FROM vbrp INTO TABLE lt_vbrp UP TO 200 ROWS
        WHERE vbeln = iv_vbeln ORDER BY posnr.
    ELSE.
      SELECT * FROM vbrp INTO TABLE lt_vbrp
        WHERE vbeln = iv_vbeln AND posnr = iv_posnr.
    ENDIF.
    IF lt_vbrp IS INITIAL.
      sd_add_missing( EXPORTING iv_table = 'VBRP' iv_level = 'I' iv_item = ''
                             iv_text = 'No item found' it_req = it_req
                   CHANGING  ct_facts = ct_facts ).
      RETURN.
    ENDIF.
    LOOP AT lt_vbrp INTO ls_vbrp.
      lv_item = ls_vbrp-posnr.
      sd_add_row_facts( EXPORTING iv_table = 'VBRP' iv_level = 'I' iv_item = lv_item
                               is_row = ls_vbrp it_req = it_req
                     CHANGING  ct_facts = ct_facts ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
