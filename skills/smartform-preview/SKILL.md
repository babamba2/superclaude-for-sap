---
name: smartform-preview
description: Draw the expected print of a SmartForm as a JPG (plus the HTML it is drawn from) — windows at their real mm positions, SmartStyle fonts, template / table grids with borders and shading, SE78 graphics such as logos and signatures, loops with sample rows — with invented sample values in place of the &fields&, sized to the real field types. Reports the cells and windows whose content gets cut off.
model: inherit
---

# SC4SAP SmartForm → Print Preview

Reads one SmartForm from the connected system and draws what a printed page will look like, without running the print program: **one JPG and one HTML page** (A4 in mm). Field symbols (`&HEADER-NAME1&`) are filled with invented sample values that fit the field types read from the DDIC, so the picture shows realistic widths — and the places where the form cuts text off.

<Purpose>
Consultants and key users need to see a form before test data exists, to review a layout change, or to attach "expected output" to a spec. SMARTFORMS test output needs a driver program and real documents; this skill only needs the form itself.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>

<Team_Mode>**No teamMode integration.** Reading and drawing are scripted; the main thread writes the sample values.</Team_Mode>

<Use_When>
- "SmartForm preview", "what does this form print", "expected output of ZXX_FORM", "스마트폼 미리보기", "출력물 예상 이미지", "スマートフォームのプレビュー"
- A spec or test case needs a picture of the form output
- Before / after a layout change of a form
</Use_When>

<Do_Not_Use_When>
- The user wants to **change** the form — this skill is read-only; SmartForm editing is not supported
- SAPscript forms (SE71) or Adobe forms (SFP) — only SmartForms
- The user wants the output with **real document data** — refuse (see Data_Rules) and offer invented values
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Source | MCP `GetSmartFormContent` (active version, logon language) → `<form>.content.json` in the MCP output directory |
| Values | Invented by the main thread from the field types (`GetStructure` / `GetDataElement` / `GetTable`), never read from documents |
| Loops / tables | 3 sample rows unless the user asks for more; a row count that overflows MAIN shows where the page would break |
| Pages | First page; `firstPage` / `lastPage` windows all shown (one-page document) |
| Cut-off text | Drawn cut off, as SAP prints it (cell clips, no wrap); listed in the report |
| Borders / shading | As stored in the form — gaps in borders are real |
| Output | `<artifact-base>/smartforms/<FORM>/<FORM>-preview.{jpg,html}` + `values.json` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)) |
</Decisions_Fixed>

<Prerequisites>
- MCP tool `GetSmartFormContent` and, on the SAP side, FM `ZMCP_SSF_CONTENT` with dispatcher action `SSF_CONTENT`. An "install" error from the tool → stop and point to `/sc4sap:setup` (DEV-only helpers); never install SAP objects from this skill.
- Chrome, Edge or Chromium for the JPG (`SC4SAP_CHROME` overrides the path). Without a browser the HTML is still written.
</Prerequisites>

<Workflow>
Paths: `<base>` = artifact base, `<out>` = `<base>/smartforms/<FORM>`, `<content>` = the `files.content` path the tool returns.

**Step 1 — Target.** Form name from ARGUMENTS; if missing ask once. Uppercase it.

**Step 2 — Read the form.** `GetSmartFormContent(form_name, summary: true)` — the summary lists windows, data declarations, `symbols`, graphics, styles and `files.content` (the full result on disk). Read only the summary; never load the content file into the conversation.
- `graphics[].error` or `dynamicReferences` (keys set at print time) → the drawing shows a box there; say so in the result.
- If `<out>/values.json` exists from an earlier run, offer to reuse it (Recommended) or write new values.

**Step 3 — Where each symbol prints.**
```
node scripts/smartform/build-preview.mjs symbols "<content>"
```
→ per symbol: its declaration (`HEADER` → type `ZXX_S_HEAD`), every place it prints (window, paragraph, font pt, cell width mm, in a loop or not).

**Step 4 — Field types.** For every declaration type behind a symbol: `GetStructure` (structures, table lines), `GetDataElement` (single fields such as `CHAR100`, `STCEG`); `GetTable` when the type is a table. Parallel calls. Keep per field: data type, length, decimals, description.

