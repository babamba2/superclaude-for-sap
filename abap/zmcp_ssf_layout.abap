FUNCTION zmcp_ssf_layout
  IMPORTING
    VALUE(iv_formname) TYPE tdsfname
    VALUE(iv_language) TYPE spras OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_SSF_LAYOUT - read-only: page / window layout of one SmartForm.
*
* Function group ZMCP_ADT_UTILS, NOT remote-enabled - ZMCP_ADT_DISPATCH
* action SSF_LAYOUT calls it (MCP tool GetSmartFormLayout). One source for
* BASIS 7.31 and 7.40: no inline declarations, no NEW / VALUE / CONV /
* COND / REDUCE, no /UI2/CL_JSON, no ZCL_MCP_JSON - the JSON is built here.
*
* Source: the Form Builder object model (package SMART, public attributes)
*   CL_SSF_FB_SMART_FORM->ENQUEUE( mode = 'SHOW' ) - display access only
*     (RS_ACCESS_PERMISSION SHOW, no edit lock). Called before LOAD so that
*     LOAD keeps IM_LANGUAGE (on a fresh object LOAD enqueues itself and
*     replaces the language with the modification / logon language).
*   CL_SSF_FB_SMART_FORM->LOAD( im_formname im_language im_active = 'X' )
*     active version; a form that was never activated is read from its
*     saved inactive version (retry with im_active = space, "active":false).
*     Raises CX_SSF_FB (NO_FORM / NO_ACTIVE_SOURCE / NO_SOURCE).
*   form->VARHEADER (line SSFVARHDR): PAGEFORMAT, CPI, LPI, STDSTYLE,
*     PAGETREE = root CL_SSF_FB_NODE of the page tree.
*   CL_SSF_FB_NODE: OBJ (page / window / ...), OUTATTR, SUCC (children).
*   CL_SSF_FB_PAGE:   NAME, CAPTION, NEXTPAGE, PAGEORTN, PRINTMODE.
*   CL_SSF_FB_WINDOW: NAME, CAPTION, WTYPE, WLEVEL.
*   Window position is on the window NODE's OUTATTR (one node per page
*   placement): WLEFT/U_WLEFT, WTOP/U_WTOP, WWIDTH/U_WWIDTH,
*   WHEIGHT/U_WHEIGHT, WFRAME/U_WFRAME, WSHADING, WEMPTY.
*   Graphic and address nodes placed directly on a page (OBJ is a
*   CL_SSF_FB_GRAPHIC / CL_SSF_FB_ADDRESS) are listed as windows with type
*   'G' / 'A'. Only the node's OUTATTR is read for them; name and caption
*   come from CL_SSF_FB_SF_OBJECT when OBJ is one (else empty) - no
*   attribute of the graphic / address classes themselves is used.
*   Node kinds are recognised by casting OBJ, so the CSSF type pool is not
*   needed in the function group.
*
*   IV_FORMNAME  SmartForm name (STXFADM)
*   IV_LANGUAGE  form language; initial -> master language of the form
*   EV_SUBRC     0 ok, 4 form not found, 8 other error (EV_MESSAGE)
*                4 uses message SMARTFORMS 200 (as in transaction
*                SMARTFORMS) in the logon language: no STXFADM header at all
*                (e.g. only a TADIR entry is left), or - with " (language X)"
*                appended - a header whose LOAD raised NO_FORM
*   EV_RESULT    {"form","language","masterLanguage","active","variants":[
*                  {"variant","pageFormat","cpi","lpi","stdStyle","pages":[
*                    {"name","caption","nextPage","orientation","printMode",
*                     "windows":[{"name","caption","wtype",
*                       "wlevel","wleft","u_wleft","wtop","u_wtop",
*                       "wwidth","u_wwidth","wheight","u_wheight",
*                       "wframe","u_wframe","wshading","wempty"}]}]}]}
*                coordinates are returned raw, each with its own unit;
*                a node without OUTATTR has no coordinate fields.
*
* Read-only. Layout only: text node contents, program lines, global data
* and the form interface are never read out. Load one form per call -
* the node classes cache loaded nodes by name in static tables.

  DATA: lv_form    TYPE tdsfname,
        lv_master  TYPE spras,
        lv_lang    TYPE spras,
        lo_form    TYPE REF TO cl_ssf_fb_smart_form,
        lx_ssf     TYPE REF TO cx_ssf_fb,
        lx_root    TYPE REF TO cx_root,
        ls_var     TYPE ssfvarhdr,
        lv_vars    TYPE string,
        lv_sep     TYPE string,
        lv_pages   TYPE string,
        lv_page    TYPE string,
        lv_wins    TYPE string,
        lv_j1      TYPE string,
        lv_j2      TYPE string,
        lv_j3      TYPE string,
        lv_j4      TYPE string,
        lv_j5      TYPE string,
        lv_j6      TYPE string,
        lv_active  TYPE string,
        lv_count   TYPE i.

  ev_subrc = 0.
  CLEAR: ev_message, ev_result.

  lv_form = iv_formname.
  SHIFT lv_form LEFT DELETING LEADING space.
  TRANSLATE lv_form TO UPPER CASE.
  IF lv_form IS INITIAL.
    ev_subrc   = 8.
    ev_message = 'IV_FORMNAME is empty'.
    ev_result  = '{}'.
    RETURN.
  ENDIF.

  SELECT SINGLE masterlang FROM stxfadm INTO lv_master
    WHERE formname = lv_form.
  IF sy-subrc <> 0.
    ev_subrc   = 4.
    " Same text as transaction SMARTFORMS: "Form or text & does not exist".
    MESSAGE ID 'SMARTFORMS' TYPE 'S' NUMBER '200' WITH lv_form
      INTO ev_message.
    ev_result  = '{}'.
    RETURN.
  ENDIF.

  lv_lang = iv_language.
  IF lv_lang IS INITIAL.
    lv_lang = lv_master.
  ENDIF.
  IF lv_lang IS INITIAL.
    lv_lang = sy-langu.
  ENDIF.

  lv_active = 'true'.
  CREATE OBJECT lo_form.
  TRY.
      " Display access first: LOAD then keeps IM_LANGUAGE.
      lo_form->enqueue( mode     = 'SHOW'
                        formname = lv_form ).
      TRY.
          lo_form->load( im_formname = lv_form
                         im_language = lv_lang
                         im_active   = 'X' ).
        CATCH cx_ssf_fb INTO lx_ssf.
          IF lx_ssf->textid <> cx_ssf_fb=>no_active_source.
            RAISE EXCEPTION lx_ssf.
          ENDIF.
          " Never activated: read the saved (inactive) version.
          CLEAR lx_ssf.
          lv_active = 'false'.
          lo_form->load( im_formname = lv_form
                         im_language = lv_lang
                         im_active   = space ).
      ENDTRY.
    CATCH cx_ssf_fb INTO lx_ssf.
      IF lx_ssf->textid = cx_ssf_fb=>no_form.
        ev_subrc   = 4.
        MESSAGE ID 'SMARTFORMS' TYPE 'S' NUMBER '200' WITH lv_form
          INTO ev_message.
        ev_message = |{ ev_message } (language { lv_lang })|.
      ELSE.
        ev_subrc = 8.
        IF lx_ssf->msgid IS NOT INITIAL.
          MESSAGE ID lx_ssf->msgid TYPE 'S' NUMBER lx_ssf->msgno
            WITH lx_ssf->msgv1 lx_ssf->msgv2 lx_ssf->msgv3 lx_ssf->msgv4
            INTO ev_message.
        ELSE.
          ev_message = lx_ssf->get_text( ).
        ENDIF.
        IF ev_message IS INITIAL.
          ev_message = |SmartForm { lv_form } could not be loaded|.
        ENDIF.
      ENDIF.
      ev_result = '{}'.
      RETURN.
    CATCH cx_root INTO lx_root.
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
      ev_result  = '{}'.
      RETURN.
  ENDTRY.

  TRY.
      LOOP AT lo_form->varheader INTO ls_var.
        CLEAR: lv_pages, lv_page, lv_wins.
        IF ls_var-pagetree IS BOUND.
          PERFORM ssf_layout_walk USING ls_var-pagetree
                                  CHANGING lv_pages lv_page lv_wins.
          PERFORM ssf_layout_close_page CHANGING lv_pages lv_page lv_wins.
        ENDIF.

        PERFORM ssf_layout_str USING ls_var-vari       CHANGING lv_j1.
        PERFORM ssf_layout_str USING ls_var-pageformat CHANGING lv_j2.
        PERFORM ssf_layout_num USING ls_var-cpi        CHANGING lv_j3.
        PERFORM ssf_layout_num USING ls_var-lpi        CHANGING lv_j4.
        PERFORM ssf_layout_str USING ls_var-stdstyle   CHANGING lv_j5.
        lv_vars = |{ lv_vars }{ lv_sep }\{"variant":{ lv_j1 },"pageFormat":{ lv_j2 }|
               && |,"cpi":{ lv_j3 },"lpi":{ lv_j4 },"stdStyle":{ lv_j5 }|
               && |,"pages":[{ lv_pages }]\}|.
        lv_sep = ','.
        lv_count = lv_count + 1.
      ENDLOOP.
    CATCH cx_root INTO lx_root.
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
      ev_result  = '{}'.
      RETURN.
  ENDTRY.

  PERFORM ssf_layout_str USING lv_form                CHANGING lv_j1.
  PERFORM ssf_layout_str USING lv_lang                CHANGING lv_j2.
  PERFORM ssf_layout_str USING lv_master              CHANGING lv_j6.
  ev_result = |\{"form":{ lv_j1 },"language":{ lv_j2 },"masterLanguage":{ lv_j6 }|
           && |,"active":{ lv_active },"variants":[{ lv_vars }]\}|.
  ev_message = |SmartForm { lv_form }: { lv_count } variant(s)|.

