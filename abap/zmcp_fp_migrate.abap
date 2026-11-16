FUNCTION zmcp_fp_migrate
  IMPORTING
    VALUE(iv_source)    TYPE string
    VALUE(iv_form)      TYPE string
    VALUE(iv_interface) TYPE string
    VALUE(iv_preset)    TYPE string DEFAULT 'FULL'
  EXPORTING
    VALUE(ev_subrc)     TYPE i
    VALUE(ev_message)   TYPE string
    VALUE(ev_result)    TYPE string.
*----------------------------------------------------------------------*
* ZMCP_FP_MIGRATE - SAP's SmartForm -> Adobe form migration, run without
* a SAP GUI, for SAP example SmartForms only, into NEW local objects.
*
* Development helper for sc4sap (MCP tool CreateAdobeFormFromSmartForm via
* dispatcher action FP_MIGRATE). Not remote-enabled. BASIS 7.40 or later.
*
* Runs the steps of CL_SSF_MIGRATION=>MIGRATE with SAP's own classes
* (CL_SSF_MIGRATION instance with the options, CL_SSF_FB_SMART_FORM->LOAD /
* ->MIGRATE, CL_SSF_MIGRATION=>MIGRATE_INTERFACE, CL_SXFT_TEMPLATE render).
* Differences to MIGRATE, all because the dispatcher has no SAP GUI:
*  - the new form and interface are created in package $TMP (MIGRATE passes
*    no package, so saving would open RS_CORR_INSERT's package dialog; with
*    $TMP and no request the WB API writes TADIR without it). No dark mode:
*    dark mode would create the form with ABAP language version "key user";
*  - an existing target name is REFUSED (MIGRATE deletes and recreates it);
*  - the application log (object SMARTFORM / XFAMIGRATION) is read back and
*    returned instead of displayed (APPL_LOG_DISPLAY needs a GUI);
*  - both objects are activated with RS_WORKING_OBJECT_ACTIVATE, UI_DECOUPLED
*    (no activation dialog);
*  - form type "migrated": MIGRATE sets it with CL_FP_FORM->SET_FORM_TYPE,
*    which is protected (only SAP's friend classes may call it). Here the
*    new, still empty form goes through the public XML path of SFP's form
*    upload instead: CL_FP_HELPER=>CONVERT_FORM_TO_XSTRING, the top-level
*    TYPE element set to IF_FP_FORM=>C_FORM_TYPE_MIGRATED,
*    CONVERT_XSTRING_TO_FORM; then GET_FORM_TYPE( ) must say migrated, else
*    the run stops before anything is saved. SAP's loops (CL_FP_LOOP
*    SET_LOOP_INTO / SET_WORK_AREA) refuse a form of any other type;
*  - gap G1: where SAP's migration leaves two sibling context nodes with one
*    name (a 4.6C table: the loop's work-area DATA field and the table's
*    cell FOLDER), the non-DATA node is renamed <NAME>_<n> before the form is
*    saved (FORM g1_walk; listed in "renamed"); a node with children, or a
*    bound path without a DATA twin, stops the run before the form is saved;
*  - gap G4: MIGRATE leaves the placeholder layout cache info
*    0$0$0$0$v1.0$? (all migrated forms then share one ADS template cache
*    slot and print each other's layouts): the layout gets a new layout id,
*    hashes and cache info (CL_FP_HELPER=>SET_NEW_LAYOUT_ID / _HASH /
*    SET_NEW_CACHE_INFO, as a Designer save does) before the form is saved;
*    still the placeholder afterwards -> the run stops, form not saved;
*  - the form description (the SmartForm caption, as MIGRATE sets it) ends
*    with the marker " [sc4sap]" (caption cut to fit 60 characters): RENDER
*    prints ZSC4SAP_AFM_* forms only with it.
*
* Guards: development-type clients only (T000-CCCATEGORY C / D / E, refused
* when T000 is not readable); source = a SmartForm in TADIR (R3TR SSFO) with
* SRCSYSTEM 'SAP', not a text module, no customer namespace; targets match
* ^ZSC4SAP_AFM_[A-Z0-9_]+$ (at most 30 characters), form and interface names
* differ unless equal on purpose, and neither exists (TADIR SFPF / SFPI and
* the FP tables); only the preset FULL (every option of SSFMEXPROPERTIES
* except ALTERNATIVE_TRUE and TEXT_PLACEHOLDER).
*
* Writes: the new form and interface ($TMP, TADIR via SAP's WB API), the
* migration log (BAL, kept 7 days as MIGRATE sets it), activation. Nothing
* else. If SAP's migration raises after the interface was saved, the result
* lists what was left ("left": ["SFPI ZSC4SAP_AFM_..."]) and EV_MESSAGE
* names it too (EV_SUBRC 8 - the dispatcher caller sees only the message),
* for a delete the user approves per call - this FM never deletes. Saved but
* not both objects active: EV_SUBRC 0, EV_MESSAGE "saved but NOT fully
* active ...", "active" lists what is.
*
* Result {"source","form","interface","options":{...},"raised":bool,
* "error","saved":[...],"left":[...],"active":[...],"renamed":[{"path","from",
* "to","type"}],"cacheInfo","log":[{"type","text"}]}.
*----------------------------------------------------------------------*
  DATA: lv_cat       TYPE t000-cccategory,
        lv_src       TYPE tdsfname,
        lv_form      TYPE fpname,
        lv_intf      TYPE fpname,
        lv_srcsys    TYPE tadir-srcsystem,
        lv_ftype     TYPE stxfadm-formtype,
        lv_dummy     TYPE tadir-obj_name,
        ls_opt       TYPE ssfmexproperties,
        lo_mig       TYPE REF TO cl_ssf_migration,
        lo_sf        TYPE REF TO cl_ssf_fb_smart_form,
        lo_form      TYPE REF TO if_fp_form,
        lo_ctx       TYPE REF TO if_fp_context,
        lo_layout    TYPE REF TO if_fp_layout,
        lo_wbf       TYPE REF TO if_fp_wb_form,
        lo_intf      TYPE REF TO if_fp_interface,
        lo_wbi       TYPE REF TO if_fp_wb_interface,
        lo_tpl       TYPE REF TO cl_sxft_template,
        lo_ixml      TYPE REF TO if_ixml,
        lo_ostream   TYPE REF TO if_ixml_ostream,
        lv_xdp       TYPE xstring,
        lv_desc      TYPE fptext,
        lx_root      TYPE REF TO cx_root,
        lv_raised    TYPE abap_bool,
        lv_error     TYPE string,
        lx_chain     TYPE REF TO cx_root,
        lo_root      TYPE REF TO if_fp_node,
        lv_xdps      TYPE string,
        lt_renamed   TYPE string_table,
        lv_g1err     TYPE string,
        lv_cache     TYPE string,
        lv_sfpf      TYPE string,
        lv_prog      TYPE syrepid,
        lv_incl      TYPE syrepid,
        lv_line      TYPE i,
        lv_chain     TYPE string,
        lt_saved     TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lt_active    TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lt_left      TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lv_date      TYPE sy-datum,
        lv_time      TYPE sy-uzeit,
        ls_filter    TYPE bal_s_lfil,
        ls_extno     TYPE bal_s_extn,
        ls_obj       TYPE bal_s_obj,
        ls_sub       TYPE bal_s_sub,
        lt_headers   TYPE balhdr_t,
        lt_handles   TYPE bal_t_logh,
        lt_msgh      TYPE bal_t_msgh,
        ls_msgh      TYPE balmsghndl,
        ls_msg       TYPE bal_s_msg,
        lv_text      TYPE string,
        lv_log       TYPE string,
        lv_list      TYPE string,
        lv_str       TYPE string,
        lv_obj       TYPE trobj_name,
        lv_actmsg    TYPE string,
        lv_len       TYPE i,
        lv_fxml      TYPE xstring,
        lv_fstr      TYPE string,
        lv_off       TYPE i,
        lv_mlen      TYPE i,
        lv_coff      TYPE i.
  CONSTANTS c_marker TYPE string VALUE ` [sc4sap]`.

  CLEAR: ev_subrc, ev_message.
  ev_result = '{}'.

  " Development-type clients only.
  SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt.
  IF sy-subrc <> 0 OR ( lv_cat <> 'C' AND lv_cat <> 'D' AND lv_cat <> 'E' ).
    ev_subrc = 8.
    ev_message = |FP_MIGRATE: refused in client { sy-mandt } (role "{ lv_cat }") - development clients only|.
    RETURN.
  ENDIF.

  lv_str = to_upper( condense( iv_source ) ).
  IF strlen( lv_str ) > 30 OR NOT matches( val = lv_str regex = `[A-Z0-9_]+` ) OR lv_str(1) = 'Z' OR lv_str(1) = 'Y'.
    ev_subrc = 8. ev_message = |FP_MIGRATE: source "{ lv_str }" refused - a SAP SmartForm name (letters, digits, _), no customer namespace|.
    RETURN.
  ENDIF.
  lv_src = lv_str.
  lv_str = to_upper( condense( iv_form ) ).
  IF strlen( lv_str ) > 30 OR NOT matches( val = lv_str regex = `ZSC4SAP_AFM_[A-Z0-9_]+` ).
    ev_subrc = 8. ev_message = |FP_MIGRATE: target form "{ lv_str }" refused - must match ZSC4SAP_AFM_[A-Z0-9_]+ (max. 30)|.
    RETURN.
  ENDIF.
  lv_form = lv_str.
  lv_str = to_upper( condense( iv_interface ) ).
  IF strlen( lv_str ) > 30 OR NOT matches( val = lv_str regex = `ZSC4SAP_AFM_[A-Z0-9_]+` ).
    ev_subrc = 8. ev_message = |FP_MIGRATE: target interface "{ lv_str }" refused - must match ZSC4SAP_AFM_[A-Z0-9_]+ (max. 30)|.
    RETURN.
  ENDIF.
  lv_intf = lv_str.
  IF to_upper( iv_preset ) <> 'FULL'.
    ev_subrc = 8. ev_message = |FP_MIGRATE: preset "{ iv_preset }" refused - only FULL|.
    RETURN.
  ENDIF.

  " Source: a SAP-delivered SmartForm (not a text module).
  SELECT SINGLE srcsystem FROM tadir INTO lv_srcsys
    WHERE pgmid = 'R3TR' AND object = 'SSFO' AND obj_name = lv_src.
  IF sy-subrc <> 0 OR lv_srcsys <> 'SAP'.
    ev_subrc = 8. ev_message = |FP_MIGRATE: { lv_src } is not a SAP-delivered SmartForm (TADIR R3TR SSFO, source system SAP)|.
    RETURN.
  ENDIF.
  SELECT SINGLE formtype FROM stxfadm INTO lv_ftype WHERE formname = lv_src.
  IF sy-subrc <> 0 OR lv_ftype = 'T'.
    ev_subrc = 8. ev_message = |FP_MIGRATE: { lv_src } is no SmartForm form (missing, or a text module)|.
    RETURN.
  ENDIF.

  " Targets must not exist (MIGRATE would delete and recreate them).
  SELECT SINGLE obj_name FROM tadir INTO lv_dummy
    WHERE pgmid = 'R3TR' AND ( object = 'SFPF' OR object = 'SFPI' ) AND ( obj_name = lv_form OR obj_name = lv_intf ).
  IF sy-subrc = 0.
    ev_subrc = 8. ev_message = |FP_MIGRATE: { lv_dummy } exists already - choose new names (nothing is overwritten)|.
    RETURN.
  ENDIF.
  TRY.
      cl_fp_wb_form=>load( i_name = lv_form )->free( ).
      ev_subrc = 8. ev_message = |FP_MIGRATE: form { lv_form } exists already|.
      RETURN.
    CATCH cx_fp_api_repository cx_fp_api_usage.                "#EC NO_HANDLER
  ENDTRY.
  TRY.
      cl_fp_wb_interface=>load( i_name = lv_intf )->free( ).
      ev_subrc = 8. ev_message = |FP_MIGRATE: interface { lv_intf } exists already|.
      RETURN.
    CATCH cx_fp_api_repository cx_fp_api_usage.                "#EC NO_HANDLER
  ENDTRY.

  " Preset FULL: every option except ALTERNATIVE_TRUE and TEXT_PLACEHOLDER.
  ls_opt-interface         = 'X'.
  ls_opt-context           = 'X'.
  ls_opt-layout            = 'X'.
  ls_opt-condition_data    = 'X'.
  ls_opt-condition_layout  = 'X'.
  ls_opt-alternative_all   = 'X'.
  ls_opt-table             = 'X'.
  ls_opt-template          = 'X'.
  ls_opt-text              = 'X'.
  ls_opt-text_append       = 'X'.
  ls_opt-text_binding      = 'X'.
  ls_opt-window            = 'X'.
  ls_opt-address           = 'X'.
  ls_opt-graphic           = 'X'.
  ls_opt-folder            = 'X'.
  ls_opt-output_option     = 'X'.
  ls_opt-header_footer     = 'X'.
  ls_opt-command_pagebreak = 'X'.
  ls_opt-command_rest      = 'X'.
  ls_opt-coding            = 'X'.

  lv_date = sy-datum.
  lv_time = sy-uzeit.

  TRY.
      " --- the steps of CL_SSF_MIGRATION=>MIGRATE ---
      CREATE OBJECT lo_mig EXPORTING options = ls_opt.
      lo_mig->log_create( form_name = lv_src ).

      CREATE OBJECT lo_sf.
      lo_sf->load( im_formname = lv_src ).

      lo_form = cl_fp_form=>create( i_language = sy-langu ).
      " Form type migrated through the public XML path (see header): the first TYPE
      " element, before CONTEXT, is the form's own type in CL_FP_HELPER's format.
      lv_fxml = cl_fp_helper=>convert_form_to_xstring( lo_form ).
      lv_fstr = cl_abap_codepage=>convert_from( lv_fxml ).
      FIND FIRST OCCURRENCE OF REGEX `<TYPE\s*/>|<TYPE>[^<]*</TYPE>` IN lv_fstr
        MATCH OFFSET lv_off MATCH LENGTH lv_mlen.
      IF sy-subrc = 0.
        FIND FIRST OCCURRENCE OF `<CONTEXT` IN lv_fstr MATCH OFFSET lv_coff.
        IF sy-subrc <> 0 OR lv_coff < lv_off.
          lv_mlen = 0.
        ENDIF.
      ELSE.
        lv_mlen = 0.
      ENDIF.
      IF lv_mlen > 0.
        REPLACE SECTION OFFSET lv_off LENGTH lv_mlen OF lv_fstr
          WITH |<TYPE>{ if_fp_form=>c_form_type_migrated }</TYPE>|.
        lv_fxml = cl_abap_codepage=>convert_to( lv_fstr ).
        lo_form = cl_fp_helper=>convert_xstring_to_form( i_xstring = lv_fxml i_language = sy-langu ).
      ENDIF.
      IF lv_mlen = 0 OR lo_form->get_form_type( ) <> if_fp_form=>c_form_type_migrated.
        " nothing saved yet: stop here
        ev_subrc = 8.
        ev_message = |FP_MIGRATE: could not set form type migrated (form XML layout not as expected) - nothing saved|.
        ev_result = '{}'.
        RETURN.
      ENDIF.
      lv_desc = lo_sf->header-caption.
      " Marker (the one change to SAP's form content): RENDER of ZMCP_FP_CONTENT prints a
      " ZSC4SAP_AFM_* form only with this suffix and in $TMP.
      lv_len = 60 - strlen( c_marker ).
      IF strlen( lv_desc ) > lv_len.
        lv_desc = lv_desc(lv_len).
      ENDIF.
      lv_desc = |{ lv_desc }{ c_marker }|.
      lo_form->set_description( i_description = lv_desc ).
      lo_ctx = lo_form->get_context( ).
      " $TMP (not dark mode): no package / transport dialog - MIGRATE passes no package here
      lo_wbf = cl_fp_wb_form=>create( i_name = lv_form i_form = lo_form i_devclass = '$TMP' ).
      " MIGRATE sets form type 'migrated' here; this form has it already (XML path above).

      lo_intf = cl_fp_interface=>create( i_language = sy-langu i_interface_type = if_fp_interface=>c_interface_type_sf ).
      lo_wbi = cl_fp_wb_interface=>create( i_name = lv_intf i_interface = lo_intf i_devclass = '$TMP' ).
      lo_form->set_interface_name( i_interface_name = lv_intf ).

      CREATE OBJECT lo_tpl.
      cl_ssf_migration=>migrate_interface( smartform = lo_sf interface = lo_intf ).
      lo_wbi->save( ).
      APPEND |SFPI { lv_intf }| TO lt_saved.

      lo_sf->migrate( interface  = lo_intf
                      context    = lo_ctx
                      fp_parent  = lo_ctx
                      template   = lo_tpl
                      xft_parent = lo_tpl
                      migration  = lo_mig ).

      lo_ixml = cl_ixml=>create( ).
      lo_ostream = lo_ixml->create_stream_factory( )->create_ostream_xstring( string = lv_xdp ).
      lo_tpl->render( ostream = lo_ostream ).
      lo_layout = lo_form->get_layout( ).
      lo_layout->set_layout_data( i_layout_data = lv_xdp i_set_xliff_ids = abap_false ).

      " Gap G1 (SAP's migration of a 4.6C table): the loop's work-area fields and the
      " table's cell folders get the same names under one parent ("Node name X is not
      " unique" - the form does not activate). Keep the DATA node, rename the other
      " siblings to <NAME>_2...; refuse before the form is saved when a renamed node has
      " children or a binding could mean it (see FORM g1_walk).
      lo_root ?= lo_ctx.
      lv_xdps = cl_abap_codepage=>convert_from( lv_xdp ).
      CLEAR lv_str.
      PERFORM g1_walk USING lo_root lv_str lv_xdps CHANGING lt_renamed lv_g1err.
      IF lv_g1err IS NOT INITIAL.
        RAISE EXCEPTION TYPE cx_fp_api_usage.    " -> CATCH below; lv_g1err is the text
      ENDIF.

      " Gap G4: MIGRATE leaves the layout with the placeholder cache info
      " 0$0$0$0$v1.0$? - every migrated form then shares one ADS template cache slot
      " and prints another form's layout. Give the layout what a Designer save gives
      " it (public CL_FP_HELPER methods): a new layout id, hashes and cache info.
      cl_fp_helper=>set_new_layout_id( CHANGING c_form = lo_form ).
      cl_fp_helper=>set_new_layout_hash( CHANGING c_form = lo_form ).
      cl_fp_helper=>set_new_cache_info( CHANGING c_form = lo_form ).
      lv_cache = lo_form->get_layout( )->get_cache_info( ).
      IF lv_cache IS INITIAL OR lv_cache CS '0$0$0$0$'.
        lv_g1err = |layout cache info not renewed ("{ lv_cache }")|.
        RAISE EXCEPTION TYPE cx_fp_api_usage.    " -> CATCH below, form not saved
      ENDIF.

      lo_wbf->save( ).
      APPEND |SFPF { lv_form }| TO lt_saved.
      lo_mig->log_save( ).
      lo_wbf->free( ).
      lo_wbi->free( ).
      CLEAR: lo_wbf, lo_wbi.
      COMMIT WORK AND WAIT.

      " Activate without a dialog (as the WB API's dark mode does): interface first, then the form.
      lv_obj = lv_intf.
      CALL FUNCTION 'RS_WORKING_OBJECT_ACTIVATE'
        EXPORTING
          object                     = 'SFPI'
          obj_name                   = lv_obj
          activate_only_this_object  = 'X'
          ui_decoupled               = 'X'
        EXCEPTIONS
          object_not_in_working_area = 1
          execution_error            = 2
          cancelled                  = 3
          insert_into_corr_error     = 4
          OTHERS                     = 5.
      IF sy-subrc = 0. APPEND |SFPI { lv_intf }| TO lt_active. ELSE. lv_actmsg = |interface activation rc { sy-subrc }|. ENDIF.
      lv_obj = lv_form.
      CALL FUNCTION 'RS_WORKING_OBJECT_ACTIVATE'
        EXPORTING
          object                     = 'SFPF'
          obj_name                   = lv_obj
          activate_only_this_object  = 'X'
          ui_decoupled               = 'X'
        EXCEPTIONS
          object_not_in_working_area = 1
          execution_error            = 2
          cancelled                  = 3
          insert_into_corr_error     = 4
          OTHERS                     = 5.
      IF sy-subrc = 0. APPEND |SFPF { lv_form }| TO lt_active. ELSE. lv_actmsg = |{ lv_actmsg } form activation rc { sy-subrc }|. ENDIF.
      COMMIT WORK AND WAIT.
    CATCH cx_root INTO lx_root.
      lv_raised = abap_true.
      lv_error = lx_root->get_text( ).
      " Diagnostics: class, raising position and text of every exception in the
      " chain (PREVIOUS), so the message tells which SAP check refused.
      lx_chain = lx_root.
      WHILE lx_chain IS BOUND AND strlen( lv_chain ) < 1500.
        CLEAR: lv_prog, lv_incl, lv_line.
        lx_chain->get_source_position( IMPORTING program_name = lv_prog
                                                 include_name = lv_incl
                                                 source_line  = lv_line ).
        lv_chain = |{ lv_chain }{ COND string( WHEN lv_chain IS NOT INITIAL THEN ` <- ` ) }| &&
                   |[{ cl_abap_classdescr=>get_class_name( lx_chain ) } at { lv_incl } line { lv_line }, program { lv_prog }] { lx_chain->get_text( ) }|.
        lx_chain = lx_chain->previous.
      ENDWHILE.
      lv_error = lv_chain.
      IF lv_g1err IS NOT INITIAL.
        lv_error = |{ lv_g1err } - form not saved|.
      ENDIF.
      " renames that were never saved are not reported
      lv_sfpf = |SFPF { lv_form }|.
      READ TABLE lt_saved TRANSPORTING NO FIELDS WITH KEY table_line = lv_sfpf.
      IF sy-subrc <> 0.
        CLEAR lt_renamed.
      ENDIF.
      TRY.
          IF lo_mig IS BOUND.
            lo_mig->log_message( type = 'E' message = |{ lv_error }| ).
            lo_mig->log_save( ).
          ENDIF.
          IF lo_wbf IS BOUND. lo_wbf->free( ). ENDIF.
          IF lo_wbi IS BOUND. lo_wbi->free( ). ENDIF.
        CATCH cx_root.                                          "#EC NO_HANDLER
      ENDTRY.
      " keep what was saved (the interface is saved before the context step); never delete here
      COMMIT WORK AND WAIT.
      lt_left = lt_saved.
  ENDTRY.

  " The migration log of this run (object SMARTFORM / XFAMIGRATION, external number = source).
  ls_extno-sign = 'I'. ls_extno-option = 'EQ'. ls_extno-low = lv_src. APPEND ls_extno TO ls_filter-extnumber.
  ls_obj-sign = 'I'. ls_obj-option = 'EQ'. ls_obj-low = cl_ssf_migration=>c_log_sf_object. APPEND ls_obj TO ls_filter-object.
  ls_sub-sign = 'I'. ls_sub-option = 'EQ'. ls_sub-low = cl_ssf_migration=>c_log_sf_subobject. APPEND ls_sub TO ls_filter-subobject.
  ls_filter-date_time-date_from = lv_date.
  ls_filter-date_time-time_from = lv_time.
  ls_filter-date_time-date_to = sy-datum.
  ls_filter-date_time-time_to = sy-uzeit.
  CALL FUNCTION 'BAL_DB_SEARCH'
    EXPORTING  i_s_log_filter = ls_filter
    IMPORTING  e_t_log_header = lt_headers
    EXCEPTIONS OTHERS         = 1.
  IF sy-subrc = 0 AND lt_headers IS NOT INITIAL.
    CALL FUNCTION 'BAL_DB_LOAD'
      EXPORTING  i_t_log_header = lt_headers
      IMPORTING  e_t_log_handle = lt_handles
      EXCEPTIONS OTHERS         = 1.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAL_GLB_SEARCH_MSG'
        EXPORTING  i_t_log_handle = lt_handles
        IMPORTING  e_t_msg_handle = lt_msgh
        EXCEPTIONS OTHERS         = 1.
      LOOP AT lt_msgh INTO ls_msgh.
        CALL FUNCTION 'BAL_LOG_MSG_READ'
          EXPORTING  i_s_msg_handle = ls_msgh
          IMPORTING  e_s_msg        = ls_msg
          EXCEPTIONS OTHERS         = 1.
        CHECK sy-subrc = 0.
        MESSAGE ID ls_msg-msgid TYPE 'S' NUMBER ls_msg-msgno
          WITH ls_msg-msgv1 ls_msg-msgv2 ls_msg-msgv3 ls_msg-msgv4 INTO lv_text.
        lv_text = escape( val = lv_text format = cl_abap_format=>e_json_string ).
        IF lv_log IS NOT INITIAL. lv_log = lv_log && `,`. ENDIF.
        lv_log = lv_log && |\{"type":"{ ls_msg-msgty }","text":"{ lv_text }"\}|.
      ENDLOOP.
      CALL FUNCTION 'BAL_GLB_MEMORY_REFRESH'
        EXPORTING  i_t_logs_to_be_refreshed = lt_handles
        EXCEPTIONS OTHERS                   = 1.
    ENDIF.
  ENDIF.

  " The options as SAP's migration object took them (after RECTIFY_MIGRATING_OPTIONS).
  IF lo_mig IS BOUND.
    ls_opt = lo_mig->options.
  ENDIF.
  lv_str = /ui2/cl_json=>serialize( data = ls_opt pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
  lv_error = escape( val = lv_error format = cl_abap_format=>e_json_string ).
  CONCATENATE LINES OF lt_saved INTO lv_list SEPARATED BY `","`.
  IF lv_list IS NOT INITIAL. lv_list = |"{ lv_list }"|. ENDIF.
  ev_result = |\{"source":"{ lv_src }","form":"{ lv_form }","interface":"{ lv_intf }","options":{ lv_str },| &&
              |"raised":{ COND string( WHEN lv_raised = abap_true THEN `true` ELSE `false` ) },"error":"{ lv_error }",| &&
              |"saved":[{ lv_list }],|.
  CONCATENATE LINES OF lt_left INTO lv_list SEPARATED BY `","`.
  IF lv_list IS NOT INITIAL. lv_list = |"{ lv_list }"|. ENDIF.
  ev_result = ev_result && |"left":[{ lv_list }],|.
  CONCATENATE LINES OF lt_active INTO lv_list SEPARATED BY `","`.
  IF lv_list IS NOT INITIAL. lv_list = |"{ lv_list }"|. ENDIF.
  lv_actmsg = escape( val = lv_actmsg format = cl_abap_format=>e_json_string ).
  CONCATENATE LINES OF lt_renamed INTO lv_str SEPARATED BY `,`.
  lv_cache = escape( val = lv_cache format = cl_abap_format=>e_json_string ).
  ev_result = ev_result && |"active":[{ lv_list }],"activation":"{ lv_actmsg }","renamed":[{ lv_str }],"cacheInfo":"{ lv_cache }","log":[{ lv_log }]\}|.
  " The dispatcher caller throws on EV_SUBRC <> 0 and never sees EV_RESULT:
  " the message itself names what was left and what is not active.
  CONCATENATE LINES OF lt_left INTO lv_list SEPARATED BY `, `.
  IF lv_raised = abap_true.
    ev_subrc = 8.
    ev_message = |FP_MIGRATE: SAP's migration raised: { lv_error }|.
    IF lv_list IS NOT INITIAL.
      ev_message = |{ ev_message } - left behind: { lv_list } (delete only with the user's OK)|.
    ELSE.
      ev_message = |{ ev_message } - nothing left behind|.
    ENDIF.
  ELSEIF lines( lt_active ) < 2.
    " Migrated and saved, but not both objects active: subrc 0 keeps the
    " result (and the log) for the caller, the message says it.
    CONCATENATE LINES OF lt_active INTO lv_list SEPARATED BY `, `.
    ev_message = |FP_MIGRATE: saved but NOT fully active (active: { COND string( WHEN lv_list IS INITIAL THEN `none` ELSE lv_list ) }) - { lv_actmsg }|.
  ENDIF.

ENDFUNCTION.

*&---------------------------------------------------------------------*
*& Form G1_WALK - rename duplicate sibling context nodes (gap G1)
*&---------------------------------------------------------------------*
* SAP's migration of a SmartForm 4.6C table creates, under the loop's work
* area, a DATA node per field and an (empty) FOLDER per table cell with the
* same name - the context check refuses duplicate names under one parent.
* Per parent: in a group of equal names the DATA node keeps its name (the
* layout binds the field), every other node becomes <NAME>_<n> (unique
* among the siblings, at most 30 characters). Refused (CV_ERR set, nothing
* renamed by the caller's save) when a node to rename has children, or when
* the group has no DATA node and the layout binds that path.
FORM g1_walk USING io_parent TYPE REF TO if_fp_node
                   iv_path   TYPE string
                   iv_xdp    TYPE string
             CHANGING ct_ren TYPE string_table
                      cv_err TYPE string.
  TYPES: BEGIN OF ty_kid,
           node TYPE REF TO if_fp_node,
           name TYPE fpnodename,
           type TYPE i,
         END OF ty_kid.
  DATA: lt_kid   TYPE STANDARD TABLE OF ty_kid WITH EMPTY KEY,
        ls_kid   TYPE ty_kid,
        ls_grp   TYPE ty_kid,
        lo_node  TYPE REF TO if_fp_node,
        lv_cnt   TYPE i,
        lv_data  TYPE abap_bool,
        lv_first TYPE abap_bool,
        lv_new   TYPE fpnodename,
        lv_base  TYPE string,
        lv_n     TYPE i,
        lv_path  TYPE string,
        lv_ref   TYPE string,
        lv_cut   TYPE i,
        lx_err   TYPE REF TO cx_root.
  FIELD-SYMBOLS <ls_k> TYPE ty_kid.

  IF cv_err IS NOT INITIAL OR io_parent IS NOT BOUND.
    RETURN.
  ENDIF.
  lo_node = io_parent->get_child( ).
  WHILE lo_node IS BOUND.
    ls_kid-node = lo_node.
    ls_kid-name = lo_node->get_name( ).
    ls_kid-type = lo_node->get_type( ).
    APPEND ls_kid TO lt_kid.
    lo_node = lo_node->get_successor( ).
  ENDWHILE.

  LOOP AT lt_kid INTO ls_grp.
    CLEAR lv_cnt.
    LOOP AT lt_kid TRANSPORTING NO FIELDS WHERE name = ls_grp-name.
      lv_cnt = lv_cnt + 1.
    ENDLOOP.
    IF lv_cnt < 2 OR ls_grp-name IS INITIAL.
      CONTINUE.
    ENDIF.
    lv_data = abap_false.
    LOOP AT lt_kid TRANSPORTING NO FIELDS WHERE name = ls_grp-name AND type = if_fp_node=>c_type_data.
      lv_data = abap_true.
    ENDLOOP.
    lv_path = COND string( WHEN iv_path IS INITIAL THEN |{ ls_grp-name }| ELSE |{ iv_path }.{ ls_grp-name }| ).
    lv_first = abap_true.
    LOOP AT lt_kid ASSIGNING <ls_k> WHERE name = ls_grp-name.
      ls_kid = <ls_k>.
      IF lv_data = abap_true AND ls_kid-type = if_fp_node=>c_type_data.
        CONTINUE.                       " the DATA node keeps the name
      ENDIF.
      IF lv_data = abap_false AND lv_first = abap_true.
        lv_first = abap_false.          " no DATA node: the first keeps the name
        CONTINUE.
      ENDIF.
      IF ls_kid-node->get_child( ) IS BOUND.
        cv_err = |duplicate context node names not fixed: { lv_path } (type { ls_kid-type }) has children - bindings below it would change|.
        RETURN.
      ENDIF.
      IF lv_data = abap_false.
        lv_ref = |$record.{ lv_path }|.
        IF iv_xdp CS |{ lv_ref }"| OR iv_xdp CS |{ lv_ref }.| OR iv_xdp CS |{ lv_ref }[|.
          cv_err = |duplicate context node names not fixed: { lv_path } is bound in the layout and has no DATA twin - which node is meant is unclear|.
          RETURN.
        ENDIF.
      ENDIF.
      " new name: <NAME>_<n>, unique among the siblings, at most 30 characters
      lv_n = 1.
      DO.
        lv_n = lv_n + 1.
        lv_base = ls_grp-name.
        lv_cut = 30 - strlen( |_{ lv_n }| ).
        IF strlen( lv_base ) > lv_cut.
          lv_base = lv_base(lv_cut).
        ENDIF.
        lv_new = |{ lv_base }_{ lv_n }|.
        READ TABLE lt_kid TRANSPORTING NO FIELDS WITH KEY name = lv_new.
        IF sy-subrc <> 0.
          EXIT.
        ENDIF.
      ENDDO.
      TRY.
          ls_kid-node->set_name( i_name = lv_new ).
        CATCH cx_root INTO lx_err.
          cv_err = |duplicate context node names not fixed: { lv_path } -> { lv_new }: { lx_err->get_text( ) }|.
          RETURN.
      ENDTRY.
      <ls_k>-name = lv_new.
      APPEND |\{"path":"{ lv_path }","from":"{ ls_grp-name }","to":"{ lv_new }","type":{ ls_kid-type }\}| TO ct_ren.
    ENDLOOP.
  ENDLOOP.

  " down the tree (paths as the layout binds them: a loop's work area gets [*])
  LOOP AT lt_kid INTO ls_kid.
    lv_path = COND string( WHEN iv_path IS INITIAL THEN |{ ls_kid-name }| ELSE |{ iv_path }.{ ls_kid-name }| ).
    IF ls_kid-type = if_fp_node=>c_type_loop_data.
      lv_path = |{ lv_path }[*]|.
    ENDIF.
    PERFORM g1_walk USING ls_kid-node lv_path iv_xdp CHANGING ct_ren cv_err.
    IF cv_err IS NOT INITIAL.
      RETURN.
    ENDIF.
  ENDLOOP.
ENDFORM.