**Step 5 — Sample values** → write `<out>/values.json` with the `Write` tool:
```json
{ "form": "ZXX_FORM", "defaultParagraph": "AA", "rows": 3,
  "values": { "HEADER-NAME1": "Northwind Trading Co., Ltd.",
              "GS_ITEM-MATNR": ["100234", "100235", "100512"] } }
```
- Write values **as printed**: dates and numbers in the user's format (country file / `config.json` → `country`; KR / US style `1,250.000`, DE style `1.250,000`), currency amounts with their decimals, units as their external code.
- Numbers (CURR / QUAN / DEC / INT / P) print **right-justified in their output length** — pad with leading blanks (QUAN 13,3 → 17 characters: `"           12.500"`) unless the symbol has a length or `(C)` option. Signed fields (CURR, signed DEC) end with the sign position: a blank when positive (`"       1,234.56 "`), `-` when negative. In a narrow cell the blanks wrap the number onto a second line that a fixed-height row cuts off — SAP prints the cell empty, and so must the preview.
- A variable the form's code sets differently in one place (a footer total in a loop's last event) takes a value for that text node only: `"L_WRBTR@%TEXT59": "99,999.96"` wins over `"L_WRBTR": [...]`.
- A dynamic text node (text type D, `REF_NAME &GV_TEXT&`) prints a text table: give its lines, `"GV_TEXT": ["First line", {"TDFORMAT": "", "TDLINE": "continued"}]` (a string = a `*` line; a blank `TDFORMAT` continues the paragraph). One text per loop row = an array of such arrays.
- Realistic lengths: names and texts typically 50–90 % of the field length; keys at their usual length (`4500001234`, `0010004567`). A symbol inside a loop or table gets an array, one value per row; totals add up.
- Values hang together: same buyer in buyer and ship-to when the form implies it, item amounts = quantity × price, a total that matches.
- `defaultParagraph`: the paragraph for lines formatted `*` (the style's standard paragraph is not in the content). Take the paragraph of the neighbouring label of the same kind (e.g. the title cell next to it); say which one in the result. Keep the choice in `values.json` for later runs.
- System symbols (`SFSY-PAGE`, `SFSY-FORMPAGES`) default to 1; set them only for a different picture.

**Step 6 — Build.**
```
node scripts/smartform/build-preview.mjs build "<content>" --values "<out>/values.json" --out-dir "<out>" [--rows N] [--mark]
```
`--mark` tints the sample values yellow (for review); unfilled symbols always show as blue `&NAME&` placeholders. The JSON report lists `filled`, `unfilled`, `overflow` (cells / windows whose content does not fit), `approximations` and the `defaultParagraph` used.

**Step 7 — Check and show.** `Read` the JPG and look at it before answering: overlapping windows, empty windows, missing graphics, symbols left blue. Fix `values.json` and rebuild for value problems; report layout findings — never "fix" the form's layout in the drawing.
</Workflow>

<Data_Rules>
Only the form definition, styles, graphics and DDIC metadata are read. **Sample values are invented** — never business data, never real customer, vendor or company names, never real tax numbers or addresses of real parties. Do not call `GetTableContents` / `GetSqlQuery` to fill the form; a request for "the real output of document X" is refused: say the preview uses invented values and the real output comes from the print program (e.g. the output type's processing program or SMARTFORMS test).
</Data_Rules>

<Output_Format>
```
SmartForm preview: ZXX_FORM  (page %PAGE1, A4 portrait)
Windows: 7 · Graphics: 2 (logo, signature) · Symbols: 30 filled, 0 left blank · Sample rows: 3
Cut off as printed (4): "Purchase Order No." (%TEXT24), "(Unit)" (%TEXT45, %TEXT50), …
Window overflow: %WINDOW4 — graphic 27.2 mm in a 25 mm window
Standard paragraph: AA assumed for '*' lines
JPG:  .sc4sap/work/DEV/smartforms/ZXX_FORM/ZXX_FORM-preview.jpg
HTML: .sc4sap/work/DEV/smartforms/ZXX_FORM/ZXX_FORM-preview.html
Values: .sc4sap/work/DEV/smartforms/ZXX_FORM/values.json

Next: "10 rows", "other values", "mark the sample values", "show the second page"
```
Reply in the user's language; show the JPG to the user when the client can display images.
</Output_Format>

<Limits>
- One page is drawn (the first). Further pages, page breaks after MAIN overflows, and `NEXTPAGE` flows are listed, not drawn.
- Field conditions (`condition` other than first / last page) and alternatives: the node is shown / the first branch is drawn; listed under `approximations`.
- Text commands: `/*` comment lines are not printed; `/: IF … ELSE … ENDIF` is decided from the sample values (`&X& = 'v'`, `<>`), otherwise the first branch is drawn; other `/:` commands are skipped (listed). A SmartStyle a node names but the system lacks is replaced by the style its parents pass down (listed).
- Address nodes and include texts with a key set at print time are drawn as labelled boxes.
- Text in a template / table cell is clipped on one line; SAP's own wrapping inside a cell is not imitated. Window text wraps at the window width.
- Page formats other than A4 are drawn as A4 (listed).
</Limits>

<MCP_Tools_Used>
- `GetSmartFormContent` (`summary: true`)
- `GetStructure`, `GetDataElement`, `GetTable`, `GetDomain` (field types only)
</MCP_Tools_Used>

<Files>
- `scripts/smartform/build-preview.mjs` — `symbols` (where each symbol prints) and `build` (HTML + JPG + report)
</Files>

<Related_Skills>
- `/sc4sap:program-to-spec` — the print program's specification (attach the preview as expected output)
- `/sc4sap:program-to-manual` — user manual of the print program
</Related_Skills>

Task: $ARGUMENTS
