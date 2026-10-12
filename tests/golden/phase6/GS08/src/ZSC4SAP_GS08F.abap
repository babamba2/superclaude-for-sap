*& Include ZSC4SAP_GS08F
"----------------------------------------------------------------------
" check_carrier - validates the airline via ZSC4SAP_GS08_FM; shows the
"   airline name, or an error message on the selection screen.
"----------------------------------------------------------------------
FORM check_carrier USING pv_carrid TYPE sflight-carrid.
  DATA lv_carrname TYPE scarr-carrname.
  DATA lv_text     TYPE string.

  CALL FUNCTION 'ZSC4SAP_GS08_FM'
    EXPORTING
      iv_carrid   = pv_carrid
    IMPORTING
      ev_carrname = lv_carrname
    EXCEPTIONS
      not_found   = 1
      OTHERS      = 2.
  CASE sy-subrc.
    WHEN 0.
      lv_text = |{ TEXT-m03 } { lv_carrname }|.
      MESSAGE lv_text TYPE gc_msgty_success.
    WHEN 1.
      MESSAGE TEXT-m02 TYPE gc_msgty_error.
    WHEN OTHERS.
      MESSAGE TEXT-m04 TYPE gc_msgty_error.
  ENDCASE.
ENDFORM.

"----------------------------------------------------------------------
" get_data - reads the flights of one airline for the date range into
"   the global result table gt_flights.
"----------------------------------------------------------------------
FORM get_data USING pv_carrid TYPE sflight-carrid
                    pt_fldate TYPE ty_r_fldate.
  SELECT f~carrid c~carrname f~connid f~fldate f~price f~currency
         f~seatsmax f~seatsocc
    FROM sflight AS f
    INNER JOIN scarr AS c ON c~carrid = f~carrid
    INTO CORRESPONDING FIELDS OF TABLE gt_flights
    WHERE f~carrid = pv_carrid
      AND f~fldate IN pt_fldate.
  IF sy-subrc <> 0.
    CLEAR gt_flights.
  ENDIF.
ENDFORM.

"----------------------------------------------------------------------
" display_data - shows gt_flights in a SALV popup; informs the user
"   when the selection returned no rows.
"----------------------------------------------------------------------
FORM display_data.
  DATA lo_salv TYPE REF TO cl_salv_table.
  DATA lx_salv TYPE REF TO cx_salv_msg.
  DATA lv_text TYPE string.

  IF gt_flights IS INITIAL.
    MESSAGE TEXT-m01 TYPE gc_msgty_success DISPLAY LIKE gc_msgty_warning.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = lo_salv
        CHANGING  t_table      = gt_flights ).
      lo_salv->set_screen_popup(
        start_column = gc_popup_col_from
        end_column   = gc_popup_col_to
        start_line   = gc_popup_row_from
        end_line     = gc_popup_row_to ).
      lo_salv->display( ).
    CATCH cx_salv_msg INTO lx_salv.
      lv_text = lx_salv->get_text( ).
      MESSAGE lv_text TYPE gc_msgty_success DISPLAY LIKE gc_msgty_error.
  ENDTRY.
ENDFORM.
