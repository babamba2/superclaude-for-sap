FUNCTION zmcp_ssf_content
  IMPORTING
    VALUE(iv_part)     TYPE string
    VALUE(iv_formname) TYPE tdsfname OPTIONAL
    VALUE(iv_name)     TYPE string OPTIONAL
    VALUE(iv_object)   TYPE string OPTIONAL
    VALUE(iv_id)       TYPE string OPTIONAL
    VALUE(iv_btype)    TYPE string OPTIONAL
    VALUE(iv_language) TYPE spras OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_SSF_CONTENT - read-only: SmartForm content for preview rendering.
*
* Function group ZMCP_ADT_UTILS, NOT remote-enabled - ZMCP_ADT_DISPATCH
* action SSF_CONTENT calls it (MCP tool GetSmartFormContent). One source
* for BASIS 7.31 and 7.40: no inline declarations, no NEW / VALUE / CONV /
* COND, no /UI2/CL_JSON, no ZCL_MCP_JSON - the JSON is built here.
* Uses FORM SSF_LAYOUT_STR of ZMCP_SSF_LAYOUT (same function group).
*
* IV_PART
*   FORM     whole form as Form Builder XML (FB_CONVERT_FORM_TO_XML: active
*            version, texts in the logon language - the same XML as
*            transaction SMARTFORMS > Utilities > Download).
*            IV_FORMNAME. Result {"form","language","xml"} - xml in base64.
*   STYLE    SmartStyle as CSS (SSF_CONVERT_STYLE_TO_CSS, UTF-8).
*            IV_NAME = style. Result {"style","css"} - css in base64.
*   GRAPHIC  SE78 graphic as BMP (SAPSCRIPT_GET_GRAPHIC_BDS +
*            SAPSCRIPT_CONVERT_BITMAP) plus its STXBITMAPS size data.
*            IV_OBJECT (default GRAPHICS), IV_NAME, IV_ID (default BMAP),
*            IV_BTYPE (default BCOL). Result {"object","name","id","btype",
*            "widthPix","heightPix","widthTw","heightTw","resolution",
*            "bmp"} - bmp in base64.
*   STDTEXT  SO10 / include text (READ_TEXT). IV_OBJECT (default TEXT),
*            IV_NAME, IV_ID (default ST), IV_LANGUAGE (default logon).
*            Result {"object","name","id","language","lines":[{"f","l"}]}.
*
* The standard wrappers CL_SSF_XSF_UTILITIES=>GET_BDS_GRAPHIC_AS_BMP and
* GET_SMART_STYLE_AS_CSS are NOT used: they MODIFY the cache tables
* SSFXSFBMP / SSFXSFCSS. This FM never writes.
*
*   EV_SUBRC  0 ok, 4 not found, 8 other error (EV_MESSAGE)

  DATA: lv_part    TYPE string,
        lv_str     TYPE string,
        lv_xml     TYPE xstring,
        lv_b64     TYPE string,
        lv_j1      TYPE string,
        lv_j2      TYPE string,
        lv_j3      TYPE string,
        lv_j4      TYPE string,
        lv_obj     TYPE tdobjectgr,
        lv_gname   TYPE tdobname,
        lv_gid     TYPE tdidgr,
        lv_btype   TYPE tdbtype,
        lv_bytes   TYPE i,
        lv_len     TYPE i,
        lv_linelen TYPE i,
        lt_bds     TYPE STANDARD TABLE OF bapiconten,
        lt_bmp     TYPE tsf_xsf_ct,
        ls_bmp     TYPE LINE OF tsf_xsf_ct,
        ls_bitmap  TYPE stxbitmaps,
        lt_css     TYPE tsfstbody,
        ls_cssline TYPE LINE OF tsfstbody,
        lv_cssx    TYPE xstring,
        lv_cssall  TYPE xstring,
        lv_fmttype TYPE sfhttptype,
        ls_thead   TYPE thead,
        lt_lines   TYPE STANDARD TABLE OF tline,
        ls_line    TYPE tline,
        lv_tlang   TYPE spras,
        lv_sep     TYPE string,
        lv_rows    TYPE string.

  ev_subrc = 0.
  CLEAR: ev_message, ev_result.
  lv_part = iv_part.
  TRANSLATE lv_part TO UPPER CASE.
  CONDENSE lv_part NO-GAPS.

  CASE lv_part.

