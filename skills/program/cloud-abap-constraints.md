# Cloud ABAP Constraints Reference

Reference for `sc4sap:program` skill — Phase 0 preflight uses this table when `sapVersion = S/4HANA Cloud Public`. Classic ABAP features on the left are **prohibited**; use the Cloud ABAP equivalent on the right.

## Prohibited Statements / Features

| Category | Classic ABAP | Cloud ABAP (ABAP for Cloud Platform) | Notes |
|----------|--------------|--------------------------------------|-------|
| File system | `OPEN/CLOSE/READ/GET DATASET` | Not available | |
| DB access | `EXEC SQL`, `CURSOR`, `SELECT ... CLIENT SPECIFIED` | Not available | |
| ABAP system access | `CALL CFUNCTION`, `SYSTEM CALL`, `SYSTEM EXIT` | Not available | |
| Screen | Dynpro family (`CALL SCREEN`, `PF-STATUS`, `LOOP SCREEN`, etc.) | Not available | **Entire Full-ALV path blocked** |
| List processing | `LEAVE (TO) LIST-PROCESSING` | Not available | |
| Prohibited OOP syntax | `WITH HEADER LINE`, `TABLES` declaration | Not available | |
| Enhancement | `ENHANCEMENT-POINT` | Not available | Use Key User / Developer Extensibility |
| Event blocks | `LOAD-OF-PROGRAM`, `INITIALIZATION`, `AT SELECTION-SCREEN`, `START-OF-SELECTION`, etc. | Not available | |
| Debug | `BREAK-POINT` | Not available | Use ADT Debugging |

## API Replacements

