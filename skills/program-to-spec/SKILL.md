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

<Team_Mode>**No teamMode integration.** program-to-spec targets a single object (one program / class / FM group / CDS / RAP BO) and performs read-only structural extraction — no cross-module synthesis, no authoring conflict, no incident triage. See [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) § 6 gating logic. Future extension: if a target's `GetWhereUsed` graph spans ≥ 2 modules AND user picks L4 depth, Type A (module consultants annotating cross-module concerns in Step 3) could be added — not in current scope.</Team_Mode>

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
| 3 | Depth | What depth of detail? | L2 Standard (Recommended) · L1 Quick Spec · L3 Deep Technical · L4 Audit-grade |
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
| **L1 — Quick Spec** | Purpose, inputs, outputs, **main logic steps** (numbered; for Module Pool includes PBO/PAI module flow) |
| **L2 — Standard Spec** (default) | L1 + inputs & screens, data model, authorizations, outputs, exceptions, **every subroutine / method signature** |
| **L3 — Deep Technical** | L2 + SQL inventory, BAdI / exit list, performance notes |
| **L4 — Audit-grade** | L3 + line-level cross-references, **where-used** (scope: main object + screens × `Z*` / `Y*` callers), risk register, transport history |

**Round 4 — Scope trimming (only if L3/L4)**
Ask ONE narrowing question per turn until ambiguity ≤3:
- "Include unit tests inventory?"
- "Include generated artifacts (Screens / GUI Status / Text Elements)?"
- "Cover all includes or just main?"

**Where-Used scope (L4 only — fixed default, no interactive prompt)**
- Target = main program / class / FM-group / CDS / RAP-BO object **+ each of its screens** (T1+Screen).
- Caller filter = customer namespace `Z*` / `Y*` only (S2). Standard SAP and add-on namespaces are excluded.
- The rendered `Where-Used` section MUST repeat this scope in its header so reviewers know what was (and wasn't) searched.

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
  - **Excel output** — writer's deliverable is TWO JSON files consumed by `scripts/spec/build-spec.mjs`:
    1. **TR (translation) map** — `English source string → target-language replacement` mapping; schema + slot semantics in `spec-templates.md` § Excel — Template-clone.
    2. **image-spec.json** — `{selection, alv, processFlow, lang}` per-program image data; exact key names + sample values in `spec-templates.md` § Image Replacement. Drives the Sheet 3 Selection/ALV mockups + Sheet 4 horizontal Process Flow PNG.
    Writer does NOT generate workbook styles, drivers, geometry, or PNGs directly — `asset/template_base.xlsx` supplies geometry, `build-spec.mjs` does clone + render + swap in one shot. Depth-driven model override still applies (Sonnet for L3/L4 because the warning-row and processing-step narrative is longer).
    **Two hard requirements on both JSON files** (full rules in `spec-templates.md`): (1) **business-first content** — Sheet 4 Step text + `processFlow[]` describe the business process for a functional reader, with the ABAP event/FORM kept as a secondary annotation (never an event-only list); (2) **single-language output** — every prose string is in the target `lang`; only SAP identifiers / ABAP literals stay as-is. `build-spec.mjs` prints a `⚠ LANGUAGE MIX` gate for ko/ja — finalize only when it reports `language check OK`.
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
  • "Extend to L4 with Where-used"
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
Spec generation only reads **source code + DDIC metadata + where-used** — never `GetTableContents` / `GetSqlQuery`. No row data is extracted. The blocklist hook is respected if the user asks for sample data (refuse and document the request in the `Risk` sheet instead).
</Data_Extraction_Safety>

<Inputs_And_Screens_Rendering>
**xlsx output — always-on pipeline (clone + program-specific imagery):** every xlsx spec runs `scripts/spec/build-spec.mjs <tr.json> <image-spec.json> <out.xlsx>`. The helper clones `asset/template_base.xlsx` (geometry / styles / fonts / column widths / row heights / image anchors — all preserved), renders three program-specific PNGs from `image-spec.json`, then swaps them into the cloned xlsx with dynamic `<xdr:ext>` extents (no stretching). Three image slots are populated on every spec:
- **Sheet 3 Selection** (`xl/media/image2.png` at C4) — driven by `image-spec.json.selection`
- **Sheet 3 ALV** (`xl/media/image1.png` at C19) — driven by `image-spec.json.alv`
- **Sheet 4 Process Flow** (`xl/media/image3.png` at B19, horizontal layout) — driven by `image-spec.json.processFlow` (each program has a different flow, so `drawing4.xml` is injected on demand from a blank template container)

**Graceful degrade**: if no headless browser is on PATH, `renderScreenImages` returns `null` per slot and `build-spec.mjs` keeps the template mockups for that slot — never crashes.

**No trigger keywords required.** Image rendering is part of the default Excel pipeline because each program has unique selection screens, ALV layouts, and flow charts. Drift risk applies only to geometry regression (the old throwaway-driver problem) and image swap only touches drawing extents + PNG bytes, not geometry.

**Markdown output — unchanged:** continue emitting ASCII wireframes inside fenced code blocks (Step 3.5 in `workflow-steps.md`). ASCII wireframes never go in xlsx cells.
</Inputs_And_Screens_Rendering>

Task: {{ARGUMENTS}}
