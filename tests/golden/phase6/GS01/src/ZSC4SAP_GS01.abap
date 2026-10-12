*&---------------------------------------------------------------------*
*& Module         : CA
*& Program ID     : ZSC4SAP_GS01
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
REPORT zsc4sap_gs01.

INCLUDE zsc4sap_gs01t.
INCLUDE zsc4sap_gs01s.
INCLUDE zsc4sap_gs01c.
INCLUDE zsc4sap_gs01ct.
INCLUDE zsc4sap_gs01e.
INCLUDE zsc4sap_gs01o.
INCLUDE zsc4sap_gs01i.

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
