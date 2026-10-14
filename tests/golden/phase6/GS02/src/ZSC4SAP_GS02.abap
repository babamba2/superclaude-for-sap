*&---------------------------------------------------------------------*
*& Module         : CA
*& Program ID     : ZSC4SAP_GS02
*& Tcode          :
*& Old Program ID :
*& Title          : Flight occupancy list
*& Description    : SFLIGHT seat occupancy in a full-screen ALV grid
*&---------------------------------------------------------------------*
*& Change History
*&---------------------------------------------------------------------*
*& Change No | Changed by    | Change Date
*&           | SC4SAP        | 2026-10-12
*&---------------------------------------------------------------------*
REPORT zsc4sap_gs02.

INCLUDE zsc4sap_gs02t.
INCLUDE zsc4sap_gs02s.
INCLUDE zsc4sap_gs02c.
INCLUDE zsc4sap_gs02ct.
INCLUDE zsc4sap_gs02e.
INCLUDE zsc4sap_gs02o.
INCLUDE zsc4sap_gs02i.

INITIALIZATION.
  go_data = NEW #( ).
  go_alv ?= go_data->mo_alv.
  go_data->initialization( ).

START-OF-SELECTION.
  go_data->get_data(
    it_carrid = s_carrid[]
    it_fldate = s_fldate[] ).

END-OF-SELECTION.
  go_alv->display( ).
