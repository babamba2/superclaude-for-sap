# SmartForm → Adobe mapping (rules of SAP's own migration)

The plan (`scripts/adobe/sf-to-adobe-plan.mjs`) does what `CL_SSF_MIGRATION=>MIGRATE` would do, method by method. This
file names the method behind every rule, so a reviewer can check each rule against the SAP source.

**Source of the rules.** These classes in package SAXFT / SMART, read on an ECC DEV system (BASIS 7.40):
- `CL_SSF_MIGRATION` (7 198 lines)
- `CL_SSF_FB_NODE`: `IF_SSF_FB_GENERAL~MIGRATE` dispatches each node to a method
- `CL_SSF_FB_SMART_FORM~MIGRATE`
- `CL_SSF_XFA_XHTML=>ENCODE_SF_NAME`
- the constants include `RSTXSFCDEF`

**Same on S/4.** Read on an S/4HANA DEV system as well (2026-11-17), the four classes and the include are identical to the ECC read: `CL_SSF_MIGRATION`, `CL_SSF_FB_NODE`, `CL_SSF_FB_SMART_FORM`, `CL_SSF_XFA_XHTML` and `RSTXSFCDEF` (only a trailing line break differs). `SSFMEXPROPERTIES` has the same 22 flags in the same order, and `SSFOCOND` the same condition flags. So one rule set serves both releases. Re-read the classes when a system gets a newer SAP_BASIS support package.

## 1. The call and its options

- `MIGRATE( sf_name, fp_form_name?, fp_interface_name?, options? )`
- Without names, both target names are `ENCODE_SF_NAME(sf_name)`.
- If a target already exists, `MIGRATE` **deletes it and creates it again**. So P2 must always pass new names and refuse existing ones.
- Order of the run:
  1. Interface: create → `MIGRATE_INTERFACE` → **save**
  2. Form context: walk the tree
  3. Layout: render the XFT template
  4. Save the form
  5. Save the BAL log (object `SMARTFORM` / `XFAMIGRATION`)
- Nothing is activated.
- An exception during the walk logs m13 and frees the objects. The interface is already saved at that point.
- Options (`SSFMEXPROPERTIES`, 22 flags):
  - Without options → `SET_DEFAULT_MIGRATING_OPTIONS`:
    - on: interface, context, layout, window, text, text_placeholder, address, graphic, folder, template, command_pagebreak
    - **off**: table, condition_data, condition_layout, alternative_*, output_option, header_footer, command_rest, coding, text_binding, text_append
  - With options → `RECTIFY_MIGRATING_OPTIONS`:
    - no context → no layout parts
    - `alternative_all` clears `alternative_true`
    - `text_binding` clears `text_placeholder`
    - no layout → no condition_layout / text_append / text_binding / output_option / command_pagebreak
- The plan's presets: `sap-default` (the list above) and `full` (every flag, then rectified). **The plan and the P2 call must use the same options.** The P2 helper passes them explicitly and the report prints them.

## 2. Node → method → result

Abbreviations: ctx = context node, sf = XFT subform. "Flatten" = the children are migrated into the parent, without the node of their own.

