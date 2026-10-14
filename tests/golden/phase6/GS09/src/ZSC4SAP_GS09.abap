*&---------------------------------------------------------------------*
*& Module         : CA
*& Program ID     : ZSC4SAP_GS09
*& Tcode          :
*& Old Program ID :
*& Title          : Flights and airlines (tabstrip)
*& Description    : SFLIGHT and SCARR lists on two tabs of screen 0200
*&---------------------------------------------------------------------*
*& Change History
*&---------------------------------------------------------------------*
*& Change No | Changed by    | Change Date
*&           | SC4SAP        | 2026-10-12
*&---------------------------------------------------------------------*
REPORT zsc4sap_gs09.

INCLUDE zsc4sap_gs09t.
INCLUDE zsc4sap_gs09s.
INCLUDE zsc4sap_gs09c.
INCLUDE zsc4sap_gs09ct.
INCLUDE zsc4sap_gs09o.
INCLUDE zsc4sap_gs09i.

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
