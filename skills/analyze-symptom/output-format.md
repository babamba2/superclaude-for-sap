# Output Format — analyze-symptom

Report template for each analysis round of `/sc4sap:analyze-symptom`. Referenced from `SKILL.md`.

Written once, by the `sap-debugger` dispatch, in the user's language — the main thread relays it verbatim (see `workflow-steps.md` § Step 3). Omit sections that would be empty — except Evidence, Decisions & Assumptions and Still check by hand in the Final Round, which always appear (write "None" where there is nothing; a confirmed `quick-dump` round keeps them to one line each). A `quick-dump` round whose cause is confirmed goes straight to the Final Round structure; keep it proportionate to the problem.

## Per-Round Structure

Each analysis round follows this structure:

```
## 📊 Symptom Analysis — Round N

### 🌐 Known Issues (only when a web lookup ran — leads, not findings)
- [{title}]({url}) — {why it may apply / whether the system evidence below matches}

### ✅ Evidence Collected via MCP
- **System**: {SID} / {client} / {release} / {SP} / {user}
- **Findings** (tool + target + returned value, quoted — not paraphrased):
  - {tool} {target} → {returned value} — {what it shows}
  - ...

### 🧭 Your Hypothesis (only when the user gave one)
- "{USER_HYPOTHESIS}" — CONFIRMED / REFUTED / NOT TESTABLE — {deciding evidence line, or what would decide it}

### 🎯 Current Hypotheses (by confidence)
1. **[Category] {Hypothesis summary}** — Confidence: High / Medium / Low
   - Evidence: {MCP findings / user answers}
   - Confirmation: {next verification step}
2. **[Category] ...** — Confidence: ...
3. ...

### ❓ Questions for You (max 3)
1. {Question 1}
2. {Question 2}

### 🔍 SAP Note Search Keywords (priority-ordered)
- "{exact error message}"
- {message class} {message number}
- {program / class name}
- {component} {keyword}

### 👉 Next Steps
- ✅ Can do now: {additional MCP queries / local actions}
- ⏳ After your input: {what requires the user's answers}
- 🚨 Escalation candidates: {target} — reason: {why}
```

## Final Round

In the final round (no open questions), produce a consolidated report with final hypothesis, SAP Note strategy, and recommended action list. Structure:

```
## 🏁 Final Analysis — {symptom summary}

### Evidence
- {tool} {target} → {returned value} — supports / contradicts / not run (relative to the root cause)
  ↳ does not prove: {what this evidence cannot show}

### Root Cause
- **Category**: {one of 8 framework categories}
- **Confirmed evidence**: {refer to the Evidence lines above — claim nothing they do not show}
- **Confidence**: High / Medium / Low
- **Your hypothesis**: {CONFIRMED / REFUTED / NOT TESTABLE — one line; omit when the user gave none}

### Decisions & Assumptions
- {scope choice the analysis made on its own — mode, time window, paths skipped, data assumed} — why: {reason} · to change: {what to ask for}

### SAP Note Search Strategy
- Known issues found: {web hits that the system evidence confirmed, with URL — "none matched", or omit when no lookup ran}
- Primary keywords: {ordered list}
- Recommended Notes portal queries: {2–3 concrete search strings}

### Proposed fix — not applied
{Only when the cause is in custom code: a minimal code block and where it goes. This skill never applies it.}

### Recommended Actions
1. {action 1 — owner, urgency}
2. {action 2}
3. ...

### Escalation (if any)
- Target: {Basis / Development / SAP Support / Functional}
- Reason: {why}
- Artifacts to attach: {dump ID, TR number, screenshot refs}

### Still check by hand
- {the one thing a person should verify before relying on this — e.g. re-run the transaction with the same data after the fix}
```

Rules for Evidence, Decisions & Assumptions and Still check by hand: [`../../common/verification-evidence.md`](../../common/verification-evidence.md).

## Round Counter

Track round number in memory across the conversation. Do not persist to file — each `/sc4sap:analyze-symptom` invocation starts at Round 1.
