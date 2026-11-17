---
name: adobe-preview
description: Draw the expected print of an Adobe form (SFP, S/4HANA) as HTML pages in mm (plus JPG / PDF with a local browser) — the XFA layout with its master pages, flowed tables with repeated headers, page breaks, captions, pictures (dates, numbers, currency shifts), rich text with embedded fields, rounded boxes and images — filled with invented sample values sized to the interface's DDIC types. On a development system it can print SAP's example forms through ADS and score the preview against SAP's own PDF.
model: inherit
---

# SC4SAP Adobe Form → Print Preview

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): blocked — reply with the stop line there and stop.

Reads one Adobe form (transaction SFP) from the connected system and draws what its printed pages will look like, without a print program: **one HTML file with every page as an A4 SVG in mm**, a model JSON (every text with its SOM path and binding) and, with Chrome / Edge, a PDF and a JPG. Interface parameters are filled with invented values that fit their DDIC types, converted the way the generated function module hands them to ADS (NUMC padding, packed decimals, currency shifts, ISO languages).

<Purpose>
Consultants need to see an Adobe form before test documents exist, to review a layout change, or to attach expected output to a spec. Testing in SFP needs a driver and real data; this skill only needs the form.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>
<Target_Object>The target object is looked up on the active profile's system only. Not found → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system — never substitute a similar name, never switch profiles on your own.</Target_Object>

<Team_Mode>**No teamMode integration.** Reading and drawing are scripted; the main thread writes the sample values.</Team_Mode>

<Use_When>
- "Adobe form preview", "what does this SFP form print", "expected output of ZXX_ADOBE_FORM", "어도비 폼 미리보기", "Adobe フォームのプレビュー"
- A spec or test case needs a picture of an Adobe form's output
- Before / after a layout change of an Adobe form
</Use_When>

<Do_Not_Use_When>
- SmartForms → `/sc4sap:smartform-preview`; SAPscript (SE71) is not supported
- Changing the form, converting a SmartForm (→ `/sc4sap:smartform-to-adobe`), building a form from a PDF (→ `/sc4sap:adobe-from-pdf`)
- The user wants the output with **real document data** — refuse (see Data_Rules) and offer invented values
- ECC systems: Adobe form content is read through the S/4 helper only (`ZMCP_FP_CONTENT`)
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Source | MCP `GetAdobeFormContent` (active version, logon language): `<form>.form.xml` (context), `<interface>.interface.xml`, `<form>.layout.xdp` in the MCP output directory |
| Values | Invented by the main thread from the DDIC types, never read from documents |
| Layout rules | XFA subset and measured ADS rules in [`layout-subset.md`](layout-subset.md); anything outside is listed under `approximations` |
| Scripts | FormCalc subset and page-number JavaScript run; other scripts are listed, not run |
| Pages | All pages; master page content (headers, page numbers) on every page |
| Output | `<artifact-base>/adobe/<FORM>/<FORM>-preview.{html,model.json,pdf,jpg}` + `values.json` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)) |
</Decisions_Fixed>

<Prerequisites>
- MCP tool `GetAdobeFormContent` and, on the SAP side, FM `ZMCP_FP_CONTENT` with dispatcher action `FP_CONTENT` (S/4, DEV-only install). An "install" error → stop and point to `/sc4sap:setup`; never install SAP objects from this skill.
- Chrome, Edge or Chromium for PDF / JPG (`SC4SAP_CHROME` overrides the path). Without a browser the HTML is still written.
</Prerequisites>

<Workflow>
Paths: `<base>` = artifact base, `<out>` = `<base>/adobe/<FORM>`, `<dir>` = the folder of the files `GetAdobeFormContent` returns.

**Step 1 — Target.** Form name from ARGUMENTS; if missing ask once. Uppercase it.

**Step 2 — Read the form.** `GetAdobeFormContent(form_name)` → header (interface, layout type), summary (page areas, subforms, fields, draws, bindings, scripts) and `files`. Never load the XML / XDP files into the conversation.
- `layoutType` blank or a fragment / output-management template (SFTE / SFLO) → say "not supported" and stop.

**Step 3 — What prints.**
```
node scripts/adobe/build-adobe-preview.mjs fields "<dir>"
```
→ every printed context leaf: path (`BOOKINGS.DATA.FLDATE`), source field (`BOOKINGS-FLDATE`), inside a loop or not, text modules.

**Step 4 — Field types.** For every interface parameter and global (`readInterface`): `GetStructure` (DDL: `abap.char(20)` inline or a data element per field), `GetDataElement` for data-element fields, `GetTypeInfo` for a table type's row type. Built-in parameter types (`C`, `N`, `P`, `D`, `T`, `I`, `STRING`) need no read. Keep `{ type, length, decimals }` per field, keyed like the context field: `"BOOKINGS-FORCURAM": { "type": "CURR", "length": 15, "decimals": 2 }`. `scripts/adobe/read-adobe-sap.mjs` `readFormDdic` does the same for the web.

**Step 5 — Text modules** (context nodes of kind text-module): their lines from `GetSqlQuery` on `STXFTXT` (`formname IN (…) AND spras = '<logon language>'` — Smart Forms repository text, not business data) and the paragraph formats of their SmartStyle from `STXSPARA` (style name: ask, or from the text module where known). Without them the node prints empty and is listed in `missingTexts`.

