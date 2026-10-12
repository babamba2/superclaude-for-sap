*& Include ZSC4SAP_GS09C
CLASS lcl_data DEFINITION DEFERRED.
CLASS lcl_alv DEFINITION DEFERRED.
DATA go_data TYPE REF TO lcl_data.
DATA go_alv  TYPE REF TO lcl_alv.

CLASS lcl_data DEFINITION.
  PUBLIC SECTION.
    DATA mo_alv TYPE REF TO lcl_alv READ-ONLY.
    METHODS constructor.
    METHODS initialization.
    METHODS get_data
      IMPORTING it_carrid TYPE ty_r_carrid
                it_fldate TYPE ty_r_fldate.
    METHODS get_flights
      RETURNING VALUE(rt_flights) TYPE ty_t_flight.
    METHODS get_carriers
      RETURNING VALUE(rt_carriers) TYPE ty_t_carrier.
    METHODS calculate_free_seats
      IMPORTING iv_seats_max   TYPE sflight-seatsmax
                iv_seats_occ   TYPE sflight-seatsocc
      RETURNING VALUE(rv_free) TYPE sflight-seatsmax.
  PRIVATE SECTION.
    DATA mt_flights  TYPE ty_t_flight.
    DATA mt_carriers TYPE ty_t_carrier.
ENDCLASS.

CLASS lcl_alv DEFINITION.
  PUBLIC SECTION.
    METHODS display.
    METHODS status_0200.
    METHODS tab_set_0200.
    METHODS user_command_0200.
    METHODS set_alv_0210.
    METHODS set_alv_0220.
  PRIVATE SECTION.
    DATA mt_flights   TYPE ty_t_flight.
    DATA mt_carriers  TYPE ty_t_carrier.
    DATA mo_cc_0210   TYPE REF TO cl_gui_custom_container.
    DATA mo_grid_0210 TYPE REF TO cl_gui_alv_grid.
    DATA mo_cc_0220   TYPE REF TO cl_gui_custom_container.
    DATA mo_grid_0220 TYPE REF TO cl_gui_alv_grid.
    METHODS get_fieldcat
      IMPORTING it_data        TYPE STANDARD TABLE
      RETURNING VALUE(rt_fcat) TYPE lvc_t_fcat.
    METHODS refine_fcat
      IMPORTING iv_dynnr TYPE sy-dynnr
      CHANGING  ct_fcat  TYPE lvc_t_fcat.
    METHODS refresh_grid
      IMPORTING io_grid TYPE REF TO cl_gui_alv_grid.
ENDCLASS.

