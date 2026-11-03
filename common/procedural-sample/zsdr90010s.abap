*&---------------------------------------------------------------------*
*& Include          ZSDR90010S
*&---------------------------------------------------------------------*
" Block 1: selection criteria. Block 2: options on one line
" (COMMENT + POSITION). Block 3: output control (layout variant, batch).
" Every SELECT-OPTIONS / PARAMETERS name needs a selection text (type S).

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-b01.
SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_vtweg FOR vbak-vtweg,
                s_auart FOR vbak-auart,
                s_audat FOR vbak-audat OBLIGATORY,
                s_vbeln FOR vbak-vbeln,
                s_kunnr FOR vbak-kunnr.

SELECTION-SCREEN SKIP 1.

SELECT-OPTIONS: s_matnr FOR vbap-matnr,
                s_werks FOR vbap-werks.
SELECTION-SCREEN END OF BLOCK b01.

SELECTION-SCREEN BEGIN OF BLOCK b02 WITH FRAME TITLE TEXT-b02.
SELECTION-SCREEN BEGIN OF LINE.
SELECTION-SCREEN COMMENT 1(20) TEXT-t01.

SELECTION-SCREEN POSITION 33.
PARAMETERS p_open RADIOBUTTON GROUP g01 DEFAULT 'X'.
SELECTION-SCREEN COMMENT (15) TEXT-t02 FOR FIELD p_open.

SELECTION-SCREEN POSITION 53.
PARAMETERS p_done RADIOBUTTON GROUP g01.
SELECTION-SCREEN COMMENT (15) TEXT-t03 FOR FIELD p_done.

SELECTION-SCREEN POSITION 73.
PARAMETERS p_all RADIOBUTTON GROUP g01.
SELECTION-SCREEN COMMENT (15) TEXT-t04 FOR FIELD p_all.
SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN END OF BLOCK b02.

SELECTION-SCREEN BEGIN OF BLOCK b03 WITH FRAME TITLE TEXT-b03.
PARAMETERS: p_var TYPE slis_vari MODIF ID var,
            p_bat AS CHECKBOX USER-COMMAND bat.
SELECTION-SCREEN END OF BLOCK b03.