| Node (type / sub-type) | Method | Result (option that gates it) | SAP message / silent loss |
|---|---|---|---|
| Form | `CL_SSF_FB_SMART_FORM~MIGRATE` | root sf = form name, common script (text_append / condition_layout), then the page tree | A text module (FORMTYPE T) has no page tree, so the result is an empty form (interface only) |
| RP page root | `MIGRATE_PAGE_ROOT` + `CONVERT_SF2XFT_PAGELIST` | pageSet (0..1) with pageAreas along NEXTPAGE: self-loop → max −1; a page reached again → nested pageSet (0..−1) (layout) | Pages not reached from the first page are not migrated (silent) |
| PA page | `MIGRATE_PAGE` | pageArea medium from TSP08 (format + orientation), stock A3/A4/A5/letter/legal/executive/Japanese postcard (layout) | **m12 E** for other formats |
| WI main window | `MIGRATE_WINDOW` (+ `MIGRATE_OUTATTR`) | contentArea at the window box on every page; one flow sf `lr-tb` in the root (first page only); ctx folder (window or condition_data); content migrated **once** | — |
| WI other windows (secondary / graphic / address / copies / final) | `MIGRATE_WINDOW` | sf `<PAGE>_<WINDOW>` as prototype + reference per page; ctx folder per page; content migrated again on every page Final window: SmartForms fills it after the main window (page X of Y); the Adobe context is filled before the layout (silent) → page-number fields `$layout.page(ref($))` / `$layout.pageCount()` on the master page. Copies window: Adobe copies are identical spool copies, no copy counter, `SFSY-COPYCOUNT` unsupported (silent) → the print program calls the form once per copy with a copy flag parameter |
| RC control root | dispatcher | children only | — |
| TI text element (TTYPE blank) | `MIGRATE_TEXT_ELEMENT` | draw with XHTML from ITF (`CL_SSF_XFA_XHTML`, style by name); a wrapping sf when output options / conditions / text_append apply; per `&field&`: hidden field declarations and a ctx data node (text_placeholder or text_binding); a ctx folder for binding or a data condition (text) | **m04 W** unsupported field, **m05 E** unknown field, **m15 E** style error |
| TI include text (I) | `MIGRATE_TEXT_INCLUDE` | field (textEdit) + ctx text-include (text) | — |
| TI text module (R) | `MIGRATE_TEXT_MODULE` | field + ctx text-module (text) | — |
| TI dynamic text (D) | `MIGRATE_TEXT_DYNAMIC` | field + ctx text-dynamic (text) | — |
| TI other types (T, A, B, F) | none | not migrated | silent |
| GR graphic | `MIGRATE_GRAPHIC` | ctx graphic-url always; sf (none inside a graphic window), alignment sf, image field with the MIME URL of the BDS graphic (graphic, layout) | A key with `&field&` → image without URL (silent) |
| AD address | `MIGRATE_ADDRESS` | ctx address (type / number / person, static or field) + sf + field (address) | **m02 W** always (paragraph format) |
| CM command | `MIGRATE_COMMAND` | new page → sf with break before contentArea (command_pagebreak); spool attributes → ctx command (command_rest) | **m06 W** date / time / sign / reset / printer control; a break target page without a main window gets no target (silent) |
| CO code | `MIGRATE_CODE` | ctx program lines (coding) — not interface code | **m04 W** / **m14 W** per parameter, **m03 W** layout condition |
| CD alternative | `MIGRATE_ALTERNATIVE` | alternative_all → ctx alternative (condition) + sf + subformSet choice; else flatten | Without alternative_all both branches print; with alternative_true only TRUE (silent) |
| EV true / false | `MIGRATE_EVENT_TRUE` / `_FALSE` | branch sf (0..1) under the alternative (alternative_all) | FALSE skipped with alternative_true |
| SE folder (F) | `MIGRATE_FOLDER` | sf `lr-tb` + ctx folder (folder) | — |
| SE loop (L) | `MIGRATE_LOOP` | sf tb → sf work area (position) → `layout_top_to_bottom`; ctx loop (table, work area, from / to, WHERE) (table); a table inside an active work area is a nested loop | **m09 E** calculations, **m10 E** sort, **m05 E** + **m13 E** unknown table (stop) |
| SE 4.6C table (T) | `MIGRATE_TABLE_46C` | then `MIGRATE_LOOP`: the loop and its fields stay, the 4.6C formatting (line types, cells, widths, borders, shading) is dropped | **m07 E** always → rebuild as a Designer table, widths / borders from the old line types |
| SE table (C) | `MIGRATE_CTABLE` | like a loop, table width from the line types (table) | **m09 E**, **m10 E** |
| SE template (S) | `MIGRATE_TEMPLATE` | sf table layout with cell subforms (template); cells filled through output options (line / cell no.) | **m01 E** cell referenced twice |
| SE row (R) / cell (E) | `MIGRATE_ROW` / `_CELL` | sf row layout + ctx folder / cell sf (table) | — |
| SE complex (blank) | `MIGRATE_COMPLEX_SECTION` | sf + ctx folder | **m08 E** always |
| EV header / footer | `MIGRATE_EVENT_HEADER` / `_FOOTER` | sf `<name>-header` / `-footer`, position layout, keep, prototype; output flag A → start + overflow leader / trailer, B / E → start / end only, P → overflow only (header_footer **and** the table / folder option) No output flag on the table: SmartForms never prints the area — SAP skips it (`CHECK` on the anchor) or, when an earlier table left its anchor (`xft_section_ev_header` / `_footer` are never cleared), builds an unplaced prototype: **info row, not a gap**. With header_footer / table option off and a stale anchor the area prints once — a gap. Flag A / P with fields: SmartForms prints the values at each page break (running total); the Adobe trailer shows the end value (silent) → sum the rows of the page in FormCalc / JavaScript. Program lines in the area sit under the loop data in the context and run for every row before the layout, not at the page break / end (silent) — totals collected there print running or per-row values → compute them in the interface initialization |
| EV body | `MIGRATE_EVENT_BODY` | tbody sf (table) | — |
| EV sort begin / end, others | dispatcher `WHEN OTHERS` | flatten into the table body | Begin: heading prints and its program lines run (and reset totals) for every row; end: prints after every row with that row's values (silent). Each code node inside gets its own gap row → group the data in the interface initialization, nested context loops, subtotal in the outer subform (or FormCalc `Sum(items[*].field)`); a context condition cannot see the previous row |

