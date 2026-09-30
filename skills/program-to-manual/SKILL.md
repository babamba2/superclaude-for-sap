---
name: program-to-manual
description: Write an end-user manual (one self-contained HTML file) for one ABAP program — scenario-by-scenario steps drawn on selection / ALV / popup screen mockups with numbered callouts, check points derived from the source validations, field reference, messages with actions, glossary and revision history. Web document on screen, one step per A4 landscape page in print.
model: inherit
---

# SC4SAP Program → User Manual

Reads one ABAP program via MCP and writes the manual a business user follows to run it: which screen to open, what to enter, which button to press, what the result means and what to do when a message appears. Output is **one HTML file** — a scrolling web document with a contents sidebar on screen, and one scenario step per A4 landscape page when printed or saved as PDF.

<Purpose>
Key users and help desks need a task-oriented manual, not a specification. `program-to-spec` describes what the program does for consultants and developers; this skill describes **how a user does their job with it**, step by step, on pictures of the real screens.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Phase_Banner>Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode first per [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md): `auto` (default) uses the model in `Agent_Composition` below; `user-defined` asks the user Opus / Sonnet / Haiku (recommended one first) before each dispatch group.</Phase_Banner>

<Team_Mode>**No teamMode integration.** One program, one module consultant for business context — no cross-module synthesis.</Team_Mode>

<Use_When>
- User says "user manual", "manual for this program", "매뉴얼 만들어줘", "사용자 매뉴얼", "현업 매뉴얼", "操作マニュアル", "training material for <program>"
- Go-live / hypercare: key users need step-by-step instructions for a custom report or transaction
- Help-desk handover: messages and what to do about them must be written down
</Use_When>

<Do_Not_Use_When>
- User wants a functional / technical specification → `/sc4sap:program-to-spec`
- User wants a process document spanning a whole package → `/sc4sap:package-to-process`
- The object has no user interface (class, FM, CDS, RAP without UI) — there is nothing to click through; suggest `program-to-spec`
- The program does not exist yet
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — Step 0, before any MCP call or user interaction.** Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:program-to-manual`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h. Full spec: [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Decisions_Fixed>
These were settled when the skill was designed — do not ask the user about them again:

| Topic | Decision |
|---|---|
| Unit | One program = one manual (all its screens, options and follow-up screens) |
| Format | One self-contained `.html`; web document on screen, print CSS = one step per A4 landscape page |
| Editing | The page has a built-in edit mode (no install, no network): edit text, reorder / duplicate / delete steps, add / delete / drag callouts, add / delete rows of the field, message and glossary tables, paste real screenshots, undo, autosave, save a copy. The copy embeds its manual.json and is imported back (workflow Step 0) |
| Screens | Drawn from source with the `program-to-spec` renderer (selection screen, output ALV, **every follow-up screen and popup the scenarios pass through**), inlined as SVG |
| Callouts | Numbered marks on the drawn screen, tied to screen elements by anchor key; the same numbers head the step's instruction list |
| Body structure | By usage scenario ("to do X") — radio options, execution modes and buttons that start a distinct task each become a scenario |
| Business context | Module consultant drafts it; low-confidence items go to a 1–3 question interview |
| Check points | Derived from source validations, mandatory fields, confirmation popups and irreversible processing (posting, sending); business rules added from the interview |
| Extra sections | Field reference (selection + output) and Messages & actions |
| Front / back matter | Cover, revision history (automatic), glossary |
| Language | One language per manual file (ko / en / ja); mixed prose is rejected by the build check. An English companion is always built as well (Step 8) unless the manual language is English or the user opts out |
| Cover / footer | Author, team, company, confidentiality notice from the active profile's `config.json` → `manual`, asked once |
| Location | `<artifact-base>/manuals/<PROGRAM>-v<version>-<lang>.html` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)) |
</Decisions_Fixed>

<Workflow_Steps>
**MUST read [`workflow-steps.md`](workflow-steps.md)** and execute its steps in order whenever this skill runs.
</Workflow_Steps>

<Manual_Schema>
**MUST read [`manual-schema.md`](manual-schema.md)** before writing `manual.json` (Step 5) — JSON shape, anchor keys, callout and check-point rules. The screen specs inside it follow [`../program-to-spec/selection-schema.md`](../program-to-spec/selection-schema.md) and [`../program-to-spec/alv-buttons-schema.md`](../program-to-spec/alv-buttons-schema.md).
</Manual_Schema>

<Agent_Composition>
The main thread follows the session model (`model: inherit`); each dispatch carries its own model. Every `subagent_type` uses the plugin prefix `sc4sap:`.

- **Main thread** — Steps 0–2 and 6–8: interview, config, MCP inventory, build, review loop, English build.
- **`sc4sap:sap-analyst` × 1 (Opus, frontmatter)** — Step 3: scenarios, steps, screens per step, check points with their source, fields, messages. Returns text; never writes files.
- **`sc4sap:sap-<module>-consultant` × 1 (frontmatter model)** — Step 3, in parallel with the analyst: purpose, background, business rules, users, glossary, and the user action for each message. Marks each claim it inferred rather than read.
- **`sc4sap:sap-writer` × 2 (`model: "sonnet"` override)** — Step 5: writes `manual.json` with the `Write` tool; Step 8: translates the final one into the English companion. User-facing instructional prose needs Sonnet; Haiku drifts into spec language.
</Agent_Composition>

<Output_Format>
```
Manual generated: ZMMR_GR_3PL  v1.0 · ko
Scenarios: 3 · Steps: 8 · Screens drawn: 4 (selection, 0100, 0200 popup, 0300)
Callouts: 21 (all anchored) · Check points: 7 · Messages: 9 · Glossary: 6
File: .sc4sap/work/DEV/manuals/ZMMR_GR_3PL-v1.0-ko.html
English: .sc4sap/work/DEV/manuals/ZMMR_GR_3PL-v1.0-en.html
History: .sc4sap/work/DEV/manuals/ZMMR_GR_3PL-ko.history.json · ZMMR_GR_3PL-en.history.json

To be confirmed (shown with a badge in the manual): 1
Next: "add a scenario", "Japanese version", "new version after the change in TR <n>", "import the edited HTML"
```
</Output_Format>

<MCP_Tools_Used>
- `SearchObject`, `GetObjectInfo`, `GetTransaction`
- `GetProgFullCode`, `GetIncludesList`, `GetInclude`
- `GetScreensList`, `GetScreen`, `GetGuiStatusList`, `GetGuiStatus`, `GetTextElement` (`language: "E"` first)
- `GetSqlQuery` — T100 message texts only (see Data_Extraction_Safety)
- `GetAbapSemanticAnalysis` (optional, for validation branches)
</MCP_Tools_Used>

<Data_Extraction_Safety>
Same rule as `program-to-spec`: only source, DDIC metadata and screen definitions are read — never `GetTableContents`. The one exception is **T100** through `GetSqlQuery` with explicit fields (`ARBGB, MSGNR, TEXT`), `SPRSL` = the manual language (fall back to `'E'`) and only the message classes / numbers the source uses; the normal approval prompt applies. **Sample values in screen mockups are invented** (`4500000015`, `KR01`, `100234`) — never business data, never real customer, vendor or company names. Refuse requests to fill mockups with real rows and say why.
</Data_Extraction_Safety>

<Related_Skills>
- `/sc4sap:program-to-spec` — the specification of the same program (shares the screen renderer and schemas)
- `/sc4sap:package-to-process` — process view across a package
- `/sc4sap:analyze-cbo-obj` — CBO inventory that enriches the business context
</Related_Skills>

Task: $ARGUMENTS
