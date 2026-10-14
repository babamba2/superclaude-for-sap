CLASS zcl_gt_util DEFINITION
  PUBLIC
  INHERITING FROM zcl_gt_base
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_gt_api.
    CLASS-METHODS static_call.
ENDCLASS.

CLASS zcl_gt_util IMPLEMENTATION.
  METHOD static_call.
    SELECT SINGLE * FROM zgt_cfg INTO @DATA(ls_cfg).
    zcl_gt_util=>other( ).
  ENDMETHOD.
ENDCLASS.