## 3. Conditions

- **Data condition** (`SET_FP_CONDITION`, condition_data): the condition rows go to the ctx node of the node.
  - **SAP's check reads the row of the previous pass.** Once a row with an unsupported field has been appended, every later row gets m04 and is dropped. The plan copies this exactly; see the `ROW_B` test.
  - An empty OR row joins the next row with OR.
- **Layout condition** (`SET_XFT_CONDITION`, condition_layout): a hidden field with a FormCalc calculate.
  - Only "first page" (`$layout.absPage(ref($)) == "1"`) and "not first page" (`!= "1"`) are written.
  - LPAGE, NLPAGE, PAGENAME, HEADER, FOOTER, PAGEBREAK are dropped (silent). SAP still adds the hidden field with an empty calculate, so the node prints on every page.
  - Rebuild: NLPAGE → presence script `if ($layout.page(ref($)) == $layout.pageCount()) then $.presence = "hidden" endif` (LPAGE with `<>`); in the main window flow prefer a data condition on a flag from interface code (a presence change reflows the pages). HEADER / FOOTER / PAGEBREAK: SSFOCOND has no fixed values — confirm the meaning in the Form Builder before rebuilding.
- A node kind whose method takes no condition loses it (silent). With the option off, every condition is lost.
- The plan lists each such loss under the node (`data condition not migrated …`, `layout condition … not migrated`).

## 4. Fields (`IS_FIELD_SUPPORTED`)

- Not supported:
  - `SFSY-PAGENAME`, `-WINDOWNAME`, `-XSF`, `-XDF`, `-XDF2`, `-SUBRC`, `-COPYCOUNT`, `-COPYCOUNT0`, `-JOBPAGES`
  - anything that starts with `ARCHIVE_INDEX`, `ARCHIVE_PARAMETERS`, `CONTROL_PARAMETERS`, `MAIL_*`, `OUTPUT_OPTIONS`, `USER_SETTINGS`
- Supported: `SFSY-PAGE`, `SFSY-FORMPAGES`, `SFSY-DATE`, `SFSY-TIME` and all others.
- m05 (unknown field) comes from the context API's DDIC check. The plan predicts it only when the field's head is declared nowhere (interface, global data, `SFSY`, `SY`, an active loop work area) and marks it `predicted`.

## 5. Interface (`MIGRATE_INTERFACE`)

- Interface type: SmartForms-compatible.
- **Every** parameter is copied, the standard ones too (`OUTPUT_OPTIONS`, `CONTROL_PARAMETERS`, `JOB_OUTPUT_INFO`, …):
  - import, export, tables and exceptions each go to their own list
  - `TABLE OF` / `LINE OF` typings are reorganized
- Also copied:
  - global data, types, field symbols, reference fields
  - initialization code and form routines, with the init input / output parameters
- Code nodes do **not** go to the interface; they become context program lines (§2).

## 6. Names

- `ENCODE_SF_NAME`: upper case. Characters other than A–Z / 0–9 become `X<hex>_` (a first character also when it is `_` or `-`). Example: `%EVENT2` → `X25_EVENT2`.
- A field symbol `<FS>` becomes `X3C_FS`.
- The plan writes hex as UTF-8. SAP uses `SCP_TRANSLATE_CHARS`. Both are the same for ASCII; check non-ASCII names in P2.

## 7. What the plan does not model

- Border, fill and margin details of output options (only recorded as flags).
- The XHTML of each text.
- TSP08 page sizes.
- DDIC checks (see §4).
- The BAL log's exact wording: the plan's messages are the text symbols m01–m15 in English.
- P2 compares the plan with the real result: read the created form with `FP_CONTENT`, read the BAL log, and diff node by node (spec §4 P2).

## 8. Gaps → the gap list

The report's gap list has one row per node and loss: node path, kind, reason, manual action, logged (SAP message) or silent.
- Info rows (`infos`): a difference that changes nothing at runtime (an area SmartForms never prints either). They are not gaps.
- "Silently dropped" means SAP loses the node or part of it without a message. The plan names every such case.
- The P1 gate: every inventory node is either mapped or in the gap list.
- `sc4sap:sap-critic` reviews the gap list for SAP meaning (spec §10).
