*&---------------------------------------------------------------------*
*& Include          ZSDR90010A
*&---------------------------------------------------------------------*
" ALV FORMs. Screen 0100 = docking container -> splitter with two grids
" (top: order header, bottom: items of one order). Every grid goes
" through SET_ALV_STRUCTURE_0100 with its own TY_ALV bundle; the FORMs
" below branch on ps_alv-handle. Field catalog: SALV extraction
" (CONVERT_FCAT_DATA_GRID) + CASE fieldname per grid
" (MODIFY_FCAT_*_0100) - see common/alv-sample/field-catalog-guide.abap.

"--------------------------------------------------
" init_alv_0100 - first PBO builds containers and grids,
"   later PBOs only refresh them.
"--------------------------------------------------
FORM init_alv_0100.

  IF go_docking IS NOT BOUND.
    PERFORM create_docking_container  CHANGING go_docking.
    PERFORM create_splitter_container USING    go_docking
                                      CHANGING go_splitter
                                               go_cont_head
                                               go_cont_item.

    gs_alv_head-handle = gc_handle_head.
    gs_alv_item-handle = gc_handle_item.
    PERFORM set_alv_structure_0100 USING    go_cont_head
                                   CHANGING gs_alv_head.
    PERFORM set_alv_structure_0100 USING    go_cont_item
                                   CHANGING gs_alv_item.
  ELSE.
    PERFORM refresh_alv CHANGING: gs_alv_head,
                                  gs_alv_item.
  ENDIF.

  PERFORM set_item_height_0100.

ENDFORM.

FORM create_docking_container
       CHANGING po_docking TYPE REF TO cl_gui_docking_container.

  CREATE OBJECT po_docking
    EXPORTING
      repid                       = sy-repid
      dynnr                       = sy-dynnr
      side                        = cl_gui_docking_container=>dock_at_top
      extension                   = 1000
    EXCEPTIONS
      cntl_error                  = 1
      cntl_system_error           = 2
      create_error                = 3
      lifetime_error              = 4
      lifetime_dynpro_dynpro_link = 5
      OTHERS                      = 6.
  IF sy-subrc <> 0.
    MESSAGE a001(00) WITH TEXT-m05.
  ENDIF.

ENDFORM.

FORM create_splitter_container
       USING    po_docking  TYPE REF TO cl_gui_docking_container
       CHANGING po_splitter TYPE REF TO cl_gui_splitter_container
                po_top      TYPE REF TO cl_gui_container
                po_bottom   TYPE REF TO cl_gui_container.

  CREATE OBJECT po_splitter
    EXPORTING
      parent            = po_docking
      rows              = 2
      columns           = 1
    EXCEPTIONS
      cntl_error        = 1
      cntl_system_error = 2
      OTHERS            = 3.
  IF sy-subrc <> 0.
    MESSAGE a001(00) WITH TEXT-m05.
  ENDIF.

  po_top    = po_splitter->get_container( row = 1 column = 1 ).
  po_bottom = po_splitter->get_container( row = 2 column = 1 ).

ENDFORM.

"--------------------------------------------------
" set_alv_structure_0100 - creates one grid in po_parent and
"   fills every setting of ps_alv before the first display.
"--------------------------------------------------
FORM set_alv_structure_0100 USING    po_parent TYPE REF TO cl_gui_container
                            CHANGING ps_alv    TYPE ty_alv.

  CREATE OBJECT ps_alv-grid
    EXPORTING
      i_parent          = po_parent
    EXCEPTIONS
      error_cntl_create = 1
      error_cntl_init   = 2
      error_cntl_link   = 3
      error_dp_create   = 4
      OTHERS            = 5.
  IF sy-subrc <> 0.
    MESSAGE a001(00) WITH TEXT-m05.
  ENDIF.

  PERFORM set_variant           CHANGING ps_alv.
  PERFORM set_layout_0100       CHANGING ps_alv.
  PERFORM set_sort_0100         CHANGING ps_alv.
  PERFORM set_toolbar_exclude   CHANGING ps_alv.
  PERFORM set_fieldcatalog_0100 CHANGING ps_alv.
  PERFORM set_event_0100        USING    ps_alv.
  PERFORM display_alv_0100      CHANGING ps_alv.

ENDFORM.

FORM set_variant CHANGING ps_alv TYPE ty_alv.

  CLEAR ps_alv-variant.
  ps_alv-variant-report = sy-repid.
  ps_alv-variant-handle = ps_alv-handle.
  IF ps_alv-handle = gc_handle_head.
    ps_alv-variant-variant = p_var.
  ENDIF.

