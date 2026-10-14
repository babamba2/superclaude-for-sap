*&---------------------------------------------------------------------*
*& Module         : CA
*& Program ID     : ZSC4SAP_GS06
*& Tcode          :
*& Old Program ID :
*& Title          : Flight list (SALV popup)
*& Description    : Flight list with airline names in a SALV popup
*&---------------------------------------------------------------------*
*& Change History
*&---------------------------------------------------------------------*
*& Change No | Changed by    | Change Date
*&           | SC4SAP        | 2026-10-12
*&---------------------------------------------------------------------*
REPORT zsc4sap_gs06.

TYPES: BEGIN OF ty_flight,
         carrid   TYPE sflight-carrid,
         carrname TYPE scarr-carrname,
         connid   TYPE sflight-connid,
         fldate   TYPE sflight-fldate,
         price    TYPE sflight-price,
         currency TYPE sflight-currency,
         seatsmax TYPE sflight-seatsmax,
         seatsocc TYPE sflight-seatsocc,
       END OF ty_flight,
       ty_t_flight TYPE STANDARD TABLE OF ty_flight
                   WITH NON-UNIQUE KEY carrid connid fldate.

TYPES: ty_r_carrid TYPE RANGE OF sflight-carrid,
       ty_r_fldate TYPE RANGE OF sflight-fldate.

CONSTANTS: gc_msgty_success  TYPE sy-msgty VALUE 'S',
           gc_msgty_warning  TYPE sy-msgty VALUE 'W',
           gc_msgty_error    TYPE sy-msgty VALUE 'E',
           gc_popup_col_from TYPE i VALUE 5,
           gc_popup_col_to   TYPE i VALUE 150,
           gc_popup_row_from TYPE i VALUE 3,
           gc_popup_row_to   TYPE i VALUE 25.

DATA: gt_flights    TYPE ty_t_flight,
      gv_sel_carrid TYPE sflight-carrid,
      gv_sel_fldate TYPE sflight-fldate.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-b01.
SELECT-OPTIONS: s_carrid FOR gv_sel_carrid,
                s_fldate FOR gv_sel_fldate.
SELECTION-SCREEN END OF BLOCK b01.

AT SELECTION-SCREEN.
  PERFORM check_carriers USING s_carrid[].

START-OF-SELECTION.
  PERFORM get_data USING s_carrid[] s_fldate[].

END-OF-SELECTION.
  PERFORM display_data.

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
