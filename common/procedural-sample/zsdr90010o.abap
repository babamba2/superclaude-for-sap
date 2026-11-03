*&---------------------------------------------------------------------*
*& Include          ZSDR90010O
*&---------------------------------------------------------------------*
" PBO modules. Each module body is one PERFORM line.
" Screen flow logic: zsdr90010.screen_0100.abap.

MODULE status_0100 OUTPUT.
  PERFORM set_status_0100.
ENDMODULE.

MODULE init_alv_0100 OUTPUT.
  PERFORM init_alv_0100.
ENDMODULE.
