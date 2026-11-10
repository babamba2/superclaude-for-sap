CLASS zcl_mcp_biz_pm DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Business actions on plant maintenance (configs/PM/actions.json). Written in 7.31 syntax.
* Verified on ECC; the catalog hides PM on S/4HANA until it is verified there.
*
* Queries  PM.ORD.LIST_OPEN / GET_DETAIL (AUFK, AFIH, AFKO, AFVC, AFVV, RESB, COSP, COSS),
*          PM.NOTIF.LIST_OPEN / GET_DETAIL (QMEL, QMIH, QMFE, QMSM), PM.EQUI.GET_DETAIL / LIST
*          (EQUI, EQKT, EQUZ, ILOA), PM.FL.GET_DETAIL (IFLOT, IFLOTX, ILOA), PM.PLAN.GET_DETAIL
*          (MPLA, MPOS, MMPT, MHIS).
* Writes   PM.NOTIF.CREATE (BAPI_ALM_NOTIF_CREATE + _SAVE), PM.NOTIF.PUT_IN_PROCESS
*          (BAPI_ALM_NOTIF_PUTINPROGRESS, TESTRUN), PM.NOTIF.COMPLETE (BAPI_ALM_NOTIF_CLOSE, TESTRUN),
*          PM.ORD.CREATE / RELEASE / CHANGE_DATES / TECO (BAPI_ALM_ORDER_MAINTAIN, no test mode:
*          the preview runs the checks of the handler), PM.ORD.CONFIRM (BAPI_ALM_CONF_CREATE, TESTRUN).
* Authorization: I_IWERK (transaction + planning plant), I_AUART (order type), I_QMEL (notification
* type), checked by the handler (fail closed) before every write.
* No person names are returned (creator, reporter, changer).

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_ord,
        aufnr TYPE aufk-aufnr,
        auart TYPE aufk-auart,
        autyp TYPE aufk-autyp,
        objnr TYPE aufk-objnr,
        ktext TYPE aufk-ktext,
        werks TYPE aufk-werks,
        erdat TYPE aufk-erdat,
        kokrs TYPE aufk-kokrs,
        waers TYPE aufk-waers,
        iwerk TYPE afih-iwerk,
        equnr TYPE afih-equnr,
        iloan TYPE afih-iloan,
        qmnum TYPE afih-qmnum,
        warpl TYPE afih-warpl,
        priok TYPE afih-priok,
        gewrk TYPE afih-gewrk,
        gstrp TYPE afko-gstrp,
        gltrp TYPE afko-gltrp,
        aufpl TYPE afko-aufpl,
        rsnum TYPE afko-rsnum,
        tplnr TYPE iloa-tplnr,
      END OF ty_ord,
      ty_ords TYPE STANDARD TABLE OF ty_ord WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_qm,
        qmnum TYPE qmel-qmnum,
        qmart TYPE qmel-qmart,
        qmtxt TYPE qmel-qmtxt,
        objnr TYPE qmel-objnr,
        aufnr TYPE qmel-aufnr,
        priok TYPE qmel-priok,
        qmdat TYPE qmel-qmdat,
        erdat TYPE qmel-erdat,
        strmn TYPE qmel-strmn,
        ltrmn TYPE qmel-ltrmn,
        iwerk TYPE qmih-iwerk,
        equnr TYPE qmih-equnr,
        iloan TYPE qmih-iloan,
        ingrp TYPE qmih-ingrp,
        tplnr TYPE iloa-tplnr,
      END OF ty_qm,
      ty_qms TYPE STANDARD TABLE OF ty_qm WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_js,
        objnr TYPE jest-objnr,
        stat  TYPE jest-stat,
      END OF ty_js,
      ty_jss TYPE SORTED TABLE OF ty_js WITH NON-UNIQUE KEY objnr stat.

    TYPES ty_r_auart TYPE RANGE OF aufart.
    TYPES ty_r_equnr TYPE RANGE OF equnr.
    TYPES ty_r_qmart TYPE RANGE OF qmart.
    TYPES ty_r_iloan TYPE RANGE OF iloan.

    CONSTANTS:
      c_crtd TYPE j_status VALUE 'I0001',
      c_rel  TYPE j_status VALUE 'I0002',
      c_teco TYPE j_status VALUE 'I0045',
      c_clsd TYPE j_status VALUE 'I0046',
      c_dlfl TYPE j_status VALUE 'I0076',
      c_osno TYPE j_status VALUE 'I0068',
      c_nopr TYPE j_status VALUE 'I0070',
      c_noco TYPE j_status VALUE 'I0072'.

    " conversion and checks
    METHODS to_aufnr IMPORTING iv_text TYPE string RETURNING VALUE(rv_aufnr) TYPE aufnr.
    METHODS to_qmnum IMPORTING iv_text TYPE string RETURNING VALUE(rv_qmnum) TYPE qmnum.
    METHODS to_equnr IMPORTING iv_text TYPE string RETURNING VALUE(rv_equnr) TYPE equnr.
    METHODS to_tplnr IMPORTING iv_text TYPE string RETURNING VALUE(rv_tplnr) TYPE tplnr.
    METHODS to_date
      IMPORTING iv_text TYPE string
      EXPORTING ev_date TYPE d
                ev_ok   TYPE abap_bool.
    METHODS to_work
      IMPORTING iv_text TYPE string
      EXPORTING ev_work TYPE afru-ismnw
                ev_ok   TYPE abap_bool.
    METHODS max_rows IMPORTING iv_text TYPE string RETURNING VALUE(rv_max) TYPE i.
    METHODS check_iwerk
      IMPORTING iv_werks  TYPE string
                iv_need   TYPE abap_bool
      EXPORTING ev_iwerk  TYPE iwerk
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS auth_iwerk
      IMPORTING iv_tcd       TYPE tcode
                iv_iwerk     TYPE iwerk
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS auth_qmel
      IMPORTING iv_tcd       TYPE tcode
                iv_qmart     TYPE qmart
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS auth_auart
      IMPORTING iv_iwerk     TYPE iwerk
                iv_auart     TYPE aufart
      RETURNING VALUE(rv_ok) TYPE abap_bool.

    " reads
    METHODS read_order
      IMPORTING iv_aufnr TYPE aufnr
      EXPORTING es_ord   TYPE ty_ord
                ev_found TYPE abap_bool.
    METHODS read_notif
      IMPORTING iv_qmnum TYPE qmnum
      EXPORTING es_qm    TYPE ty_qm
                ev_found TYPE abap_bool.
    METHODS load_order
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_ord    TYPE ty_ord
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS load_notif
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_qm     TYPE ty_qm
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS has_stat
      IMPORTING iv_objnr      TYPE j_objnr
                iv_stat       TYPE j_status
      RETURNING VALUE(rv_yes) TYPE abap_bool.
    METHODS stat_text
      IMPORTING iv_objnr       TYPE j_objnr
      RETURNING VALUE(rv_text) TYPE string.
    METHODS read_stats
      IMPORTING it_objnr TYPE string_table
      RETURNING VALUE(rt_js) TYPE ty_jss.
    METHODS wc_name
      IMPORTING iv_objid       TYPE cr_objid
      RETURNING VALUE(rv_text) TYPE string.
    METHODS tplnr_out
      IMPORTING iv_tplnr       TYPE tplnr
      RETURNING VALUE(rv_text) TYPE string.
    METHODS equi_text
      IMPORTING iv_equnr       TYPE equnr
      RETURNING VALUE(rv_text) TYPE string.
    METHODS order_costs
      IMPORTING is_ord    TYPE ty_ord
      EXPORTING ev_plan   TYPE wkgxxx
                ev_actual TYPE wkgxxx
                ev_waers  TYPE waers.
    METHODS order_rows
      IMPORTING is_ord    TYPE ty_ord
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_rows
      IMPORTING is_qm     TYPE ty_qm
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS order_open_check
      IMPORTING is_ord    TYPE ty_ord
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " queries
    METHODS ord_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS ord_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS equi_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS equi_list IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS fl_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS plan_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " writes (preview = iv_execute false)
    METHODS notif_create
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_complete      TYPE abap_bool
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS ord_create
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS ord_status
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS ord_confirm
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS run_write
      IMPORTING iv_action        TYPE string
                is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    METHODS bapi_msgs
      IMPORTING it_return TYPE bapiret2_t
      EXPORTING ev_err    TYPE abap_bool
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS commit_wait.
    METHODS rollback.
    METHODS wait_stat
      IMPORTING iv_objnr      TYPE j_objnr
                iv_stat       TYPE j_status
      RETURNING VALUE(rv_yes) TYPE abap_bool.

    METHODS add_kv
      IMPORTING iv_row   TYPE i
                iv_name  TYPE string
                iv_value TYPE any
      CHANGING  ct_rows  TYPE zif_mcp_biz_action=>ty_kvs.
    METHODS add_msg
      IMPORTING iv_type   TYPE c
                iv_text   TYPE string
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS add_chg
      IMPORTING iv_field  TYPE string
                iv_old    TYPE any
                iv_new    TYPE any
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS finish
      CHANGING cs_result TYPE zif_mcp_biz_action=>ty_result.
ENDCLASS.


