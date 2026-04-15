---
name: sc4sap:program-to-spec
description: Reverse-engineer an ABAP program into a Functional/Technical Specification artifact (Markdown or Excel). Socratic scope narrowing from "everything" to "only what the user needs".
level: 2
---

# SC4SAP Program → Specification

Reads an existing ABAP program (Report / Module Pool / FM Group / Class / CDS / RAP) via MCP, runs structural + semantic + where-used analysis, then produces a Specification artifact in **Markdown** (`.md`) or **Excel** (`.xlsx`) format. Scope is **negotiated Socratically** — start wide, narrow on each turn, stop when the user's target granularity is confirmed.

<Purpose>
Turn legacy or unfamiliar ABAP objects into a reviewable Functional/Technical Spec for handover, documentation audit, AMS transition, refactoring preparation, or compliance artifacts. Unlike `analyze-code` (quality-focused), this skill is **documentation-focused**: it describes what the program DOES, not what's wrong with it.
</Purpose>

<Use_When>
- User says "program to spec", "reverse engineer", "make a spec", "document this program", "functional specification", "technical specification", "generate a specification"
- Knowledge transfer / handover of legacy ABAP to another team
- Preparing a refactoring or rewrite (need to capture as-is behavior)
- Compliance / audit requires a written spec for custom code
- Building a WRICEF inventory with detailed per-object specs
</Use_When>

<Do_Not_Use_When>
- User wants a **code quality review** → `/sc4sap:analyze-code`
- User wants to **create a new** program from a spec → `/sc4sap:program`
- User wants to **fix** the program → `/sc4sap:ralph`
- Object does not exist yet
</Do_Not_Use_When>

<Socratic_Scope_Narrowing>
The interview is a **funnel**: every turn reduces the remaining decision space. Do not ask all questions at once. Score remaining ambiguity 0–10 after each answer; stop when **≤3**.

**Round 1 — Target object (1 question)**
- "Which object? (program / FM group / class / CDS / RAP BO name)"
- Verify via `SearchObject`. If ambiguous, list candidates.

**Round 2 — Audience + format (1 question, 2 choices each)**
- Audience: **Functional** (business readers — SD/FI/MM users) vs **Technical** (developers) vs **Both**
- Format: **Markdown** (review-friendly, git-friendly) vs **Excel** (project-PMO-friendly, reviewable cell-by-cell)
- Default if user says "up to you" / "you choose" → Both + Markdown.

**Round 3 — Depth (pick one)**
| Depth | Contains |
|-------|----------|
| **L1 — Overview** | Purpose, inputs, outputs, 1-paragraph flow |
| **L2 — Standard Spec** (default) | L1 + selection screen, data model, main logic steps, authorizations, outputs, exceptions |
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
- `/sc4sap:program` — spec → new program (forward direction)
- `/sc4sap:deep-interview` — requirement clarification for new builds
- `/sc4sap:ask` — single-question routing
</Related_Skills>

<Data_Extraction_Safety>
Spec generation only reads **source code + DDIC metadata + where-used** — never `GetTableContents` / `GetSqlQuery`. No row data is extracted. The blocklist hook is respected if the user asks for sample data (refuse and document the request in the `Risk & PII` sheet instead).
</Data_Extraction_Safety>

Task: {{ARGUMENTS}}
