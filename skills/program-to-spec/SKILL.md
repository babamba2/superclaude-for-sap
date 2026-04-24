---
name: sc4sap:program-to-spec
description: Reverse-engineer an ABAP program into a Functional/Technical Specification artifact (Markdown or Excel). Socratic scope narrowing from "everything" to "only what the user needs".
level: 2
model: sonnet
---

# SC4SAP Program → Specification

Reads an existing ABAP program (Report / Module Pool / FM Group / Class / CDS / RAP) via MCP, runs structural + semantic + where-used analysis, then produces a Specification artifact in **Markdown** (`.md`) or **Excel** (`.xlsx`) format. Scope is **negotiated Socratically** — start wide, narrow on each turn, stop when the user's target granularity is confirmed.

<Purpose>
Turn legacy or unfamiliar ABAP objects into a reviewable Functional/Technical Spec for handover, documentation audit, AMS transition, refactoring preparation, or compliance artifacts. Unlike `analyze-code` (quality-focused), this skill is **documentation-focused**: it describes what the program DOES, not what's wrong with it.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Phase_Banner>Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.</Phase_Banner>

<Team_Mode>**No teamMode integration.** program-to-spec targets a single object (one program / class / FM group / CDS / RAP BO) and performs read-only structural extraction — no cross-module synthesis, no authoring conflict, no incident triage. See [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) § 6 gating logic. Future extension: if a target's `GetWhereUsed` graph spans ≥ 2 modules AND user picks L3/L4 depth, Type A (module consultants annotating cross-module concerns in Step 3) could be added — not in current scope.</Team_Mode>

<Use_When>
- User says "program to spec", "reverse engineer", "make a spec", "document this program", "functional specification", "technical specification", "generate a specification"
- Knowledge transfer / handover of legacy ABAP to another team
- Preparing a refactoring or rewrite (need to capture as-is behavior)
- Compliance / audit requires a written spec for custom code
- Building a WRICEF inventory with detailed per-object specs
</Use_When>

<Do_Not_Use_When>
- User wants a **code quality review** → `/sc4sap:analyze-code`
- User wants to **create a new** program from a spec → `/sc4sap:create-program`
- User wants to **fix** the program → direct MCP `Update*` calls or re-run `/sc4sap:create-program`
- Object does not exist yet
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0a before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:program-to-spec` to pre-grant MCP tool + file-op permissions (eliminates per-tool prompts during structural reads + screen rendering pipeline).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- All `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Socratic_Scope_Narrowing>
The interview is a **funnel**: every turn reduces the remaining decision space. Score remaining ambiguity 0–10 after each answer; stop when **≤3**.

**Default opener — bundled 4-question `AskUserQuestion`** (MANDATORY when the target object is already supplied in `ARGUMENTS`):
Issue ONE `AskUserQuestion` call with these four questions in this exact order — Audience / Format / Depth / Language — each a single-select with "(Recommended)" as the first option. This replaces Rounds 2+3+5 in one UI turn. Only fall back to per-round questioning when the object itself is missing or ambiguous (Round 1) or when the user picks L3/L4 (Round 4 scope trimming).

