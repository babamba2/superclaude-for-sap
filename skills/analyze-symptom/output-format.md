# Output Format — analyze-symptom

Report template for each analysis round of `/sc4sap:analyze-symptom`. Referenced from `SKILL.md`.

Written once, by the `sap-debugger` dispatch, in the user's language — the main thread relays it verbatim (see `workflow-steps.md` § Step 3). Omit sections that would be empty. A `quick-dump` round whose cause is confirmed goes straight to the Final Round structure; keep it proportionate to the problem.

## Per-Round Structure

Each analysis round follows this structure:

```
## 📊 Symptom Analysis — Round N

### 🌐 Known Issues (web lookup — leads, not findings)
- [{title}]({url}) — {why it may apply / whether the system evidence below matches}

### ✅ Evidence Collected via MCP
- **System**: {SID} / {client} / {release} / {SP} / {user}
- **Findings**:
  - {Finding 1 — MCP tool used}
  - {Finding 2 — MCP tool used}
  - ...

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

### Root Cause
- **Category**: {one of 8 framework categories}
- **Confirmed evidence**: {list}
- **Confidence**: High / Medium / Low

### SAP Note Search Strategy
- Known issues found: {web hits that the system evidence confirmed, with URL — or "none matched"}
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
```

## Round Counter

Track round number in memory across the conversation. Do not persist to file — each `/sc4sap:analyze-symptom` invocation starts at Round 1.
