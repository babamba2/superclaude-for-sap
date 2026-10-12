*&---------------------------------------------------------------------*
*& Module         : MM
*& Program ID     : ZRSC4SAP_OOP_EX
*& Tcode          :
*& Old Program ID :
*& Title          : Sample OOP ALV program (sc4sap template)
*& Description    : PO list as grid (0100) or tree + grid (0200)
*&---------------------------------------------------------------------*
*& Change History
*&---------------------------------------------------------------------*
*& Change No | Changed by    | Change Date
*&           | SC4SAP        | 2026-10-12
*&---------------------------------------------------------------------*
REPORT ZRSC4SAP_OOP_EX.

INCLUDE ZRSC4SAP_OOP_EXT.     "TOP
INCLUDE ZRSC4SAP_OOP_EXS.     "Selection screen
INCLUDE ZRSC4SAP_OOP_EXC.     "LCL_DATA + LCL_ALV
INCLUDE ZRSC4SAP_OOP_EXCT.    "Unit tests (LCL_TEST)
INCLUDE ZRSC4SAP_OOP_EXE.     "Event handler classes
INCLUDE ZRSC4SAP_OOP_EXO.     "PBO
INCLUDE ZRSC4SAP_OOP_EXI.     "PAI

*----------------------------------------------------------------------*
* INITIALIZATION
*----------------------------------------------------------------------*
INITIALIZATION.
  GO_DATA = NEW #( ).
  GO_ALV ?= GO_DATA->MO_ALV.
  GO_DATA->INITIALIZATION( ).

*----------------------------------------------------------------------*
* AT SELECTION-SCREEN OUTPUT
*----------------------------------------------------------------------*
AT SELECTION-SCREEN OUTPUT.
  GO_DATA->HANDLE_SCREEN( ).

*----------------------------------------------------------------------*
* START-OF-SELECTION
*----------------------------------------------------------------------*
START-OF-SELECTION.
  GO_DATA->GET_DATA( ).

*----------------------------------------------------------------------*
* END-OF-SELECTION
*----------------------------------------------------------------------*
END-OF-SELECTION.
  GO_ALV->DISPLAY( ).