*----------------------------------------------------------------------
    WHEN 'FORM'.
      lv_str = iv_formname.
      CONDENSE lv_str.
      TRANSLATE lv_str TO UPPER CASE.
      IF lv_str IS INITIAL.
        ev_subrc = 8. ev_message = 'SSF_CONTENT FORM: form name is empty'.
        ev_result = '{}'.
        RETURN.
      ENDIF.
      CALL FUNCTION 'FB_CONVERT_FORM_TO_XML'
        EXPORTING
          i_formname       = lv_str
        IMPORTING
          e_xml            = lv_xml
        EXCEPTIONS
          no_name          = 1
          no_form          = 2
          no_active_source = 3
          conversion_error = 4
          illegal_formtype = 5
          generation_error = 6
          OTHERS           = 7.
      CASE sy-subrc.
        WHEN 0.
        WHEN 1 OR 2.
          ev_subrc = 4.
          MESSAGE ID 'SMARTFORMS' TYPE 'S' NUMBER '200' WITH lv_str
            INTO ev_message.
          ev_result = '{}'.
          RETURN.
        WHEN 3.
          ev_subrc = 4.
          ev_message = |SmartForm { lv_str } has no active version|.
          ev_result = '{}'.
          RETURN.
        WHEN OTHERS.
          ev_subrc = 8.
          ev_message = |FB_CONVERT_FORM_TO_XML failed for { lv_str } (sy-subrc { sy-subrc })|.
          ev_result = '{}'.
          RETURN.
      ENDCASE.
      lv_b64 = cl_http_utility=>encode_x_base64( lv_xml ).
      PERFORM ssf_layout_str USING lv_str    CHANGING lv_j1.
      PERFORM ssf_layout_str USING sy-langu  CHANGING lv_j2.
      ev_result = |\{"form":{ lv_j1 },"language":{ lv_j2 },"xml":"{ lv_b64 }"\}|.
      lv_len = xstrlen( lv_xml ).
      ev_message = |SmartForm { lv_str }: { lv_len } bytes XML|.

*----------------------------------------------------------------------
    WHEN 'STYLE'.
      lv_str = iv_name.
      CONDENSE lv_str.
      TRANSLATE lv_str TO UPPER CASE.
      IF lv_str IS INITIAL.
        ev_subrc = 8. ev_message = 'SSF_CONTENT STYLE: style name is empty'.
        ev_result = '{}'.
        RETURN.
      ENDIF.
      CALL FUNCTION 'SSF_CONVERT_STYLE_TO_CSS'
        EXPORTING
          stylename  = lv_str
        IMPORTING
          fmtcontent = lt_css
          fmttype    = lv_fmttype
          fmtlength  = lv_bytes
        EXCEPTIONS
          error      = 1
          OTHERS     = 2.
      IF sy-subrc <> 0.
        ev_subrc = 4.
        ev_message = |SmartStyle { lv_str } not found or not convertible|.
        ev_result = '{}'.
        RETURN.
      ENDIF.
      " Same conversion as GET_SMART_STYLE_AS_CSS, without its cache write.
      LOOP AT lt_css INTO ls_cssline.
        CLEAR lv_cssx.
        CALL FUNCTION 'SCP_TRANSLATE_CHARS'
          EXPORTING
            inbuff  = ls_cssline
            outcode = '4110'
          IMPORTING
            outbuff = lv_cssx
          EXCEPTIONS
            OTHERS  = 0.
        CONCATENATE lv_cssall lv_cssx INTO lv_cssall IN BYTE MODE.
      ENDLOOP.
      lv_b64 = cl_http_utility=>encode_x_base64( lv_cssall ).
      PERFORM ssf_layout_str USING lv_str CHANGING lv_j1.
      ev_result = |\{"style":{ lv_j1 },"css":"{ lv_b64 }"\}|.
      ev_message = |SmartStyle { lv_str }: CSS|.

