# s4-conversion-readiness — Knowledge base

Referenced by `SKILL.md` and `workflow.md`. File: `configs/conversion/simplification.json`. Scanner: `scripts/conversion/readiness-scan.mjs`; ratings: `readiness-model.mjs`; page: `readiness-page.mjs` (texts in `readiness-labels.mjs`).

## Severities

| sev | Meaning | Typical case |
|---|---|---|
| blocker | Fails or dumps after the conversion | write to a replaced table (MSEG, BSIS …), batch input on a removed T-code, native SQL |
| functional | Runs, but reads empty or wrong data | SELECT FROM KONV / VBUK / VBUP / KNKK |
| performance | Works through a compatibility view, slower | reads of MKPF / MSEG, BSIS / BSID …, stock fields |
| check | Needs a look | MATNR offsets, other-database hints, LIS, WM / LE-TRA tables |
| info | For information | HR tables, costing-based CO-PA |

## Item fields

| Field | Meaning |
|---|---|
| `id`, `area`, `since`, `sev`, `effort` (S / M / L) | identity, area (SD, MM, FI, CO, LE, PP, HR, MD, INT, CROSS), first S/4 release, default severity and effort |
| `title`, `change`, `action` | `{ ko, en }` texts shown in the report |
| `tables` | `{ name, read, write, to }` — severity of a read / write edge to that table (empty = not reported), replacement |
| `tablePrefixes` | `{ prefix, read, write }` — table families (CE1…, PA0…) |
| `tcodes`, `tcodePrefixes` | `{ name | prefix, to }` — a CALL TRANSACTION / batch input to it, and its use in the measured usage. Batch input is always a blocker; a plain call to a BP-redirected transaction is a check |
| `fms` | `{ name, to }` — CALL FUNCTION of a removed / replaced function module |
| `classPrefixes` | `{ prefix, note }` — a `uses` edge to a class / interface starting with it (proxy runtime CX_AI_* / CL_PROXY_*, CL_SWF_EVT_EVENT). Match SAP framework classes, never customer name prefixes — they collide with module naming (ZCO_ = CO module and consumer proxy) |
| `objectPatterns` | regexes on member object names (customer IDoc function modules `…IDOC_INPUT…`) |
| `exits` | `{ prefix, note }` — customer exits / BAdIs whose standard name starts with the prefix |
| `appends`, `appendAction` | base tables whose customer fields must move, and how |
| `extension` | extension key this item points to (EWM, TM, GTS, OUTPUT, SETTLEMENT) |

`patterns` are source rules of `scanUnit` (NATIVE_SQL, DB_HINTS, SELECT_ORDER, MATNR18): id, area, sev, effort, title, action. A new pattern needs code in `scanUnit` and a test.

`tableExtensions` lists the tables whose customer fields need work, by group: `proxy` (reads go through a proxy / compatibility CDS view — extend it, e.g. the MM-IM hybrid tables MARC, MARD … and their history tables, MBEW …, BSIS …, FAGLFLEXT, COSP, ANLC), `move` (data moves — add the fields to the new table: MSEG → MATDOC, BSEG / COEP → ACDOCA, KONV → PRCD_ELEMENTS, VBUK → VBAK …), `bp` (KNA1 … — BP screens and CVI mapping). The facts step reads DD03L of these tables, of every `appends` table and of every `cds` table (Z* / Y* fields, appends, CI_ includes), so no table depends on the setup append extract. A table to add belongs in a group with its kind; proxy object names are examples.

`cds` maps a base table to the standard CDS views where its customer fields are exposed (on-premise: `EXTEND VIEW ENTITY` / extension include; public cloud: Custom Fields app). The names are examples to verify in the target release.

`idoc` maps an IDoc message type of the partner profiles (EDP13 outbound, EDP21 inbound) to the item it touches and a note; other types are listed for regression testing. On ECC the dispatcher may refuse EDP13 / EDP21 / SWETYPECOU (delivery class A) — the report then says so.

`targets` and `extensions` hold the labels and the target notes.

## Adding an item

1. Only what SAP documents as a simplification item; title it like SAP does. When the exact target structure varies by release, say "follow the SI-Check".
2. Pick the severity by what happens to code that does the access — not by business importance.
3. No customer object names, no company names; SAP objects only.
4. Run the knowledge base test (`tests/validation/s4-conversion-readiness.test.ts`) and rebuild a report.
