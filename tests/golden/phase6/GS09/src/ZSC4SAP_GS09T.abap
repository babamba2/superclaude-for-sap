*& Include ZSC4SAP_GS09T
TYPES: BEGIN OF ty_flight,
         carrid    TYPE sflight-carrid,
         connid    TYPE sflight-connid,
         fldate    TYPE sflight-fldate,
         price     TYPE sflight-price,
         currency  TYPE sflight-currency,
         seatsmax  TYPE sflight-seatsmax,
         seatsocc  TYPE sflight-seatsocc,
         seatsfree TYPE sflight-seatsmax,
       END OF ty_flight,
       ty_t_flight TYPE STANDARD TABLE OF ty_flight
                   WITH NON-UNIQUE KEY carrid connid fldate.

TYPES: BEGIN OF ty_carrier,
         carrid   TYPE scarr-carrid,
         carrname TYPE scarr-carrname,
         currcode TYPE scarr-currcode,
         url      TYPE scarr-url,
       END OF ty_carrier,
       ty_t_carrier TYPE STANDARD TABLE OF ty_carrier
                    WITH NON-UNIQUE KEY carrid.

TYPES: ty_r_carrid TYPE RANGE OF sflight-carrid,
       ty_r_fldate TYPE RANGE OF sflight-fldate.

CONSTANTS: BEGIN OF gc_tab_0200,
             tab1 TYPE sy-ucomm VALUE 'TAB1',
             tab2 TYPE sy-ucomm VALUE 'TAB2',
           END OF gc_tab_0200.

CONSTANTS: gc_dynnr_0200     TYPE sy-dynnr VALUE '0200',
           gc_dynnr_0210     TYPE sy-dynnr VALUE '0210',
           gc_dynnr_0220     TYPE sy-dynnr VALUE '0220',
           gc_status_0200    TYPE sy-pfkey VALUE 'STATUS_0200',
           gc_title_0200     TYPE c LENGTH 20 VALUE 'TITLE_0200',
           gc_cc_0210        TYPE c LENGTH 30 VALUE 'CC_0210',
           gc_cc_0220        TYPE c LENGTH 30 VALUE 'CC_0220',
           gc_fcode_back     TYPE sy-ucomm VALUE 'BACK',
           gc_fcode_exit     TYPE sy-ucomm VALUE 'EXIT',
           gc_fcode_canc     TYPE sy-ucomm VALUE 'CANC',
           gc_fcode_refresh  TYPE sy-ucomm VALUE 'REFRESH',
           gc_msgty_success  TYPE sy-msgty VALUE 'S',
           gc_msgty_warning  TYPE sy-msgty VALUE 'W',
           gc_msgty_error    TYPE sy-msgty VALUE 'E',
           gc_sign_include   TYPE ddsign   VALUE 'I',
           gc_option_between TYPE ddoption VALUE 'BT',
           gc_first_day      TYPE c LENGTH 4 VALUE '0101',
           gc_last_day       TYPE c LENGTH 4 VALUE '1231'.

CONTROLS ts_main TYPE TABSTRIP.

DATA: BEGIN OF gs_ts_main,
        pressed_tab TYPE sy-ucomm VALUE gc_tab_0200-tab1,
        subscreen   TYPE sy-dynnr,
      END OF gs_ts_main.

DATA: ok_code       TYPE sy-ucomm,
      gv_sel_carrid TYPE sflight-carrid,
      gv_sel_fldate TYPE sflight-fldate.