*----------------------------------------------------------------------
    WHEN 'GRAPHIC'.
      lv_obj   = iv_object.
      lv_gname = iv_name.
      lv_gid   = iv_id.
      lv_btype = iv_btype.
      TRANSLATE: lv_obj TO UPPER CASE, lv_gname TO UPPER CASE,
                 lv_gid TO UPPER CASE, lv_btype TO UPPER CASE.
      IF lv_obj IS INITIAL.   lv_obj   = 'GRAPHICS'. ENDIF.
      IF lv_gid IS INITIAL.   lv_gid   = 'BMAP'.     ENDIF.
      IF lv_btype IS INITIAL. lv_btype = 'BCOL'.     ENDIF.
      IF lv_gname IS INITIAL.
        ev_subrc = 8. ev_message = 'SSF_CONTENT GRAPHIC: graphic name is empty'.
        ev_result = '{}'.
        RETURN.
      ENDIF.

      SELECT SINGLE * FROM stxbitmaps INTO ls_bitmap
        WHERE tdobject = lv_obj
          AND tdname   = lv_gname
          AND tdid     = lv_gid
          AND tdbtype  = lv_btype.
      IF sy-subrc <> 0.
        ev_subrc = 4.
        ev_message = |Graphic { lv_obj } { lv_gname } { lv_gid } { lv_btype } not found (SE78)|.
        ev_result = '{}'.
        RETURN.
      ENDIF.

      CALL FUNCTION 'SAPSCRIPT_GET_GRAPHIC_BDS'
        EXPORTING
          i_object    = lv_obj
          i_name      = lv_gname
          i_id        = lv_gid
          i_btype     = lv_btype
        IMPORTING
          e_bytecount = lv_bytes
        TABLES
          content     = lt_bds
        EXCEPTIONS
          not_found   = 1
          OTHERS      = 2.
      IF sy-subrc <> 0.
        ev_subrc = 4.
        ev_message = |Graphic { lv_gname }: BDS content not found|.
        ev_result = '{}'.
        RETURN.
      ENDIF.

      CALL FUNCTION 'SAPSCRIPT_CONVERT_BITMAP'
        EXPORTING
          old_format               = 'BDS'
          new_format               = 'BMP'
          bitmap_file_bytecount_in = lv_bytes
        IMPORTING
          bitmap_file_bytecount    = lv_len
        TABLES
          bds_bitmap_file          = lt_bds
          bitmap_file              = lt_bmp
        EXCEPTIONS
          OTHERS                   = 1.
      IF sy-subrc <> 0.
        ev_subrc = 8.
        ev_message = |Graphic { lv_gname }: conversion to BMP failed|.
        ev_result = '{}'.
        RETURN.
      ENDIF.

      CLEAR lv_xml.
      DESCRIBE FIELD ls_bmp LENGTH lv_linelen IN BYTE MODE.
      LOOP AT lt_bmp INTO ls_bmp.
        IF lv_len > lv_linelen.
          CONCATENATE lv_xml ls_bmp-line INTO lv_xml IN BYTE MODE.
        ELSEIF lv_len > 0.
          CONCATENATE lv_xml ls_bmp-line(lv_len) INTO lv_xml IN BYTE MODE.
        ENDIF.
        lv_len = lv_len - lv_linelen.
      ENDLOOP.
      lv_b64 = cl_http_utility=>encode_x_base64( lv_xml ).

      PERFORM ssf_layout_str USING lv_obj   CHANGING lv_j1.
      PERFORM ssf_layout_str USING lv_gname CHANGING lv_j2.
      PERFORM ssf_layout_str USING lv_gid   CHANGING lv_j3.
      PERFORM ssf_layout_str USING lv_btype CHANGING lv_j4.
      ev_result = |\{"object":{ lv_j1 },"name":{ lv_j2 },"id":{ lv_j3 },"btype":{ lv_j4 }|.
      lv_len = ls_bitmap-widthpix.   lv_j1 = lv_len.
      lv_len = ls_bitmap-heightpix.  lv_j2 = lv_len.
      lv_len = ls_bitmap-widthtw.    lv_j3 = lv_len.
      lv_len = ls_bitmap-heighttw.   lv_j4 = lv_len.
      CONDENSE: lv_j1, lv_j2, lv_j3, lv_j4.
      ev_result = |{ ev_result },"widthPix":{ lv_j1 },"heightPix":{ lv_j2 }|
               && |,"widthTw":{ lv_j3 },"heightTw":{ lv_j4 }|.
      lv_len = ls_bitmap-resolution. lv_j1 = lv_len. CONDENSE lv_j1.
      ev_result = |{ ev_result },"resolution":{ lv_j1 },"bmp":"{ lv_b64 }"\}|.
      lv_len = xstrlen( lv_xml ).
      ev_message = |Graphic { lv_gname }: { lv_len } bytes BMP|.