ENDFUNCTION.


*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT_WALK - page tree in tree order
*&---------------------------------------------------------------------*
* A page node opens a new page entry; a window node - or a graphic /
* address node directly on the page - adds a window to the current page.
* The walk never descends into a window (its children are the window
* contents: text, tables, code - not part of the layout).
FORM ssf_layout_walk USING io_node TYPE REF TO cl_ssf_fb_node
                     CHANGING cv_pages TYPE string
                              cv_page  TYPE string
                              cv_wins  TYPE string.

  DATA: lo_page  TYPE REF TO cl_ssf_fb_page,
        lo_win   TYPE REF TO cl_ssf_fb_window,
        lo_graph TYPE REF TO cl_ssf_fb_graphic,
        lo_addr  TYPE REF TO cl_ssf_fb_address,
        lo_sfobj TYPE REF TO cl_ssf_fb_sf_object,
        lo_child TYPE REF TO cl_ssf_fb_node,
        lv_code  TYPE c LENGTH 1,
        lv_name  TYPE string,
        lv_capt  TYPE string,
        lv_json  TYPE string,
        lv_j1    TYPE string,
        lv_j2    TYPE string,
        lv_j3    TYPE string,
        lv_j4    TYPE string,
        lv_j5    TYPE string.

  IF io_node IS NOT BOUND.
    RETURN.
  ENDIF.

  IF io_node->obj IS BOUND.
    TRY.
        lo_page ?= io_node->obj.
      CATCH cx_sy_move_cast_error.
        CLEAR lo_page.
    ENDTRY.
    IF lo_page IS NOT BOUND.
      TRY.
          lo_win ?= io_node->obj.
        CATCH cx_sy_move_cast_error.
          CLEAR lo_win.
      ENDTRY.
    ENDIF.
    IF lo_page IS NOT BOUND AND lo_win IS NOT BOUND.
      TRY.
          lo_graph ?= io_node->obj.
          lv_code = 'G'.
        CATCH cx_sy_move_cast_error.
          CLEAR lo_graph.
      ENDTRY.
      IF lo_graph IS NOT BOUND.
        TRY.
            lo_addr ?= io_node->obj.
            lv_code = 'A'.
          CATCH cx_sy_move_cast_error.
            CLEAR lo_addr.
        ENDTRY.
      ENDIF.
    ENDIF.
  ENDIF.

  IF lo_page IS BOUND.
    PERFORM ssf_layout_close_page CHANGING cv_pages cv_page cv_wins.
    PERFORM ssf_layout_str USING lo_page->name      CHANGING lv_j1.
    PERFORM ssf_layout_str USING lo_page->caption   CHANGING lv_j2.
    PERFORM ssf_layout_str USING lo_page->nextpage  CHANGING lv_j3.
    PERFORM ssf_layout_str USING lo_page->pageortn  CHANGING lv_j4.
    PERFORM ssf_layout_str USING lo_page->printmode CHANGING lv_j5.
    cv_page = |\{"name":{ lv_j1 },"caption":{ lv_j2 },"nextPage":{ lv_j3 }|
           && |,"orientation":{ lv_j4 },"printMode":{ lv_j5 }|.
    LOOP AT io_node->succ INTO lo_child.
      PERFORM ssf_layout_walk USING lo_child
                              CHANGING cv_pages cv_page cv_wins.
    ENDLOOP.
    RETURN.
  ENDIF.

  IF lo_win IS BOUND OR lv_code IS NOT INITIAL.
    IF cv_page IS NOT INITIAL.
      IF lo_win IS BOUND.
        lv_name = lo_win->name.
        lv_capt = lo_win->caption.
        PERFORM ssf_layout_num USING lo_win->wlevel CHANGING lv_j5.
        PERFORM ssf_layout_window USING io_node lv_name lv_capt lo_win->wtype lv_j5
                                  CHANGING lv_json.
      ELSE.
        " Graphic / address on the page: name and caption only when OBJ
        " is a CL_SSF_FB_SF_OBJECT; no window level.
        TRY.
            lo_sfobj ?= io_node->obj.
            lv_name = lo_sfobj->name.
            lv_capt = lo_sfobj->caption.
          CATCH cx_sy_move_cast_error.
            CLEAR: lv_name, lv_capt.
        ENDTRY.
        lv_j5 = 'null'.
        PERFORM ssf_layout_window USING io_node lv_name lv_capt lv_code lv_j5
                                  CHANGING lv_json.
      ENDIF.
      IF cv_wins IS INITIAL.
        cv_wins = lv_json.
      ELSE.
        cv_wins = |{ cv_wins },{ lv_json }|.
      ENDIF.
    ENDIF.
    RETURN.
  ENDIF.

  LOOP AT io_node->succ INTO lo_child.
    PERFORM ssf_layout_walk USING lo_child
                            CHANGING cv_pages cv_page cv_wins.
  ENDLOOP.
ENDFORM.


*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT_CLOSE_PAGE - append the open page to the page list
*&---------------------------------------------------------------------*
FORM ssf_layout_close_page CHANGING cv_pages TYPE string
                                    cv_page  TYPE string
                                    cv_wins  TYPE string.
  IF cv_page IS INITIAL.
    RETURN.
  ENDIF.
  IF cv_pages IS INITIAL.
    cv_pages = |{ cv_page },"windows":[{ cv_wins }]\}|.
  ELSE.
    cv_pages = |{ cv_pages },{ cv_page },"windows":[{ cv_wins }]\}|.
  ENDIF.
  CLEAR: cv_page, cv_wins.
