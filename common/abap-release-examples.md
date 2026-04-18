# ABAP Release Examples

Concrete before/after ABAP syntax examples per release feature. Companion to [abap-release-reference.md](abap-release-reference.md) — consult the reference for the feature matrix, decision rules, and the emission checklist.

Agents MUST NOT emit features newer than the configured `ABAP_RELEASE` in `.sc4sap/config.json` (or `sap.env`) — doing so causes activation failures on the target system.

---

### 2.1 Inline Declarations (≥ 740)

**Allowed (740+)**
```abap
SELECT * FROM mara INTO TABLE @DATA(lt_mara) UP TO 10 ROWS.
LOOP AT lt_mara INTO DATA(ls_mara).
  READ TABLE lt_items ASSIGNING FIELD-SYMBOL(<ls_item>) WITH KEY matnr = ls_mara-matnr.
ENDLOOP.
```

**Not allowed (< 740) — rewrite as**
```abap
DATA: lt_mara TYPE STANDARD TABLE OF mara,
      ls_mara TYPE mara.
DATA: <ls_item> TYPE REF TO your_item_structure.
SELECT * FROM mara INTO TABLE lt_mara UP TO 10 ROWS.
LOOP AT lt_mara INTO ls_mara.
  READ TABLE lt_items ASSIGNING <ls_item> WITH KEY matnr = ls_mara-matnr.
ENDLOOP.
```

### 2.2 Constructor Expressions — `NEW`, `VALUE`, `CORRESPONDING` (≥ 740)

**Allowed (740+)**
```abap
DATA(lo_obj) = NEW zcl_sales_processor( iv_orderid = '0000012345' ).

DATA(ls_header) = VALUE zsd_order_header(
  vbeln = '0000012345'
  auart = 'TA'
  vkorg = '1710'
).

DATA(lt_target) = CORRESPONDING zsd_target_tab( lt_source
  MAPPING vbeln = orderid auart = ordertype ).
```

**Not allowed (< 740) — rewrite as**
```abap
DATA lo_obj TYPE REF TO zcl_sales_processor.
CREATE OBJECT lo_obj EXPORTING iv_orderid = '0000012345'.

DATA ls_header TYPE zsd_order_header.
ls_header-vbeln = '0000012345'.
ls_header-auart = 'TA'.
ls_header-vkorg = '1710'.

DATA lt_target TYPE zsd_target_tab.
LOOP AT lt_source INTO DATA(ls_source).
  DATA ls_target TYPE zsd_target_line.
  ls_target-vbeln = ls_source-orderid.
  ls_target-auart = ls_source-ordertype.
  APPEND ls_target TO lt_target.
ENDLOOP.
```

### 2.3 Table Expressions (≥ 740)

**Allowed (740+)**
```abap
DATA(ls_item) = lt_items[ posnr = '000010' ].
" Exception-safe variant
DATA(lv_qty) = VALUE #( lt_items[ posnr = '000010' ]-menge OPTIONAL ).
```

**Not allowed (< 740)**
```abap
READ TABLE lt_items INTO DATA(ls_item) WITH KEY posnr = '000010'.
IF sy-subrc = 0.
  DATA(lv_qty) = ls_item-menge.
ENDIF.
```

### 2.4 String Templates (≥ 740)

**Allowed (740+)**
```abap
DATA(lv_msg) = |Order { lv_vbeln } posted on { sy-datum DATE = USER } with { lines( lt_items ) } items|.
```

**Not allowed (< 740)**
```abap
DATA lv_msg TYPE string.
CONCATENATE 'Order' lv_vbeln 'posted on' sy-datum 'with' lines( lt_items ) 'items' INTO lv_msg SEPARATED BY space.
```

### 2.5 `FOR` Expressions (≥ 741)

**Allowed (741+)**
```abap
DATA(lt_matnr) = VALUE string_table(
  FOR ls_line IN lt_items WHERE ( menge > 0 )
  ( CONV string( ls_line-matnr ) ) ).

DATA(lv_total) = REDUCE i(
  INIT sum = 0
  FOR ls_line IN lt_items
  NEXT sum = sum + ls_line-menge ).
```

### 2.6 Open SQL Expressions (≥ 750)

**Allowed (750+)**
```abap
SELECT vbeln,
       CASE WHEN netwr > 10000 THEN 'HIGH'
            WHEN netwr > 1000  THEN 'MED'
            ELSE 'LOW' END AS priority,
       CAST( erdat AS CHAR ) AS erdat_c,
       COALESCE( augru, '00' ) AS augru
  FROM vbak
  INTO TABLE @DATA(lt_result)
  UP TO 100 ROWS.
```

**Not allowed (< 750) — do CASE in ABAP after SELECT**
```abap
SELECT vbeln netwr erdat augru FROM vbak INTO TABLE lt_raw UP TO 100 ROWS.
LOOP AT lt_raw INTO DATA(ls_raw).
  DATA ls_result TYPE zsd_result_line.
  ls_result-vbeln = ls_raw-vbeln.
  IF ls_raw-netwr > 10000.
    ls_result-priority = 'HIGH'.
  ELSEIF ls_raw-netwr > 1000.
    ls_result-priority = 'MED'.
  ELSE.
    ls_result-priority = 'LOW'.
  ENDIF.
  " ...
  APPEND ls_result TO lt_result.
ENDLOOP.
```

### 2.7 `GROUP BY` in Internal Tables (≥ 751)

**Allowed (751+)**
```abap
LOOP AT lt_items INTO DATA(ls_item)
     GROUP BY ( matnr = ls_item-matnr )
     ASSIGNING FIELD-SYMBOL(<group>).
  DATA(lv_sum) = REDUCE i(
    INIT s = 0
    FOR m IN GROUP <group>
    NEXT s = s + m-menge ).
  WRITE: / <group>-matnr, lv_sum.
ENDLOOP.
```

### 2.8 RAP / EML (≥ 754)

**Allowed (754+)**
```abap
MODIFY ENTITIES OF z_i_salesorder
  ENTITY SalesOrder
  UPDATE FIELDS ( OverallStatus )
  WITH VALUE #( ( SalesOrder = '0000012345' OverallStatus = 'B' ) )
  FAILED DATA(failed)
  REPORTED DATA(reported).

COMMIT ENTITIES.
```

**Not allowed (< 754) — use classic BAPI**
```abap
DATA: lt_return TYPE STANDARD TABLE OF bapiret2.
CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
  EXPORTING
    salesdocument = '0000012345'
    ...
  TABLES
    return        = lt_return.
CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
```

### 2.9 ABAP Cloud Restriction (≥ 756 with `SAP_SYSTEM_TYPE=cloud`)

**Cloud-safe (use released API)**
```abap
" I_BusinessPartner is a released CDS view (C1)
SELECT * FROM i_businesspartner
  WHERE businesspartnercategory = '1'
  INTO TABLE @DATA(lt_bp).
```

**Cloud-forbidden (on-prem only)**
```abap
SELECT * FROM but000 INTO TABLE @DATA(lt_bp).  " ❌ not released for ABAP Cloud
```

Agents MUST check `SAP_SYSTEM_TYPE` — on `cloud`, only released (C1) APIs, CDS views, and BAdIs are permitted. On `onprem`, classic DDIC tables are allowed but still discouraged when a released view exists.
