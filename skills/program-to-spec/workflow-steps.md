# Program → Spec — Workflow Steps

Referenced by `SKILL.md`. Follow these 6 steps (Step 0 through Step 5) whenever the skill runs.

**Step 0 — Socratic interview** (see `Socratic_Scope_Narrowing` section in `SKILL.md`)
Default opener: issue ONE bundled `AskUserQuestion` call with the four standard questions — **Audience / Format / Depth / Language** — in that exact order, each single-select with the "(Recommended)" option first. This is MANDATORY whenever the target object is already present in `ARGUMENTS`; it replaces Rounds 2+3+5 in a single UI turn.
Fall back to per-round questioning only when (a) the object is missing/ambiguous (run Round 1 first) or (b) the user picks L3/L4 in the bundle (run Round 4 scope-trimming after).
Never skip entirely unless the user supplies `object=... depth=L2 format=md lang=ko` style fully-qualified arguments.

**Step 1 — Inventory** (auto, parallel MCP calls)
- `SearchObject` — confirm object + sub-type
- Metadata: `GetObjectInfo` — package, author, created/changed, transport

**Step 1.5 — CBO inventory lookup** (auto)
- Resolve `<PACKAGE>` from `GetObjectInfo` above.
- Ask the user one question: "Which module does package `<PACKAGE>` belong to? (SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba)" — only if the module cannot be derived from `.sc4sap/config.json` or the package's existing CBO folder.
- Check `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.
  - **Exists** → Load it. When the analyst describes data sources, tables, or helper calls in Step 3, annotate each one that matches an inventory entry with its CBO role + one-line business purpose (e.g., "writes to `ZSD_ORDER_LOG` — append-only sales-order processing log"). This turns opaque Z-references in the spec into named reusable assets.
  - **Missing** → Print one line: "No CBO inventory at `.sc4sap/cbo/<MODULE>/<PACKAGE>/`. Run `/sc4sap:analyze-cbo-obj` first for richer spec annotations, or type `skip` to proceed."
- Persist the loaded entries to `.sc4sap/specs/<OBJECT>/cbo-context.md` so sap-analyst and sap-writer consume it in Step 3.
- Source:
  - Report/Program: `GetProgFullCode` + `GetIncludesList` → iterate `GetInclude`
  - Class: `ReadClass` (all sections) + `GetLocalDefinitions` / `GetLocalMacros` / `GetLocalTestClass` / `GetLocalTypes`
  - Function Module: `ReadFunctionModule` + function group includes
  - CDS: `ReadView` + `GetMetadataExtension`
  - RAP: `Read BehaviorDefinition` + `Read BehaviorImplementation` + `Read ServiceDefinition` + `Read ServiceBinding`
- Screens / GUI Status / Text Elements (if report / module pool): `GetScreensList`, `GetGuiStatusList`, `GetTextElement`
- Structural: `GetAbapAST`, `GetAbapSemanticAnalysis`
- Impact (only if L3/L4 + user opted in): `GetWhereUsed`, `GetEnhancements`, `GetEnhancementSpot`

**Step 2 — Classify** (auto)
- Object archetype: ALV report / batch job / BDC / FM wrapper / CDS view / RAP BO / enhancement impl / utility class
- Drives which spec template is applied in Step 3.

**Step 3 — Delegate to sap-analyst + sap-writer** (+ sap-critic on L4)

Emit Phase Banner before each dispatch (see `SKILL.md` § Phase_Banner):

```
▶ phase=3.analyst · agent=sap-analyst · model=Opus 4.7
▶ phase=3.writer · agent=sap-writer · model=<Haiku 4.5 for L1/L2 | Sonnet 4.6 override for L3/L4>
▶ phase=3.critic (L4 only) · agent=sap-critic · model=Opus 4.7
```

- **sap-analyst** (Opus 4.7, frontmatter) extracts: business purpose, inputs (selection screen / importing params), outputs (ALV cols / exporting params / OData entity), data sources (tables + CDS + BAPIs), main logic narrative, error cases, authorization checks (`AUTHORITY-CHECK` statements). When `cbo-context.md` exists, the analyst cross-references every Z-object mentioned against the inventory and replaces opaque "Z-table" / "Z-class" labels with the inventory's documented role + business purpose.
- **sap-writer** (Haiku 4.5 base; **`model: "sonnet"` override for L3/L4 depth** — longer narrative + deeper cross-reference + stronger consistency requirement) renders into the chosen format (MD or Excel) at the chosen depth + language.
- **sap-critic** (Opus 4.7, frontmatter) gate (only if L4): verifies every claim cross-references a line range.

**Step 3.5 — Draw screens (MANDATORY when screens exist)**

Every Selection-Screen and every output Screen (Dynpro) / ALV must be rendered as a **visual wireframe**, not just described in prose. Use this tiered approach:

1. **ASCII wireframe** — **Markdown output only**. Works inside fenced code blocks where character widths are guaranteed uniform. **Never** put ASCII box-drawing characters (`┌─┐│└┘├┤┬┴┼`) into Excel cells — Excel column widths don't match character widths, so vertical lines misalign and the mock breaks visually. For Excel use real cell borders instead (see the Excel render pipeline in Step 4).
   - Reconstruct layout from `GetScreen` / `ReadScreen` (`HEADER` + `FLOW_LOGIC` + field positions `LINE` / `COLUMN` / `LENGTH` / `HEIGHT`) for Dynpros.
   - Reconstruct Selection-Screen from `PARAMETERS` / `SELECT-OPTIONS` / `SELECTION-SCREEN BLOCK` statements in the source.
   - Reconstruct ALV output from the field catalog (columns + widths + headings).
   - Show label + input box + F4-help marker `[▼]` + mandatory `*`.
2. **Embedded PNG mockup (v8.1 PRIMARY PATH for xlsx — all languages, L1~L4)** — **xlsx output**. Selection Screen and ALV layout are rendered as SVG → PNG **in parallel** (Promise.all → two concurrent headless-browser spawns) via `scripts/spec/screen-image-renderer.mjs` and embedded through `build({ images })` in `rich-xlsx-template.mjs`. **Drivers do not call the renderer directly** — they only populate `SELECTION_IMAGE_SPEC` / `ALV_IMAGE_SPEC` / `SHEET_TITLE` constants; the template's `buildImages()` helper + top-level `await` does the rest. `alv.maxRows` is **3 (absolute max 5)**. When rasterization returns null (no headless Edge/Chrome) or times out (30s cap), `screensSheet()` auto-draws cell-border wireframes from the same specs via `renderSelectionWireframe` / `renderAlvWireframe` — never silently omit the screens.
3. **Mermaid diagram** (MD output only, when flow matters):
   - `flowchart TD` for screen-to-screen navigation (CALL SCREEN / LEAVE TO / SET SCREEN).
   - `classDiagram` for GUI Status menubar/toolbar/function-key mapping.
   - In Excel, the same flow is drawn as style-21 bordered-box cells connected by plain-text arrows.
4. **Classical Dynpro** → include header line (short description, next-screen, cursor-pos) + flow-logic pseudo-code (`PBO` / `PAI` modules).
5. **GUI Status** → render menubar / application toolbar / function keys as a short table (FKEY → FCODE → text) plus (in MD) an ASCII toolbar bar.

Artifacts produced in this step are placed in the `Inputs & Screens` section (MD §8) or `Inputs & Screens` sheet (Excel). The **Parameters table (§8.1) is always rendered** — for objects without UI (pure class, FM, CDS, RAP without screens), skip only the wireframe tiers (§8.2–§8.4) and keep the Parameters table.

**Step 4 — Render**
- **Markdown**: single `.md` with H2 sections per spec dimension, tables for selection-screen / tables / methods / exits.
- **Excel (MANDATORY workflow — standalone rich driver, throwaway)**:

  > **Why a throwaway driver?** The minimal `scripts/spec/build-xlsx.mjs` writer only emits plain text cells — it cannot draw Dynpro frames with real borders, merged cells, or fixed column widths. Without those, Selection-Screen wireframes rendered as ASCII art inside Excel cells break visually (column widths ≠ character widths, vertical lines misalign). So for every Excel spec we generate a **per-spec standalone driver** at a temp path, run it once, then delete it. The driver carries its own rich writer (styles.xml / borders / merges / col widths) plus the spec-specific content inline — nothing to import, nothing to configure, nothing shared between specs.

  Pipeline for each Excel-output spec:

  1. **Copy the template** `scripts/spec/rich-xlsx-template.mjs` to a per-spec driver path:
     - Default: `.sc4sap/specs/_drivers/{OBJECT}-{YYYYMMDD}.mjs`
     - If the user specified an absolute output directory (e.g. `C:\Users\...\Desktop\test`), put the driver next to the target xlsx — it makes cleanup obvious and avoids cluttering the project.
  2. **Fill the TODO blocks** inside the copy, using the content produced by sap-analyst + sap-writer in Step 3:
     - `SHEETS_DATA` — array of `{ name, rows: [[header...], [row...], ...] }` for text sheets (Overview, Data Model, Logic, Outputs, Authorization, Exceptions, plus L3+ sheets — Enhancements / Where-Used / Includes & Artifacts / Risk & PII). The Parameters table lives inside the `Inputs & Screens` sheet and is produced by `screensSheet()` (see below), not as an independent text sheet.
     - `SCREEN_PARAMS` — Parameters table rows (field / type / required / default / description). Always populated even when the object has no selection screen (pure FM / Class / CDS / RAP).
     - `SELECTION_IMAGE_SPEC` (new in v8.1) — selection-screen field list. Drives BOTH the PNG image path AND the cell-border wireframe fallback. Leave `null` for objects without a selection screen. Shape: `{ blockLabel, fields: [{ required?, label, name, range?, note? }], optionBlockLabel?, optionFields?: [{ label, name, note? }] }`. NOTE (v8.3): `defaultLow` / `defaultHigh` are silently ignored inside the input-box graphic — the field name already labels the box, and stuffing "BOM" / "1000" / "오늘" inside just adds visual noise. Put any default value either in the `note` field (rendered to the right of the row) or in the Parameters table below. The label column also auto-widens to fit the longest label, so long English names like `Distribution Channel (S_VTWEG)` no longer collide with the input box.
     - `ALV_IMAGE_SPEC` (new in v8.1) — ALV layout spec. Same dual-purpose (image + wireframe). Leave `null` for non-ALV outputs. Shape: `{ columns: [{ name, header?, width?, align?, hotspot?, editable? }], sampleRows: [{ [colName]: value, _status?, _locked? }], maxRows?: 3 }`. maxRows capped at 5, default 3. NOTE (v8.3): the ALV legend under the table is **auto-derived from the actual spec** — Hotspot line only if any column has `hotspot: true`, Editable line only if any column has `editable: true`, traffic-light line only if a `_status` column exists (or any sampleRow sets `_status`). Do NOT describe features the program does not have; the renderer omits inapplicable legend items automatically.
     - `SHEET_TITLE` (new in v8.1) — localised row-1 title of `Inputs & Screens` sheet (e.g. `'입력 및 화면 · ZMM_0001'` for KO, `'入力と画面 · ZMM_0001'` for JA).
     - `INPUTS_SHEET_NAME` — localised workbook tab name (e.g. `'입력 및 화면'` for KO). Must stay ≤ 31 chars (xlsx limit).
     - `SPEC_LANG` (new in v8.3) — output language for the auto-derived legends inside the PNG mockups. One of `'ko' | 'en' | 'ja'`; defaults to `'ko'`. An English-language spec MUST set `'en'` or the bottom legends will render as `필수 입력 · ▼ 복수 선택 · ~ 범위(LOW~HIGH)` even though the surrounding prose is English.
     - `WARNINGS` (new in v8.3) — array of program-specific yellow caveat rows (style 20, merged A:Q, pinned to the BOTTOM of the `Inputs & Screens` sheet). These are **not** boilerplate — fill with the analyst's actual findings, one caveat per string, prefixed with `⚠`. Leave `[]` for a clean spec. Categories to consider: Authorization gaps, Runtime / data-volume risk, Dependency coupling (called TCodes, BAPIs), PII exposure, Error-path gaps (missing CATCH). Empty array = no yellow rows rendered.
     - **Automatic image pipeline** — drivers do NOT manually import `renderScreenImages` and do NOT edit the `build()` call. The template's internal `buildImages()` + top-level `await` runs automatically: (a) renders Selection + ALV PNGs **in parallel** via headless browser, (b) falls back to `screensSheet()` cell-border wireframes per section when rasterize returns null or times out. No driver action needed beyond populating the two SPEC constants.
     - **Never** place ASCII box-drawing characters (`┌─┐│└┘├┤┬┴┼`) inside data cells.
     - `OUT_PATH` — absolute path the user asked for (or the default `.sc4sap/specs/{object}-{YYYYMMDD}-{lang}.xlsx`).
  3. **Run the driver**:
     ```bash
     node <driver>.mjs
     ```
     The driver writes the xlsx and auto-opens it in the OS default handler (Excel / LibreOffice) — the built-in `openInDefault()` spawns `cmd.exe /c start "" <path>` on Windows, `open` on macOS, `xdg-open` on Linux, detached + `unref()`'d so Claude Code doesn't block.
  4. **Verify the artifact** — `ls` the output path; confirm file size > 0 and that the file is a valid zip (`unzip -l` should list `[Content_Types].xml`, `xl/styles.xml`, `xl/worksheets/sheet*.xml`).
  4b. **No-truncation QA (MANDATORY)** — every cell's content must be fully visible in Excel at default zoom. Before deleting the driver:
     - **Text sheets** — `textSheet()` already auto-measures with the v4 CJK-aware metric (`WIDTH_PADDING=6`, `WIDTH_MAX=100`, `WRAP_THRESHOLD=55`, `LINE_HEIGHT_PT=17`). Never tighten these. If a reviewer reports truncation, RAISE them.
     - **`Inputs & Screens` sheet (`screensSheet()`)** — enforce the column-vs-content inequality for every non-merged cell and every merged block:
         `visualWidth(text) + 2 ≤ (c1 - c0 + 1) × colWidth`
       (v4 baseline: `colWidth = 14` for B..P.) For each cell you place with style `0 / 21 / 4 / 5 / 20` etc., check the rule. If a cell fails the inequality, EITHER merge it across more columns, OR shorten the label (e.g. `→` instead of `→ POST_GR` in arrow cells). Toolbar/button labels MUST live in ≥ 3-col merges.
     - Spot-check by opening the xlsx and visually scanning every sheet; fix and re-run the driver if any cell is clipped.
  5. **Delete the driver** — the xlsx is the deliverable; the driver is scaffolding. Remove it with the Bash tool so the output directory stays clean.
     ```bash
     rm <driver>.mjs
     ```
     If verification in step 4 fails, keep the driver for debugging and tell the user the path.

  **Zero external npm dependencies** — the template uses only `node:zlib` + `node:fs` + `node:child_process` + `node:os`. This exists because some SAP customer networks block `registry.npmjs.org`, so the plugin must work fully offline after `git clone`.

  Sheet order (MANDATORY — the template's `build()` forces `Inputs & Screens` to position 3; don't reorder in drivers):
  1. `Overview` — metadata, purpose, archetype
  2. `Data Model` — tables / CDS / structures accessed (R/W)
  3. **`Inputs & Screens`** — Parameters table + wireframes. ALWAYS position 3 so readers see what the user enters BEFORE diving into logic. Localise the sheet name (`입력 및 화면` for KO, `入力と画面` for JA) via the template's `INPUTS_SHEET_NAME` constant — do NOT name it the English `Inputs & Screens` on a KO/JA spec.
  4. `Logic` — numbered step list with line refs
  5. `Outputs` — ALV field catalog / exporting params / OData fields. **Column headers MUST be: `순서 | 필드 | 필드 설명 | 길이 | 편집 | 숨김 | 비고`** (do NOT use `헤더`/`폭` — those were the pre-2026-04-20 names).
  6. `Authorization` — S_TCODE, S_TABU_DIS, custom objects
  7. `Exceptions` — message/class + trigger condition
  8. `Enhancements` — BAdI / User Exit / BTE impacts (L3+)
  9. `Where-Used` — callers (L3+ if opted in)
  10. `Includes & Artifacts` — Screen / GUI Status / Text Element (L3+)
  11. `Risk & PII` — blocklist-relevant tables touched (L4)

  Color convention (v8 — grey + yellow palette, green retired):
  - **Light grey (`#E7E6E6`)** — sheet title (row 1, style `2`) AND all section titles / header rows / frame-top block titles (styles `3 / 4 / 17 / 19 / 24`, all pointing at fill 2 in v8). Green fill (#E2EFDA) is retired — do NOT reintroduce.
  - **Light sky blue (`#DDEBF7`)** — selection-screen input widgets in the cell-border fallback path (style `6`).
  - **Soft yellow (`#FFF2CC`)** — style `20`, reserved for warning rows (Auth / Data-volume caveats) at the BOTTOM of the `Inputs & Screens` sheet. Do not sprinkle yellow elsewhere.
  - Informational rows (Flow diagram, BAPI mapping) use NO fill beyond the optional grey header — keep them uncluttered since the embedded images carry the visual weight.

  Border continuity (v7 — MANDATORY for `screensSheet()`):
  - Use the module-level helpers (`screenFrameRow / screenCloseFrame / screenFullRow / screenSubtitleRow / screenMerge`) from the template; do NOT redefine them inline in drivers.
  - Helpers set the style on EVERY cell of a merge range (v7 correction — v6 set only top-left, which caused Excel to drop the right/bottom edges of merged input boxes). Modern Excel suppresses interior dividers between identically-styled merged cells, so the outer rectangle renders cleanly.
  - `screenSubtitleRow` is REQUIRED for every sub-title line INSIDE a frame section (e.g. `▼ 상단 정보 패널`, `▼ ALV 그리드`, `◆ 블록 B01`). It keeps col A/Q frame borders continuous across the sub-title row.
  - Style 17 (frame-top) has ALL four borders — every title bar closes with a clean bottom line. Do NOT revert to TLR.
  - After a mini-frame (top-info panel, toolbar row, flow diagram, toolbar→BAPI block), always call `screenCloseFrame` before starting the next section, so every frame has a visible bottom edge.

  Selection-screen parameter-row alignment (MANDATORY — `screensSheet()`):
  - Label: `B:E` (4 cols, merged, style 7)
  - Low input: `F:H` (3 cols, merged, style 6 sky-blue)
  - Dropdown `▼`: col `I` (single, style 0)
  - Range separator `~`: col `J` (single, style 7) — ONLY when SELECT-OPTIONS with range
  - High input: `K:M` (3 cols, merged, style 6 sky-blue) — ONLY when SELECT-OPTIONS with range
  - Second dropdown `▼`: col `N` (single, style 0)
  - Note / default annotation: `O:P` (2 cols, merged, style 0)
  - EVERY range parameter MUST use these exact columns so the high box visually aligns across rows. If a param has a dynamic default (e.g. PO-date `당월1일~오늘`), it STILL uses F:H + J separator + K:M high — NEVER shift one column left.

**Step 5 — Review loop**
- Show a table of contents + first section inline.
- Ask: "OK to finalize, or trim/expand a section?"
- On confirm → write file → print absolute path.
