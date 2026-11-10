CLASS zcl_mcp_biz_qm DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Business actions on quality management (configs/QM/actions.json). Written in 7.31 syntax.
* Verified on S/4HANA; the catalog hides QM on ECC until it is verified there.
*
* Queries  QM.LOT.LIST_OPEN / LIST_BY_MATERIAL / GET_DETAIL (QALS, AFVC, QAMV, QAMR, QAVE, JEST),
*          QM.UD.GET (QAVE, QPAC, QPCT, TQ30), QM.NOTIF.LIST_OPEN / GET_DETAIL (QMEL, TQ80),
*          QM.PLAN.GET_DETAIL (MAPL, PLKO, PLPO, PLMK), QM.MAT.GET_INSP_SETUP (QMAT).
* Writes   QM.RESULT.RECORD (BAPI_INSPOPER_RECORDRESULTS; the preview runs the BAPI and rolls back),
*          QM.UD.SET (BAPI_INSPLOT_SETUSAGEDECISION, no test mode: the preview runs the checks of the
*          handler and shows the stock to be posted), QM.NOTIF.CREATE (BAPI_QUALNOT_CREATE + _SAVE),
*          QM.NOTIF.PUT_IN_PROCESS / COMPLETE (BAPI_QUALNOT_RELSTAT / _COMPLSTAT, TESTRUN).
* Authorization: Q_UD_CODE (usage decision code) and Q_QMEL (notification type) are checked by the
* handler (fail closed) before the write; results recording and stock posting are checked by the BAPIs.
* No person names are returned (creator, inspector, changer).

  PUBLIC SECTION.
    INTERFACES zif_mcp_biz_action.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_lot,
        prueflos   TYPE qals-prueflos,
        art        TYPE qals-art,
        werk       TYPE qals-werk,
        matnr      TYPE qals-matnr,
        charg      TYPE qals-charg,
        ktextlos   TYPE qals-ktextlos,
        herkunft   TYPE qals-herkunft,
        objnr      TYPE qals-objnr,
        enstehdat  TYPE qals-enstehdat,
        losmenge   TYPE qals-losmenge,
        mengeneinh TYPE qals-mengeneinh,
        lmengeist  TYPE qals-lmengeist,
        lmengezub  TYPE qals-lmengezub,
        lmenge01   TYPE qals-lmenge01,
        lmenge02   TYPE qals-lmenge02,
        lmenge03   TYPE qals-lmenge03,
        lmenge04   TYPE qals-lmenge04,
        lmenge07   TYPE qals-lmenge07,
        insmk      TYPE qals-insmk,
        lifnr      TYPE qals-lifnr,
        kunnr      TYPE qals-kunnr,
        ebeln      TYPE qals-ebeln,
        ebelp      TYPE qals-ebelp,
        mblnr      TYPE qals-mblnr,
        mjahr      TYPE qals-mjahr,
        zeile      TYPE qals-zeile,
        aufnr      TYPE qals-aufnr,
        aufpl      TYPE qals-aufpl,
        plnty      TYPE qals-plnty,
        plnnr      TYPE qals-plnnr,
        plnal      TYPE qals-plnal,
        lagortchrg TYPE qals-lagortchrg,
      END OF ty_lot,
      ty_lots TYPE STANDARD TABLE OF ty_lot WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_chr,
        vorglfnr   TYPE qamv-vorglfnr,
        merknr     TYPE qamv-merknr,
        kurztext   TYPE qamv-kurztext,
        steuerkz   TYPE qamv-steuerkz,
        masseinhsw TYPE qamv-masseinhsw,
        sollwert   TYPE qamv-sollwert,
        toleranzob TYPE qamv-toleranzob,
        toleranzun TYPE qamv-toleranzun,
        tolobni    TYPE qamv-tolobni,
        tolunni    TYPE qamv-tolunni,
        katalgart1 TYPE qamv-katalgart1,
        auswmenge1 TYPE qamv-auswmenge1,
        auswmgwrk1 TYPE qamv-auswmgwrk1,
        stellen    TYPE qamv-stellen,
        sollstpumf TYPE qamv-sollstpumf,
      END OF ty_chr,
      ty_chrs TYPE STANDARD TABLE OF ty_chr WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_res,
        vorglfnr   TYPE qamr-vorglfnr,
        merknr     TYPE qamr-merknr,
        mbewertg   TYPE qamr-mbewertg,
        mittelwert TYPE qamr-mittelwert,
        code1      TYPE qamr-code1,
        gruppe1    TYPE qamr-gruppe1,
        anzwertg   TYPE qamr-anzwertg,
      END OF ty_res,
      ty_ress TYPE STANDARD TABLE OF ty_res WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_ud,
        kzart      TYPE qave-kzart,
        zaehler    TYPE qave-zaehler,
        vwerks     TYPE qave-vwerks,
        vauswahlmg TYPE qave-vauswahlmg,
        vcodegrp   TYPE qave-vcodegrp,
        vcode      TYPE qave-vcode,
        vbewertung TYPE qave-vbewertung,
        vdatum     TYPE qave-vdatum,
      END OF ty_ud.

    TYPES:
      BEGIN OF ty_qn,
        qmnum    TYPE qmel-qmnum,
        qmart    TYPE qmel-qmart,
        qmtxt    TYPE qmel-qmtxt,
        objnr    TYPE qmel-objnr,
        priok    TYPE qmel-priok,
        erdat    TYPE qmel-erdat,
        matnr    TYPE qmel-matnr,
        mawerk   TYPE qmel-mawerk,
        lifnum   TYPE qmel-lifnum,
        kunum    TYPE qmel-kunum,
        prueflos TYPE qmel-prueflos,
        rkmng    TYPE qmel-rkmng,
        mgein    TYPE qmel-mgein,
        ebeln    TYPE qmel-ebeln,
        mblnr    TYPE qmel-mblnr,
        charg    TYPE qmel-charg,
      END OF ty_qn,
      ty_qns TYPE STANDARD TABLE OF ty_qn WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_js,
        objnr TYPE jest-objnr,
        stat  TYPE jest-stat,
      END OF ty_js,
      ty_jss TYPE SORTED TABLE OF ty_js WITH NON-UNIQUE KEY objnr stat.

    TYPES:
      BEGIN OF ty_inres,
        merknr TYPE qamv-merknr,
        value  TYPE string,
        code   TYPE string,
        grp    TYPE string,
        val    TYPE string,
      END OF ty_inres,
      ty_inress TYPE STANDARD TABLE OF ty_inres WITH DEFAULT KEY.

    TYPES ty_r_art TYPE RANGE OF qpart.
    TYPES ty_r_matnr TYPE RANGE OF matnr.
    TYPES ty_r_qmart TYPE RANGE OF qmart.

    CONSTANTS:
      c_rel  TYPE j_status VALUE 'I0002',
      c_ud   TYPE j_status VALUE 'I0218',
      c_spco TYPE j_status VALUE 'I0220',
      c_icco TYPE j_status VALUE 'I0217',
      c_ltca TYPE j_status VALUE 'I0224',
      c_osno TYPE j_status VALUE 'I0068',
      c_nopr TYPE j_status VALUE 'I0070',
      c_noco TYPE j_status VALUE 'I0072',
      c_dlfl TYPE j_status VALUE 'I0076'.

    " conversion and checks
    METHODS to_lot IMPORTING iv_text TYPE string RETURNING VALUE(rv_lot) TYPE qplos.
    METHODS to_qmnum IMPORTING iv_text TYPE string RETURNING VALUE(rv_qmnum) TYPE qmnum.
    METHODS to_matnr IMPORTING iv_text TYPE string RETURNING VALUE(rv_matnr) TYPE matnr.
    METHODS to_lifnr IMPORTING iv_text TYPE string RETURNING VALUE(rv_lifnr) TYPE lifnr.
    METHODS to_kunnr IMPORTING iv_text TYPE string RETURNING VALUE(rv_kunnr) TYPE kunnr.
    METHODS to_date
      IMPORTING iv_text TYPE string
      EXPORTING ev_date TYPE d
                ev_ok   TYPE abap_bool.
    METHODS to_num
      IMPORTING iv_text TYPE string
      EXPORTING ev_num  TYPE f
                ev_ok   TYPE abap_bool.
    METHODS max_rows IMPORTING iv_text TYPE string RETURNING VALUE(rv_max) TYPE i.
    METHODS check_plant
      IMPORTING iv_werks  TYPE string
                iv_need   TYPE abap_bool
      EXPORTING ev_werks  TYPE werks_d
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS fmt_num IMPORTING iv_val TYPE f RETURNING VALUE(rv_text) TYPE string.
    METHODS fmt_qty IMPORTING iv_val TYPE any RETURNING VALUE(rv_text) TYPE string.

    " reads
    METHODS read_lot
      IMPORTING iv_lot   TYPE qplos
      EXPORTING es_lot   TYPE ty_lot
                ev_found TYPE abap_bool.
    METHODS load_lot
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_lot    TYPE ty_lot
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS read_ud
      IMPORTING iv_lot   TYPE qplos
      EXPORTING es_ud    TYPE ty_ud
                ev_found TYPE abap_bool.
    METHODS read_notif
      IMPORTING iv_qmnum TYPE qmnum
      EXPORTING es_qn    TYPE ty_qn
                ev_found TYPE abap_bool.
    METHODS load_notif
      IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params
      EXPORTING es_qn     TYPE ty_qn
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS has_stat
      IMPORTING iv_objnr      TYPE j_objnr
                iv_stat       TYPE j_status
      RETURNING VALUE(rv_yes) TYPE abap_bool.
    METHODS stat_text
      IMPORTING iv_objnr       TYPE j_objnr
      RETURNING VALUE(rv_text) TYPE string.
    METHODS read_stats
      IMPORTING it_objnr     TYPE string_table
      RETURNING VALUE(rt_js) TYPE ty_jss.
    METHODS lot_state
      IMPORTING iv_objnr       TYPE j_objnr
                it_js          TYPE ty_jss
      RETURNING VALUE(rv_text) TYPE string.
    METHODS read_chars
      IMPORTING is_lot  TYPE ty_lot
      EXPORTING et_chr  TYPE ty_chrs
                et_res  TYPE ty_ress.
    METHODS oper_of
      IMPORTING iv_aufpl       TYPE qals-aufpl
                iv_vorglfnr    TYPE qamv-vorglfnr
      RETURNING VALUE(rv_vornr) TYPE vornr.
    METHODS code_text
      IMPORTING iv_katart      TYPE any
                iv_grp         TYPE any
                iv_code        TYPE any
      RETURNING VALUE(rv_text) TYPE string.
    METHODS lot_rows
      IMPORTING is_lot    TYPE ty_lot
                iv_row    TYPE i
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_rows
      IMPORTING is_qn     TYPE ty_qn
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.
    METHODS ud_set_default
      IMPORTING is_lot        TYPE ty_lot
      RETURNING VALUE(rv_set) TYPE qvmenge.
    METHODS parse_results
      IMPORTING it_lines  TYPE string_table
      EXPORTING et_in     TYPE ty_inress
      CHANGING  cs_result TYPE zif_mcp_biz_action=>ty_result.

    " queries
    METHODS lot_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS lot_list_by_mat IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS lot_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS ud_get IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_list_open IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS plan_get_detail IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS mat_get_setup IMPORTING is_params TYPE zif_mcp_biz_action=>ty_params RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.

    " writes (preview = iv_execute false)
    METHODS result_record
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS ud_set
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_create
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_execute       TYPE abap_bool
      RETURNING VALUE(rs_result) TYPE zif_mcp_biz_action=>ty_result.
    METHODS notif_status
      IMPORTING is_params        TYPE zif_mcp_biz_action=>ty_params
                iv_complete      TYPE abap_bool
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


