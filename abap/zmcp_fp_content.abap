FUNCTION zmcp_fp_content
  IMPORTING
    VALUE(iv_part)     TYPE string
    VALUE(iv_name)     TYPE fpname
    VALUE(iv_language) TYPE spras OPTIONAL
    VALUE(iv_params)   TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_FP_CONTENT - read-only: an Adobe form (SFP) for preview and checks.
*
* Function group ZMCP_FP (package $TMP on a DEV system), NOT remote-enabled -
* ZMCP_ADT_DISPATCH actions FP_CONTENT (FORM, LAYOUT, INTERFACE) and
* FP_RENDER (RENDER) call it. BASIS 7.40 or later (/UI2/CL_JSON for RENDER
* parameters).
*
* Guards: runs only in a development-type client - T000-CCCATEGORY 'C'
* (customizing), 'D' (demo) or 'E' (training); production 'P', test 'T' and
* SAP reference 'S' clients are refused, and so is a client T000 cannot
* tell. Names: letters, digits, _ and / only. RENDER: only the SAP example
* forms of package SFPT listed in LV_RENDER_ALLOWED (exact names; Z / Y /
* namespace forms are refused), plus forms ZMCP_FP_MIGRATE made from them:
* ZSC4SAP_AFM_* in package $TMP, form type migrated, description ending
* "[sc4sap]" (for these, filled document / partner / address keys must
* start with 'ZZ', and IS_BIL_INVOICE-HD_GEN-BIL_NUMBER / IS_NAST-OBJKY must
* be 'ZZ...' when the interface has them - SSF_RENDER's rule), and the one SFP-migrated comparison form ZSC4SAP_AFM_GUI01
* ($TMP, migrated, exact name, no marker); active forms only, IV_PARAMS at most 200 000
* characters.
*
* IV_PART
*   FORM       the form as one XML (CL_FP_HELPER=>CONVERT_FORM_TO_XSTRING:
*              header, context tree, texts, layout - the SFP download
*              format) plus its header fields.
*              Result {"form","interface","formType","formTech","layoutType",
*              "xml"} - xml in base64.
*   LAYOUT     the layout alone: the XDP / XFA template
*              (IF_FP_LAYOUT->GET_LAYOUT_DATA). Result {"form","xdp"} - xdp
*              in base64.
*   CHECK      SAP's own form check (CL_FP_WB_FORM=>CHECK - what SFP's
*              Check shows): the inactive version when there is one, else
*              the active one, loaded in display mode; nothing is saved,
*              activated or corrected. Result {"form","messages":[{"msgty",
*              "msgid","msgno","text","type","navcursor"}]}.
*   INTERFACE  the form interface as XML (CONVERT_INTERFACE_TO_XSTRING:
*              parameters, global definitions, types). IV_NAME = interface.
*              Result {"interface","xml"} - xml in base64.
*   RENDER     the PDF as ADS produces it, for invented interface values:
*              FP_FUNCTION_MODULE_NAME -> generated FM, FP_JOB_OPEN with
*              GETPDF = 'X' / NODIALOG = 'X' (the PDF comes back to the
*              caller; no dialog, no print), FP_JOB_CLOSE.
*              IV_PARAMS JSON array [{"name":"IS_HEADER","json":"{...}"}] -
*              internal values in /UI2/CL_JSON format; parameters not listed
*              are passed initial. The form's own program lines (context
*              coding) run as in a real print and may read the database:
*              pass invented values only.
*              Result {"form","fm","pages","pdf"} - pdf in base64.
*              With an IV_PARAMS entry {"name":"$GETXML","json":"true"} also
*              "xml": the data XML the form hands ADS (FPFORMOUTPUT-XML via
*              SFPOUTPUTPARAMS-GETXML, base64, at most 2 000 000 bytes; else
*              "xmlError"). The entry is a marker: only its presence counts,
*              its json value is ignored. Nothing more is written.
*              Forms with a SmartForm-type interface (migrated forms): the
*              generated FM opens its own job, so RENDER passes
*              CONTROL_PARAMETERS (NO_DIALOG, GETOTF = the PDF, no preview),
*              OUTPUT_OPTIONS (no device, no new / immediate spool request,
*              archiving mode print only), USER_SETTINGS = space, never
*              ARCHIVE_* / MAIL_*, and unpacks the PDF from
*              JOB_OUTPUT_INFO-OTFDATA; pages from DOCUMENT_OUTPUT_INFO;
*              no data XML on this path ("xmlError").
*
* Objects are loaded in display mode (no lock) and freed again. FORM,
* LAYOUT and INTERFACE write nothing. RENDER: (1) FP_FUNCTION_MODULE_NAME
* generates the form's function module (/1BCDWB/..., FPCONTEXTI) when it is
* missing or older than the form - exactly as a real print does; that is the
* only repository write, and SAP example forms are normally generated
* already; it is COMMITted right after FP_FUNCTION_MODULE_NAME (before any
* form code runs) so a ROLLBACK cannot orphan the generated function group
* frame. (2) The form's own context coding runs; whatever it changed
* without a COMMIT is undone by ROLLBACK WORK after FP_JOB_CLOSE - an
* explicit COMMIT inside the form's code cannot be undone, which is why
* RENDER is limited to SAP example forms. No spool request (GETPDF returns
* the PDF to the caller, REQNEW / REQIMM off, no archiving).
*
*   EV_SUBRC  0 ok, 4 not found, 8 other error (EV_MESSAGE)

  TYPES: BEGIN OF ty_in,
           name TYPE string,
           json TYPE string,
         END OF ty_in.
  DATA: lv_part    TYPE string,
        lv_nm      TYPE string,
        lv_cat     TYPE t000-cccategory,
        lo_wbf     TYPE REF TO if_fp_wb_form,
        lo_form    TYPE REF TO if_fp_form,
        lo_layout  TYPE REF TO if_fp_layout,
        lo_wbi     TYPE REF TO if_fp_wb_interface,
        lo_if      TYPE REF TO if_fp_interface,
        lv_x       TYPE xstring,
        lv_ifname  TYPE fpname,
        lv_ftype   TYPE string,
        lv_ftech   TYPE string,
        lv_ltype   TYPE string,
        lv_b64     TYPE string,
        lx_repo    TYPE REF TO cx_fp_api_repository,
        lx_root    TYPE REF TO cx_root.
  " RENDER
  DATA: lt_in      TYPE STANDARD TABLE OF ty_in,
        ls_in      TYPE ty_in,
        lv_fm      TYPE rs38l_fnam,
        lt_imp     TYPE STANDARD TABLE OF rsimp,
        ls_imp     TYPE rsimp,
        lt_tab     TYPE STANDARD TABLE OF rstbl,
        ls_tab     TYPE rstbl,
        lt_exp     TYPE STANDARD TABLE OF rsexp,
        lt_chg     TYPE STANDARD TABLE OF rscha,
        lt_exc     TYPE STANDARD TABLE OF rsexc,
        lt_ptab    TYPE abap_func_parmbind_tab,
        ls_parm    TYPE abap_func_parmbind,
        lt_etab    TYPE abap_func_excpbind_tab,
        ls_excp    TYPE abap_func_excpbind,
        lv_type    TYPE string,
        lr_data    TYPE REF TO data,
        lo_tdescr  TYPE REF TO cl_abap_typedescr,
        ls_outpar  TYPE sfpoutputparams,
        ls_docpar  TYPE sfpdocparams,
        ls_output  TYPE fpformoutput,
        lv_jobopen TYPE abap_bool,
        lv_getxml  TYPE abap_bool,
        lv_migrated TYPE abap_bool,
        lv_devclass TYPE tadir-devclass,
        lv_fdesc   TYPE string,
        lv_xb64    TYPE string,
        lv_rc      TYPE i,
        " RENDER of a form with a SmartForm-type interface (migrated forms)
        lv_sfif    TYPE abap_bool,
        ls_ctrl    TYPE ssfctrlop,
        ls_outopt  TYPE ssfcompop,
        lv_userset TYPE tdbool,
        ls_jobinfo TYPE ssfcrescl,
        ls_docinfo TYPE ssfcrespd,
        ls_otfl    TYPE itcoo,
        lv_c72     TYPE c LENGTH 72,
        lv_pdfx    TYPE xstring,
        lt_eof     TYPE match_result_tab,
        ls_eof     TYPE match_result,
        lv_pages   TYPE i,
        " CHECK
        lt_chk     TYPE tfpchecklist,
        lv_clist   TYPE string,
        lv_cmsg    TYPE string,
        lv_cid     TYPE symsgid,
        lv_cty     TYPE symsgty,
        lv_cno     TYPE symsgno,
        lv_cv1     TYPE symsgv,
        lv_cv2     TYPE symsgv,
        lv_cv3     TYPE symsgv,
        lv_cv4     TYPE symsgv,
        lv_ctype   TYPE string,
        lv_cnav    TYPE string,
        " key guard for migrated forms
        lv_keybad  TYPE string,
        lv_keyval  TYPE string.
  CONSTANTS lc_eof TYPE x LENGTH 5 VALUE '2525454F46'.   " %%EOF
  FIELD-SYMBOLS: <lv_any> TYPE any,
                 <lv_x>   TYPE x,
                 <ls_chk> TYPE any,
                 <lv_cf>  TYPE any,
                 <ls_top> TYPE any,
                 <ls_sub> TYPE any,
                 <lv_key> TYPE any.
  " SAP example forms (package SFPT) that RENDER may run - checked on an S/4HANA
  " system 2026-11-17; blanks around every name for the NS test.
  DATA lv_render_allowed TYPE string.
  lv_render_allowed = ` FP_EXAMPLE_01 FP_TEST_00 FP_TEST_01 FP_TEST_02 FP_TEST_03 ` &&
                      ` FP_TEST_03_TABLE FP_TEST_03_TABLE_DUPLEX FP_TEST_05 ` &&
                      ` FP_TEST_CONDITION1 FP_TEST_CONDITION2 FP_TEST_CONDITION3 ` &&
                      ` FP_TEST_CONDITION4 FP_TEST_CONDITION5 FP_TEST_COUNT FP_TEST_DATE ` &&
                      ` FP_TEST_DYN_GRAPHIC FP_TEST_NESTED_TABLE FP_TEST_PAGE_BREAK `.

  CLEAR: ev_subrc, ev_message.
  ev_result = '{}'.

  " Development-type clients only (customizing, demo, training).
  SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt.
  IF sy-subrc <> 0 OR ( lv_cat <> 'C' AND lv_cat <> 'D' AND lv_cat <> 'E' ).
    ev_subrc = 8.
    ev_message = |FP_CONTENT: refused in client { sy-mandt } (role "{ lv_cat }") - development clients only|.
    RETURN.
  ENDIF.

  lv_part = iv_part.
  TRANSLATE lv_part TO UPPER CASE.
  CONDENSE lv_part NO-GAPS.
  IF iv_name IS INITIAL.
    ev_subrc = 8. ev_message = |FP_CONTENT: IV_NAME is required|.
    RETURN.
  ENDIF.
  " The name goes into the result JSON unescaped: letters, digits, _ and / only.
  lv_nm = iv_name.          " string: no trailing blanks of the CHAR 30 field
  FIND REGEX '^[A-Z0-9_/]+$' IN lv_nm.
  IF sy-subrc <> 0.
    ev_subrc = 8. ev_message = |FP_CONTENT: invalid form name|.
    RETURN.
  ENDIF.
  " RENDER runs the form's own code: SAP example forms of package SFPT only (exact names),
  " or a form ZMCP_FP_MIGRATE made from one: ZSC4SAP_AFM_*, package $TMP, form type
  " migrated and the description marker " [sc4sap]" (checked below, before the render);
  " the SFP-migrated comparison form ZSC4SAP_AFM_GUI01 needs $TMP and type migrated.
  IF lv_part = 'RENDER' AND matches( val = lv_nm regex = `ZSC4SAP_AFM_[A-Z0-9_]+` ).
    lv_migrated = abap_true.
  ENDIF.
  IF lv_part = 'RENDER' AND lv_migrated = abap_false AND lv_render_allowed NS | { lv_nm } |.
    ev_subrc = 8.
    IF lv_nm CP 'Z*' OR lv_nm CP 'Y*' OR lv_nm CP '/*'.
      ev_message = |FP_CONTENT: RENDER refuses customer form { lv_nm } - only the SAP example forms of package SFPT are allowed|.
    ELSE.
      ev_message = |FP_CONTENT: RENDER is not allowed for { lv_nm } - only the SAP example forms of package SFPT|.
    ENDIF.
    RETURN.
  ENDIF.

  TRY.
      CASE lv_part.
        WHEN 'FORM' OR 'LAYOUT'.
          lo_wbf = cl_fp_wb_form=>load( i_name = iv_name i_language = iv_language ).
          lo_form ?= lo_wbf->get_object( ).
          lo_layout = lo_form->get_layout( ).
          IF lv_part = 'FORM'.
            lv_ifname = lo_form->get_interface_name( ).
            lv_ftype = lo_form->get_form_type( ).
            lv_ftech = lo_layout->get_form_tech( ).
            lv_ltype = lo_layout->get_layout_type( ).
            lv_x = cl_fp_helper=>convert_form_to_xstring( lo_form ).
            lv_b64 = cl_http_utility=>encode_x_base64( lv_x ).
            ev_result = |\{"form":"{ iv_name }","interface":"{ lv_ifname }","formType":"{ lv_ftype }",| &&
                        |"formTech":"{ lv_ftech }","layoutType":"{ lv_ltype }","xml":"{ lv_b64 }"\}|.
          ELSE.
            lv_x = lo_layout->get_layout_data( ).
            lv_b64 = cl_http_utility=>encode_x_base64( lv_x ).
            ev_result = |\{"form":"{ iv_name }","xdp":"{ lv_b64 }"\}|.
          ENDIF.
          lo_wbf->free( ).
          CLEAR lo_wbf.

        WHEN 'CHECK'.
          " SAP's form check, read-only (display-mode load inside CHECK, freed there).
          lt_chk = cl_fp_wb_form=>check( i_name = iv_name ).
          LOOP AT lt_chk ASSIGNING <ls_chk>.
            CLEAR: lv_cmsg, lv_cv1, lv_cv2, lv_cv3, lv_cv4, lv_cid, lv_cty, lv_cno, lv_ctype, lv_cnav.
            ASSIGN COMPONENT 'MSGID' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cid = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'MSGTY' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cty = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'MSGNO' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cno = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'MSGV1' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cv1 = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'MSGV2' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cv2 = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'MSGV3' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cv3 = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'MSGV4' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cv4 = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'TYPE' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_ctype = <lv_cf>. ENDIF.
            ASSIGN COMPONENT 'NAVCURSOR' OF STRUCTURE <ls_chk> TO <lv_cf>. IF sy-subrc = 0. lv_cnav = <lv_cf>. ENDIF.
            IF lv_cid IS NOT INITIAL.
              MESSAGE ID lv_cid TYPE 'S' NUMBER lv_cno WITH lv_cv1 lv_cv2 lv_cv3 lv_cv4 INTO lv_cmsg.
            ENDIF.
            lv_cmsg  = escape( val = lv_cmsg  format = cl_abap_format=>e_json_string ).
            lv_ctype = escape( val = lv_ctype format = cl_abap_format=>e_json_string ).
            lv_cnav  = escape( val = lv_cnav  format = cl_abap_format=>e_json_string ).
            IF lv_clist IS NOT INITIAL. lv_clist = lv_clist && `,`. ENDIF.
            lv_clist = lv_clist && |\{"msgty":"{ lv_cty }","msgid":"{ escape( val = lv_cid format = cl_abap_format=>e_json_string ) }","msgno":"{ lv_cno }",| &&
                       |"text":"{ lv_cmsg }","type":"{ lv_ctype }","navcursor":"{ lv_cnav }"\}|.
          ENDLOOP.
          ev_result = |\{"form":"{ iv_name }","messages":[{ lv_clist }]\}|.

        WHEN 'INTERFACE'.
          lo_wbi = cl_fp_wb_interface=>load( i_name = iv_name i_language = iv_language ).
          lo_if ?= lo_wbi->get_object( ).
          lv_x = cl_fp_helper=>convert_interface_to_xstring( lo_if ).
          lv_b64 = cl_http_utility=>encode_x_base64( lv_x ).
          ev_result = |\{"interface":"{ iv_name }","xml":"{ lv_b64 }"\}|.
          lo_wbi->free( ).
          CLEAR lo_wbi.

        WHEN 'RENDER'.
          IF strlen( iv_params ) > 200000.
            ev_subrc = 8. ev_message = |FP_CONTENT: IV_PARAMS longer than 200 000 characters|.
            RETURN.
          ENDIF.
          " Active forms only: the generated function module belongs to the active version.
          lo_wbf = cl_fp_wb_form=>load( i_name = iv_name ).
          IF lo_wbf->get_state( ) <> if_fp_wb_object=>c_state_active.
            lo_wbf->free( ).
            ev_subrc = 8. ev_message = |FP_CONTENT: form { iv_name } is not active|.
            RETURN.
          ENDIF.
          IF lv_migrated = abap_true.
            " a ZSC4SAP_AFM_* form prints only when ZMCP_FP_MIGRATE made it ($TMP, migrated,
            " marker), or as the SFP-migrated comparison form ZSC4SAP_AFM_GUI01 ($TMP, migrated)
            SELECT SINGLE devclass FROM tadir INTO lv_devclass
              WHERE pgmid = 'R3TR' AND object = 'SFPF' AND obj_name = lv_nm.
            lo_form ?= lo_wbf->get_object( ).
            lv_fdesc = lo_form->get_description( ).
            IF lv_devclass <> '$TMP' OR lo_form->get_form_type( ) <> if_fp_form=>c_form_type_migrated
               OR ( lv_nm <> 'ZSC4SAP_AFM_GUI01' AND NOT matches( val = lv_fdesc regex = `.*\[sc4sap\]` ) ).
              lo_wbf->free( ).
              ev_subrc = 8.
              ev_message = |FP_CONTENT: RENDER refuses { lv_nm } - only forms made by ZMCP_FP_MIGRATE ($TMP, migrated, marker) or ZSC4SAP_AFM_GUI01 ($TMP, migrated)|.
              RETURN.
            ENDIF.
          ENDIF.
          lo_wbf->free( ).
          CLEAR lo_wbf.

          CALL FUNCTION 'FP_FUNCTION_MODULE_NAME'
            EXPORTING
              i_name     = iv_name
            IMPORTING
              e_funcname = lv_fm.
          " A generation here must stay whole: the generator commits the new function
          " group frame itself, a later ROLLBACK would orphan it (SmartForm finding,
          " S4-DEV 2026-11-17). Only the generator's writes are in this LUW.
          COMMIT WORK.

          CALL FUNCTION 'FUNCTION_IMPORT_INTERFACE'
            EXPORTING
              funcname           = lv_fm
            TABLES
              exception_list     = lt_exc
              export_parameter   = lt_exp
              import_parameter   = lt_imp
              changing_parameter = lt_chg
              tables_parameter   = lt_tab
            EXCEPTIONS
              OTHERS             = 1.
          IF sy-subrc <> 0.
            ev_subrc = 8. ev_message = |FP_CONTENT: interface of { lv_fm } not readable|.
            RETURN.
          ENDIF.

          IF iv_params IS NOT INITIAL.
            /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = lt_in ).
          ENDIF.
          LOOP AT lt_in INTO ls_in.
            TRANSLATE ls_in-name TO UPPER CASE.
            MODIFY lt_in FROM ls_in.
          ENDLOOP.
          " The entry "$GETXML" (not an interface parameter) asks for the data XML the
          " form hands ADS as well (SFPOUTPUTPARAMS-GETXML -> FPFORMOUTPUT-XML).
          READ TABLE lt_in INTO ls_in WITH KEY name = '$GETXML'.
          IF sy-subrc = 0.
            lv_getxml = abap_true.
            DELETE lt_in WHERE name = '$GETXML'.
          ENDIF.

          IF iv_language IS NOT INITIAL.
            ls_docpar-langu = iv_language.
          ELSE.
            ls_docpar-langu = sy-langu.
          ENDIF.
          " A form with a SmartForm-type interface (every migrated form) has a generated
          " FM with the SmartForm signature that opens and closes its own job
          " (FP_CREATE_COMPOSER_INPUT -> FPCOMP_JOB_OPEN) and returns the PDF packed into
          " JOB_OUTPUT_INFO-OTFDATA (%MOVE_PDF): no FP_JOB_OPEN here, the PDF is requested
          " with CONTROL_PARAMETERS-GETOTF (-> SFPOUTPAR-GETPDF) like a SmartForm print.
          READ TABLE lt_imp TRANSPORTING NO FIELDS WITH KEY parameter = 'CONTROL_PARAMETERS'.
          IF sy-subrc = 0.
            lv_sfif = abap_true.
            ls_ctrl-no_dialog = 'X'.
            ls_ctrl-getotf    = 'X'.      " -> outpar-getpdf: the PDF comes back, no print
            ls_ctrl-preview   = space.
            ls_ctrl-langu     = ls_docpar-langu.
            ls_outopt-tdnoprev = 'X'.
            ls_outopt-tddest   = space.   " no output device
            ls_outopt-tdnewid  = space.   " no spool request ...
            ls_outopt-tdimmed  = space.   " ... and no immediate print
            ls_outopt-tddelete = space.
            ls_outopt-tdarmod  = '1'.     " print only - nothing archived
            lv_userset = space.           " our OUTPUT_OPTIONS, not the user's defaults
          ENDIF.

          LOOP AT lt_imp INTO ls_imp.
            CLEAR ls_parm.
            ls_parm-name = ls_imp-parameter.
            ls_parm-kind = abap_func_exporting.
            IF ls_imp-parameter = '/1BCDWB/DOCPARAMS'.
              GET REFERENCE OF ls_docpar INTO ls_parm-value.
            ELSEIF lv_sfif = abap_true AND ls_imp-parameter = 'CONTROL_PARAMETERS'.
              GET REFERENCE OF ls_ctrl INTO ls_parm-value.
            ELSEIF lv_sfif = abap_true AND ls_imp-parameter = 'OUTPUT_OPTIONS'.
              GET REFERENCE OF ls_outopt INTO ls_parm-value.
            ELSEIF lv_sfif = abap_true AND ls_imp-parameter = 'USER_SETTINGS'.
              GET REFERENCE OF lv_userset INTO ls_parm-value.
            ELSEIF lv_sfif = abap_true AND ( ls_imp-parameter CP 'ARCHIVE_*' OR ls_imp-parameter CP 'MAIL_*' ).
              " standard output parameters: never taken from IV_PARAMS
              CONTINUE.
            ELSE.
              CLEAR ls_in.
              READ TABLE lt_in INTO ls_in WITH KEY name = ls_imp-parameter.
              IF sy-subrc <> 0 AND ls_imp-optional = 'X'.
                CONTINUE.
              ENDIF.
              lv_type = ls_imp-typ.
              IF lv_type IS INITIAL.
                lv_type = ls_imp-dbfield.
              ENDIF.
              IF lv_type IS INITIAL.
                CONTINUE.
              ENDIF.
              CREATE DATA lr_data TYPE (lv_type).
              ASSIGN lr_data->* TO <lv_any>.
              IF ls_in-name = ls_imp-parameter AND ls_in-json IS NOT INITIAL.
                /ui2/cl_json=>deserialize( EXPORTING json = ls_in-json CHANGING data = <lv_any> ).
              ENDIF.
              ls_parm-value = lr_data.
            ENDIF.
            INSERT ls_parm INTO TABLE lt_ptab.
          ENDLOOP.

          LOOP AT lt_tab INTO ls_tab.
            CLEAR ls_parm.
            ls_parm-name = ls_tab-parameter.
            ls_parm-kind = abap_func_tables.
            lv_type = ls_tab-dbstruct.
            IF lv_type IS INITIAL.
              lv_type = ls_tab-typ.
            ENDIF.
            IF lv_type IS INITIAL.
              CONTINUE.
            ENDIF.
            CLEAR lo_tdescr.
            cl_abap_typedescr=>describe_by_name(
              EXPORTING  p_name         = lv_type
              RECEIVING  p_descr_ref    = lo_tdescr
              EXCEPTIONS type_not_found = 1
                         OTHERS         = 2 ).
            IF sy-subrc = 0 AND lo_tdescr IS BOUND AND lo_tdescr->kind = cl_abap_typedescr=>kind_table.
              CREATE DATA lr_data TYPE (lv_type).
            ELSE.
              CREATE DATA lr_data TYPE STANDARD TABLE OF (lv_type).
            ENDIF.
            ASSIGN lr_data->* TO <lv_any>.
            CLEAR ls_in.
            READ TABLE lt_in INTO ls_in WITH KEY name = ls_tab-parameter.
            IF sy-subrc = 0 AND ls_in-json IS NOT INITIAL.
              /ui2/cl_json=>deserialize( EXPORTING json = ls_in-json CHANGING data = <lv_any> ).
            ENDIF.
            ls_parm-value = lr_data.
            INSERT ls_parm INTO TABLE lt_ptab.
          ENDLOOP.

          " Migrated business forms read the database by the passed keys: for every
          " ZSC4SAP_AFM_* form, filled document / partner / address keys must be
          " impossible ('ZZ...', FORM fp_key_guard = SSF_RENDER's rule), and the keys a
          " billing form reads by (IS_BIL_INVOICE-HD_GEN-BIL_NUMBER, IS_NAST-OBJKY)
          " must be given as 'ZZ...' when the interface has those parameters.
          IF lv_migrated = abap_true.
            CLEAR lv_keybad.
            LOOP AT lt_ptab INTO ls_parm WHERE kind <> abap_func_importing.
              CASE ls_parm-name.
                WHEN 'CONTROL_PARAMETERS' OR 'OUTPUT_OPTIONS' OR 'USER_SETTINGS' OR '/1BCDWB/DOCPARAMS'.
                  CONTINUE.
              ENDCASE.
              ASSIGN ls_parm-value->* TO <lv_any>.
              PERFORM fp_key_guard USING <lv_any> ls_parm-name ls_parm-name CHANGING lv_keybad.
            ENDLOOP.
            READ TABLE lt_imp TRANSPORTING NO FIELDS WITH KEY parameter = 'IS_BIL_INVOICE'.
            IF sy-subrc = 0.
              CLEAR lv_keyval.
              READ TABLE lt_ptab INTO ls_parm WITH KEY name = 'IS_BIL_INVOICE'.
              IF sy-subrc = 0.
                ASSIGN ls_parm-value->* TO <ls_top>.
                ASSIGN COMPONENT 'HD_GEN' OF STRUCTURE <ls_top> TO <ls_sub>.
                IF sy-subrc = 0.
                  ASSIGN COMPONENT 'BIL_NUMBER' OF STRUCTURE <ls_sub> TO <lv_key>.
                  IF sy-subrc = 0. lv_keyval = <lv_key>. ENDIF.
                ENDIF.
              ENDIF.
              IF strlen( lv_keyval ) < 2 OR lv_keyval(2) <> 'ZZ'.
                lv_keybad = |{ lv_keybad } IS_BIL_INVOICE-HD_GEN-BIL_NUMBER|.
              ENDIF.
            ENDIF.
            READ TABLE lt_imp TRANSPORTING NO FIELDS WITH KEY parameter = 'IS_NAST'.
            IF sy-subrc = 0.
              CLEAR lv_keyval.
              READ TABLE lt_ptab INTO ls_parm WITH KEY name = 'IS_NAST'.
              IF sy-subrc = 0.
                ASSIGN ls_parm-value->* TO <ls_top>.
                ASSIGN COMPONENT 'OBJKY' OF STRUCTURE <ls_top> TO <lv_key>.
                IF sy-subrc = 0. lv_keyval = <lv_key>. ENDIF.
              ENDIF.
              IF strlen( lv_keyval ) < 2 OR lv_keyval(2) <> 'ZZ'.
                lv_keybad = |{ lv_keybad } IS_NAST-OBJKY|.
              ENDIF.
            ENDIF.
            IF lv_keybad IS NOT INITIAL.
              ev_subrc = 8.
              ev_message = |FP_CONTENT: { lv_nm } reads the database by its keys - these must start with 'ZZ' (impossible document keys):{ lv_keybad }|.
              RETURN.
            ENDIF.
          ENDIF.

          IF lv_sfif = abap_true.
            CLEAR ls_parm.
            ls_parm-name = 'JOB_OUTPUT_INFO'.
            ls_parm-kind = abap_func_importing.
            GET REFERENCE OF ls_jobinfo INTO ls_parm-value.
            INSERT ls_parm INTO TABLE lt_ptab.
            CLEAR ls_parm.
            ls_parm-name = 'DOCUMENT_OUTPUT_INFO'.
            ls_parm-kind = abap_func_importing.
            GET REFERENCE OF ls_docinfo INTO ls_parm-value.
            INSERT ls_parm INTO TABLE lt_ptab.
            ls_excp-name = 'FORMATTING_ERROR'. ls_excp-value = 1. INSERT ls_excp INTO TABLE lt_etab.
            ls_excp-name = 'INTERNAL_ERROR'.   ls_excp-value = 2. INSERT ls_excp INTO TABLE lt_etab.
            ls_excp-name = 'SEND_ERROR'.       ls_excp-value = 3. INSERT ls_excp INTO TABLE lt_etab.
            ls_excp-name = 'USER_CANCELED'.    ls_excp-value = 4. INSERT ls_excp INTO TABLE lt_etab.
            ls_excp-name = 'OTHERS'.           ls_excp-value = 5. INSERT ls_excp INTO TABLE lt_etab.

            CALL FUNCTION lv_fm
              PARAMETER-TABLE lt_ptab
              EXCEPTION-TABLE lt_etab.
            lv_rc = sy-subrc.
            IF lv_rc <> 0 AND sy-msgid IS NOT INITIAL.
              MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
                WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
            ENDIF.
            " Undo whatever the form's own code changed without a COMMIT.
            ROLLBACK WORK.                                "#EC CI_ROLLBACK
            IF lv_rc <> 0.
              ev_subrc = 8. ev_message = |FP_CONTENT: { lv_fm } ended with exception { lv_rc }: { ev_message }|.
              RETURN.
            ENDIF.
            " %MOVE_PDF packed the PDF bytes into the 72-character OTF lines: unpack them,
            " cut the zero padding of the last line after the final %%EOF.
            LOOP AT ls_jobinfo-otfdata INTO ls_otfl.
              lv_c72 = ls_otfl.
              ASSIGN lv_c72 TO <lv_x> CASTING.
              CONCATENATE lv_pdfx <lv_x> INTO lv_pdfx IN BYTE MODE.
            ENDLOOP.
            FIND ALL OCCURRENCES OF lc_eof IN lv_pdfx IN BYTE MODE RESULTS lt_eof.
            IF lt_eof IS INITIAL OR xstrlen( lv_pdfx ) < 4 OR lv_pdfx(4) <> '25504446'.   " %PDF
              ev_subrc = 8. ev_message = |FP_CONTENT: { lv_fm } returned no PDF|.
              RETURN.
            ENDIF.
            READ TABLE lt_eof INTO ls_eof INDEX lines( lt_eof ).
            lv_pdfx = lv_pdfx(ls_eof-offset).
            CONCATENATE lv_pdfx lc_eof INTO lv_pdfx IN BYTE MODE.
            lv_pages = ls_docinfo-tdfpages.
            lv_b64 = cl_http_utility=>encode_x_base64( lv_pdfx ).
            IF lv_getxml = abap_true.
              lv_xb64 = |,"xmlError":"no data XML for a form with a SmartForm-type interface"|.
            ENDIF.
            ev_result = |\{"form":"{ iv_name }","fm":"{ lv_fm }","pages":{ lv_pages },"pdf":"{ lv_b64 }"{ lv_xb64 }\}|.
            RETURN.
          ENDIF.

          CLEAR ls_parm.
          ls_parm-name = '/1BCDWB/FORMOUTPUT'.
          ls_parm-kind = abap_func_importing.
          GET REFERENCE OF ls_output INTO ls_parm-value.
          INSERT ls_parm INTO TABLE lt_ptab.

          ls_excp-name = 'USAGE_ERROR'.    ls_excp-value = 1. INSERT ls_excp INTO TABLE lt_etab.
          ls_excp-name = 'SYSTEM_ERROR'.   ls_excp-value = 2. INSERT ls_excp INTO TABLE lt_etab.
          ls_excp-name = 'INTERNAL_ERROR'. ls_excp-value = 3. INSERT ls_excp INTO TABLE lt_etab.
          ls_excp-name = 'OTHERS'.         ls_excp-value = 4. INSERT ls_excp INTO TABLE lt_etab.

          " The PDF comes back to the caller: no dialog, no preview, no print.
          ls_outpar-nodialog = 'X'.
          ls_outpar-getpdf   = 'X'.
          ls_outpar-preview  = space.
          ls_outpar-dest     = space.   " no output device
          ls_outpar-reqnew   = space.   " no spool request ...
          ls_outpar-reqimm   = space.   " ... and no immediate print
          ls_outpar-arcmode  = '1'.     " print only - nothing archived
          ls_outpar-getxml   = lv_getxml. " the data XML too, when asked
          CALL FUNCTION 'FP_JOB_OPEN'
            CHANGING
              ie_outputparams = ls_outpar
            EXCEPTIONS
              cancel          = 1
              usage_error     = 2
              system_error    = 3
              internal_error  = 4
              OTHERS          = 5.
          IF sy-subrc <> 0.
            ev_subrc = 8. ev_message = |FP_CONTENT: FP_JOB_OPEN failed (rc { sy-subrc }) - is ADS reachable?|.
            RETURN.
          ENDIF.
          lv_jobopen = abap_true.

          CALL FUNCTION lv_fm
            PARAMETER-TABLE lt_ptab
            EXCEPTION-TABLE lt_etab.
          lv_rc = sy-subrc.
          IF lv_rc <> 0 AND sy-msgid IS NOT INITIAL.
            MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
              WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
          ENDIF.

          CALL FUNCTION 'FP_JOB_CLOSE'
            EXCEPTIONS
              usage_error    = 1
              system_error   = 2
              internal_error = 3
              OTHERS         = 4.
          lv_jobopen = abap_false.
          " Undo whatever the form's own code changed without a COMMIT.
          ROLLBACK WORK.                                  "#EC CI_ROLLBACK

          IF lv_rc <> 0.
            ev_subrc = 8. ev_message = |FP_CONTENT: { lv_fm } ended with exception { lv_rc }: { ev_message }|.
            RETURN.
          ENDIF.
          IF ls_output-pdf IS INITIAL.
            ev_subrc = 8. ev_message = |FP_CONTENT: { lv_fm } returned no PDF|.
            RETURN.
          ENDIF.
          lv_b64 = cl_http_utility=>encode_x_base64( ls_output-pdf ).
          IF lv_getxml = abap_true.
            IF ls_output-xml IS INITIAL.
              lv_xb64 = |,"xmlError":"ADS returned no data XML"|.
            ELSEIF xstrlen( ls_output-xml ) > 2000000.
              lv_xb64 = |,"xmlError":"data XML larger than 2 000 000 bytes - not returned"|.
            ELSE.
              lv_xb64 = |,"xml":"{ cl_http_utility=>encode_x_base64( ls_output-xml ) }"|.
            ENDIF.
          ENDIF.
          ev_result = |\{"form":"{ iv_name }","fm":"{ lv_fm }","pages":{ ls_output-pages },"pdf":"{ lv_b64 }"{ lv_xb64 }\}|.

        WHEN OTHERS.
          ev_subrc = 8.
          ev_message = |FP_CONTENT: unknown part "{ iv_part }" (FORM, LAYOUT, INTERFACE, CHECK, RENDER)|.
      ENDCASE.
    CATCH cx_fp_api_repository INTO lx_repo.
      ev_subrc = 4. ev_message = |FP_CONTENT: { lx_repo->get_text( ) }|. ev_result = '{}'.
    CATCH cx_root INTO lx_root.
      ev_subrc = 8. ev_message = |FP_CONTENT: { lx_root->get_text( ) }|. ev_result = '{}'.
  ENDTRY.

  IF lv_jobopen = abap_true.
    CALL FUNCTION 'FP_JOB_CLOSE'
      EXCEPTIONS
        OTHERS = 1.
    ROLLBACK WORK.                                        "#EC CI_ROLLBACK
  ENDIF.
  IF lo_wbf IS BOUND.
    TRY.
        lo_wbf->free( ).
      CATCH cx_root.                                   "#EC NO_HANDLER
    ENDTRY.
  ENDIF.
  IF lo_wbi IS BOUND.
    TRY.
        lo_wbi->free( ).
      CATCH cx_root.                                   "#EC NO_HANDLER
    ENDTRY.
  ENDIF.