ENDFORM.

FORM set_layout_0100 CHANGING ps_alv TYPE ty_alv.

  CLEAR ps_alv-layout.
  ps_alv-layout-zebra      = abap_true.
  ps_alv-layout-cwidth_opt = abap_true.

  CASE ps_alv-handle.
    WHEN gc_handle_head.
      ps_alv-layout-sel_mode   = 'B'.
      ps_alv-layout-grid_title = TEXT-g01.
    WHEN gc_handle_item.
      ps_alv-layout-sel_mode   = 'D'.
      ps_alv-layout-grid_title = TEXT-g02.
  ENDCASE.

ENDFORM.

FORM set_sort_0100 CHANGING ps_alv TYPE ty_alv.

  CASE ps_alv-handle.
    WHEN gc_handle_head.
      ps_alv-sort = VALUE #( ( spos = 1 fieldname = 'VBELN' up = abap_true ) ).
    WHEN gc_handle_item.
      ps_alv-sort = VALUE #( ( spos = 1 fieldname = 'POSNR' up = abap_true ) ).
  ENDCASE.

ENDFORM.

"--------------------------------------------------
" set_toolbar_exclude - display-only grids: hide the edit
"   and rarely used standard buttons.
"--------------------------------------------------
FORM set_toolbar_exclude CHANGING ps_alv TYPE ty_alv.

  ps_alv-exclude = VALUE #(
    ( cl_gui_alv_grid=>mc_fc_loc_undo )
    ( cl_gui_alv_grid=>mc_fc_loc_cut )
    ( cl_gui_alv_grid=>mc_fc_loc_copy )
    ( cl_gui_alv_grid=>mc_fc_loc_copy_row )
    ( cl_gui_alv_grid=>mc_fc_loc_paste )
    ( cl_gui_alv_grid=>mc_fc_loc_paste_new_row )
    ( cl_gui_alv_grid=>mc_fc_loc_append_row )
    ( cl_gui_alv_grid=>mc_fc_loc_insert_row )
    ( cl_gui_alv_grid=>mc_fc_loc_delete_row )
    ( cl_gui_alv_grid=>mc_fc_loc_move_row )
    ( cl_gui_alv_grid=>mc_fc_refresh )
    ( cl_gui_alv_grid=>mc_fc_check )
    ( cl_gui_alv_grid=>mc_fc_graph )
    ( cl_gui_alv_grid=>mc_fc_info )
    ( cl_gui_alv_grid=>mc_fc_print ) ).

ENDFORM.

FORM set_fieldcatalog_0100 CHANGING ps_alv TYPE ty_alv.

  CASE ps_alv-handle.
    WHEN gc_handle_head.
      PERFORM convert_fcat_data_grid USING    gt_head
                                     CHANGING ps_alv-fieldcat.
      PERFORM modify_fcat_head_0100  CHANGING ps_alv-fieldcat.
    WHEN gc_handle_item.
      PERFORM convert_fcat_data_grid USING    gt_item
                                     CHANGING ps_alv-fieldcat.
      PERFORM modify_fcat_item_0100  CHANGING ps_alv-fieldcat.
  ENDCASE.

ENDFORM.

"--------------------------------------------------
" convert_fcat_data_grid - base catalog from the outtab line
"   type via SALV metadata (never APPEND per column).
"--------------------------------------------------
FORM convert_fcat_data_grid USING    pt_table    TYPE STANDARD TABLE
                            CHANGING pt_fieldcat TYPE lvc_t_fcat.

  DATA lo_table TYPE REF TO data.

  CREATE DATA lo_table LIKE pt_table.
  ASSIGN lo_table->* TO FIELD-SYMBOL(<lt_table>).

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_salv)
                              CHANGING  t_table      = <lt_table> ).
      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
        r_columns      = lo_salv->get_columns( )
        r_aggregations = lo_salv->get_aggregations( ) ).
    CATCH cx_root.
  ENDTRY.

ENDFORM.

FORM modify_fcat_head_0100 CHANGING pt_fieldcat TYPE lvc_t_fcat.

  LOOP AT pt_fieldcat ASSIGNING FIELD-SYMBOL(<ls_fcat>).
    CASE <ls_fcat>-fieldname.
      WHEN 'STATUS'.
        <ls_fcat>-coltext   = TEXT-f01.
        <ls_fcat>-icon      = abap_true.
        <ls_fcat>-just      = 'C'.
      WHEN 'VBELN'.
        <ls_fcat>-hotspot   = abap_true.
      WHEN 'NAME1'.
        <ls_fcat>-outputlen = 25.
      WHEN 'ITEM_CNT'.
        <ls_fcat>-coltext   = TEXT-f02.
      WHEN 'OPEN_CNT'.
        <ls_fcat>-coltext   = TEXT-f03.
        <ls_fcat>-emphasize = 'C300'.
      WHEN 'NETWR'.
        <ls_fcat>-cfieldname = 'WAERK'.
        <ls_fcat>-do_sum     = abap_true.
      WHEN 'WAERK'.
        <ls_fcat>-no_out    = abap_true.
    ENDCASE.
  ENDLOOP.

