*& Include ZSC4SAP_GS04C
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
    METHODS calculate_occupancy
      IMPORTING iv_seats_max  TYPE sflight-seatsmax
                iv_seats_occ  TYPE sflight-seatsocc
      RETURNING VALUE(rv_pct) TYPE ty_occupancy.
  PRIVATE SECTION.
    DATA mt_flights TYPE ty_t_flight.
ENDCLASS.

CLASS lcl_alv DEFINITION.
  PUBLIC SECTION.
    METHODS display.
    METHODS status_0100.
    METHODS set_alv_0100.
    METHODS user_command_0100.
    METHODS show_flight_0100
      IMPORTING iv_row TYPE i.
  PRIVATE SECTION.
    DATA mt_outtab TYPE ty_t_flight.
    DATA mo_dock   TYPE REF TO cl_gui_docking_container.
    DATA mo_grid   TYPE REF TO cl_gui_alv_grid.
    DATA mo_event  TYPE REF TO object.
    METHODS create_grid_0100.
    METHODS get_fieldcat
      RETURNING VALUE(rt_fcat) TYPE lvc_t_fcat.
    METHODS refine_fcat
      CHANGING ct_fcat TYPE lvc_t_fcat.
    METHODS refresh_grid_0100.
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
    SELECT carrid connid fldate price currency planetype seatsmax seatsocc
      FROM sflight
      INTO CORRESPONDING FIELDS OF TABLE mt_flights
      WHERE carrid IN it_carrid
        AND fldate IN it_fldate.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    LOOP AT mt_flights ASSIGNING FIELD-SYMBOL(<ls_flight>).
      <ls_flight>-occupancy = calculate_occupancy(
        iv_seats_max = <ls_flight>-seatsmax
        iv_seats_occ = <ls_flight>-seatsocc ).
    ENDLOOP.
  ENDMETHOD.

  METHOD get_flights.
    rt_flights = mt_flights.
  ENDMETHOD.

  METHOD calculate_occupancy.
    IF iv_seats_max IS INITIAL.
      RETURN.
    ENDIF.
    rv_pct = iv_seats_occ * gc_percent / iv_seats_max.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_alv IMPLEMENTATION.
  METHOD display.
    mt_outtab = go_data->get_flights( ).
    IF mt_outtab IS INITIAL.
      MESSAGE TEXT-m01 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_warning.
      RETURN.
    ENDIF.
    CALL SCREEN gc_dynnr_0100.
  ENDMETHOD.

  METHOD status_0100.
    SET PF-STATUS gc_status_0100.
    SET TITLEBAR gc_title_0100.
  ENDMETHOD.

  METHOD set_alv_0100.
    IF mo_grid IS BOUND.
      refresh_grid_0100( ).
    ELSE.
      create_grid_0100( ).
    ENDIF.
  ENDMETHOD.

  METHOD user_command_0100.
    DATA(lv_fcode) = ok_code.
    CLEAR ok_code.
    CASE lv_fcode.
      WHEN gc_fcode_back OR gc_fcode_exit OR gc_fcode_canc.
        LEAVE TO SCREEN 0.
      WHEN gc_fcode_refresh.
        refresh_grid_0100( ).
      WHEN OTHERS.
        " unknown function codes are ignored
    ENDCASE.
  ENDMETHOD.

  METHOD show_flight_0100.
    READ TABLE mt_outtab INDEX iv_row INTO DATA(ls_flight).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    DATA(lv_text) = |{ TEXT-m03 } { ls_flight-carrid } { ls_flight-connid } |
                 && |{ ls_flight-fldate DATE = USER } { ls_flight-occupancy }|.
    MESSAGE lv_text TYPE gc_msgty_success.
  ENDMETHOD.

  METHOD create_grid_0100.
    DATA(lt_fcat) = get_fieldcat( ).
    refine_fcat( CHANGING ct_fcat = lt_fcat ).
    DATA(ls_layout) = VALUE lvc_s_layo( zebra      = abap_true
                                        cwidth_opt = abap_true ).

    mo_dock = NEW cl_gui_docking_container(
      side      = cl_gui_docking_container=>dock_at_top
      extension = gc_dock_extension ).
    mo_grid = NEW cl_gui_alv_grid( i_parent = mo_dock ).
    " E include follows C: the receiver is created by name (oop-pattern.md, section Event Wiring)
    CREATE OBJECT mo_event TYPE (gc_event_class)
      EXPORTING
        io_grid = mo_grid.

    mo_grid->set_table_for_first_display(
      EXPORTING
        is_layout                     = ls_layout
      CHANGING
        it_outtab                     = mt_outtab
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
    DATA lt_template TYPE ty_t_flight.

    TRY.
        cl_salv_table=>factory(
          IMPORTING r_salv_table = DATA(lo_salv)
          CHANGING  t_table      = lt_template ).
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
      CASE <ls_fcat>-fieldname.
        WHEN 'OCCUPANCY'.
          <ls_fcat>-coltext = TEXT-f01.
        WHEN 'SEATSMAX' OR 'SEATSOCC'.
          <ls_fcat>-do_sum = abap_true.
        WHEN OTHERS.
          " remaining columns keep their DDIC defaults
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.

  METHOD refresh_grid_0100.
    mo_grid->refresh_table_display(
      EXCEPTIONS
        finished = 1
        OTHERS   = 2 ).
    IF sy-subrc <> 0.
      MESSAGE TEXT-m02 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
