---
name: interface-mapping-spec
description: Write an interface mapping specification as one editable HTML page in the classic template layout — cover, revision history, header, Source → Target field grid with conversion rules and MAPPING, optional synchronous response block, extraction condition, field guide. SAP side read from DDIC (table, structure, view, function module) or, for new interfaces, from a field list or the module consultant's proposal; non-SAP side proposed; in-page checks; versioned; English companion.
model: inherit
---

# SC4SAP Interface Mapping Specification

Interviews the consultant briefly and writes **one editable HTML page per interface**: cover, revision history, the mapping sheet (header, systems, Source → Target grid with R / MAPPING columns, response block for synchronous interfaces, conversion rules, extraction condition, remarks) and the field guide. The SAP side comes from the system; the other side is proposed and corrected in the page.

<Purpose>
Most mapping specifications are written for **new** interfaces, before any SAP object exists, by a consultant who has to fill dozens of type / length / description cells by hand. This skill fills everything SAP already knows, proposes the rest (counterpart fields, DB types, conversion rules, scenario defaults) and checks the result, so the consultant only decides what needs a decision.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Phase_Banner>Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode first per [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md).</Phase_Banner>

<Team_Mode>**No teamMode integration.** Reading SAP, proposing and building are scripted; agents only propose fields (optional) and translate.</Team_Mode>

<Use_When>
- "인터페이스 매핑 정의서", "매핑 스펙", "interface mapping spec", "I/F 정의서", "EAI 매핑", "field mapping for interface <ID>"
- A new interface must be specified before development (the usual case)
- An existing RFC / proxy structure / Z table needs its mapping written down
- An edited page comes back (import), or the SAP structure changed (refresh)
</Use_When>

<Do_Not_Use_When>
- Specification of a program → `/sc4sap:program-to-spec`
- Creating the Z structure / RFC itself → `/sc4sap:create-object` (this skill hands it the field list, Step 8)
- An interface catalogue across many interfaces — one interface per document
</Do_Not_Use_When>

<Decisions_Fixed>
Settled with the user when the skill was designed — do not ask again:

| Topic | Decision |
|---|---|
| Output | Editable HTML only (no `.xlsx`); one interface per document; one page with an optional response block (B01…) for synchronous interfaces |
| SAP side | Read from SAP (DDIC table / DB view / structure — a proxy by its structure —, CDS by SQL view name, function module signature). New interfaces: a `TABLE-FIELD` / data-element list, the module consultant's proposal (checked against DDIC), Excel paste in the page, or an empty grid |
| Carriers | The grid is split by **▸ group rows** — the unit the fields travel in, per side: name, kind (PARAMETER / STRUCTURE / TABLE), occurrence (0:1 … 1:N). A row's Table column holds only the source DDIC table. The system block's Structure / occurrence is the read-only summary of the groups. FM: scalar parameters of one direction share one PARAMETER group; each structure / table parameter is its own group |
| Colours | Source side blue, target side green — header, system block and grid cells |
| SAP types | Shown as DB types of the code list (NUMC → NUMBER, DATS → DATE …); the DDIC type is the cell tooltip |
| Other side | Proposed (same names, DB types, MAPPING 1:1), marked "Proposal" until edited or confirmed |
| Conversion rules | Proposed from the SAP types (date, time, leading zeros / ALPHA, currency, quantity / unit) and linked in the R column |
| Checks | Empty required (*) items, MAPPING to a missing row, unknown R id, size truncation, type-family mismatch, unmapped target field, key mismatch — all in the page's Checks panel |
| Versions | v0.1 → +0.1 per saved / imported edit, per refresh with changes; the revision-history table fills itself (author, change, optional approver) |
| Language | Page language from `.sc4sap/config.json` (`language`, else `ko`); English companion always built unless the user opts out |
| Settings | `<base>/interfaces/project.json`: cover (project name, title, document-number pattern `IF-MAP-{ifId}`, copyright), `idPattern` for IF ID numbering, code-list overrides (`codes`) |
| Location | `<base>/interfaces/<IF_ID>/` — `<base>` per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) (`.sc4sap/work/<alias>/` with an active profile) |
| Template content | Generic: never put customer, vendor or people names into the skill or into public docs; real names belong only in the user's `project.json` and documents |
</Decisions_Fixed>

<Workflow>
`<B>` = `node "<PLUGIN_ROOT>/scripts/interface/build-if-spec.mjs"` (`<PLUGIN_ROOT>` = two levels above this skill folder), run from the project root so the artifact base resolves; every command prints one JSON line (`ok`, `html`, `version`, `findings`, `top`, `problems`). Never paste table contents or the whole model into chat.

