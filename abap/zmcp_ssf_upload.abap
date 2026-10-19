FUNCTION zmcp_ssf_upload
  IMPORTING
    VALUE(iv_formname)  TYPE tdsfname
    VALUE(iv_xml)       TYPE string
    VALUE(iv_devclass)  TYPE devclass DEFAULT '$TMP'
    VALUE(iv_transport) TYPE trkorr OPTIONAL
    VALUE(iv_overwrite) TYPE char1 OPTIONAL
    VALUE(iv_activate)  TYPE char1 DEFAULT 'X'
    VALUE(iv_gzip)      TYPE char1 OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_SSF_UPLOAD - create or replace a SmartForm from Form Builder XML.
*
* Function group ZMCP_ADT_UTILS, NOT remote-enabled - ZMCP_ADT_DISPATCH
* action SSF_UPLOAD_XML calls it (MCP tool UploadSmartForm). ECC / BASIS
* 7.40 (/UI2/CL_JSON). WRITES to the repository - DEV systems only.
*
* The same path as transaction SMARTFORMS > Utilities > Upload: the XML is
* parsed with iXML and loaded with CL_SSF_FB_SMART_FORM->XML_UPLOAD, then
* checked and stored like Ctrl+F3 in the Form Builder (STORE active = 'X'
* generates the function module). The XML format is the one
* FB_CONVERT_FORM_TO_XML / ZMCP_SSF_CONTENT part FORM returns.
*
* IV_FORMNAME  target form, must start with Z or Y
* IV_XML       the XML in base64
* IV_GZIP      'X' = IV_XML is raw-deflate compressed (CL_ABAP_GZIP) before base64
* IV_DEVCLASS  package (default $TMP); another package needs IV_TRANSPORT
* IV_TRANSPORT request or task the form is recorded in (no dialog)
* IV_OVERWRITE 'X' = replace an existing form; without it an existing form
*              is refused (EV_SUBRC 4)
* IV_ACTIVATE  'X' (default) = check and store active when the check finds
*              no error; with errors, or with space, the form is stored
*              inactive
*
* EV_RESULT  {"form","language","mode","active","fm","errors":[{"class",
*            "msg","fieldname"}],"warnings":[...]}
* EV_SUBRC   0 stored ("active" false + "errors" when the check failed),
*            4 refused (name / exists / package without request),
*            8 other error (EV_MESSAGE)

  TYPES: BEGIN OF ty_msg,
           class     TYPE string,
           msg       TYPE string,
           fieldname TYPE string,
         END OF ty_msg.
  TYPES: BEGIN OF ty_result,
           form     TYPE string,
           language TYPE string,
           mode     TYPE string,
           active   TYPE abap_bool,
           fm       TYPE string,
           errors   TYPE STANDARD TABLE OF ty_msg WITH DEFAULT KEY,
           warnings TYPE STANDARD TABLE OF ty_msg WITH DEFAULT KEY,
         END OF ty_result.

  DATA: ls_result   TYPE ty_result,
        ls_msg      TYPE ty_msg,
        lv_form     TYPE tdsfname,
        lv_xml      TYPE xstring,
        lv_raw      TYPE xstring,
        lv_exists   TYPE tdsfname,
        lv_mode     TYPE string,
        lv_lang     TYPE sylangu,
        lv_iso      TYPE string,
        lv_laiso    TYPE laiso,
        lv_devclass TYPE devclass,
        lv_korr     TYPE trkorr,
        lv_objname  TYPE e071-obj_name,
        lv_cmode    TYPE char1,
        lv_tadirnm  TYPE tadir-obj_name,
        lv_rc       TYPE sysubrc,
        ls_ko200    TYPE ko200,
        lt_ko200    TYPE tredt_objects,
        lv_active   TYPE tdsfflag,
        lv_enqueued TYPE abap_bool,
        lv_dummy    TYPE i,
        lv_fm       TYPE rs38l_fnam,
        lo_ixml     TYPE REF TO if_ixml,
        lo_factory  TYPE REF TO if_ixml_stream_factory,
        lo_stream   TYPE REF TO if_ixml_istream,
        lo_doc      TYPE REF TO if_ixml_document,
        lo_parser   TYPE REF TO if_ixml_parser,
        lo_perr     TYPE REF TO if_ixml_parse_error,
        lo_root     TYPE REF TO if_ixml_element,
        lo_form     TYPE REF TO cl_ssf_fb_smart_form,
        lo_check    TYPE REF TO cl_ssf_fb_check,
        lx_check    TYPE REF TO cx_ssf_fb_check,
        lx_ssf      TYPE REF TO cx_ssf_fb,
        lx_root     TYPE REF TO cx_root.

  FIELD-SYMBOLS: <lt_etab>  TYPE STANDARD TABLE,
                 <ls_eline> TYPE any,
                 <lv_fv>    TYPE any.

  ev_subrc = 0.
  CLEAR: ev_message, ev_result.
  ev_result = '{}'.

