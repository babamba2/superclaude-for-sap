*&---------------------------------------------------------------------*
*& Include          ZSDR90010C
*&---------------------------------------------------------------------*
" ALV event receiver. One instance per grid; the instance keeps its grid
" handle so every method passes it on. Methods hold no logic - each one
" delegates to a FORM in ZSDR90010A.
" Editable grid: add HANDLE_DATA_CHANGED (FOR EVENT data_changed,
" IMPORTING er_data_changed) -> PERFORM alv_data_changed_0100, and call
" register_edit_event in SET_EVENT_0100.

CLASS lcl_event_handler DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS:
      constructor
        IMPORTING iv_handle TYPE slis_handl,

      handle_toolbar
        FOR EVENT toolbar OF cl_gui_alv_grid
        IMPORTING e_object,

      handle_user_command
        FOR EVENT user_command OF cl_gui_alv_grid
        IMPORTING e_ucomm,

      handle_double_click
        FOR EVENT double_click OF cl_gui_alv_grid
        IMPORTING e_row
                  e_column,

      handle_hotspot_click
        FOR EVENT hotspot_click OF cl_gui_alv_grid
        IMPORTING e_row_id
                  e_column_id.

  PRIVATE SECTION.
    DATA mv_handle TYPE slis_handl.
ENDCLASS.

CLASS lcl_event_handler IMPLEMENTATION.
  METHOD constructor.
    mv_handle = iv_handle.
  ENDMETHOD.

  METHOD handle_toolbar.
    PERFORM alv_toolbar USING e_object
                              mv_handle.
  ENDMETHOD.

  METHOD handle_user_command.
    PERFORM alv_user_command USING e_ucomm.
  ENDMETHOD.

  METHOD handle_double_click.
    PERFORM alv_double_click USING mv_handle
                                   e_row
                                   e_column.
  ENDMETHOD.

  METHOD handle_hotspot_click.
    PERFORM alv_hotspot_click USING mv_handle
                                    e_row_id
                                    e_column_id.
  ENDMETHOD.
ENDCLASS.