ENDFORM.

FORM modify_fcat_item_0100 CHANGING pt_fieldcat TYPE lvc_t_fcat.

  LOOP AT pt_fieldcat ASSIGNING FIELD-SYMBOL(<ls_fcat>).
    CASE <ls_fcat>-fieldname.
      WHEN 'STATUS'.
        <ls_fcat>-coltext    = TEXT-f01.
        <ls_fcat>-icon       = abap_true.
        <ls_fcat>-just       = 'C'.
      WHEN 'KWMENG'.
        <ls_fcat>-qfieldname = 'VRKME'.
        <ls_fcat>-do_sum     = abap_true.
      WHEN 'LFIMG'.
        <ls_fcat>-coltext    = TEXT-f04.
        <ls_fcat>-qfieldname = 'VRKME'.
        <ls_fcat>-do_sum     = abap_true.
      WHEN 'NETWR'.
        <ls_fcat>-cfieldname = 'WAERK'.
        <ls_fcat>-do_sum     = abap_true.
      WHEN 'VBELN' OR 'WAERK'.
        <ls_fcat>-no_out     = abap_true.
    ENDCASE.
  ENDLOOP.

ENDFORM.

"--------------------------------------------------
" set_event_0100 - one receiver instance per grid; the
"   instance passes its handle to the ALV_* FORMs.
"--------------------------------------------------
FORM set_event_0100 USING ps_alv TYPE ty_alv.

  CASE ps_alv-handle.
    WHEN gc_handle_head.
      CREATE OBJECT go_event_head
        EXPORTING
          iv_handle = ps_alv-handle.
      SET HANDLER: go_event_head->handle_toolbar       FOR ps_alv-grid,
                   go_event_head->handle_user_command  FOR ps_alv-grid,
                   go_event_head->handle_double_click  FOR ps_alv-grid,
                   go_event_head->handle_hotspot_click FOR ps_alv-grid.
    WHEN gc_handle_item.
      " Display-only item grid: no events. Register a second receiver
      " here (CREATE OBJECT ... iv_handle = gc_handle_item) when needed.
  ENDCASE.

ENDFORM.

"--------------------------------------------------
" display_alv_0100 - first display; the field symbol points
"   at the global outtab of this grid.
"--------------------------------------------------
FORM display_alv_0100 CHANGING ps_alv TYPE ty_alv.

  FIELD-SYMBOLS <lt_outtab> TYPE STANDARD TABLE.

  CASE ps_alv-handle.
    WHEN gc_handle_head.
      ASSIGN gt_head TO <lt_outtab>.
    WHEN gc_handle_item.
      ASSIGN gt_item TO <lt_outtab>.
  ENDCASE.

  ps_alv-grid->set_table_for_first_display(
    EXPORTING
      is_variant                    = ps_alv-variant
      i_save                        = gc_save_all
      i_default                     = abap_true
      is_layout                     = ps_alv-layout
      it_toolbar_excluding          = ps_alv-exclude
    CHANGING
      it_outtab                     = <lt_outtab>
      it_fieldcatalog               = ps_alv-fieldcat
      it_sort                       = ps_alv-sort
    EXCEPTIONS
      invalid_parameter_combination = 1
      program_error                 = 2
      too_many_lines                = 3
      OTHERS                        = 4 ).
  IF sy-subrc <> 0.
    MESSAGE a001(00) WITH TEXT-m05.
  ENDIF.

ENDFORM.

"--------------------------------------------------
" refresh_alv - keeps row / column position. A failed
"   refresh is not fatal: the next PBO draws again.
"--------------------------------------------------
FORM refresh_alv CHANGING ps_alv TYPE ty_alv.

  DATA ls_stable TYPE lvc_s_stbl.

  CHECK ps_alv-grid IS BOUND.

  ls_stable-row = abap_true.
  ls_stable-col = abap_true.
  ps_alv-grid->refresh_table_display(
    EXPORTING
      is_stable = ls_stable
    EXCEPTIONS
      finished  = 1
      OTHERS    = 2 ).
  IF sy-subrc <> 0.
    MESSAGE s001(00) WITH TEXT-m06 DISPLAY LIKE 'W'.
  ENDIF.