*----------------------------------------------------------------------
* 1. Input checks
  lv_form = to_upper( condense( iv_formname ) ).
  IF lv_form IS INITIAL OR ( lv_form(1) <> 'Z' AND lv_form(1) <> 'Y' ).
    ev_subrc = 4. ev_message = |SSF_UPLOAD: form name must start with Z or Y ({ lv_form })|.
    RETURN.
  ENDIF.
  lv_devclass = to_upper( condense( iv_devclass ) ).
  IF lv_devclass IS INITIAL.
    lv_devclass = '$TMP'.
  ENDIF.
  lv_korr = to_upper( condense( iv_transport ) ).
  IF lv_devclass(1) <> '$' AND lv_korr IS INITIAL.
    ev_subrc = 4. ev_message = |SSF_UPLOAD: package { lv_devclass } needs a transport request|.
    RETURN.
  ENDIF.

  SELECT SINGLE formname FROM stxfadm INTO lv_exists WHERE formname = lv_form.
  IF sy-subrc = 0.
    IF iv_overwrite <> 'X'.
      ev_subrc = 4. ev_message = |SSF_UPLOAD: form { lv_form } exists (overwrite not requested)|.
      RETURN.
    ENDIF.
    lv_mode = 'MODIFY'.
  ELSE.
    lv_mode = 'INSERT'.
  ENDIF.

*----------------------------------------------------------------------
* 2. Parse the XML
  TRY.
      lv_xml = cl_http_utility=>decode_x_base64( iv_xml ).
    CATCH cx_root INTO lx_root.
      ev_subrc = 8. ev_message = |SSF_UPLOAD: base64 decode failed: { lx_root->get_text( ) }|.
      RETURN.
  ENDTRY.
  IF iv_gzip = 'X' AND lv_xml IS NOT INITIAL.
    TRY.
        cl_abap_gzip=>decompress_binary( EXPORTING gzip_in = lv_xml IMPORTING raw_out = lv_raw ).
        lv_xml = lv_raw.
      CATCH cx_root INTO lx_root.
        ev_subrc = 8. ev_message = |SSF_UPLOAD: gunzip failed: { lx_root->get_text( ) }|.
        RETURN.
    ENDTRY.
  ENDIF.
  IF lv_xml IS INITIAL.
    ev_subrc = 8. ev_message = 'SSF_UPLOAD: XML is empty'.
    RETURN.
  ENDIF.

  lo_ixml = cl_ixml=>create( ).
  lo_factory = lo_ixml->create_stream_factory( ).
  lo_stream = lo_factory->create_istream_xstring( lv_xml ).
  lo_doc = lo_ixml->create_document( ).
  lo_parser = lo_ixml->create_parser( stream_factory = lo_factory
                                      istream        = lo_stream
                                      document       = lo_doc ).
  IF lo_parser->parse( ) <> 0.
    lo_perr = lo_parser->get_error( index = 0 ).
    IF lo_perr IS BOUND.
      ev_message = |SSF_UPLOAD: XML parse error line { lo_perr->get_line( ) }: { lo_perr->get_reason( ) }|.
    ELSE.
      ev_message = 'SSF_UPLOAD: XML parse error'.
    ENDIF.
    ev_subrc = 8.
    RETURN.
  ENDIF.
  lo_root = lo_doc->get_root_element( ).
  IF lo_root IS INITIAL OR lo_root->get_name( ) <> 'SMARTFORM'
     OR lo_root->get_namespace_uri( ) <> cl_ssf_fb_sf_basis=>xml_ns_uri_sf.
    ev_subrc = 8. ev_message = 'SSF_UPLOAD: root element is not sf:SMARTFORM'.
    RETURN.
  ENDIF.

  " texts are stored in the XML's language (attribute sf:language)
  lv_iso = lo_root->get_attribute( name = 'language' namespace = 'sf' ).
  lv_laiso = lv_iso.
  CALL FUNCTION 'CONVERSION_EXIT_ISOLA_INPUT'
    EXPORTING input            = lv_laiso
    IMPORTING output           = lv_lang
    EXCEPTIONS unknown_language = 1
               OTHERS           = 2.
  IF sy-subrc <> 0 OR lv_lang IS INITIAL.
    lv_lang = sy-langu.
  ENDIF.

