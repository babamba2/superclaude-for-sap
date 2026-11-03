*&---------------------------------------------------------------------*
*& Include          ZSDR90010T
*&---------------------------------------------------------------------*
" Every global TYPES / CONSTANTS / DATA of the program lives here.
" Order: TABLES -> CONSTANTS -> TYPES -> data tables -> ALV objects
"        -> screen state. FORM-local data stays inside the FORM.

" Work areas for SELECT-OPTIONS ... FOR only
TABLES: vbak, vbap.

" Function codes (GUI status 0100 + ALV toolbar)
CONSTANTS: gc_fcode_back    TYPE sy-ucomm VALUE 'BACK',
           gc_fcode_exit    TYPE sy-ucomm VALUE 'EXIT',
           gc_fcode_canc    TYPE sy-ucomm VALUE 'CANC',
           gc_fcode_refresh TYPE sy-ucomm VALUE 'REFRESH',
           gc_fcode_close   TYPE sy-ucomm VALUE 'CLOSE',
           gc_fcode_detail  TYPE sy-ucomm VALUE 'DETAIL',
           gc_fcode_enter   TYPE sy-ucomm VALUE 'ENTR'.

" ALV handles: one per grid, also the layout-variant handle
CONSTANTS: gc_handle_head TYPE slis_handl VALUE 'H',
           gc_handle_item TYPE slis_handl VALUE 'I'.

CONSTANTS: gc_vbtyp_delivery TYPE vbfa-vbtyp_n VALUE 'J',
           gc_item_height    TYPE i            VALUE 50,
           gc_max_days       TYPE i            VALUE 366,
           gc_default_days   TYPE i            VALUE 30,
           gc_save_all       TYPE char1        VALUE 'A'.

" Read buffer: one row per sales order item
TYPES: BEGIN OF ty_so,
         vbeln  TYPE vbak-vbeln,
         auart  TYPE vbak-auart,
         audat  TYPE vbak-audat,
         vkorg  TYPE vbak-vkorg,
         vtweg  TYPE vbak-vtweg,
         kunnr  TYPE vbak-kunnr,
         waerk  TYPE vbak-waerk,
         posnr  TYPE vbap-posnr,
         matnr  TYPE vbap-matnr,
         arktx  TYPE vbap-arktx,
         kwmeng TYPE vbap-kwmeng,
         vrkme  TYPE vbap-vrkme,
         netwr  TYPE vbap-netwr,
         werks  TYPE vbap-werks,
         lgort  TYPE vbap-lgort,
       END OF ty_so,
       ty_t_so TYPE STANDARD TABLE OF ty_so WITH DEFAULT KEY.

" Document flow order item -> delivery item
TYPES: BEGIN OF ty_flow,
         vbelv TYPE vbfa-vbelv,
         posnv TYPE vbfa-posnv,
         vbeln TYPE vbfa-vbeln,
         posnn TYPE vbfa-posnn,
         rfmng TYPE vbfa-rfmng,
       END OF ty_flow,
       ty_t_flow TYPE SORTED TABLE OF ty_flow
                 WITH NON-UNIQUE KEY vbelv posnv.

TYPES: BEGIN OF ty_kna1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
       END OF ty_kna1,
       ty_t_kna1 TYPE SORTED TABLE OF ty_kna1 WITH UNIQUE KEY kunnr.

" ALV output - header grid (one row per order)
TYPES: BEGIN OF ty_head,
         status   TYPE icon_d,
         vbeln    TYPE vbak-vbeln,
         auart    TYPE vbak-auart,
         audat    TYPE vbak-audat,
         vkorg    TYPE vbak-vkorg,
         vtweg    TYPE vbak-vtweg,
         kunnr    TYPE vbak-kunnr,
         name1    TYPE kna1-name1,
         item_cnt TYPE i,
         open_cnt TYPE i,
         netwr    TYPE vbap-netwr,
         waerk    TYPE vbak-waerk,
       END OF ty_head,
       ty_t_head TYPE STANDARD TABLE OF ty_head WITH DEFAULT KEY.

" ALV output - item grid (items of one order)
TYPES: BEGIN OF ty_item,
         status TYPE icon_d,
         vbeln  TYPE vbap-vbeln,
         posnr  TYPE vbap-posnr,
         matnr  TYPE vbap-matnr,
         arktx  TYPE vbap-arktx,
         kwmeng TYPE vbap-kwmeng,
         lfimg  TYPE vbfa-rfmng,
         vrkme  TYPE vbap-vrkme,
         netwr  TYPE vbap-netwr,
         waerk  TYPE vbak-waerk,
         werks  TYPE vbap-werks,
         lgort  TYPE vbap-lgort,
       END OF ty_item,
       ty_t_item TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.

" One settings bundle per grid - passed as ONE parameter to ALV FORMs
TYPES: BEGIN OF ty_alv,
         handle   TYPE slis_handl,
         grid     TYPE REF TO cl_gui_alv_grid,
         variant  TYPE disvariant,
         layout   TYPE lvc_s_layo,
         fieldcat TYPE lvc_t_fcat,
         sort     TYPE lvc_t_sort,
         exclude  TYPE ui_functions,
       END OF ty_alv.

" Main data tables (ALV outtabs must stay global)
DATA: gt_head     TYPE ty_t_head,
      gt_item_all TYPE ty_t_item,
      gt_item     TYPE ty_t_item.

" ALV event receiver - defined in ZSDR90010C
CLASS lcl_event_handler DEFINITION DEFERRED.
DATA go_event_head TYPE REF TO lcl_event_handler.

" ALV objects: docking container -> splitter (top: header, bottom: item)
DATA: go_docking   TYPE REF TO cl_gui_docking_container,
      go_splitter  TYPE REF TO cl_gui_splitter_container,
      go_cont_head TYPE REF TO cl_gui_container,
      go_cont_item TYPE REF TO cl_gui_container,
      gs_alv_head  TYPE ty_alv,
      gs_alv_item  TYPE ty_alv.

" Screen state - one OK_CODE variable for every screen
DATA: gv_okcode    TYPE sy-ucomm,
      gv_is_detail TYPE abap_bool.
