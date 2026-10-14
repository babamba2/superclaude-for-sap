*& Include ZSC4SAP_GS05E
AT SELECTION-SCREEN.
  PERFORM check_carriers USING s_carrid[].

START-OF-SELECTION.
  PERFORM get_data USING s_carrid[] s_fldate[].

END-OF-SELECTION.
  PERFORM display_data.
