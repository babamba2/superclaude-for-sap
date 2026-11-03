* Screen 0100 - flow logic (SE51)
* Elements : OK_CODE field NAME = GV_OKCODE. No custom control:
*             the docking container attaches to the screen itself.
* GUI status 0100 : BACK / EXIT / CANC as exit commands (type E),
*                   application toolbar REFRESH, CLOSE.
* Title 0100      : program title.
PROCESS BEFORE OUTPUT.
  MODULE status_0100.
  MODULE init_alv_0100.

PROCESS AFTER INPUT.
  MODULE exit_0100 AT EXIT-COMMAND.
  MODULE user_command_0100.