ENDFORM.


*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT_WINDOW - one window placement as JSON
*&---------------------------------------------------------------------*
* iv_wlevel_json is already JSON (number or null).
FORM ssf_layout_window USING io_node        TYPE REF TO cl_ssf_fb_node
                             iv_name        TYPE string
                             iv_caption     TYPE string
                             iv_wtype       TYPE any
                             iv_wlevel_json TYPE string
                       CHANGING cv_json TYPE string.

  DATA: lo_out   TYPE REF TO cl_ssf_fb_outattr,
        lv_j1    TYPE string,
        lv_j2    TYPE string,
        lv_j3    TYPE string,
        lv_j4    TYPE string,
        lv_j5    TYPE string,
        lv_j6    TYPE string,
        lv_j7    TYPE string,
        lv_j8    TYPE string.

  PERFORM ssf_layout_str USING iv_name    CHANGING lv_j1.
  PERFORM ssf_layout_str USING iv_caption CHANGING lv_j2.
  PERFORM ssf_layout_str USING iv_wtype   CHANGING lv_j3.
  cv_json = |\{"name":{ lv_j1 },"caption":{ lv_j2 },"wtype":{ lv_j3 }|
         && |,"wlevel":{ iv_wlevel_json }|.

  lo_out = io_node->outattr.
  IF lo_out IS BOUND.
    PERFORM ssf_layout_num USING lo_out->wleft     CHANGING lv_j1.
    PERFORM ssf_layout_str USING lo_out->u_wleft   CHANGING lv_j2.
    PERFORM ssf_layout_num USING lo_out->wtop      CHANGING lv_j3.
    PERFORM ssf_layout_str USING lo_out->u_wtop    CHANGING lv_j4.
    PERFORM ssf_layout_num USING lo_out->wwidth    CHANGING lv_j5.
    PERFORM ssf_layout_str USING lo_out->u_wwidth  CHANGING lv_j6.
    PERFORM ssf_layout_num USING lo_out->wheight   CHANGING lv_j7.
    PERFORM ssf_layout_str USING lo_out->u_wheight CHANGING lv_j8.
    cv_json = |{ cv_json },"wleft":{ lv_j1 },"u_wleft":{ lv_j2 }|
           && |,"wtop":{ lv_j3 },"u_wtop":{ lv_j4 }|
           && |,"wwidth":{ lv_j5 },"u_wwidth":{ lv_j6 }|
           && |,"wheight":{ lv_j7 },"u_wheight":{ lv_j8 }|.
    PERFORM ssf_layout_num USING lo_out->wframe   CHANGING lv_j1.
    PERFORM ssf_layout_str USING lo_out->u_wframe CHANGING lv_j2.
    PERFORM ssf_layout_num USING lo_out->wshading CHANGING lv_j3.
    PERFORM ssf_layout_str USING lo_out->wempty   CHANGING lv_j4.
    cv_json = |{ cv_json },"wframe":{ lv_j1 },"u_wframe":{ lv_j2 }|
           && |,"wshading":{ lv_j3 },"wempty":{ lv_j4 }|.
  ENDIF.

  cv_json = |{ cv_json }\}|.
