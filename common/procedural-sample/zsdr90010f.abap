*&---------------------------------------------------------------------*
*& Include          ZSDR90010F
*&---------------------------------------------------------------------*
" Business-logic FORMs, in event order: selection-screen FORMs ->
" START-OF-SELECTION (read -> build list) -> END-OF-SELECTION
" (screen / batch) -> screen 0100 PBO / PAI FORMs -> utilities.
" FORMs called from the main event blocks keep the names used there.

"--------------------------------------------------
" set_screen - INITIALIZATION: default document date range
"   and the user's default layout variant.
"--------------------------------------------------
FORM set_screen.

  DATA ls_variant TYPE disvariant.

  IF s_audat[] IS INITIAL.
    s_audat[] = VALUE #( ( sign   = 'I'
                           option = 'BT'
                           low    = sy-datum - gc_default_days
                           high   = sy-datum ) ).
  ENDIF.

  ls_variant-report = sy-repid.
  ls_variant-handle = gc_handle_head.
  CALL FUNCTION 'REUSE_ALV_VARIANT_DEFAULT_GET'
    EXPORTING
      i_save        = gc_save_all
    CHANGING
      cs_variant    = ls_variant
    EXCEPTIONS
      wrong_input   = 1
      not_found     = 2
      program_error = 3
      OTHERS        = 4.
  IF sy-subrc = 0.
    p_var = ls_variant-variant.
  ENDIF.

ENDFORM.

"--------------------------------------------------
" check_common_authority - display authority for every
"   single sales organization entered (V_VBAK_VKO).
"--------------------------------------------------
FORM check_common_authority.

  LOOP AT s_vkorg INTO DATA(ls_vkorg) WHERE sign = 'I' AND option = 'EQ'.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD ls_vkorg-low
      ID 'VTWEG' DUMMY
      ID 'SPART' DUMMY
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      MESSAGE e001(00) WITH TEXT-e01 ls_vkorg-low.
    ENDIF.
  ENDLOOP.

ENDFORM.

FORM check_screen_input.

  READ TABLE s_audat INTO DATA(ls_audat) INDEX 1.
  IF sy-subrc = 0 AND ls_audat-high IS NOT INITIAL
     AND ls_audat-high - ls_audat-low > gc_max_days.
    MESSAGE e001(00) WITH TEXT-e02.
  ENDIF.

ENDFORM.

"--------------------------------------------------
" set_screen_output - the layout variant is a dialog setting;
"   it is locked while batch output is chosen.
"--------------------------------------------------
FORM set_screen_output.

  LOOP AT SCREEN.
    IF screen-group1 = 'VAR'.
      screen-input = COND #( WHEN p_bat = abap_true THEN 0 ELSE 1 ).
      MODIFY SCREEN.
    ENDIF.
  ENDLOOP.

ENDFORM.

FORM set_screen_variant.

  DATA: ls_variant TYPE disvariant,
        lv_exit    TYPE c LENGTH 1.

  ls_variant-report = sy-repid.
  ls_variant-handle = gc_handle_head.
  CALL FUNCTION 'REUSE_ALV_VARIANT_F4'
    EXPORTING
      is_variant    = ls_variant
      i_save        = gc_save_all
    IMPORTING
      e_exit        = lv_exit
      es_variant    = ls_variant
    EXCEPTIONS
      not_found     = 1
      program_error = 2
      OTHERS        = 3.
  IF sy-subrc = 0 AND lv_exit IS INITIAL.
    p_var = ls_variant-variant.
  ELSEIF sy-subrc = 1.
    MESSAGE s001(00) WITH TEXT-m03.
  ENDIF.

ENDFORM.

"--------------------------------------------------
" start_of_selection - read orders, delivery flow and customer
"   names, then build GT_HEAD / GT_ITEM_ALL. Read buffers stay
"   local and are passed on explicitly.
"--------------------------------------------------
FORM start_of_selection.

  DATA: lt_so   TYPE ty_t_so,
        lt_flow TYPE ty_t_flow,
        lt_kna1 TYPE ty_t_kna1.

  CLEAR: gt_head, gt_item_all, gt_item.

  PERFORM get_order_data CHANGING lt_so.
  CHECK lt_so IS NOT INITIAL.

  PERFORM get_delivery_flow USING    lt_so
                            CHANGING lt_flow.
  PERFORM get_customer_name USING    lt_so
                            CHANGING lt_kna1.
  PERFORM make_list         USING    lt_so
                                     lt_flow
                                     lt_kna1.

ENDFORM.

