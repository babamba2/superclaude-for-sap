*& Include ZSC4SAP_GS05T
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