| # | Header | Question | Options (Recommended first) |
|---|--------|----------|-----------------------------|
| 1 | Audience | Who is the primary audience for the spec? | Both (Recommended) · Functional · Technical |
| 2 | Format | Which output format? | Markdown (Recommended) · Excel · Both |
| 3 | Depth | What depth of detail? | L2 Standard (Recommended) · L1 Overview · L3 Deep Technical · L4 Audit-grade |
| 4 | Language | Output language? | Korean · English · Japanese (order follows user's current language — promote the matching one to first with "(Recommended)") |

**Round 1 — Target object (only if ARGUMENTS did not supply it)**
- "Which object? (program / FM group / class / CDS / RAP BO name)"
- Verify via `SearchObject`. If ambiguous, list candidates.

**Round 2 — Audience + format** *(covered by the default opener — do not ask separately)*
- Audience: **Functional** (business readers — SD/FI/MM users) vs **Technical** (developers) vs **Both**
- Format: **Markdown** (review-friendly, git-friendly) vs **Excel** (project-PMO-friendly, reviewable cell-by-cell)
- Default if user says "up to you" / "you choose" → Both + Markdown.

**Round 3 — Depth (pick one)** *(covered by the default opener)*
| Depth | Contains |
|-------|----------|
| **L1 — Overview** | Purpose, inputs, outputs, 1-paragraph flow |
| **L2 — Standard Spec** (default) | L1 + inputs & screens, data model, main logic steps, authorizations, outputs, exceptions |
| **L3 — Deep Technical** | L2 + every subroutine/method signature, SQL inventory, BAdI/exit list, where-used, performance notes |
| **L4 — Audit-grade** | L3 + line-level cross-references, risk register, data-privacy mapping (PII tables touched), transport history |

**Round 4 — Scope trimming (only if L3/L4)**
Ask ONE narrowing question per turn until ambiguity ≤3:
- "Include internal FORMs/methods or public surface only?"
- "Include unit tests inventory?"
- "Include generated artifacts (Screens / GUI Status / Text Elements)?"
- "Include `GetWhereUsed` callers? (expensive for popular objects)"
- "Cover all includes or just main?"

**Round 5 — Output location**
- Default: `.sc4sap/specs/{object_name}-{YYYYMMDD}-{lang}.{md|xlsx}`
- Language: ko / en / ja (infer from user's current language; confirm once).

**Stop condition**: every dimension above has a concrete answer OR user explicitly says "skip remaining, use defaults".
</Socratic_Scope_Narrowing>

<Workflow_Steps>
The 6-step workflow (Step 0 Socratic → Step 5 Review) lives in a companion file to keep this skill doc short.

**MUST read `workflow-steps.md`** (in this skill folder) and execute the steps defined there in order whenever this skill runs.
</Workflow_Steps>

<Spec_Templates>
The Markdown L2 skeleton and the Excel sheet-naming convention live in a companion file.

**MUST read `spec-templates.md`** (in this skill folder) when rendering the artifact in Step 4.
</Spec_Templates>

<Agent_Composition>
Per-step model allocation. Skill frontmatter pins the main thread to Sonnet; each `Agent(...)` carries its own model (frontmatter or explicit override).

- **Main orchestrator (Sonnet 4.6)** — Steps 0, 1, 1.5, 2, 5: Socratic interview orchestration, object classification routing, CBO context preload, Step 5 review loop. State tracking across depth / format / language dimensions needs Sonnet headroom.
- **Analysis (`sap-analyst` × 1, Opus 4.7, frontmatter)** — Step 3 primary dispatch: extracts business purpose, inputs, outputs, data sources (including CBO-annotated Z-references when `cbo-context.md` exists), main-logic narrative, authorization checks, error cases. One dispatch covers all narrative dimensions to keep context continuous.
- **Rendering (`sap-writer` × 1)** — Step 3 second dispatch (or Step 4 render invocation):
  - **L1 / L2 depth** → **Haiku 4.5** base (frontmatter). Pure templating from structured analyst output.
  - **L3 / L4 depth** → **Sonnet 4.6** override (`model: "sonnet"`) — longer narrative + deeper cross-reference + stronger consistency requirement.
  - **Excel output** → Haiku still sufficient (driver wiring is mechanical fill-in); depth-driven override above still applies.
- **Audit verification (`sap-critic` × 1, Opus 4.7, frontmatter, conditional L4 only)** — Step 3 gate: verifies every claim in the rendered spec cross-references a concrete line range in source. Skip for L1 / L2 / L3.

All Agent dispatches pass `mode: "dontAsk"` (trust-session granted in Step 0a).
</Agent_Composition>

<Output_Format>
```
Spec generated: ZSDR_OPEN_ORDER_ALV
Depth: L2 Standard · Format: markdown · Lang: ko
Sections: 9 · Tables referenced: 6 · Screens: 1 · GUI status: 1
File: .sc4sap/specs/ZSDR_OPEN_ORDER_ALV-20260414-ko.md

Top-level summary:
  Report that lists open sales orders by Sales Organization and date range and displays them via ALV.
  Main tables: VBAK, VBAP, VBUK, KNA1 (+ CDS I_SalesOrder).
  Authorizations: S_TCODE=ZSDR01, S_TABU_DIS=VBAK.

Next options:
  • "Regenerate as Excel"
  • "Extend to L3 with Where-used"
  • "Add an English version"
```
</Output_Format>

<MCP_Tools_Used>
- `SearchObject`, `GetObjectInfo`
- `GetProgFullCode`, `GetIncludesList`, `GetInclude`
- `ReadClass`, `ReadFunctionModule`, `ReadInterface`, `ReadView`
- `Read BehaviorDefinition`, `Read BehaviorImplementation`, `Read ServiceDefinition`, `Read ServiceBinding`
- `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes`
- `GetScreensList`, `GetGuiStatusList`, `GetTextElement`
- `GetMetadataExtension`
- `GetAbapAST`, `GetAbapSemanticAnalysis`
- `GetWhereUsed`, `GetEnhancements`, `GetEnhancementSpot`
</MCP_Tools_Used>

<Related_Skills>
- `/sc4sap:analyze-code` — code quality review (what's wrong)
- `/sc4sap:create-program` — spec → new program (forward direction)
- `/sc4sap:deep-interview` — requirement clarification for new builds
</Related_Skills>

<Data_Extraction_Safety>
Spec generation only reads **source code + DDIC metadata + where-used** — never `GetTableContents` / `GetSqlQuery`. No row data is extracted. The blocklist hook is respected if the user asks for sample data (refuse and document the request in the `Risk & PII` sheet instead).
</Data_Extraction_Safety>

<Inputs_And_Screens_Rendering>
**Universal applicability (v8.1):** the image pipeline runs for **every xlsx spec** regardless of language (ko / en / ja / de / …) and depth (**L1 / L2 / L3 / L4**). Driver is language-agnostic — just populate `SELECTION_IMAGE_SPEC` / `ALV_IMAGE_SPEC` (+ optional `SHEET_TITLE`) constants at the top of the per-spec driver, and the template's internal `buildImages()` helper auto-imports `screen-image-renderer.mjs`, renders both PNGs, and embeds them via `build({ images })`. **No driver edits to the build call are required.**

**Parallel rendering:** `renderScreenImages()` in `scripts/spec/screen-image-renderer.mjs` uses `Promise.all` to spawn two headless browsers concurrently — Selection + ALV rasterize in parallel. Wall-clock cost is ~3s for both (vs ~6s sequential on Windows/Edge). Each branch is independent: if one rasterize fails or hits the 30s timeout, its PNG becomes null and the template falls back to cell-border wireframe for **that section only** — the other PNG still embeds, spec still opens.

**Fallback wireframe (auto):** when headless browser missing OR rasterize fails, `screensSheet()` in the template detects `hasSelectionImg` / `hasAlvImg` are false and draws cell-border wireframes from the same `SELECTION_IMAGE_SPEC` / `ALV_IMAGE_SPEC` via `renderSelectionWireframe` / `renderAlvWireframe` — readers always see the layout, never an empty sheet.

Mandatory content rules (propagate to every per-spec driver):
- **ALV sample rows ≤ 3** (up to 5 only when demonstrating lock / edit / mixed-status variants). Never dump more — the image is a mockup, not a data extract.
- **Color palette = grey + yellow only**. Headers, title bars, table captions use **light grey** (fill 2). Yellow (fill 3 / style 20) is reserved for warning rows. Green fill is retired.
- **Yellow warning rows MUST sit at the BOTTOM** of the `Inputs & Screens` sheet — readers scan top→bottom.
- **Informational rows** (Flow diagram, BAPI / Action mapping) above the Parameters table use minimal formatting.
- **Localise `SHEET_TITLE` + `INPUTS_SHEET_NAME`** for ko/ja specs — `build()` warns (no silent drop) if `images[].sheetName` drifts from the final workbook sheet name.

Markdown output — unchanged: continue emitting ASCII wireframes inside fenced code blocks. ASCII wireframes never go in xlsx cells.
</Inputs_And_Screens_Rendering>

Task: {{ARGUMENTS}}