ENDFORM.


*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT_STR - JSON string literal (quoted, escaped)
*&---------------------------------------------------------------------*
* Escapes backslash, double quote and every control character < U+0020.
* Trailing blanks of character fields are dropped.
FORM ssf_layout_str USING iv_value TYPE any
                    CHANGING cv_json TYPE string.

  DATA: lv_in   TYPE string,
        lv_out  TYPE string,
        lv_ch   TYPE string,
        lv_c1   TYPE c LENGTH 1,
        lv_len  TYPE i,
        lv_pos  TYPE i,
        lv_cp   TYPE i,
        lv_hex  TYPE x LENGTH 1,
        lv_hexs TYPE string.

  lv_in  = iv_value.
  lv_len = strlen( lv_in ).
  lv_pos = 0.
  WHILE lv_pos < lv_len.
    lv_ch = substring( val = lv_in off = lv_pos len = 1 ).
    IF lv_ch = '\'.
      lv_out = lv_out && '\\'.
    ELSEIF lv_ch = '"'.
      lv_out = lv_out && '\"'.
    ELSEIF lv_ch = ` `.
      lv_out = lv_out && ` `.
    ELSE.
      lv_c1 = lv_ch.
      lv_cp = cl_abap_conv_out_ce=>uccpi( lv_c1 ).
      IF lv_cp < 32.
        IF lv_cp = 10.
          lv_out = lv_out && '\n'.
        ELSEIF lv_cp = 13.
          lv_out = lv_out && '\r'.
        ELSEIF lv_cp = 9.
          lv_out = lv_out && '\t'.
        ELSE.
          lv_hex  = lv_cp.
          lv_hexs = lv_hex.
          lv_out  = lv_out && '\u00' && lv_hexs.
        ENDIF.
      ELSE.
        lv_out = lv_out && lv_ch.
      ENDIF.
    ENDIF.
    lv_pos = lv_pos + 1.
  ENDWHILE.

  cv_json = `"` && lv_out && `"`.