CLASS lcl_data IMPLEMENTATION.
  METHOD constructor.
    mo_alv = NEW #( ).
  ENDMETHOD.

  METHOD initialization.
    s_fldate[] = VALUE #( ( sign   = gc_sign_include
                            option = gc_option_between
                            low    = |{ sy-datum(4) }{ gc_first_day }|
                            high   = |{ sy-datum(4) }{ gc_last_day }| ) ).
  ENDMETHOD.

  METHOD get_data.
    SELECT carrid connid fldate price currency seatsmax seatsocc
      FROM sflight
      INTO CORRESPONDING FIELDS OF TABLE mt_flights
      WHERE carrid IN it_carrid
        AND fldate IN it_fldate.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    LOOP AT mt_flights ASSIGNING FIELD-SYMBOL(<ls_flight>).
      <ls_flight>-seatsfree = calculate_free_seats(
        iv_seats_max = <ls_flight>-seatsmax
        iv_seats_occ = <ls_flight>-seatsocc ).
    ENDLOOP.

    SELECT carrid carrname currcode url
      FROM scarr
      INTO TABLE mt_carriers
      WHERE carrid IN it_carrid.
    IF sy-subrc <> 0.
      CLEAR mt_carriers.
    ENDIF.
  ENDMETHOD.

  METHOD get_flights.
    rt_flights = mt_flights.
  ENDMETHOD.

  METHOD get_carriers.
    rt_carriers = mt_carriers.
  ENDMETHOD.

  METHOD calculate_free_seats.
    IF iv_seats_occ >= iv_seats_max.
      RETURN.
    ENDIF.
    rv_free = iv_seats_max - iv_seats_occ.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_alv IMPLEMENTATION.
  METHOD display.
    mt_flights  = go_data->get_flights( ).
    mt_carriers = go_data->get_carriers( ).
    IF mt_flights IS INITIAL.
      MESSAGE TEXT-m01 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_warning.
      RETURN.
    ENDIF.
    CALL SCREEN gc_dynnr_0200.
  ENDMETHOD.

  METHOD status_0200.
    SET PF-STATUS gc_status_0200.
    SET TITLEBAR gc_title_0200.
  ENDMETHOD.

  METHOD tab_set_0200.
    ts_main-activetab = gs_ts_main-pressed_tab.
    CASE gs_ts_main-pressed_tab.
      WHEN gc_tab_0200-tab2.
        gs_ts_main-subscreen = gc_dynnr_0220.
      WHEN OTHERS.
        gs_ts_main-subscreen = gc_dynnr_0210.
    ENDCASE.
  ENDMETHOD.

  METHOD user_command_0200.
    DATA(lv_fcode) = ok_code.
    CLEAR ok_code.
    CASE lv_fcode.
      WHEN gc_tab_0200-tab1 OR gc_tab_0200-tab2.
        gs_ts_main-pressed_tab = lv_fcode.
      WHEN gc_fcode_back OR gc_fcode_exit OR gc_fcode_canc.
        LEAVE TO SCREEN 0.
      WHEN gc_fcode_refresh.
        refresh_grid( mo_grid_0210 ).
        refresh_grid( mo_grid_0220 ).
      WHEN OTHERS.
        " unknown function codes are ignored
    ENDCASE.
  ENDMETHOD.

  METHOD set_alv_0210.
    IF mo_grid_0210 IS BOUND.
      RETURN.
    ENDIF.
    DATA(lt_fcat) = get_fieldcat( mt_flights ).
    refine_fcat( EXPORTING iv_dynnr = gc_dynnr_0210
                 CHANGING  ct_fcat  = lt_fcat ).
    mo_cc_0210   = NEW cl_gui_custom_container( container_name = gc_cc_0210 ).
    mo_grid_0210 = NEW cl_gui_alv_grid( i_parent = mo_cc_0210 ).
    mo_grid_0210->set_table_for_first_display(
      EXPORTING
        is_layout                     = VALUE lvc_s_layo( zebra = abap_true cwidth_opt = abap_true )
      CHANGING
        it_outtab                     = mt_flights
        it_fieldcatalog               = lt_fcat
      EXCEPTIONS
        invalid_parameter_combination = 1
        program_error                 = 2
        too_many_lines                = 3
        OTHERS                        = 4 ).
    IF sy-subrc <> 0.
      MESSAGE TEXT-m02 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
    ENDIF.
  ENDMETHOD.

  METHOD set_alv_0220.
    IF mo_grid_0220 IS BOUND.
      RETURN.
    ENDIF.
    DATA(lt_fcat) = get_fieldcat( mt_carriers ).
    refine_fcat( EXPORTING iv_dynnr = gc_dynnr_0220
                 CHANGING  ct_fcat  = lt_fcat ).
    mo_cc_0220   = NEW cl_gui_custom_container( container_name = gc_cc_0220 ).
    mo_grid_0220 = NEW cl_gui_alv_grid( i_parent = mo_cc_0220 ).
    mo_grid_0220->set_table_for_first_display(
      EXPORTING
        is_layout                     = VALUE lvc_s_layo( zebra = abap_true cwidth_opt = abap_true )
      CHANGING
        it_outtab                     = mt_carriers
        it_fieldcatalog               = lt_fcat
      EXCEPTIONS
        invalid_parameter_combination = 1
        program_error                 = 2
        too_many_lines                = 3
        OTHERS                        = 4 ).
    IF sy-subrc <> 0.
      MESSAGE TEXT-m02 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
    ENDIF.
  ENDMETHOD.

  METHOD get_fieldcat.
    DATA lr_table TYPE REF TO data.
    FIELD-SYMBOLS <lt_table> TYPE STANDARD TABLE.

    CREATE DATA lr_table LIKE it_data.
    ASSIGN lr_table->* TO <lt_table>.
    TRY.
        cl_salv_table=>factory(
          IMPORTING r_salv_table = DATA(lo_salv)
          CHANGING  t_table      = <lt_table> ).
        rt_fcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
          r_columns      = lo_salv->get_columns( )
          r_aggregations = lo_salv->get_aggregations( ) ).
      CATCH cx_salv_msg INTO DATA(lx_salv).
        DATA(lv_text) = lx_salv->get_text( ).
        MESSAGE lv_text TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
    ENDTRY.
  ENDMETHOD.

  METHOD refine_fcat.
    LOOP AT ct_fcat ASSIGNING FIELD-SYMBOL(<ls_fcat>).
      CASE iv_dynnr.
        WHEN gc_dynnr_0210.
          CASE <ls_fcat>-fieldname.
            WHEN 'SEATSFREE'.
              <ls_fcat>-coltext = TEXT-f01.
              <ls_fcat>-do_sum  = abap_true.
            WHEN OTHERS.
              " remaining columns keep their DDIC defaults
          ENDCASE.
        WHEN OTHERS.
          " airline columns keep their DDIC defaults
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.

  METHOD refresh_grid.
    IF io_grid IS NOT BOUND.
      RETURN.
    ENDIF.
    io_grid->refresh_table_display(
      EXCEPTIONS
        finished = 1
        OTHERS   = 2 ).
    IF sy-subrc <> 0.
      MESSAGE TEXT-m02 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