*----------------------------------------------------------------------
* 3. With a request: record the object in it first - STORE's own
*    RS_CORR_INSERT then finds it and asks nothing (no dialog in RFC).
*    A local package needs nothing here: STORE enters it in TADIR.
  lv_objname = lv_form.
  IF lv_mode = 'INSERT'.
    lv_cmode = 'I'.
  ENDIF.
  IF lv_devclass(1) <> '$'.
    CALL FUNCTION 'RS_CORR_INSERT'
      EXPORTING object                   = lv_objname
                object_class             = 'SSFO'
                mode                     = lv_cmode
                global_lock              = 'X'
                devclass                 = lv_devclass
                korrnum                  = lv_korr
                use_korrnum_immediatedly = 'X'
                master_language          = lv_lang
                suppress_dialog          = 'X'
      IMPORTING devclass                 = lv_devclass
                korrnum                  = lv_korr
      EXCEPTIONS cancelled               = 1
                 permission_failure      = 2
                 unknown_objectclass     = 3
                 OTHERS                  = 4.
    IF sy-subrc <> 0.
      lv_rc = sy-subrc.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
      ev_subrc = 8. ev_message = |SSF_UPLOAD: RS_CORR_INSERT failed ({ lv_rc }): { ev_message }|.
      RETURN.
    ENDIF.
    ls_ko200-pgmid      = 'R3TR'.
    ls_ko200-object     = 'SSFO'.
    ls_ko200-obj_name   = lv_form.
    ls_ko200-author     = sy-uname.
    ls_ko200-masterlang = lv_lang.
    ls_ko200-devclass   = lv_devclass.
    ls_ko200-operation  = lv_cmode.
    APPEND ls_ko200 TO lt_ko200.
    CALL FUNCTION 'TR_RECORD_OBJ_CHANGE_TO_REQ'
      EXPORTING iv_request = lv_korr
                it_objects = lt_ko200
      EXCEPTIONS cancel    = 1
                 OTHERS    = 2.
    IF sy-subrc <> 0.
      lv_rc = sy-subrc.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
      ev_subrc = 8. ev_message = |SSF_UPLOAD: request { lv_korr } not usable ({ lv_rc }): { ev_message }|.
      RETURN.
    ENDIF.
  ELSEIF lv_mode = 'INSERT'.
    " local object: the TADIR entry first, else STORE asks for the package
    lv_tadirnm = lv_form.
    CALL FUNCTION 'TR_TADIR_INTERFACE'
      EXPORTING wi_test_modus       = space
                wi_tadir_pgmid      = 'R3TR'
                wi_tadir_object     = 'SSFO'
                wi_tadir_obj_name   = lv_tadirnm
                wi_tadir_devclass   = lv_devclass
                wi_tadir_masterlang = lv_lang
      EXCEPTIONS OTHERS             = 1.
    IF sy-subrc <> 0.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
      ev_subrc = 8. ev_message = |SSF_UPLOAD: TADIR entry failed: { ev_message }|.
      RETURN.
    ENDIF.
  ENDIF.