CLASS zcl_mcp_biz_qm IMPLEMENTATION.

  METHOD zif_mcp_biz_action~get_actions.
    DATA ls_def TYPE zif_mcp_biz_action=>ty_action_def.

    " Must match configs/QM/actions.json.
    ls_def-kind = 'query'. ls_def-risk = 'none'.
    ls_def-id = 'QM.LOT.LIST_OPEN'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.LOT.LIST_BY_MATERIAL'. APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.LOT.GET_DETAIL'.       APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.UD.GET'.               APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.NOTIF.LIST_OPEN'.      APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.NOTIF.GET_DETAIL'.     APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.PLAN.GET_DETAIL'.      APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.MAT.GET_INSP_SETUP'.   APPEND ls_def TO rt_actions.
    ls_def-kind = 'write'. ls_def-risk = 'medium'.
    ls_def-id = 'QM.RESULT.RECORD'.        APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.NOTIF.CREATE'.         APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.NOTIF.PUT_IN_PROCESS'. APPEND ls_def TO rt_actions.
    ls_def-id = 'QM.NOTIF.COMPLETE'.       APPEND ls_def TO rt_actions.
    ls_def-risk = 'high'.
    ls_def-id = 'QM.UD.SET'.               APPEND ls_def TO rt_actions.
  ENDMETHOD.


  METHOD zif_mcp_biz_action~query.
    CASE iv_action.
      WHEN 'QM.LOT.LIST_OPEN'.
        rs_result = lot_list_open( is_params ).
      WHEN 'QM.LOT.LIST_BY_MATERIAL'.
        rs_result = lot_list_by_mat( is_params ).
      WHEN 'QM.LOT.GET_DETAIL'.
        rs_result = lot_get_detail( is_params ).
      WHEN 'QM.UD.GET'.
        rs_result = ud_get( is_params ).
      WHEN 'QM.NOTIF.LIST_OPEN'.
        rs_result = notif_list_open( is_params ).
      WHEN 'QM.NOTIF.GET_DETAIL'.
        rs_result = notif_get_detail( is_params ).
      WHEN 'QM.PLAN.GET_DETAIL'.
        rs_result = plan_get_detail( is_params ).
      WHEN 'QM.MAT.GET_INSP_SETUP'.
        rs_result = mat_get_setup( is_params ).
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
      WHEN 'QM.RESULT.RECORD'.
        rs_result = result_record( is_params = is_params iv_execute = iv_execute ).
      WHEN 'QM.UD.SET'.
        rs_result = ud_set( is_params = is_params iv_execute = iv_execute ).
      WHEN 'QM.NOTIF.CREATE'.
        rs_result = notif_create( is_params = is_params iv_execute = iv_execute ).
      WHEN 'QM.NOTIF.PUT_IN_PROCESS'.
        rs_result = notif_status( is_params = is_params iv_complete = abap_false iv_execute = iv_execute ).
      WHEN 'QM.NOTIF.COMPLETE'.
        rs_result = notif_status( is_params = is_params iv_complete = abap_true iv_execute = iv_execute ).
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


  METHOD to_lot.
    DATA lv_in TYPE string.

    lv_in = condense( iv_text ).
    IF lv_in IS INITIAL OR lv_in CN '0123456789' OR strlen( lv_in ) > 12 OR lv_in CO '0'.
      RETURN.
    ENDIF.
    rv_lot = lv_in.
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


  METHOD to_matnr.
    DATA: lv_in  TYPE string,
          lv_ext TYPE c LENGTH 40.

    lv_in = condense( iv_text ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL OR strlen( lv_in ) > 40.
      RETURN.
    ENDIF.
    lv_ext = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
      EXPORTING
        input        = lv_ext
      IMPORTING
        output       = rv_matnr
      EXCEPTIONS
        length_error = 1
        OTHERS       = 2.
    IF sy-subrc <> 0.
      CLEAR rv_matnr.
    ENDIF.
  ENDMETHOD.


  METHOD to_lifnr.
    DATA lv_in TYPE string.

    lv_in = condense( iv_text ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL OR strlen( lv_in ) > 10.
      RETURN.
    ENDIF.
    rv_lifnr = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = rv_lifnr
      IMPORTING
        output = rv_lifnr.
  ENDMETHOD.


  METHOD to_kunnr.
    DATA lv_in TYPE string.

    lv_in = condense( iv_text ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL OR strlen( lv_in ) > 10.
      RETURN.
    ENDIF.
    rv_kunnr = lv_in.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING
        input  = rv_kunnr
      IMPORTING
        output = rv_kunnr.
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


  METHOD to_num.
    DATA: lv_in  TYPE string,
          lv_dec TYPE p LENGTH 16 DECIMALS 6.

    CLEAR: ev_num, ev_ok.
    lv_in = condense( iv_text ).
    REPLACE ALL OCCURRENCES OF ',' IN lv_in WITH '.'.
    IF lv_in IS INITIAL OR lv_in CN '0123456789.-'.
      RETURN.
    ENDIF.
    TRY.
        lv_dec = lv_in.
      CATCH cx_sy_conversion_error.
        RETURN.
    ENDTRY.
    ev_num = lv_dec.
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


  METHOD check_plant.
    DATA lv_in TYPE string.

    CLEAR ev_werks.
    lv_in = condense( iv_werks ).
    TRANSLATE lv_in TO UPPER CASE.
    IF lv_in IS INITIAL.
      IF iv_need = abap_true.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required (plant)' CHANGING cs_result = cs_result ).
      ENDIF.
      RETURN.
    ENDIF.
    IF strlen( lv_in ) > 4.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks must be a plant (up to 4 characters)' CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    ev_werks = lv_in.
    SELECT SINGLE werks FROM t001w INTO ev_werks WHERE werks = ev_werks.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Plant { lv_in } does not exist| CHANGING cs_result = cs_result ).
      CLEAR ev_werks.
    ENDIF.
  ENDMETHOD.


  METHOD fmt_num.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 3.

    lv_p = iv_val.
    rv_text = |{ lv_p NUMBER = RAW }|.
    IF rv_text CS '.'.
      SHIFT rv_text RIGHT DELETING TRAILING '0'.
      SHIFT rv_text RIGHT DELETING TRAILING '.'.
      CONDENSE rv_text.
    ENDIF.
  ENDMETHOD.


  METHOD fmt_qty.
    DATA lv_p TYPE p LENGTH 16 DECIMALS 3.

    lv_p = iv_val.
    rv_text = |{ lv_p NUMBER = RAW }|.
    IF rv_text CS '.'.
      SHIFT rv_text RIGHT DELETING TRAILING '0'.
      SHIFT rv_text RIGHT DELETING TRAILING '.'.
      CONDENSE rv_text.
    ENDIF.
  ENDMETHOD.


  METHOD read_lot.
    CLEAR: es_lot, ev_found.
    SELECT SINGLE prueflos art werk matnr charg ktextlos herkunft objnr enstehdat losmenge mengeneinh
                  lmengeist lmengezub lmenge01 lmenge02 lmenge03 lmenge04 lmenge07 insmk lifnr kunnr
                  ebeln ebelp mblnr mjahr zeile aufnr aufpl plnty plnnr plnal lagortchrg
      FROM qals INTO CORRESPONDING FIELDS OF es_lot WHERE prueflos = iv_lot.
    ev_found = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD load_lot.
    DATA: lv_lot   TYPE qplos,
          lv_found TYPE abap_bool.

    CLEAR es_lot.
    IF is_params-prueflos IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'prueflos is required (inspection lot number, up to 12 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    lv_lot = to_lot( is_params-prueflos ).
    IF lv_lot IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'prueflos is required (inspection lot number, up to 12 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    read_lot( EXPORTING iv_lot = lv_lot IMPORTING es_lot = es_lot ev_found = lv_found ).
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection lot { is_params-prueflos } not found|
               CHANGING cs_result = cs_result ).
      CLEAR es_lot.
    ENDIF.
  ENDMETHOD.


  METHOD read_ud.
    CLEAR: es_ud, ev_found.
    SELECT kzart zaehler vwerks vauswahlmg vcodegrp vcode vbewertung vdatum
      FROM qave INTO CORRESPONDING FIELDS OF es_ud UP TO 1 ROWS
      WHERE prueflos = iv_lot AND kzart = 'L'.
    ENDSELECT.
    IF sy-subrc <> 0.
      SELECT kzart zaehler vwerks vauswahlmg vcodegrp vcode vbewertung vdatum
        FROM qave INTO CORRESPONDING FIELDS OF es_ud UP TO 1 ROWS
        WHERE prueflos = iv_lot.
      ENDSELECT.
    ENDIF.
    ev_found = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD read_notif.
    CLEAR: es_qn, ev_found.
    SELECT SINGLE qmnum qmart qmtxt objnr priok erdat matnr mawerk lifnum kunum prueflos rkmng mgein ebeln mblnr charg
      FROM qmel INTO CORRESPONDING FIELDS OF es_qn WHERE qmnum = iv_qmnum.
    ev_found = boolc( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD load_notif.
    DATA: lv_qmnum TYPE qmnum,
          lv_found TYPE abap_bool,
          lv_qmtyp TYPE tq80-qmtyp.

    CLEAR es_qn.
    lv_qmnum = to_qmnum( is_params-qmnum ).
    IF lv_qmnum IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'qmnum is required (notification number, up to 12 digits)'
               CHANGING cs_result = cs_result ).
      RETURN.
    ENDIF.
    read_notif( EXPORTING iv_qmnum = lv_qmnum IMPORTING es_qn = es_qn ev_found = lv_found ).
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { is_params-qmnum } not found| CHANGING cs_result = cs_result ).
      CLEAR es_qn.
      RETURN.
    ENDIF.
    SELECT SINGLE qmtyp FROM tq80 INTO lv_qmtyp WHERE qmart = es_qn-qmart.
    IF lv_qmtyp <> '02'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = |Notification { is_params-qmnum } is not a quality notification (type { es_qn-qmart }): use the plant maintenance actions|
               CHANGING cs_result = cs_result ).
      CLEAR es_qn.
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
        AND stat IN ('I0002', 'I0217', 'I0218', 'I0220', 'I0224', 'I0068', 'I0070', 'I0072', 'I0076').
    rt_js = lt_r.
  ENDMETHOD.


  METHOD lot_state.
    READ TABLE it_js WITH KEY objnr = iv_objnr stat = c_ltca TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      rv_text = 'cancelled'.
      RETURN.
    ENDIF.
    READ TABLE it_js WITH KEY objnr = iv_objnr stat = c_ud TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      READ TABLE it_js WITH KEY objnr = iv_objnr stat = c_spco TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        rv_text = 'usage decision made, stock posted'.
      ELSE.
        rv_text = 'usage decision made'.
      ENDIF.
      RETURN.
    ENDIF.
    READ TABLE it_js WITH KEY objnr = iv_objnr stat = c_icco TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      rv_text = 'inspection completed, usage decision open'.
      RETURN.
    ENDIF.
    READ TABLE it_js WITH KEY objnr = iv_objnr stat = c_rel TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      rv_text = 'released, usage decision open'.
    ELSE.
      rv_text = 'created, usage decision open'.
    ENDIF.
  ENDMETHOD.


  METHOD read_chars.
    CLEAR: et_chr, et_res.
    SELECT vorglfnr merknr kurztext steuerkz masseinhsw sollwert toleranzob toleranzun tolobni tolunni
           katalgart1 auswmenge1 auswmgwrk1 stellen sollstpumf
      FROM qamv INTO CORRESPONDING FIELDS OF TABLE et_chr
      WHERE prueflos = is_lot-prueflos.
    SORT et_chr BY vorglfnr merknr.
    SELECT vorglfnr merknr mbewertg mittelwert code1 gruppe1 anzwertg
      FROM qamr INTO CORRESPONDING FIELDS OF TABLE et_res
      WHERE prueflos = is_lot-prueflos.
    SORT et_res BY vorglfnr merknr.
  ENDMETHOD.


  METHOD oper_of.
    SELECT SINGLE vornr FROM afvc INTO rv_vornr WHERE aufpl = iv_aufpl AND aplzl = iv_vorglfnr.
  ENDMETHOD.


  METHOD code_text.
    DATA lv_t TYPE qpct-kurztext.

    SELECT kurztext FROM qpct INTO lv_t UP TO 1 ROWS
      WHERE katalogart = iv_katart AND codegruppe = iv_grp AND code = iv_code AND sprache = sy-langu.
    ENDSELECT.
    IF sy-subrc <> 0.
      SELECT kurztext FROM qpct INTO lv_t UP TO 1 ROWS
        WHERE katalogart = iv_katart AND codegruppe = iv_grp AND code = iv_code.
      ENDSELECT.
    ENDIF.
    rv_text = lv_t.
  ENDMETHOD.


  METHOD lot_rows.
    DATA lv_t TYPE string.

    add_kv( EXPORTING iv_row = iv_row iv_name = 'LOT' iv_value = is_lot-prueflos CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'INSPECTION_TYPE' iv_value = is_lot-art CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'PLANT' iv_value = is_lot-werk CHANGING ct_rows = cs_result-rows ).
    IF is_lot-matnr IS NOT INITIAL.
      lv_t = |{ is_lot-matnr ALPHA = OUT }|.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'MATERIAL' iv_value = lv_t CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_lot-ktextlos IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'TEXT' iv_value = is_lot-ktextlos CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_lot-charg IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'BATCH' iv_value = is_lot-charg CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    lv_t = |{ fmt_qty( is_lot-losmenge ) } { is_lot-mengeneinh }|.
    add_kv( EXPORTING iv_row = iv_row iv_name = 'LOT_QUANTITY' iv_value = lv_t CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'CREATED' iv_value = is_lot-enstehdat CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = iv_row iv_name = 'ORIGIN' iv_value = is_lot-herkunft CHANGING ct_rows = cs_result-rows ).
    IF is_lot-ebeln IS NOT INITIAL.
      lv_t = |{ is_lot-ebeln }/{ is_lot-ebelp }|.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'PURCHASE_ORDER' iv_value = lv_t CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_lot-lifnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'SUPPLIER' iv_value = is_lot-lifnr CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_lot-mblnr IS NOT INITIAL.
      lv_t = |{ is_lot-mblnr }/{ is_lot-mjahr }|.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'MATERIAL_DOCUMENT' iv_value = lv_t CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_lot-aufnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'ORDER' iv_value = is_lot-aufnr CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_lot-kunnr IS NOT INITIAL.
      add_kv( EXPORTING iv_row = iv_row iv_name = 'CUSTOMER' iv_value = is_lot-kunnr CHANGING ct_rows = cs_result-rows ).
    ENDIF.
  ENDMETHOD.


  METHOD notif_rows.
    DATA lv_t TYPE string.

    add_kv( EXPORTING iv_row = 1 iv_name = 'NOTIFICATION' iv_value = is_qn-qmnum CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TYPE' iv_value = is_qn-qmart CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TEXT' iv_value = is_qn-qmtxt CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS' iv_value = stat_text( is_qn-objnr ) CHANGING ct_rows = cs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'CREATED' iv_value = is_qn-erdat CHANGING ct_rows = cs_result-rows ).
    IF is_qn-priok IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'PRIORITY' iv_value = is_qn-priok CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-matnr IS NOT INITIAL.
      lv_t = |{ is_qn-matnr ALPHA = OUT }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'MATERIAL' iv_value = lv_t CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-mawerk IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'PLANT' iv_value = is_qn-mawerk CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-lifnum IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'SUPPLIER' iv_value = is_qn-lifnum CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-kunum IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'CUSTOMER' iv_value = is_qn-kunum CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-prueflos IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'LOT' iv_value = is_qn-prueflos CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-ebeln IS NOT INITIAL.
      add_kv( EXPORTING iv_row = 1 iv_name = 'PURCHASE_ORDER' iv_value = is_qn-ebeln CHANGING ct_rows = cs_result-rows ).
    ENDIF.
    IF is_qn-rkmng IS NOT INITIAL.
      lv_t = |{ fmt_qty( is_qn-rkmng ) } { is_qn-mgein }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'COMPLAINT_QUANTITY' iv_value = lv_t CHANGING ct_rows = cs_result-rows ).
    ENDIF.
  ENDMETHOD.


  METHOD ud_set_default.
    DATA: lv_set TYPE qvmenge,
          lt_set TYPE STANDARD TABLE OF qvmenge.

    SELECT SINGLE vemenge FROM tq30 INTO rv_set WHERE art = is_lot-art.
    IF rv_set IS NOT INITIAL.
      RETURN.
    ENDIF.
    " no default in the inspection type: the selected set used for this inspection type and plant before
    SELECT DISTINCT v~vauswahlmg FROM qave AS v INNER JOIN qals AS q ON q~prueflos = v~prueflos
      INTO TABLE lt_set
      WHERE q~art = is_lot-art AND q~werk = is_lot-werk AND v~vwerks = is_lot-werk.
    DELETE lt_set WHERE table_line IS INITIAL.
    IF lines( lt_set ) = 1.
      READ TABLE lt_set INTO lv_set INDEX 1.
      rv_set = lv_set.
    ENDIF.
  ENDMETHOD.


  METHOD parse_results.
    DATA: lv_line  TYPE string,
          lt_parts TYPE string_table,
          lv_part  TYPE string,
          lv_name  TYPE string,
          lv_val   TYPE string,
          ls_in    TYPE ty_inres,
          lv_n     TYPE i,
          lv_ok    TYPE abap_bool.

    CLEAR et_in.
    LOOP AT it_lines INTO lv_line.
      lv_n = sy-tabix.
      CLEAR: ls_in, lt_parts.
      lv_ok = abap_true.
      SPLIT lv_line AT ';' INTO TABLE lt_parts.
      LOOP AT lt_parts INTO lv_part.
        IF lv_part IS INITIAL.
          CONTINUE.
        ENDIF.
        CLEAR: lv_name, lv_val.
        SPLIT lv_part AT '=' INTO lv_name lv_val.
        lv_name = condense( lv_name ).
        TRANSLATE lv_name TO LOWER CASE.
        lv_val = condense( lv_val ).
        CASE lv_name.
          WHEN 'merknr' OR 'char'.
            IF lv_val IS INITIAL OR lv_val CN '0123456789' OR strlen( lv_val ) > 4.
              lv_ok = abap_false.
            ELSE.
              ls_in-merknr = lv_val.
            ENDIF.
          WHEN 'value'.
            ls_in-value = lv_val.
          WHEN 'code'.
            ls_in-code = lv_val.
            TRANSLATE ls_in-code TO UPPER CASE.
          WHEN 'codegrp' OR 'code_group'.
            ls_in-grp = lv_val.
            TRANSLATE ls_in-grp TO UPPER CASE.
          WHEN 'valuation'.
            ls_in-val = lv_val.
            TRANSLATE ls_in-val TO UPPER CASE.
          WHEN OTHERS.
            lv_ok = abap_false.
        ENDCASE.
      ENDLOOP.
      IF lv_ok = abap_false OR ls_in-merknr IS INITIAL
         OR ( ls_in-value IS INITIAL AND ls_in-code IS INITIAL AND ls_in-val IS INITIAL ).
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = |lines row { lv_n }: use merknr=<characteristic>;value=<number> or merknr=<characteristic>;code=<code> (valuation=A or R for characteristics without values)|
                 CHANGING cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      IF ls_in-val IS NOT INITIAL AND ls_in-val <> 'A' AND ls_in-val <> 'R'.
        add_msg( EXPORTING iv_type = 'E' iv_text = |lines row { lv_n }: valuation must be A (accepted) or R (rejected)|
                 CHANGING cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      READ TABLE et_in WITH KEY merknr = ls_in-merknr TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |lines row { lv_n }: characteristic { ls_in-merknr } is given twice|
                 CHANGING cs_result = cs_result ).
        CONTINUE.
      ENDIF.
      APPEND ls_in TO et_in.
    ENDLOOP.
  ENDMETHOD.


  METHOD lot_list_open.
    DATA: lv_werks TYPE werks_d,
          lr_art   TYPE ty_r_art,
          ls_art   LIKE LINE OF lr_art,
          lr_matnr TYPE ty_r_matnr,
          ls_matnr LIKE LINE OF lr_matnr,
          lv_art   TYPE qpart,
          lt_lot   TYPE ty_lots,
          ls_lot   TYPE ty_lot,
          lt_obj   TYPE string_table,
          lv_obj   TYPE string,
          lt_js    TYPE ty_jss,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_open  TYPE i,
          lv_st    TYPE string,
          lv_t     TYPE string.

    check_plant( EXPORTING iv_werks = is_params-werks iv_need = abap_true IMPORTING ev_werks = lv_werks CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF is_params-art IS NOT INITIAL.
      lv_art = condense( is_params-art ).
      SELECT SINGLE art FROM tq30 INTO lv_art WHERE art = lv_art.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection type { is_params-art } does not exist (TQ30)| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      ls_art-sign = 'I'. ls_art-option = 'EQ'. ls_art-low = lv_art.
      APPEND ls_art TO lr_art.
    ENDIF.
    IF is_params-matnr IS NOT INITIAL.
      ls_matnr-sign = 'I'. ls_matnr-option = 'EQ'. ls_matnr-low = to_matnr( is_params-matnr ).
      SELECT SINGLE matnr FROM mara INTO ls_matnr-low WHERE matnr = ls_matnr-low.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Material { is_params-matnr } does not exist| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      APPEND ls_matnr TO lr_matnr.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).

    SELECT prueflos art werk matnr charg ktextlos herkunft objnr enstehdat losmenge mengeneinh lmengezub
           lifnr ebeln ebelp mblnr mjahr aufnr kunnr
      FROM qals INTO CORRESPONDING FIELDS OF TABLE lt_lot UP TO 20000 ROWS
      WHERE werk = lv_werks AND art IN lr_art AND matnr IN lr_matnr.
    LOOP AT lt_lot INTO ls_lot.
      lv_obj = ls_lot-objnr.
      APPEND lv_obj TO lt_obj.
    ENDLOOP.
    lt_js = read_stats( lt_obj ).
    SORT lt_lot BY enstehdat DESCENDING prueflos DESCENDING.

    LOOP AT lt_lot INTO ls_lot.
      READ TABLE lt_js WITH KEY objnr = ls_lot-objnr stat = c_ud TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_js WITH KEY objnr = ls_lot-objnr stat = c_ltca TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      lv_open = lv_open + 1.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      lot_rows( EXPORTING is_lot = ls_lot iv_row = lv_row CHANGING cs_result = rs_result ).
      lv_st = lot_state( iv_objnr = ls_lot-objnr it_js = lt_js ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = lv_st CHANGING ct_rows = rs_result-rows ).
      IF ls_lot-lmengezub IS NOT INITIAL.
        lv_t = |{ fmt_qty( ls_lot-lmengezub ) } { ls_lot-mengeneinh }|.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'TO_BE_POSTED' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |{ lv_open } open inspection lots (no usage decision) in plant { lv_werks }|.
    IF lv_art IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary }, inspection type { lv_art }|.
    ENDIF.
    IF lr_matnr IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary }, material { condense( is_params-matnr ) }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; first { lv_max } shown|.
    ENDIF.
  ENDMETHOD.


  METHOD lot_list_by_mat.
    DATA: lv_werks TYPE werks_d,
          lv_matnr TYPE matnr,
          lv_from  TYPE d,
          lv_to    TYPE d,
          lv_ok    TYPE abap_bool,
          lt_lot   TYPE ty_lots,
          ls_lot   TYPE ty_lot,
          lt_obj   TYPE string_table,
          lv_obj   TYPE string,
          lt_js    TYPE ty_jss,
          ls_ud    TYPE ty_ud,
          lv_found TYPE abap_bool,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_t     TYPE string.

    IF is_params-matnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr is required (material)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_matnr = to_matnr( is_params-matnr ).
    SELECT SINGLE matnr FROM mara INTO lv_matnr WHERE matnr = lv_matnr.
    IF sy-subrc <> 0 OR lv_matnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Material { is_params-matnr } does not exist| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    check_plant( EXPORTING iv_werks = is_params-werks iv_need = abap_false IMPORTING ev_werks = lv_werks CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    lv_from = '19000101'.
    lv_to = '99991231'.
    IF is_params-date_from IS NOT INITIAL.
      to_date( EXPORTING iv_text = is_params-date_from IMPORTING ev_date = lv_from ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_from must be a valid date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF is_params-date_to IS NOT INITIAL.
      to_date( EXPORTING iv_text = is_params-date_to IMPORTING ev_date = lv_to ev_ok = lv_ok ).
      IF lv_ok = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'date_to must be a valid date (YYYY-MM-DD)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_to < lv_from.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'date_to is before date_from' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).

    IF lv_werks IS INITIAL.
      SELECT prueflos art werk matnr charg ktextlos herkunft objnr enstehdat losmenge mengeneinh lmengezub
             lifnr ebeln ebelp mblnr mjahr aufnr kunnr
        FROM qals INTO CORRESPONDING FIELDS OF TABLE lt_lot UP TO 20000 ROWS
        WHERE matnr = lv_matnr AND enstehdat BETWEEN lv_from AND lv_to.
    ELSE.
      SELECT prueflos art werk matnr charg ktextlos herkunft objnr enstehdat losmenge mengeneinh lmengezub
             lifnr ebeln ebelp mblnr mjahr aufnr kunnr
        FROM qals INTO CORRESPONDING FIELDS OF TABLE lt_lot UP TO 20000 ROWS
        WHERE matnr = lv_matnr AND werk = lv_werks AND enstehdat BETWEEN lv_from AND lv_to.
    ENDIF.
    LOOP AT lt_lot INTO ls_lot.
      lv_obj = ls_lot-objnr.
      APPEND lv_obj TO lt_obj.
    ENDLOOP.
    lt_js = read_stats( lt_obj ).
    SORT lt_lot BY enstehdat DESCENDING prueflos DESCENDING.
    LOOP AT lt_lot INTO ls_lot.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        EXIT.
      ENDIF.
      lv_row = lv_row + 1.
      lot_rows( EXPORTING is_lot = ls_lot iv_row = lv_row CHANGING cs_result = rs_result ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = lot_state( iv_objnr = ls_lot-objnr it_js = lt_js )
              CHANGING ct_rows = rs_result-rows ).
      read_ud( EXPORTING iv_lot = ls_lot-prueflos IMPORTING es_ud = ls_ud ev_found = lv_found ).
      IF lv_found = abap_true.
        lv_t = |{ ls_ud-vcodegrp }/{ ls_ud-vcode } ({ ls_ud-vbewertung })|.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'USAGE_DECISION' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |{ lines( lt_lot ) } inspection lots for material { condense( is_params-matnr ) }|.
    IF lv_werks IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary } in plant { lv_werks }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; first { lv_max } shown|.
    ENDIF.
  ENDMETHOD.


  METHOD lot_get_detail.
    DATA: ls_lot   TYPE ty_lot,
          lt_chr   TYPE ty_chrs,
          ls_chr   TYPE ty_chr,
          lt_res   TYPE ty_ress,
          ls_res   TYPE ty_res,
          ls_ud    TYPE ty_ud,
          lv_found TYPE abap_bool,
          lv_row   TYPE i,
          lv_t     TYPE string,
          lv_vornr TYPE vornr,
          lv_open  TYPE i,
          lv_done  TYPE i,
          lt_obj   TYPE string_table,
          lv_obj   TYPE string,
          lt_js    TYPE ty_jss,
          lv_st    TYPE string.

    load_lot( EXPORTING is_params = is_params IMPORTING es_lot = ls_lot CHANGING cs_result = rs_result ).
    IF ls_lot IS INITIAL.
      RETURN.
    ENDIF.
    lv_obj = ls_lot-objnr.
    APPEND lv_obj TO lt_obj.
    lt_js = read_stats( lt_obj ).
    lv_st = lot_state( iv_objnr = ls_lot-objnr it_js = lt_js ).
    lot_rows( EXPORTING is_lot = ls_lot iv_row = 1 CHANGING cs_result = rs_result ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS' iv_value = lv_st CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'SYSTEM_STATUS' iv_value = stat_text( ls_lot-objnr ) CHANGING ct_rows = rs_result-rows ).
    " stock
    lv_t = |{ fmt_qty( ls_lot-lmengezub ) } { ls_lot-mengeneinh }|.
    add_kv( EXPORTING iv_row = 1 iv_name = 'TO_BE_POSTED' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
    IF ls_lot-lmenge01 IS NOT INITIAL.
      lv_t = |{ fmt_qty( ls_lot-lmenge01 ) } { ls_lot-mengeneinh }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'POSTED_UNRESTRICTED' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_lot-lmenge02 IS NOT INITIAL.
      lv_t = |{ fmt_qty( ls_lot-lmenge02 ) } { ls_lot-mengeneinh }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'POSTED_SCRAP' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_lot-lmenge03 IS NOT INITIAL.
      lv_t = |{ fmt_qty( ls_lot-lmenge03 ) } { ls_lot-mengeneinh }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'POSTED_SAMPLE' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_lot-lmenge04 IS NOT INITIAL.
      lv_t = |{ fmt_qty( ls_lot-lmenge04 ) } { ls_lot-mengeneinh }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'POSTED_BLOCKED' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    IF ls_lot-lmenge07 IS NOT INITIAL.
      lv_t = |{ fmt_qty( ls_lot-lmenge07 ) } { ls_lot-mengeneinh }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'RETURNED_TO_SUPPLIER' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    " usage decision
    read_ud( EXPORTING iv_lot = ls_lot-prueflos IMPORTING es_ud = ls_ud ev_found = lv_found ).
    IF lv_found = abap_true.
      lv_t = |{ ls_ud-vcodegrp }/{ ls_ud-vcode } { code_text( iv_katart = '3' iv_grp = ls_ud-vcodegrp iv_code = ls_ud-vcode ) }|.
      add_kv( EXPORTING iv_row = 1 iv_name = 'USAGE_DECISION' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'UD_VALUATION' iv_value = ls_ud-vbewertung CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'UD_DATE' iv_value = ls_ud-vdatum CHANGING ct_rows = rs_result-rows ).
    ENDIF.
    " characteristics + results (one row each)
    read_chars( EXPORTING is_lot = ls_lot IMPORTING et_chr = lt_chr et_res = lt_res ).
    lv_row = 1.
    LOOP AT lt_chr INTO ls_chr.
      lv_row = lv_row + 1.
      lv_vornr = oper_of( iv_aufpl = ls_lot-aufpl iv_vorglfnr = ls_chr-vorglfnr ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'OPERATION' iv_value = lv_vornr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CHARACTERISTIC' iv_value = ls_chr-merknr CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CHAR_TEXT' iv_value = ls_chr-kurztext CHANGING ct_rows = rs_result-rows ).
      IF ls_chr-steuerkz(1) = 'X'.
        lv_t = 'quantitative'.
        IF ls_chr-tolunni IS NOT INITIAL.
          lv_t = |{ lv_t }, lower limit { fmt_num( ls_chr-toleranzun ) }|.
        ENDIF.
        IF ls_chr-tolobni IS NOT INITIAL.
          lv_t = |{ lv_t }, upper limit { fmt_num( ls_chr-toleranzob ) }|.
        ENDIF.
        IF ls_chr-masseinhsw IS NOT INITIAL.
          lv_t = |{ lv_t } { ls_chr-masseinhsw }|.
        ENDIF.
      ELSE.
        lv_t = 'qualitative'.
        IF ls_chr-auswmenge1 IS NOT INITIAL.
          lv_t = |{ lv_t }, codes of selected set { ls_chr-auswmenge1 }|.
        ENDIF.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'SPECIFICATION' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
      IF ls_chr-sollstpumf IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'SAMPLE_SIZE' iv_value = ls_chr-sollstpumf CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      READ TABLE lt_res INTO ls_res WITH KEY vorglfnr = ls_chr-vorglfnr merknr = ls_chr-merknr BINARY SEARCH.
      IF sy-subrc = 0 AND ( ls_res-mbewertg IS NOT INITIAL OR ls_res-code1 IS NOT INITIAL OR ls_res-anzwertg IS NOT INITIAL ).
        lv_done = lv_done + 1.
        IF ls_chr-steuerkz(1) = 'X'.
          lv_t = fmt_num( ls_res-mittelwert ).
        ELSE.
          lv_t = |{ ls_res-gruppe1 }/{ ls_res-code1 }|.
        ENDIF.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'RESULT' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'VALUATION' iv_value = ls_res-mbewertg CHANGING ct_rows = rs_result-rows ).
      ELSE.
        lv_open = lv_open + 1.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'RESULT' iv_value = 'open' CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |Inspection lot { ls_lot-prueflos } (type { ls_lot-art }, plant { ls_lot-werk }): { lv_st }; | &&
                        |{ lines( lt_chr ) } characteristics, { lv_done } with results, { lv_open } open|.
  ENDMETHOD.


  METHOD ud_get.
    DATA: ls_lot   TYPE ty_lot,
          ls_ud    TYPE ty_ud,
          lv_found TYPE abap_bool,
          lv_set   TYPE qvmenge,
          lv_t     TYPE string,
          lv_row   TYPE i,
          lv_qty   TYPE string.
    DATA: BEGIN OF ls_pac,
            codegruppe TYPE qpac-codegruppe,
            code       TYPE qpac-code,
            bewertung  TYPE qpac-bewertung,
          END OF ls_pac,
          lt_pac LIKE STANDARD TABLE OF ls_pac.

    load_lot( EXPORTING is_params = is_params IMPORTING es_lot = ls_lot CHANGING cs_result = rs_result ).
    IF ls_lot IS INITIAL.
      RETURN.
    ENDIF.
    read_ud( EXPORTING iv_lot = ls_lot-prueflos IMPORTING es_ud = ls_ud ev_found = lv_found ).
    IF lv_found = abap_true.
      add_kv( EXPORTING iv_row = 1 iv_name = 'LOT' iv_value = ls_lot-prueflos CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'SELECTED_SET' iv_value = ls_ud-vauswahlmg CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'CODE_GROUP' iv_value = ls_ud-vcodegrp CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'CODE' iv_value = ls_ud-vcode CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'CODE_TEXT' iv_value = code_text( iv_katart = '3' iv_grp = ls_ud-vcodegrp iv_code = ls_ud-vcode )
              CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'VALUATION' iv_value = ls_ud-vbewertung CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = 1 iv_name = 'DATE' iv_value = ls_ud-vdatum CHANGING ct_rows = rs_result-rows ).
      IF has_stat( iv_objnr = ls_lot-objnr iv_stat = c_spco ) = abap_true.
        lv_t = 'completed'.
      ELSEIF ls_lot-lmengezub IS NOT INITIAL.
        lv_t = |open: { fmt_qty( ls_lot-lmengezub ) } { ls_lot-mengeneinh } still to post|.
      ELSE.
        lv_t = 'nothing to post'.
      ENDIF.
      add_kv( EXPORTING iv_row = 1 iv_name = 'STOCK_POSTING' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
      rs_result-summary = |Usage decision of lot { ls_lot-prueflos }: { ls_ud-vcodegrp }/{ ls_ud-vcode } | &&
                          |({ ls_ud-vbewertung }) on { ls_ud-vdatum }|.
      RETURN.
    ENDIF.

    " no decision yet: the codes the user can choose
    IF is_params-ud_set IS NOT INITIAL.
      lv_set = condense( is_params-ud_set ).
      TRANSLATE lv_set TO UPPER CASE.
    ELSE.
      lv_set = ud_set_default( ls_lot ).
    ENDIF.
    lv_qty = |{ fmt_qty( ls_lot-lmengezub ) } { ls_lot-mengeneinh }|.
    IF lv_set IS INITIAL.
      rs_result-summary = |Lot { ls_lot-prueflos } has no usage decision yet ({ lv_qty } in inspection stock). | &&
                          |No default selected set for inspection type { ls_lot-art }: give ud_set|.
      RETURN.
    ENDIF.
    SELECT codegruppe code bewertung FROM qpac INTO TABLE lt_pac
      WHERE werks = ls_lot-werk AND katalogart = '3' AND auswahlmge = lv_set.
    IF lt_pac IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Selected set { lv_set } has no usage decision codes in plant { ls_lot-werk }|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SORT lt_pac BY bewertung code.
    LOOP AT lt_pac INTO ls_pac.
      lv_row = lv_row + 1.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'SELECTED_SET' iv_value = lv_set CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CODE_GROUP' iv_value = ls_pac-codegruppe CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CODE' iv_value = ls_pac-code CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CODE_TEXT' iv_value = code_text( iv_katart = '3' iv_grp = ls_pac-codegruppe iv_code = ls_pac-code )
              CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'VALUATION' iv_value = ls_pac-bewertung CHANGING ct_rows = rs_result-rows ).
    ENDLOOP.
    rs_result-summary = |Lot { ls_lot-prueflos } has no usage decision yet ({ lv_qty } in inspection stock): | &&
                        |{ lines( lt_pac ) } codes in selected set { lv_set }|.
  ENDMETHOD.


  METHOD notif_list_open.
    DATA: lv_werks TYPE werks_d,
          lr_qmart TYPE ty_r_qmart,
          ls_qmart LIKE LINE OF lr_qmart,
          lt_qmart TYPE STANDARD TABLE OF qmart,
          lv_qmart TYPE qmart,
          lv_qmtyp TYPE tq80-qmtyp,
          lv_matnr TYPE matnr,
          lv_lifnr TYPE lifnr,
          lt_qn    TYPE ty_qns,
          ls_qn    TYPE ty_qn,
          lt_obj   TYPE string_table,
          lv_obj   TYPE string,
          lt_js    TYPE ty_jss,
          lv_max   TYPE i,
          lv_row   TYPE i,
          lv_open  TYPE i,
          lv_st    TYPE string,
          lv_t     TYPE string.

    check_plant( EXPORTING iv_werks = is_params-werks iv_need = abap_false IMPORTING ev_werks = lv_werks CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF is_params-qmart IS NOT INITIAL.
      lv_qmart = condense( is_params-qmart ).
      TRANSLATE lv_qmart TO UPPER CASE.
      SELECT SINGLE qmtyp FROM tq80 INTO lv_qmtyp WHERE qmart = lv_qmart.
      IF sy-subrc <> 0 OR lv_qmtyp <> '02'.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Notification type { is_params-qmart } is not a quality notification type|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      APPEND lv_qmart TO lt_qmart.
    ELSE.
      SELECT qmart FROM tq80 INTO TABLE lt_qmart WHERE qmtyp = '02'.
    ENDIF.
    LOOP AT lt_qmart INTO lv_qmart.
      ls_qmart-sign = 'I'. ls_qmart-option = 'EQ'. ls_qmart-low = lv_qmart.
      APPEND ls_qmart TO lr_qmart.
    ENDLOOP.
    IF lr_qmart IS INITIAL.
      rs_result-summary = '0 open quality notifications (no quality notification type configured)'.
      RETURN.
    ENDIF.
    IF is_params-matnr IS NOT INITIAL.
      lv_matnr = to_matnr( is_params-matnr ).
    ENDIF.
    IF is_params-lifnr IS NOT INITIAL.
      lv_lifnr = to_lifnr( is_params-lifnr ).
    ENDIF.
    lv_max = max_rows( is_params-max_rows ).

    SELECT qmnum qmart qmtxt objnr priok erdat matnr mawerk lifnum kunum prueflos rkmng mgein ebeln mblnr charg
      FROM qmel INTO CORRESPONDING FIELDS OF TABLE lt_qn UP TO 20000 ROWS
      WHERE qmart IN lr_qmart.
    IF lv_werks IS NOT INITIAL.
      DELETE lt_qn WHERE mawerk <> lv_werks.
    ENDIF.
    IF lv_matnr IS NOT INITIAL.
      DELETE lt_qn WHERE matnr <> lv_matnr.
    ENDIF.
    IF lv_lifnr IS NOT INITIAL.
      DELETE lt_qn WHERE lifnum <> lv_lifnr.
    ENDIF.
    LOOP AT lt_qn INTO ls_qn.
      lv_obj = ls_qn-objnr.
      APPEND lv_obj TO lt_obj.
    ENDLOOP.
    lt_js = read_stats( lt_obj ).
    SORT lt_qn BY erdat DESCENDING qmnum DESCENDING.
    LOOP AT lt_qn INTO ls_qn.
      READ TABLE lt_js WITH KEY objnr = ls_qn-objnr stat = c_noco TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      READ TABLE lt_js WITH KEY objnr = ls_qn-objnr stat = c_dlfl TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.
      lv_open = lv_open + 1.
      IF lv_row >= lv_max.
        rs_result-truncated = abap_true.
        CONTINUE.
      ENDIF.
      lv_row = lv_row + 1.
      READ TABLE lt_js WITH KEY objnr = ls_qn-objnr stat = c_nopr TRANSPORTING NO FIELDS.
      IF sy-subrc = 0.
        lv_st = 'in process'.
      ELSE.
        lv_st = 'outstanding'.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'NOTIFICATION' iv_value = ls_qn-qmnum CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TYPE' iv_value = ls_qn-qmart CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'TEXT' iv_value = ls_qn-qmtxt CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'STATUS' iv_value = lv_st CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'CREATED' iv_value = ls_qn-erdat CHANGING ct_rows = rs_result-rows ).
      IF ls_qn-matnr IS NOT INITIAL.
        lv_t = |{ ls_qn-matnr ALPHA = OUT }|.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'MATERIAL' iv_value = lv_t CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_qn-lifnum IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'SUPPLIER' iv_value = ls_qn-lifnum CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_qn-kunum IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'CUSTOMER' iv_value = ls_qn-kunum CHANGING ct_rows = rs_result-rows ).
      ENDIF.
      IF ls_qn-prueflos IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'LOT' iv_value = ls_qn-prueflos CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |{ lv_open } open quality notifications|.
    IF lv_qmart IS NOT INITIAL AND is_params-qmart IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary } of type { lv_qmart }|.
    ENDIF.
    IF lv_werks IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary } in plant { lv_werks }|.
    ENDIF.
    IF rs_result-truncated = abap_true.
      rs_result-summary = |{ rs_result-summary }; first { lv_max } shown|.
    ENDIF.
  ENDMETHOD.


  METHOD notif_get_detail.
    DATA ls_qn TYPE ty_qn.

    load_notif( EXPORTING is_params = is_params IMPORTING es_qn = ls_qn CHANGING cs_result = rs_result ).
    IF ls_qn IS INITIAL.
      RETURN.
    ENDIF.
    notif_rows( EXPORTING is_qn = ls_qn CHANGING cs_result = rs_result ).
    rs_result-summary = |Quality notification { ls_qn-qmnum } ({ ls_qn-qmart }): { stat_text( ls_qn-objnr ) }|.
  ENDMETHOD.


  METHOD plan_get_detail.
    DATA: ls_lot   TYPE ty_lot,
          lv_matnr TYPE matnr,
          lv_werks TYPE werks_d,
          lv_plnnr TYPE plko-plnnr,
          lv_plnal TYPE plko-plnal,
          lv_row   TYPE i,
          lv_t     TYPE string,
          lv_n     TYPE i.
    DATA: BEGIN OF ls_hd,
            plnnr TYPE plko-plnnr,
            plnal TYPE plko-plnal,
            ktext TYPE plko-ktext,
            verwe TYPE plko-verwe,
            statu TYPE plko-statu,
            werks TYPE plko-werks,
            datuv TYPE plko-datuv,
          END OF ls_hd.
    DATA: BEGIN OF ls_op,
            plnkn TYPE plpo-plnkn,
            vornr TYPE plpo-vornr,
            ltxa1 TYPE plpo-ltxa1,
            steus TYPE plpo-steus,
          END OF ls_op,
          lt_op LIKE STANDARD TABLE OF ls_op.
    DATA: BEGIN OF ls_mk,
            mk_kn    TYPE plmk-plnkn,
            merknr   TYPE plmk-merknr,
            kurztext TYPE plmk-kurztext,
            verwmerkm TYPE plmk-verwmerkm,
          END OF ls_mk,
          lt_mk LIKE STANDARD TABLE OF ls_mk.
    DATA: BEGIN OF ls_pl,
            pl_nr TYPE mapl-plnnr,
            pl_al TYPE mapl-plnal,
          END OF ls_pl,
          lt_pl LIKE STANDARD TABLE OF ls_pl.

    IF is_params-prueflos IS NOT INITIAL.
      load_lot( EXPORTING is_params = is_params IMPORTING es_lot = ls_lot CHANGING cs_result = rs_result ).
      IF ls_lot IS INITIAL.
        RETURN.
      ENDIF.
      IF ls_lot-plnty <> 'Q' OR ls_lot-plnnr IS INITIAL.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = |Inspection lot { ls_lot-prueflos } does not use an inspection plan (task list type { ls_lot-plnty })|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_plnnr = ls_lot-plnnr.
      lv_plnal = ls_lot-plnal.
    ELSE.
      IF is_params-matnr IS INITIAL OR is_params-werks IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr and werks are required (or prueflos)' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_matnr = to_matnr( is_params-matnr ).
      check_plant( EXPORTING iv_werks = is_params-werks iv_need = abap_true IMPORTING ev_werks = lv_werks CHANGING cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
      IF rs_result-failed = abap_true.
        RETURN.
      ENDIF.
      SELECT plnnr plnal FROM mapl INTO TABLE lt_pl
        WHERE matnr = lv_matnr AND werks = lv_werks AND plnty = 'Q' AND loekz = space.
      SORT lt_pl BY pl_nr pl_al.
      DELETE ADJACENT DUPLICATES FROM lt_pl COMPARING pl_nr pl_al.
      IF lines( lt_pl ) > 1.
        LOOP AT lt_pl INTO ls_pl.
          lv_t = |{ lv_t } { ls_pl-pl_nr }/{ ls_pl-pl_al }|.
        ENDLOOP.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = |Material { condense( is_params-matnr ) } has { lines( lt_pl ) } inspection plans in plant { lv_werks } ({ condense( lv_t ) }): give prueflos or ask which plan|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      READ TABLE lt_pl INTO ls_pl INDEX 1.
      lv_plnnr = ls_pl-pl_nr.
      lv_plnal = ls_pl-pl_al.
      IF lt_pl IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Material { is_params-matnr } has no inspection plan in plant { lv_werks }|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.

    SELECT plnnr plnal ktext verwe statu werks datuv FROM plko INTO ls_hd UP TO 1 ROWS
      WHERE plnty = 'Q' AND plnnr = lv_plnnr AND plnal = lv_plnal AND loekz = space
      ORDER BY datuv DESCENDING.
    ENDSELECT.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection plan { lv_plnnr }/{ lv_plnal } not found| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    add_kv( EXPORTING iv_row = 1 iv_name = 'PLAN_GROUP' iv_value = ls_hd-plnnr CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'GROUP_COUNTER' iv_value = ls_hd-plnal CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'TEXT' iv_value = ls_hd-ktext CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'PLANT' iv_value = ls_hd-werks CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'USAGE' iv_value = ls_hd-verwe CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'STATUS' iv_value = ls_hd-statu CHANGING ct_rows = rs_result-rows ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'VALID_FROM' iv_value = ls_hd-datuv CHANGING ct_rows = rs_result-rows ).

    SELECT p~plnkn p~vornr p~ltxa1 p~steus FROM plpo AS p INNER JOIN plas AS s
        ON s~plnty = p~plnty AND s~plnnr = p~plnnr AND s~plnkn = p~plnkn
      INTO TABLE lt_op
      WHERE p~plnty = 'Q' AND p~plnnr = lv_plnnr AND s~plnal = lv_plnal AND s~loekz = space AND p~loekz = space.
    SORT lt_op BY vornr.
    DELETE ADJACENT DUPLICATES FROM lt_op COMPARING vornr.
    IF lt_op IS NOT INITIAL.
      SELECT plnkn merknr kurztext verwmerkm FROM plmk INTO TABLE lt_mk
        FOR ALL ENTRIES IN lt_op
        WHERE plnty = 'Q' AND plnnr = lv_plnnr AND plnkn = lt_op-plnkn AND loekz = space.
    ENDIF.
    SORT lt_mk BY mk_kn merknr.
    DELETE ADJACENT DUPLICATES FROM lt_mk COMPARING mk_kn merknr.
    lv_row = 1.
    LOOP AT lt_op INTO ls_op.
      LOOP AT lt_mk INTO ls_mk WHERE mk_kn = ls_op-plnkn.
        lv_row = lv_row + 1.
        lv_n = lv_n + 1.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'OPERATION' iv_value = ls_op-vornr CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'OPERATION_TEXT' iv_value = ls_op-ltxa1 CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'CHARACTERISTIC' iv_value = ls_mk-merknr CHANGING ct_rows = rs_result-rows ).
        add_kv( EXPORTING iv_row = lv_row iv_name = 'CHAR_TEXT' iv_value = ls_mk-kurztext CHANGING ct_rows = rs_result-rows ).
        IF ls_mk-verwmerkm IS NOT INITIAL.
          add_kv( EXPORTING iv_row = lv_row iv_name = 'MASTER_CHARACTERISTIC' iv_value = ls_mk-verwmerkm CHANGING ct_rows = rs_result-rows ).
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    lv_t = ls_hd-ktext.
    rs_result-summary = |Inspection plan { ls_hd-plnnr }/{ ls_hd-plnal } "{ lv_t }": { lines( lt_op ) } operations, { lv_n } characteristics|.
  ENDMETHOD.


  METHOD mat_get_setup.
    DATA: lv_matnr TYPE matnr,
          lv_werks TYPE werks_d,
          lv_row   TYPE i,
          lv_act   TYPE i.
    DATA: BEGIN OF ls_q,
            art       TYPE qmat-art,
            werks     TYPE qmat-werks,
            aktiv     TYPE qmat-aktiv,
            insmk     TYPE qmat-insmk,
            ppl       TYPE qmat-ppl,
            spezueber TYPE qmat-spezueber,
            dyn       TYPE qmat-dyn,
            sproz     TYPE qmat-sproz,
            ave       TYPE qmat-ave,
            apa       TYPE qmat-apa,
          END OF ls_q,
          lt_q LIKE STANDARD TABLE OF ls_q.

    IF is_params-matnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'matnr is required (material)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_matnr = to_matnr( is_params-matnr ).
    SELECT SINGLE matnr FROM mara INTO lv_matnr WHERE matnr = lv_matnr.
    IF sy-subrc <> 0 OR lv_matnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Material { is_params-matnr } does not exist| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    check_plant( EXPORTING iv_werks = is_params-werks iv_need = abap_false IMPORTING ev_werks = lv_werks CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    IF lv_werks IS INITIAL.
      SELECT art werks aktiv insmk ppl spezueber dyn sproz ave apa FROM qmat INTO TABLE lt_q WHERE matnr = lv_matnr.
    ELSE.
      SELECT art werks aktiv insmk ppl spezueber dyn sproz ave apa FROM qmat INTO TABLE lt_q
        WHERE matnr = lv_matnr AND werks = lv_werks.
    ENDIF.
    SORT lt_q BY werks art.
    LOOP AT lt_q INTO ls_q.
      lv_row = lv_row + 1.
      IF ls_q-aktiv IS NOT INITIAL.
        lv_act = lv_act + 1.
      ENDIF.
      add_kv( EXPORTING iv_row = lv_row iv_name = 'PLANT' iv_value = ls_q-werks CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'INSPECTION_TYPE' iv_value = ls_q-art CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'ACTIVE' iv_value = ls_q-aktiv CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'POST_TO_INSPECTION_STOCK' iv_value = ls_q-insmk CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WITH_TASK_LIST' iv_value = ls_q-ppl CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'WITH_MATERIAL_SPEC' iv_value = ls_q-spezueber CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'SKIPS_ALLOWED' iv_value = ls_q-dyn CHANGING ct_rows = rs_result-rows ).
      add_kv( EXPORTING iv_row = lv_row iv_name = 'AUTOMATIC_UD' iv_value = ls_q-ave CHANGING ct_rows = rs_result-rows ).
      IF ls_q-sproz IS NOT INITIAL.
        add_kv( EXPORTING iv_row = lv_row iv_name = 'INSPECTION_PERCENT' iv_value = ls_q-sproz CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    rs_result-summary = |Material { condense( is_params-matnr ) }: { lines( lt_q ) } inspection setups, { lv_act } active|.
    IF lv_werks IS NOT INITIAL.
      rs_result-summary = |{ rs_result-summary } in plant { lv_werks }|.
    ENDIF.
  ENDMETHOD.


  METHOD result_record.
    DATA: ls_lot    TYPE ty_lot,
          lt_in     TYPE ty_inress,
          ls_in     TYPE ty_inres,
          lt_chr    TYPE ty_chrs,
          ls_chr    TYPE ty_chr,
          lt_res    TYPE ty_ress,
          ls_res    TYPE ty_res,
          lv_vornr  TYPE vornr,
          lv_op     TYPE vornr,
          lv_aplzl  TYPE qamv-vorglfnr,
          lt_ops    TYPE STANDARD TABLE OF vornr,
          lv_f      TYPE f,
          lv_ok     TYPE abap_bool,
          lv_err    TYPE abap_bool,
          lt_cr     TYPE STANDARD TABLE OF bapi2045d2,
          ls_cr     TYPE bapi2045d2,
          ls_ret    TYPE bapiret2,
          lt_ret    TYPE bapiret2_t,
          lv_bew    TYPE qpac-bewertung,
          lv_grp    TYPE qpac-codegruppe,
          lv_t      TYPE string,
          lv_old    TYPE string,
          lv_n      TYPE i,
          lv_lotc   TYPE bapi2045l2-insplot,
          lv_opc    TYPE bapi2045l2-inspoper.

    load_lot( EXPORTING is_params = is_params IMPORTING es_lot = ls_lot CHANGING cs_result = rs_result ).
    IF ls_lot IS INITIAL.
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_lot-objnr iv_stat = c_ud ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection lot { ls_lot-prueflos } already has a usage decision: results cannot be recorded|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_lot-objnr iv_stat = c_ltca ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection lot { ls_lot-prueflos } is cancelled| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-lines IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lines is required: one row per characteristic, merknr=<no>;value=<number> or merknr=<no>;code=<code>'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    parse_results( EXPORTING it_lines = is_params-lines IMPORTING et_in = lt_in CHANGING cs_result = rs_result ).
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.
    read_chars( EXPORTING is_lot = ls_lot IMPORTING et_chr = lt_chr et_res = lt_res ).
    IF lt_chr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection lot { ls_lot-prueflos } has no inspection characteristics| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    " operation: given or the only one with characteristics
    LOOP AT lt_chr INTO ls_chr.
      lv_op = oper_of( iv_aufpl = ls_lot-aufpl iv_vorglfnr = ls_chr-vorglfnr ).
      COLLECT lv_op INTO lt_ops.
    ENDLOOP.
    IF is_params-vornr IS NOT INITIAL.
      lv_vornr = condense( is_params-vornr ).
      CALL FUNCTION 'CONVERSION_EXIT_NUMCV_INPUT'
        EXPORTING
          input  = lv_vornr
        IMPORTING
          output = lv_vornr.
      READ TABLE lt_ops WITH KEY table_line = lv_vornr TRANSPORTING NO FIELDS.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Operation { is_params-vornr } has no characteristics in lot { ls_lot-prueflos }|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ELSEIF lines( lt_ops ) = 1.
      READ TABLE lt_ops INTO lv_vornr INDEX 1.
    ELSE.
      add_msg( EXPORTING iv_type = 'E' iv_text = |vornr is required: lot { ls_lot-prueflos } has { lines( lt_ops ) } operations with characteristics|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE aplzl FROM afvc INTO lv_aplzl WHERE aufpl = ls_lot-aufpl AND vornr = lv_vornr.

    LOOP AT lt_in INTO ls_in.
      READ TABLE lt_chr INTO ls_chr WITH KEY vorglfnr = lv_aplzl merknr = ls_in-merknr.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Characteristic { ls_in-merknr } does not exist in operation { lv_vornr } of lot { ls_lot-prueflos }|
                 CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      READ TABLE lt_res INTO ls_res WITH KEY vorglfnr = lv_aplzl merknr = ls_in-merknr BINARY SEARCH.
      IF sy-subrc = 0 AND ls_res-mbewertg IS NOT INITIAL.
        add_msg( EXPORTING iv_type = 'E'
                           iv_text = |Characteristic { ls_in-merknr } is already valuated ({ ls_res-mbewertg }): change it in the results recording (QE12)|
                 CHANGING cs_result = rs_result ).
        CONTINUE.
      ENDIF.
      CLEAR ls_cr.
      ls_cr-inspchar = ls_in-merknr.
      ls_cr-closed = 'X'.
      IF ls_chr-steuerkz(1) = 'X'.
        " quantitative
        IF ls_in-value IS INITIAL.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Characteristic { ls_in-merknr } ({ ls_chr-kurztext }) is quantitative: give value=<number>|
                   CHANGING cs_result = rs_result ).
          CONTINUE.
        ENDIF.
        to_num( EXPORTING iv_text = ls_in-value IMPORTING ev_num = lv_f ev_ok = lv_ok ).
        IF lv_ok = abap_false.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Characteristic { ls_in-merknr }: value { ls_in-value } is not a number|
                   CHANGING cs_result = rs_result ).
          CONTINUE.
        ENDIF.
        ls_cr-mean_value = ls_in-value.
        REPLACE ALL OCCURRENCES OF ',' IN ls_cr-mean_value WITH '.'.
        ls_cr-original_input = ls_cr-mean_value.
        lv_t = ls_in-value.
        IF ls_chr-tolunni IS NOT INITIAL AND lv_f < ls_chr-toleranzun.
          add_msg( EXPORTING iv_type = 'W'
                             iv_text = |Characteristic { ls_in-merknr }: { ls_in-value } is below the lower limit { fmt_num( ls_chr-toleranzun ) } (will be rejected)|
                   CHANGING cs_result = rs_result ).
        ELSEIF ls_chr-tolobni IS NOT INITIAL AND lv_f > ls_chr-toleranzob.
          add_msg( EXPORTING iv_type = 'W'
                             iv_text = |Characteristic { ls_in-merknr }: { ls_in-value } is above the upper limit { fmt_num( ls_chr-toleranzob ) } (will be rejected)|
                   CHANGING cs_result = rs_result ).
        ENDIF.
      ELSE.
        " qualitative
        IF ls_in-value IS NOT INITIAL.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Characteristic { ls_in-merknr } ({ ls_chr-kurztext }) is qualitative: give code=<code>|
                   CHANGING cs_result = rs_result ).
          CONTINUE.
        ENDIF.
        IF ls_in-code IS NOT INITIAL.
          IF ls_chr-auswmenge1 IS INITIAL.
            add_msg( EXPORTING iv_type = 'E' iv_text = |Characteristic { ls_in-merknr } has no code catalog: give valuation=A or R|
                     CHANGING cs_result = rs_result ).
            CONTINUE.
          ENDIF.
          CLEAR: lv_bew, lv_grp.
          IF ls_in-grp IS NOT INITIAL.
            SELECT SINGLE codegruppe bewertung FROM qpac INTO (lv_grp, lv_bew)
              WHERE werks = ls_chr-auswmgwrk1 AND katalogart = ls_chr-katalgart1 AND auswahlmge = ls_chr-auswmenge1
                AND codegruppe = ls_in-grp AND code = ls_in-code.
          ELSE.
            SELECT codegruppe bewertung FROM qpac INTO (lv_grp, lv_bew) UP TO 1 ROWS
              WHERE werks = ls_chr-auswmgwrk1 AND katalogart = ls_chr-katalgart1 AND auswahlmge = ls_chr-auswmenge1
                AND code = ls_in-code.
            ENDSELECT.
          ENDIF.
          IF sy-subrc <> 0.
            add_msg( EXPORTING iv_type = 'E' iv_text = |Code { ls_in-code } is not in selected set { ls_chr-auswmenge1 } of characteristic { ls_in-merknr }|
                     CHANGING cs_result = rs_result ).
            CONTINUE.
          ENDIF.
          ls_cr-code1 = ls_in-code.
          ls_cr-code_grp1 = lv_grp.
          lv_t = |{ lv_grp }/{ ls_in-code }|.
          IF lv_bew = 'R'.
            add_msg( EXPORTING iv_type = 'W' iv_text = |Characteristic { ls_in-merknr }: code { ls_in-code } means rejected|
                     CHANGING cs_result = rs_result ).
          ENDIF.
        ELSE.
          ls_cr-evaluated = 'X'.
          ls_cr-evaluation = ls_in-val.
          lv_t = |valuation { ls_in-val }|.
        ENDIF.
      ENDIF.
      APPEND ls_cr TO lt_cr.
      lv_old = 'open'.
      lv_n = lv_n + 1.
      add_chg( EXPORTING iv_field = |CHAR_{ ls_in-merknr }_{ ls_chr-kurztext }| iv_old = lv_old iv_new = lv_t CHANGING cs_result = rs_result ).
    ENDLOOP.
    finish( CHANGING cs_result = rs_result ).
    IF rs_result-failed = abap_true.
      RETURN.
    ENDIF.

    lv_lotc = ls_lot-prueflos.
    lv_opc = lv_vornr.
    CALL FUNCTION 'BAPI_INSPOPER_RECORDRESULTS'
      EXPORTING
        insplot      = lv_lotc
        inspoper     = lv_opc
      IMPORTING
        return       = ls_ret
      TABLES
        char_results = lt_cr
        returntable  = lt_ret.
    IF ls_ret IS NOT INITIAL.
      APPEND ls_ret TO lt_ret.
    ENDIF.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true OR iv_execute = abap_false.
      rollback( ).
      IF lv_err = abap_false.
        rs_result-summary = |Preview (BAPI checked and rolled back): { lv_n } results would be recorded for lot { ls_lot-prueflos }, | &&
                            |operation { lv_vornr }. Nothing was changed.|.
      ENDIF.
      RETURN.
    ENDIF.
    commit_wait( ).

    " read back
    CLEAR rs_result-rows.
    DO 5 TIMES.
      read_chars( EXPORTING is_lot = ls_lot IMPORTING et_chr = lt_chr et_res = lt_res ).
      lv_n = 0.
      LOOP AT lt_in INTO ls_in.
        READ TABLE lt_res INTO ls_res WITH KEY vorglfnr = lv_aplzl merknr = ls_in-merknr BINARY SEARCH.
        IF sy-subrc = 0 AND ( ls_res-mbewertg IS NOT INITIAL OR ls_res-code1 IS NOT INITIAL OR ls_res-anzwertg IS NOT INITIAL ).
          lv_n = lv_n + 1.
        ENDIF.
      ENDLOOP.
      IF lv_n = lines( lt_in ).
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    LOOP AT lt_in INTO ls_in.
      READ TABLE lt_res INTO ls_res WITH KEY vorglfnr = lv_aplzl merknr = ls_in-merknr BINARY SEARCH.
      add_kv( EXPORTING iv_row = sy-tabix iv_name = 'CHARACTERISTIC' iv_value = ls_in-merknr CHANGING ct_rows = rs_result-rows ).
      IF sy-subrc = 0.
        add_kv( EXPORTING iv_row = sy-tabix iv_name = 'VALUATION' iv_value = ls_res-mbewertg CHANGING ct_rows = rs_result-rows ).
      ENDIF.
    ENDLOOP.
    IF lv_n <> lines( lt_in ).
      add_msg( EXPORTING iv_type = 'W' iv_text = |Only { lv_n } of { lines( lt_in ) } results are in QAMR yet: the update may still be running|
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |{ lv_n } results recorded for lot { ls_lot-prueflos }, operation { lv_vornr }|.
  ENDMETHOD.


  METHOD ud_set.
    DATA: ls_lot    TYPE ty_lot,
          lv_set    TYPE qvmenge,
          lv_code   TYPE qvcode,
          lv_grp    TYPE qvgruppe,
          lv_bew    TYPE qpac-bewertung,
          lv_n      TYPE i,
          lv_post   TYPE string,
          lv_force  TYPE string,
          lt_chr    TYPE ty_chrs,
          ls_chr    TYPE ty_chr,
          lt_res    TYPE ty_ress,
          ls_res    TYPE ty_res,
          lv_open   TYPE i,
          lv_qty    TYPE string,
          lv_target TYPE string,
          lv_ctext  TYPE string,
          ls_ud     TYPE bapi2045ud,
          ls_udr    TYPE bapi2045ud_return,
          ls_stk    TYPE bapi2045d_il2,
          ls_ret1   TYPE bapireturn1,
          lt_ret    TYPE bapiret2_t,
          ls_ret    TYPE bapiret2,
          lv_err    TYPE abap_bool,
          ls_new    TYPE ty_lot,
          lv_found  TYPE abap_bool,
          lv_ok     TYPE abap_bool,
          lv_t      TYPE string,
          lv_udlot  TYPE bapi2045ud-insplot.

    load_lot( EXPORTING is_params = is_params IMPORTING es_lot = ls_lot CHANGING cs_result = rs_result ).
    IF ls_lot IS INITIAL.
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_lot-objnr iv_stat = c_ud ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection lot { ls_lot-prueflos } already has a usage decision (change it in QA12)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_lot-objnr iv_stat = c_ltca ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Inspection lot { ls_lot-prueflos } is cancelled| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_code = condense( is_params-ud_code ).
    TRANSLATE lv_code TO UPPER CASE.
    IF lv_code IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'ud_code is required (usage decision code, see QM.UD.GET)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_post = condense( is_params-stock_posting ).
    TRANSLATE lv_post TO LOWER CASE.
    IF lv_post <> 'auto' AND lv_post <> 'none'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = 'stock_posting is required: auto (post the inspection stock as proposed by the code) or none (decision only)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_force = condense( is_params-force_close ).
    TRANSLATE lv_force TO LOWER CASE.
    IF lv_force IS NOT INITIAL AND lv_force <> 'true' AND lv_force <> 'false'.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'force_close must be true or false' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-ud_set IS NOT INITIAL.
      lv_set = condense( is_params-ud_set ).
      TRANSLATE lv_set TO UPPER CASE.
    ELSE.
      lv_set = ud_set_default( ls_lot ).
    ENDIF.
    IF lv_set IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = |ud_set is required: inspection type { ls_lot-art } has no default selected set|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-ud_code_group IS NOT INITIAL.
      lv_grp = condense( is_params-ud_code_group ).
      TRANSLATE lv_grp TO UPPER CASE.
      SELECT SINGLE bewertung FROM qpac INTO lv_bew
        WHERE werks = ls_lot-werk AND katalogart = '3' AND auswahlmge = lv_set AND codegruppe = lv_grp AND code = lv_code.
    ELSE.
      SELECT COUNT(*) FROM qpac INTO lv_n
        WHERE werks = ls_lot-werk AND katalogart = '3' AND auswahlmge = lv_set AND code = lv_code.
      IF lv_n > 1.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Code { lv_code } is in several code groups of set { lv_set }: give ud_code_group|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      SELECT codegruppe bewertung FROM qpac INTO (lv_grp, lv_bew) UP TO 1 ROWS
        WHERE werks = ls_lot-werk AND katalogart = '3' AND auswahlmge = lv_set AND code = lv_code.
      ENDSELECT.
    ENDIF.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Code { lv_code } is not in usage decision set { lv_set } of plant { ls_lot-werk } (see QM.UD.GET)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_ctext = code_text( iv_katart = '3' iv_grp = lv_grp iv_code = lv_code ).
    " open characteristics
    read_chars( EXPORTING is_lot = ls_lot IMPORTING et_chr = lt_chr et_res = lt_res ).
    LOOP AT lt_chr INTO ls_chr.
      READ TABLE lt_res INTO ls_res WITH KEY vorglfnr = ls_chr-vorglfnr merknr = ls_chr-merknr BINARY SEARCH.
      IF sy-subrc <> 0 OR ls_res-mbewertg IS INITIAL.
        lv_open = lv_open + 1.
      ENDIF.
    ENDLOOP.
    IF lv_open > 0 AND lv_force <> 'true'.
      add_msg( EXPORTING iv_type = 'E'
                         iv_text = |{ lv_open } characteristics of lot { ls_lot-prueflos } have no results: record them first (QM.RESULT.RECORD) or set force_close=true to close them without results|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_open > 0.
      add_msg( EXPORTING iv_type = 'W' iv_text = |{ lv_open } characteristics without results will be closed (force_close)|
               CHANGING cs_result = rs_result ).
    ENDIF.

    " stock effect
    lv_qty = |{ fmt_qty( ls_lot-lmengezub ) } { ls_lot-mengeneinh }|.
    IF lv_post = 'none' OR ls_lot-lmengezub IS INITIAL.
      lv_target = 'no stock posting'.
      IF ls_lot-lmengezub IS NOT INITIAL.
        add_msg( EXPORTING iv_type = 'W' iv_text = |{ lv_qty } stay in quality inspection stock: post them later in QA12 / QAC2|
                 CHANGING cs_result = rs_result ).
      ENDIF.
    ELSEIF lv_bew = 'A'.
      lv_target = |{ lv_qty } from quality inspection to unrestricted-use stock (proposal of an accepted code)|.
    ELSE.
      lv_target = |{ lv_qty } from quality inspection stock as proposed by the rejected code (usually blocked stock)|.
    ENDIF.
    add_chg( EXPORTING iv_field = 'USAGE_DECISION' iv_old = '' iv_new = |{ lv_grp }/{ lv_code } { lv_ctext } ({ lv_bew })| CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'STOCK_POSTING' iv_old = lv_qty iv_new = lv_target CHANGING cs_result = rs_result ).
    " authorization: usage decision code (fail closed)
    AUTHORITY-CHECK OBJECT 'Q_UD_CODE'
      ID 'WERKS' FIELD ls_lot-werk
      ID 'QVEART' FIELD ls_lot-art
      ID 'QVAUSWHLMG' FIELD lv_set
      ID 'QVCODEGRP' FIELD lv_grp
      ID 'QVCODE' FIELD lv_code.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization for usage decision code { lv_grp }/{ lv_code } in plant { ls_lot-werk } (Q_UD_CODE)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lot_rows( EXPORTING is_lot = ls_lot iv_row = 1 CHANGING cs_result = rs_result ).
    rs_result-irreversible = abap_true.
    add_msg( EXPORTING iv_type = 'W'
                       iv_text = 'A usage decision with stock posting cannot be undone here: the code can be changed in QA12, the stock only by a transfer posting'
             CHANGING cs_result = rs_result ).

    IF iv_execute = abap_false.
      rs_result-summary = |Preview (no BAPI test mode, checks of the handler): lot { ls_lot-prueflos } would get usage decision | &&
                          |{ lv_grp }/{ lv_code } ({ lv_bew }); { lv_target }. Nothing was changed.|.
      RETURN.
    ENDIF.

    lv_udlot = ls_lot-prueflos.
    ls_ud-insplot = lv_udlot.
    ls_ud-ud_selected_set = lv_set.
    ls_ud-ud_plant = ls_lot-werk.
    ls_ud-ud_code_group = lv_grp.
    ls_ud-ud_code = lv_code.
    ls_ud-ud_recorded_by_user = sy-uname.
    ls_ud-ud_recorded_on_date = sy-datum.
    ls_ud-ud_recorded_at_time = sy-uzeit.
    IF lv_post = 'auto'.
      ls_ud-ud_stock_posting = 'X'.
    ENDIF.
    IF lv_force = 'true'.
      ls_ud-ud_force_completion = 'X'.
    ENDIF.
    CALL FUNCTION 'BAPI_INSPLOT_SETUSAGEDECISION'
      EXPORTING
        number         = lv_udlot
        ud_data        = ls_ud
      IMPORTING
        ud_return_data = ls_udr
        stock_data     = ls_stk
        return         = ls_ret1.
    IF ls_ret1 IS NOT INITIAL.
      CLEAR ls_ret.
      ls_ret-type = ls_ret1-type.
      ls_ret-id = ls_ret1-id.
      ls_ret-number = ls_ret1-number.
      ls_ret-message = ls_ret1-message.
      ls_ret-message_v1 = ls_ret1-message_v1.
      ls_ret-message_v2 = ls_ret1-message_v2.
      ls_ret-message_v3 = ls_ret1-message_v3.
      ls_ret-message_v4 = ls_ret1-message_v4.
      APPEND ls_ret TO lt_ret.
    ENDIF.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true OR ls_ret1-type <> 'S'.
      rollback( ).
      IF lv_err = abap_false.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_INSPLOT_SETUSAGEDECISION did not confirm the decision' CHANGING cs_result = rs_result ).
      ENDIF.
      RETURN.
    ENDIF.
    commit_wait( ).

    " read back
    lv_ok = wait_stat( iv_objnr = ls_lot-objnr iv_stat = c_ud ).
    IF lv_post = 'auto' AND ls_lot-lmengezub IS NOT INITIAL.
      lv_ok = wait_stat( iv_objnr = ls_lot-objnr iv_stat = c_spco ).
    ENDIF.
    read_lot( EXPORTING iv_lot = ls_lot-prueflos IMPORTING es_lot = ls_new ev_found = lv_found ).
    CLEAR: rs_result-rows, rs_result-changes.
    lot_rows( EXPORTING is_lot = ls_new iv_row = 1 CHANGING cs_result = rs_result ).
    add_kv( EXPORTING iv_row = 1 iv_name = 'SYSTEM_STATUS' iv_value = stat_text( ls_new-objnr ) CHANGING ct_rows = rs_result-rows ).
    add_chg( EXPORTING iv_field = 'USAGE_DECISION' iv_old = '' iv_new = |{ lv_grp }/{ lv_code } ({ lv_bew })| CHANGING cs_result = rs_result ).
    lv_t = |{ fmt_qty( ls_new-lmengezub ) } { ls_new-mengeneinh }|.
    add_chg( EXPORTING iv_field = 'TO_BE_POSTED' iv_old = lv_qty iv_new = lv_t CHANGING cs_result = rs_result ).
    IF ls_new-lmenge01 <> ls_lot-lmenge01.
      add_chg( EXPORTING iv_field = 'POSTED_UNRESTRICTED' iv_old = fmt_qty( ls_lot-lmenge01 ) iv_new = fmt_qty( ls_new-lmenge01 ) CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_new-lmenge04 <> ls_lot-lmenge04.
      add_chg( EXPORTING iv_field = 'POSTED_BLOCKED' iv_old = fmt_qty( ls_lot-lmenge04 ) iv_new = fmt_qty( ls_new-lmenge04 ) CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_new-lmenge02 <> ls_lot-lmenge02.
      add_chg( EXPORTING iv_field = 'POSTED_SCRAP' iv_old = fmt_qty( ls_lot-lmenge02 ) iv_new = fmt_qty( ls_new-lmenge02 ) CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_new-lmenge07 <> ls_lot-lmenge07.
      add_chg( EXPORTING iv_field = 'RETURNED_TO_SUPPLIER' iv_old = fmt_qty( ls_lot-lmenge07 ) iv_new = fmt_qty( ls_new-lmenge07 ) CHANGING cs_result = rs_result ).
    ENDIF.
    IF has_stat( iv_objnr = ls_lot-objnr iv_stat = c_ud ) = abap_false.
      add_msg( EXPORTING iv_type = 'W' iv_text = 'The usage decision status is not set yet: the update may still be running (SM13)'
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |Usage decision { lv_grp }/{ lv_code } ({ lv_bew }) made for lot { ls_lot-prueflos }; | &&
                        |still to post { fmt_qty( ls_new-lmengezub ) } { ls_new-mengeneinh }|.
  ENDMETHOD.


  METHOD notif_create.
    DATA: lv_qmart  TYPE qmart,
          lv_qmtyp  TYPE tq80-qmtyp,
          lv_artpr  TYPE tq80-artpr,
          lv_text   TYPE string,
          lv_qmtxt  TYPE qmtxt,
          ls_lot    TYPE ty_lot,
          lv_matnr  TYPE matnr,
          lv_werks  TYPE werks_d,
          lv_lifnr  TYPE lifnr,
          lv_kunnr  TYPE kunnr,
          lv_priok  TYPE priok,
          lv_qty    TYPE p LENGTH 13 DECIMALS 3,
          lv_f      TYPE f,
          lv_ok     TYPE abap_bool,
          lv_unit   TYPE meins,
          lv_err    TYPE abap_bool,
          ls_hdr    TYPE bapi2078_nothdri,
          ls_exp    TYPE bapi2078_nothdre,
          ls_exp2   TYPE bapi2078_nothdre,
          lt_ret    TYPE bapiret2_t,
          ls_qn     TYPE ty_qn,
          lv_found  TYPE abap_bool,
          lv_m      TYPE string,
          lv_tcd    TYPE tcode.

    lv_qmart = condense( is_params-qmart ).
    TRANSLATE lv_qmart TO UPPER CASE.
    IF lv_qmart IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'qmart is required (quality notification type, e.g. Q1 customer, Q2 supplier, Q3 internal)'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    SELECT SINGLE qmtyp artpr FROM tq80 INTO (lv_qmtyp, lv_artpr) WHERE qmart = lv_qmart.
    IF sy-subrc <> 0 OR lv_qmtyp <> '02'.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification type { is_params-qmart } is not a quality notification type|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_text = condense( is_params-text ).
    IF lv_text IS INITIAL OR strlen( lv_text ) > 40.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'text is required (short text, up to 40 characters)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_qmtxt = lv_text.

    " reference data: from the inspection lot, then from the parameters
    IF is_params-prueflos IS NOT INITIAL.
      load_lot( EXPORTING is_params = is_params IMPORTING es_lot = ls_lot CHANGING cs_result = rs_result ).
      IF ls_lot IS INITIAL.
        RETURN.
      ENDIF.
      lv_matnr = ls_lot-matnr.
      lv_werks = ls_lot-werk.
      lv_lifnr = ls_lot-lifnr.
      lv_kunnr = ls_lot-kunnr.
    ENDIF.
    IF is_params-matnr IS NOT INITIAL.
      lv_matnr = to_matnr( is_params-matnr ).
      SELECT SINGLE matnr FROM mara INTO lv_matnr WHERE matnr = lv_matnr.
      IF sy-subrc <> 0 OR lv_matnr IS INITIAL.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Material { is_params-matnr } does not exist| CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF strlen( lv_matnr ) > 18.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'Materials longer than 18 characters are not supported by this action' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-werks IS NOT INITIAL.
      check_plant( EXPORTING iv_werks = is_params-werks iv_need = abap_true IMPORTING ev_werks = lv_werks CHANGING cs_result = rs_result ).
      finish( CHANGING cs_result = rs_result ).
      IF rs_result-failed = abap_true.
        RETURN.
      ENDIF.
    ENDIF.
    IF lv_werks IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'werks is required (plant of the material), or give prueflos' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_matnr IS NOT INITIAL.
      SELECT SINGLE werks FROM marc INTO lv_werks WHERE matnr = lv_matnr AND werks = lv_werks.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Material { condense( is_params-matnr ) } is not maintained in plant { lv_werks }|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    IF is_params-lifnr IS NOT INITIAL.
      lv_lifnr = to_lifnr( is_params-lifnr ).
    ENDIF.
    IF is_params-kunnr IS NOT INITIAL.
      lv_kunnr = to_kunnr( is_params-kunnr ).
    ENDIF.
    " the notification origin decides the partner: Q1 customer, Q2 supplier
    IF lv_qmart = 'Q2' AND lv_lifnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'lifnr is required for a complaint against a supplier (Q2), or give prueflos of a goods receipt lot'
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF lv_qmart = 'Q1' AND lv_kunnr IS INITIAL.
      add_msg( EXPORTING iv_type = 'E' iv_text = 'kunnr is required for a customer complaint (Q1)' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF is_params-quantity IS NOT INITIAL.
      to_num( EXPORTING iv_text = is_params-quantity IMPORTING ev_num = lv_f ev_ok = lv_ok ).
      IF lv_ok = abap_false OR lv_f <= 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = 'quantity must be a positive number' CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
      lv_qty = lv_f.
      IF is_params-unit IS NOT INITIAL.
        lv_m = condense( is_params-unit ).
        TRANSLATE lv_m TO UPPER CASE.
        CALL FUNCTION 'CONVERSION_EXIT_CUNIT_INPUT'
          EXPORTING
            input          = lv_m
          IMPORTING
            output         = lv_unit
          EXCEPTIONS
            unit_not_found = 1
            OTHERS         = 2.
        IF sy-subrc <> 0.
          add_msg( EXPORTING iv_type = 'E' iv_text = |Unit { is_params-unit } does not exist| CHANGING cs_result = rs_result ).
          RETURN.
        ENDIF.
      ELSEIF ls_lot IS NOT INITIAL.
        lv_unit = ls_lot-mengeneinh.
      ELSEIF lv_matnr IS NOT INITIAL.
        SELECT SINGLE meins FROM mara INTO lv_unit WHERE matnr = lv_matnr.
      ENDIF.
    ENDIF.
    IF is_params-priok IS NOT INITIAL.
      lv_priok = condense( is_params-priok ).
      SELECT SINGLE priok FROM t356 INTO lv_priok WHERE artpr = lv_artpr AND priok = lv_priok.
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_type = 'E' iv_text = |Priority { is_params-priok } is not defined for priority type { lv_artpr } (T356)|
                 CHANGING cs_result = rs_result ).
        RETURN.
      ENDIF.
    ENDIF.
    lv_tcd = 'QM01'.
    AUTHORITY-CHECK OBJECT 'Q_QMEL' ID 'QMART' FIELD lv_qmart ID 'TCD' FIELD lv_tcd ID 'WERKS' FIELD lv_werks.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to create quality notifications of type { lv_qmart } in plant { lv_werks } (Q_QMEL)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.

    add_chg( EXPORTING iv_field = 'NOTIFICATION_TYPE' iv_old = '' iv_new = lv_qmart CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'SHORT_TEXT' iv_old = '' iv_new = lv_qmtxt CHANGING cs_result = rs_result ).
    add_chg( EXPORTING iv_field = 'PLANT' iv_old = '' iv_new = lv_werks CHANGING cs_result = rs_result ).
    IF lv_matnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'MATERIAL' iv_old = '' iv_new = lv_matnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_lifnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'SUPPLIER' iv_old = '' iv_new = lv_lifnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_kunnr IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'CUSTOMER' iv_old = '' iv_new = lv_kunnr CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_lot IS NOT INITIAL AND ls_lot-ebeln IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'PURCHASE_ORDER' iv_old = '' iv_new = |{ ls_lot-ebeln }/{ ls_lot-ebelp }| CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_qty IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'COMPLAINT_QUANTITY' iv_old = '' iv_new = |{ fmt_qty( lv_qty ) } { lv_unit }| CHANGING cs_result = rs_result ).
    ENDIF.
    IF lv_priok IS NOT INITIAL.
      add_chg( EXPORTING iv_field = 'PRIORITY' iv_old = '' iv_new = lv_priok CHANGING cs_result = rs_result ).
    ENDIF.
    IF ls_lot IS NOT INITIAL.
      add_msg( EXPORTING iv_type = 'I'
                         iv_text = |Material, plant, supplier, purchase order and material document are taken from lot { ls_lot-prueflos }|
               CHANGING cs_result = rs_result ).
    ENDIF.

    IF iv_execute = abap_false.
      rs_result-summary = |Preview: a { lv_qmart } quality notification "{ lv_qmtxt }" would be created for plant { lv_werks }. | &&
                          |Nothing was changed.|.
      RETURN.
    ENDIF.

    ls_hdr-short_text = lv_qmtxt.
    ls_hdr-priority = lv_priok.
    ls_hdr-material = lv_matnr.
    ls_hdr-material_plant = lv_werks.
    ls_hdr-plant = lv_werks.
    ls_hdr-vend_no = lv_lifnr.
    ls_hdr-cust_no = lv_kunnr.
    IF lv_qty IS NOT INITIAL.
      ls_hdr-quant_complaint = lv_qty.
      ls_hdr-qty_unit = lv_unit.
    ENDIF.
    IF ls_lot IS NOT INITIAL.
      ls_hdr-batch = ls_lot-charg.
      ls_hdr-po_number = ls_lot-ebeln.
      ls_hdr-po_item = ls_lot-ebelp.
      ls_hdr-mat_doc = ls_lot-mblnr.
      ls_hdr-doc_year = ls_lot-mjahr.
      ls_hdr-mat_doc_item = ls_lot-zeile.
    ENDIF.
    CALL FUNCTION 'BAPI_QUALNOT_CREATE'
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
      add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_QUALNOT_CREATE refused the notification' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    CLEAR lt_ret.
    CALL FUNCTION 'BAPI_QUALNOT_SAVE'
      EXPORTING
        number      = ls_exp-notif_no
      IMPORTING
        notifheader = ls_exp2
      TABLES
        return      = lt_ret.
    bapi_msgs( EXPORTING it_return = lt_ret IMPORTING ev_err = lv_err CHANGING cs_result = rs_result ).
    IF lv_err = abap_true OR ls_exp2-notif_no IS INITIAL.
      rollback( ).
      add_msg( EXPORTING iv_type = 'E' iv_text = 'BAPI_QUALNOT_SAVE did not save the notification' CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    commit_wait( ).

    DO 10 TIMES.
      read_notif( EXPORTING iv_qmnum = ls_exp2-notif_no IMPORTING es_qn = ls_qn ev_found = lv_found ).
      IF lv_found = abap_true.
        EXIT.
      ENDIF.
      WAIT UP TO 1 SECONDS.
    ENDDO.
    CLEAR rs_result-rows.
    IF lv_found = abap_false.
      add_msg( EXPORTING iv_type = 'W' iv_text = |Notification { ls_exp2-notif_no } is not in QMEL yet: the update may still be running (SM13)|
               CHANGING cs_result = rs_result ).
      rs_result-summary = |Quality notification { ls_exp2-notif_no } saved (read-back pending)|.
      RETURN.
    ENDIF.
    notif_rows( EXPORTING is_qn = ls_qn CHANGING cs_result = rs_result ).
    rs_result-summary = |Quality notification { ls_qn-qmnum } created ({ ls_qn-qmart }, plant { lv_werks }): status | &&
                        |{ stat_text( ls_qn-objnr ) }|.
  ENDMETHOD.


  METHOD notif_status.
    DATA: lv_err    TYPE abap_bool,
          ls_qn     TYPE ty_qn,
          lv_tcd    TYPE tcode,
          lv_test   TYPE bapi20783t-status_ind,
          lv_sys    TYPE bapi2078_notadt-systatus,
          lv_usr    TYPE bapi2078_notadt-usrstatus,
          ls_st     TYPE bapi2078_notsti,
          lt_ret    TYPE bapiret2_t,
          lv_old    TYPE string,
          lv_target TYPE j_status,
          lv_name   TYPE string,
          lv_ok     TYPE abap_bool,
          lv_key    TYPE qmnum.

    load_notif( EXPORTING is_params = is_params IMPORTING es_qn = ls_qn CHANGING cs_result = rs_result ).
    IF ls_qn IS INITIAL.
      RETURN.
    ENDIF.
    IF iv_complete = abap_true.
      lv_target = c_noco.
      lv_name = 'completed (NOCO)'.
    ELSE.
      lv_target = c_nopr.
      lv_name = 'in process (NOPR)'.
    ENDIF.
    IF has_stat( iv_objnr = ls_qn-objnr iv_stat = c_dlfl ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { ls_qn-qmnum } is flagged for deletion| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF has_stat( iv_objnr = ls_qn-objnr iv_stat = c_noco ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { ls_qn-qmnum } is already completed (NOCO)| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    IF iv_complete = abap_false AND has_stat( iv_objnr = ls_qn-objnr iv_stat = c_nopr ) = abap_true.
      add_msg( EXPORTING iv_type = 'E' iv_text = |Notification { ls_qn-qmnum } is already in process (NOPR)| CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_tcd = 'QM02'.
    AUTHORITY-CHECK OBJECT 'Q_QMEL' ID 'QMART' FIELD ls_qn-qmart ID 'TCD' FIELD lv_tcd ID 'WERKS' FIELD ls_qn-mawerk.
    IF sy-subrc <> 0.
      add_msg( EXPORTING iv_type = 'E' iv_text = |No authorization to change quality notifications of type { ls_qn-qmart } (Q_QMEL)|
               CHANGING cs_result = rs_result ).
      RETURN.
    ENDIF.
    lv_old = stat_text( ls_qn-objnr ).
    notif_rows( EXPORTING is_qn = ls_qn CHANGING cs_result = rs_result ).

    IF iv_execute = abap_false.
      lv_test = 'X'.
    ENDIF.
    IF iv_complete = abap_true.
      ls_st-langu   = sy-langu.
      ls_st-refdate = sy-datum.
      ls_st-reftime = sy-uzeit.
      CALL FUNCTION 'BAPI_QUALNOT_COMPLSTAT'
        EXPORTING
          number       = ls_qn-qmnum
          syststat     = ls_st
          testrun      = lv_test
        IMPORTING
          systemstatus = lv_sys
          userstatus   = lv_usr
        TABLES
          return       = lt_ret.
    ELSE.
      CALL FUNCTION 'BAPI_QUALNOT_RELSTAT'
        EXPORTING
          number       = ls_qn-qmnum
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
                         iv_text = 'A completed notification can be put back in process only in QM02: it cannot be undone here'
               CHANGING cs_result = rs_result ).
    ENDIF.
    IF iv_execute = abap_false.
      rollback( ).
      rs_result-summary = |Preview (BAPI test run): quality notification { ls_qn-qmnum } would be { lv_name }. Nothing was changed.|.
      RETURN.
    ENDIF.
    commit_wait( ).
    lv_ok = wait_stat( iv_objnr = ls_qn-objnr iv_stat = lv_target ).
    CLEAR rs_result-rows.
    lv_key = ls_qn-qmnum.
    read_notif( EXPORTING iv_qmnum = lv_key IMPORTING es_qn = ls_qn ).
    notif_rows( EXPORTING is_qn = ls_qn CHANGING cs_result = rs_result ).
    IF lv_ok = abap_false.
      add_msg( EXPORTING iv_type = 'W' iv_text = |Status { lv_name } is not set yet: the update may still be running (SM13)|
               CHANGING cs_result = rs_result ).
    ENDIF.
    rs_result-summary = |Quality notification { ls_qn-qmnum } is { lv_name }: { stat_text( ls_qn-objnr ) }|.
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