ENDFORM.

FORM set_item_height_0100.

  DATA lv_height TYPE i.

  CHECK go_splitter IS BOUND.

  lv_height = COND #( WHEN gv_is_detail = abap_true THEN gc_item_height
                      ELSE 0 ).
  go_splitter->set_row_height(
    EXPORTING
      id                = 2
      height            = lv_height
    EXCEPTIONS
      cntl_error        = 1
      cntl_system_error = 2
      OTHERS            = 3 ).
  IF sy-subrc <> 0.
    MESSAGE s001(00) WITH TEXT-m06 DISPLAY LIKE 'W'.
  ENDIF.

ENDFORM.

"--------------------------------------------------
" free_alv_0100 - frees the docking container (and with it
"   splitter + grids) so the next CALL SCREEN rebuilds them.
"--------------------------------------------------
FORM free_alv_0100.

  IF go_docking IS BOUND.
    go_docking->free( EXCEPTIONS cntl_error        = 1
                                 cntl_system_error = 2
                                 OTHERS            = 3 ).
  ENDIF.

  CLEAR: go_docking, go_splitter, go_cont_head, go_cont_item,
         go_event_head,
         gs_alv_head, gs_alv_item,
         gt_item, gv_is_detail.

ENDFORM.

FORM show_selected_items_0100.

  DATA lt_rows TYPE lvc_t_row.

  gs_alv_head-grid->get_selected_rows( IMPORTING et_index_rows = lt_rows ).
  READ TABLE lt_rows INTO DATA(ls_row) INDEX 1.
  IF sy-subrc <> 0.
    MESSAGE s001(00) WITH TEXT-m04 DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  READ TABLE gt_head INTO DATA(ls_head) INDEX ls_row-index.
  IF sy-subrc = 0.
    PERFORM show_items_0100 USING ls_head-vbeln.
  ENDIF.

ENDFORM.

FORM show_items_0100 USING pv_vbeln TYPE vbak-vbeln.

  gt_item = VALUE #( FOR ls_item IN gt_item_all WHERE ( vbeln = pv_vbeln )
                     ( ls_item ) ).
  gv_is_detail = abap_true.

  PERFORM refresh_alv CHANGING gs_alv_item.
  PERFORM set_item_height_0100.

ENDFORM.

"--------------------------------------------------
" ALV event FORMs - called from LCL_EVENT_HANDLER (ZSDR90010C)
"--------------------------------------------------
FORM alv_toolbar USING po_object TYPE REF TO cl_alv_event_toolbar_set
                       pv_handle TYPE slis_handl.

  CHECK pv_handle = gc_handle_head.

  APPEND VALUE #( butn_type = 3 ) TO po_object->mt_toolbar.
  APPEND VALUE #( function  = gc_fcode_detail
                  icon      = icon_display
                  quickinfo = TEXT-b04
                  text      = TEXT-b04 ) TO po_object->mt_toolbar.

ENDFORM.

"--------------------------------------------------
" alv_user_command - hands the toolbar code to PAI so that
"   USER_COMMAND_0100 is the single dispatcher.
"--------------------------------------------------
FORM alv_user_command USING pv_ucomm TYPE sy-ucomm.

  cl_gui_cfw=>set_new_ok_code( new_code = pv_ucomm ).

ENDFORM.

FORM alv_double_click USING pv_handle TYPE slis_handl
                            ps_row    TYPE lvc_s_row
                            ps_column TYPE lvc_s_col.

  CHECK pv_handle = gc_handle_head
    AND ps_row-rowtype IS INITIAL.

  READ TABLE gt_head INTO DATA(ls_head) INDEX ps_row-index.
  CHECK sy-subrc = 0.

  PERFORM show_items_0100 USING ls_head-vbeln.
  " Run PAI / PBO once so the GUI status follows the new pane state
  cl_gui_cfw=>set_new_ok_code( new_code = gc_fcode_enter ).

ENDFORM.

FORM alv_hotspot_click USING pv_handle TYPE slis_handl
                             ps_row    TYPE lvc_s_row
                             ps_column TYPE lvc_s_col.

  CHECK pv_handle = gc_handle_head
    AND ps_column-fieldname = 'VBELN'.

  READ TABLE gt_head INTO DATA(ls_head) INDEX ps_row-index.
  CHECK sy-subrc = 0.

  PERFORM display_sales_order USING ls_head-vbeln.

ENDFORM.