CLASS zcl_mcp_biz_pm IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/PM/actions.json.
    ls_def-kind = 'query'. ls_def-risk = 'none'.
    ls_def-id = 'PM.ORD.LIST_OPEN'.      APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.ORD.GET_DETAIL'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.NOTIF.LIST_OPEN'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.NOTIF.GET_DETAIL'.   APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.EQUI.GET_DETAIL'.    APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.EQUI.LIST'.          APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.FL.GET_DETAIL'.      APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.PLAN.GET_DETAIL'.    APPEND ls_def TO rt_actions.
    ls_def-kind = 'write'. ls_def-risk = 'medium'.
    ls_def-id = 'PM.NOTIF.CREATE'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.NOTIF.PUT_IN_PROCESS'. APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.NOTIF.COMPLETE'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.ORD.CREATE'.           APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.ORD.RELEASE'.          APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.ORD.CHANGE_DATES'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.ORD.CONFIRM'.          APPEND ls_def TO rt_actions.
    ls_def-id = 'PM.ORD.TECO'.             APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    CASE iv_action.
      WHEN 'PM.ORD.LIST_OPEN'.
        rs_result = ord_list_open( is_params ).
      WHEN 'PM.ORD.GET_DETAIL'.
        rs_result = ord_get_detail( is_params ).
      WHEN 'PM.NOTIF.LIST_OPEN'.
        rs_result = notif_list_open( is_params ).
      WHEN 'PM.NOTIF.GET_DETAIL'.
        rs_result = notif_get_detail( is_params ).
      WHEN 'PM.EQUI.GET_DETAIL'.
        rs_result = equi_get_detail( is_params ).
      WHEN 'PM.EQUI.LIST'.
        rs_result = equi_list( is_params ).
      WHEN 'PM.FL.GET_DETAIL'.
        rs_result = fl_get_detail( is_params ).
      WHEN 'PM.PLAN.GET_DETAIL'.
        rs_result = plan_get_detail( is_params ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a query action|
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    rs_result-action = iv_action.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~preview.
    rs_result = run_write( iv_action = iv_action is_params = is_params iv_execute = abap_false ).
  ENDMETHOD.


  METHOD zif_mcp_biz_action~execute.
    rs_result = run_write( iv_action = iv_action is_params = is_params iv_execute = abap_true ).
  ENDMETHOD.


  METHOD run_write.
    CASE iv_action.
      WHEN 'PM.NOTIF.CREATE'.
        rs_result = notif_create( is_params = is_params iv_execute = iv_execute ).
      WHEN 'PM.NOTIF.PUT_IN_PROCESS'.
        rs_result = notif_status( is_params = is_params iv_complete = abap_false iv_execute = iv_execute ).
      WHEN 'PM.NOTIF.COMPLETE'.
        rs_result = notif_status( is_params = is_params iv_complete = abap_true iv_execute = iv_execute ).
      WHEN 'PM.ORD.CREATE'.
        rs_result = ord_create( is_params = is_params iv_execute = iv_execute ).
      WHEN 'PM.ORD.RELEASE' OR 'PM.ORD.CHANGE_DATES' OR 'PM.ORD.TECO'.
        rs_result = ord_status( iv_action = iv_action is_params = is_params iv_execute = iv_execute ).
      WHEN 'PM.ORD.CONFIRM'.
        rs_result = ord_confirm( is_params = is_params iv_execute = iv_execute ).
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = |{ iv_action } is not a write action|
                 CHANGING cs_result = rs_result ).
    ENDCASE.
    rs_result-action = iv_action.
    IF iv_execute = abap_true.
      rs_result-mode = 'EXECUTE'.
    ELSE.
      rs_result-mode = 'PREVIEW'.
    ENDIF.
    finish( CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD to_aufnr.
    DATA lv_in TYPE string.

    lv_in = condense( iv_text ).
    IF lv_in IS INITIAL OR lv_in CN '0123456789' OR strlen( lv_in ) > 12 OR lv_in CO '0'.
      RETURN.
    ENDIF.
    rv_aufnr = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = rv_aufnr
      IMPORTING
        output = rv_aufnr.
  ENDMETHOD.


  METHOD to_qmnum.
    DATA lv_in TYPE string.

    lv_in = condense( iv_text ).
    IF lv_in IS INITIAL OR lv_in CN '0123456789' OR strlen( lv_in ) > 12 OR lv_in CO '0'.
      RETURN.
    ENDIF.
    rv_qmnum = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = rv_qmnum
      IMPORTING
        output = rv_qmnum.
  ENDMETHOD.


  METHOD to_equnr.
    DATA lv_in TYPE string.

    lv_in = condense( iv_text ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL OR strlen( lv_in ) > 18.
      RETURN.
    ENDIF.
    rv_equnr = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = rv_equnr
      IMPORTING
        output = rv_equnr.
  ENDMETHOD.


  METHOD to_tplnr.
    DATA: lv_in  TYPE string,
          lv_ext TYPE c LENGTH 40.

    lv_in = condense( iv_text ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL OR strlen( lv_in ) > 40.
      RETURN.
    ENDIF.
    lv_ext = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_TPLNR_INPUT'
      EXPORTING
        input          = lv_ext
      IMPORTING
        output         = rv_tplnr
      EXCEPTIONS
        not_found      = 1
        OTHERS         = 2.
    IF sy-subrc <> 0 OR rv_tplnr IS INITIAL.
      IF strlen( lv_in ) <= 30.
        rv_tplnr = lv_in.
      ELSE.
        CLEAR rv_tplnr.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD to_date.
    DATA lv_in TYPE string.

    CLEAR: ev_date, ev_ok.
    lv_in = condense( iv_text ).
    REPLACE ALL OCCURRENCES OF '-' IN lv_in WITH ''.
    REPLACE ALL OCCURRENCES OF '.' IN lv_in WITH ''.
    IF strlen( lv_in ) <> 8 OR lv_in CN '0123456789'.
      RETURN.
    ENDIF.
    ev_date = lv_in.
    CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'
      EXPORTING
        date                      = ev_date
      EXCEPTIONS
        plausibility_check_failed = 1
        OTHERS                    = 2.
    IF sy-subrc = 0.
      ev_ok = abap_true.
    ELSE.
      CLEAR ev_date.
    ENDIF.
  ENDMETHOD.


  METHOD to_work.
    DATA: lv_in  TYPE string,
          lv_dec TYPE p LENGTH 15 DECIMALS 3.

    CLEAR: ev_work, ev_ok.
    lv_in = condense( iv_text ).
    REPLACE ALL OCCURRENCES OF ',' IN lv_in WITH '.'.
    IF lv_in IS INITIAL OR lv_in CN '0123456789.'.
      RETURN.
    ENDIF.
    TRY.
        lv_dec = lv_in.
      CATCH cx_sy_conversion_error.
        RETURN.
    ENDTRY.
    IF lv_dec <= 0 OR lv_dec > 99999.
      RETURN.
    ENDIF.
    ev_work = lv_dec.
    ev_ok = abap_true.
  ENDMETHOD.


  METHOD max_rows.
    DATA lv_in TYPE string.

    rv_max = 50.
    lv_in = condense( iv_text ).
    IF lv_in IS NOT INITIAL AND lv_in CO '0123456789' AND strlen( lv_in ) <= 4.
      rv_max = lv_in.
    ENDIF.
    IF rv_max < 1.
      rv_max = 1.
    ELSEIF rv_max > 500.
      rv_max = 500.
    ENDIF.
  ENDMETHOD.


  METHOD check_iwerk.
    DATA lv_in TYPE string.

    CLEAR ev_iwerk.
    lv_in = condense( iv_werks ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL.
      IF iv_need = abap_true.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required (maintenance planning plant)'
                 CHANGING cs_result = cs_result ).
      ENDIF.
      RETURN.
    ENDIF.
    IF strlen( lv_in ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks must be a plant (up to 4 characters)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_iwerk = lv_in.
    SELECT SINGLE iwerk FROM t399i INTO ev_iwerk WHERE iwerk = ev_iwerk.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Planning plant { lv_in } does not exist (maintenance planning plants, T399I)|
               CHANGING cs_result = cs_result ).
      CLEAR ev_iwerk.
    ENDIF.
  ENDMETHOD.


  METHOD auth_iwerk.
    AUTHORITY-CHECK OBJECT 'I_IWERK' ID 'TCD' FIELD iv_tcd ID 'IWERK' FIELD iv_iwerk.
    rv_ok = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD auth_qmel.
    AUTHORITY-CHECK OBJECT 'I_QMEL' ID 'TCD' FIELD iv_tcd ID 'QMART' FIELD iv_qmart.
    rv_ok = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD auth_auart.
    AUTHORITY-CHECK OBJECT 'I_AUART' ID 'IWERK' FIELD iv_iwerk ID 'AUFART' FIELD iv_auart.
    rv_ok = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD read_order.
    CLEAR: es_ord, ev_found.
    SELECT SINGLE aufnr auart autyp objnr ktext werks erdat kokrs waers FROM aufk
      INTO CORRESPONDING FIELDS OF es_ord WHERE aufnr = iv_aufnr.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    ev_found = abap_true.
    SELECT SINGLE iwerk equnr iloan qmnum warpl priok gewrk FROM afih
      INTO (es_ord-iwerk, es_ord-equnr, es_ord-iloan, es_ord-qmnum, es_ord-warpl, es_ord-priok, es_ord-gewrk)
      WHERE aufnr = iv_aufnr.
    SELECT SINGLE gstrp gltrp aufpl rsnum FROM afko
      INTO (es_ord-gstrp, es_ord-gltrp, es_ord-aufpl, es_ord-rsnum)
      WHERE aufnr = iv_aufnr.
    IF es_ord-iloan IS NOT INITIAL.
      SELECT SINGLE tplnr FROM iloa INTO es_ord-tplnr WHERE iloan = es_ord-iloan.
    ENDIF.
  ENDMETHOD.


  METHOD read_notif.
    CLEAR: es_qm, ev_found.
    SELECT SINGLE qmnum qmart qmtxt objnr aufnr priok qmdat erdat strmn ltrmn FROM qmel
      INTO CORRESPONDING FIELDS OF es_qm WHERE qmnum = iv_qmnum.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    ev_found = abap_true.
    SELECT SINGLE iwerk equnr iloan ingrp FROM qmih
      INTO (es_qm-iwerk, es_qm-equnr, es_qm-iloan, es_qm-ingrp)
      WHERE qmnum = iv_qmnum.
    IF es_qm-iloan IS NOT INITIAL.
      SELECT SINGLE tplnr FROM iloa INTO es_qm-tplnr WHERE iloan = es_qm-iloan.
    ENDIF.
  ENDMETHOD.


  METHOD load_order.
    DATA: lv_aufnr TYPE aufnr,
          lv_found TYPE abap_bool.

    CLEAR es_ord.
    lv_aufnr = to_aufnr( is_params-aufnr ).
    IF lv_aufnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'aufnr is required (maintenance order number, digits up to 12)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    read_order( EXPORTING iv_aufnr = lv_aufnr IMPORTING es_ord = es_ord ev_found = lv_found ).
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Maintenance order { is_params-aufnr } not found|
               CHANGING cs_result = cs_result ).
      CLEAR es_ord.
      RETURN.
    ENDIF.
    IF es_ord-autyp <> '30'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = |Order { is_params-aufnr } is not a maintenance order (order category { es_ord-autyp }, type { es_ord-auart })|
               CHANGING cs_result = cs_result ).
      CLEAR es_ord.
    ENDIF.
  ENDMETHOD.


  METHOD load_notif.
    DATA: lv_qmnum TYPE qmnum,
          lv_found TYPE abap_bool,
          lv_qmtyp TYPE tq80-qmtyp.

    CLEAR es_qm.
    lv_qmnum = to_qmnum( is_params-qmnum ).
    IF lv_qmnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'qmnum is required (notification number, digits up to 12)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    read_notif( EXPORTING iv_qmnum = lv_qmnum IMPORTING es_qm = es_qm ev_found = lv_found ).
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { is_params-qmnum } not found|
               CHANGING cs_result = cs_result ).
      CLEAR es_qm.
      RETURN.
    ENDIF.
    SELECT SINGLE qmtyp FROM tq80 INTO lv_qmtyp WHERE qmart = es_qm-qmart.
    IF lv_qmtyp <> '01'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = |Notification { is_params-qmnum } (type { es_qm-qmart }) is not a maintenance notification|
               CHANGING cs_result = cs_result ).
      CLEAR es_qm.
    ENDIF.
  ENDMETHOD.


  METHOD has_stat.
    DATA lv_stat TYPE jest-stat.

    SELECT SINGLE stat FROM jest INTO lv_stat WHERE objnr = iv_objnr AND stat = iv_stat AND inact = space.
    rv_yes = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD stat_text.
    DATA: lv_line TYPE bsvx-sttxt,
          lv_user TYPE bsvx-sttxt.

    CALL FUNCTION 'STATUS_TEXT_EDIT'
      EXPORTING
        objnr            = iv_objnr
        spras            = sy-langu
        flg_user_stat    = 'X'
      IMPORTING
        line             = lv_line
        user_line        = lv_user
      EXCEPTIONS
        object_not_found = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    rv_text = condense( lv_line ).
    IF lv_user IS NOT INITIAL.
      rv_text = |{ rv_text } / { condense( lv_user ) }|.
    ENDIF.
  ENDMETHOD.


  METHOD read_stats.
    TYPES: BEGIN OF ty_o,
             objnr TYPE jest-objnr,
           END OF ty_o.
    DATA: lt_o TYPE STANDARD TABLE OF ty_o,
          ls_o TYPE ty_o,
          lv_s TYPE string,
          lt_r TYPE STANDARD TABLE OF ty_js.

    LOOP AT it_objnr INTO lv_s.
      ls_o-objnr = lv_s.
      APPEND ls_o TO lt_o.
    ENDLOOP.
    IF lt_o IS INITIAL.
      RETURN.
    ENDIF.
    SELECT objnr stat FROM jest INTO TABLE lt_r
      FOR ALL ENTRIES IN lt_o
      WHERE objnr = lt_o-objnr AND inact = space
        AND stat IN ('I0001', 'I0002', 'I0045', 'I0046', 'I0076', 'I0068', 'I0070', 'I0071', 'I0072').
    rt_js = lt_r.
  ENDMETHOD.


  METHOD wc_name.
    DATA: lv_arbpl TYPE crhd-arbpl,
          lv_werks TYPE crhd-werks.

    IF iv_objid IS INITIAL.
      RETURN.
    ENDIF.
    SELECT SINGLE arbpl werks FROM crhd INTO (lv_arbpl, lv_werks) WHERE objty = 'A' AND objid = iv_objid.
    IF sy-subrc = 0.
      rv_text = |{ lv_arbpl }/{ lv_werks }|.
    ENDIF.
  ENDMETHOD.


  METHOD tplnr_out.
    DATA lv_ext TYPE c LENGTH 40.

    IF iv_tplnr IS INITIAL.
      RETURN.
    ENDIF.
    CALL FUNCTION 'CONVERSION_EXIT_TPLNR_OUTPUT'
      EXPORTING
        input  = iv_tplnr
      IMPORTING
        output = lv_ext.
    rv_text = condense( lv_ext ).
    IF rv_text IS INITIAL.
      rv_text = iv_tplnr.
    ENDIF.
  ENDMETHOD.


  METHOD equi_text.
    DATA lv_txt TYPE eqkt-eqktx.

    SELECT SINGLE eqktx FROM eqkt INTO lv_txt WHERE equnr = iv_equnr AND spras = sy-langu.
    IF sy-subrc <> 0.
      SELECT SINGLE eqktx FROM eqkt INTO lv_txt WHERE equnr = iv_equnr.
    ENDIF.
    rv_text = lv_txt.
  ENDMETHOD.


  METHOD order_costs.
    DATA: lt_cosp TYPE STANDARD TABLE OF cosp,
          ls_cosp TYPE cosp,
          lt_coss TYPE STANDARD TABLE OF coss,
          ls_coss TYPE coss,
          lv_f    TYPE string,
          lv_n    TYPE n LENGTH 3.
    FIELD-SYMBOLS <lv_v> TYPE any.

    CLEAR: ev_plan, ev_actual, ev_waers.
    SELECT SINGLE waers FROM tka01 INTO ev_waers WHERE kokrs = is_ord-kokrs.
    SELECT * FROM cosp INTO TABLE lt_cosp WHERE objnr = is_ord-objnr AND wrttp IN ('01', '04') AND versn = '000'.
    SELECT * FROM coss INTO TABLE lt_coss WHERE objnr = is_ord-objnr AND wrttp IN ('01', '04') AND versn = '000'.
    LOOP AT lt_cosp INTO ls_cosp.
      DO 16 TIMES.
        lv_n = sy-index.
        lv_f = |WKG{ lv_n }|.
        ASSIGN COMPONENT lv_f OF STRUCTURE ls_cosp TO <lv_v>.
        IF sy-subrc = 0.
          IF ls_cosp-wrttp = '01'.
            ev_plan = ev_plan + <lv_v>.
          ELSE.
            ev_actual = ev_actual + <lv_v>.
          ENDIF.
        ENDIF.
      ENDDO.
    ENDLOOP.
    LOOP AT lt_coss INTO ls_coss.
      DO 16 TIMES.
        lv_n = sy-index.
        lv_f = |WKG{ lv_n }|.
        ASSIGN COMPONENT lv_f OF STRUCTURE ls_coss TO <lv_v>.
        IF sy-subrc = 0.
          IF ls_coss-wrttp = '01'.
            ev_plan = ev_plan + <lv_v>.
          ELSE.
            ev_actual = ev_actual + <lv_v>.
          ENDIF.
        ENDIF.
      ENDDO.
    ENDLOOP.
  ENDMETHOD.


  METHOD order_rows.
    DATA lv_row TYPE i.

    lv_row = 1.
    add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER'         iv_value = is_ord-aufnr CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER_TYPE'    iv_value = is_ord-auart CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT'          iv_value = is_ord-ktext CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNING_PLANT' iv_value = is_ord-iwerk CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'        iv_value = stat_text( is_ord-objnr ) CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'BASIC_START'   iv_value = is_ord-gstrp CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'BASIC_FINISH'  iv_value = is_ord-gltrp CHANGING ct_rows = cs_result-rows ).
    IF is_ord-equnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'EQUIPMENT' iv_value = is_ord-equnr CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_ord-tplnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( is_ord-tplnr ) CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_ord-qmnum IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'NOTIFICATION' iv_value = is_ord-qmnum CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_ord-warpl IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'MAINTENANCE_PLAN' iv_value = is_ord-warpl CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_ord-priok IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRIORITY' iv_value = is_ord-priok CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    add_kv( EXPORTING iv_row = lv_row iv_name = 'MAIN_WORK_CENTER' iv_value = wc_name( is_ord-gewrk ) CHANGING ct_rows = cs_result-rows ).
  ENDMETHOD.


  METHOD notif_rows.
    DATA lv_row TYPE i.

    lv_row = 1.
    add_kv( EXPORTING iv_row = lv_row iv_name = 'NOTIFICATION' iv_value = is_qm-qmnum CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'TYPE'         iv_value = is_qm-qmart CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT'         iv_value = is_qm-qmtxt CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'       iv_value = stat_text( is_qm-objnr ) CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED'      iv_value = is_qm-erdat CHANGING ct_rows = cs_result-rows ).
    IF is_qm-priok IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PRIORITY' iv_value = is_qm-priok CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qm-iwerk IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNING_PLANT' iv_value = is_qm-iwerk CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qm-equnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'EQUIPMENT' iv_value = is_qm-equnr CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qm-tplnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( is_qm-tplnr ) CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qm-aufnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER' iv_value = is_qm-aufnr CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qm-strmn IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'REQUIRED_START' iv_value = is_qm-strmn CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qm-ltrmn IS NOT INITIAL.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'REQUIRED_END' iv_value = is_qm-ltrmn CHANGING ct_rows = cs_result-rows ).
    ENDIF.
  ENDMETHOD.


  METHOD order_open_check.
    " Status checks shared by RELEASE / CHANGE_DATES / TECO / CONFIRM.
    IF has_stat( iv_objnr = is_ord-objnr iv_stat = c_dlfl ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Order { is_ord-aufnr } is flagged for deletion (DLFL)|
               CHANGING cs_result = cs_result ).
    ELSEIF has_stat( iv_objnr = is_ord-objnr iv_stat = c_clsd ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Order { is_ord-aufnr } is closed (CLSD)|
               CHANGING cs_result = cs_result ).
    ELSEIF has_stat( iv_objnr = is_ord-objnr iv_stat = c_teco ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Order { is_ord-aufnr } is technically completed (TECO)|
               CHANGING cs_result = cs_result ).
    ENDIF.
  ENDMETHOD.


  METHOD ord_list_open.
    TYPES: BEGIN OF ty_l,
             aufnr TYPE aufk-aufnr,
             auart TYPE aufk-auart,
             objnr TYPE aufk-objnr,
             ktext TYPE aufk-ktext,
             erdat TYPE aufk-erdat,
             equnr TYPE afih-equnr,
             iloan TYPE afih-iloan,
             qmnum TYPE afih-qmnum,
             gstrp TYPE afko-gstrp,
             gltrp TYPE afko-gltrp,
           END OF ty_l.
    DATA: lv_iwerk  TYPE iwerk,
          lr_auart  TYPE ty_r_auart,
          ls_auart  LIKE LINE OF lr_auart,
          lr_equnr  TYPE ty_r_equnr,
          ls_equnr  LIKE LINE OF lr_equnr,
          lr_iloan  TYPE ty_r_iloan,
          ls_iloan  LIKE LINE OF lr_iloan,
          lv_tplnr  TYPE tplnr,
          lt_iloan  TYPE STANDARD TABLE OF iloan,
          lv_iloan  TYPE iloan,
          lv_flt    TYPE string,
          lt_l      TYPE STANDARD TABLE OF ty_l,
          ls_l      TYPE ty_l,
          lt_obj    TYPE string_table,
          lt_js     TYPE ty_jss,
          lv_max    TYPE i,
          lv_row    TYPE i,
          lv_open   TYPE i,
          lv_rel    TYPE abap_bool,
          lv_st     TYPE string,
          lv_text   TYPE string,
          lv_obj    TYPE string.

    check_iwerk( EXPORTING iv_werks = is_params-werks iv_need = abap_true IMPORTING ev_iwerk = lv_iwerk CHANGING cs_result = rs_result ).
    IF lv_iwerk IS INITIAL.
      RETURN.
    ENDIF.
    lv_flt = condense( is_params-status ).
    TRANSLATE lv_flt TO LOWER CASE.
    IF lv_flt IS NOT INITIAL AND lv_flt <> 'created' AND lv_flt <> 'released' AND lv_flt <> 'open'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'status must be open, created or released'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF strlen( condense( is_params-auart ) ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'auart must be an order type (up to 4 characters)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-auart IS NOT INITIAL.
      ls_auart-sign = 'I'. ls_auart-option = 'EQ'.
      ls_auart-low = condense( is_params-auart ).
      TRANSLATE ls_auart-low TO UPPER CASE.
      APPEND ls_auart TO lr_auart.
    ENDIF.
    IF is_params-equnr IS NOT INITIAL.
      ls_equnr-sign = 'I'. ls_equnr-option = 'EQ'.
      ls_equnr-low = to_equnr( is_params-equnr ).
      APPEND ls_equnr TO lr_equnr.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_tplnr = to_tplnr( is_params-tplnr ).
      SELECT iloan FROM iloa INTO TABLE lt_iloan UP TO 5000 ROWS WHERE tplnr = lv_tplnr.
      IF lt_iloan IS INITIAL.
        rs_result-summary = |Planning plant { lv_iwerk }: 0 open maintenance orders on functional location { is_params-tplnr }|.
        RETURN.
      ENDIF.
      LOOP AT lt_iloan INTO lv_iloan.
        ls_iloan-sign = 'I'. ls_iloan-option = 'EQ'. ls_iloan-low = lv_iloan.
        APPEND ls_iloan TO lr_iloan.
      ENDLOOP.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).

    SELECT a~aufnr a~auart a~objnr a~ktext a~erdat h~equnr h~iloan h~qmnum f~gstrp f~gltrp
      FROM aufk AS a INNER JOIN afih AS h ON h~aufnr = a~aufnr
                     INNER JOIN afko AS f ON f~aufnr = a~aufnr
      INTO TABLE lt_l UP TO 5000 ROWS
      WHERE a~autyp = '30' AND h~iwerk = lv_iwerk AND a~auart IN lr_auart AND h~equnr IN lr_equnr
        AND h~iloan IN lr_iloan.
    LOOP AT lt_l INTO ls_l.
      lv_obj = ls_l-objnr.
      APPEND lv_obj TO lt_obj.
    ENDLOOP.
    lt_js = read_stats( lt_obj ).
    SORT lt_l BY gstrp DESCENDING aufnr DESCENDING.

    LOOP AT lt_l INTO ls_l.
      READ TABLE lt_js WITH KEY objnr = ls_l-objnr stat = c_teco TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_js WITH KEY objnr = ls_l-objnr stat = c_clsd TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_js WITH KEY objnr = ls_l-objnr stat = c_dlfl TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_js WITH KEY objnr = ls_l-objnr stat = c_rel TRANSPORTING NO FIELDS.
      lv_rel = boolc( sy-subrc = 0 ).
      IF lv_flt = 'created' AND lv_rel = abap_true.
        CONTINUE.
      ELSEIF lv_flt = 'released' AND lv_rel = abap_false.
        CONTINUE.
      ENDIF.
      lv_open = lv_open + 1.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      IF lv_rel = abap_true.
        lv_st = 'released'.
      ELSE.
        lv_st = 'created'.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER'      iv_value = ls_l-aufnr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER_TYPE' iv_value = ls_l-auart CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT'       iv_value = ls_l-ktext CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'     iv_value = lv_st CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BASIC_START' iv_value = ls_l-gstrp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'BASIC_FINISH' iv_value = ls_l-gltrp CHANGING ct_rows = rs_result-rows ).
      IF ls_l-equnr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'EQUIPMENT' iv_value = ls_l-equnr CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_l-iloan IS NOT INITIAL.
        CLEAR lv_tplnr.
        SELECT SINGLE tplnr FROM iloa INTO lv_tplnr WHERE iloan = ls_l-iloan.
        IF lv_tplnr IS NOT INITIAL.
          add_kv( EXPORTING iv_row = lv_row iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( lv_tplnr ) CHANGING ct_rows = rs_result-rows ).
        ENDIF.
      ENDIF.
      IF ls_l-qmnum IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'NOTIFICATION' iv_value = ls_l-qmnum CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.

    lv_text = |Planning plant { lv_iwerk }: { lv_open } open maintenance orders|.
    IF lv_flt = 'created' OR lv_flt = 'released'.
      lv_text = |{ lv_text } ({ lv_flt })|.
    ENDIF.
    IF lr_auart IS NOT INITIAL.
      lv_text = |{ lv_text } of type { is_params-auart }|.
    ENDIF.
    IF lr_equnr IS NOT INITIAL.
      lv_text = |{ lv_text } on equipment { is_params-equnr }|.
    ENDIF.
    IF lr_iloan IS NOT INITIAL.
      lv_text = |{ lv_text } on functional location { is_params-tplnr }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD ord_get_detail.
    TYPES: BEGIN OF ty_op,
             vornr TYPE afvc-vornr,
             steus TYPE afvc-steus,
             arbid TYPE afvc-arbid,
             ltxa1 TYPE afvc-ltxa1,
             objnr TYPE afvc-objnr,
             rueck TYPE afvc-rueck,
             arbei TYPE afvv-arbei,
             arbeh TYPE afvv-arbeh,
             ismnw TYPE afvv-ismnw,
           END OF ty_op,
           BEGIN OF ty_cp,
             rspos TYPE resb-rspos,
             matnr TYPE resb-matnr,
             bdmng TYPE resb-bdmng,
             enmng TYPE resb-enmng,
             meins TYPE resb-meins,
             vornr TYPE resb-vornr,
           END OF ty_cp.
    DATA: ls_ord    TYPE ty_ord,
          lt_op     TYPE STANDARD TABLE OF ty_op,
          ls_op     TYPE ty_op,
          lt_cp     TYPE STANDARD TABLE OF ty_cp,
          ls_cp     TYPE ty_cp,
          lv_row    TYPE i,
          lv_plan   TYPE wkgxxx,
          lv_act    TYPE wkgxxx,
          lv_waers  TYPE waers,
          lv_nconf  TYPE i,
          lv_s      TYPE string.

    load_order( EXPORTING is_params = is_params IMPORTING es_ord = ls_ord CHANGING cs_result = rs_result ).
    IF ls_ord IS INITIAL.
      RETURN.
    ENDIF.
    IF auth_iwerk( iv_tcd = 'IW33' iv_iwerk = ls_ord-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to display orders of planning plant { ls_ord-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    order_rows( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).
    order_costs( EXPORTING is_ord = ls_ord IMPORTING ev_plan = lv_plan ev_actual = lv_act ev_waers = lv_waers ).
    lv_s = lv_plan.
    add_kv( EXPORTING iv_row = 1 iv_name = 'PLAN_COSTS'   iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
    lv_s = lv_act.
    add_kv( EXPORTING iv_row = 1 iv_name = 'ACTUAL_COSTS' iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CURRENCY'     iv_value = lv_waers CHANGING ct_rows = rs_result-rows ).
    SELECT COUNT(*) FROM afru INTO lv_nconf WHERE aufnr = ls_ord-aufnr AND stokz = space AND stzhl = '00000000'.
    add_kv( EXPORTING iv_row = 1 iv_name = 'CONFIRMATIONS' iv_value = lv_nconf CHANGING ct_rows = rs_result-rows ).

    SELECT v~vornr v~steus v~arbid v~ltxa1 v~objnr v~rueck w~arbei w~arbeh w~ismnw
      FROM afvc AS v INNER JOIN afvv AS w ON w~aufpl = v~aufpl AND w~aplzl = v~aplzl
      INTO TABLE lt_op WHERE v~aufpl = ls_ord-aufpl.
    SORT lt_op BY vornr.
    lv_row = 1.
    LOOP AT lt_op INTO ls_op.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OPERATION'    iv_value = ls_op-vornr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CONTROL_KEY'  iv_value = ls_op-steus CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WORK_CENTER'  iv_value = wc_name( ls_op-arbid ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT'         iv_value = ls_op-ltxa1 CHANGING ct_rows = rs_result-rows ).
      lv_s = |{ ls_op-arbei } { ls_op-arbeh }|.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNED_WORK' iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
      lv_s = |{ ls_op-ismnw } { ls_op-arbeh }|.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ACTUAL_WORK'  iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'       iv_value = stat_text( ls_op-objnr ) CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    IF ls_ord-rsnum IS NOT INITIAL.
      SELECT rspos matnr bdmng enmng meins vornr FROM resb INTO TABLE lt_cp
        WHERE rsnum = ls_ord-rsnum AND xloek = space.
      SORT lt_cp BY rspos.
      LOOP AT lt_cp INTO ls_cp.
        lv_row = lv_row + 1.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'COMPONENT'       iv_value = ls_cp-matnr CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'COMP_OPERATION'  iv_value = ls_cp-vornr CHANGING ct_rows = rs_result-rows ).
        lv_s = |{ ls_cp-bdmng } { ls_cp-meins }|.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'REQUIREMENT_QTY' iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
        lv_s = |{ ls_cp-enmng } { ls_cp-meins }|.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'WITHDRAWN_QTY'   iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
      ENDLOOP.
    ENDIF.
    rs_result-summary = |Maintenance order { ls_ord-aufnr } ({ ls_ord-auart }, planning plant { ls_ord-iwerk }): status | &&
                        |{ stat_text( ls_ord-objnr ) }, { lines( lt_op ) } operations, { lines( lt_cp ) } components, | &&
                        |{ lv_nconf } confirmations, actual costs { lv_act } { lv_waers }|.
  ENDMETHOD.


  METHOD notif_list_open.
    DATA: lv_iwerk TYPE iwerk,
          lr_qmart TYPE ty_r_qmart,
          ls_qmart LIKE LINE OF lr_qmart,
          lt_qmart TYPE STANDARD TABLE OF qmart,
          lv_qmart TYPE qmart,
          lr_equnr TYPE ty_r_equnr,
          ls_equnr LIKE LINE OF lr_equnr,
          lv_tplnr TYPE tplnr,
          lt_qm    TYPE ty_qms,
          ls_qm    TYPE ty_qm,
          lt_obj   TYPE string_table,
          lv_obj   TYPE string,
          lt_js    TYPE ty_jss,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_open  TYPE i,
          lv_st    TYPE string,
          lv_text  TYPE string,
          lv_qmtyp TYPE tq80-qmtyp.

    check_iwerk( EXPORTING iv_werks = is_params-werks iv_need = abap_false IMPORTING ev_iwerk = lv_iwerk CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF strlen( condense( is_params-qmart ) ) > 2.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'qmart must be a notification type (up to 2 characters)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-qmart IS NOT INITIAL.
      lv_qmart = condense( is_params-qmart ).
      TRANSLATE lv_qmart TO UPPER CASE.
      SELECT SINGLE qmtyp FROM tq80 INTO lv_qmtyp WHERE qmart = lv_qmart.
      IF sy-subrc <> 0 OR lv_qmtyp <> '01'.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Notification type { is_params-qmart } is not a maintenance notification type|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      APPEND lv_qmart TO lt_qmart.
    ELSE.
      SELECT qmart FROM tq80 INTO TABLE lt_qmart WHERE qmtyp = '01'.
    ENDIF.
    LOOP AT lt_qmart INTO lv_qmart.
      ls_qmart-sign = 'I'. ls_qmart-option = 'EQ'. ls_qmart-low = lv_qmart.
      APPEND ls_qmart TO lr_qmart.
    ENDLOOP.
    IF lr_qmart IS INITIAL.
      rs_result-summary = '0 open maintenance notifications (no maintenance notification type configured)'.
      RETURN.
    ENDIF.
    IF is_params-equnr IS NOT INITIAL.
      ls_equnr-sign = 'I'. ls_equnr-option = 'EQ'. ls_equnr-low = to_equnr( is_params-equnr ).
      APPEND ls_equnr TO lr_equnr.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).

    SELECT q~qmnum q~qmart q~qmtxt q~objnr q~aufnr q~priok q~qmdat q~erdat q~strmn q~ltrmn
           i~iwerk i~equnr i~iloan i~ingrp
      FROM qmel AS q INNER JOIN qmih AS i ON i~qmnum = q~qmnum
      INTO CORRESPONDING FIELDS OF TABLE lt_qm UP TO 5000 ROWS
      WHERE q~qmart IN lr_qmart AND i~equnr IN lr_equnr.
    IF lv_iwerk IS NOT INITIAL.
      DELETE lt_qm WHERE iwerk <> lv_iwerk.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_tplnr = to_tplnr( is_params-tplnr ).
      LOOP AT lt_qm INTO ls_qm.
        IF ls_qm-iloan IS NOT INITIAL.
          SELECT SINGLE tplnr FROM iloa INTO ls_qm-tplnr WHERE iloan = ls_qm-iloan.
          MODIFY lt_qm FROM ls_qm.
        ENDIF.
      ENDLOOP.
      DELETE lt_qm WHERE tplnr <> lv_tplnr.
    ENDIF.
    LOOP AT lt_qm INTO ls_qm.
      lv_obj = ls_qm-objnr.
      APPEND lv_obj TO lt_obj.
    ENDLOOP.
    lt_js = read_stats( lt_obj ).
    SORT lt_qm BY erdat DESCENDING qmnum DESCENDING.

    LOOP AT lt_qm INTO ls_qm.
      READ TABLE lt_js WITH KEY objnr = ls_qm-objnr stat = c_noco TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_js WITH KEY objnr = ls_qm-objnr stat = c_dlfl TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      lv_open = lv_open + 1.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      READ TABLE lt_js WITH KEY objnr = ls_qm-objnr stat = c_nopr TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        lv_st = 'in process'.
      ELSE.
        lv_st = 'outstanding'.
      ENDIF.
      IF ls_qm-tplnr IS INITIAL AND ls_qm-iloan IS NOT INITIAL.
        SELECT SINGLE tplnr FROM iloa INTO ls_qm-tplnr WHERE iloan = ls_qm-iloan.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'NOTIFICATION' iv_value = ls_qm-qmnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TYPE'         iv_value = ls_qm-qmart CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT'         iv_value = ls_qm-qmtxt CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS'       iv_value = lv_st CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED'      iv_value = ls_qm-erdat CHANGING ct_rows = rs_result-rows ).
      IF ls_qm-priok IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'PRIORITY' iv_value = ls_qm-priok CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_qm-equnr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'EQUIPMENT' iv_value = ls_qm-equnr CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_qm-tplnr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( ls_qm-tplnr ) CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_qm-aufnr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER' iv_value = ls_qm-aufnr CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.

    lv_text = |{ lv_open } open maintenance notifications|.
    IF lv_iwerk IS NOT INITIAL.
      lv_text = |Planning plant { lv_iwerk }: { lv_text }|.
    ENDIF.
    IF is_params-qmart IS NOT INITIAL.
      lv_text = |{ lv_text } of type { is_params-qmart }|.
    ENDIF.
    IF lr_equnr IS NOT INITIAL.
      lv_text = |{ lv_text } on equipment { is_params-equnr }|.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_text = |{ lv_text } on functional location { is_params-tplnr }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD notif_get_detail.
    DATA: ls_qm    TYPE ty_qm,
          lv_items TYPE i,
          lv_tasks TYPE i,
          lv_open  TYPE i.

    load_notif( EXPORTING is_params = is_params IMPORTING es_qm = ls_qm CHANGING cs_result = rs_result ).
    IF ls_qm IS INITIAL.
      RETURN.
    ENDIF.
    IF auth_qmel( iv_tcd = 'IW23' iv_qmart = ls_qm-qmart ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to display notifications of type { ls_qm-qmart } (I_QMEL)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    notif_rows( EXPORTING is_qm = ls_qm CHANGING cs_result = rs_result ).
    SELECT COUNT(*) FROM qmfe INTO lv_items WHERE qmnum = ls_qm-qmnum AND kzloesch = space.
    SELECT COUNT(*) FROM qmsm INTO lv_tasks WHERE qmnum = ls_qm-qmnum AND kzloesch = space.
    SELECT COUNT(*) FROM qmsm INTO lv_open WHERE qmnum = ls_qm-qmnum AND kzloesch = space AND erldat = '00000000'.
    add_kv( EXPORTING iv_row = 1 iv_name = 'ITEMS'      iv_value = lv_items CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TASKS'      iv_value = lv_tasks CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_TASKS' iv_value = lv_open CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Notification { ls_qm-qmnum } ({ ls_qm-qmart }): status { stat_text( ls_qm-objnr ) }, | &&
                        |{ lv_items } items, { lv_open } open tasks|.
    IF ls_qm-aufnr IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary }, order { ls_qm-aufnr }|.
    ENDIF.
  ENDMETHOD.


  METHOD equi_get_detail.
    TYPES: BEGIN OF ty_o,
             aufnr TYPE afih-aufnr,
             objnr TYPE aufk-objnr,
           END OF ty_o.
    DATA: lv_equnr TYPE equnr,
          ls_equi  TYPE equi,
          ls_equz  TYPE equz,
          ls_iloa  TYPE iloa,
          lt_o     TYPE STANDARD TABLE OF ty_o,
          ls_o     TYPE ty_o,
          lt_qm    TYPE STANDARD TABLE OF ty_o,
          lv_nord  TYPE i,
          lv_nqm   TYPE i,
          lv_last  TYPE aufnr,
          lv_text  TYPE string.

    IF is_params-equnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'equnr is required (equipment number)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_equnr = to_equnr( is_params-equnr ).
    SELECT SINGLE * FROM equi INTO ls_equi WHERE equnr = lv_equnr.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Equipment { is_params-equnr } not found| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM equz INTO ls_equz WHERE equnr = lv_equnr AND datbi = '99991231'.
    IF ls_equz-iloan IS NOT INITIAL.
      SELECT SINGLE * FROM iloa INTO ls_iloa WHERE iloan = ls_equz-iloan.
    ENDIF.
    IF ls_equz-iwerk IS NOT INITIAL AND auth_iwerk( iv_tcd = 'IE03' iv_iwerk = ls_equz-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to display equipment of planning plant { ls_equz-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    add_kv( EXPORTING iv_row = 1 iv_name = 'EQUIPMENT'  iv_value = ls_equi-equnr CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TEXT'       iv_value = equi_text( lv_equnr ) CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CATEGORY'   iv_value = ls_equi-eqtyp CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OBJECT_TYPE' iv_value = ls_equi-eqart CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS'     iv_value = stat_text( ls_equi-objnr ) CHANGING ct_rows = rs_result-rows ).
    IF ls_equi-herst IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'MANUFACTURER' iv_value = ls_equi-herst CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_equi-typbz IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'MODEL' iv_value = ls_equi-typbz CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_equi-inbdt IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'START_UP' iv_value = ls_equi-inbdt CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    add_kv( EXPORTING iv_row = 1 iv_name = 'PLANNING_PLANT' iv_value = ls_equz-iwerk CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'MAINT_PLANT'    iv_value = ls_iloa-swerk CHANGING ct_rows = rs_result-rows ).
    IF ls_iloa-tplnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( ls_iloa-tplnr ) CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_equz-hequi IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'SUPERIOR_EQUIPMENT' iv_value = ls_equz-hequi CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_iloa-kostl IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'COST_CENTER' iv_value = ls_iloa-kostl CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_equz-gewrk IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'MAIN_WORK_CENTER' iv_value = wc_name( ls_equz-gewrk ) CHANGING ct_rows = rs_result-rows ).
    ENDIF.

    SELECT h~aufnr a~objnr FROM afih AS h INNER JOIN aufk AS a ON a~aufnr = h~aufnr
      INTO TABLE lt_o UP TO 5000 ROWS WHERE h~equnr = lv_equnr.
    SORT lt_o BY aufnr DESCENDING.
    LOOP AT lt_o INTO ls_o.
      IF lv_last IS INITIAL.
        lv_last = ls_o-aufnr.
      ENDIF.
      IF has_stat( iv_objnr = ls_o-objnr iv_stat = c_teco ) = abap_false
         AND has_stat( iv_objnr = ls_o-objnr iv_stat = c_clsd ) = abap_false
         AND has_stat( iv_objnr = ls_o-objnr iv_stat = c_dlfl ) = abap_false.
        lv_nord = lv_nord + 1.
      ENDIF.
    ENDLOOP.
    SELECT q~qmnum q~objnr FROM qmih AS i INNER JOIN qmel AS q ON q~qmnum = i~qmnum
      INTO TABLE lt_qm UP TO 5000 ROWS WHERE i~equnr = lv_equnr.
    LOOP AT lt_qm INTO ls_o.
      IF has_stat( iv_objnr = ls_o-objnr iv_stat = c_noco ) = abap_false
         AND has_stat( iv_objnr = ls_o-objnr iv_stat = c_dlfl ) = abap_false.
        lv_nqm = lv_nqm + 1.
      ENDIF.
    ENDLOOP.
    add_kv( EXPORTING iv_row = 1 iv_name = 'ORDERS'              iv_value = lines( lt_o ) CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_ORDERS'         iv_value = lv_nord CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_NOTIFICATIONS'  iv_value = lv_nqm CHANGING ct_rows = rs_result-rows ).
    IF lv_last IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'LAST_ORDER' iv_value = lv_last CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    lv_text = |Equipment { is_params-equnr } ({ equi_text( lv_equnr ) }), category { ls_equi-eqtyp }, planning plant { ls_equz-iwerk }|.
    IF ls_iloa-tplnr IS NOT INITIAL.
      lv_text = |{ lv_text }, installed at { tplnr_out( ls_iloa-tplnr ) }|.
    ENDIF.
    rs_result-summary = |{ lv_text }: { lv_nord } open orders, { lv_nqm } open notifications|.
  ENDMETHOD.


  METHOD equi_list.
    TYPES: BEGIN OF ty_e,
             equnr TYPE equi-equnr,
             eqtyp TYPE equi-eqtyp,
             objnr TYPE equi-objnr,
             iloan TYPE equz-iloan,
             iwerk TYPE equz-iwerk,
           END OF ty_e.
    DATA: lv_iwerk TYPE iwerk,
          lv_tplnr TYPE tplnr,
          lv_eqtyp TYPE eqtyp,
          lt_iloan TYPE STANDARD TABLE OF iloan,
          lv_iloan TYPE iloan,
          lr_iloan TYPE ty_r_iloan,
          ls_iloan LIKE LINE OF lr_iloan,
          lt_e     TYPE STANDARD TABLE OF ty_e,
          ls_e     TYPE ty_e,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_fetch TYPE i,
          lv_t     TYPE tplnr,
          lv_text  TYPE string.

    check_iwerk( EXPORTING iv_werks = is_params-werks iv_need = abap_false IMPORTING ev_iwerk = lv_iwerk CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF lv_iwerk IS INITIAL AND is_params-tplnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks (planning plant) or tplnr (functional location) is required'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF strlen( condense( is_params-eqtyp ) ) > 1.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'eqtyp must be an equipment category (1 character)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-eqtyp IS NOT INITIAL.
      lv_eqtyp = condense( is_params-eqtyp ).
      TRANSLATE lv_eqtyp TO UPPER CASE.
      SELECT SINGLE eqtyp FROM t370t INTO lv_eqtyp WHERE eqtyp = lv_eqtyp.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Equipment category { is_params-eqtyp } does not exist (T370T)|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_tplnr = to_tplnr( is_params-tplnr ).
      SELECT SINGLE tplnr FROM iflot INTO lv_t WHERE tplnr = lv_tplnr.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Functional location { is_params-tplnr } not found|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      SELECT iloan FROM iloa INTO TABLE lt_iloan UP TO 5000 ROWS WHERE tplnr = lv_tplnr.
      LOOP AT lt_iloan INTO lv_iloan.
        ls_iloan-sign = 'I'. ls_iloan-option = 'EQ'. ls_iloan-low = lv_iloan.
        APPEND ls_iloan TO lr_iloan.
      ENDLOOP.
      IF lr_iloan IS INITIAL.
        rs_result-summary = |0 equipment installed at functional location { is_params-tplnr }|.
        RETURN.
      ENDIF.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).
    lv_fetch = lv_max + 1.

    IF lv_iwerk IS NOT INITIAL AND lv_eqtyp IS NOT INITIAL.
      SELECT e~equnr e~eqtyp e~objnr z~iloan z~iwerk FROM equi AS e INNER JOIN equz AS z ON z~equnr = e~equnr
        INTO TABLE lt_e UP TO lv_fetch ROWS
        WHERE z~datbi = '99991231' AND z~iwerk = lv_iwerk AND e~eqtyp = lv_eqtyp AND z~iloan IN lr_iloan
        ORDER BY e~equnr.
    ELSEIF lv_iwerk IS NOT INITIAL.
      SELECT e~equnr e~eqtyp e~objnr z~iloan z~iwerk FROM equi AS e INNER JOIN equz AS z ON z~equnr = e~equnr
        INTO TABLE lt_e UP TO lv_fetch ROWS
        WHERE z~datbi = '99991231' AND z~iwerk = lv_iwerk AND z~iloan IN lr_iloan
        ORDER BY e~equnr.
    ELSEIF lv_eqtyp IS NOT INITIAL.
      SELECT e~equnr e~eqtyp e~objnr z~iloan z~iwerk FROM equi AS e INNER JOIN equz AS z ON z~equnr = e~equnr
        INTO TABLE lt_e UP TO lv_fetch ROWS
        WHERE z~datbi = '99991231' AND e~eqtyp = lv_eqtyp AND z~iloan IN lr_iloan
        ORDER BY e~equnr.
    ELSE.
      SELECT e~equnr e~eqtyp e~objnr z~iloan z~iwerk FROM equi AS e INNER JOIN equz AS z ON z~equnr = e~equnr
        INTO TABLE lt_e UP TO lv_fetch ROWS
        WHERE z~datbi = '99991231' AND z~iloan IN lr_iloan
        ORDER BY e~equnr.
    ENDIF.
    IF lines( lt_e ) > lv_max.
      rs_result-truncated = abap_true.
      DELETE lt_e FROM lv_fetch.
    ENDIF.
    LOOP AT lt_e INTO ls_e.
      lv_row = lv_row + 1.
      CLEAR lv_t.
      IF ls_e-iloan IS NOT INITIAL.
        SELECT SINGLE tplnr FROM iloa INTO lv_t WHERE iloan = ls_e-iloan.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'EQUIPMENT' iv_value = ls_e-equnr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT'      iv_value = equi_text( ls_e-equnr ) CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CATEGORY'  iv_value = ls_e-eqtyp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNING_PLANT' iv_value = ls_e-iwerk CHANGING ct_rows = rs_result-rows ).
      IF lv_t IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( lv_t ) CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = stat_text( ls_e-objnr ) CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.

    lv_text = |{ lv_row } equipment|.
    IF lv_iwerk IS NOT INITIAL.
      lv_text = |{ lv_text } of planning plant { lv_iwerk }|.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_text = |{ lv_text } installed at { is_params-tplnr }|.
    ENDIF.
    IF lv_eqtyp IS NOT INITIAL.
      lv_text = |{ lv_text }, category { lv_eqtyp }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      lv_text = |{ lv_text } (more exist, first { lv_row } shown)|.
    ENDIF.
    rs_result-summary = lv_text.
  ENDMETHOD.


  METHOD fl_get_detail.
    TYPES: BEGIN OF ty_o,
             aufnr TYPE afih-aufnr,
             objnr TYPE aufk-objnr,
           END OF ty_o.
    DATA: lv_tplnr TYPE tplnr,
          ls_fl    TYPE iflot,
          ls_iloa  TYPE iloa,
          lv_txt   TYPE iflotx-pltxt,
          lt_iloan TYPE STANDARD TABLE OF iloan,
          lr_iloan TYPE ty_r_iloan,
          ls_iloan LIKE LINE OF lr_iloan,
          lv_iloan TYPE iloan,
          lv_neq   TYPE i,
          lv_nsub  TYPE i,
          lt_o     TYPE STANDARD TABLE OF ty_o,
          ls_o     TYPE ty_o,
          lv_nord  TYPE i.

    IF is_params-tplnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'tplnr is required (functional location)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_tplnr = to_tplnr( is_params-tplnr ).
    SELECT SINGLE * FROM iflot INTO ls_fl WHERE tplnr = lv_tplnr.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Functional location { is_params-tplnr } not found| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_fl-iwerk IS NOT INITIAL AND auth_iwerk( iv_tcd = 'IL03' iv_iwerk = ls_fl-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to display functional locations of planning plant { ls_fl-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE pltxt FROM iflotx INTO lv_txt WHERE tplnr = lv_tplnr AND spras = sy-langu.
    IF sy-subrc <> 0.
      SELECT SINGLE pltxt FROM iflotx INTO lv_txt WHERE tplnr = lv_tplnr.
    ENDIF.
    IF ls_fl-iloan IS NOT INITIAL.
      SELECT SINGLE * FROM iloa INTO ls_iloa WHERE iloan = ls_fl-iloan.
    ENDIF.
    SELECT COUNT(*) FROM iflot INTO lv_nsub WHERE tplma = lv_tplnr.
    SELECT iloan FROM iloa INTO TABLE lt_iloan UP TO 5000 ROWS WHERE tplnr = lv_tplnr.
    LOOP AT lt_iloan INTO lv_iloan.
      ls_iloan-sign = 'I'. ls_iloan-option = 'EQ'. ls_iloan-low = lv_iloan.
      APPEND ls_iloan TO lr_iloan.
    ENDLOOP.
    IF lr_iloan IS NOT INITIAL.
      SELECT COUNT(*) FROM equz INTO lv_neq WHERE datbi = '99991231' AND iloan IN lr_iloan.
      SELECT h~aufnr a~objnr FROM afih AS h INNER JOIN aufk AS a ON a~aufnr = h~aufnr
        INTO TABLE lt_o UP TO 5000 ROWS WHERE h~iloan IN lr_iloan.
      LOOP AT lt_o INTO ls_o.
        IF has_stat( iv_objnr = ls_o-objnr iv_stat = c_teco ) = abap_false
           AND has_stat( iv_objnr = ls_o-objnr iv_stat = c_clsd ) = abap_false
           AND has_stat( iv_objnr = ls_o-objnr iv_stat = c_dlfl ) = abap_false.
          lv_nord = lv_nord + 1.
        ENDIF.
      ENDLOOP.
    ENDIF.
    add_kv( EXPORTING iv_row = 1 iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( lv_tplnr ) CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TEXT'           iv_value = lv_txt CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CATEGORY'       iv_value = ls_fl-fltyp CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS'         iv_value = stat_text( ls_fl-objnr ) CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'PLANNING_PLANT' iv_value = ls_fl-iwerk CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'MAINT_PLANT'    iv_value = ls_iloa-swerk CHANGING ct_rows = rs_result-rows ).
    IF ls_fl-tplma IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'SUPERIOR' iv_value = tplnr_out( ls_fl-tplma ) CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_iloa-kostl IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'COST_CENTER' iv_value = ls_iloa-kostl CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    add_kv( EXPORTING iv_row = 1 iv_name = 'SUBORDINATE_LOCATIONS' iv_value = lv_nsub CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'INSTALLED_EQUIPMENT'   iv_value = lv_neq CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'OPEN_ORDERS'           iv_value = lv_nord CHANGING ct_rows = rs_result-rows ).
    rs_result-summary = |Functional location { tplnr_out( lv_tplnr ) } ({ lv_txt }), planning plant { ls_fl-iwerk }: | &&
                        |{ lv_nsub } subordinate locations, { lv_neq } installed equipment, { lv_nord } open orders|.
  ENDMETHOD.


  METHOD plan_get_detail.
    TYPES: BEGIN OF ty_ps,
             wapos TYPE mpos-wapos,
             iwerk TYPE mpos-iwerk,
             equnr TYPE mpos-equnr,
             iloan TYPE mpos-iloan,
             plnty TYPE mpos-plnty,
             plnnr TYPE mpos-plnnr,
             plnal TYPE mpos-plnal,
             auart TYPE mpos-auart,
             pstxt TYPE mpos-pstxt,
           END OF ty_ps,
           BEGIN OF ty_cy,
             zaehl    TYPE mmpt-zaehl,
             zykl1    TYPE mmpt-zykl1,
             zeieh    TYPE mmpt-zeieh,
             pak_text TYPE mmpt-pak_text,
           END OF ty_cy,
           BEGIN OF ty_ca,
             abnum TYPE mhis-abnum,
             nplda TYPE mhis-nplda,
             horda TYPE mhis-horda,
             lrmdt TYPE mhis-lrmdt,
             stadt TYPE mhis-stadt,
           END OF ty_ca.
    DATA: lv_in    TYPE string,
          lv_warpl TYPE warpl,
          ls_mpla  TYPE mpla,
          lt_ps    TYPE STANDARD TABLE OF ty_ps,
          ls_ps    TYPE ty_ps,
          lt_cy    TYPE STANDARD TABLE OF ty_cy,
          ls_cy    TYPE ty_cy,
          lt_ca    TYPE STANDARD TABLE OF ty_ca,
          ls_ca    TYPE ty_ca,
          lv_tpl   TYPE tplnr,
          lv_row   TYPE i,
          lv_nord  TYPE i,
          lv_s     TYPE string,
          lv_next  TYPE d,
          lv_dim   TYPE t006-dimid,
          lv_si    TYPE t006d-mssie,
          lv_cyc   TYPE p LENGTH 15 DECIMALS 2,
          lv_int   TYPE i.

    lv_in = condense( is_params-warpl ).
    IF lv_in IS INITIAL OR strlen( lv_in ) > 12.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'warpl is required (maintenance plan number)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    TRANSLATE lv_in TO UPPER CASE.
    lv_warpl = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = lv_warpl
      IMPORTING
        output = lv_warpl.
    SELECT SINGLE * FROM mpla INTO ls_mpla WHERE warpl = lv_warpl.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Maintenance plan { is_params-warpl } not found| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT wapos iwerk equnr iloan plnty plnnr plnal auart pstxt FROM mpos INTO TABLE lt_ps WHERE warpl = lv_warpl.
    READ TABLE lt_ps INTO ls_ps INDEX 1.
    IF sy-subrc = 0 AND ls_ps-iwerk IS NOT INITIAL AND auth_iwerk( iv_tcd = 'IP03' iv_iwerk = ls_ps-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to display maintenance plans of planning plant { ls_ps-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT zaehl zykl1 zeieh pak_text FROM mmpt INTO TABLE lt_cy WHERE warpl = lv_warpl.
    SELECT abnum nplda horda lrmdt stadt FROM mhis INTO TABLE lt_ca WHERE warpl = lv_warpl.
    SORT lt_ca BY abnum.
    SELECT COUNT(*) FROM afih INTO lv_nord WHERE warpl = lv_warpl.

    add_kv( EXPORTING iv_row = 1 iv_name = 'MAINTENANCE_PLAN' iv_value = ls_mpla-warpl CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TEXT'             iv_value = ls_mpla-wptxt CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CATEGORY'         iv_value = ls_mpla-mptyp CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS'           iv_value = stat_text( ls_mpla-objnr ) CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CALLS'            iv_value = lines( lt_ca ) CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'ORDERS'           iv_value = lv_nord CHANGING ct_rows = rs_result-rows ).
    lv_row = 1.
    LOOP AT lt_ps INTO ls_ps.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM'           iv_value = ls_ps-wapos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ITEM_TEXT'      iv_value = ls_ps-pstxt CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNING_PLANT' iv_value = ls_ps-iwerk CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ORDER_TYPE'     iv_value = ls_ps-auart CHANGING ct_rows = rs_result-rows ).
      IF ls_ps-equnr IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'EQUIPMENT' iv_value = ls_ps-equnr CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      CLEAR lv_tpl.
      IF ls_ps-iloan IS NOT INITIAL.
        SELECT SINGLE tplnr FROM iloa INTO lv_tpl WHERE iloan = ls_ps-iloan.
      ENDIF.
      IF lv_tpl IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'FUNCTIONAL_LOCATION' iv_value = tplnr_out( lv_tpl ) CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_ps-plnnr IS NOT INITIAL.
        lv_s = |{ ls_ps-plnty }/{ ls_ps-plnnr }/{ ls_ps-plnal }|.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'TASK_LIST' iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    LOOP AT lt_cy INTO ls_cy.
      lv_row = lv_row + 1.
      CLEAR: lv_dim, lv_si.
      SELECT SINGLE dimid FROM t006 INTO lv_dim WHERE msehi = ls_cy-zeieh.
      SELECT SINGLE mssie FROM t006d INTO lv_si WHERE dimid = lv_dim.
      lv_cyc = ls_cy-zykl1.
      IF lv_si IS NOT INITIAL AND lv_si <> ls_cy-zeieh.
        CALL FUNCTION 'UNIT_CONVERSION_SIMPLE'
          EXPORTING
            input    = ls_cy-zykl1
            unit_in  = lv_si
            unit_out = ls_cy-zeieh
          IMPORTING
            output   = lv_cyc
          EXCEPTIONS
            OTHERS   = 1.
        IF sy-subrc <> 0.
          lv_cyc = ls_cy-zykl1.
        ENDIF.
      ENDIF.
      IF lv_cyc = trunc( lv_cyc ).
        lv_int = lv_cyc.
        lv_s = lv_int.
      ELSE.
        lv_s = lv_cyc.
      ENDIF.
      lv_s = |{ condense( lv_s ) } { ls_cy-zeieh }|.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CYCLE'      iv_value = lv_s CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CYCLE_TEXT' iv_value = ls_cy-pak_text CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    LOOP AT lt_ca INTO ls_ca.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CALL'         iv_value = ls_ca-abnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANNED_DATE' iv_value = ls_ca-nplda CHANGING ct_rows = rs_result-rows ).
      IF ls_ca-horda IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'CALL_DATE' iv_value = ls_ca-horda CHANGING ct_rows = rs_result-rows ).
      ELSE.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'CALL_DATE' iv_value = 'not called yet' CHANGING ct_rows = rs_result-rows ).
        IF lv_next IS INITIAL.
          lv_next = ls_ca-nplda.
        ENDIF.
      ENDIF.
      IF ls_ca-lrmdt IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'COMPLETION_DATE' iv_value = ls_ca-lrmdt CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |Maintenance plan { ls_mpla-warpl } ({ ls_mpla-wptxt }): status { stat_text( ls_mpla-objnr ) }, | &&
                        |{ lines( lt_ps ) } items, { lines( lt_cy ) } cycles, { lines( lt_ca ) } calls, { lv_nord } orders|.
    IF lv_next IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary }, next planned date { lv_next }|.
    ENDIF.
  ENDMETHOD.


  METHOD notif_create.
    DATA: lv_eqobj  TYPE j_objnr,
          lv_err    TYPE abap_bool,
          lv_qmart  TYPE qmart,
          lv_qmtyp  TYPE tq80-qmtyp,
          lv_artpr  TYPE tq80-artpr,
          lv_text   TYPE string,
          lv_qmtxt  TYPE qmtxt,
          lv_equnr  TYPE equnr,
          lv_tplnr  TYPE tplnr,
          lv_iwerk  TYPE iwerk,
          lv_iw_eq  TYPE iwerk,
          lv_iloan  TYPE iloan,
          lv_t      TYPE tplnr,
          lv_priok  TYPE priok,
          ls_hdr    TYPE bapi2080_nothdri,
          ls_exp    TYPE bapi2080_nothdre,
          ls_exp2   TYPE bapi2080_nothdre,
          lt_ret    TYPE bapiret2_t,
          ls_qm     TYPE ty_qm,
          lv_found  TYPE abap_bool,
          lv_msg    TYPE string.

    " notification type: maintenance notification (TQ80-QMTYP 01)
    lv_qmart = condense( is_params-qmart ).
    TRANSLATE lv_qmart TO UPPER CASE.
    IF lv_qmart IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'qmart is required (notification type, e.g. M1 / M2)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE qmtyp artpr FROM tq80 INTO (lv_qmtyp, lv_artpr) WHERE qmart = lv_qmart.
    IF sy-subrc <> 0 OR lv_qmtyp <> '01'.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification type { is_params-qmart } is not a maintenance notification type|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_text = condense( is_params-text ).
    IF lv_text IS INITIAL OR strlen( lv_text ) > 40.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'text is required (short text, up to 40 characters)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_qmtxt = lv_text.

    " reference object: equipment or functional location
    IF is_params-equnr IS INITIAL AND is_params-tplnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'equnr (equipment) or tplnr (functional location) is required'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-equnr IS NOT INITIAL.
      lv_equnr = to_equnr( is_params-equnr ).
      SELECT SINGLE iwerk iloan FROM equz INTO (lv_iw_eq, lv_iloan) WHERE equnr = lv_equnr AND datbi = '99991231'.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Equipment { is_params-equnr } not found| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_eqobj = |IE{ lv_equnr }|.
      IF has_stat( iv_objnr = lv_eqobj iv_stat = c_dlfl ) = abap_true.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Equipment { is_params-equnr } is flagged for deletion| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_tplnr = to_tplnr( is_params-tplnr ).
      SELECT SINGLE tplnr iwerk FROM iflot INTO (lv_t, lv_iwerk) WHERE tplnr = lv_tplnr.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Functional location { is_params-tplnr } not found| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF lv_iw_eq IS INITIAL.
        lv_iw_eq = lv_iwerk.
      ENDIF.
    ENDIF.
    " planning plant: given, else from the reference object
    check_iwerk( EXPORTING iv_werks = is_params-werks iv_need = abap_false IMPORTING ev_iwerk = lv_iwerk CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF lv_iwerk IS INITIAL.
      lv_iwerk = lv_iw_eq.
    ENDIF.
    IF lv_iwerk IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required: the reference object has no planning plant'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_iw_eq IS NOT INITIAL AND lv_iw_eq <> lv_iwerk.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = |The reference object belongs to planning plant { lv_iw_eq }, the notification goes to { lv_iwerk }|
               CHANGING cs_result = rs_result ).
    ENDIF.
    " priority
    IF is_params-priok IS NOT INITIAL.
      lv_priok = condense( is_params-priok ).
      SELECT SINGLE priok FROM t356 INTO lv_priok WHERE artpr = lv_artpr AND priok = lv_priok.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Priority { is_params-priok } is not defined for priority type { lv_artpr } (T356)|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    " authorization
    IF auth_qmel( iv_tcd = 'IW21' iv_qmart = lv_qmart ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to create notifications of type { lv_qmart } (I_QMEL)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_iwerk( iv_tcd = 'IW21' iv_iwerk = lv_iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to create notifications in planning plant { lv_iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    add_chg( EXPORTING iv_field = 'NOTIFICATION_TYPE' iv_old = '' iv_new = lv_qmart CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'SHORT_TEXT' iv_old = '' iv_new = lv_qmtxt CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'PLANNING_PLANT' iv_old = '' iv_new = lv_iwerk CHANGING cs_result = rs_result ).
    IF lv_equnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'EQUIPMENT' iv_old = '' iv_new = lv_equnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_tplnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'FUNCTIONAL_LOCATION' iv_old = '' iv_new = is_params-tplnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_priok IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'PRIORITY' iv_old = '' iv_new = lv_priok CHANGING cs_result = rs_result ).
    ENDIF.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: a { lv_qmart } notification "{ lv_qmtxt }" would be created in planning plant { lv_iwerk }| &&
                          |. Nothing was changed.|.
      RETURN.
    ENDIF.

    ls_hdr-equipment  = lv_equnr.
    ls_hdr-funct_loc  = lv_tplnr.
    ls_hdr-short_text = lv_qmtxt.
    ls_hdr-priority   = lv_priok.
    ls_hdr-planplant  = lv_iwerk.
    CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'
      EXPORTING
        notif_type         = lv_qmart
        notifheader        = ls_hdr
      IMPORTING
        notifheader_export = ls_exp
      TABLES
        return             = lt_ret.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true OR ls_exp-notif_no IS INITIAL.
      rollback( ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_ALM_NOTIF_CREATE refused the notification' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    CLEAR lt_ret.
    CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
      EXPORTING
        number      = ls_exp-notif_no
      IMPORTING
        notifheader = ls_exp2
      TABLES
        return      = lt_ret.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true OR ls_exp2-notif_no IS INITIAL.
      rollback( ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_ALM_NOTIF_SAVE did not save the notification' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    commit_wait( ).

    " read back from the tables
    DO 10 TIMES.
      read_notif( EXPORTING iv_qmnum = ls_exp2-notif_no IMPORTING es_qm = ls_qm ev_found = lv_found ).
      IF lv_found = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_found = abap_false.
      lv_msg = |Notification { ls_exp2-notif_no } is not in QMEL yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_msg CHANGING cs_result = rs_result ).
      rs_result-summary = |Notification { ls_exp2-notif_no } saved (read-back pending)|.
      RETURN.
    ENDIF.
    notif_rows( EXPORTING is_qm = ls_qm CHANGING cs_result = rs_result ).
    rs_result-summary = |Notification { ls_qm-qmnum } created ({ ls_qm-qmart }, planning plant { ls_qm-iwerk }): status | &&
                        |{ stat_text( ls_qm-objnr ) }|.
  ENDMETHOD.


  METHOD notif_status.
    DATA: lv_err    TYPE abap_bool,
          ls_qm     TYPE ty_qm,
          lv_tcd    TYPE tcode,
          lv_test   TYPE bapi20783t-status_ind,
          lv_sys    TYPE bapi2080_notadt-systatus,
          lv_usr    TYPE bapi2080_notadt-usrstatus,
          ls_st     TYPE bapi2080_notsti,
          lt_ret    TYPE bapiret2_t,
          ls_exp    TYPE bapi2080_nothdre,
          lv_old    TYPE string,
          lv_target TYPE j_status,
          lv_key    TYPE qmnum,
          lv_name   TYPE string,
          lv_ok     TYPE abap_bool,
          lv_msg    TYPE string.

    load_notif( EXPORTING is_params = is_params IMPORTING es_qm = ls_qm CHANGING cs_result = rs_result ).
    IF ls_qm IS INITIAL.
      RETURN.
    ENDIF.
    IF iv_complete = abap_true.
      lv_target = c_noco.
      lv_name = 'completed (NOCO)'.
    ELSE.
      lv_target = c_nopr.
      lv_name = 'in process (NOPR)'.
    ENDIF.
    IF has_stat( iv_objnr = ls_qm-objnr iv_stat = c_dlfl ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { ls_qm-qmnum } is flagged for deletion| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_qm-objnr iv_stat = c_noco ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { ls_qm-qmnum } is already completed (NOCO)| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF iv_complete = abap_false AND has_stat( iv_objnr = ls_qm-objnr iv_stat = c_nopr ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { ls_qm-qmnum } is already in process (NOPR)| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_tcd = 'IW22'.
    IF auth_qmel( iv_tcd = lv_tcd iv_qmart = ls_qm-qmart ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to change notifications of type { ls_qm-qmart } (I_QMEL)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF ls_qm-iwerk IS NOT INITIAL AND auth_iwerk( iv_tcd = lv_tcd iv_iwerk = ls_qm-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to change notifications in planning plant { ls_qm-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_old = stat_text( ls_qm-objnr ).
    notif_rows( EXPORTING is_qm = ls_qm CHANGING cs_result = rs_result ).
    IF iv_complete = abap_true AND ls_qm-aufnr IS NOT INITIAL.
      lv_msg = |The notification is assigned to order { ls_qm-aufnr }: completing it does not complete the order|.
      add_msg( EXPORTING iv_type = 'I' iv_text = lv_msg CHANGING cs_result = rs_result ).
    ENDIF.

    IF iv_execute = abap_false.
      lv_test = 'X'.
    ENDIF.
    IF iv_complete = abap_true.
      ls_st-langu   = sy-langu.
      ls_st-refdate = sy-datum.
      ls_st-reftime = sy-uzeit.
      CALL FUNCTION 'BAPI_ALM_NOTIF_CLOSE'
        EXPORTING
          number       = ls_qm-qmnum
          syststat     = ls_st
          testrun      = lv_test
        IMPORTING
          systemstatus = lv_sys
          userstatus   = lv_usr
        TABLES
          return       = lt_ret.
    ELSE.
      CALL FUNCTION 'BAPI_ALM_NOTIF_PUTINPROGRESS'
        EXPORTING
          number       = ls_qm-qmnum
          langu        = sy-langu
          testrun      = lv_test
        IMPORTING
          systemstatus = lv_sys
          userstatus   = lv_usr
        TABLES
          return       = lt_ret.
    ENDIF.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true.
      rollback( ).
      RETURN.
    ENDIF.
    IF iv_execute = abap_true.
      add_chg( EXPORTING iv_field = 'SYSTEM_STATUS' iv_old = lv_old iv_new = lv_sys CHANGING cs_result = rs_result ).
    ELSEIF iv_complete = abap_true.
      add_chg( EXPORTING iv_field = 'SYSTEM_STATUS' iv_old = lv_old iv_new = 'NOCO' CHANGING cs_result = rs_result ).
    ELSE.
      add_chg( EXPORTING iv_field = 'SYSTEM_STATUS' iv_old = lv_old iv_new = 'NOPR' CHANGING cs_result = rs_result ).
    ENDIF.
    IF iv_complete = abap_true.
      rs_result-irreversible = abap_true.
      add_msg( EXPORTING iv_type = 'W'
                         iv_text = 'A completed notification can be put back in process only in IW22: it cannot be undone here'
               CHANGING cs_result = rs_result ).
    ENDIF.

    IF iv_execute = abap_false.
      rollback( ).
      rs_result-summary = |Preview (BAPI test run): notification { ls_qm-qmnum } would be { lv_name }. Nothing was changed.|.
      RETURN.
    ENDIF.

    CLEAR lt_ret.
    CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
      EXPORTING
        number      = ls_qm-qmnum
      IMPORTING
        notifheader = ls_exp
      TABLES
        return      = lt_ret.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true.
      rollback( ).
      RETURN.
    ENDIF.
    commit_wait( ).
    lv_ok = wait_stat( iv_objnr = ls_qm-objnr iv_stat = lv_target ).
    CLEAR rs_result-rows.
    lv_key = ls_qm-qmnum.
    read_notif( EXPORTING iv_qmnum = lv_key IMPORTING es_qm = ls_qm ).
    notif_rows( EXPORTING is_qm = ls_qm CHANGING cs_result = rs_result ).
    IF lv_ok = abap_false.
      lv_msg = |The status of notification { ls_qm-qmnum } does not show { lv_name } yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_msg CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |Notification { ls_qm-qmnum } { lv_name }: status { stat_text( ls_qm-objnr ) }|.
  ENDMETHOD.


  METHOD ord_create.
    DATA: lv_eqobj  TYPE j_objnr,
          lv_err    TYPE abap_bool,
          lv_auart  TYPE aufart,
          lv_autyp  TYPE t003o-autyp,
          lv_iwerk  TYPE iwerk,
          lv_x      TYPE aufart,
          lv_text   TYPE string,
          lv_ktext  TYPE auftext,
          lv_equnr  TYPE equnr,
          lv_tplnr  TYPE tplnr,
          lv_t      TYPE tplnr,
          lv_iw_ref TYPE iwerk,
          lv_gewrk  TYPE equz-gewrk,
          lv_arbpl  TYPE arbpl,
          lv_wcwrk  TYPE werks_d,
          lv_steus  TYPE steus,
          lv_in     TYPE string,
          lv_start  TYPE d,
          lv_finish TYPE d,
          lv_ok     TYPE abap_bool,
          lv_priok  TYPE priok,
          lv_qmnum  TYPE qmnum,
          ls_qm     TYPE ty_qm,
          lv_found  TYPE abap_bool,
          lt_meth   TYPE STANDARD TABLE OF bapi_alm_order_method,
          ls_meth   TYPE bapi_alm_order_method,
          lt_hdr    TYPE STANDARD TABLE OF bapi_alm_order_headers_i,
          ls_hdr    TYPE bapi_alm_order_headers_i,
          lt_op     TYPE STANDARD TABLE OF bapi_alm_order_operation,
          ls_op     TYPE bapi_alm_order_operation,
          lt_ret    TYPE bapiret2_t,
          lt_num    TYPE STANDARD TABLE OF bapi_alm_numbers,
          ls_num    TYPE bapi_alm_numbers,
          ls_ord    TYPE ty_ord,
          lv_aufnr  TYPE aufnr,
          lv_msg    TYPE string.

    " order type: maintenance order type allowed in the planning plant
    lv_auart = condense( is_params-auart ).
    TRANSLATE lv_auart TO UPPER CASE.
    IF lv_auart IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'auart is required (maintenance order type, e.g. PM01)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE autyp FROM t003o INTO lv_autyp WHERE auart = lv_auart.
    IF sy-subrc <> 0 OR lv_autyp <> '30'.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Order type { is_params-auart } is not a maintenance order type|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    check_iwerk( EXPORTING iv_werks = is_params-werks iv_need = abap_true IMPORTING ev_iwerk = lv_iwerk CHANGING cs_result = rs_result ).
    IF lv_iwerk IS INITIAL.
      RETURN.
    ENDIF.
    SELECT SINGLE auart FROM t399x INTO lv_x WHERE werks = lv_iwerk AND auart = lv_auart.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Order type { lv_auart } is not allowed in planning plant { lv_iwerk } (T399X)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_text = condense( is_params-text ).
    IF lv_text IS INITIAL OR strlen( lv_text ) > 40.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'text is required (short text, up to 40 characters)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_ktext = lv_text.

    " optional notification: maintenance notification, open, without order
    IF is_params-qmnum IS NOT INITIAL.
      lv_qmnum = to_qmnum( is_params-qmnum ).
      IF lv_qmnum IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'qmnum must be a notification number (digits, up to 12)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      read_notif( EXPORTING iv_qmnum = lv_qmnum IMPORTING es_qm = ls_qm ev_found = lv_found ).
      IF lv_found = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { is_params-qmnum } not found| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF ls_qm-aufnr IS NOT INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { is_params-qmnum } already has order { ls_qm-aufnr }|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      IF has_stat( iv_objnr = ls_qm-objnr iv_stat = c_noco ) = abap_true OR has_stat( iv_objnr = ls_qm-objnr iv_stat = c_dlfl ) = abap_true.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { is_params-qmnum } is completed or flagged for deletion|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    " reference object: equipment / functional location (or those of the notification)
    IF is_params-equnr IS NOT INITIAL.
      lv_equnr = to_equnr( is_params-equnr ).
    ELSEIF lv_qmnum IS NOT INITIAL.
      lv_equnr = ls_qm-equnr.
    ENDIF.
    IF is_params-tplnr IS NOT INITIAL.
      lv_tplnr = to_tplnr( is_params-tplnr ).
    ELSEIF lv_qmnum IS NOT INITIAL AND lv_equnr IS INITIAL.
      lv_tplnr = ls_qm-tplnr.
    ENDIF.
    IF lv_equnr IS INITIAL AND lv_tplnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'equnr (equipment) or tplnr (functional location) is required'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_equnr IS NOT INITIAL.
      SELECT SINGLE iwerk gewrk FROM equz INTO (lv_iw_ref, lv_gewrk) WHERE equnr = lv_equnr AND datbi = '99991231'.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Equipment { lv_equnr } not found| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_eqobj = |IE{ lv_equnr }|.
      IF has_stat( iv_objnr = lv_eqobj iv_stat = c_dlfl ) = abap_true.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Equipment { lv_equnr } is flagged for deletion| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_tplnr IS NOT INITIAL.
      SELECT SINGLE tplnr FROM iflot INTO lv_t WHERE tplnr = lv_tplnr.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Functional location { is_params-tplnr } not found| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_iw_ref IS NOT INITIAL AND lv_iw_ref <> lv_iwerk.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = |Equipment { lv_equnr } belongs to planning plant { lv_iw_ref }, not { lv_iwerk }|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    " main work center: given, else the one of the equipment
    lv_in = condense( is_params-arbpl ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS NOT INITIAL.
      lv_arbpl = lv_in.
      SELECT SINGLE werks steus FROM crhd INTO (lv_wcwrk, lv_steus) WHERE objty = 'A' AND arbpl = lv_arbpl AND werks = lv_iwerk.
      IF sy-subrc <> 0.
        SELECT SINGLE werks steus FROM crhd INTO (lv_wcwrk, lv_steus) WHERE objty = 'A' AND arbpl = lv_arbpl.
      ENDIF.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Work center { lv_in } does not exist| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ELSEIF lv_gewrk IS NOT INITIAL.
      SELECT SINGLE arbpl werks steus FROM crhd INTO (lv_arbpl, lv_wcwrk, lv_steus) WHERE objty = 'A' AND objid = lv_gewrk.
    ENDIF.
    IF lv_arbpl IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'arbpl is required (main work center): the equipment has none'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_steus IS INITIAL.
      lv_steus = 'PM01'.
    ENDIF.

    " dates
    lv_start = sy-datum.
    IF is_params-new_start IS NOT INITIAL.
      to_date( EXPORTING iv_text = is_params-new_start IMPORTING ev_date = lv_start ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_start must be a date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    lv_finish = lv_start.
    IF is_params-new_finish IS NOT INITIAL.
      to_date( EXPORTING iv_text = is_params-new_finish IMPORTING ev_date = lv_finish ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'new_finish must be a date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_finish < lv_start.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'new_finish is before new_start' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-priok IS NOT INITIAL.
      lv_priok = condense( is_params-priok ).
      SELECT SINGLE priok FROM t356 INTO lv_priok WHERE artpr = 'PM' AND priok = lv_priok.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Priority { is_params-priok } is not defined for priority type PM (T356)|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    " authorization
    IF auth_iwerk( iv_tcd = 'IW31' iv_iwerk = lv_iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to create orders in planning plant { lv_iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_auart( iv_iwerk = lv_iwerk iv_auart = lv_auart ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization for order type { lv_auart } in planning plant { lv_iwerk } (I_AUART)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    add_chg( EXPORTING iv_field = 'ORDER_TYPE' iv_old = '' iv_new = lv_auart CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'SHORT_TEXT' iv_old = '' iv_new = lv_ktext CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'PLANNING_PLANT' iv_old = '' iv_new = lv_iwerk CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'MAIN_WORK_CENTER' iv_old = '' iv_new = |{ lv_arbpl }/{ lv_wcwrk }| CHANGING cs_result = rs_result ).
    IF lv_equnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'EQUIPMENT' iv_old = '' iv_new = lv_equnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_tplnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'FUNCTIONAL_LOCATION' iv_old = '' iv_new = tplnr_out( lv_tplnr ) CHANGING cs_result = rs_result ).
    ENDIF.
    add_chg( EXPORTING iv_field = 'BASIC_DATES' iv_old = '' iv_new = |{ lv_start } - { lv_finish }| CHANGING cs_result = rs_result ).
    IF lv_qmnum IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'NOTIFICATION' iv_old = '' iv_new = lv_qmnum CHANGING cs_result = rs_result ).
    ENDIF.
    add_msg( EXPORTING iv_type = 'I' iv_text = |One operation 0010 ({ lv_steus }) on work center { lv_arbpl } is created; the order stays in status CRTD|
             CHANGING cs_result = rs_result ).

    IF iv_execute = abap_false.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'BAPI_ALM_ORDER_MAINTAIN has no test run: this preview is the check of the handler only'
               CHANGING cs_result = rs_result ).
      rs_result-summary = |Preview: a { lv_auart } maintenance order "{ lv_ktext }" would be created in planning plant { lv_iwerk }| &&
                          |. Nothing was changed.|.
      RETURN.
    ENDIF.

    ls_meth-refnumber  = '000001'.
    ls_meth-objecttype = 'HEADER'.
    IF lv_qmnum IS INITIAL.
      ls_meth-method    = 'CREATE'.
      ls_meth-objectkey = '%00000000001'.
    ELSE.
      ls_meth-method    = 'CREATETONOTIF'.
      ls_meth-objectkey = |%00000000001{ lv_qmnum }|.
    ENDIF.
    APPEND ls_meth TO lt_meth.
    CLEAR ls_meth.
    ls_meth-refnumber  = '000001'.
    ls_meth-objecttype = 'OPERATION'.
    ls_meth-method     = 'CREATE'.
    ls_meth-objectkey  = '%000000000010010'.
    APPEND ls_meth TO lt_meth.
    CLEAR ls_meth.
    ls_meth-refnumber  = '000001'.
    ls_meth-method     = 'SAVE'.
    ls_meth-objectkey  = '%00000000001'.
    APPEND ls_meth TO lt_meth.

    ls_hdr-orderid     = '%00000000001'.
    ls_hdr-order_type  = lv_auart.
    ls_hdr-planplant   = lv_iwerk.
    ls_hdr-mn_wk_ctr   = lv_arbpl.
    ls_hdr-plant       = lv_wcwrk.
    ls_hdr-equipment   = lv_equnr.
    ls_hdr-funct_loc   = lv_tplnr.
    ls_hdr-short_text  = lv_ktext.
    ls_hdr-start_date  = lv_start.
    ls_hdr-finish_date = lv_finish.
    ls_hdr-priority    = lv_priok.
    ls_hdr-notif_no    = lv_qmnum.
    APPEND ls_hdr TO lt_hdr.
    ls_op-activity    = '0010'.
    ls_op-control_key = lv_steus.
    ls_op-work_cntr   = lv_arbpl.
    ls_op-plant       = lv_wcwrk.
    ls_op-description = lv_ktext.
    APPEND ls_op TO lt_op.

    CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
      TABLES
        it_methods   = lt_meth
        it_header    = lt_hdr
        it_operation = lt_op
        return       = lt_ret
        et_numbers   = lt_num.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true.
      rollback( ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_ALM_ORDER_MAINTAIN refused the order' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    READ TABLE lt_num INTO ls_num INDEX 1.
    lv_aufnr = ls_num-aufnr_new.
    IF lv_aufnr IS INITIAL.
      rollback( ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_ALM_ORDER_MAINTAIN returned no order number' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    commit_wait( ).

    DO 10 TIMES.
      read_order( EXPORTING iv_aufnr = lv_aufnr IMPORTING es_ord = ls_ord ev_found = lv_found ).
      IF lv_found = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_found = abap_false.
      lv_msg = |Order { lv_aufnr } is not in AUFK yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_msg CHANGING cs_result = rs_result ).
      rs_result-summary = |Maintenance order { lv_aufnr } saved (read-back pending)|.
      RETURN.
    ENDIF.
    order_rows( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).
    rs_result-summary = |Maintenance order { ls_ord-aufnr } created ({ ls_ord-auart }, planning plant { ls_ord-iwerk }): status | &&
                        |{ stat_text( ls_ord-objnr ) }|.
    IF lv_qmnum IS NOT INITIAL.
      read_notif( EXPORTING iv_qmnum = lv_qmnum IMPORTING es_qm = ls_qm ).
      rs_result-summary = |{ rs_result-summary }; notification { lv_qmnum } now points to order { ls_qm-aufnr }|.
    ENDIF.
  ENDMETHOD.


  METHOD ord_status.
    DATA: lv_err    TYPE abap_bool,
          ls_ord    TYPE ty_ord,
          lv_rel    TYPE abap_bool,
          lv_start  TYPE d,
          lv_finish TYPE d,
          lv_ok     TYPE abap_bool,
          lv_method TYPE bapi_alm_order_method-method,
          lv_target TYPE j_status,
          lv_old    TYPE string,
          lt_meth   TYPE STANDARD TABLE OF bapi_alm_order_method,
          ls_meth   TYPE bapi_alm_order_method,
          lt_hdr    TYPE STANDARD TABLE OF bapi_alm_order_headers_i,
          ls_hdr    TYPE bapi_alm_order_headers_i,
          lt_hup    TYPE STANDARD TABLE OF bapi_alm_order_headers_up,
          ls_hup    TYPE bapi_alm_order_headers_up,
          lt_ret    TYPE bapiret2_t,
          lv_done   TYPE abap_bool,
          lv_key    TYPE aufnr,
          lv_qmkey  TYPE qmnum,
          lv_qmobj  TYPE j_objnr,
          lv_verb   TYPE string,
          lv_msg    TYPE string.

    load_order( EXPORTING is_params = is_params IMPORTING es_ord = ls_ord CHANGING cs_result = rs_result ).
    IF ls_ord IS INITIAL.
      RETURN.
    ENDIF.
    order_open_check( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF auth_iwerk( iv_tcd = 'IW32' iv_iwerk = ls_ord-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to change orders of planning plant { ls_ord-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_auart( iv_iwerk = ls_ord-iwerk iv_auart = ls_ord-auart ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization for order type { ls_ord-auart } in planning plant { ls_ord-iwerk } (I_AUART)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_rel = has_stat( iv_objnr = ls_ord-objnr iv_stat = c_rel ).
    lv_old = stat_text( ls_ord-objnr ).
    order_rows( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).

    CASE iv_action.
      WHEN 'PM.ORD.RELEASE'.
        IF lv_rel = abap_true.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Order { ls_ord-aufnr } is already released (REL)| CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
        lv_method = 'RELEASE'.
        lv_target = c_rel.
        lv_verb = 'released'.
        add_chg( EXPORTING iv_field = 'SYSTEM_STATUS' iv_old = lv_old iv_new = 'REL' CHANGING cs_result = rs_result ).
      WHEN 'PM.ORD.TECO'.
        lv_method = 'TECHNICALCOMPLETE'.
        lv_target = c_teco.
        lv_verb = 'technically completed'.
        IF lv_rel = abap_false.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Order { ls_ord-aufnr } is not released: release it before technical completion|
                   CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
        IF ls_ord-qmnum IS NOT INITIAL.
          lv_qmkey = ls_ord-qmnum.
          SELECT SINGLE objnr FROM qmel INTO lv_qmobj WHERE qmnum = lv_qmkey.
          IF sy-subrc = 0 AND has_stat( iv_objnr = lv_qmobj iv_stat = c_noco ) = abap_false.
            add_msg( EXPORTING iv_type = 'E'
                               iv_text = |Order { ls_ord-aufnr } has the open notification { ls_ord-qmnum }: complete the notification first|
                     CHANGING cs_result = rs_result ).
            RETURN.
          ENDIF.
        ENDIF.
        add_msg( EXPORTING iv_type = 'W'
                           iv_text = 'TECO can be revoked only in IW32 (cancel technical completion): it cannot be undone here'
                 CHANGING cs_result = rs_result ).
        rs_result-irreversible = abap_true.
        add_chg( EXPORTING iv_field = 'SYSTEM_STATUS' iv_old = lv_old iv_new = 'TECO' CHANGING cs_result = rs_result ).
      WHEN 'PM.ORD.CHANGE_DATES'.
        lv_method = 'CHANGE'.
        lv_verb = 'rescheduled'.
        IF is_params-new_start IS INITIAL AND is_params-new_finish IS INITIAL.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'new_start or new_finish is required (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
        lv_start = ls_ord-gstrp.
        lv_finish = ls_ord-gltrp.
        IF is_params-new_start IS NOT INITIAL.
          to_date( EXPORTING iv_text = is_params-new_start IMPORTING ev_date = lv_start ev_ok = lv_ok ).
          IF lv_ok = abap_false.
            add_msg( EXPORTING iv_type = 'E' iv_text = 'new_start must be a date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
            RETURN.
          ENDIF.
        ENDIF.
        IF is_params-new_finish IS NOT INITIAL.
          to_date( EXPORTING iv_text = is_params-new_finish IMPORTING ev_date = lv_finish ev_ok = lv_ok ).
          IF lv_ok = abap_false.
            add_msg( EXPORTING iv_type = 'E' iv_text = 'new_finish must be a date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
            RETURN.
          ENDIF.
        ELSEIF ls_ord-gltrp IS NOT INITIAL AND ls_ord-gstrp IS NOT INITIAL.
          " only the start moves: keep the planned duration
          lv_finish = lv_start + ( ls_ord-gltrp - ls_ord-gstrp ).
        ENDIF.
        IF lv_finish < lv_start.
          add_msg( EXPORTING iv_type = 'E' iv_text = 'new_finish is before new_start' CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
        IF lv_start = ls_ord-gstrp AND lv_finish = ls_ord-gltrp.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Order { ls_ord-aufnr } already has these basic dates| CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
        IF lv_start <> ls_ord-gstrp.
          add_chg( EXPORTING iv_field = 'BASIC_START' iv_old = ls_ord-gstrp iv_new = lv_start CHANGING cs_result = rs_result ).
        ENDIF.
        IF lv_finish <> ls_ord-gltrp.
          add_chg( EXPORTING iv_field = 'BASIC_FINISH' iv_old = ls_ord-gltrp iv_new = lv_finish CHANGING cs_result = rs_result ).
        ENDIF.
    ENDCASE.

    IF iv_execute = abap_false.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = 'BAPI_ALM_ORDER_MAINTAIN has no test run: this preview is the status check of the handler only'
               CHANGING cs_result = rs_result ).
      rs_result-summary = |Preview: maintenance order { ls_ord-aufnr } (status { lv_old }) would be { lv_verb }. Nothing was changed.|.
      RETURN.
    ENDIF.

    ls_meth-refnumber  = '000001'.
    ls_meth-objecttype = 'HEADER'.
    ls_meth-method     = lv_method.
    ls_meth-objectkey  = ls_ord-aufnr.
    APPEND ls_meth TO lt_meth.
    CLEAR ls_meth.
    ls_meth-refnumber  = '000001'.
    ls_meth-method     = 'SAVE'.
    ls_meth-objectkey  = ls_ord-aufnr.
    APPEND ls_meth TO lt_meth.
    ls_hdr-orderid = ls_ord-aufnr.
    IF iv_action = 'PM.ORD.CHANGE_DATES'.
      ls_hdr-start_date  = lv_start.
      ls_hdr-finish_date = lv_finish.
      ls_hup-orderid     = ls_ord-aufnr.
      ls_hup-start_date  = 'X'.
      ls_hup-finish_date = 'X'.
      APPEND ls_hup TO lt_hup.
    ELSEIF iv_action = 'PM.ORD.TECO'.
      ls_hdr-teco_ref_date = sy-datum.
      ls_hdr-teco_ref_time = sy-uzeit.
    ENDIF.
    APPEND ls_hdr TO lt_hdr.
    CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
      TABLES
        it_methods   = lt_meth
        it_header    = lt_hdr
        it_header_up = lt_hup
        return       = lt_ret.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true.
      rollback( ).
      RETURN.
    ENDIF.
    commit_wait( ).

    lv_key = ls_ord-aufnr.
    IF iv_action = 'PM.ORD.CHANGE_DATES'.
      DO 10 TIMES.
        read_order( EXPORTING iv_aufnr = lv_key IMPORTING es_ord = ls_ord ).
        IF ls_ord-gstrp = lv_start AND ls_ord-gltrp = lv_finish.
          lv_done = abap_true.
          EXIT.
        ENDIF.
        WAIT UP TO 1 SECONDS.
      ENDDO.
    ELSE.
      lv_done = wait_stat( iv_objnr = ls_ord-objnr iv_stat = lv_target ).
      read_order( EXPORTING iv_aufnr = lv_key IMPORTING es_ord = ls_ord ).
    ENDIF.
    CLEAR rs_result-rows.
    order_rows( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).
    IF lv_done = abap_false.
      lv_msg = |Order { ls_ord-aufnr } does not show the change yet: the update may still be running (SM13)|.
      add_msg( EXPORTING iv_type = 'W' iv_text = lv_msg CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |Maintenance order { ls_ord-aufnr } { lv_verb }: status { stat_text( ls_ord-objnr ) }, | &&
                        |basic dates { ls_ord-gstrp } - { ls_ord-gltrp }|.
  ENDMETHOD.


  METHOD ord_confirm.
    TYPES: BEGIN OF ty_op,
             vornr TYPE afvc-vornr,
             objnr TYPE afvc-objnr,
             rueck TYPE afvc-rueck,
             steus TYPE afvc-steus,
             arbeh TYPE afvv-arbeh,
             ismnw TYPE afvv-ismnw,
           END OF ty_op.
    DATA: lv_err    TYPE abap_bool,
          ls_ord    TYPE ty_ord,
          lv_in     TYPE string,
          lv_vornr  TYPE vornr,
          ls_op     TYPE ty_op,
          lv_work   TYPE afru-ismnw,
          lv_ok     TYPE abap_bool,
          lv_unit   TYPE arbeite,
          lv_fin    TYPE c LENGTH 1,
          lv_fname  TYPE string,
          lv_date   TYPE d,
          lv_conf_n TYPE i,
          lv_conf_a TYPE i,
          lt_tt     TYPE STANDARD TABLE OF bapi_alm_timeconfirmation,
          ls_tt     TYPE bapi_alm_timeconfirmation,
          ls_ret    TYPE bapiret2,
          lt_ret    TYPE bapiret2_t,
          lt_det    TYPE STANDARD TABLE OF bapi_alm_return,
          ls_det    TYPE bapi_alm_return,
          lv_test   TYPE bapi_coru_param-testrun,
          lv_key    TYPE aufnr,
          lv_msg    TYPE string.

    load_order( EXPORTING is_params = is_params IMPORTING es_ord = ls_ord CHANGING cs_result = rs_result ).
    IF ls_ord IS INITIAL.
      RETURN.
    ENDIF.
    order_open_check( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_ord-objnr iv_stat = c_rel ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Order { ls_ord-aufnr } is not released: release it before confirming|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_in = condense( is_params-vornr ).
    IF lv_in IS INITIAL OR lv_in CN '0123456789' OR strlen( lv_in ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'vornr is required (operation number, digits up to 4)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_vornr = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_NUMCV_INPUT'
      EXPORTING
        input  = lv_vornr
      IMPORTING
        output = lv_vornr.
    SELECT SINGLE v~vornr v~objnr v~rueck v~steus w~arbeh w~ismnw
      FROM afvc AS v INNER JOIN afvv AS w ON w~aufpl = v~aufpl AND w~aplzl = v~aplzl
      INTO ls_op WHERE v~aufpl = ls_ord-aufpl AND v~vornr = lv_vornr.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Operation { lv_in } not found in order { ls_ord-aufnr }| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    to_work( EXPORTING iv_text = is_params-act_work IMPORTING ev_work = lv_work ev_ok = lv_ok ).
    IF lv_ok = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'act_work must be a positive number (actual work)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_in = condense( is_params-unit ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS NOT INITIAL.
      CALL FUNCTION 'CONVERSION_EXIT_CUNIT_INPUT'
        EXPORTING
          input          = lv_in
        IMPORTING
          output         = lv_unit
        EXCEPTIONS
          unit_not_found = 1
          OTHERS         = 2.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Unit { is_params-unit } does not exist| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ELSE.
      lv_unit = ls_op-arbeh.
      IF lv_unit IS INITIAL.
        lv_unit = 'H'.
      ENDIF.
    ENDIF.
    lv_in = condense( is_params-final_conf ).
    TRANSLATE lv_in TO LOWER CASE.
    CASE lv_in.
      WHEN 'final' OR 'x'.
        lv_fin = 'X'.
        lv_fname = 'final'.
      WHEN 'partial' OR ''.
        lv_fin = ' '.
        lv_fname = 'partial'.
      WHEN 'auto'.
        lv_fin = '1'.
        lv_fname = 'automatic final'.
      WHEN OTHERS.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'final_conf must be partial, final or auto' CHANGING cs_result = rs_result ).
        RETURN.
    ENDCASE.
    lv_date = sy-datum.
    IF is_params-posting_date IS NOT INITIAL.
      to_date( EXPORTING iv_text = is_params-posting_date IMPORTING ev_date = lv_date ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date must be a date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_date > sy-datum.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'posting_date is in the future' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF auth_iwerk( iv_tcd = 'IW41' iv_iwerk = ls_ord-iwerk ) = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to confirm orders of planning plant { ls_ord-iwerk } (I_IWERK)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT COUNT(*) FROM afru INTO lv_conf_n WHERE aufnr = ls_ord-aufnr.

    ls_tt-orderid    = ls_ord-aufnr.
    ls_tt-operation  = lv_vornr.
    ls_tt-fin_conf   = lv_fin.
    ls_tt-postg_date = lv_date.
    ls_tt-act_work   = lv_work.
    ls_tt-un_work    = lv_unit.
    ls_tt-conf_text  = is_params-text.
    APPEND ls_tt TO lt_tt.
    IF iv_execute = abap_false.
      lv_test = 'X'.
    ENDIF.
    CALL FUNCTION 'BAPI_ALM_CONF_CREATE'
      EXPORTING
        testrun       = lv_test
      IMPORTING
        return        = ls_ret
      TABLES
        timetickets   = lt_tt
        detail_return = lt_det.
    IF ls_ret IS NOT INITIAL.
      APPEND ls_ret TO lt_ret.
    ENDIF.
    LOOP AT lt_det INTO ls_det WHERE type = 'E' OR type = 'A'.
      CLEAR ls_ret.
      ls_ret-type    = ls_det-type.
      ls_ret-id      = ls_det-message_id.
      ls_ret-number  = ls_det-message_number.
      ls_ret-message = ls_det-message.
      APPEND ls_ret TO lt_ret.
    ENDLOOP.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true.
      rollback( ).
      RETURN.
    ENDIF.
    lv_msg = |{ lv_work } { lv_unit }|.
    add_chg( EXPORTING iv_field = |OPERATION { lv_vornr } ACTUAL_WORK| iv_old = |{ ls_op-ismnw } { ls_op-arbeh }|
                       iv_new = |+ { lv_msg } ({ lv_fname })| CHANGING cs_result = rs_result ).
    rs_result-irreversible = abap_true.
    add_msg( EXPORTING iv_type = 'W'
                       iv_text = 'A confirmation can be cancelled only in IW45: it cannot be undone here'
             CHANGING cs_result = rs_result ).

    IF iv_execute = abap_false.
      rollback( ).
      rs_result-summary = |Preview (BAPI test run): { lv_fname } confirmation of { lv_msg } on operation { lv_vornr } | &&
                          |of order { ls_ord-aufnr } (posting date { lv_date }) is accepted. Nothing was changed.|.
      RETURN.
    ENDIF.
    commit_wait( ).
    READ TABLE lt_det INTO ls_det INDEX 1.
    rs_result-conf_no  = ls_det-conf_no.
    rs_result-conf_cnt = ls_det-conf_cnt.
    DO 10 TIMES.
      SELECT COUNT(*) FROM afru INTO lv_conf_a WHERE aufnr = ls_ord-aufnr.
      IF lv_conf_a > lv_conf_n.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    IF lv_conf_a <= lv_conf_n.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The confirmation is not in AFRU yet: the update may still be running (SM13)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    SELECT SINGLE ismnw FROM afvv INTO ls_op-ismnw WHERE aufpl = ls_ord-aufpl AND aplzl =
      ( SELECT aplzl FROM afvc WHERE aufpl = ls_ord-aufpl AND vornr = lv_vornr ).
    rs_result-summary = |Confirmation { ls_det-conf_no }/{ ls_det-conf_cnt } posted: { lv_fname }, { lv_msg } on operation | &&
                        |{ lv_vornr } of order { ls_ord-aufnr }; actual work now { ls_op-ismnw } { ls_op-arbeh }|.
    CLEAR rs_result-rows.
    lv_key = ls_ord-aufnr.
    read_order( EXPORTING iv_aufnr = lv_key IMPORTING es_ord = ls_ord ).
    order_rows( EXPORTING is_ord = ls_ord CHANGING cs_result = rs_result ).
  ENDMETHOD.


  METHOD bapi_msgs.
    DATA: ls_ret TYPE bapiret2,
          ls_msg TYPE zif_mcp_biz_action=>ty_message.

    CLEAR ev_err.
    LOOP AT it_return INTO ls_ret.
      IF ls_ret-message IS INITIAL AND ls_ret-id IS INITIAL.
        CONTINUE.
      ENDIF.
      CLEAR ls_msg.
      ls_msg-type    = ls_ret-type.
      ls_msg-id      = ls_ret-id.
      ls_msg-number  = ls_ret-number.
      ls_msg-message = ls_ret-message.
      IF ls_msg-message IS INITIAL.
        MESSAGE ID ls_ret-id TYPE 'I' NUMBER ls_ret-number
          WITH ls_ret-message_v1 ls_ret-message_v2 ls_ret-message_v3 ls_ret-message_v4 INTO ls_msg-message.
      ENDIF.
      IF ls_ret-type = 'E' OR ls_ret-type = 'A' OR ls_ret-type = 'X'.
        ls_msg-type = 'E'.
        ev_err = abap_true.
      ENDIF.
      APPEND ls_msg TO cs_result-messages.
    ENDLOOP.
  ENDMETHOD.


  METHOD commit_wait.
    DATA ls_ret TYPE bapiret2.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait   = 'X'
      IMPORTING
        return = ls_ret.
  ENDMETHOD.


  METHOD rollback.
    DATA ls_ret TYPE bapiret2.

    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'
      IMPORTING
        return = ls_ret.
  ENDMETHOD.


  METHOD wait_stat.
    DO 10 TIMES.
      IF has_stat( iv_objnr = iv_objnr iv_stat = iv_stat ) = abap_true.
        rv_yes = abap_true.
        RETURN.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
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


  METHOD add_chg.
    DATA ls_chg TYPE zif_mcp_biz_action=>ty_change.

    ls_chg-field     = iv_field.
    ls_chg-old_value = iv_old.
    ls_chg-new_value = iv_new.
    CONDENSE: ls_chg-old_value, ls_chg-new_value.
    APPEND ls_chg TO cs_result-changes.
  ENDMETHOD.


  METHOD finish.
    FIELD-SYMBOLS <ls_msg> TYPE zif_mcp_biz_action=>ty_message.

    LOOP AT cs_result-messages ASSIGNING <ls_msg> WHERE type = 'E' OR type = 'A'.
      cs_result-failed = abap_true.
      EXIT.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
