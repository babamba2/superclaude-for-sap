*& Include ZSC4SAP_GS07T
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

CONSTANTS: gc_dynnr_0100     TYPE sy-dynnr VALUE '0100',
           gc_status_0100    TYPE sy-pfkey VALUE 'STATUS_0100',
           gc_title_0100     TYPE c LENGTH 20 VALUE 'TITLE_0100',
           gc_fcode_back     TYPE sy-ucomm VALUE 'BACK',
           gc_fcode_exit     TYPE sy-ucomm VALUE 'EXIT',
           gc_fcode_canc     TYPE sy-ucomm VALUE 'CANC',
           gc_fcode_refresh  TYPE sy-ucomm VALUE 'REFRESH',
           gc_msgty_success  TYPE sy-msgty VALUE 'S',
           gc_msgty_warning  TYPE sy-msgty VALUE 'W',
           gc_msgty_error    TYPE sy-msgty VALUE 'E',
           gc_dock_extension TYPE i VALUE 3000.

DATA: ok_code       TYPE sy-ucomm,
      gt_flights    TYPE ty_t_flight,
      go_dock       TYPE REF TO cl_gui_docking_container,
      go_grid       TYPE REF TO cl_gui_alv_grid,
      gv_sel_carrid TYPE sflight-carrid,
      gv_sel_fldate TYPE sflight-fldate.
