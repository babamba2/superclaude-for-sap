FUNCTION zmcp_fp_migrate
  IMPORTING
    VALUE(iv_source)    TYPE string
    VALUE(iv_form)      TYPE string
    VALUE(iv_interface) TYPE string
    VALUE(iv_preset)    TYPE string DEFAULT 'FULL'
    VALUE(iv_sender_country) TYPE land1 OPTIONAL
    VALUE(iv_correction) TYPE string OPTIONAL
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
*  - gap G2: include texts whose language field is CONTROL_PARAMETERS-LANGU
*    (a SmartForm interface parameter the Adobe context does not have) get no
*    language - they then print in the output language, as meant; gap G3:
*    with IV_SENDER_COUNTRY (T005 key) only, address nodes without a sender
*    country get it; both listed in "adjusted". Other CONTROL_PARAMETERS- /
*    OUTPUT_OPTIONS- / SFSY- fields are left as they are (SAP's check names
*    them);
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
* "to","type"}],"adjusted":[{"path","attribute","from","to"}],"cacheInfo",
* "correction":null | {"strict","ops","applied","notFound","ambiguous",
* "refused","partial","warnings":[...],"results":[{"i","op","rule",
* "status","detail"}]},"log":[{"type","text"}]}.
*
* IV_CORRECTION (optional): layout corrections applied to the migrated XDP
* before it is saved - see FORM fpc_apply. The op list is checked before
* anything is saved; with "strict" a single op not applied stops the run
* (form not saved); without it the result marks the run "partial".
* Model ops (gap G5 a, FORM fpc_model) in the same list: initSumByKey runs
* on the new interface before it is saved (strict and not applied ->
* nothing saved), contextDeactivate on the new context before the form is
* saved; their results are in the same "correction" report.
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
        lv_xdpc      TYPE xstring,
        lv_corr      TYPE string,
        lv_desc      TYPE fptext,
        lx_root      TYPE REF TO cx_root,
        lv_raised    TYPE abap_bool,
        lv_error     TYPE string,
        lx_chain     TYPE REF TO cx_root,
        lo_root      TYPE REF TO if_fp_node,
        lv_xdps      TYPE string,
        lt_renamed   TYPE string_table,
        lt_adjusted  TYPE string_table,
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
        lv_coff      TYPE i,
        lt_pre       TYPE string_table.
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
  " Optional layout correction (FORM fpc_apply): the op list is checked before anything is saved.
  IF iv_correction IS NOT INITIAL.
    PERFORM fpc_apply USING lv_xdp iv_correction abap_true lt_pre CHANGING lv_xdpc lv_corr lv_str.
    IF lv_str IS INITIAL.
      " model ops (interface / context): shape only here (phase X)
      PERFORM fpc_model USING iv_correction 'X' lo_intf lo_root CHANGING lt_pre lv_str.
    ENDIF.
    IF lv_str IS NOT INITIAL.
      ev_subrc = 8. ev_message = |FP_MIGRATE: { lv_str } - nothing saved|.
      RETURN.
    ENDIF.
  ENDIF.
  " Optional sender country for address nodes without one (gap G3): a T005 key.
  IF iv_sender_country IS NOT INITIAL.
    SELECT SINGLE land1 FROM t005 INTO @DATA(lv_land1) WHERE land1 = @iv_sender_country.
    IF sy-subrc <> 0.
      ev_subrc = 8. ev_message = |FP_MIGRATE: sender country "{ iv_sender_country }" refused - not a country key (T005)|.
      RETURN.
    ENDIF.
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
      " G5 (a) phase I: interface ops (initSumByKey) before the interface is saved;
      " strict and not applied -> CATCH below, nothing saved
      IF iv_correction IS NOT INITIAL.
        PERFORM fpc_model USING iv_correction 'I' lo_intf lo_root CHANGING lt_pre lv_g1err.
        IF lv_g1err IS NOT INITIAL.
          RAISE EXCEPTION TYPE cx_fp_api_usage.  " -> CATCH below; lv_g1err is the text
        ENDIF.
      ENDIF.
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
      " Gaps G2 / G3: CONTROL_PARAMETERS-LANGU as include-text language (no such field
      " in the Adobe context - an include text without a language prints in the output
      " language, which is what it meant) and, with IV_SENDER_COUNTRY only, a sender
      " country on address nodes that have none (FORM g2g3_walk, listed in "adjusted").
      CLEAR lv_str.
      PERFORM g2g3_walk USING lo_root lv_str iv_sender_country CHANGING lt_adjusted lv_g1err.
      IF lv_g1err IS NOT INITIAL.
        RAISE EXCEPTION TYPE cx_fp_api_usage.    " -> CATCH below, form not saved
      ENDIF.

      " Layout correction (spec from the SmartForm, FORM fpc_apply): edits the migrated
      " XDP through the iXML DOM before the new layout id / hash / cache info; strict
      " and not every op applied -> CATCH below, form not saved.
      IF iv_correction IS NOT INITIAL.
        " G5 (a) phase C: context ops (contextDeactivate) before the form is saved
        PERFORM fpc_model USING iv_correction 'C' lo_intf lo_root CHANGING lt_pre lv_g1err.
        IF lv_g1err IS NOT INITIAL.
          RAISE EXCEPTION TYPE cx_fp_api_usage.  " -> CATCH below; lv_g1err is the text
        ENDIF.
        PERFORM fpc_apply USING lv_xdp iv_correction abap_false lt_pre CHANGING lv_xdpc lv_corr lv_g1err.
        IF lv_g1err IS NOT INITIAL.
          RAISE EXCEPTION TYPE cx_fp_api_usage.  " -> CATCH below; lv_g1err is the text
        ENDIF.
        lo_layout->set_layout_data( i_layout_data = lv_xdpc i_set_xliff_ids = abap_false ).
      ENDIF.
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
        CLEAR: lt_renamed, lt_adjusted.
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
  ev_result = ev_result && |"active":[{ lv_list }],"activation":"{ lv_actmsg }","renamed":[{ lv_str }],|.
  CONCATENATE LINES OF lt_adjusted INTO lv_str SEPARATED BY `,`.
  IF lv_corr IS INITIAL. lv_corr = `null`. ENDIF.
  ev_result = ev_result && |"adjusted":[{ lv_str }],"cacheInfo":"{ lv_cache }","correction":{ lv_corr },"log":[{ lv_log }]\}|.
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
* layout binds the field); in a group without a DATA node the one member
* with children keeps it (its children carry the bindings, e.g. a FOLDER
* next to a PROGRAMLINES node of the same name), else the first member.
* Every other node becomes <NAME>_<n> (unique among the siblings, at most
* 30 characters). Refused (CV_ERR set, nothing renamed by the caller's
* save) when a node to rename has children (two or more members with
* children), or when the group has no DATA node and the layout binds that
* path itself (not only through the keeper's children).
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
        lo_keep  TYPE REF TO if_fp_node,
        lv_kids  TYPE i,
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
    " no DATA node: the member with children keeps the name, else the first member
    CLEAR: lo_keep, lv_kids.
    IF lv_data = abap_false.
      LOOP AT lt_kid INTO ls_kid WHERE name = ls_grp-name.
        IF lo_keep IS NOT BOUND.
          lo_keep = ls_kid-node.
        ENDIF.
        IF ls_kid-node->get_child( ) IS BOUND.
          lv_kids = lv_kids + 1.
          IF lv_kids = 1.
            lo_keep = ls_kid-node.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDIF.
    LOOP AT lt_kid ASSIGNING <ls_k> WHERE name = ls_grp-name.
      ls_kid = <ls_k>.
      IF lv_data = abap_true AND ls_kid-type = if_fp_node=>c_type_data.
        CONTINUE.                       " the DATA node keeps the name
      ENDIF.
      IF lv_data = abap_false AND ls_kid-node = lo_keep.
        CONTINUE.                       " no DATA node: the keeper keeps the name
      ENDIF.
      IF ls_kid-node->get_child( ) IS BOUND.
        cv_err = |duplicate context node names not fixed: { lv_path } (type { ls_kid-type }) has children - bindings below it would change|.
        RETURN.
      ENDIF.
      IF lv_data = abap_false.
        " a binding of the path itself is ambiguous; one through the keeper's children
        " ($record.<path>.<child>) is not, when the keeper is the only member with children
        lv_ref = |$record.{ lv_path }|.
        IF iv_xdp CS |{ lv_ref }"| OR iv_xdp CS |{ lv_ref }[|
           OR ( lv_kids = 0 AND iv_xdp CS |{ lv_ref }.| ).
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

*&---------------------------------------------------------------------*
*& Form G2G3_WALK - include-text language and address sender country
*&---------------------------------------------------------------------*
FORM g2g3_walk USING io_parent  TYPE REF TO if_fp_node
                     iv_path    TYPE string
                     iv_country TYPE land1
               CHANGING ct_adj  TYPE string_table
                        cv_err  TYPE string.
  DATA: lo_node TYPE REF TO if_fp_node,
        lo_ti   TYPE REF TO if_fp_text_include,
        lo_ad   TYPE REF TO if_fp_address,
        ls_lang TYPE sfptextilang,
        ls_ctry TYPE sfpsendercountry,
        lv_path TYPE string,
        lx_err  TYPE REF TO cx_root.

  IF cv_err IS NOT INITIAL OR io_parent IS NOT BOUND.
    RETURN.
  ENDIF.
  lo_node = io_parent->get_child( ).
  WHILE lo_node IS BOUND.
    lv_path = COND string( WHEN iv_path IS INITIAL THEN |{ lo_node->get_name( ) }| ELSE |{ iv_path }.{ lo_node->get_name( ) }| ).
    TRY.
        CASE lo_node->get_type( ).
          WHEN if_fp_node=>c_type_text_include.
            lo_ti ?= lo_node.
            ls_lang = lo_ti->get_text_language( ).
            IF ls_lang-languagefield = 'CONTROL_PARAMETERS-LANGU'.
              lo_ti->set_text_language( i_text_language = VALUE #( ) ).
              APPEND |\{"path":"{ lv_path }","attribute":"LANGUAGEFIELD","from":"CONTROL_PARAMETERS-LANGU","to":""\}| TO ct_adj.
            ENDIF.
          WHEN if_fp_node=>c_type_address.
            lo_ad ?= lo_node.
            ls_ctry = lo_ad->get_sender_country( ).
            IF iv_country IS NOT INITIAL AND ls_ctry-sendercountry IS INITIAL AND ls_ctry-sendercountryfield IS INITIAL.
              lo_ad->set_sender_country( i_sender_country = VALUE #( sendercountry = iv_country ) ).
              APPEND |\{"path":"{ lv_path }","attribute":"SENDERCOUNTRY","from":"","to":"{ iv_country }"\}| TO ct_adj.
            ENDIF.
        ENDCASE.
      CATCH cx_root INTO lx_err.
        cv_err = |adjustment not made: { lv_path }: { lx_err->get_text( ) }|.
        RETURN.
    ENDTRY.
    IF lo_node->get_type( ) = if_fp_node=>c_type_loop_data.
      lv_path = |{ lv_path }[*]|.
    ENDIF.
    PERFORM g2g3_walk USING lo_node lv_path iv_country CHANGING ct_adj cv_err.
    IF cv_err IS NOT INITIAL.
      RETURN.
    ENDIF.
    lo_node = lo_node->get_successor( ).
  ENDWHILE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_APPLY - layout correction of the migrated XDP (spec v1)
*&---------------------------------------------------------------------*
* IV_CORR: {"strict":bool,"ops":[{op, rule, basis, path | protoid [+ path]
* | xliffid, op fields...}]} - the flat form the MCP tool sends (keys lower
* case, CSS as "name:value;..."). Edits only through the iXML DOM, only in
* the <template> packet. Targets: path = names from the root subform's own
* name, "name[n]" = n-th (0-based) among the matches, unnamed subforms /
* areas are transparent, inner segments match containers only; protoid =
* id of a child of a <proto>, path relative to it; xliffid = xliff:id.
* Ops: layout, geometry, margin, font, para, xhtml, picture, border,
* presence (presence needs "basis" - the SmartForm node or condition),
* datepicture (the only script edit: in a field's initialize scripts exactly
* one "$.format.picture = DateFmt(<n>, $.locale)" must occur; its DateFmt
* call is replaced by the string literal of a date{...} picture; 0 or more
* -> refused; $.ui.picture and other script text stay untouched; the result
* names the text replaced), bind (a subform or field: match "dataRef" with
* a ref on the $record allow-list - names, [0] or [*] - or "none"; needs a
* basis; replaces the node's own <bind> or adds one after <occur>; binds
* below the target outside the new ref's [*] prefix are warned).
* contextdeactivate / initsumbykey are model ops: FORM fpc_model runs them
* earlier; here IT_PRE ("<i>|<status>|<detail>") gives their result.
* Every value is checked (allow-lists, measurement mm / pt / cm / in).
* IV_CHECK = X: parse and check the op list only (no DOM) - the FM runs
* it before anything is saved. Result per op: applied / not_found /
* ambiguous / refused. Strict and not all applied -> CV_ERR (not saved).
FORM fpc_apply USING iv_xdp   TYPE xstring
                     iv_corr  TYPE string
                     iv_check TYPE abap_bool
                     it_pre   TYPE string_table
               CHANGING cv_xdp    TYPE xstring
                        cv_report TYPE string
                        cv_err    TYPE string.
  TYPES: BEGIN OF ty_op,
           op          TYPE string,
           rule        TYPE string,
           basis       TYPE string,
           path        TYPE string,
           protoid     TYPE string,
           xliffid     TYPE string,
           value       TYPE string,
           x           TYPE string,
           y           TYPE string,
           w           TYPE string,
           h           TYPE string,
           anchortype  TYPE string,
           topinset    TYPE string,
           bottominset TYPE string,
           leftinset   TYPE string,
           rightinset  TYPE string,
           typeface    TYPE string,
           size        TYPE string,
           weight      TYPE string,
           spaceabove  TYPE string,
           spacebelow  TYPE string,
           marginleft  TYPE string,
           marginright TYPE string,
           textindent  TYPE string,
           lineheight  TYPE string,
           halign      TYPE string,
           valign      TYPE string,
           div         TYPE string,
           css         TYPE string,
           display     TYPE string,
           format      TYPE string,
           edge        TYPE string,
           presence    TYPE string,
           thickness   TYPE string,
           picture     TYPE string,
           match       TYPE string,
           ref         TYPE string,
           node        TYPE string,
         END OF ty_op,
         BEGIN OF ty_corr,
           strict TYPE abap_bool,
           ops    TYPE STANDARD TABLE OF ty_op WITH EMPTY KEY,
         END OF ty_corr,
         BEGIN OF ty_kv,
           k TYPE string,
           v TYPE string,
         END OF ty_kv.
  DATA: ls_c       TYPE ty_corr,
        lo_ixml    TYPE REF TO if_ixml,
        lo_sf      TYPE REF TO if_ixml_stream_factory,
        lo_doc     TYPE REF TO if_ixml_document,
        lo_parser  TYPE REF TO if_ixml_parser,
        lo_ostream TYPE REF TO if_ixml_ostream,
        lo_enc     TYPE REF TO if_ixml_encoding,
        lo_n       TYPE REF TO if_ixml_node,
        lo_tpl     TYPE REF TO if_ixml_element,
        lo_root    TYPE REF TO if_ixml_element,
        lo_t       TYPE REF TO if_ixml_element,
        lo_c       TYPE REF TO if_ixml_element,
        lo_c2      TYPE REF TO if_ixml_element,
        lo_x       TYPE REF TO if_ixml_element,
        lo_clone   TYPE REF TO if_ixml_node,
        lt_hits    TYPE STANDARD TABLE OF REF TO if_ixml_element WITH EMPTY KEY,
        lt_edges   TYPE STANDARD TABLE OF REF TO if_ixml_element WITH EMPTY KEY,
        lt_kv      TYPE STANDARD TABLE OF ty_kv WITH EMPTY KEY,
        lt_css     TYPE STANDARD TABLE OF ty_kv WITH EMPTY KEY,
        ls_kv      TYPE ty_kv,
        lt_parts   TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lt_lines   TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lt_warn    TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lv_xdps    TYPE string,
        lv_status  TYPE string,
        lv_detail  TYPE string,
        lv_tag     TYPE string,
        lv_s       TYPE string,
        lv_k       TYPE string,
        lv_v       TYPE string,
        lv_ok      TYPE abap_bool,
        lv_model   TYPE abap_bool,
        lv_pfx     TYPE string,
        lv_i       TYPE i,
        lv_n       TYPE i,
        lv_cnt     TYPE i,
        lv_app     TYPE i,
        lv_nf      TYPE i,
        lv_amb     TYPE i,
        lv_ref     TYPE i,
        lv_cnt2    TYPE i,
        lv_off2    TYPE i,
        lv_len2    TYPE i.
  FIELD-SYMBOLS: <ls_op> TYPE ty_op,
                 <ls_kv> TYPE ty_kv.
  " (?-x) in patterns with a space or #: ABAP runs PCRE in extended mode by default
  CONSTANTS: c_ops   TYPE string VALUE ` layout geometry margin font para xhtml picture border presence datepicture bind contextdeactivate initsumbykey `,
             " model ops (FORM fpc_model): run on the interface / context, not on the XDP
             c_model TYPE string VALUE ` contextdeactivate initsumbykey `,
             c_bref  TYPE string VALUE `(?-x)\$record(\.[A-Za-z_][A-Za-z0-9_]{0,29}(\[(0|\*)\])?){1,12}`,
             c_dpict TYPE string VALUE `(?-x)date[{][DMY][DMY./ -]{0,19}[}]`,
             " the display-picture assignment only (not $.ui.picture, not LocalDateFmt)
             c_datefmt TYPE string VALUE `(?-x)\$\.format\.picture\s*=\s*DateFmt\(\s*\d\s*,\s*\$\.locale\s*\)`,
             c_css   TYPE string VALUE ` line-height margin-left margin-right margin-top margin-bottom text-indent tab-stops font-size font-family font-weight text-align `,
             c_meas  TYPE string VALUE `-?[0-9]{1,4}([.][0-9]{1,4})?(mm|pt|cm|in)`,
             c_pict  TYPE string VALUE `[A-Za-z]+[{][^{}<>&]{1,80}[}]([|][A-Za-z]+[{][^{}<>&]{1,80}[}]){0,5}`.

  CLEAR: cv_xdp, cv_report, cv_err.
  IF strlen( iv_corr ) > 1000000.
    cv_err = |correction refused - more than 1 000 000 characters|.
    RETURN.
  ENDIF.
  TRY.
      /ui2/cl_json=>deserialize( EXPORTING json        = iv_corr
                                           pretty_name = /ui2/cl_json=>pretty_mode-low_case
                                 CHANGING  data        = ls_c ).
    CATCH cx_root.
      cv_err = |correction refused - not the expected JSON|.
      RETURN.
  ENDTRY.
  lv_cnt = lines( ls_c-ops ).
  IF lv_cnt = 0 OR lv_cnt > 500.
    cv_err = |correction refused - 1 to 500 ops ({ lv_cnt })|.
    RETURN.
  ENDIF.
  LOOP AT ls_c-ops ASSIGNING <ls_op>.
    lv_i = sy-tabix.
    <ls_op>-op = to_lower( condense( <ls_op>-op ) ).
    IF <ls_op>-op IS INITIAL OR c_ops NS | { <ls_op>-op } |.
      cv_err = |correction refused - op { lv_i } "{ substring( val = <ls_op>-op len = nmin( val1 = 20 val2 = strlen( <ls_op>-op ) ) ) }" unknown|.
      RETURN.
    ENDIF.
    " model ops have no layout target; FORM fpc_model checks their shape
    IF c_model CS | { <ls_op>-op } |.
      CONTINUE.
    ENDIF.
    IF <ls_op>-op = 'bind'.
      <ls_op>-match = to_lower( condense( <ls_op>-match ) ).
      IF <ls_op>-match <> 'dataref' AND <ls_op>-match <> 'none'.
        cv_err = |correction refused - op { lv_i } bind: match dataRef or none|.
        RETURN.
      ENDIF.
      IF <ls_op>-match = 'dataref' AND ( strlen( <ls_op>-ref ) > 400 OR NOT matches( val = <ls_op>-ref pcre = c_bref ) ).
        cv_err = |correction refused - op { lv_i } bind: ref not allowed ($record path, names, [0] or [*] only)|.
        RETURN.
      ENDIF.
      IF <ls_op>-basis IS INITIAL OR strlen( <ls_op>-basis ) > 200.
        cv_err = |correction refused - op { lv_i } bind needs a basis (the SmartForm node or rule)|.
        RETURN.
      ENDIF.
    ENDIF.
    IF <ls_op>-path IS INITIAL AND <ls_op>-protoid IS INITIAL AND <ls_op>-xliffid IS INITIAL.
      cv_err = |correction refused - op { lv_i } has no target|.
      RETURN.
    ENDIF.
    IF strlen( <ls_op>-path ) > 1000 OR strlen( <ls_op>-protoid ) > 100 OR strlen( <ls_op>-xliffid ) > 100.
      cv_err = |correction refused - op { lv_i } target too long|.
      RETURN.
    ENDIF.
  ENDLOOP.
  IF iv_check = abap_true.
    RETURN.
  ENDIF.

  lv_xdps = cl_abap_codepage=>convert_from( iv_xdp ).
  lo_ixml = cl_ixml=>create( ).
  lo_sf = lo_ixml->create_stream_factory( ).
  lo_doc = lo_ixml->create_document( ).
  lo_parser = lo_ixml->create_parser( stream_factory = lo_sf
                                      istream        = lo_sf->create_istream_xstring( string = iv_xdp )
                                      document       = lo_doc ).
  lo_parser->set_normalizing( abap_false ).
  IF lo_parser->parse( ) <> 0.
    cv_err = |correction: the migrated layout does not parse as XML|.
    RETURN.
  ENDIF.
  lo_n = lo_doc->get_root_element( )->get_first_child( ).
  WHILE lo_n IS BOUND.
    IF lo_n->get_type( ) = if_ixml_node=>co_node_element AND lo_n->get_name( ) = 'template'.
      lo_tpl ?= lo_n.
      EXIT.
    ENDIF.
    lo_n = lo_n->get_next( ).
  ENDWHILE.
  IF lo_tpl IS BOUND.
    lo_n = lo_tpl->get_first_child( ).
    WHILE lo_n IS BOUND.
      IF lo_n->get_type( ) = if_ixml_node=>co_node_element AND lo_n->get_name( ) = 'subform'.
        lo_root ?= lo_n.
        EXIT.
      ENDIF.
      lo_n = lo_n->get_next( ).
    ENDWHILE.
  ENDIF.
  IF lo_root IS NOT BOUND.
    cv_err = |correction: no <template> packet with a root subform in the migrated layout|.
    RETURN.
  ENDIF.

  LOOP AT ls_c-ops ASSIGNING <ls_op>.
    lv_i = sy-tabix - 1.
    CLEAR: lv_status, lv_detail, lo_t, lt_hits.
    lv_model = xsdbool( c_model CS | { <ls_op>-op } | ).
    " ---- target
    IF lv_model = abap_true.
      " ran on the interface / context before (FORM fpc_model): "<i>|<status>|<detail>"
      lv_status = 'not_found'. lv_detail = `model op did not run`.
      LOOP AT it_pre INTO lv_s.
        " the last target takes the rest, separators included
        SPLIT lv_s AT '|' INTO lv_k lv_v lv_tag.
        IF lv_k = |{ lv_i }|.
          lv_status = lv_v. lv_detail = lv_tag.
          EXIT.
        ENDIF.
      ENDLOOP.
    ELSEIF <ls_op>-protoid IS NOT INITIAL.
      PERFORM fpc_proto USING lo_tpl <ls_op>-protoid CHANGING lt_hits.
      PERFORM fpc_pick USING lt_hits `` CHANGING lo_t lv_status.
      IF lo_t IS BOUND AND <ls_op>-path IS NOT INITIAL.
        " separate start variable: FORM parameters are passed by reference
        lo_x = lo_t.
        PERFORM fpc_path USING lo_x <ls_op>-path abap_false CHANGING lo_t lv_status.
      ENDIF.
    ELSEIF <ls_op>-xliffid IS NOT INITIAL.
      PERFORM fpc_xliff USING lo_tpl <ls_op>-xliffid CHANGING lt_hits.
      PERFORM fpc_pick USING lt_hits `` CHANGING lo_t lv_status.
    ELSE.
      PERFORM fpc_path USING lo_root <ls_op>-path abap_true CHANGING lo_t lv_status.
    ENDIF.
    IF lo_t IS NOT BOUND AND lv_status = 'refused' AND lv_model = abap_false.
      lv_detail = `path segment not allowed (name or name[n])`.
    ENDIF.
    IF lo_t IS BOUND.
      lv_tag = lo_t->get_name( ).
      lv_status = 'applied'.
      " ---- op
      CASE <ls_op>-op.
        WHEN 'layout'.
          IF lv_tag <> 'subform' AND lv_tag <> 'subformSet'.
            lv_status = 'refused'. lv_detail = |target is a { lv_tag }, not a subform|.
          ELSEIF ` position tb lr-tb rl-tb table row ` NS | { <ls_op>-value } | OR <ls_op>-value IS INITIAL.
            lv_status = 'refused'. lv_detail = `layout value not allowed`.
          ELSE.
            lo_t->set_attribute( name = 'layout' value = <ls_op>-value ).
          ENDIF.
        WHEN 'geometry'.
          CLEAR lt_kv.
          ls_kv-k = 'x'. ls_kv-v = <ls_op>-x. APPEND ls_kv TO lt_kv.
          ls_kv-k = 'y'. ls_kv-v = <ls_op>-y. APPEND ls_kv TO lt_kv.
          ls_kv-k = 'w'. ls_kv-v = <ls_op>-w. APPEND ls_kv TO lt_kv.
          ls_kv-k = 'h'. ls_kv-v = <ls_op>-h. APPEND ls_kv TO lt_kv.
          IF <ls_op>-anchortype IS NOT INITIAL AND ` topLeft topCenter topRight middleLeft middleCenter middleRight bottomLeft bottomCenter bottomRight ` NS | { <ls_op>-anchortype } |.
            lv_status = 'refused'. lv_detail = `anchorType value not allowed`.
          ELSE.
            IF <ls_op>-x IS NOT INITIAL OR <ls_op>-y IS NOT INITIAL OR <ls_op>-w IS NOT INITIAL OR <ls_op>-h IS NOT INITIAL
               OR <ls_op>-anchortype IS INITIAL.
              PERFORM fpc_attrs USING lo_t lt_kv c_meas abap_true CHANGING lv_status lv_detail.
            ENDIF.
            IF lv_status = 'applied' AND <ls_op>-anchortype IS NOT INITIAL.
              lo_t->set_attribute( name = 'anchorType' value = <ls_op>-anchortype ).
            ENDIF.
          ENDIF.
        WHEN 'margin'.
          CLEAR lt_kv.
          ls_kv-k = 'topInset'.    ls_kv-v = <ls_op>-topinset.    APPEND ls_kv TO lt_kv.
          ls_kv-k = 'bottomInset'. ls_kv-v = <ls_op>-bottominset. APPEND ls_kv TO lt_kv.
          ls_kv-k = 'leftInset'.   ls_kv-v = <ls_op>-leftinset.   APPEND ls_kv TO lt_kv.
          ls_kv-k = 'rightInset'.  ls_kv-v = <ls_op>-rightinset.  APPEND ls_kv TO lt_kv.
          PERFORM fpc_attrs USING lo_t lt_kv c_meas abap_false CHANGING lv_status lv_detail.   " check only
          IF lv_status = 'applied'.
            PERFORM fpc_child USING lo_doc lo_t 'margin' CHANGING lo_c.
            PERFORM fpc_attrs USING lo_c lt_kv c_meas abap_true CHANGING lv_status lv_detail.
          ENDIF.
        WHEN 'font'.
          IF <ls_op>-typeface IS NOT INITIAL AND NOT matches( val = <ls_op>-typeface pcre = `(?-x)[A-Za-z0-9 -]{1,60}` ).
            lv_status = 'refused'. lv_detail = `typeface not allowed`.
          ELSEIF <ls_op>-weight IS NOT INITIAL AND <ls_op>-weight <> 'normal' AND <ls_op>-weight <> 'bold'.
            lv_status = 'refused'. lv_detail = `weight: normal or bold`.
          ELSEIF <ls_op>-size IS NOT INITIAL AND NOT matches( val = <ls_op>-size pcre = c_meas ).
            lv_status = 'refused'. lv_detail = `size not a measurement`.
          ELSE.
            PERFORM fpc_child USING lo_doc lo_t 'font' CHANGING lo_c.
            IF <ls_op>-typeface IS NOT INITIAL.
              lo_c->set_attribute( name = 'typeface' value = <ls_op>-typeface ).
              " font substitution: a typeface the layout uses nowhere else may be missing in ADS
              IF lv_xdps NS |typeface="{ <ls_op>-typeface }"|.
                APPEND |op { lv_i }: typeface "{ <ls_op>-typeface }" is not used elsewhere in the layout - ADS may substitute it| TO lt_warn.
              ENDIF.
            ENDIF.
            IF <ls_op>-size IS NOT INITIAL.
              lo_c->set_attribute( name = 'size' value = <ls_op>-size ).
            ENDIF.
            IF <ls_op>-weight IS NOT INITIAL.
              lo_c->set_attribute( name = 'weight' value = <ls_op>-weight ).
            ENDIF.
          ENDIF.
        WHEN 'para'.
          CLEAR lt_kv.
          ls_kv-k = 'spaceAbove'.  ls_kv-v = <ls_op>-spaceabove.  APPEND ls_kv TO lt_kv.
          ls_kv-k = 'spaceBelow'.  ls_kv-v = <ls_op>-spacebelow.  APPEND ls_kv TO lt_kv.
          ls_kv-k = 'marginLeft'.  ls_kv-v = <ls_op>-marginleft.  APPEND ls_kv TO lt_kv.
          ls_kv-k = 'marginRight'. ls_kv-v = <ls_op>-marginright. APPEND ls_kv TO lt_kv.
          ls_kv-k = 'textIndent'.  ls_kv-v = <ls_op>-textindent.  APPEND ls_kv TO lt_kv.
          ls_kv-k = 'lineHeight'.  ls_kv-v = <ls_op>-lineheight.  APPEND ls_kv TO lt_kv.
          IF <ls_op>-halign IS NOT INITIAL AND ` left center right justify justifyAll radix ` NS | { <ls_op>-halign } |.
            lv_status = 'refused'. lv_detail = `hAlign value not allowed`.
          ELSEIF <ls_op>-valign IS NOT INITIAL AND ` top middle bottom ` NS | { <ls_op>-valign } |.
            lv_status = 'refused'. lv_detail = `vAlign value not allowed`.
          ELSE.
            lv_s = |{ <ls_op>-spaceabove }{ <ls_op>-spacebelow }{ <ls_op>-marginleft }{ <ls_op>-marginright }{ <ls_op>-textindent }{ <ls_op>-lineheight }|.
            IF lv_s IS NOT INITIAL OR ( <ls_op>-halign IS INITIAL AND <ls_op>-valign IS INITIAL ).
              PERFORM fpc_attrs USING lo_t lt_kv c_meas abap_false CHANGING lv_status lv_detail.   " check only
            ENDIF.
            IF lv_status = 'applied'.
              PERFORM fpc_child USING lo_doc lo_t 'para' CHANGING lo_c.
              IF lv_s IS NOT INITIAL.
                PERFORM fpc_attrs USING lo_c lt_kv c_meas abap_true CHANGING lv_status lv_detail.
              ENDIF.
              IF <ls_op>-halign IS NOT INITIAL.
                lo_c->set_attribute( name = 'hAlign' value = <ls_op>-halign ).
              ENDIF.
              IF <ls_op>-valign IS NOT INITIAL.
                lo_c->set_attribute( name = 'vAlign' value = <ls_op>-valign ).
              ENDIF.
            ENDIF.
          ENDIF.
        WHEN 'xhtml'.
          " CSS on the n-th <p> / <div> (document order, 0-based) of the target's exData
          CLEAR: lt_hits, lt_css.
          PERFORM fpc_desc USING lo_t 'exData' CHANGING lt_hits.
          READ TABLE lt_hits INTO lo_x INDEX 1.
          IF sy-subrc <> 0.
            lv_status = 'not_found'. lv_detail = `no exData (rich text) in the target`.
          ELSEIF NOT matches( val = <ls_op>-div pcre = `[0-9]{1,3}` ).
            lv_status = 'refused'. lv_detail = `div: a number`.
          ELSE.
            CLEAR lt_hits.
            PERFORM fpc_desc USING lo_x 'p' CHANGING lt_hits.    " p and div, document order
            lv_n = <ls_op>-div + 1.
            READ TABLE lt_hits INTO lo_c INDEX lv_n.
            IF sy-subrc <> 0.
              lv_status = 'not_found'. lv_detail = |no paragraph { <ls_op>-div } in the rich text|.
            ELSE.
              SPLIT <ls_op>-css AT ';' INTO TABLE lt_parts.
              LOOP AT lt_parts INTO lv_s WHERE table_line IS NOT INITIAL.
                SPLIT lv_s AT ':' INTO lv_k lv_v.
                lv_k = to_lower( condense( lv_k ) ). lv_v = condense( lv_v ).
                IF c_css NS | { lv_k } | OR lv_k IS INITIAL
                   OR NOT matches( val = lv_v pcre = `(?-x)[A-Za-z0-9 .,#%'-]{1,120}` ).
                  lv_status = 'refused'. lv_detail = |CSS "{ substring( val = lv_s len = nmin( val1 = 40 val2 = strlen( lv_s ) ) ) }" not allowed|.
                  EXIT.
                ENDIF.
                ls_kv-k = lv_k. ls_kv-v = lv_v. APPEND ls_kv TO lt_css.
              ENDLOOP.
              IF lv_status = 'applied' AND lt_css IS INITIAL.
                lv_status = 'refused'. lv_detail = `no CSS given`.
              ENDIF.
              IF lv_status = 'applied'.
                " merge into the existing style attribute
                CLEAR lt_kv.
                lv_s = lo_c->get_attribute( name = 'style' ).
                SPLIT lv_s AT ';' INTO TABLE lt_parts.
                LOOP AT lt_parts INTO lv_s WHERE table_line IS NOT INITIAL.
                  SPLIT lv_s AT ':' INTO lv_k lv_v.
                  ls_kv-k = to_lower( condense( lv_k ) ). ls_kv-v = condense( lv_v ).
                  IF ls_kv-k IS NOT INITIAL. APPEND ls_kv TO lt_kv. ENDIF.
                ENDLOOP.
                LOOP AT lt_css INTO ls_kv.
                  READ TABLE lt_kv ASSIGNING <ls_kv> WITH KEY k = ls_kv-k.
                  IF sy-subrc = 0. <ls_kv>-v = ls_kv-v. ELSE. APPEND ls_kv TO lt_kv. ENDIF.
                ENDLOOP.
                CLEAR lv_s.
                LOOP AT lt_kv INTO ls_kv.
                  lv_s = |{ lv_s }{ ls_kv-k }:{ ls_kv-v };|.
                ENDLOOP.
                lo_c->set_attribute( name = 'style' value = lv_s ).
              ENDIF.
            ENDIF.
          ENDIF.
        WHEN 'picture'.
          IF <ls_op>-display IS INITIAL AND <ls_op>-format IS INITIAL.
            lv_status = 'refused'. lv_detail = `display or format needed`.
          ELSEIF ( <ls_op>-display IS NOT INITIAL AND NOT matches( val = <ls_op>-display pcre = c_pict ) )
              OR ( <ls_op>-format IS NOT INITIAL AND NOT matches( val = <ls_op>-format pcre = c_pict ) ).
            lv_status = 'refused'. lv_detail = `picture clause not allowed`.
          ELSEIF lv_tag <> 'field' AND lv_tag <> 'draw'.
            lv_status = 'refused'. lv_detail = |target is a { lv_tag }, not a field or draw|.
          ELSE.
            IF <ls_op>-format IS NOT INITIAL.
              PERFORM fpc_child USING lo_doc lo_t 'format' CHANGING lo_c.
              PERFORM fpc_child USING lo_doc lo_c 'picture' CHANGING lo_c2.
              lo_c2->set_value( <ls_op>-format ).
            ENDIF.
            IF <ls_op>-display IS NOT INITIAL.
              PERFORM fpc_child USING lo_doc lo_t 'ui' CHANGING lo_c.
              PERFORM fpc_child USING lo_doc lo_c 'picture' CHANGING lo_c2.
              lo_c2->set_value( <ls_op>-display ).
            ENDIF.
          ENDIF.
        WHEN 'border'.
          IF NOT matches( val = <ls_op>-edge pcre = `[0-3]` ).
            lv_status = 'refused'. lv_detail = `edge: 0 to 3`.
          ELSEIF <ls_op>-presence IS NOT INITIAL AND ` visible hidden invisible ` NS | { <ls_op>-presence } |.
            lv_status = 'refused'. lv_detail = `edge presence not allowed`.
          ELSEIF <ls_op>-thickness IS NOT INITIAL AND NOT matches( val = <ls_op>-thickness pcre = c_meas ).
            lv_status = 'refused'. lv_detail = `thickness not a measurement`.
          ELSEIF <ls_op>-presence IS INITIAL AND <ls_op>-thickness IS INITIAL.
            lv_status = 'refused'. lv_detail = `presence or thickness needed`.
          ELSE.
            PERFORM fpc_child USING lo_doc lo_t 'border' CHANGING lo_c.
            CLEAR lt_edges.
            PERFORM fpc_kids USING lo_c 'edge' CHANGING lt_edges.
            IF lt_edges IS INITIAL.
              PERFORM fpc_child USING lo_doc lo_c 'edge' CHANGING lo_c2.
              APPEND lo_c2 TO lt_edges.
            ENDIF.
            " XFA: 1 edge = all four sides; give the border 4 edges (copies of the last)
            " before one side is changed
            lv_n = <ls_op>-edge + 1.
            IF lv_n > lines( lt_edges ).
              WHILE lines( lt_edges ) < 4.
                READ TABLE lt_edges INTO lo_x INDEX lines( lt_edges ).
                lo_clone = lo_x->clone( ).
                lo_n = lo_x->get_next( ).
                IF lo_n IS BOUND.
                  lv_ref = lo_c->insert_child( new_child = lo_clone ref_child = lo_n ).
                ELSE.
                  lv_ref = lo_c->append_child( new_child = lo_clone ).
                ENDIF.
                lo_x ?= lo_clone.
                APPEND lo_x TO lt_edges.
              ENDWHILE.
            ENDIF.
            READ TABLE lt_edges INTO lo_c2 INDEX lv_n.
            IF <ls_op>-presence IS NOT INITIAL.
              lo_c2->set_attribute( name = 'presence' value = <ls_op>-presence ).
            ENDIF.
            IF <ls_op>-thickness IS NOT INITIAL.
              lo_c2->set_attribute( name = 'thickness' value = <ls_op>-thickness ).
            ENDIF.
          ENDIF.
        WHEN 'presence'.
          IF <ls_op>-basis IS INITIAL OR strlen( <ls_op>-basis ) > 200.
            lv_status = 'refused'. lv_detail = `presence needs a basis (the SmartForm node or condition)`.
          ELSEIF ` visible hidden invisible inactive ` NS | { <ls_op>-value } | OR <ls_op>-value IS INITIAL.
            lv_status = 'refused'. lv_detail = `presence value not allowed`.
          ELSE.
            lo_t->set_attribute( name = 'presence' value = <ls_op>-value ).
          ENDIF.
        WHEN 'datepicture'.
          " The one script edit: a field's initialize script sets its display picture at run
          " time with DateFmt(<n>, $.locale), which overrides any template picture. Replace
          " exactly that call by the fixed picture; nothing else in any script is touched.
          IF lv_tag <> 'field'.
            lv_status = 'refused'. lv_detail = |target is a { lv_tag }, not a field|.
          ELSEIF NOT matches( val = <ls_op>-picture pcre = c_dpict ).
            lv_status = 'refused'. lv_detail = `picture: date{...} with D / M / Y and . / - or space only`.
          ELSE.
            CLEAR: lt_hits, lv_n.
            PERFORM fpc_initscripts USING lo_t CHANGING lt_hits.
            LOOP AT lt_hits INTO lo_c.
              lv_s = lo_c->get_value( ).
              FIND ALL OCCURRENCES OF PCRE c_datefmt IN lv_s MATCH COUNT lv_cnt2.
              lv_n = lv_n + lv_cnt2.
              IF lv_cnt2 > 0.
                lo_c2 = lo_c.
              ENDIF.
            ENDLOOP.
            IF lv_n <> 1.
              lv_status = 'refused'.
              lv_detail = |{ lv_n } "$.format.picture = DateFmt(n, $.locale)" in the initialize scripts of the target - exactly 1 needed|.
            ELSE.
              lv_s = lo_c2->get_value( ).
              FIND FIRST OCCURRENCE OF PCRE c_datefmt IN lv_s MATCH OFFSET lv_off2 MATCH LENGTH lv_len2.
              " replace only the DateFmt( ... ) call: from "DateFmt" to the end of the match
              lv_cnt2 = find( val = substring( val = lv_s off = lv_off2 len = lv_len2 ) sub = `DateFmt` ).
              lv_off2 = lv_off2 + lv_cnt2.
              lv_len2 = lv_len2 - lv_cnt2.
              lv_v = substring( val = lv_s off = lv_off2 len = lv_len2 ).
              " offset-based replace: no replacement-pattern interpretation of the picture
              lv_s = |{ substring( val = lv_s len = lv_off2 ) }"{ <ls_op>-picture }"{ substring( val = lv_s off = lv_off2 + lv_len2 ) }|.
              lv_ref = lo_c2->set_value( lv_s ).
              lv_detail = |initialize script: { lv_v } replaced by the string literal "{ <ls_op>-picture }"|.
            ENDIF.
          ENDIF.
        WHEN 'bind'.
          " G5 (a): a subform or field binds another data path (match / ref checked in the
          " shape pass: dataRef + $record allow-list, or none). Replaces the node's own <bind>,
          " or adds one as the first child after <occur>; nothing else changes.
          IF lv_tag <> 'subform' AND lv_tag <> 'field'.
            lv_status = 'refused'. lv_detail = |target is a { lv_tag }, not a subform or field|.
          ELSE.
            CLEAR lt_hits.
            PERFORM fpc_kids USING lo_t 'bind' CHANGING lt_hits.
            READ TABLE lt_hits INTO lo_c INDEX 1.
            IF sy-subrc <> 0.
              lo_c = lo_doc->create_element( name = 'bind' ).
              CLEAR lt_edges.
              PERFORM fpc_kids USING lo_t 'occur' CHANGING lt_edges.
              READ TABLE lt_edges INTO lo_x INDEX 1.
              IF sy-subrc = 0.
                lo_n = lo_x->get_next( ).
              ELSE.
                lo_n = lo_t->get_first_child( ).
              ENDIF.
              IF lo_n IS BOUND.
                lv_ref = lo_t->insert_child( new_child = lo_c ref_child = lo_n ).
              ELSE.
                lv_ref = lo_t->append_child( new_child = lo_c ).
              ENDIF.
            ENDIF.
            IF <ls_op>-match = 'none'.
              lo_c->set_attribute( name = 'match' value = 'none' ).
              lo_c->remove_attribute( name = 'ref' ).
              lv_detail = `bind match="none"`.
            ELSE.
              lo_c->set_attribute( name = 'match' value = 'dataRef' ).
              lo_c->set_attribute( name = 'ref' value = <ls_op>-ref ).
              lv_detail = |bind match="dataRef" ref="{ <ls_op>-ref }"|.
              " read-back: binds below the target that do not start with the new ref up to its
              " last [*] (a warning - they may still mean the old data path)
              lv_n = find( val = <ls_op>-ref sub = `[*]` occ = -1 ).
              IF lv_n >= 0.
                lv_pfx = substring( val = <ls_op>-ref len = lv_n + 3 ).
                CLEAR lt_hits.
                PERFORM fpc_desc USING lo_t 'bind' CHANGING lt_hits.
                LOOP AT lt_hits INTO lo_x.
                  CHECK lo_x <> lo_c.
                  lv_s = lo_x->get_attribute( name = 'ref' ).
                  IF lv_s IS NOT INITIAL AND lv_s CP '$record*' AND find( val = lv_s sub = lv_pfx ) <> 0.
                    APPEND |op { lv_i }: below the target a bind still reads "{ lv_s }" (not under "{ lv_pfx }")| TO lt_warn.
                  ENDIF.
                ENDLOOP.
              ENDIF.
            ENDIF.
          ENDIF.
      ENDCASE.
    ENDIF.
    CASE lv_status.
      WHEN 'applied'.   lv_app = lv_app + 1.
      WHEN 'not_found'. lv_nf = lv_nf + 1.
      WHEN 'ambiguous'. lv_amb = lv_amb + 1.
    ENDCASE.
    lv_s = escape( val = <ls_op>-rule format = cl_abap_format=>e_json_string ).
    lv_detail = escape( val = lv_detail format = cl_abap_format=>e_json_string ).
    APPEND |\{"i":{ lv_i },"op":"{ <ls_op>-op }","rule":"{ lv_s }","status":"{ lv_status }","detail":"{ lv_detail }"\}| TO lt_lines.
  ENDLOOP.

  lv_n = lv_cnt - lv_app - lv_nf - lv_amb.     " refused
  CONCATENATE LINES OF lt_lines INTO lv_s SEPARATED BY `,`.
  CLEAR lv_detail.
  LOOP AT lt_warn INTO lv_v.
    lv_v = escape( val = lv_v format = cl_abap_format=>e_json_string ).
    lv_detail = COND #( WHEN lv_detail IS INITIAL THEN |"{ lv_v }"| ELSE |{ lv_detail },"{ lv_v }"| ).
  ENDLOOP.
  lv_ok = xsdbool( lv_app = lv_cnt ).
  cv_report = |\{"strict":{ COND string( WHEN ls_c-strict = abap_true THEN `true` ELSE `false` ) },| &&
              |"ops":{ lv_cnt },"applied":{ lv_app },"notFound":{ lv_nf },"ambiguous":{ lv_amb },"refused":{ lv_n },| &&
              |"partial":{ COND string( WHEN lv_ok = abap_true THEN `false` ELSE `true` ) },| &&
              |"warnings":[{ lv_detail }],"results":[{ lv_s }]\}|.
  IF ls_c-strict = abap_true AND lv_ok = abap_false.
    cv_err = |correction (strict): { lv_cnt - lv_app } of { lv_cnt } ops not applied ({ lv_nf } not found, { lv_amb } ambiguous, { lv_n } refused)|.
    RETURN.
  ENDIF.

  lo_ostream = lo_sf->create_ostream_xstring( string = cv_xdp ).
  lo_enc = lo_ixml->create_encoding( character_set = 'utf-8' byte_order = if_ixml_encoding=>co_none ).
  lo_ostream->set_encoding( encoding = lo_enc ).
  lo_doc->render( ostream = lo_ostream ).
  IF xstrlen( cv_xdp ) = 0.
    cv_err = |correction: the corrected layout could not be written|.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_MODEL - G5 (a) correction ops on the interface / context
*&---------------------------------------------------------------------*
* Same IV_CORR as FPC_APPLY; only these ops (each needs a "basis"):
*  contextdeactivate {node} - node = path of node names from the context
*   root ("CONTEXT/MAIN/X", segments [A-Z0-9_], at most 30 each). It must
*   hit exactly one node, a program-lines node; it gets state inactive
*   (IF_FP_NODE SET_STATE 'I', as Form Builder's "deactivate"; stays in
*   the form). Already inactive = applied. Read-back: still-active program
*   lines that take an output of a deactivated node as input are named in
*   the detail (a warning, not a failure).
*  initsumbykey {source, target, key[1-5], sum[1-5]} - names
*   [A-Z][A-Z0-9_]{0,29}; source = an import / table parameter or global,
*   target = a global, both tables of a DDIC structure (TYPE / TYPE TABLE
*   OF); the target a standard table with the standard key and a flat
*   line (COLLECT groups by the primary key); every key / sum a component
*   of both lines with the same type, length and decimals; key types not
*   numeric (COLLECT adds every numeric component), sum types I / INT8 / P /
*   F / DECFLOAT16 / 34. A fixed template (checked names only, no free text) is
*   appended to the interface initialization (IF_FP_CODING): CLEAR target,
*   LOOP AT source, COLLECT the key and sum fields INTO target; the
*   initialization's input / output parameters get source / target if
*   missing. Marker line for the target present -> applied, no second
*   copy. Then the interface check (IF_FP_OBJECT CHECK): more E / A / X
*   messages than before -> coding and parameters restored, refused.
* IV_PHASE: X = parse and shape checks only (before anything is saved),
* I = initsumbykey on IO_INTF (before the interface is saved), C =
* contextdeactivate under IO_CTX (before the form is saved). CT_PRE gets
* "<i>|<status>|<detail>" per op run (i = 0-based op index, as in the
* FPC_APPLY report). Strict and an op of the phase not applied -> CV_ERR.
FORM fpc_model USING iv_corr  TYPE string
                     iv_phase TYPE char1
                     io_intf  TYPE REF TO if_fp_interface
                     io_ctx   TYPE REF TO if_fp_node
               CHANGING ct_pre TYPE string_table
                        cv_err TYPE string.
  TYPES: BEGIN OF ty_mop,
           op     TYPE string,
           basis  TYPE string,
           node   TYPE string,
           source TYPE string,
           target TYPE string,
           key    TYPE string_table,
           sum    TYPE string_table,
         END OF ty_mop,
         BEGIN OF ty_mcorr,
           strict TYPE abap_bool,
           ops    TYPE STANDARD TABLE OF ty_mop WITH EMPTY KEY,
         END OF ty_mcorr,
         BEGIN OF ty_res,
           i      TYPE i,
           op     TYPE string,
           status TYPE string,
           detail TYPE string,
           node   TYPE REF TO if_fp_node,
         END OF ty_res.
  DATA: ls_c      TYPE ty_mcorr,
        lt_res    TYPE STANDARD TABLE OF ty_res WITH EMPTY KEY,
        ls_res    TYPE ty_res,
        lt_seg    TYPE string_table,
        lt_all    TYPE string_table,
        lt_stack  TYPE STANDARD TABLE OF REF TO if_fp_node WITH EMPTY KEY,
        lo_node   TYPE REF TO if_fp_node,
        lo_kid    TYPE REF TO if_fp_node,
        lo_hit    TYPE REF TO if_fp_node,
        lo_pl     TYPE REF TO if_fp_programlines,
        lo_idata  TYPE REF TO if_fp_interface_data,
        lo_code   TYPE REF TO if_fp_coding,
        lt_coding TYPE tfpcoding,
        lt_cold   TYPE tfpcoding,
        lt_in     TYPE tfpparameter,
        lt_inold  TYPE tfpparameter,
        lt_out    TYPE tfpparameter,
        lt_outold TYPE tfpparameter,
        lt_check  TYPE tfpchecklist,
        ls_check  TYPE sfpchecklist,
        lt_outs   TYPE tfpfield,
        lt_ins    TYPE tfpfield,
        lv_fld    TYPE fpfield,
        lo_sline  TYPE REF TO cl_abap_structdescr,
        lo_tline  TYPE REF TO cl_abap_structdescr,
        lt_scomp  TYPE abap_component_view_tab,
        lt_tcomp  TYPE abap_component_view_tab,
        ls_comp   TYPE LINE OF abap_component_view_tab,
        lv_kind   TYPE abap_typekind,
        lv_kind2  TYPE abap_typekind,
        lv_len    TYPE i,
        lv_len2   TYPE i,
        lv_dec    TYPE i,
        lv_dec2   TYPE i,
        lv_s      TYPE string,
        lv_n      TYPE string,
        lv_v      TYPE string,
        lv_w      TYPE string,
        lv_e0     TYPE i,
        lv_e1     TYPE i,
        lv_i      TYPE i,
        lv_cnt    TYPE i,
        lv_marker TYPE string.
  FIELD-SYMBOLS: <ls_op>  TYPE ty_mop,
                 <lv_nm>  TYPE string,
                 <ls_res> TYPE ty_res.
  CONSTANTS: c_name   TYPE string VALUE `[A-Z][A-Z0-9_]{0,29}`,
             " typekinds a COLLECT adds: int1 / int2 / int / int8 / packed / float / decfloat16 / 34
             c_numall TYPE string VALUE `bsI8PFae`,
             c_sumok  TYPE string VALUE `I8PFae`.

  CLEAR cv_err.
  TRY.
      /ui2/cl_json=>deserialize( EXPORTING json        = iv_corr
                                           pretty_name = /ui2/cl_json=>pretty_mode-low_case
                                 CHANGING  data        = ls_c ).
    CATCH cx_root.
      cv_err = |correction refused - not the expected JSON|.
      RETURN.
  ENDTRY.

  LOOP AT ls_c-ops ASSIGNING <ls_op>.
    lv_i = sy-tabix - 1.
    <ls_op>-op = to_lower( condense( <ls_op>-op ) ).
    CHECK <ls_op>-op = 'contextdeactivate' OR <ls_op>-op = 'initsumbykey'.
    " ---- shape (every phase: the names are checked again before use)
    CLEAR lv_s.
    IF <ls_op>-basis IS INITIAL OR strlen( <ls_op>-basis ) > 200.
      lv_s = `needs a basis (the SmartForm node or rule)`.
    ELSEIF <ls_op>-op = 'contextdeactivate'.
      <ls_op>-node = to_upper( condense( <ls_op>-node ) ).
      IF strlen( <ls_op>-node ) > 400 OR NOT matches( val = <ls_op>-node pcre = `[A-Z0-9_]{1,30}(/[A-Z0-9_]{1,30}){1,20}` ).
        lv_s = `node: a path of node names (A-Z 0-9 _, at most 30 each) from the context root`.
      ENDIF.
    ELSE.
      <ls_op>-source = to_upper( condense( <ls_op>-source ) ).
      <ls_op>-target = to_upper( condense( <ls_op>-target ) ).
      CLEAR lt_all.
      APPEND <ls_op>-source TO lt_all.
      APPEND <ls_op>-target TO lt_all.
      LOOP AT <ls_op>-key ASSIGNING <lv_nm>.
        <lv_nm> = to_upper( condense( <lv_nm> ) ).
        APPEND <lv_nm> TO lt_all.
      ENDLOOP.
      LOOP AT <ls_op>-sum ASSIGNING <lv_nm>.
        <lv_nm> = to_upper( condense( <lv_nm> ) ).
        APPEND <lv_nm> TO lt_all.
      ENDLOOP.
      IF lines( <ls_op>-key ) < 1 OR lines( <ls_op>-key ) > 5 OR lines( <ls_op>-sum ) < 1 OR lines( <ls_op>-sum ) > 5.
        lv_s = `1 to 5 key and 1 to 5 sum names`.
      ELSE.
        LOOP AT lt_all INTO lv_n.
          IF NOT matches( val = lv_n pcre = c_name ).
            lv_s = |name "{ substring( val = lv_n len = nmin( val1 = 30 val2 = strlen( lv_n ) ) ) }" not allowed ([A-Z][A-Z0-9_], at most 30)|.
            EXIT.
          ENDIF.
        ENDLOOP.
        IF lv_s IS INITIAL.
          lv_cnt = lines( lt_all ).
          SORT lt_all.
          DELETE ADJACENT DUPLICATES FROM lt_all.
          IF lines( lt_all ) <> lv_cnt.
            lv_s = `source, target, key and sum names must all differ`.
          ENDIF.
        ENDIF.
      ENDIF.
    ENDIF.
    IF lv_s IS NOT INITIAL.
      IF iv_phase = 'X'.
        cv_err = |correction refused - op { lv_i } { <ls_op>-op }: { lv_s }|.
        RETURN.
      ENDIF.
      CLEAR ls_res. ls_res-i = lv_i. ls_res-op = <ls_op>-op. ls_res-status = 'refused'. ls_res-detail = lv_s.
      APPEND ls_res TO lt_res.
      CONTINUE.
    ENDIF.
    CHECK iv_phase <> 'X'.
    CLEAR ls_res. ls_res-i = lv_i. ls_res-op = <ls_op>-op. ls_res-status = 'applied'.

    IF iv_phase = 'I' AND <ls_op>-op = 'initsumbykey'.
      " ---- initSumByKey on the interface initialization
      CLEAR: lo_sline, lo_tline.
      lo_idata = io_intf->get_interface_data( ).
      PERFORM fpc_linetype USING lo_idata <ls_op>-source abap_true CHANGING lo_sline ls_res-detail.
      IF lo_sline IS BOUND.
        PERFORM fpc_linetype USING lo_idata <ls_op>-target abap_false CHANGING lo_tline ls_res-detail.
      ENDIF.
      IF lo_sline IS NOT BOUND OR lo_tline IS NOT BOUND.
        ls_res-status = 'refused'.
      ELSE.
        lt_scomp = lo_sline->get_included_view( ).
        lt_tcomp = lo_tline->get_included_view( ).
        LOOP AT lt_all INTO lv_n WHERE table_line <> <ls_op>-source AND table_line <> <ls_op>-target.
          CLEAR: lv_kind, lv_kind2, lv_len, lv_len2, lv_dec, lv_dec2.
          READ TABLE lt_scomp INTO ls_comp WITH KEY name = lv_n.
          IF sy-subrc = 0.
            lv_kind = ls_comp-type->type_kind. lv_len = ls_comp-type->length. lv_dec = ls_comp-type->decimals.
          ENDIF.
          READ TABLE lt_tcomp INTO ls_comp WITH KEY name = lv_n.
          IF sy-subrc = 0.
            lv_kind2 = ls_comp-type->type_kind. lv_len2 = ls_comp-type->length. lv_dec2 = ls_comp-type->decimals.
          ENDIF.
          IF lv_kind IS INITIAL OR lv_kind2 IS INITIAL.
            ls_res-status = 'refused'. ls_res-detail = |{ lv_n } is not a component of both { <ls_op>-source } and { <ls_op>-target }|.
            EXIT.
          ENDIF.
          " the assignment source -> target must not convert or cut
          IF lv_kind <> lv_kind2 OR lv_len <> lv_len2 OR lv_dec <> lv_dec2.
            ls_res-status = 'refused'.
            ls_res-detail = |{ lv_n } differs between { <ls_op>-source } ({ lv_kind } { lv_len } { lv_dec }) and { <ls_op>-target } ({ lv_kind2 } { lv_len2 } { lv_dec2 })|.
            EXIT.
          ENDIF.
          READ TABLE <ls_op>-sum TRANSPORTING NO FIELDS WITH KEY table_line = lv_n.
          IF sy-subrc = 0.
            IF c_sumok NA lv_kind OR c_sumok NA lv_kind2.
              ls_res-status = 'refused'. ls_res-detail = |sum field { lv_n } is not numeric (I, INT8, P, F, DECFLOAT; type kinds { lv_kind } / { lv_kind2 })|.
              EXIT.
            ENDIF.
          ELSEIF c_numall CA lv_kind OR c_numall CA lv_kind2.
            ls_res-status = 'refused'. ls_res-detail = |key field { lv_n } is numeric - COLLECT would add it, not group by it|.
            EXIT.
          ENDIF.
        ENDLOOP.
      ENDIF.
      IF ls_res-status = 'applied'.
        lo_code = lo_idata->get_coding( ).
        lt_cold = lo_code->get_init_coding( ).
        lv_marker = |* sc4sap G5 initSumByKey (generated) { <ls_op>-target }|.
        READ TABLE lt_cold TRANSPORTING NO FIELDS WITH KEY table_line = lv_marker.
        IF sy-subrc = 0.
          ls_res-detail = |the initialization sums into { <ls_op>-target } already (marker line) - no second copy|.
        ELSE.
          " errors of the interface check before the change (only new ones refuse)
          CLEAR: lt_check, lv_e0, lv_e1.
          TRY.
              io_intf->check( CHANGING c_checklist = lt_check ).
            CATCH cx_root.                                      "#EC NO_HANDLER
          ENDTRY.
          LOOP AT lt_check INTO ls_check WHERE msgty CA 'EAX'.
            lv_e0 = lv_e0 + 1.
          ENDLOOP.
          lt_inold = lo_code->get_init_input_params( ).
          lt_outold = lo_code->get_init_output_params( ).
          lt_in = lt_inold.
          lt_out = lt_outold.
          READ TABLE lt_in TRANSPORTING NO FIELDS WITH KEY table_line = <ls_op>-source.
          IF sy-subrc <> 0. APPEND <ls_op>-source TO lt_in. ENDIF.
          READ TABLE lt_out TRANSPORTING NO FIELDS WITH KEY table_line = <ls_op>-target.
          IF sy-subrc <> 0. APPEND <ls_op>-target TO lt_out. ENDIF.
          " the fixed template: checked names only
          lv_v = |ls_sc4sap_g5_{ lv_i }|.
          lt_coding = lt_cold.
          APPEND lv_marker TO lt_coding.
          APPEND |DATA { lv_v } LIKE LINE OF { to_lower( <ls_op>-target ) }.| TO lt_coding.
          APPEND |FIELD-SYMBOLS <{ lv_v }> LIKE LINE OF { to_lower( <ls_op>-source ) }.| TO lt_coding.
          APPEND |CLEAR { to_lower( <ls_op>-target ) }.| TO lt_coding.
          APPEND |LOOP AT { to_lower( <ls_op>-source ) } ASSIGNING <{ lv_v }>.| TO lt_coding.
          APPEND |  CLEAR { lv_v }.| TO lt_coding.
          LOOP AT lt_all INTO lv_n WHERE table_line <> <ls_op>-source AND table_line <> <ls_op>-target.
            APPEND |  { lv_v }-{ to_lower( lv_n ) } = <{ lv_v }>-{ to_lower( lv_n ) }.| TO lt_coding.
          ENDLOOP.
          APPEND |  COLLECT { lv_v } INTO { to_lower( <ls_op>-target ) }.| TO lt_coding.
          APPEND |ENDLOOP.| TO lt_coding.
          lo_code->set_init_input_params( lt_in ).
          lo_code->set_init_output_params( lt_out ).
          lo_code->set_init_coding( lt_coding ).
          CLEAR lt_check.
          TRY.
              io_intf->check( CHANGING c_checklist = lt_check ).
            CATCH cx_root INTO DATA(lx_chk).
              CLEAR ls_check.
              ls_check-msgty = 'E'.
              ls_check-message = lx_chk->get_text( ).
              APPEND ls_check TO lt_check.
          ENDTRY.
          CLEAR lv_w.
          LOOP AT lt_check INTO ls_check WHERE msgty CA 'EAX'.
            lv_e1 = lv_e1 + 1.
            IF lv_w IS INITIAL.
              lv_w = ls_check-message.
              IF lv_w IS INITIAL AND ls_check-msgid IS NOT INITIAL.
                MESSAGE ID ls_check-msgid TYPE 'S' NUMBER ls_check-msgno
                  WITH ls_check-msgv1 ls_check-msgv2 ls_check-msgv3 ls_check-msgv4 INTO lv_w.
              ENDIF.
            ENDIF.
          ENDLOOP.
          IF lv_e1 > lv_e0.
            lo_code->set_init_coding( lt_cold ).
            lo_code->set_init_input_params( lt_inold ).
            lo_code->set_init_output_params( lt_outold ).
            ls_res-status = 'refused'.
            ls_res-detail = |interface check after the change: { lv_e1 - lv_e0 } new error(s), change undone - { lv_w }|.
          ELSE.
            lv_cnt = lines( lt_tcomp ) - lines( <ls_op>-key ) - lines( <ls_op>-sum ).
            ls_res-detail = |initialization: { <ls_op>-target } = { <ls_op>-source } summed ({ concat_lines_of( table = <ls_op>-sum sep = `, ` ) }) | &&
                            |by { concat_lines_of( table = <ls_op>-key sep = `, ` ) } ({ lines( lt_coding ) - lines( lt_cold ) } lines); | &&
                            |{ lv_cnt } other components of { <ls_op>-target } stay initial (numeric ones add 0); interface check { lv_e1 } error(s) as before; | &&
                            |the interface is new (this run) - no other form uses it|.
          ENDIF.
        ENDIF.
      ENDIF.
      APPEND ls_res TO lt_res.

    ELSEIF iv_phase = 'C' AND <ls_op>-op = 'contextdeactivate'.
      " ---- contextDeactivate: walk the path from the context root
      SPLIT <ls_op>-node AT '/' INTO TABLE lt_seg.
      lo_node = io_ctx.
      READ TABLE lt_seg INTO lv_n INDEX 1.
      IF lo_node IS NOT BOUND OR lo_node->get_name( ) <> lv_n.
        ls_res-status = 'not_found'. ls_res-detail = |the context root is not "{ lv_n }"|.
        CLEAR lo_node.
      ENDIF.
      LOOP AT lt_seg INTO lv_n FROM 2.
        CHECK lo_node IS BOUND.
        CLEAR: lo_hit, lv_cnt.
        lo_kid = lo_node->get_child( ).
        WHILE lo_kid IS BOUND.
          IF lo_kid->get_name( ) = lv_n.
            lv_cnt = lv_cnt + 1.
            lo_hit = lo_kid.
          ENDIF.
          lo_kid = lo_kid->get_successor( ).
        ENDWHILE.
        IF lv_cnt <> 1.
          ls_res-status = COND #( WHEN lv_cnt = 0 THEN `not_found` ELSE `ambiguous` ).
          ls_res-detail = |{ lv_cnt } nodes "{ lv_n }" under "{ lo_node->get_name( ) }"|.
          CLEAR lo_node.
        ELSE.
          lo_node = lo_hit.
        ENDIF.
      ENDLOOP.
      IF lo_node IS BOUND.
        IF lo_node->get_type( ) <> if_fp_node=>c_type_programlines.
          ls_res-status = 'refused'. ls_res-detail = |node type { lo_node->get_type( ) } is not program lines|.
        ELSE.
          IF lo_node->get_state( ) = if_fp_node=>c_state_inactive.
            ls_res-detail = `inactive already`.
          ELSE.
            TRY.
                lo_node->set_state( i_state = if_fp_node=>c_state_inactive ).
              CATCH cx_root INTO DATA(lx_st).
                ls_res-detail = lx_st->get_text( ).
            ENDTRY.
            IF lo_node->get_state( ) <> if_fp_node=>c_state_inactive.
              ls_res-status = 'refused'. ls_res-detail = |state not set: { ls_res-detail }|.
            ELSE.
              ls_res-detail = `deactivated`.
            ENDIF.
          ENDIF.
          ls_res-node = lo_node.
        ENDIF.
      ENDIF.
      APPEND ls_res TO lt_res.
    ENDIF.
  ENDLOOP.
  CHECK iv_phase <> 'X'.

  " ---- contextDeactivate read-back: active program lines that read an output of a
  " deactivated node (a warning in the detail - another node may still need the data)
  IF iv_phase = 'C' AND io_ctx IS BOUND.
    LOOP AT lt_res ASSIGNING <ls_res> WHERE node IS NOT INITIAL.
      lo_pl ?= <ls_res>-node.
      lt_outs = lo_pl->get_output_parameters( ).
      CHECK lt_outs IS NOT INITIAL.
      CLEAR: lt_stack, lv_w.
      APPEND io_ctx TO lt_stack.
      WHILE lt_stack IS NOT INITIAL.
        READ TABLE lt_stack INTO lo_node INDEX lines( lt_stack ).
        DELETE lt_stack INDEX lines( lt_stack ).
        lo_kid = lo_node->get_child( ).
        WHILE lo_kid IS BOUND.
          APPEND lo_kid TO lt_stack.
          lo_kid = lo_kid->get_successor( ).
        ENDWHILE.
        CHECK lo_node->get_type( ) = if_fp_node=>c_type_programlines
          AND lo_node->get_state( ) <> if_fp_node=>c_state_inactive.
        lo_pl ?= lo_node.
        lt_ins = lo_pl->get_input_parameters( ).
        LOOP AT lt_ins INTO lv_fld.
          READ TABLE lt_outs TRANSPORTING NO FIELDS WITH KEY table_line = lv_fld.
          IF sy-subrc = 0.
            lv_w = |{ lv_w }{ COND string( WHEN lv_w IS NOT INITIAL THEN `; ` ) }{ lo_node->get_name( ) } still reads { condense( lv_fld ) }|.
          ENDIF.
        ENDLOOP.
      ENDWHILE.
      IF lv_w IS NOT INITIAL.
        <ls_res>-detail = |{ <ls_res>-detail } - warning: { lv_w }|.
      ENDIF.
    ENDLOOP.
  ENDIF.

  LOOP AT lt_res INTO ls_res.
    APPEND |{ ls_res-i }\|{ ls_res-status }\|{ ls_res-detail }| TO ct_pre.
    IF ls_c-strict = abap_true AND ls_res-status <> 'applied' AND cv_err IS INITIAL.
      cv_err = |correction (strict): op { ls_res-i } { ls_res-op } { ls_res-status } - { ls_res-detail }|.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_LINETYPE - the structured line type of a table in the interface
*&---------------------------------------------------------------------*
* IV_PARAM = X: import and table parameters first, then globals; else
* globals only. Typing TYPE <DDIC table type> / TYPE TABLE OF <DDIC
* structure>; a TABLES parameter TYPE <DDIC structure> too. Anything else
* -> CO_LINE initial and CV_DETAIL says why.
FORM fpc_linetype USING io_idata TYPE REF TO if_fp_interface_data
                        iv_name  TYPE string
                        iv_param TYPE abap_bool
                  CHANGING co_line   TYPE REF TO cl_abap_structdescr
                           cv_detail TYPE string.
  DATA: lt_io     TYPE tfpiopar,
        ls_io     TYPE sfpiopar,
        lt_g      TYPE tfpgdata,
        ls_g      TYPE sfpgdata,
        lv_typing TYPE string,
        lv_tname  TYPE string,
        lv_tab    TYPE abap_bool,
        lv_found  TYPE abap_bool,
        lo_td     TYPE REF TO cl_abap_typedescr,
        lo_ld     TYPE REF TO cl_abap_datadescr,
        lo_tabd   TYPE REF TO cl_abap_tabledescr.
  CLEAR co_line.
  IF iv_param = abap_true.
    lt_io = io_idata->get_parameters( )->get_import_parameters( ).
    READ TABLE lt_io INTO ls_io WITH KEY name = iv_name.
    IF sy-subrc = 0.
      lv_found = abap_true.
    ELSE.
      lt_io = io_idata->get_parameters( )->get_table_parameters( ).
      READ TABLE lt_io INTO ls_io WITH KEY name = iv_name.
      IF sy-subrc = 0.
        lv_found = abap_true.
        lv_tab = abap_true.
      ENDIF.
    ENDIF.
    IF lv_found = abap_true.
      lv_typing = ls_io-typing.
      lv_tname = ls_io-typename.
    ENDIF.
  ENDIF.
  IF lv_found = abap_false.
    lt_g = io_idata->get_global_definitions( )->get_global_data( ).
    READ TABLE lt_g INTO ls_g WITH KEY name = iv_name.
    IF sy-subrc = 0.
      lv_found = abap_true.
      lv_typing = ls_g-typing.
      lv_tname = ls_g-typename.
    ENDIF.
  ENDIF.
  IF lv_found = abap_false.
    cv_detail = |{ iv_name } is not a { COND string( WHEN iv_param = abap_true THEN `parameter or ` ) }global of the interface|.
    RETURN.
  ENDIF.
  lv_typing = to_upper( condense( lv_typing ) ).
  lv_tname = to_upper( condense( lv_tname ) ).
  IF lv_typing <> 'TYPE' AND lv_typing <> 'TYPE TABLE OF'.
    cv_detail = |{ iv_name }: typing "{ lv_typing }" not supported (TYPE or TYPE TABLE OF a DDIC type)|.
    RETURN.
  ENDIF.
  cl_abap_typedescr=>describe_by_name( EXPORTING  p_name         = lv_tname
                                       RECEIVING  p_descr_ref    = lo_td
                                       EXCEPTIONS type_not_found = 1
                                                  OTHERS         = 2 ).
  IF sy-subrc <> 0 OR lo_td IS NOT BOUND.
    cv_detail = |{ iv_name }: type { lv_tname } not found|.
    RETURN.
  ENDIF.
  IF lo_td->kind = cl_abap_typedescr=>kind_struct
     AND ( lv_typing = 'TYPE TABLE OF' OR lv_tab = abap_true ).
    co_line ?= lo_td.
  ELSEIF lo_td->kind = cl_abap_typedescr=>kind_table AND lv_typing = 'TYPE'.
    lo_tabd ?= lo_td.
    " a COLLECT target groups by its primary key: only a standard table with the standard
    " (default) key groups by the op's key fields (the other components are initial)
    IF iv_param = abap_false AND ( lo_tabd->table_kind <> cl_abap_tabledescr=>tablekind_std
                                OR lo_tabd->key_defkind <> cl_abap_tabledescr=>keydefkind_default ).
      cv_detail = |{ iv_name }: table type { lv_tname } is not a standard table with the standard key - COLLECT would group by another key|.
      RETURN.
    ENDIF.
    lo_ld = lo_tabd->get_table_line_type( ).
    IF lo_ld->kind = cl_abap_typedescr=>kind_struct.
      co_line ?= lo_ld.
    ENDIF.
  ENDIF.
  " a COLLECT target line must be flat (no string, table or reference components)
  IF co_line IS BOUND AND iv_param = abap_false AND co_line->type_kind <> cl_abap_typedescr=>typekind_struct1.
    CLEAR co_line.
    cv_detail = |{ iv_name }: the line type { lv_tname } is deep (string, table or reference components) - COLLECT needs a flat line|.
    RETURN.
  ENDIF.
  IF co_line IS NOT BOUND.
    cv_detail = |{ iv_name } is not a table of a structure ({ lv_typing } { lv_tname })|.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_PATH - resolve a dotted name path (see FPC_APPLY)
*&---------------------------------------------------------------------*
FORM fpc_path USING io_start   TYPE REF TO if_ixml_element
                    iv_path    TYPE string
                    iv_isroot  TYPE abap_bool
              CHANGING co_el     TYPE REF TO if_ixml_element
                       cv_status TYPE string.
  DATA: lt_seg  TYPE STANDARD TABLE OF string WITH EMPTY KEY,
        lt_hits TYPE STANDARD TABLE OF REF TO if_ixml_element WITH EMPTY KEY,
        lo_cur  TYPE REF TO if_ixml_element,
        lv_seg  TYPE string,
        lv_name TYPE string,
        lv_idx  TYPE string,
        lv_last TYPE abap_bool,
        lv_pos  TYPE i,
        lv_n    TYPE i.

  lo_cur = io_start.     " before CLEAR co_el - the caller may pass one variable for both
  CLEAR co_el.
  SPLIT iv_path AT '.' INTO TABLE lt_seg.
  lv_n = lines( lt_seg ).
  LOOP AT lt_seg INTO lv_seg.
    lv_pos = sy-tabix.
    CLEAR: lv_name, lv_idx.
    FIND FIRST OCCURRENCE OF PCRE `^([A-Za-z_][A-Za-z0-9_\-]{0,59})(?:\[([0-9]{1,3})\])?$` IN lv_seg SUBMATCHES lv_name lv_idx.
    IF sy-subrc <> 0.
      cv_status = 'refused'.
      RETURN.
    ENDIF.
    IF lv_pos = 1 AND iv_isroot = abap_true.
      " the first segment names the root subform itself
      IF lv_name <> lo_cur->get_attribute( name = 'name' ) OR ( lv_idx IS NOT INITIAL AND lv_idx <> '0' ).
        cv_status = 'not_found'.
        RETURN.
      ENDIF.
      CONTINUE.
    ENDIF.
    lv_last = xsdbool( lv_pos = lv_n ).
    CLEAR lt_hits.
    PERFORM fpc_named USING lo_cur lv_name lv_last CHANGING lt_hits.
    PERFORM fpc_pick USING lt_hits lv_idx CHANGING lo_cur cv_status.
    IF lo_cur IS NOT BOUND.
      RETURN.
    ENDIF.
  ENDLOOP.
  co_el = lo_cur.
  cv_status = 'applied'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_PICK - one hit: by index, or the only one
*&---------------------------------------------------------------------*
FORM fpc_pick USING it_hits   TYPE STANDARD TABLE
                    iv_idx    TYPE string
              CHANGING co_el     TYPE REF TO if_ixml_element
                       cv_status TYPE string.
  DATA lv_n TYPE i.
  CLEAR co_el.
  IF iv_idx IS NOT INITIAL.
    lv_n = iv_idx + 1.
    READ TABLE it_hits INTO co_el INDEX lv_n.
    cv_status = COND #( WHEN sy-subrc = 0 THEN `applied` ELSE `not_found` ).
  ELSEIF lines( it_hits ) = 1.
    READ TABLE it_hits INTO co_el INDEX 1.
    cv_status = 'applied'.
  ELSEIF lines( it_hits ) = 0.
    cv_status = 'not_found'.
  ELSE.
    cv_status = 'ambiguous'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_NAMED - children named IV_NAME, through unnamed subforms
*&---------------------------------------------------------------------*
* Inner segments match containers only; the last one also field / draw.
FORM fpc_named USING io_el   TYPE REF TO if_ixml_element
                     iv_name TYPE string
                     iv_last TYPE abap_bool
               CHANGING ct_hits TYPE STANDARD TABLE.
  DATA: lo_n   TYPE REF TO if_ixml_node,
        lo_e   TYPE REF TO if_ixml_element,
        lv_tag TYPE string,
        lv_nm  TYPE string.
  lo_n = io_el->get_first_child( ).
  WHILE lo_n IS BOUND.
    IF lo_n->get_type( ) = if_ixml_node=>co_node_element.
      lo_e ?= lo_n.
      lv_tag = lo_e->get_name( ).
      IF ` subform subformSet area exclGroup pageSet pageArea ` CS | { lv_tag } |
         OR ( iv_last = abap_true AND ` field draw contentArea ` CS | { lv_tag } | ).
        lv_nm = lo_e->get_attribute( name = 'name' ).
        IF lv_nm = iv_name.
          APPEND lo_e TO ct_hits.
        ELSEIF lv_nm IS INITIAL AND ` subform subformSet area ` CS | { lv_tag } |.
          PERFORM fpc_named USING lo_e iv_name iv_last CHANGING ct_hits.
        ENDIF.
      ENDIF.
    ENDIF.
    lo_n = lo_n->get_next( ).
  ENDWHILE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_PROTO - children of <proto> elements with id = IV_ID
*&---------------------------------------------------------------------*
FORM fpc_proto USING io_el TYPE REF TO if_ixml_element
                     iv_id TYPE string
               CHANGING ct_hits TYPE STANDARD TABLE.
  DATA: lo_n TYPE REF TO if_ixml_node,
        lo_e TYPE REF TO if_ixml_element.
  lo_n = io_el->get_first_child( ).
  WHILE lo_n IS BOUND.
    IF lo_n->get_type( ) = if_ixml_node=>co_node_element.
      lo_e ?= lo_n.
      IF io_el->get_name( ) = 'proto' AND lo_e->get_attribute( name = 'id' ) = iv_id.
        APPEND lo_e TO ct_hits.
      ENDIF.
      PERFORM fpc_proto USING lo_e iv_id CHANGING ct_hits.
    ENDIF.
    lo_n = lo_n->get_next( ).
  ENDWHILE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_XLIFF - elements with xliff:id = IV_ID
*&---------------------------------------------------------------------*
FORM fpc_xliff USING io_el TYPE REF TO if_ixml_element
                     iv_id TYPE string
               CHANGING ct_hits TYPE STANDARD TABLE.
  DATA: lo_n   TYPE REF TO if_ixml_node,
        lo_e   TYPE REF TO if_ixml_element,
        lo_map TYPE REF TO if_ixml_named_node_map,
        lo_a   TYPE REF TO if_ixml_node,
        lv_i   TYPE i.
  lo_n = io_el->get_first_child( ).
  WHILE lo_n IS BOUND.
    IF lo_n->get_type( ) = if_ixml_node=>co_node_element.
      lo_e ?= lo_n.
      lo_map = lo_e->get_attributes( ).
      lv_i = 0.
      WHILE lv_i < lo_map->get_length( ).
        lo_a = lo_map->get_item( lv_i ).
        IF lo_a->get_name( ) = 'id' AND lo_a->get_namespace_prefix( ) = 'xliff' AND lo_a->get_value( ) = iv_id.
          APPEND lo_e TO ct_hits.
        ENDIF.
        lv_i = lv_i + 1.
      ENDWHILE.
      PERFORM fpc_xliff USING lo_e iv_id CHANGING ct_hits.
    ENDIF.
    lo_n = lo_n->get_next( ).
  ENDWHILE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_DESC - descendants by tag, document order ('p' = p and div)
*&---------------------------------------------------------------------*
FORM fpc_desc USING io_el  TYPE REF TO if_ixml_element
                    iv_tag TYPE string
              CHANGING ct_hits TYPE STANDARD TABLE.
  DATA: lo_n   TYPE REF TO if_ixml_node,
        lo_e   TYPE REF TO if_ixml_element,
        lv_tag TYPE string.
  lo_n = io_el->get_first_child( ).
  WHILE lo_n IS BOUND.
    IF lo_n->get_type( ) = if_ixml_node=>co_node_element.
      lo_e ?= lo_n.
      lv_tag = lo_e->get_name( ).
      IF lv_tag = iv_tag OR ( iv_tag = 'p' AND lv_tag = 'div' ).
        APPEND lo_e TO ct_hits.
      ENDIF.
      PERFORM fpc_desc USING lo_e iv_tag CHANGING ct_hits.
    ENDIF.
    lo_n = lo_n->get_next( ).
  ENDWHILE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_INITSCRIPTS - <script> of the field's initialize events
*&---------------------------------------------------------------------*
* Only direct <event activity="initialize"> children of the field.
FORM fpc_initscripts USING io_field TYPE REF TO if_ixml_element
                     CHANGING ct_hits TYPE STANDARD TABLE.
  DATA: lt_ev TYPE STANDARD TABLE OF REF TO if_ixml_element WITH EMPTY KEY,
        lo_ev TYPE REF TO if_ixml_element.
  PERFORM fpc_kids USING io_field 'event' CHANGING lt_ev.
  LOOP AT lt_ev INTO lo_ev.
    IF lo_ev->get_attribute( name = 'activity' ) = 'initialize'.
      PERFORM fpc_kids USING lo_ev 'script' CHANGING ct_hits.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_KIDS - direct children by tag
*&---------------------------------------------------------------------*
FORM fpc_kids USING io_el  TYPE REF TO if_ixml_element
                    iv_tag TYPE string
              CHANGING ct_hits TYPE STANDARD TABLE.
  DATA: lo_n TYPE REF TO if_ixml_node,
        lo_e TYPE REF TO if_ixml_element.
  lo_n = io_el->get_first_child( ).
  WHILE lo_n IS BOUND.
    IF lo_n->get_type( ) = if_ixml_node=>co_node_element AND lo_n->get_name( ) = iv_tag.
      lo_e ?= lo_n.
      APPEND lo_e TO ct_hits.
    ENDIF.
    lo_n = lo_n->get_next( ).
  ENDWHILE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_CHILD - the first direct child with the tag, created if none
*&---------------------------------------------------------------------*
FORM fpc_child USING io_doc TYPE REF TO if_ixml_document
                     io_el  TYPE REF TO if_ixml_element
                     iv_tag TYPE string
               CHANGING co_child TYPE REF TO if_ixml_element.
  DATA lt_hits TYPE STANDARD TABLE OF REF TO if_ixml_element WITH EMPTY KEY.
  PERFORM fpc_kids USING io_el iv_tag CHANGING lt_hits.
  READ TABLE lt_hits INTO co_child INDEX 1.
  IF sy-subrc <> 0.
    co_child = io_doc->create_simple_element( name = iv_tag parent = io_el ).
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FPC_ATTRS - set measurement attributes (empty values skipped)
*&---------------------------------------------------------------------*
* Checks every non-empty value first; sets them (IV_SET = X) only when all
* pass.
FORM fpc_attrs USING io_el   TYPE REF TO if_ixml_element
                     it_kv   TYPE STANDARD TABLE
                     iv_re   TYPE string
                     iv_set  TYPE abap_bool
               CHANGING cv_status TYPE string
                        cv_detail TYPE string.
  DATA: BEGIN OF ls_kv,
          k TYPE string,
          v TYPE string,
        END OF ls_kv,
        lv_any TYPE abap_bool.
  LOOP AT it_kv INTO ls_kv.
    IF ls_kv-v IS INITIAL.
      CONTINUE.
    ENDIF.
    lv_any = abap_true.
    IF NOT matches( val = ls_kv-v pcre = iv_re ).
      cv_status = 'refused'. cv_detail = |{ ls_kv-k } "{ ls_kv-v }" is not a measurement (mm, pt, cm, in)|.
      RETURN.
    ENDIF.
  ENDLOOP.
  IF lv_any = abap_false.
    cv_status = 'refused'. cv_detail = `no value given`.
    RETURN.
  ENDIF.
  CHECK iv_set = abap_true.
  LOOP AT it_kv INTO ls_kv.
    IF ls_kv-v IS NOT INITIAL.
      io_el->set_attribute( name = ls_kv-k value = ls_kv-v ).
    ENDIF.
  ENDLOOP.
ENDFORM.