| Category | Classic | Cloud ABAP Replacement |
|----------|---------|------------------------|
| Parallel processing | `CALL FUNCTION ... STARTING NEW TASK` | `CL_ABAP_PARALLEL` |
| System variables (date/time) | `sy-datum`, `sy-uzeit`, `sy-zonlo` | `cl_abap_context_info=>get_system_date( )` / `get_system_time( )` / `get_user_time_zone( )` |
| System variables (common) | `sy-batch`, `sy-dbcnt`, `sy-fdpos`, `sy-index`, `sy-mandt`, `sy-msgno`, `sy-msgty`, `sy-msgv1~4`, `sy-subrc`, `sy-sysid`, `sy-tabix`, `sy-uname` | **Still usable as-is** |
| Memory | `EXPORT ... TO MEMORY ID`, `IMPORT ... FROM MEMORY ID` | `EXPORT ... TO INTERNAL TABLE / DATA BUFFER`, `IMPORT ... FROM INTERNAL TABLE / DATA BUFFER` |
| DDIC tables (DD01L, DD02L, DD02V, DD03L, DD04L) | Direct SELECT | `xco_cp_abap_dictionary`, `xco_cp_database_table`, `xco_cp_cds`, `xco_cp_data_element`, `xco_cp_domain` |
| Role | SU01 / PFCG | IAM App (Service Binding), Access Control Object, Business Catalog/Role (CDS), Restriction Type/Field |
| Arithmetic | `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE` | `+`, `+=`, `-`, `-=`, `*`, `*=`, `/`, `/=` |
| Calendar (Factory) | `FACTORYDATE_CONVERT_TO_DATE`, `DATE_CONVERT_TO_FACTORYDATE`, `CALCULATE_DATE`, `RKE_SELECT_FACTDAYS_FOR_PERIOD` | `CL_FHC_CALENDAR_RUNTIME` |
| Calendar (General) | `MONTH_NAMES_GET`, `WEEK_GET_FIRST_DAY`, `DATE_GET_WEEK` | `CL_SCAL_UTILS` |
| Calendar (Holiday) | `HOLIDAY_CHECK_AND_GET_INFO`, `HOLIDAY_GET`, `HOLIDAY_CALENDAR_GET` | `CL_FHC_CALENDAR_RUNTIME` |
| Call Stack | `SYSTEM_CALLSTACK`, `SYSTEM_CALLSTACK_OF_PROCESS` | `xco_cp_call_stack` |
| Conversion (binary/xstring/base64) | `SCMS_BINARY_TO_XSTRING`, `SCMS_BINARY_TO_STRING`, `SCMS_XSTRING_TO_BINARY`, `SCMS_STRING_TO_XSTRING`, `SCMS_BASE64_ENCODE_STR`, `SCMS_BASE64_DECODE_STR` | `xco_cp=>xstring`, `xco_cp_binary` |
| Date conversion | `CONVERT_DATE_TO_EXTERNAL`, `CONVERT_DATE_TO_INTERNAL`, `DATE_CONV_EXT_TO_INT`, `DATE_CHECK_PLAUSIBILITY` | `cl_abap_datfm`, `cl_abap_timefm`, `cl_abap_tstmp` |
| Change Document tracking | Direct query on CDHDR, CDPOS | Change Document Object + `<ns>CL_<obj>_CHDO` |
| Excel upload | `GUI_UPLOAD`, `TEXT_CONVERT_XLS_TO_SAP`, `ALSM_EXCEL_TO_INTERNAL_TABLE`, `cl_fdt_xl_spreadsheet` | `xco_cp_xlsx`, `xco_cp_xlsx_selection`, `xco_cp_xlsx_read_access` |
| Exchange rates | TCURR, V_TCURR | `cl_exchange_rates` |
| UOM | `UNIT_CONVERSION_SIMPLE`, `UNIT_GET`, `MC_UNIT_CONVERSION`, `CONVERSION_EXIT_CUNIT_INPUT` | `cl_uom_maintenance`, `cl_uom_dim_maintenance`, `cl_uom_conversion` (CDS: `I_UnitOfMeasure`) |
| Forms | SAPScript (SE71~SE77), SmartForms (SMARTFORMS, SMARTSTYLES), Adobe Form (SFP), `OPEN_FORM`/`START_FORM`/`WRITE_FORM`/`END_FORM`/`CLOSE_FORM` | Forms Service by Adobe + `cl_print_queue_utils` |
| Role administration | PFCG, SU01, SU10, USR01, USR03 | Maintain Business User / Business Role apps + CDS: `I_IAMBusinessUserBusinessRole`, `I_IAMBusinessRole`, `I_IAMBusinessUserLogonDetails`, `I_BusinessPartner`, `I_WorkplaceAddress` |
| XML | `SMUM_XML_PARSE`, `SMUM_XML_CREATE`, `SMUM_XML_CREATE_X`, `TEXT_CONVERT_XML_TO_SAP` | `cl_demo_xml_access`, `cl_sxml_string_reader/writer`, `cl_sxml_table_reader/writer` |
| Batch jobs | SM36, SM37, `JOB_OPEN`, `JOB_CLOSE`, `JOB_SUBMIT`, `BP_JOB_DELETE`, `BP_JOB_READ`, `SHOW_JOB` | Application Jobs app + `cl_apj_dt_create_content` (open), `cl_apj_rt_api` (submit) |
| MIME | SMW0, `CL_MIME_REPOSITORY_API`, `CL_WB_MIME_REPOSITORY`, `GUI_UPLOAD` | CDS Annotation `@Semantics.largeObject`, `@Semantics.mimeType` |
| Lock | `ENQUEUE_E_TABLE`, `DEQUEUE_E_TABLE`, `DEQUEUE_ALL` | `cl_abap_lock_object_factory` |
| Number Range | SNRO, `NUMBER_GET_NEXT`, `NUMBER_CHECK` | Manage Number Range Intervals app + `cl_numberrange_objects`, `cl_numberrange_intervals`, `cl_numberrange_runtime` |
| Regex | `REGEX` keyword | `PCRE` keyword (`REPLACE ALL OCCURRENCES OF PCRE '...' IN ...`) |
| RFC | SE37, SM59 | Outbound Service + Communication Scenario |
| SOAP | SPROXY / SOAMANAGER | Outbound Service (SOAP) + Communication Scenario, or `cl_soap_destination_provider` (outbound only) |
| Translation | GUI Translation | Maintain Translation app + `xco_cp_i18n` (RAP Generator recommended) |
| CTS | CTS | gCTS (On-Prem) / CTS+ → BTP |

## Program Structure (Cloud ABAP)

- **ABAP freestyle reports are not allowed** — event blocks themselves are prohibited.
- Write the logic as a Class Method or Function Module instead.
- To run a class directly, implement the `if_oo_adt_classrun` interface:

```abap
CLASS ztest_class DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES: if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ztest_class IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    out->write( 'Hello world!' ).
  ENDMETHOD.
ENDCLASS.
```

## Impact on `sc4sap:program`

On Cloud Public, the default Main+Include + Dynpro + CL_GUI_ALV_GRID pipeline **cannot execute**. The skill must redirect:

- **Report/List** → `if_oo_adt_classrun` class, output via `out->write` or RAP + Fiori Elements
- **CRUD** → RAP managed/unmanaged business object + Fiori Elements UI
- **Batch** → Application Job Template + `cl_apj_rt_api`
- **Integration** → Outbound Communication Scenario + Service Binding
- **Interactive UI** → Fiori Elements or UI5 (no Dynpro)

Fail-fast when a user request maps to a prohibited feature on Cloud Public; propose the Cloud-native equivalent.

## External References

- SAP Help: `xco_cp` libraries — https://help.sap.com/docs/btp/sap-business-technology-platform/
- Dan M — `CL_ABAP_PARALLEL` for mass parallel dialog work packages
- aoyang — Smooth transition to ABAP for Cloud Development (cheat sheet)
- Attila Berencsi — Locking in ABAP on BTP
- Nangamja — SAP RAP Excel Upload and attachments guide
