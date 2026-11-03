*&---------------------------------------------------------------------*
*& Include          ZSDR90010I
*&---------------------------------------------------------------------*
" PAI modules. Each module body is one PERFORM line; the FORMs read
" GV_OKCODE (never sy-ucomm) - see common/ok-code-pattern.md.

MODULE exit_0100 INPUT.
  PERFORM exit_0100.
ENDMODULE.

MODULE user_command_0100 INPUT.
  PERFORM user_command_0100.
ENDMODULE.
