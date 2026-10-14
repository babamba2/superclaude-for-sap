*& Include ZSC4SAP_GS01E
CLASS lcl_event_alv DEFINITION.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING io_grid TYPE REF TO cl_gui_alv_grid.
    METHODS handle_double_click
      FOR EVENT double_click OF cl_gui_alv_grid
      IMPORTING es_row_no.
ENDCLASS.

CLASS lcl_event_alv IMPLEMENTATION.
  METHOD constructor.
    SET HANDLER handle_double_click FOR io_grid.
  ENDMETHOD.

  METHOD handle_double_click.
    go_alv->show_flight_0100( es_row_no-row_id ).
  ENDMETHOD.
ENDCLASS.