**Step 6 — Sample values** → write `<out>/values.json` with the `Write` tool:
```json
{ "form": "ZXX_FORM", "locale": "en_US",
  "values": { "CUSTOMER": { "ID": "00004711", "NAME": "Example Travel Agency" },
              "BOOKINGS": [ { "CARRID": "LH", "FLDATE": "2026-03-01", "FORCURAM": 830.5, "FORCURKEY": "EUR" } ] },
  "globals": { "T_SUMS": [ { "FORCURAM": 830.5, "FORCURKEY": "EUR" } ] },
  "system": { "SFPSY-DATE": "2026-03-01" },
  "ddic": { "BOOKINGS-FORCURAM": { "type": "CURR", "length": 15, "decimals": 2 } },
  "texts": { "ZXX_FOOTER": { "itf": [ { "f": "FT", "t": "…" } ], "formats": { "FT": { "pt": 6, "align": "center" } } } } }
```
- Values in **internal format**: dates `YYYY-MM-DD`, times `HH:MM:SS`, numbers as JSON numbers, amounts in the currency's own unit — the script converts them as SAP does (JPY shifts, NUMC padding, LANG → ISO, CHAR cut at its length).
- Respect DDIC lengths (names 50–90 % of the length); a table parameter is an array, one object per row.
- Globals the interface's initialization code fills (totals, texts) are written by the main thread from the sample values — the preview does not run ABAP. Totals must add up.
- Never real customer, vendor or company names, tax numbers or addresses.

**Step 7 — Build.**
```
node scripts/adobe/build-adobe-preview.mjs build "<dir>" --values "<out>/values.json" --out-dir "<out>" --pdf --jpg [--inspect]
```
Report JSON: `pages`, `missingTexts`, `approximations` (scripts not run, unsupported elements), `unbound` (bindings without data), `overflow`, `system` + `notes` (the date used is your input — SAP prints its server date).

**Step 8 — Check and show.** `Read` the JPG before answering: empty areas, overlapping boxes, missing images, values cut off. Fix `values.json` and rebuild for value problems; report layout findings — never "fix" the form in the drawing.

**Step 9 — SAP comparison (optional, DEV only, SAP example forms).** `RenderAdobeForm(form_name, values_file)` prints through ADS (no spool) — the helper accepts only SAP's example forms of package SFPT and refuses customer forms. Then:
```
node scripts/adobe/score-forms.mjs "<sap.pdf>" "<out>/<FORM>-preview.pdf" --model "<out>/<FORM>-preview.model.json" --profile A
```
Show the metric vector (P1mm, P2mm, FIELD, FIXED, PAGES, ROWBRK, WRAP, FONT, RULE, IMG, EXTRA), `maxError` / `meanError`, the `excluded` lines (SAP used a fallback font — not measurable) and the top failures — never a single score. Give the SAP render the same `system` date as the preview. The thresholds are in [`../../common/adobe-forms-verification.md`](../../common/adobe-forms-verification.md).
</Workflow>

<Data_Rules>
Only the form definition, interface, layout, DDIC metadata and Smart Forms text modules are read. **Sample values are invented** — never business data. No `GetTableContents` / `GetSqlQuery` on business tables; the only SQL reads are `STXFTXT` / `STXSPARA` (form texts and styles). A request for "the real output of document X" is refused: say the preview uses invented values and the real output comes from the application's output control.
</Data_Rules>

<Output_Format>
```
Adobe form preview: ZXX_FORM  (interface ZXX_IF, XFA 2.4, 2 pages, A4 portrait)
Fields filled: 54 · Text modules: 2 · Sample rows: 12 (page break after row 9, header repeated)
Approximations: JavaScript on GRAPHIC_3 not run
HTML: .sc4sap/work/DEV/adobe/ZXX_FORM/ZXX_FORM-preview.html
PDF / JPG: …-preview.pdf / …-preview.jpg
Values: .sc4sap/work/DEV/adobe/ZXX_FORM/values.json

Next: "more rows", "other values", "show page 2", "compare with SAP (example forms only)"
```
Reply in the user's language; show the JPG when the client can display images.
</Output_Format>

<Limits>
See [`layout-subset.md`](layout-subset.md) § Not supported. Fonts other than Arial / Helvetica / Courier / Times print in the browser's substitute; ADS's own fallback font for characters outside its encoding (e.g. `€` in Helvetica) is not imitated.
</Limits>

<MCP_Tools_Used>
- `GetAdobeFormContent`, `RenderAdobeForm` (Step 9 only, DEV, SAP example forms)
- `GetStructure`, `GetDataElement`, `GetTypeInfo` (field types), `GetSqlQuery` (`STXFTXT`, `STXSPARA` only)
</MCP_Tools_Used>

<Files>
- `scripts/adobe/read-adobe.mjs` — form / interface / XDP readers; `adobe-data.mjs` — context → data XML values; `adobe-layout.mjs` — XFA layout in mm; `formcalc.mjs` — script subset; `picture.mjs` — picture clauses
- `scripts/adobe/build-adobe-preview.mjs` — `fields`, `build`; `score-forms.mjs` — layout score v2; `read-adobe-sap.mjs` — the SAP reads for the web
</Files>

<Related_Skills>
- `/sc4sap:smartform-preview` — the same for SmartForms
- `/sc4sap:smartform-to-adobe` — conversion plan of a SmartForm into an Adobe form
</Related_Skills>

Task: $ARGUMENTS
