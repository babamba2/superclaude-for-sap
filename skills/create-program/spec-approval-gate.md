# Spec Approval Gate

Referenced from `SKILL.md` → `<Spec_Approval_Gate>`. **MANDATORY — never skip, never shortcut.**

## Trigger

After `<Interview_Gating>` closes (ambiguity ≤ 5%) and Phase 2 (Planning) produces `plan.md`, the skill **MUST** run this gate before any Create/Update MCP call.

## Required steps

1. Invoke `sap-writer` (Phase 3) to produce `.sc4sap/program/{PROG}/spec.md` — a **human-readable Markdown functional + technical specification**.
2. **Display the spec.md contents in the chat** (or surface the file path prominently) so the user can read it end-to-end.
3. **Block all further progress** — no `CreateProgram`, `CreateClass`, `CreateInclude`, or any other `Create*` / `Update*` MCP call may happen — until the user provides an **explicit affirmative acknowledgement** of the spec.
   - Acceptable approval keywords: `승인`, `approve`, `approved`, `ok`, `proceed`, `go ahead`, `confirmed`
   - Silence, "just try it", "빨리", "해봐", "pull it", "yes", "alright", "그냥 해" are **NOT approval**
4. If the user responds with change requests (e.g., "rename the class", "skip the Dynpro", "add one more field"), loop: revise `spec.md` → re-display → wait again. Do not silently merge comments and proceed.
5. Only after explicit approval, log the approval keyword + timestamp inside `spec.md` (bottom `## Approval` section) and move to Phase 4 (Executor).

## Enforcement contract

Phase 4 Executor **MUST refuse to run** if any of the following is true:

- `.sc4sap/program/{PROG}/spec.md` does not exist
- `spec.md` lacks a `## Approval` footer section with at least one approval keyword
- `spec.md` was last modified AFTER the approval was logged (meaning a change arrived post-approval — needs re-approval)

## Rationale

The spec is the **contract** between user intent and AI execution. Creating ABAP objects (tables, classes, programs) on the SAP system without this contract being visible and signed-off leads to:

- User seeing unexpected objects in their package / transport
- Naming conventions mis-aligned with team standards
- Business logic subtly off from actual requirements
- Difficulty justifying the generated code in code review

The 30–60 seconds of spec reading + approval saves hours of "oh no, that's not what I meant, please delete all of this and start over".

## Spec template (minimum sections sap-writer must produce)

```
# Program Spec: {PROG_NAME}

## 1. Purpose
One-paragraph summary of what the program does and who uses it.

## 2. Functional Scope
- Input: selection screen fields, data sources, triggers
- Processing: high-level algorithm / business rules
- Output: ALV layout / file / screen / BAPI callback

## 3. Technical Design
- Paradigm: OOP / Procedural
- Include structure: main + which includes (t/s/c/a/o/i/e/f/_tst)
- Class hierarchy (if OOP): LCL_DATA / LCL_ALV / LCL_EVENT
- Screens + GUI Status (if any)
- Text Elements registered
- Standard APIs / BAPIs used
- Tables / structures / data elements — **reuse first, CBO matches highlighted**

## 4. Object List
| Object | Type | Name | Package | Transport |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## 5. SAP Conventions Applied
Bullet list of which `common/*.md` conventions the spec obeys (ALV rules,
Text Element rule, naming conventions, etc).

## 6. Test Coverage (if OOP)
List of ABAP Unit test methods with brief description.

## 7. Open Questions
If any dimension was resolved to "user chose X over Y", record the choice
and rationale here. Empty section if none.

## 8. Execution Sizing
Numeric estimates used by Phase 4 for single vs multi-executor dispatch
per `multi-executor-split.md`:
- programs_count: N
- includes_count: N
- total_mcp_writes (create+update+delete+activate): N
- text_elements_count: N
- ddic_objects_count: N
- split_recommendation: "single" | "2-way" | "3-way"
- split_strategy: "A (by program range)" | "B (by object class)" | "C (within single program)"

## Approval
(Auto-appended when the user provides an explicit approval keyword.)
- **Approved by**: <user input>
- **Timestamp**: <ISO 8601>
- **Keyword used**: <승인|approve|ok|...>
```

## User-facing message (verbatim template the skill emits)

> 📋 **Spec ready for review** — `.sc4sap/program/{PROG}/spec.md`
>
> Please read the spec end-to-end. When you are satisfied, reply with **one** of these approval keywords to unlock Phase 4 (Executor):
>
> - `승인` / `approve` / `approved` / `ok` / `proceed` / `go ahead` / `confirmed`
>
> Any other response (including "yes", "alright", "그냥 해", "빨리", "try it") is treated as **change request** — please describe what to revise.