FORM get_order_data CHANGING pt_so TYPE ty_t_so.

  SELECT a~vbeln, a~auart, a~audat, a~vkorg, a~vtweg, a~kunnr, a~waerk,
         b~posnr, b~matnr, b~arktx, b~kwmeng, b~vrkme, b~netwr,
         b~werks, b~lgort
    FROM vbak AS a
    INNER JOIN vbap AS b ON b~vbeln = a~vbeln
    WHERE a~vkorg IN @s_vkorg
      AND a~vtweg IN @s_vtweg
      AND a~auart IN @s_auart
      AND a~audat IN @s_audat
      AND a~vbeln IN @s_vbeln
      AND a~kunnr IN @s_kunnr
      AND b~matnr IN @s_matnr
      AND b~werks IN @s_werks
    ORDER BY a~vbeln, b~posnr
    INTO CORRESPONDING FIELDS OF TABLE @pt_so.

ENDFORM.

"--------------------------------------------------
" get_delivery_flow - FOR ALL ENTRIES drops duplicate result
"   rows, so the successor key (vbeln, posnn) is selected too.
"--------------------------------------------------
FORM get_delivery_flow USING    pt_so   TYPE ty_t_so
                       CHANGING pt_flow TYPE ty_t_flow.

  CHECK pt_so IS NOT INITIAL.

  SELECT vbelv, posnv, vbeln, posnn, rfmng
    FROM vbfa
    FOR ALL ENTRIES IN @pt_so
    WHERE vbelv   = @pt_so-vbeln
      AND posnv   = @pt_so-posnr
      AND vbtyp_n = @gc_vbtyp_delivery
    INTO CORRESPONDING FIELDS OF TABLE @pt_flow.

ENDFORM.

FORM get_customer_name USING    pt_so   TYPE ty_t_so
                       CHANGING pt_kna1 TYPE ty_t_kna1.

  CHECK pt_so IS NOT INITIAL.

  SELECT kunnr, name1
    FROM kna1
    FOR ALL ENTRIES IN @pt_so
    WHERE kunnr = @pt_so-kunnr
    INTO CORRESPONDING FIELDS OF TABLE @pt_kna1.

ENDFORM.

"--------------------------------------------------
" make_list - pt_so is ordered by vbeln / posnr: one item row
"   per line, one header row per order change.
"--------------------------------------------------
FORM make_list USING pt_so   TYPE ty_t_so
                     pt_flow TYPE ty_t_flow
                     pt_kna1 TYPE ty_t_kna1.

  DATA: ls_head TYPE ty_head,
        ls_item TYPE ty_item.

  LOOP AT pt_so INTO DATA(ls_so).
    IF ls_so-vbeln <> ls_head-vbeln.
      IF ls_head-vbeln IS NOT INITIAL.
        PERFORM append_head USING ls_head.
      ENDIF.
      PERFORM init_head USING    ls_so
                                 pt_kna1
                        CHANGING ls_head.
    ENDIF.

    PERFORM build_item USING    ls_so
                                pt_flow
                       CHANGING ls_item.
    APPEND ls_item TO gt_item_all.

    ls_head-item_cnt = ls_head-item_cnt + 1.
    ls_head-netwr    = ls_head-netwr + ls_item-netwr.
    IF ls_item-lfimg < ls_item-kwmeng.
      ls_head-open_cnt = ls_head-open_cnt + 1.
    ENDIF.
  ENDLOOP.

  IF ls_head-vbeln IS NOT INITIAL.
    PERFORM append_head USING ls_head.
  ENDIF.

ENDFORM.

FORM init_head USING    ps_so   TYPE ty_so
                        pt_kna1 TYPE ty_t_kna1
               CHANGING ps_head TYPE ty_head.

  CLEAR ps_head.
  MOVE-CORRESPONDING ps_so TO ps_head.
  CLEAR ps_head-netwr.

  READ TABLE pt_kna1 INTO DATA(ls_kna1) WITH TABLE KEY kunnr = ps_so-kunnr.
  IF sy-subrc = 0.
    ps_head-name1 = ls_kna1-name1.
  ENDIF.

ENDFORM.

FORM build_item USING    ps_so   TYPE ty_so
                         pt_flow TYPE ty_t_flow
                CHANGING ps_item TYPE ty_item.

  CLEAR ps_item.
  MOVE-CORRESPONDING ps_so TO ps_item.

  LOOP AT pt_flow INTO DATA(ls_flow) WHERE vbelv = ps_so-vbeln
                                       AND posnv = ps_so-posnr.
    ps_item-lfimg = ps_item-lfimg + ls_flow-rfmng.
  ENDLOOP.

  ps_item-status = COND #( WHEN ps_item-lfimg >= ps_item-kwmeng THEN icon_led_green
                           WHEN ps_item-lfimg > 0               THEN icon_led_yellow
                           ELSE                                      icon_led_red ).

ENDFORM.

