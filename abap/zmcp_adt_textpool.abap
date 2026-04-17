FUNCTION zmcp_adt_textpool.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_ACTION) TYPE  STRING
*"     VALUE(IV_PROGRAM) TYPE  STRING
*"     VALUE(IV_LANGUAGE) TYPE  STRING
*"     VALUE(IV_TEXTPOOL_JSON) TYPE  STRING
*"  EXPORTING
*"     VALUE(EV_SUBRC) TYPE  I
*"     VALUE(EV_MESSAGE) TYPE  STRING
*"     VALUE(EV_RESULT) TYPE  STRING
*"----------------------------------------------------------------------
* ZMCP_ADT_TEXTPOOL - Text pool read/write for ABAP programs
* Called via SOAP RFC from mcp-abap-adt MCP server.
*
* Supported actions:
*   READ            - Read text pool (READ TEXTPOOL, active version)
*   WRITE           - Write text pool (INSERT TEXTPOOL with STATE 'A')
*   WRITE_INACTIVE  - Stage text pool inactive (INSERT TEXTPOOL with STATE 'I');
*                     program activation promotes the inactive pool to active.
*                     Use this when registering many text elements before the
*                     parent program is activated — they all go live together
*                     with the next program activation.
*
* Text pool rows JSON format:
*   [{"ID":"I","KEY":"001","ENTRY":"Text symbol 001","LENGTH":16},...]
*   ID: I=text symbol, S=selection text, R=program title, H=list heading
*----------------------------------------------------------------------

  DATA: lt_textpool TYPE TABLE OF textpool,
        lv_program  TYPE syrepid,
        lv_language TYPE sy-langu.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_program = to_upper( iv_program ).

* Determine language
  IF iv_language IS NOT INITIAL.
    lv_language = iv_language(1).
  ELSE.
    lv_language = sy-langu.
  ENDIF.

  TRY.
      CASE iv_action.

        WHEN 'READ'.
*-------- Read text pool --------
          READ TEXTPOOL lv_program INTO lt_textpool LANGUAGE lv_language.
          ev_subrc = sy-subrc.

          IF sy-subrc <> 0.
            ev_message = |READ TEXTPOOL failed for { lv_program } (lang={ lv_language })|.
            ev_result = '[]'.
          ELSE.
* Convert to JSON array
            DATA: lt_rows TYPE TABLE OF textpool.
            lt_rows = lt_textpool.
            ev_result = /ui2/cl_json=>serialize( data = lt_rows ).
            ev_message = |Read { lines( lt_rows ) } text pool entries|.
            ev_subrc = 0.
          ENDIF.

        WHEN 'WRITE'.
*-------- Write text pool (active) --------
          IF iv_textpool_json IS INITIAL.
            ev_subrc = 4.
            ev_message = 'IV_TEXTPOOL_JSON is required for WRITE action'.
            RETURN.
          ENDIF.

* Deserialize JSON to textpool table
          /ui2/cl_json=>deserialize(
            EXPORTING json = iv_textpool_json
            CHANGING  data = lt_textpool ).

* INSERT TEXTPOOL replaces the entire language-specific pool
* STATE 'A' = active version (no separate activation needed)
          INSERT TEXTPOOL lv_program FROM lt_textpool
                 LANGUAGE lv_language STATE 'A'.
          ev_subrc = sy-subrc.

          IF sy-subrc <> 0.
            ev_message = |INSERT TEXTPOOL failed for { lv_program } (sy-subrc={ sy-subrc })|.
          ELSE.
            ev_message = |Written { lines( lt_textpool ) } text pool entries for { lv_program }|.
            ev_result = '{"written":true}'.
          ENDIF.

        WHEN 'WRITE_INACTIVE'.
*-------- Stage text pool as inactive --------
* Writes STATE 'I' so the pool is inactive-staged. The parent program's
* activation promotes it to STATE 'A' together with the program's other
* inactive artefacts. This is the correct pattern when registering many
* text elements on a freshly-created program before its first activation
* — it keeps every type (R/I/S/H) in sync with the program lifecycle.
          IF iv_textpool_json IS INITIAL.
            ev_subrc = 4.
            ev_message = 'IV_TEXTPOOL_JSON is required for WRITE_INACTIVE action'.
            RETURN.
          ENDIF.

          /ui2/cl_json=>deserialize(
            EXPORTING json = iv_textpool_json
            CHANGING  data = lt_textpool ).

          INSERT TEXTPOOL lv_program FROM lt_textpool
                 LANGUAGE lv_language STATE 'I'.
          ev_subrc = sy-subrc.

          IF sy-subrc <> 0.
            ev_message = |INSERT TEXTPOOL (inactive) failed for { lv_program } (sy-subrc={ sy-subrc })|.
          ELSE.
            ev_message = |Staged { lines( lt_textpool ) } inactive text pool entries for { lv_program }|.
            ev_result = '{"written":true,"state":"I"}'.
          ENDIF.

        WHEN OTHERS.
          ev_subrc = 4.
          ev_message = |Unknown action: { iv_action }. Use READ, WRITE, or WRITE_INACTIVE.|.

      ENDCASE.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.
