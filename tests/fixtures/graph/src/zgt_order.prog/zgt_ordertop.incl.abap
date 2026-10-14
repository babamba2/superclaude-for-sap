*&---------------------------------------------------------------------*
*& Include ZGT_ORDERTOP — declarations
*&---------------------------------------------------------------------*
TABLES: zgt_head, zgt_scr.

TYPES: BEGIN OF ty_item,
         vbeln TYPE vbeln_va,
         matnr TYPE matnr,
         qty   TYPE zgt_qty,
       END OF ty_item,
       tt_item TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY.

DATA: gt_item    TYPE tt_item,
      gs_head    TYPE zgt_head,
      zgt_buffer TYPE STANDARD TABLE OF zgt_item_s,
      go_util    TYPE REF TO zcl_gt_util,
      go_app     TYPE REF TO lcl_app,
      gv_flag    TYPE abap_bool,
      gv_char    TYPE c LENGTH 10.

DATA: BEGIN OF gs_cache,
        zgt_cfg TYPE zgt_cfg,
      END OF gs_cache.

DATA: BEGIN OF gs_ext.
        INCLUDE STRUCTURE zgt_ext_s.
DATA:   flag TYPE c,
      END OF gs_ext.

CONSTANTS: gc_fm   TYPE rs38l_fnam VALUE 'Z_GT_CONST_FM',
           gc_prog TYPE progname VALUE 'ZGT_CONST_PROG'.

PARAMETERS p_vkorg LIKE zgt_scr-vkorg.
SELECT-OPTIONS s_vbeln FOR zgt_head-vbeln.

CLASS lcl_app DEFINITION.
  PUBLIC SECTION.
    METHODS run IMPORTING iv_mode TYPE char1
                RAISING   zcx_gt_error.
ENDCLASS.

CLASS lcl_app IMPLEMENTATION.
  METHOD run.
    lcl_app=>helper( ).
  ENDMETHOD.
ENDCLASS.