ENDFORM.


*&---------------------------------------------------------------------*
*& Form SSF_LAYOUT_NUM - JSON number ('.' decimal point, no exponent)
*&---------------------------------------------------------------------*
* Any numeric or numeric-text field; trailing fraction zeros are dropped
* (1.00 -> 1, 14.50 -> 14.5). Not convertible -> null.
FORM ssf_layout_num USING iv_value TYPE any
                    CHANGING cv_json TYPE string.

  DATA: lv_p   TYPE p LENGTH 16 DECIMALS 4,
        lv_neg TYPE abap_bool,
        lv_s   TYPE string,
        lv_len TYPE i,
        lv_off TYPE i.

  TRY.
      lv_p = iv_value.
    CATCH cx_sy_conversion_error cx_sy_arithmetic_error.
      cv_json = 'null'.
      RETURN.
  ENDTRY.

  IF lv_p < 0.
    lv_neg = abap_true.
    lv_p = 0 - lv_p.
  ENDIF.
  lv_s = lv_p.
  CONDENSE lv_s NO-GAPS.

  IF lv_s CS '.'.
    lv_len = strlen( lv_s ).
    WHILE lv_len > 0.
      lv_off = lv_len - 1.
      IF substring( val = lv_s off = lv_off len = 1 ) = '0'.
        lv_s = substring( val = lv_s len = lv_off ).
        lv_len = lv_off.
      ELSE.
        EXIT.
      ENDIF.
    ENDWHILE.
    IF lv_len > 0.
      lv_off = lv_len - 1.
      IF substring( val = lv_s off = lv_off len = 1 ) = '.'.
        lv_s = substring( val = lv_s len = lv_off ).
      ENDIF.
    ENDIF.
  ENDIF.
  IF lv_s IS INITIAL.
    lv_s = '0'.
  ENDIF.
  IF lv_neg = abap_true AND lv_s <> '0'.
    lv_s = '-' && lv_s.
  ENDIF.
  cv_json = lv_s.
ENDFORM.
