CLASS zcl_mcp_biz_if DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

* Interface test call (configs/IF/actions.json) — the "인터페이스 테스트" button of an interface mapping
* specification (2026-11-18). One existing remote-enabled function module, called with the parameters
* the user reviewed and confirmed. No generated code runs: the module is the interface's own.
*
* IF.TEST.CALL (write, risk high)
*   PREVIEW  reads the signature (FUPARAREF), checks the parameters against it (names, required importing
*            parameters, values that fit the types), reports the posting signs (name; COMMIT WORK, IN UPDATE
*            TASK, database writes in the module's own source) and whether the module commits by itself.
*            Nothing is called.
*   EXECUTE  CALL FUNCTION with the same parameters (the preview token binds them), then in the same LUW:
*            commit = true → BAPI_TRANSACTION_COMMIT (WAIT), otherwise ROLLBACK WORK. The executor commits
*            its log right after this handler returns, so the rollback must happen here.
*
* Fence (this handler, on top of the executor's production block and token):
*   - a development client only: T000-CCCATEGORY = 'C' (customizing) — test and production clients refused
*   - the module must be remote-enabled (TFDIR-FMODE = 'R') and pass S_RFC for the caller
*   - names: Z* / Y* / BAPI_* only, never BAPI_TRANSACTION_*, BAPI_USER_*, BAPI_PRGN_*, *ROLE*, BAPI_XBP_*,
*     RFC_*, SXPG_*, TH_*, SUSR_*, SU_*, PRGN_*, /SDF/*, the sc4sap helpers (ZMCP_* / YMCP_*, function groups
*     ZMCP*) or the function groups SRFC / SUTL / SDTX
*   - one call per EXECUTE; fm_params at most 100 000 characters
*   - the log (ZMCP_BIZ_LOG, ZCL_MCP_BIZ_EXEC) keeps fm_name, the parameter hash, the user and the outcome —
*     never the parameter or output values
*   - posting signs need ack_posting = 'true'; a module that commits by itself is reported irreversible
*   - dangerous modules are refused whatever the specification says (ack_posting does not unlock them):
*     names: *DYNSQL*, *TRUNCATE*, *READ_TABLE*, *DATA_COPY*, *PASSWORD*, *USER_UNLOCK*; HR / payroll
*       (personal data): ZHR*, YHR*, Z_HR*, Y_HR*, *PAYROLL*, *PAYSLIP*, *SALARY*, *WAGE*, *PCL1*..*PCL4*
*     signature: an importing / changing / tables parameter that takes a table name (TABNAME*, *-TABNAME),
*       a WHERE condition (RFC_DB_OPT, *WHERE* types or names) or source code (ABAPSOURCE*), is named
*       *SQL* / *TABNAME* / *TAB_NAME* / *TABLE_NAME*; or a required importing scalar employee number
*       (*PERNR*, *PERSNO*: a module run for one person) — not one inside a structure or selection table
*     source: the module's include plus the group's own and customer includes, other modules' left out
*       (main program, TOP, FORMs, nested; not SAP's shared LSVIM* / FBGENMAC), at most 60, string
*       literals included, comments left out — EXEC SQL,
*       TRUNCATE, ADBC (CL_SQL_*), GENERATE SUBROUTINE POOL, INSERT / DELETE REPORT, SUBMIT, OPEN / DELETE
*       DATASET, DESTINATION, STARTING NEW TASK, CALL 'SYSTEM', CALL FUNCTION with a non-literal name,
*       DML or FROM on a table name in parentheses. A source that
*       cannot be read is refused. Not seen: modules it calls, statements split over lines, INCLUDE: chains
*
* Parameters: fm_name; fm_params = one JSON object as text, keys = the module's parameter names (upper
* case), values in /UI2/CL_JSON form (structures as objects, tables as arrays); ack_posting; commit.
* Result rows: signature (sig.*), posting signs (posting.*), output (fm_result = JSON text of the
* exporting / changing / tables parameters), document numbers (doc_no.*). Messages: RETURN-type
* parameters (BAPIRET*), exceptions, ERROR_MESSAGE.
*
* 7.40 / S/4HANA only (/UI2/CL_JSON). Not installed on 7.31.

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    CONSTANTS c_action TYPE string VALUE 'IF.TEST.CALL'.
    CONSTANTS c_max_result TYPE i VALUE 200000.
    CONSTANTS c_max_params TYPE i VALUE 100000.
    CONSTANTS c_max_includes TYPE i VALUE 60.

    TYPES:
      BEGIN OF ty_par,
        name     TYPE fupararef-parameter,
        kind     TYPE fupararef-paramtype,
        typ      TYPE fupararef-structure,
        optional TYPE abap_bool,
      END OF ty_par,
      ty_pars TYPE STANDARD TABLE OF ty_par WITH DEFAULT KEY.

    METHODS run
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS fence
      IMPORTING iv_fm           TYPE rs38l_fnam
      RETURNING VALUE(rv_error) TYPE string.

    METHODS signature
      IMPORTING iv_fm          TYPE rs38l_fnam
      RETURNING VALUE(rt_pars) TYPE ty_pars.

    " Dangerous-module rules (refused in PREVIEW and EXECUTE; ack_posting does not unlock them).
    METHODS danger
      IMPORTING iv_fm           TYPE rs38l_fnam
                iv_pname        TYPE tfdir-pname
                iv_incno        TYPE tfdir-include
      RETURNING VALUE(rv_error) TYPE string.

    METHODS risky_name
      IMPORTING iv_fm            TYPE rs38l_fnam
      RETURNING VALUE(rv_reason) TYPE string.

    METHODS risky_param
      IMPORTING is_par           TYPE ty_par
      RETURNING VALUE(rv_reason) TYPE string.

    METHODS person_key
      IMPORTING is_par           TYPE ty_par
                iv_elementary    TYPE abap_bool
      RETURNING VALUE(rv_reason) TYPE string.

    METHODS code_part
      IMPORTING iv_line        TYPE string
      RETURNING VALUE(rv_code) TYPE string.

    METHODS risky_line
      IMPORTING iv_code          TYPE string
      RETURNING VALUE(rv_reason) TYPE string.

    METHODS risky_source
      IMPORTING it_src           TYPE string_table
      RETURNING VALUE(rv_reason) TYPE string.

    METHODS include_names
      IMPORTING it_src          TYPE string_table
      RETURNING VALUE(rt_names) TYPE string_table.

    " SAPL<group> / /NS/SAPL<group> → namespace and group, from a string copy (no trailing blanks).
    METHODS group_of
      IMPORTING iv_pname TYPE tfdir-pname
      EXPORTING ev_ns    TYPE string
                ev_group TYPE string.

    " A posting verb anywhere in the name, except inside EXCHANGERATE (CHANGE there is not a verb).
    METHODS posting_name
      IMPORTING iv_fm          TYPE rs38l_fnam
      RETURNING VALUE(rv_hit) TYPE abap_bool.

    METHODS posting_signs
      IMPORTING iv_fm          TYPE rs38l_fnam
      EXPORTING et_signs       TYPE string_table
                ev_self_commit TYPE abap_bool.

    METHODS build
      IMPORTING it_pars  TYPE ty_pars
                iv_json  TYPE string
      EXPORTING et_ptab  TYPE abap_func_parmbind_tab
                er_out   TYPE REF TO data
                ev_error TYPE string.

    METHODS json_top_keys
      IMPORTING iv_json        TYPE string
      RETURNING VALUE(rt_keys) TYPE string_table.

    METHODS type_of
      IMPORTING is_par         TYPE ty_par
      RETURNING VALUE(ro_type) TYPE REF TO cl_abap_datadescr.

    METHODS messages_of
      IMPORTING ir_out    TYPE REF TO data
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS doc_numbers
      IMPORTING ir_out    TYPE REF TO data
                it_pars   TYPE ty_pars
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    METHODS add_kv
      IMPORTING iv_name  TYPE string
                iv_value TYPE string
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.
ENDCLASS.


CLASS zcl_mcp_biz_if IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/IF/actions.json.
    ls_def-id = c_action. ls_def-kind = 'write'. ls_def-risk = 'high'.
    APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    rs_result-action = iv_action.
    add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a query action|
             CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    IF iv_action <> c_action.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Unknown action { iv_action }| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    rs_result = run( is_params = is_params iv_execute = abap_false ).
    rs_result-action = iv_action.
    rs_result-mode   = 'PREVIEW'.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    IF iv_action <> c_action.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Unknown action { iv_action }| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    rs_result = run( is_params = is_params iv_execute = abap_true ).
    rs_result-action = iv_action.
    rs_result-mode   = 'EXECUTE'.
  ENDMETHOD.


  METHOD run.
    DATA: lv_fm          TYPE rs38l_fnam,
          lt_pars        TYPE ty_pars,
          ls_par         TYPE ty_par,
          lt_signs       TYPE string_table,
          lv_sign        TYPE string,
          lv_self_commit TYPE abap_bool,
          lt_ptab        TYPE abap_func_parmbind_tab,
          lt_etab        TYPE abap_func_excpbind_tab,
          ls_exc         TYPE abap_func_excpbind,
          lr_out         TYPE REF TO data,
          lv_error       TYPE string,
          lv_json        TYPE string,
          lv_commit      TYPE abap_bool,
          lv_posting     TYPE abap_bool,
          ls_ret         TYPE bapiret2,
          lx_root        TYPE REF TO cx_root,
          lv_msg         TYPE string.
    FIELD-SYMBOLS <ls_msg> TYPE zif_mcp_biz_action=>ty_message.

    lv_fm = to_upper( condense( is_params-fm_name ) ).
    " One module, one call per EXECUTE (the token is spent once); the payload is capped.
    IF strlen( is_params-fm_params ) > c_max_params.
      add_msg( EXPORTING iv_type = 'E' iv_text = |fm_params is larger than { c_max_params } characters| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_error = fence( lv_fm ).
    IF lv_error IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_error CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    lt_pars = signature( lv_fm ).
    LOOP AT lt_pars INTO ls_par.
      add_kv( EXPORTING iv_name = |sig.{ ls_par-kind }.{ ls_par-name }|
                        iv_value = |{ ls_par-typ }{ COND string( WHEN ls_par-optional = abap_true THEN ' (optional)' ) }|
              CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.

    posting_signs( EXPORTING iv_fm = lv_fm IMPORTING et_signs = lt_signs ev_self_commit = lv_self_commit ).
    " What the scan cannot see — shown beside the posting tick.
    add_kv( EXPORTING iv_name = 'posting.limit'
                      iv_value = 'A COMMIT inside a module this one calls is not detected: on DEV this can post data'
            CHANGING ct_rows = rs_result-rows ).
    LOOP AT lt_signs INTO lv_sign.
      add_kv( EXPORTING iv_name = 'posting.sign' iv_value = lv_sign CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF lv_self_commit = abap_true.
      add_kv( EXPORTING iv_name = 'posting.self_commit' iv_value = 'true' CHANGING ct_rows = rs_result-rows ).
      rs_result-irreversible = abap_true.
    ENDIF.
    lv_posting = xsdbool( lt_signs IS NOT INITIAL OR lv_self_commit = abap_true ).
    IF lv_posting = abap_true AND is_params-ack_posting <> 'true'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = |{ lv_fm } can post or commit data: confirm it (ack_posting = true) to go on|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_commit = xsdbool( is_params-commit = 'true' ).
    IF lv_commit = abap_true AND is_params-ack_posting <> 'true'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'commit = true needs ack_posting = true' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_commit = abap_true.
      rs_result-irreversible = abap_true.
    ENDIF.

    build( EXPORTING it_pars = lt_pars iv_json = is_params-fm_params
           IMPORTING et_ptab = lt_ptab er_out = lr_out ev_error = lv_error ).
    IF lv_error IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = lv_error CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    IF iv_execute = abap_false.
      rs_result-summary = |{ lv_fm }: { lines( lt_ptab ) } parameters bound; nothing called|.
      RETURN.
    ENDIF.

    " The module's own classic exceptions, plus E / A messages instead of a dump.
    LOOP AT lt_pars INTO ls_par WHERE kind = 'X'.
      ls_exc-name = ls_par-name. ls_exc-value = sy-tabix.
      INSERT ls_exc INTO TABLE lt_etab.
    ENDLOOP.
    ls_exc-name = 'ERROR_MESSAGE'. ls_exc-value = 900. INSERT ls_exc INTO TABLE lt_etab.
    ls_exc-name = 'OTHERS'.        ls_exc-value = 999. INSERT ls_exc INTO TABLE lt_etab.

    TRY.
        CALL FUNCTION lv_fm PARAMETER-TABLE lt_ptab EXCEPTION-TABLE lt_etab.
        IF sy-subrc <> 0.
          DATA(lv_subrc) = sy-subrc.
          READ TABLE lt_etab INTO ls_exc WITH KEY value = lv_subrc.
          IF sy-msgid IS NOT INITIAL.
            MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg.
          ENDIF.
          add_msg( EXPORTING iv_type = 'E'
                             iv_text = |Exception { ls_exc-name } (sy-subrc { lv_subrc }){ COND string( WHEN lv_msg IS NOT INITIAL THEN |: { lv_msg }| ) }|
                   CHANGING cs_result = rs_result ).
        ENDIF.
      CATCH cx_root INTO lx_root.
        ROLLBACK WORK.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ lv_fm } failed: { lx_root->get_text( ) }| CHANGING cs_result = rs_result ).
        rs_result-failed = abap_true.
        RETURN.
    ENDTRY.

    messages_of( EXPORTING ir_out = lr_out CHANGING cs_result = rs_result ).
    doc_numbers( EXPORTING ir_out = lr_out it_pars = lt_pars CHANGING cs_result = rs_result ).
    " A RETURN with E / A is a failed call: logged as failed, never committed.
    LOOP AT rs_result-messages ASSIGNING <ls_msg> WHERE type = 'E' OR type = 'A' OR type = 'X'.
      rs_result-failed = abap_true.
      EXIT.
    ENDLOOP.

    TRY.
        lv_json = /ui2/cl_json=>serialize( data = lr_out compress = abap_true pretty_name = /ui2/cl_json=>pretty_mode-none ).
      CATCH cx_root INTO lx_root.
        lv_json = |{ '{' }"error":"the output could not be written as JSON"{ '}' }|.
    ENDTRY.
    IF strlen( lv_json ) > c_max_result.
      lv_json = lv_json(c_max_result).
      rs_result-truncated = abap_true.
    ENDIF.
    add_kv( EXPORTING iv_name = 'fm_result' iv_value = lv_json CHANGING ct_rows = rs_result-rows ).

    " Commit only when asked and nothing failed; otherwise roll the module's work back in this LUW.
    IF lv_commit = abap_true AND rs_result-failed = abap_false.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING wait   = 'X'
        IMPORTING return = ls_ret.
      IF ls_ret-type = 'E' OR ls_ret-type = 'A'.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Commit failed: { ls_ret-message }| CHANGING cs_result = rs_result ).
      ELSE.
        add_kv( EXPORTING iv_name = 'committed' iv_value = 'true' CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ELSE.
      ROLLBACK WORK.
      add_kv( EXPORTING iv_name = 'committed'
                        iv_value = COND string( WHEN lv_self_commit = abap_true THEN 'by the module itself' ELSE 'false (rolled back)' )
              CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    rs_result-summary = |{ lv_fm } called|.
  ENDMETHOD.


  METHOD fence.
    DATA: lv_cat    TYPE t000-cccategory,
          lv_fmode  TYPE tfdir-fmode,
          lv_pname  TYPE tfdir-pname,
          lv_incno  TYPE tfdir-include,
          lv_reason TYPE string.

    IF iv_fm IS INITIAL.
      rv_error = 'fm_name is required'.
      RETURN.
    ENDIF.
    SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt.
    IF lv_cat <> 'C'.
      rv_error = |Interface test calls run on a development (customizing) client only; this client is category "{ lv_cat }"|.
      RETURN.
    ENDIF.
    IF NOT ( iv_fm CP 'Z*' OR iv_fm CP 'Y*' OR iv_fm CP 'BAPI_*' )
        OR iv_fm CP 'BAPI_TRANSACTION_*' OR iv_fm CP 'BAPI_USER_*' OR iv_fm CP 'BAPI_PRGN_*'
        OR iv_fm CP '*ROLE*' OR iv_fm CP 'BAPI_XBP_*' OR iv_fm CP 'ZMCP_*' OR iv_fm CP 'YMCP_*'
        " never, whatever the allow-list says (team-lead, 2026-11-18): system, user and RFC tooling
        OR iv_fm CP 'RFC_*' OR iv_fm CP 'SXPG_*' OR iv_fm CP 'TH_*' OR iv_fm CP 'SUSR_*'
        OR iv_fm CP 'SU_*' OR iv_fm CP 'PRGN_*' OR iv_fm CP '/SDF/*'.
      rv_error = |{ iv_fm } is not a module interface tests may call (Z*, Y* or BAPI_*, never user, role, job, transaction or sc4sap modules)|.
      RETURN.
    ENDIF.
    lv_reason = risky_name( iv_fm ).
    IF lv_reason IS NOT INITIAL.
      rv_error = |{ iv_fm } is refused: { lv_reason }|.
      RETURN.
    ENDIF.
    SELECT SINGLE fmode pname include FROM tfdir INTO (lv_fmode, lv_pname, lv_incno) WHERE funcname = iv_fm.
    IF sy-subrc <> 0.
      rv_error = |Function module { iv_fm } does not exist|.
      RETURN.
    ENDIF.
    IF lv_pname CP 'SAPLZMCP*' OR lv_pname CP 'SAPLYMCP*'.
      rv_error = |{ iv_fm } belongs to the sc4sap helpers|.
      RETURN.
    ENDIF.
    IF lv_pname = 'SAPLSRFC' OR lv_pname = 'SAPLSUTL' OR lv_pname = 'SAPLSDTX'.
      rv_error = |{ iv_fm } belongs to a system function group ({ lv_pname+4 })|.
      RETURN.
    ENDIF.
    IF lv_fmode <> 'R'.
      rv_error = |{ iv_fm } is not remote-enabled|.
      RETURN.
    ENDIF.
    " Table names, WHERE / SQL, employee numbers, dangerous statements: refused, never acknowledged.
    rv_error = danger( iv_fm = iv_fm iv_pname = lv_pname iv_incno = lv_incno ).
    IF rv_error IS NOT INITIAL.
      RETURN.
    ENDIF.
    " The caller must be allowed to call it over RFC, as the interface partner would be.
    AUTHORITY-CHECK OBJECT 'S_RFC'
      ID 'RFC_TYPE' FIELD 'FUNC'
      ID 'RFC_NAME' FIELD iv_fm
      ID 'ACTVT'    FIELD '16'.
    IF sy-subrc <> 0.
      rv_error = |No RFC authorization (S_RFC) for { iv_fm }|.
    ENDIF.
  ENDMETHOD.


  METHOD signature.
    DATA: lt_ref TYPE STANDARD TABLE OF fupararef,
          ls_ref TYPE fupararef,
          ls_par TYPE ty_par.

    SELECT * FROM fupararef INTO TABLE lt_ref WHERE funcname = iv_fm AND r3state = 'A' ORDER BY pposition.
    LOOP AT lt_ref INTO ls_ref.
      CLEAR ls_par.
      ls_par-name     = ls_ref-parameter.
      ls_par-kind     = ls_ref-paramtype.
      ls_par-typ      = ls_ref-structure.
      ls_par-optional = xsdbool( ls_ref-optional = 'X' OR ls_ref-defaultval IS NOT INITIAL ).
      APPEND ls_par TO rt_pars.
    ENDLOOP.
  ENDMETHOD.


  METHOD danger.
    " Refusals that ack_posting never unlocks: signature, then the source of the module and its group.
    DATA: lt_pars   TYPE ty_pars,
          ls_par    TYPE ty_par,
          lv_reason TYPE string,
          lv_ns     TYPE string,
          lv_group  TYPE string,
          lv_own    TYPE string,
          lv_others TYPE string,
          lv_mine   TYPE string,
          lv_name   TYPE string,
          lv_prog   TYPE progname,
          lv_idx    TYPE i,
          lt_queue  TYPE string_table,
          lt_seen   TYPE string_table,
          lt_src    TYPE string_table,
          lt_inc    TYPE string_table,
          lo_type   TYPE REF TO cl_abap_datadescr,
          lv_elem   TYPE abap_bool.

    lt_pars = signature( iv_fm ).
    LOOP AT lt_pars INTO ls_par.
      lv_reason = risky_param( ls_par ).
      IF lv_reason IS INITIAL.
        CLEAR lv_elem.
        lo_type = type_of( ls_par ).
        IF lo_type IS BOUND AND lo_type->kind = cl_abap_typedescr=>kind_elem.
          lv_elem = abap_true.
        ENDIF.
        lv_reason = person_key( is_par = ls_par iv_elementary = lv_elem ).
      ENDIF.
      IF lv_reason IS NOT INITIAL.
        rv_error = |{ iv_fm } is refused: parameter { ls_par-name } { lv_reason }|.
        RETURN.
      ENDIF.
    ENDLOOP.

    " SAPL<group> → L<group>U<nn>; /NS/SAPL<group> → /NS/L<group>U<nn> (as in posting_signs).
    group_of( EXPORTING iv_pname = iv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).
    IF lv_group IS INITIAL OR iv_incno IS INITIAL.
      rv_error = |{ iv_fm } is refused: its source could not be located, so dangerous statements are not ruled out|.
      RETURN.
    ENDIF.
    lv_own    = |{ lv_ns }L{ lv_group }U{ iv_incno }|.
    lv_others = |{ lv_ns }L{ lv_group }U*|.
    lv_mine   = |{ lv_ns }L{ lv_group }*|.

    " The main program lists the group's includes (TOP, UXX, FORMs …); nested INCLUDEs join the queue.
    lv_prog = iv_pname.
    READ REPORT lv_prog INTO lt_src.
    IF sy-subrc <> 0.
      rv_error = |{ iv_fm } is refused: { iv_pname } could not be read, so dangerous statements are not ruled out|.
      RETURN.
    ENDIF.
    lv_reason = risky_source( lt_src ).
    IF lv_reason IS NOT INITIAL.
      rv_error = |{ iv_fm } is refused: { lv_reason } (in { iv_pname })|.
      RETURN.
    ENDIF.
    APPEND lv_own TO lt_queue.
    lt_inc = include_names( lt_src ).
    APPEND LINES OF lt_inc TO lt_queue.

    WHILE lv_idx < lines( lt_queue ).
      lv_idx = lv_idx + 1.
      READ TABLE lt_queue INDEX lv_idx INTO lv_name.
      READ TABLE lt_seen TRANSPORTING NO FIELDS WITH KEY table_line = lv_name.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      " The group's other modules are not this module's code (UXX lists them).
      IF lv_name <> lv_own AND lv_name CP lv_others.
        CONTINUE.
      ENDIF.
      " SAP's shared includes (view maintenance LSVIM*, FBGENMAC, <ICON> …) are not the group's code: only
      " the group's own includes (<ns>L<group>*) and customer includes (Z*, Y*, LZ*, LY*) are read.
      IF NOT ( lv_name CP lv_mine OR lv_name CP 'Z*' OR lv_name CP 'Y*' OR lv_name CP 'LZ*' OR lv_name CP 'LY*' ).
        CONTINUE.
      ENDIF.
      APPEND lv_name TO lt_seen.
      IF lines( lt_seen ) > c_max_includes.
        rv_error = |{ iv_fm } is refused: its function group has more than { c_max_includes } includes to check|.
        RETURN.
      ENDIF.
      lv_prog = lv_name.
      CLEAR lt_src.
      READ REPORT lv_prog INTO lt_src.
      IF sy-subrc <> 0.
        rv_error = |{ iv_fm } is refused: include { lv_name } could not be read, so dangerous statements are not ruled out|.
        RETURN.
      ENDIF.
      lv_reason = risky_source( lt_src ).
      IF lv_reason IS NOT INITIAL.
        rv_error = |{ iv_fm } is refused: { lv_reason } (in { lv_name })|.
        RETURN.
      ENDIF.
      lt_inc = include_names( lt_src ).
      APPEND LINES OF lt_inc TO lt_queue.
    ENDWHILE.
  ENDMETHOD.


  METHOD risky_name.
    IF iv_fm CP '*DYNSQL*' OR iv_fm CP '*TRUNCATE*' OR iv_fm CP '*READ_TABLE*' OR iv_fm CP '*DATA_COPY*'
        OR iv_fm CP '*PASSWORD*' OR iv_fm CP '*USER_UNLOCK*'.
      rv_reason = 'generic SQL, table read, copy or truncate, password or user unlock module'.
    ELSEIF iv_fm CP 'ZHR*' OR iv_fm CP 'YHR*' OR iv_fm CP 'Z_HR*' OR iv_fm CP 'Y_HR*'
        OR iv_fm CP '*PAYROLL*' OR iv_fm CP '*PAYSLIP*' OR iv_fm CP '*SALARY*' OR iv_fm CP '*WAGE*'
        OR iv_fm CP '*PCL1*' OR iv_fm CP '*PCL2*' OR iv_fm CP '*PCL3*' OR iv_fm CP '*PCL4*'.
      " Customer HR prefixes and payroll words; PCL1..PCL4 are the HR / payroll cluster tables.
      rv_reason = 'HR or payroll module (personal data)'.
    ENDIF.
  ENDMETHOD.


  METHOD risky_param.
    " What the caller sends: importing, changing, tables. Exporting parameters only come back.
    IF is_par-kind <> 'I' AND is_par-kind <> 'C' AND is_par-kind <> 'T'.
      RETURN.
    ENDIF.
    IF is_par-typ CP 'TABNAME*' OR is_par-typ CP '*-TABNAME' OR is_par-typ = 'RFC_DB_OPT'
        OR is_par-typ CP '*WHERE*' OR is_par-typ CP 'ABAPSOURCE*'.
      rv_reason = |takes a table name, a WHERE condition or source code ({ is_par-typ })|.
    ELSEIF is_par-name CP '*SQL*' OR is_par-name CP '*TABNAME*' OR is_par-name CP '*TAB_NAME*'
        OR is_par-name CP '*TABLE_NAME*' OR ( is_par-name CP '*WHERE*' AND NOT is_par-name CP '*WHEREUSED*' ).
      rv_reason = 'is named like SQL, a table name or a WHERE condition'.
    ENDIF.
  ENDMETHOD.


  METHOD person_key.
    " A module run for one person: a required importing scalar that is an employee number. An employee
    " number inside a structure or a selection table (an optional filter of a business module) is not.
    IF is_par-kind <> 'I' OR is_par-optional = abap_true OR iv_elementary = abap_false.
      RETURN.
    ENDIF.
    IF is_par-typ CP '*PERNR*' OR is_par-typ CP '*PERSNO*' OR is_par-name CP '*PERNR*'.
      rv_reason = 'is a required employee number (a module run for one person: personal data)'.
    ENDIF.
  ENDMETHOD.


  METHOD code_part.
    " The statement part of a line, upper case: string literals ('…', `…`, |…|) kept, the " comment cut.
    DATA: lv_len TYPE i,
          lv_pos TYPE i,
          lv_c   TYPE c LENGTH 1,
          lv_q   TYPE c LENGTH 1.

    lv_len = strlen( iv_line ).
    WHILE lv_pos < lv_len.
      lv_c = iv_line+lv_pos(1).
      IF lv_q IS INITIAL.
        IF lv_c = '"'.
          EXIT.
        ELSEIF lv_c = '''' OR lv_c = '`' OR lv_c = '|'.
          lv_q = lv_c.
        ENDIF.
      ELSEIF lv_c = lv_q.
        CLEAR lv_q.
      ENDIF.
      lv_pos = lv_pos + 1.
    ENDWHILE.
    rv_code = to_upper( substring( val = iv_line len = lv_pos ) ).
  ENDMETHOD.


  METHOD risky_line.
    " iv_code: one code_part( ) line. Literals count: generated code hides its statements in strings.
    FIND REGEX `EXEC\s+SQL` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'native SQL (EXEC SQL)'.
      RETURN.
    ENDIF.
    IF iv_code CS 'TRUNCATE'.
      rv_reason = 'TRUNCATE'.
      RETURN.
    ENDIF.
    IF iv_code CS 'CL_SQL_'.
      rv_reason = 'ADBC (CL_SQL_*)'.
      RETURN.
    ENDIF.
    FIND REGEX `GENERATE\s+SUBROUTINE\s+POOL` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'generated code (GENERATE SUBROUTINE POOL)'.
      RETURN.
    ENDIF.
    FIND REGEX `(INSERT|DELETE)\s+REPORT` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'program source written (INSERT / DELETE REPORT)'.
      RETURN.
    ENDIF.
    FIND REGEX `(^|[^A-Z0-9_-])SUBMIT([^A-Z0-9_-]|$)` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'SUBMIT of a program'.
      RETURN.
    ENDIF.
    FIND REGEX `(OPEN|DELETE)\s+DATASET` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'server files (OPEN / DELETE DATASET)'.
      RETURN.
    ENDIF.
    FIND REGEX `(^|[^A-Z0-9_-])DESTINATION([^A-Z0-9_-]|$)` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'a call to another system (DESTINATION)'.
      RETURN.
    ENDIF.
    FIND REGEX `STARTING\s+NEW\s+TASK` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'a parallel task that commits on its own (STARTING NEW TASK)'.
      RETURN.
    ENDIF.
    FIND REGEX `CALL\s+'SYSTEM'` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = `a kernel call that can run operating system commands (CALL 'SYSTEM')`.
      RETURN.
    ENDIF.
    " The module name is not a literal: what it calls cannot be known before the call.
    FIND REGEX `CALL\s+FUNCTION\s+[^'``\s]` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'a function module named at runtime (CALL FUNCTION <variable>)'.
      RETURN.
    ENDIF.
    FIND REGEX `(^|[^A-Z0-9_-])(INSERT|UPDATE|MODIFY|DELETE)\s+(FROM\s+|INTO\s+)?\(\s*[A-Z_<][A-Z0-9_<>/-]*\s*\)` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'a database change on a table named at runtime'.
      RETURN.
    ENDIF.
    " One name in parentheses; a join in parentheses has more than one word and stays allowed.
    FIND REGEX `(^|[^A-Z0-9_-])FROM\s+\(\s*[A-Z_<][A-Z0-9_<>/-]*\s*\)` IN iv_code.
    IF sy-subrc = 0.
      rv_reason = 'a table named at runtime'.
    ENDIF.
  ENDMETHOD.


  METHOD risky_source.
    DATA: lv_raw    TYPE string,
          lv_code   TYPE string,
          lv_reason TYPE string.

    LOOP AT it_src INTO lv_raw.
      IF lv_raw IS INITIAL OR lv_raw(1) = '*'.
        CONTINUE.
      ENDIF.
      lv_code = code_part( lv_raw ).
      lv_reason = risky_line( lv_code ).
      IF lv_reason IS NOT INITIAL.
        lv_code = condense( lv_code ).
        IF strlen( lv_code ) > 120.
          lv_code = lv_code(120).
        ENDIF.
        rv_reason = |{ lv_reason }: { lv_code }|.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD include_names.
    " INCLUDE <name>. and INCLUDE <name> IF FOUND. (one per line); INCLUDE STRUCTURE / TYPE are not programs.
    DATA: lv_raw  TYPE string,
          lv_code TYPE string,
          lv_name TYPE string.

    LOOP AT it_src INTO lv_raw.
      IF lv_raw IS INITIAL OR lv_raw(1) = '*'.
        CONTINUE.
      ENDIF.
      lv_code = code_part( lv_raw ).
      CLEAR lv_name.
      FIND REGEX `^\s*INCLUDE\s+([A-Z0-9_/<>$]+)(\s+IF\s+FOUND)?\s*\.` IN lv_code SUBMATCHES lv_name.
      IF sy-subrc = 0 AND lv_name <> 'STRUCTURE' AND lv_name <> 'TYPE'.
        APPEND lv_name TO rt_names.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD group_of.
    " FIND on the CHAR40 field kept its trailing blanks in the group (live preview 2026-11-18: every
    " module read as "source not read"). A string copy has none.
    DATA lv_pname TYPE string.

    CLEAR: ev_ns, ev_group.
    lv_pname = condense( iv_pname ).
    IF NOT lv_pname CP '*SAPL*'.
      RETURN.
    ENDIF.
    " \S+: a blank can never reach the group, whatever the field length.
    IF lv_pname(1) = '/'.
      FIND REGEX `^(/[^/]+/)SAPL(\S+)` IN lv_pname SUBMATCHES ev_ns ev_group.
    ELSE.
      FIND REGEX `^SAPL(\S+)` IN lv_pname SUBMATCHES ev_group.
    ENDIF.
  ENDMETHOD.


  METHOD posting_name.
    " A posting verb anywhere in the name, so *CREATESUCCESSOR, *MASSDELETE*, *RECREATE* stay posting
    " (splitting the name at '_' would drop such real writers). Words that only contain a verb are
    " masked first: EXCHANGERATE (exchange rate) is not CHANGE. EXCHANGE alone stays a posting sign.
    DATA: lv_fm    TYPE string,
          lt_verbs TYPE string_table,
          lv_verb  TYPE string.

    lv_fm = to_upper( iv_fm ).
    REPLACE ALL OCCURRENCES OF 'EXCHANGERATE' IN lv_fm WITH '#'.
    APPEND `CREATE` TO lt_verbs.
    APPEND `CHANGE` TO lt_verbs.
    APPEND `POST` TO lt_verbs.
    APPEND `SAVE` TO lt_verbs.
    APPEND `DELETE` TO lt_verbs.
    APPEND `CANCEL` TO lt_verbs.
    APPEND `REVERSE` TO lt_verbs.
    APPEND `UPDATE` TO lt_verbs.
    LOOP AT lt_verbs INTO lv_verb.
      IF lv_fm CS lv_verb.
        rv_hit = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD posting_signs.
    DATA: lv_pname   TYPE tfdir-pname,
          lv_incno   TYPE tfdir-include,
          lv_ns      TYPE string,
          lv_group   TYPE string,
          lv_include TYPE progname,
          lt_src     TYPE string_table,
          lv_raw     TYPE string,
          lv_line    TYPE string,
          lv_comment TYPE string.

    CLEAR: et_signs, ev_self_commit.
    IF posting_name( iv_fm ) = abap_true.
      APPEND |name: { iv_fm }| TO et_signs.
    ENDIF.

    " The module's own include from TFDIR (no FUNCTION_INCLUDE_INFO: a static call with a wrong parameter
    " kind would dump on every preview). SAPL<group> → L<group>U<nn>; /NS/SAPL<group> → /NS/L<group>U<nn>.
    SELECT SINGLE pname include FROM tfdir INTO (lv_pname, lv_incno) WHERE funcname = iv_fm.
    IF sy-subrc = 0 AND lv_incno IS NOT INITIAL.
      group_of( EXPORTING iv_pname = lv_pname IMPORTING ev_ns = lv_ns ev_group = lv_group ).
      IF lv_group IS NOT INITIAL.
        lv_include = |{ lv_ns }L{ lv_group }U{ lv_incno }|.
      ENDIF.
    ENDIF.
    IF lv_include IS INITIAL.
      APPEND 'source not read: posting not ruled out' TO et_signs.
      RETURN.
    ENDIF.
    READ REPORT lv_include INTO lt_src.
    IF sy-subrc <> 0.
      APPEND 'source not read: posting not ruled out' TO et_signs.
      RETURN.
    ENDIF.
    " Only this module's own source: a COMMIT inside a module it calls is not seen (the dialog says so).
    LOOP AT lt_src INTO lv_raw.
      IF lv_raw IS INITIAL OR lv_raw(1) = '*'.
        CONTINUE.
      ENDIF.
      SPLIT lv_raw AT '"' INTO lv_line lv_comment.
      lv_line = to_upper( lv_line ).
      IF lv_line CS 'COMMIT WORK' OR lv_line CS 'BAPI_TRANSACTION_COMMIT'.
        ev_self_commit = abap_true.
        APPEND |source: { condense( lv_line ) }| TO et_signs.
      ELSEIF lv_line CS 'IN UPDATE TASK'.
        APPEND |source: { condense( lv_line ) }| TO et_signs.
      ELSEIF matches( val = lv_line regex = `^\s*(INSERT|UPDATE|MODIFY|DELETE)\s+(INTO\s+|FROM\s+)?[A-Z/][A-Z0-9_/]*\s*(FROM|SET|VALUES|WHERE|\.)` ).
        APPEND |source: { condense( lv_line ) }| TO et_signs.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD type_of.
    DATA lo_desc TYPE REF TO cl_abap_typedescr.

    IF is_par-typ IS INITIAL.
      RETURN.
    ENDIF.
    cl_abap_typedescr=>describe_by_name( EXPORTING p_name = is_par-typ RECEIVING p_descr_ref = lo_desc
                                         EXCEPTIONS type_not_found = 1 OTHERS = 2 ).
    IF sy-subrc <> 0 OR lo_desc IS NOT BOUND OR lo_desc->kind = cl_abap_typedescr=>kind_class
        OR lo_desc->kind = cl_abap_typedescr=>kind_intf OR lo_desc->kind = cl_abap_typedescr=>kind_ref.
      RETURN.
    ENDIF.
    ro_type ?= lo_desc.
    " A TABLES parameter is typed by its line.
    IF is_par-kind = 'T' AND ro_type->kind <> cl_abap_typedescr=>kind_table.
      ro_type = cl_abap_tabledescr=>create( p_line_type = ro_type ).
    ENDIF.
  ENDMETHOD.


  METHOD build.
    DATA: lt_comp  TYPE cl_abap_structdescr=>component_table,
          ls_comp  TYPE cl_abap_structdescr=>component,
          ls_par   TYPE ty_par,
          lo_type  TYPE REF TO cl_abap_datadescr,
          lo_struc TYPE REF TO cl_abap_structdescr,
          lr_in    TYPE REF TO data,
          ls_bind  TYPE abap_func_parmbind,
          lx_root  TYPE REF TO cx_root,
          lt_keys  TYPE string_table,
          lv_key   TYPE string.
    FIELD-SYMBOLS: <ls_in>  TYPE any,
                   <ls_out> TYPE any,
                   <lv_dst> TYPE any.

    CLEAR: et_ptab, er_out, ev_error.
    LOOP AT it_pars INTO ls_par WHERE kind <> 'X'.
      lo_type = type_of( ls_par ).
      IF lo_type IS NOT BOUND.
        IF ls_par-optional = abap_true OR ls_par-kind = 'E'.
          CONTINUE. " untyped or not describable: left out (optional) or not returned (export)
        ENDIF.
        ev_error = |Parameter { ls_par-name } has a type this test cannot fill ({ ls_par-typ })|.
        RETURN.
      ENDIF.
      ls_comp-name = ls_par-name. ls_comp-type = lo_type.
      APPEND ls_comp TO lt_comp.
    ENDLOOP.
    IF lt_comp IS INITIAL.
      RETURN.
    ENDIF.

    TRY.
        lo_struc = cl_abap_structdescr=>create( lt_comp ).
        CREATE DATA lr_in TYPE HANDLE lo_struc.
        CREATE DATA er_out TYPE HANDLE lo_struc.
        ASSIGN lr_in->* TO <ls_in>.
        ASSIGN er_out->* TO <ls_out>.
        IF iv_json IS NOT INITIAL.
          /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-none
                                     CHANGING data = <ls_in> ).
          " Names the module does not have are refused, never ignored.
          " (Keys read by our own scanner: /UI2/CL_JSON=>GENERATE is missing on older 7.40 support packages.)
          lt_keys = json_top_keys( iv_json ).
          IF lt_keys IS INITIAL AND iv_json CS ':'.
            ev_error = 'fm_params must be one JSON object of parameter names'.
            RETURN.
          ENDIF.
          LOOP AT lt_keys INTO lv_key.
            READ TABLE it_pars INTO ls_par WITH KEY name = lv_key.
            IF sy-subrc <> 0.
              ev_error = |{ lv_key } is not a parameter of this module|.
              RETURN.
            ENDIF.
            IF ls_par-kind = 'E' OR ls_par-kind = 'X'.
              ev_error = |{ lv_key } is not a parameter the caller sends|.
              RETURN.
            ENDIF.
          ENDLOOP.
        ENDIF.
      CATCH cx_root INTO lx_root.
        ev_error = |The parameters do not fit the module's types: { lx_root->get_text( ) }|.
        RETURN.
    ENDTRY.

    " Required importing parameters must be sent.
    LOOP AT it_pars INTO ls_par WHERE kind = 'I' AND optional = abap_false.
      READ TABLE lt_keys TRANSPORTING NO FIELDS WITH KEY table_line = ls_par-name.
      IF sy-subrc <> 0.
        ev_error = |Required parameter { ls_par-name } is missing|.
        RETURN.
      ENDIF.
    ENDLOOP.

    " The caller's view: the module's IMPORTING is our EXPORTING, and so on. Values sent go in the
    " out structure first, so CHANGING / TABLES come back in the same place.
    <ls_out> = <ls_in>.
    LOOP AT lt_comp INTO ls_comp.
      READ TABLE it_pars INTO ls_par WITH KEY name = ls_comp-name.
      ASSIGN COMPONENT ls_comp-name OF STRUCTURE <ls_out> TO <lv_dst>.
      CLEAR ls_bind.
      ls_bind-name = ls_comp-name.
      CASE ls_par-kind.
        WHEN 'I'.
          IF ls_par-optional = abap_true.
            READ TABLE lt_keys TRANSPORTING NO FIELDS WITH KEY table_line = ls_par-name.
            IF sy-subrc <> 0.
              CONTINUE. " not sent: the module's default applies
            ENDIF.
          ENDIF.
          ls_bind-kind = abap_func_exporting.
        WHEN 'E'.
          ls_bind-kind = abap_func_importing.
        WHEN 'C'.
          ls_bind-kind = abap_func_changing.
        WHEN 'T'.
          ls_bind-kind = abap_func_tables.
        WHEN OTHERS.
          CONTINUE.
      ENDCASE.
      GET REFERENCE OF <lv_dst> INTO ls_bind-value.
      INSERT ls_bind INTO TABLE et_ptab.
    ENDLOOP.
  ENDMETHOD.


  METHOD json_top_keys.
    " The names of a JSON object's own members (depth 1), upper case. Strings and nesting are skipped.
    DATA: lv_len   TYPE i,
          lv_pos   TYPE i,
          lv_depth TYPE i,
          lv_c     TYPE c LENGTH 1,
          lv_instr TYPE abap_bool,
          lv_esc   TYPE abap_bool,
          lv_start TYPE i,
          lv_str   TYPE string,
          lv_next  TYPE i,
          lv_k     TYPE c LENGTH 1,
          lv_tab   TYPE c LENGTH 1,
          lv_lf    TYPE c LENGTH 1,
          lv_cr    TYPE c LENGTH 1.

    lv_tab = cl_abap_char_utilities=>horizontal_tab.
    lv_lf  = cl_abap_char_utilities=>newline.
    lv_cr  = cl_abap_char_utilities=>cr_lf. " the first character: CR
    lv_len = strlen( iv_json ).
    WHILE lv_pos < lv_len.
      lv_c = iv_json+lv_pos(1).
      IF lv_instr = abap_true.
        IF lv_esc = abap_true.
          lv_esc = abap_false.
        ELSEIF lv_c = '\'.
          lv_esc = abap_true.
        ELSEIF lv_c = '"'.
          lv_instr = abap_false.
          " A string at depth 1 followed by ':' is a member name.
          IF lv_depth = 1.
            lv_str = substring( val = iv_json off = lv_start len = lv_pos - lv_start ).
            lv_next = lv_pos + 1.
            WHILE lv_next < lv_len.
              lv_k = iv_json+lv_next(1).
              " A blank in a c(1) is its initial value: compared with a one-blank string it never matches
              " (the trailing blank is dropped). Blank by IS INITIAL; tab / newline / CR as c(1) copies.
              IF NOT ( lv_k IS INITIAL OR lv_k = lv_tab OR lv_k = lv_lf OR lv_k = lv_cr ).
                EXIT.
              ENDIF.
              lv_next = lv_next + 1.
            ENDWHILE.
            IF lv_next < lv_len AND iv_json+lv_next(1) = ':'.
              APPEND to_upper( lv_str ) TO rt_keys.
            ENDIF.
          ENDIF.
        ENDIF.
      ELSEIF lv_c = '"'.
        lv_instr = abap_true.
        lv_start = lv_pos + 1.
      ELSEIF lv_c = '{' OR lv_c = '['.
        lv_depth = lv_depth + 1.
      ELSEIF lv_c = '}' OR lv_c = ']'.
        lv_depth = lv_depth - 1.
      ENDIF.
      lv_pos = lv_pos + 1.
    ENDWHILE.
  ENDMETHOD.


  METHOD messages_of.
    DATA: lo_struc TYPE REF TO cl_abap_structdescr,
          ls_comp  TYPE abap_compdescr,
          ls_msg   TYPE zif_mcp_biz_action=>ty_message.
    FIELD-SYMBOLS: <ls_out>  TYPE any,
                   <lv_par>  TYPE any,
                   <lt_tab>  TYPE ANY TABLE,
                   <ls_line> TYPE any,
                   <lv_f>    TYPE any.

    IF ir_out IS NOT BOUND.
      RETURN.
    ENDIF.
    ASSIGN ir_out->* TO <ls_out>.
    lo_struc ?= cl_abap_typedescr=>describe_by_data( <ls_out> ).
    LOOP AT lo_struc->components INTO ls_comp.
      ASSIGN COMPONENT ls_comp-name OF STRUCTURE <ls_out> TO <lv_par>.
      DATA(lv_rel) = cl_abap_typedescr=>describe_by_data( <lv_par> )->get_relative_name( ).
      DATA(lv_line) = ``.
      IF cl_abap_typedescr=>describe_by_data( <lv_par> )->kind = cl_abap_typedescr=>kind_table.
        lv_line = CAST cl_abap_tabledescr( cl_abap_typedescr=>describe_by_data( <lv_par> ) )->get_table_line_type( )->get_relative_name( ).
      ENDIF.
      IF NOT ( lv_rel CP 'BAPIRET*' OR lv_rel CP 'BAPIRETURN*' OR lv_line CP 'BAPIRET*' OR lv_line CP 'BAPIRETURN*' ).
        CONTINUE.
      ENDIF.
      IF lv_line IS NOT INITIAL.
        ASSIGN <lv_par> TO <lt_tab>.
        LOOP AT <lt_tab> ASSIGNING <ls_line>.
          CLEAR ls_msg.
          ASSIGN COMPONENT 'TYPE' OF STRUCTURE <ls_line> TO <lv_f>. IF sy-subrc = 0. ls_msg-type = <lv_f>. ENDIF.
          ASSIGN COMPONENT 'ID' OF STRUCTURE <ls_line> TO <lv_f>. IF sy-subrc = 0. ls_msg-id = <lv_f>. ENDIF.
          ASSIGN COMPONENT 'NUMBER' OF STRUCTURE <ls_line> TO <lv_f>. IF sy-subrc = 0. ls_msg-number = <lv_f>. ENDIF.
          ASSIGN COMPONENT 'MESSAGE' OF STRUCTURE <ls_line> TO <lv_f>. IF sy-subrc = 0. ls_msg-message = <lv_f>. ENDIF.
          IF ls_msg-type IS NOT INITIAL OR ls_msg-message IS NOT INITIAL.
            APPEND ls_msg TO cs_result-messages.
          ENDIF.
        ENDLOOP.
      ELSE.
        CLEAR ls_msg.
        ASSIGN COMPONENT 'TYPE' OF STRUCTURE <lv_par> TO <lv_f>. IF sy-subrc = 0. ls_msg-type = <lv_f>. ENDIF.
        ASSIGN COMPONENT 'ID' OF STRUCTURE <lv_par> TO <lv_f>. IF sy-subrc = 0. ls_msg-id = <lv_f>. ENDIF.
        ASSIGN COMPONENT 'NUMBER' OF STRUCTURE <lv_par> TO <lv_f>. IF sy-subrc = 0. ls_msg-number = <lv_f>. ENDIF.
        ASSIGN COMPONENT 'MESSAGE' OF STRUCTURE <lv_par> TO <lv_f>. IF sy-subrc = 0. ls_msg-message = <lv_f>. ENDIF.
        IF ls_msg-type IS NOT INITIAL OR ls_msg-message IS NOT INITIAL.
          APPEND ls_msg TO cs_result-messages.
        ENDIF.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD doc_numbers.
    DATA: ls_par TYPE ty_par,
          lv_val TYPE string.
    FIELD-SYMBOLS: <ls_out> TYPE any,
                   <lv_par> TYPE any.

    IF ir_out IS NOT BOUND.
      RETURN.
    ENDIF.
    ASSIGN ir_out->* TO <ls_out>.
    " Exporting scalars named like a document number.
    LOOP AT it_pars INTO ls_par WHERE kind = 'E'.
      IF NOT ( ls_par-name CP '*BELNR*' OR ls_par-name CP '*VBELN*' OR ls_par-name CP '*EBELN*'
          OR ls_par-name CP '*MBLNR*' OR ls_par-name CP '*DOC*' OR ls_par-name CP '*NUMBER*' OR ls_par-name CP '*AUFNR*' ).
        CONTINUE.
      ENDIF.
      ASSIGN COMPONENT ls_par-name OF STRUCTURE <ls_out> TO <lv_par>.
      IF sy-subrc <> 0 OR cl_abap_typedescr=>describe_by_data( <lv_par> )->kind <> cl_abap_typedescr=>kind_elem.
        CONTINUE.
      ENDIF.
      lv_val = condense( CONV string( <lv_par> ) ).
      IF lv_val IS NOT INITIAL AND lv_val CN '0 '.
        add_kv( EXPORTING iv_name = |doc_no.{ ls_par-name }| iv_value = lv_val CHANGING ct_rows = cs_result-rows ).
      ENDIF.
    ENDLOOP.
    " Success messages often carry the number too.
    LOOP AT cs_result-messages INTO DATA(ls_msg) WHERE type = 'S'.
      add_kv( EXPORTING iv_name = 'doc_no.message' iv_value = ls_msg-message CHANGING ct_rows = cs_result-rows ).
    ENDLOOP.
  ENDMETHOD.


  METHOD add_msg.
    DATA ls_msg TYPE zif_mcp_biz_action=>ty_message.

    ls_msg-type = iv_type.
    ls_msg-message = iv_text.
    APPEND ls_msg TO cs_result-messages.
    IF iv_type = 'E' OR iv_type = 'A'.
      cs_result-failed = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD add_kv.
    DATA ls_kv TYPE zif_mcp_biz_action=>ty_kv.

    ls_kv-row = lines( ct_rows ) + 1.
    ls_kv-name = iv_name.
    ls_kv-value = iv_value.
    APPEND ls_kv TO ct_rows.
  ENDMETHOD.

ENDCLASS.
