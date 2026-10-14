*& Include ZSC4SAP_GS05F
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