*----------------------------------------------------------------------
* 4. Enqueue, load the XML, check, store
  CREATE OBJECT lo_form.
  TRY.
      lo_form->enqueue( suppress_corr_check = 'X'
                        master_language     = lv_lang
                        mode                = lv_mode
                        formname            = lv_form ).
      lv_enqueued = abap_true.

      lo_form->header-formname   = lv_form.
      lo_form->header-devclass   = lv_devclass.
      lo_form->header-masterlang = lv_lang.
      lo_form->xml_init( ).
      lo_form->xml_upload( EXPORTING dom      = lo_root
                                     formname = lv_form
                                     language = lv_lang
                           CHANGING  sform    = lo_form ).
      lo_form->header-formname   = lv_form.
      lo_form->header-devclass   = lv_devclass.
      lo_form->header-masterlang = lv_lang.
    CATCH cx_ssf_fb INTO lx_ssf.
      ev_subrc = 8. ev_message = |SSF_UPLOAD: { lx_ssf->get_text( ) }|.
      IF lv_enqueued = abap_true.
        TRY.
            lo_form->dequeue( EXPORTING formname = lv_form IMPORTING rval = lv_dummy ).
          CATCH cx_ssf_fb.
        ENDTRY.
      ENDIF.
      RETURN.
  ENDTRY.

  lv_active = 'X'.
  IF iv_activate = 'X'.
    TRY.
        lo_form->check( EXPORTING global_check_flag = 'X'
                        CHANGING  check_object      = lo_check ).
      CATCH cx_ssf_fb_check INTO lx_check.
        ASSIGN ('LX_CHECK->ERROR_TABLE') TO <lt_etab>.
        IF <lt_etab> IS ASSIGNED.
          LOOP AT <lt_etab> ASSIGNING <ls_eline>.
            CLEAR ls_msg.
            ASSIGN COMPONENT 'CLASS' OF STRUCTURE <ls_eline> TO <lv_fv>.
            IF sy-subrc = 0. ls_msg-class = <lv_fv>. ENDIF.
            ASSIGN COMPONENT 'MSG' OF STRUCTURE <ls_eline> TO <lv_fv>.
            IF sy-subrc = 0. ls_msg-msg = <lv_fv>. ENDIF.
            ASSIGN COMPONENT 'FIELDNAME' OF STRUCTURE <ls_eline> TO <lv_fv>.
            IF sy-subrc = 0. ls_msg-fieldname = <lv_fv>. ENDIF.
            IF ls_msg-class = 'W'.
              APPEND ls_msg TO ls_result-warnings.
            ELSE.
              APPEND ls_msg TO ls_result-errors.
            ENDIF.
          ENDLOOP.
        ELSE.
          ls_msg-class = 'CHECK'. ls_msg-msg = lx_check->get_text( ). CLEAR ls_msg-fieldname.
          APPEND ls_msg TO ls_result-errors.
        ENDIF.
    ENDTRY.
    IF ls_result-errors IS NOT INITIAL.
      CLEAR lv_active.
    ENDIF.
  ELSE.
    CLEAR lv_active.
  ENDIF.

  TRY.
      lo_form->store( im_active   = lv_active
                      im_formname = lv_form
                      im_language = lv_lang ).
    CATCH cx_ssf_fb INTO lx_ssf.
      ev_subrc = 8. ev_message = |SSF_UPLOAD: store failed: { lx_ssf->get_text( ) }|.
  ENDTRY.
  TRY.
      lo_form->dequeue( EXPORTING formname = lv_form IMPORTING rval = lv_dummy ).
    CATCH cx_ssf_fb.
  ENDTRY.
  IF ev_subrc <> 0.
    RETURN.
  ENDIF.

  COMMIT WORK.
  IF lv_active = 'X'.
    " a replaced form keeps its function module number: generate it again,
    " else the old code runs (STORE alone does not regenerate on MODIFY)
    CALL FUNCTION 'FB_GENERATE_FORM'
      EXPORTING i_formname = lv_form
      EXCEPTIONS OTHERS    = 1.
    IF sy-subrc <> 0.
      ls_msg-class = 'GENERATE'. CLEAR ls_msg-fieldname.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ls_msg-msg.
      APPEND ls_msg TO ls_result-errors.
    ENDIF.
    CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
      EXPORTING formname = lv_form
      IMPORTING fm_name  = lv_fm
      EXCEPTIONS OTHERS  = 1.
    COMMIT WORK.
  ENDIF.

*----------------------------------------------------------------------
* 5. Result
  ls_result-form     = lv_form.
  ls_result-language = lv_iso.
  ls_result-mode     = lv_mode.
  ls_result-active   = boolc( lv_active = 'X' ).
  ls_result-fm       = lv_fm.
  IF iv_activate = 'X' AND lv_active <> 'X'.
    ev_message = |SSF_UPLOAD: stored inactive - the check found { lines( ls_result-errors ) } error(s)|.
  ENDIF.
  ev_result = /ui2/cl_json=>serialize( data = ls_result pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
ENDFUNCTION.
