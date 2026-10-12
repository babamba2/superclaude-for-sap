*& Include ZSC4SAP_GS07F
"----------------------------------------------------------------------
" check_carriers - validates the airline range against SCARR; sends an
"   error message to the selection screen when no airline matches.
"----------------------------------------------------------------------
FORM check_carriers USING pt_carrid TYPE ty_r_carrid.
  IF pt_carrid IS INITIAL.
    RETURN.
  ENDIF.

  SELECT COUNT(*) FROM scarr WHERE carrid IN pt_carrid.
  IF sy-subrc <> 0.
    MESSAGE TEXT-m02 TYPE gc_msgty_error.
  ENDIF.
ENDFORM.

"----------------------------------------------------------------------
" get_data - reads flights with airline names for the selection into
"   the global result table gt_flights.
"----------------------------------------------------------------------
FORM get_data USING pt_carrid TYPE ty_r_carrid
                    pt_fldate TYPE ty_r_fldate.
  SELECT f~carrid c~carrname f~connid f~fldate f~price f~currency
         f~seatsmax f~seatsocc
    FROM sflight AS f
    INNER JOIN scarr AS c ON c~carrid = f~carrid
    INTO CORRESPONDING FIELDS OF TABLE gt_flights
    WHERE f~carrid IN pt_carrid
      AND f~fldate IN pt_fldate.
  IF sy-subrc <> 0.
    CLEAR gt_flights.
  ENDIF.
ENDFORM.

"----------------------------------------------------------------------
" display_0100 - calls screen 0100 for gt_flights; informs the user
"   when the selection returned no rows.
"----------------------------------------------------------------------
FORM display_0100.
  IF gt_flights IS INITIAL.
    MESSAGE TEXT-m01 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_warning.
    RETURN.
  ENDIF.

  CALL SCREEN gc_dynnr_0100.
ENDFORM.

"----------------------------------------------------------------------
" set_status_0100 - sets GUI status and title bar of screen 0100.
"----------------------------------------------------------------------
FORM set_status_0100.
  SET PF-STATUS gc_status_0100.
  SET TITLEBAR gc_title_0100.
ENDFORM.

"----------------------------------------------------------------------
" show_grid_0100 - creates the ALV grid on first PBO, refreshes it on
"   every later PBO (uses go_grid).
"----------------------------------------------------------------------
FORM show_grid_0100.
  IF go_grid IS BOUND.
    PERFORM refresh_grid_0100.
  ELSE.
    PERFORM create_grid_0100.
  ENDIF.
ENDFORM.

"----------------------------------------------------------------------
" create_grid_0100 - creates docking container + ALV grid and displays
"   gt_flights; sets go_dock / go_grid.
"----------------------------------------------------------------------
FORM create_grid_0100.
  DATA lt_fcat   TYPE lvc_t_fcat.
  DATA ls_layout TYPE lvc_s_layo.

  PERFORM convert_fcat_data_grid USING gt_flights CHANGING lt_fcat.
  IF lt_fcat IS INITIAL.
    MESSAGE TEXT-m03 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
    RETURN.
  ENDIF.
  PERFORM modify_fcat_0100 CHANGING lt_fcat.

  ls_layout-zebra      = abap_true.
  ls_layout-cwidth_opt = abap_true.

  go_dock = NEW #( side      = cl_gui_docking_container=>dock_at_top
                   extension = gc_dock_extension ).
  go_grid = NEW #( i_parent = go_dock ).

  go_grid->set_table_for_first_display(
    EXPORTING
      is_layout                     = ls_layout
    CHANGING
      it_outtab                     = gt_flights
      it_fieldcatalog               = lt_fcat
    EXCEPTIONS
      invalid_parameter_combination = 1
      program_error                 = 2
      too_many_lines                = 3
      OTHERS                        = 4 ).
  IF sy-subrc <> 0.
    MESSAGE TEXT-m03 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
  ENDIF.
ENDFORM.

"----------------------------------------------------------------------
" convert_fcat_data_grid - derives an LVC field catalog for any
"   standard table via the SALV factory (screen-independent utility).
"----------------------------------------------------------------------
FORM convert_fcat_data_grid USING    pt_table    TYPE STANDARD TABLE
                            CHANGING pt_fieldcat TYPE lvc_t_fcat.
  DATA lr_table TYPE REF TO data.
  DATA lo_salv  TYPE REF TO cl_salv_table.
  FIELD-SYMBOLS <lt_table> TYPE STANDARD TABLE.

  CREATE DATA lr_table LIKE pt_table.
  ASSIGN lr_table->* TO <lt_table>.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = lo_salv
        CHANGING  t_table      = <lt_table> ).
      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
        r_columns      = lo_salv->get_columns( )
        r_aggregations = lo_salv->get_aggregations( ) ).
    CATCH cx_salv_msg.
      CLEAR pt_fieldcat.
  ENDTRY.
ENDFORM.

"----------------------------------------------------------------------
" modify_fcat_0100 - per-column catalog attributes for screen 0100.
"----------------------------------------------------------------------
FORM modify_fcat_0100 CHANGING pt_fieldcat TYPE lvc_t_fcat.
  FIELD-SYMBOLS <ls_fcat> TYPE lvc_s_fcat.

  LOOP AT pt_fieldcat ASSIGNING <ls_fcat>.
    CASE <ls_fcat>-fieldname.
      WHEN 'SEATSMAX' OR 'SEATSOCC'.
        <ls_fcat>-do_sum = abap_true.
      WHEN OTHERS.
        " remaining columns keep their DDIC defaults
    ENDCASE.
  ENDLOOP.
ENDFORM.

"----------------------------------------------------------------------
" refresh_grid_0100 - refreshes the grid display (uses go_grid).
"----------------------------------------------------------------------
FORM refresh_grid_0100.
  go_grid->refresh_table_display(
    EXCEPTIONS
      finished = 1
      OTHERS   = 2 ).
  IF sy-subrc <> 0.
    MESSAGE TEXT-m03 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
  ENDIF.
ENDFORM.

"----------------------------------------------------------------------
" user_command_0100 - PAI function-code routing for screen 0100.
"----------------------------------------------------------------------
FORM user_command_0100.
  CASE sy-ucomm.
    WHEN gc_fcode_back OR gc_fcode_exit OR gc_fcode_canc.
      PERFORM leave_0100.
    WHEN gc_fcode_refresh.
      PERFORM refresh_grid_0100.
    WHEN OTHERS.
      " unknown function codes are ignored
  ENDCASE.
ENDFORM.

"----------------------------------------------------------------------
" leave_0100 - returns from screen 0100 to the selection screen.
"----------------------------------------------------------------------
FORM leave_0100.
  LEAVE TO SCREEN 0.
ENDFORM.
