# Phase 6 — Bucket Parallelization + Model Escalation

Authoritative rule for how `sap-code-reviewer` runs Phase 6 reviews in parallel buckets with a Sonnet→Opus escalation ladder. Referenced from `phase6-review.md`.

## Goal

Cut Phase 6 wall-clock time by ~50% and Opus token cost by ~70% without losing review depth. Achieved by splitting the 12-item checklist into 4 independent buckets run on Sonnet in parallel, escalating to Opus only when MAJOR findings appear.

## Bucket Definition

The 12 convention items in `phase6-review.md` are split into 4 buckets. Each bucket is reviewed by a separate `Agent({subagent_type: "sc4sap:sap-code-reviewer", model: "sonnet", ...})` dispatched in parallel.

| Bucket | Items (from phase6-review.md) | Scope |
|--------|-------------------------------|-------|
| **B1 — ALV + UI** | #1 alv-rules, #2 text-element-rule | ALV field catalog, Docking vs Custom Control, text-Txx, MESSAGE literals |
| **B2 — Logic Hygiene** | #3 constant-rule, #8 clean-code (shared baseline + paradigm-specific file) | Magic literals, SY-SUBRC, SELECT *, inline decl, commented code. B2 reviewer reads `interview.md` Paradigm dimension first, then loads `clean-code.md` + either `clean-code-oop.md` OR `clean-code-procedural.md` accordingly — never both. |
| **B3 — Structure + Naming** | #4 procedural-form-naming, #5 oop-pattern, #6 include-structure, #7 naming-conventions | Include suffix, class split, Z prefix, `_{screen_no}` FORM |
| **B4 — Platform + Config** | #9 abap-release-reference, #10 sap-version-reference, #11 spro-lookup, #12 activation-state | Release-allowed syntax, ECC vs S/4, SPRO tables, inactive objects |

## Parallel Dispatch

Parallel (single message, 4 tool-use blocks). Each call uses full JSON form:

```
Agent({
  subagent_type: "sc4sap:sap-code-reviewer",
  model: "sonnet",
  description: "Phase 6 review — bucket B1 (ALV + UI)",
  prompt: "Review bucket B1 covering items [1,2] (alv-rules, text-element-rule). See phase6-review.md for item specs and phase6-buckets.md for bucket scope.",
  mode: "dontAsk"
})
Agent({
  subagent_type: "sc4sap:sap-code-reviewer",
  model: "sonnet",
  description: "Phase 6 review — bucket B2 (Logic Hygiene)",
  prompt: "Review bucket B2 covering items [3,8] (constant-rule, clean-code). Read interview.md Paradigm dimension first; then load clean-code.md + one of clean-code-oop.md / clean-code-procedural.md accordingly.",
  mode: "dontAsk"
})
Agent({
  subagent_type: "sc4sap:sap-code-reviewer",
  model: "sonnet",
  description: "Phase 6 review — bucket B3 (Structure + Naming)",
  prompt: "Review bucket B3 covering items [4,5,6,7] (procedural-form-naming, oop-pattern, include-structure, naming-conventions).",
  mode: "dontAsk"
})
Agent({
  subagent_type: "sc4sap:sap-code-reviewer",
  model: "sonnet",
  description: "Phase 6 review — bucket B4 (Platform + Config)",
  prompt: "Review bucket B4 covering items [9,10,11,12] (abap-release-reference, sap-version-reference, spro-lookup, activation-state).",
  mode: "dontAsk"
})
```

Each bucket agent:
1. Fetches source of all created objects via MCP (`GetInclude`, `GetProgram`, etc.)
2. Runs its subset of checklist items
3. Writes verdict to `.sc4sap/program/{PROG}/review-bucket-{B1|B2|B3|B4}.md`
4. Classifies each finding: `PASS` / `MINOR` / `MAJOR`

Wait for all 4 buckets. Merge into consolidated `review.md`.

## Finding Classification

- **PASS** — no violation found
- **MINOR** — violation exists but non-blocking (e.g., a TEXT-Txx missing an optional tooltip). Reviewer fixes in-place via `Update*` and records `FIX-APPLIED`.
- **MAJOR** — violation blocks Phase 8 (e.g., manual LVC_T_FCAT build, Docking replaced by Custom Control, ECC-deprecated pattern on S/4). Escalate per below.

## Model Escalation (6-3)

After all 4 buckets finish, count MAJOR findings:

| MAJOR count | Action |
|-------------|--------|
| **0** | Skip Opus. Merge bucket outputs into `review.md`, final verdict `✅ ALL PASS`. Proceed to Phase 8. |
| **1–2** | Dispatch `Agent({subagent_type: "sc4sap:sap-code-reviewer", model: "opus", mode: "dontAsk", ...})` **scoped only to the MAJOR findings** — pass finding list + affected object names. Opus re-reviews, attempts fix via `Update*` (up to 3 iterations per finding), writes final verdict to `review.md`. |
| **3+** | Dispatch Opus with full context (all 4 bucket reports + source). Opus decides whether to auto-fix or BLOCK. If BLOCK, write `review.md` with `❌ BLOCKED` and surface to user. |

Rationale: Sonnet is accurate enough to *detect* convention violations; Opus is reserved for *synthesizing fixes across multiple related findings* where reasoning depth matters.

## Merge Algorithm

After buckets (and optional Opus pass) complete:

1. Read all 4 `review-bucket-{B*}.md` files
2. If Opus escalation ran, read its output too
3. Build consolidated `review.md` using the template in `phase6-review.md`, but with an added header:
   ```markdown
   **Review Strategy**: 4-bucket parallel (Sonnet) + {Opus escalation: yes/no, N findings}
   **Buckets**: B1 ALV+UI, B2 Logic, B3 Structure, B4 Platform
   **Timing**: parallel_sec={T1}, opus_sec={T2}, total_sec={T1+T2}
   ```
4. Delete the per-bucket files (they remain in git history if versioned; otherwise clean up to avoid clutter)

## Failure Handling

- If any bucket agent crashes or times out: retry that bucket ONCE with the same model. On second failure, escalate to Opus immediately for that bucket's scope.
- If bucket verdicts conflict (e.g., B2 says constant-rule PASS, B3 says naming-conventions MAJOR on the same constant name): treat as MAJOR and include in Opus escalation.
- If user is in `manual` execution mode: after bucket parallel run, prompt before dispatching Opus escalation — user may choose to review MAJOR findings themselves instead.

## State.json Recording

```json
"6_review": {
  "status": "completed | blocked",
  "ts": "...",
  "strategy": "4-bucket-parallel",
  "buckets": {
    "B1": { "verdict": "PASS", "sec": 12 },
    "B2": { "verdict": "MINOR", "sec": 10, "findings": 1 },
    "B3": { "verdict": "MAJOR", "sec": 15, "findings": 2 },
    "B4": { "verdict": "PASS", "sec": 8 }
  },
  "opus_escalation": { "ran": true, "fixed": 2, "sec": 45 },
  "total_sec": 60
}
```

## Compatibility with Manual Mode

In `manual` / `hybrid` execution mode, the bucket parallel run itself is NOT interrupted mid-flight — the user confirmation happens BEFORE Phase 6 starts (Phase 5→6 transition). Once Phase 6 is approved to start, the 4 buckets run to completion, then the Opus escalation decision is either automatic (auto mode) or prompted (manual/hybrid mode).