ENDFUNCTION.

*&---------------------------------------------------------------------*
*& Form FP_KEY_GUARD - filled key components must start with 'ZZ'
*&---------------------------------------------------------------------*
* Same rule as FORM SSF_KEY_GUARD of ZMCP_SSF_RENDER (zmcp_ssf_render_s4.abap).
* Walks a passed value (structures, tables, nested) and lists every
* elementary component whose name matches lc_key_re, is filled and does
* not start with 'ZZ'. At most 10 paths are listed.
FORM fp_key_guard USING is_data  TYPE any
                         iv_name  TYPE csequence
                         iv_path  TYPE csequence
                   CHANGING cv_bad TYPE string.
  CONSTANTS lc_key_re TYPE string
    VALUE `VBELN.*|BIL_NUMBER|OBJKY|ADDR_NO|ADRNR|ADDRNUMBER|ADDR_NUMB|PERS_NO|PERSNUMBER|DELIV_NUMB|ORDER_NUMB|PAYER|SOLD_TO|SHIP_TO|BILL_TO|KUNNR|KUNAG|KUNRG|KUNWE|PARTN_NUMB|PARNR|MNDID|.*IBAN`.
  DATA: lo_type  TYPE REF TO cl_abap_typedescr,
        lo_struc TYPE REF TO cl_abap_structdescr,
        ls_comp  TYPE abap_compdescr,
        lv_val   TYPE string,
        lv_path  TYPE string,
        lv_count TYPE i.
  FIELD-SYMBOLS: <ls_c>   TYPE any,
                 <lt_tab> TYPE ANY TABLE,
                 <ls_row> TYPE any.

  FIND ALL OCCURRENCES OF `/` IN cv_bad MATCH COUNT lv_count.
  IF lv_count >= 10.
    RETURN.
  ENDIF.
  lo_type = cl_abap_typedescr=>describe_by_data( is_data ).
  CASE lo_type->kind.
    WHEN cl_abap_typedescr=>kind_struct.
      lo_struc ?= lo_type.
      LOOP AT lo_struc->components INTO ls_comp.
        ASSIGN COMPONENT ls_comp-name OF STRUCTURE is_data TO <ls_c>.
        IF sy-subrc = 0.
          lv_path = |{ iv_path }-{ ls_comp-name }|.
          PERFORM fp_key_guard USING <ls_c> ls_comp-name lv_path CHANGING cv_bad.
        ENDIF.
      ENDLOOP.
    WHEN cl_abap_typedescr=>kind_table.
      ASSIGN is_data TO <lt_tab>.
      LOOP AT <lt_tab> ASSIGNING <ls_row>.
        lv_path = |{ iv_path }[{ sy-tabix }]|.
        PERFORM fp_key_guard USING <ls_row> iv_name lv_path CHANGING cv_bad.
      ENDLOOP.
    WHEN cl_abap_typedescr=>kind_elem.
      IF is_data IS NOT INITIAL AND matches( val = to_upper( iv_name ) regex = lc_key_re ).
        lv_val = is_data.
        CONDENSE lv_val.
        IF strlen( lv_val ) < 2 OR lv_val(2) <> 'ZZ'.
          cv_bad = |{ cv_bad } /{ iv_path }|.
        ENDIF.
      ENDIF.
  ENDCASE.
ENDFORM.
