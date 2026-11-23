# Phase 3.5 — Execution Mode Gate

Authoritative rule for the execution-mode selection that runs **between Phase 3 (spec approval) and Phase 4 (implementation)** in `/sc4sap:create-program`. Referenced from `agent-pipeline.md` and `SKILL.md`.

## Pipeline Position

```
Phase 1 ([trust-session bootstrap] → Interview) → … → Phase 3 (Spec) → [Spec Approval Gate] → Phase 3.5 (this file) → Phase 4 …
```

Phase 3.5 runs AFTER `spec.md` receives the explicit approval keyword, BEFORE any `Create*` / `Update*` MCP call of Phase 4.

**Note**: `trust-session` is NOT invoked here — it is invoked at the very start of Phase 1A so that even interview-time MCP calls (consultant SPRO lookups, `GetWhereUsed`, `SearchObject`) run without permission prompts. By the time Phase 3.5 runs, session trust is already in place.

## Steps

### Step 1 — Mode Selection Prompt

Display this verbatim to the user:

```
✅ Spec approved. Select execution mode:

  [1] auto    — Phase 4–8 runs unattended (recommended for simple CRUD/Report)
                 └ only pauses on error or Phase 6 BLOCKED verdict
                 └ business questions from the review are decided with the best option
                   and listed in the report (report.html) for you to check
  [2] manual  — prompts "proceed to Phase N?" at every phase transition
                 └ tool permission prompts already suppressed (trust-session active)
  [3] hybrid  — runs like auto, but stops to ask you the business questions
                 when the review has any (no phase-transition prompts)

Choice: 1 / 2 / 3  (default: 2)
```

### Step 1b — Live consultant review in Phase 4 (opt-in)

Ask only when `plan.md` has `module_set.length ≥ 2` (otherwise store `false` silently). Cost mode `eco` and unattended runs → `false`, no question.

```
Live consultant review while coding (Phase 4 Wave 2/3)?
  The <modules> consultants review each novel business-logic draft before activation.
  Phase 6 code review runs either way. Adds N consultant dispatches per wave — expensive.

  [n] off  (default)
  [y] on
```

`y` → Type B per [`team-mode-b.md`](team-mode-b.md); `n` / Enter → Type B never runs in this program.

### Step 2 — Persist Selection

Write the selection to `.sc4sap/program/{PROG}/state.json` under `execution_mode`, and the Step 1b answer under `consultant_live_review` (`true` | `false`). Also log phase timestamps here (see C-2 schema below).

### Step 3 — Mode Semantics

| Mode | Phase 4 | Phase 5 | Phase 6 | Phase 7 | Phase 8 | Business questions (Phase 6) | Tool prompt |
|------|---------|---------|---------|---------|---------|------------------------------|-------------|
| `auto` | run | run | run | run on fail | run | **auto-decided** — best option, listed in the report | suppressed |
| `manual` | prompt before | prompt before | prompt before | prompt before | prompt before | asked | suppressed |
| `hybrid` | run | run | run | run on fail | run | asked | suppressed |

**In ALL modes, permission prompts for MCP tools are suppressed** via `trust-session` (bootstrapped at Phase 1A). The prompts the user sees are the phase-transition confirmation (`manual` only) and the business questions (`manual` / `hybrid`) — never a tool approval.

Business questions are the `QUESTION` lines of the Phase 6 review — valid code whose correctness depends on business intent that `spec.md` / `interview.md` / `consult-{module}.md` / `decisions.md` (incl. the Step 1b live consultant review lines) / `plan.md` § *Conflict Resolutions* do not settle. Asking, the best-option rule and the records: [`../../common/review-questions.md`](../../common/review-questions.md) § 4–6; Phase 6 flow: [`phase6-output-format.md`](./phase6-output-format.md) § Business Questions. An unattended run (exactly as defined in `review-questions.md` § 4 — a slow or silent user is not one) treats `manual` / `hybrid` questions like `auto`.

### Step 4 — Manual-Mode Prompt Format

Between phases in `manual`, display:

```
✓ Phase {N-1} complete — {1-line summary}

Proceed to Phase {N}?
  [y] proceed   [s] skip (conditional phases only)   [a] abort — save state and exit
```

- `y` / Enter: run the next phase
- `s`: valid only for conditional phases — Phase 5 (testing scope = none) or Phase 7 (no failures). Required phases re-prompt.
- `a`: record the current phase in `state.json` and exit. The next run resumes from this phase.

## State.json Schema (C-2: Resume Support)

```json
{
  "prog": "ZFI_...",
  "execution_mode": "auto | manual | hybrid",
  "consultant_live_review": false,
  "phases": {
    "0_preflight":   { "status": "completed", "ts": "2026-04-18T10:00:00Z" },
    "1a_interview":  { "status": "completed", "ts": "..." },
    "1b_interview":  { "status": "completed", "ts": "..." },
    "2_planning":    { "status": "completed", "ts": "..." },
    "3_spec":        { "status": "completed", "ts": "...", "approved_at": "..." },
    "3_5_mode_gate": { "status": "completed", "ts": "..." },
    "4_implement":   { "status": "in_progress | completed | blocked", "ts": "..." },
    "5_qa":          { "status": "skipped | completed | blocked", "ts": "..." },
    "6_review":      { "status": "completed | blocked", "ts": "..." },
    "7_debug":       { "status": "skipped | completed", "ts": "..." },
    "8_report":      { "status": "completed", "ts": "...", "artifact_url": "https://claude.ai/artifact/… (first creation, result-artifact.md)" }
  },
  "objects_created": [ "..." ],
  "transport": "DEVK904224"
}
```

## Resume Behavior

On next `/sc4sap:create-program` invocation with the same `{PROG}`:
1. If `state.json` exists and has `execution_mode` set, skip Phase 0–3.5 re-prompting.
2. Find the first phase with `status != "completed" && status != "skipped"` — resume from there.
3. If user wants to restart a completed phase, they must delete the corresponding entry manually.

## Enforcement Contract

- Phase 4 Executor MUST refuse to run if `state.json.phases.3_5_mode_gate.status != "completed"`.
- If user picked `auto` or `hybrid` and a phase transition happens, the skill MUST NOT prompt — a prompt is a bug.
- If user picked `manual`, the skill MUST NOT auto-proceed — missing the confirmation is a bug.
- `auto` MUST NOT ask a business question — it applies the best option and records it (`review.md` § Questions, `decisions.md`, report § *Business questions decided automatically*); a silent decision is a bug.
- `manual` / `hybrid` MUST ask every business question before the Phase 6 fix loop — deciding one without the user (unless the run is unattended per `review-questions.md` § 4) is a bug.
- `trust-session` activation is always required regardless of mode.
