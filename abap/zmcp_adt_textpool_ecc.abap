FUNCTION zmcp_adt_textpool
  IMPORTING
    VALUE(iv_action)        TYPE string
    VALUE(iv_program)       TYPE string
    VALUE(iv_language)      TYPE string
    VALUE(iv_textpool_json) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_TEXTPOOL — ECC variant (ABAP 7.40 / ECC).
*
* Divergences from the S/4HANA primary (abap/zmcp_adt_textpool.abap):
*   1. Inline FUNCTION signature (no `*"Local Interface:` comment block) —
*      required because the ADT REST API used by the Step 9a installer
*      rejects comment-block parameter declarations. Logic is identical
*      to the primary; only the header format differs today.
*
* Supported actions:
*   READ            — Read text pool (READ TEXTPOOL, active version)
*   WRITE           — Write text pool (INSERT TEXTPOOL STATE 'A')
*   WRITE_INACTIVE  — Stage text pool inactive (INSERT TEXTPOOL STATE 'I');
*                     program activation promotes it to active.

  DATA: lt_textpool TYPE TABLE OF textpool,
        lv_program  TYPE syrepid,
        lv_language TYPE sy-langu.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_program = to_upper( iv_program ).

  IF iv_language IS NOT INITIAL.
    lv_language = iv_language(1).
  ELSE.
    lv_language = sy-langu.
  ENDIF.

  TRY.
      CASE iv_action.

        WHEN 'READ'.
          READ TEXTPOOL lv_program INTO lt_textpool LANGUAGE lv_language.
          ev_subrc = sy-subrc.

          IF sy-subrc <> 0.
            ev_message = |READ TEXTPOOL failed for { lv_program } (lang={ lv_language })|.
            ev_result  = '[]'.
          ELSE.
            DATA: lt_rows TYPE TABLE OF textpool.
            lt_rows = lt_textpool.
            ev_result  = /ui2/cl_json=>serialize( data = lt_rows ).
            ev_message = |Read { lines( lt_rows ) } text pool entries|.
            ev_subrc   = 0.
          ENDIF.

        WHEN 'WRITE'.
          IF iv_textpool_json IS INITIAL.
            ev_subrc   = 4.
            ev_message = 'IV_TEXTPOOL_JSON is required for WRITE action'.
            RETURN.
          ENDIF.

          /ui2/cl_json=>deserialize(
            EXPORTING json = iv_textpool_json
            CHANGING  data = lt_textpool ).

          INSERT TEXTPOOL lv_program FROM lt_textpool
                 LANGUAGE lv_language STATE 'A'.
          ev_subrc = sy-subrc.

          IF sy-subrc <> 0.
            ev_message = |INSERT TEXTPOOL failed for { lv_program } (sy-subrc={ sy-subrc })|.
          ELSE.
            ev_message = |Written { lines( lt_textpool ) } text pool entries for { lv_program }|.
            ev_result  = '{"written":true}'.
          ENDIF.

        WHEN 'WRITE_INACTIVE'.
          IF iv_textpool_json IS INITIAL.
            ev_subrc   = 4.
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
            ev_result  = '{"written":true,"state":"I"}'.
          ENDIF.

        WHEN OTHERS.
          ev_subrc   = 4.
          ev_message = |Unknown action: { iv_action }. Use READ, WRITE, or WRITE_INACTIVE.|.

      ENDCASE.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.
