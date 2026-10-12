*&---------------------------------------------------------------------*
*& Module         : CA
*& Program ID     : ZSC4SAP_GS07
*& Tcode          :
*& Old Program ID :
*& Title          : Flight list (ALV grid)
*& Description    : Flight list with airline names in a full-screen ALV grid
*&---------------------------------------------------------------------*
*& Change History
*&---------------------------------------------------------------------*
*& Change No | Changed by    | Change Date
*&           | SC4SAP        | 2026-10-12
*&---------------------------------------------------------------------*
REPORT zsc4sap_gs07.

INCLUDE zsc4sap_gs07t.
INCLUDE zsc4sap_gs07s.
INCLUDE zsc4sap_gs07o.
INCLUDE zsc4sap_gs07i.
INCLUDE zsc4sap_gs07f.

AT SELECTION-SCREEN.
  PERFORM check_carriers USING s_carrid[].

START-OF-SELECTION.
  PERFORM get_data USING s_carrid[] s_fldate[].

END-OF-SELECTION.
  PERFORM display_0100.