**Entry check.** If the user hands back an edited page → Step 6. "Refresh / SAP changed" → Step 7. "Z structure / create the RFC" → Step 8. Otherwise a new document: Steps 1–5.

**Step 1 — Preflight and project settings.** Confirm the active profile in one line. If `<base>/interfaces/project.json` is missing, ask once (MUST read [`interview.md`](interview.md) § Project) and `Write` it.

**Step 2 — Interview.** MUST read [`interview.md`](interview.md) § Interface. One `AskUserQuestion` round (scenario preset, where the SAP fields come from, IF ID), then one short free-text ask for name, summary, systems and the SAP object or field list. Unanswered items stay empty — the page highlights them; do not chase every field in chat.

**Step 3 — Field proposal (only when the user chose "describe the business").** Dispatch the module consultant with [`dispatch-prompts.md`](dispatch-prompts.md) § 1. Show the returned `TABLE-FIELD` list with one reason each and ask the user to confirm or trim it in one message; the confirmed list becomes `fields`.

**Step 4 — Build v0.1.** `Write` the answers to `<base>/interfaces/_answers/<IF_ID>.json` (shape in `interview.md` § Answers), then `<B> init --answers <file>`. Report `problems` (fields SAP does not have, unreadable parameter types — for those offer `--line PARAM=STRUCTURE` and `refresh`).

**Step 5 — English companion.** Skip when the page language is `en` or the user opted out. `<B> texts --if <ID> --to en` → when `todo` > 0, dispatch `sc4sap:sap-writer` with [`dispatch-prompts.md`](dispatch-prompts.md) § 2 to write `outFile`; then `<B> companion --if <ID> --to en`. `missing` must be empty.

**Step 6 — Import an edited page.** `<B> import <file>` → new version with the reader's revision row; hand-typed SAP fields (`EKPO-MATNR`, data elements) are filled from DDIC at the same time (`resolved`, `problems`). Refusals: version already imported; the page was edited from an older version (`--force` only when the user says to overwrite); an English companion page (edits go into the primary-language page, the companion is rebuilt from it); a page whose ID / version / language was changed outside edit mode. Then Step 5 again.

**Step 7 — Refresh from SAP.** `<B> refresh --if <ID> [--line PARAM=STRUCTURE]` → `unchanged: true`, or a new version with added / changed / removed fields marked in the grid and a revision row. Only SAP facts (type, length, DDIC type) are updated; key, null and descriptions the user wrote stay. `--line` values are remembered for later refreshes. Then Step 5 again.

**Step 8 — Hand-off to create-object (on request, or offered once the user says the mapping is agreed).** `<B> fields --if <ID>` lists the SAP-side fields with data elements; offer `/sc4sap:create-object` for a Z structure (proxy / RFC) built from that list. Never create SAP objects from this skill.

**Close.** Report in the user's language: page path(s), version, findings (errors / warnings / to confirm) with the first few error texts, `problems`, and the next steps: open the page → **Edit** → **Save** → hand the file back for import.
</Workflow>

<Page>
Top bar: Checks (count; panel lists every finding, click jumps to the cell), Edit, Undo, Save, Print, link to the companion. Edit mode needs nothing installed: click a cell, pick code items from lists, paste a block of cells from Excel into the grid, add / insert / move / delete rows (No renumbered, MAPPING follows), ✓ confirms a proposal, add rules / SQL lines / revision rows, add or drop the response block, autosave in the browser. Save asks author, change and approver and downloads `<IF_ID>-v<next>-<lang>-edited.html`. Print: A4 landscape, one sheet per page.
</Page>

<Files>
- `scripts/interface/build-if-spec.mjs` — CLI (init, build, import, resolve, refresh, next-id, fields, texts, companion)
- `scripts/interface/sap-fields.mjs` — DDIC / FM signature reading, TABLES direction by name, `TABLE-FIELD` resolution
- `scripts/interface/if-model.mjs` — model, proposals, conversion rules, refresh merge, companion texts
- `scripts/interface/if-validate.mjs` — checks (also embedded in the page)
- `scripts/interface/if-codes.mjs` — code lists, presets, field guide, type conversion
- `scripts/interface/if-spec-page.mjs` + `if-spec-editor.mjs` — page and edit mode
</Files>

<MCP_Tools_Used>
Through the scripts only: `GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetTypeInfo`, `SearchObject`, `GetFunctionModule` — DDIC metadata and source, never table contents.
</MCP_Tools_Used>

Task: $ARGUMENTS