"--------------------------------------------------
" append_head - sets the order status and applies the
"   status filter of the selection screen (p_open / p_done).
"--------------------------------------------------
FORM append_head USING ps_head TYPE ty_head.

  DATA ls_head TYPE ty_head.

  ls_head = ps_head.
  ls_head-status = COND #( WHEN ls_head-open_cnt = 0                 THEN icon_led_green
                           WHEN ls_head-open_cnt < ls_head-item_cnt THEN icon_led_yellow
                           ELSE                                          icon_led_red ).

  IF ( p_open = abap_true AND ls_head-open_cnt = 0 )
  OR ( p_done = abap_true AND ls_head-open_cnt > 0 ).
    DELETE gt_item_all WHERE vbeln = ls_head-vbeln.
    RETURN.
  ENDIF.

  APPEND ls_head TO gt_head.

ENDFORM.

FORM end_of_selection.

  DATA lv_count TYPE i.

  IF gt_head IS INITIAL.
    MESSAGE s001(00) WITH TEXT-m01 DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  " Controls need a SAP GUI - a background job always writes the list
  IF sy-batch = abap_true.
    PERFORM batch_data_collection.
    RETURN.
  ENDIF.

  lv_count = lines( gt_head ).
  MESSAGE s001(00) WITH TEXT-m02 lv_count.
  CALL SCREEN 0100.

ENDFORM.

"--------------------------------------------------
" batch_data_collection - p_bat / background job: order list
"   through SALV (spool in background), no dynpro, no controls.
"--------------------------------------------------
FORM batch_data_collection.

  DATA lo_salv TYPE REF TO cl_salv_table.

  IF gt_head IS INITIAL.
    MESSAGE s001(00) WITH TEXT-m01 DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_salv
                              CHANGING  t_table      = gt_head ).
      lo_salv->get_columns( )->set_optimize( abap_true ).
      lo_salv->display( ).
    CATCH cx_salv_msg INTO DATA(lx_salv).
      MESSAGE lx_salv TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.

ENDFORM.

"--------------------------------------------------
" set_status_0100 - CLOSE (item pane) only while it is open
"--------------------------------------------------
FORM set_status_0100.

  DATA lt_exclude TYPE STANDARD TABLE OF sy-ucomm WITH DEFAULT KEY.

  IF gv_is_detail = abap_false.
    APPEND gc_fcode_close TO lt_exclude.
  ENDIF.

  SET PF-STATUS '0100' EXCLUDING lt_exclude.
  SET TITLEBAR '0100'.

ENDFORM.

"--------------------------------------------------
" exit_0100 - AT EXIT-COMMAND (BACK / EXIT / CANC are type E)
"--------------------------------------------------
FORM exit_0100.

  DATA lv_fcode TYPE sy-ucomm.

  lv_fcode = gv_okcode.
  CLEAR gv_okcode.

  CASE lv_fcode.
    WHEN gc_fcode_back OR gc_fcode_exit.
      PERFORM free_alv_0100.
      LEAVE TO SCREEN 0.
    WHEN gc_fcode_canc.
      PERFORM free_alv_0100.
      LEAVE PROGRAM.
  ENDCASE.

ENDFORM.

"--------------------------------------------------
" user_command_0100 - single dispatcher for GUI status codes and
"   ALV toolbar codes (routed here by ALV_USER_COMMAND).
"--------------------------------------------------
FORM user_command_0100.

  DATA lv_fcode TYPE sy-ucomm.

  lv_fcode = gv_okcode.
  CLEAR gv_okcode.

  CASE lv_fcode.
    WHEN gc_fcode_refresh.
      PERFORM refresh_list_0100.
    WHEN gc_fcode_detail.
      PERFORM show_selected_items_0100.
    WHEN gc_fcode_close.
      gv_is_detail = abap_false.
      CLEAR gt_item.
    WHEN OTHERS.
      " gc_fcode_enter: no action, PBO redraws the screen
  ENDCASE.

ENDFORM.

FORM refresh_list_0100.

  DATA lv_count TYPE i.

  gv_is_detail = abap_false.
  PERFORM start_of_selection.
  lv_count = lines( gt_head ).
  MESSAGE s001(00) WITH TEXT-m02 lv_count.

ENDFORM.

"--------------------------------------------------
" display_sales_order - VA03 with the transaction authority check
"--------------------------------------------------
FORM display_sales_order USING pv_vbeln TYPE vbak-vbeln.

  CALL FUNCTION 'AUTHORITY_CHECK_TCODE'
    EXPORTING
      tcode  = 'VA03'
    EXCEPTIONS
      ok     = 0
      not_ok = 1
      OTHERS = 2.
  IF sy-subrc <> 0.
    MESSAGE s001(00) WITH TEXT-e03 DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  SET PARAMETER ID 'AUN' FIELD pv_vbeln.
  CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.

ENDFORM.
