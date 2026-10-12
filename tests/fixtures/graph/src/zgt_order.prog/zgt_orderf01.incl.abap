*----------------------------------------------------------------------*
* FORM main — calls, submits, starts, traps, dynamic calls
*----------------------------------------------------------------------*
FORM main.
  DATA: lv_fm   TYPE rs38l_fnam,
        lv_prog TYPE progname,
        lv_tab  TYPE tabname.

* CALL FUNCTION 'Z_GT_COMMENTED_OUT'.
  CALL FUNCTION 'Z_GT_READ_ORDER'       " CALL FUNCTION 'Z_GT_IN_COMMENT'
    EXPORTING
      iv_text = 'SELECT * FROM zgt_fake WHERE x = 1. CALL FUNCTION ''Z_GT_IN_STRING'''
    TABLES
      et_item = gt_item.

  CALL FUNCTION 'BAPI_GT_ORDER_CREATE' DESTINATION 'NONE'.
  CALL FUNCTION 'Z_GT_POST_ORDER' IN UPDATE TASK
    EXPORTING
      is_head = gs_head.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.

  PERFORM log_it IN PROGRAM zgt_forms IF FOUND.
  PERFORM other(zgt_forms2).
  PERFORM local_only.

  SUBMIT zgt_reader AND RETURN.
  SUBMIT zgt_report VIA SELECTION-SCREEN.
  CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
  LEAVE TO TRANSACTION 'ZGT1'.

  DATA(lv_msg) = |Do not SUBMIT zgt_tpl or CALL TRANSACTION 'ZFAKE' { lv_prog }|.
  lv_prog = `SUBMIT zgt_backtick`.

  " dynamic calls
  CALL FUNCTION lv_fm.
  CALL FUNCTION gc_fm.
  SUBMIT (lv_prog) AND RETURN.
  SUBMIT (gc_prog).
  CALL TRANSACTION lv_prog.
  SELECT * FROM (lv_tab) INTO TABLE @DATA(lt_dyn).
  PERFORM x IN PROGRAM (lv_prog).

  PERFORM: a1 IN PROGRAM zgt_chain1,
           a2 IN PROGRAM zgt_chain2.
ENDFORM.

*----------------------------------------------------------------------*
* FORM sql — reads (new Open SQL, joins, subquery, FAE) and writes
*----------------------------------------------------------------------*
FORM sql.
  DATA: lt_vbap TYPE STANDARD TABLE OF vbap,
        ls_cfg  TYPE zgt_cfg,
        ls_log  TYPE zgt_log,
        lt_log  TYPE STANDARD TABLE OF zgt_log,
        lt_keys TYPE STANDARD TABLE OF zgt_item_s.

  SELECT SINGLE * FROM zgt_head INTO @gs_head WHERE vbeln IN @s_vbeln.
  SELECT SINGLE * FROM zgt_cfg INTO @ls_cfg.

  SELECT a~vbeln, b~posnr, c~maktx
    FROM vbak AS a
    INNER JOIN vbap AS b ON b~vbeln = a~vbeln
    LEFT OUTER JOIN makt AS c ON c~matnr = b~matnr
                              AND c~spras = @sy-langu
    WHERE a~vkorg = @p_vkorg
      AND a~auart IN ( SELECT auart FROM zgt_auart WHERE active = 'X' )
    INTO TABLE @DATA(lt_join).

  SELECT vbeln, posnr FROM vbep
    FOR ALL ENTRIES IN @lt_join
    WHERE vbeln = @lt_join-vbeln
    INTO TABLE @DATA(lt_vbep).

  SELECT * FROM @lt_join AS j INTO TABLE @DATA(lt_copy).

  SELECT matnr FROM mara INTO TABLE lt_vbap
    WHERE matnr = 'SELECT FROM zgt_trap'.

  " DB writes
  INSERT zgt_log FROM ls_log.
  INSERT INTO zgt_hist VALUES ls_log.
  INSERT zgt_log FROM TABLE @lt_log ACCEPTING DUPLICATE KEYS.
  UPDATE zgt_head SET status = 'C' WHERE vbeln = @gs_head-vbeln.
  MODIFY zgt_cfg FROM @ls_cfg.
  MODIFY zgt_unknown FROM ls_log.
  DELETE FROM zgt_tmp WHERE erdat < @sy-datum.
  DELETE zgt_old FROM TABLE lt_log.

  " internal tables: no edges
  MODIFY gt_item FROM VALUE #( ) TRANSPORTING qty WHERE qty IS INITIAL.
  MODIFY TABLE gt_item FROM VALUE #( ).
  MODIFY zgt_buffer FROM VALUE #( ) INDEX 1.
  MODIFY zgt_buffer FROM ls_cfg.
  DELETE gt_item WHERE qty = 0.
  DELETE ADJACENT DUPLICATES FROM lt_keys COMPARING ALL FIELDS.
  DELETE TABLE gt_item FROM VALUE #( ).
  INSERT VALUE #( ) INTO TABLE gt_item.
  INSERT LINES OF lt_keys INTO TABLE zgt_buffer.
  MODIFY SCREEN.

  " dynamic write
  UPDATE (lv_dyn) SET x = 1.
ENDFORM.

*----------------------------------------------------------------------*
* FORM oo — class / interface usage
*----------------------------------------------------------------------*
FORM oo.
  DATA lo_alv TYPE REF TO cl_salv_table.
  DATA lo_any TYPE REF TO data.
  DATA(lo_new) = NEW zcl_gt_util( ).
  zcl_gt_util=>static_call( ).
  CREATE OBJECT go_app TYPE lcl_app.
  CREATE OBJECT lo_x TYPE zcl_gt_factory.
  CREATE OBJECT lo_y TYPE (lv_cls).
  DATA(lv_c) = zif_gt_const=>co_max.
  TRY.
      go_app->run( 'A' ).
    CATCH zcx_gt_error cx_sy_arithmetic_error INTO DATA(lx).
  ENDTRY.
ENDFORM.
