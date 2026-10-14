*&---------------------------------------------------------------------*
*& Module         : CA
*& Program ID     : ZSC4SAP_GS08
*& Tcode          :
*& Old Program ID :
*& Title          : Flights of one airline
*& Description    : Flights of one airline (validated by FM) in a SALV popup
*&---------------------------------------------------------------------*
*& Change History
*&---------------------------------------------------------------------*
*& Change No | Changed by    | Change Date
*&           | SC4SAP        | 2026-10-12
*&---------------------------------------------------------------------*
REPORT zsc4sap_gs08.

INCLUDE zsc4sap_gs08t.
INCLUDE zsc4sap_gs08s.
INCLUDE zsc4sap_gs08f.

AT SELECTION-SCREEN.
  PERFORM check_carrier USING p_carrid.

START-OF-SELECTION.
  PERFORM get_data USING p_carrid s_fldate[].

END-OF-SELECTION.
  PERFORM display_data.
