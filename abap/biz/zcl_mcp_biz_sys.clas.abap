CLASS zcl_mcp_biz_sys DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Factory of the system-family reads (ZIF_MCP_BIZ_SYS).
* ZCL_MCP_BIZ_SYS_S4 is installed on S/4HANA only; it is created by name so this class
* compiles on ECC, where the ECC implementation is used. Written in 7.31 syntax.

  PUBLIC SECTION.
    CONSTANTS c_s4_class TYPE seoclsname VALUE 'ZCL_MCP_BIZ_SYS_S4'.

    CLASS-METHODS get
      RETURNING VALUE(ro_sys) TYPE REF TO zif_mcp_biz_sys.

  PRIVATE SECTION.
    CLASS-DATA go_sys TYPE REF TO zif_mcp_biz_sys.
ENDCLASS.


CLASS zcl_mcp_biz_sys IMPLEMENTATION.

  METHOD get.
    DATA lo_obj TYPE REF TO object.

    IF go_sys IS INITIAL.
      TRY.
          CREATE OBJECT lo_obj TYPE (c_s4_class).
          go_sys ?= lo_obj.
        CATCH cx_sy_create_object_error cx_sy_move_cast_error.
          CLEAR go_sys.
      ENDTRY.
      IF go_sys IS INITIAL.
        CREATE OBJECT go_sys TYPE zcl_mcp_biz_sys_ecc.
      ENDIF.
    ENDIF.
    ro_sys = go_sys.
  ENDMETHOD.

ENDCLASS.