*----------------------------------------------------------------------
    WHEN 'STDTEXT'.
      ls_thead-tdobject = iv_object.
      ls_thead-tdname   = iv_name.
      ls_thead-tdid     = iv_id.
      TRANSLATE: ls_thead-tdobject TO UPPER CASE,
                 ls_thead-tdid     TO UPPER CASE.
      IF ls_thead-tdobject IS INITIAL. ls_thead-tdobject = 'TEXT'. ENDIF.
      IF ls_thead-tdid IS INITIAL.     ls_thead-tdid     = 'ST'.   ENDIF.
      lv_tlang = iv_language.
      IF lv_tlang IS INITIAL. lv_tlang = sy-langu. ENDIF.
      IF ls_thead-tdname IS INITIAL.
        ev_subrc = 8. ev_message = 'SSF_CONTENT STDTEXT: text name is empty'.
        ev_result = '{}'.
        RETURN.
      ENDIF.
      CALL FUNCTION 'READ_TEXT'
        EXPORTING
          id                      = ls_thead-tdid
          language                = lv_tlang
          name                    = ls_thead-tdname
          object                  = ls_thead-tdobject
        TABLES
          lines                   = lt_lines
        EXCEPTIONS
          id                      = 1
          language                = 2
          name                    = 3
          not_found               = 4
          object                  = 5
          reference_check         = 6
          wrong_access_to_archive = 7
          OTHERS                  = 8.
      IF sy-subrc <> 0.
        ev_subrc = 4.
        ev_message = |Text { ls_thead-tdobject } { ls_thead-tdname } { ls_thead-tdid } { lv_tlang } not found|.
        ev_result = '{}'.
        RETURN.
      ENDIF.
      LOOP AT lt_lines INTO ls_line.
        PERFORM ssf_layout_str USING ls_line-tdformat CHANGING lv_j1.
        PERFORM ssf_layout_str USING ls_line-tdline   CHANGING lv_j2.
        lv_rows = |{ lv_rows }{ lv_sep }\{"f":{ lv_j1 },"l":{ lv_j2 }\}|.
        lv_sep = ','.
      ENDLOOP.
      PERFORM ssf_layout_str USING ls_thead-tdobject CHANGING lv_j1.
      PERFORM ssf_layout_str USING ls_thead-tdname   CHANGING lv_j2.
      PERFORM ssf_layout_str USING ls_thead-tdid     CHANGING lv_j3.
      PERFORM ssf_layout_str USING lv_tlang          CHANGING lv_j4.
      ev_result = |\{"object":{ lv_j1 },"name":{ lv_j2 },"id":{ lv_j3 }|
               && |,"language":{ lv_j4 },"lines":[{ lv_rows }]\}|.
      lv_len = lines( lt_lines ).
      ev_message = |Text { ls_thead-tdname }: { lv_len } line(s)|.

*----------------------------------------------------------------------
    WHEN OTHERS.
      ev_subrc = 8.
      ev_message = |SSF_CONTENT: unknown part "{ iv_part }" (FORM, STYLE, GRAPHIC, STDTEXT)|.
      ev_result = '{}'.
  ENDCASE.

ENDFUNCTION.
