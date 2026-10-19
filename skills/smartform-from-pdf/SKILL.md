---
name: smartform-from-pdf
description: Build a SmartForm from a PDF of the printed form (or a screenshot) — windows, ruled grids as templates, texts in the fonts of existing SmartStyles, then fields, interface and item tables decided with the user — upload it to the DEV system, print it there and score the print against the source page.
model: inherit
---

# SC4SAP PDF / Screenshot → SmartForm

Reads one page of a printed form and writes a SmartForm that prints the same page: the ruled areas become templates, every text sits where the source has it, in the closest font an existing SmartStyle offers. Then the texts that are data become `&fields&`, item lines become a table over an internal table, and the interface is added. The form is uploaded to the **DEV** system, printed there (no spool) and the print is compared with the source — the score and every difference are reported.

<Purpose>
Re-implementing a legacy or external form layout (a PDF from another system, a scan, a customer's template) by hand in the Form Builder takes days of measuring. This skill does the measuring and the layout; the consultant decides what is data.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>

<Team_Mode>**No teamMode integration.** Reading, planning and writing are scripted; the main thread decides fields and items.</Team_Mode>

<Use_When>
- "make a SmartForm from this PDF", "PDF → SmartForm", "rebuild this form layout", "이 PDF로 스마트폼 만들어", "스크린샷 보고 스마트폼 생성", "このPDFからスマートフォーム"
- A form layout exists only as a print (another system, a scan, a sample) and must become a SmartForm
</Use_When>

<Do_Not_Use_When>
- Changing an existing SmartForm in place — this skill creates a new form (a replace needs the user's explicit OK and an own Z/Y form)
- SAPscript (SE71) or Adobe forms (SFP)
- QA / production profiles — the upload is a repository write (DEV only; the MCP refuses elsewhere)
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Input | PDF (exact positions, fonts, rules); a screenshot / scan is transcribed by the main thread into the same layout JSON (positions estimated — say so) |
| Pages | One page per run (the first, or `--page N`) |
| Styles | **Existing SmartStyles only** — no style is created. Each text gets the closest paragraph (+ character format); sizes the styles lack are reported |
| Graphics | Not uploaded — an image area gets an empty framed window or an existing SE78 graphic the user names |
| Target | New form `Z*`/`Y*` (ask; default `Z<SOURCE>_COPY`), package `$TMP` unless the user gives a package + transport |
| Check | The generated form's own print (RenderSmartForm, invented sample values) compared with the source page — not Form Painter |
| Output | `<artifact-base>/smartforms/<FORM>/` — `layout.json`, `spec.json`, `shape.json`, `<FORM>.xml`, `<FORM>.printed.pdf`, `compare.json` |
</Decisions_Fixed>

<Prerequisites>
- MCP tools `CreateSmartForm` (SAP side: FM `ZMCP_SSF_UPLOAD` + dispatcher action `SSF_UPLOAD_XML`), `RenderSmartForm` (FM `ZMCP_SSF_RENDER`), `GetSmartFormContent`. An install error → stop and point to `abap/README.md`; never install SAP objects from this skill.
- A DEV profile (`sap-option`); the upload is refused on QA / PRD.
</Prerequisites>

<Workflow>
Paths: `<out>` = `<artifact-base>/smartforms/<FORM>`, scripts in `scripts/smartform/`.

**Step 1 — Target.** Source file and target form name from ARGUMENTS; ask once for what is missing (form name, package / transport if not `$TMP`, output language). Uppercase the name; refuse names not starting with Z or Y.

**Step 2 — Read the page.**
```
node scripts/smartform/read-pdf.mjs "<source.pdf>" --page 1 --out "<out>/layout.json"
```
Report: page size, text runs, rules, images. A **screenshot / scan**: read the image and write `layout.json` yourself in the same shape (`page.widthMm/heightMm`, `runs[]` with `x`, `y` (baseline), `w`, `text`, `pt`, `bold`, `font`; `lines[]`; `images[]`) — scale pixels to mm from the page size (A4 unless the user says otherwise) and say that positions are estimates.

**Step 3 — Style catalog.** The SmartStyles the form may use: `GetSmartFormContent(summary: true)` of 1–3 forms of the same kind the user names (their `styles` — paragraphs and character formats) → `<out>/styles.json` (array of the `styles` entries). Ask for reference forms when the user names none; a catalog from earlier runs under `<artifact-base>/smartforms/*/` may be reused.

**Step 4 — Plan the layout.**
```
node scripts/smartform/plan-form.mjs "<out>/layout.json" --styles "<out>/styles.json" --form <FORM> --out "<out>/spec.json"
```
The report (stderr) lists templates, windows, texts placed in cells and the font mapping (`HELVE 9B → ZSTYLE/AB+C1 (HELVE 9B)`); a mapping to another size or weight is a difference the print will show — tell the user, with the style that would be needed.

**Step 5 — Data (with the user).** Read `spec.json` and decide, then ask the user to confirm in one table:
- which texts are **values** (document numbers, dates, names, amounts — anything that changes per document) → `fields: [{ text, to: "&IS_HEADER-VBELN&" }]`; labels stay fixed texts;
- which grid rows are **item lines** (repeated rows with the same column cuts) → `items: [{ window, rows: [from, to], data: "IT_ITEMS", into: "GS_ITEM", cells: { "<col>": "&GS_ITEM-FIELD&" } }]` — the first item row becomes a one-row template in a loop over the table (fixed row height as in the source), the rows above / below stay templates, the window becomes MAIN;
- **numbers** (CURR / QUAN / DEC fields) print right-justified in their output length — in a cell the leading blanks wrap the value out of sight: give them `(C)` (`&GS_ITEM-NETWR(C)&`);
- the **interface**: one structure for the header values, one table for the items — existing DDIC types (`GetStructure` / `GetDataElement` to check); propose names, never invent a DDIC object; globals for work areas (`globals: [{ name: "GS_ITEM", type: "<line type>" }]`).
Write `<out>/shape.json`, then:
```
node scripts/smartform/shape-form.mjs "<out>/spec.json" "<out>/shape.json" --out "<out>/spec.json"
```

**Step 6 — Write and upload.**
```
node scripts/smartform/write-form.mjs "<out>/spec.json" --out "<out>/<FORM>.xml"
```
`CreateSmartForm(form_name, xml_file, package_name?, transport_request?)` — `active: false` with `errors` → fix the spec (the messages name the window / line type) and upload again with `overwrite: true` (own new form only).

**Step 7 — Print and compare.** `RenderSmartForm(form_name, values)` with invented sample values (the fixed texts of the source for a layout-only form: no values) → copy the PDF to `<out>/<FORM>.printed.pdf`, then
```
node scripts/smartform/compare-layout.mjs "<out>/layout.json" "<out>/<FORM>.printed.pdf" --out "<out>/compare.json"
```
Report the score and the differences (moved texts, other font sizes, missing / extra rules). A layout-only form (before Step 5) should reach 95+; fields and tables change the texts, so compare the layout-only form first when the user wants proof of the layout.
</Workflow>

<Data_Rules>
The source page may carry real business data — it is read locally and never printed into the form: every value the user marks becomes a field. Sample values for the check print are invented (see `/sc4sap:smartform-preview` Data_Rules); do not read documents with `GetTableContents` / `GetSqlQuery` to fill them.
</Data_Rules>

<Output_Format>
```
SmartForm ZSD_INVOICE_NEW created on DEV (package $TMP, active, FM /1BCDWB/SF00000123)
Source: invoice.pdf page 1 (A4 portrait) · 104 texts · 22 rules · 1 image
Layout: 3 templates, 41 windows · fonts: 7 mapped exactly, 1 to another size (COURIER 11 → 12, no style has 11)
Data: 18 fields (IS_HEADER: ZSDS_INV_HEAD), item table IT_ITEMS (ZSDT_INV_ITEM) rows 5–9
Print vs source: 98.3 (texts 104/104, rules 21/22)
Files: .sc4sap/work/DEV/smartforms/ZSD_INVOICE_NEW/
```
Reply in the user's language.
</Output_Format>

<Limits>
- One page; further pages, page breaks and NEXTPAGE flows are not generated.
- No new SmartStyles, no SE78 uploads — font sizes and logos the system lacks stay approximate / empty.
- An item text longer than its cell is cut off (the item row keeps the source's fixed height).
- Screenshots: positions and sizes are estimates (no exact fonts).
</Limits>

<MCP_Tools_Used>
- `CreateSmartForm`, `RenderSmartForm`, `GetSmartFormContent` (styles of reference forms)
- `GetStructure`, `GetDataElement`, `GetTable` (interface types)
- `DeleteSmartForm` (only for the skill's own test forms, on request)
</MCP_Tools_Used>

<Files>
- `scripts/smartform/read-pdf.mjs` — PDF page → layout
- `scripts/smartform/plan-form.mjs` — layout + styles → form spec
- `scripts/smartform/shape-form.mjs` — fields, item tables, interface into the spec
- `scripts/smartform/write-form.mjs` — spec → Form Builder XML
- `scripts/smartform/compare-layout.mjs` — print vs source score
</Files>

<Related_Skills>
- `/sc4sap:smartform-preview` — expected print of an existing form (the reverse direction)
</Related_Skills>

Task: $ARGUMENTS
