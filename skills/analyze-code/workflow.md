# analyze-code — Workflow

Referenced by `SKILL.md`. Orchestration is **Socratic intake on main + one delegated review dispatch + branching report + follow-up menu**.

## Step 1 — Identify Object (main thread · Haiku)

- If `ARGUMENTS` supplies the object: use directly (e.g., `ZCL_MY_CLASS CLAS`).
- Otherwise ask: *"Which ABAP object do you want to analyze? (name and type — class/program/FM/interface/CDS view)"*
- Verify existence with `SearchObject(<name>, <type>)`. On not-found, report and stop.

Exit condition: `<OBJECT_NAME>` + `<OBJECT_TYPE>` resolved and confirmed.

## Step 2 — Delegated Full Review (one `Agent(...)` dispatch to `sap-code-reviewer`)

Emit phase banner per `common/model-routing-rule.md` § Phase Banner Convention:
```
▶ phase=2 (reviewer) · agent=sap-code-reviewer · model=Opus 4.7
```

Dispatch the reviewer with a **minimal prompt** — the agent reads everything itself:
```
Agent({
  subagent_type: "sap-code-reviewer",
  description: "ABAP review — <OBJECT_NAME>",
  prompt: """
    Review ABAP object <OBJECT_NAME> (type: <OBJECT_TYPE>).

    1. Read the source via the appropriate MCP tool (GetClass / GetProgram / GetProgFullCode /
       GetFunctionModule / GetInterface / GetView).
    2. Run structural analysis: GetAbapAST, GetAbapSemanticAnalysis, GetWhereUsed.
    3. Load the 9 rule files listed in skills/analyze-code/analysis-dimensions.md
       and evaluate the 14 dimensions defined there.
    4. Return findings: severity (CRITICAL / HIGH / MEDIUM / LOW) · location (program:line) ·
       rule reference · description · concrete fix (with code example where helpful).
    5. Include summary metrics: total findings by severity · overall quality score (0–10)
       · top-3 highest-impact fixes.
    6. Also return a one-line `complexity_hint` classifying the review:
       - "canned"   → 0 CRITICAL AND < 10 total findings (simple template output)
       - "briefing" → ≥ 1 CRITICAL OR ≥ 10 findings (rich reader-facing report needed)

    Do NOT mutate or suggest write operations — analysis-only.
  """,
  mode: "dontAsk"
})
```

The reviewer agent already has the full MCP tool set and rule-file protocols (see [`../../agents/sap-code-reviewer.md`](../../agents/sap-code-reviewer.md) § Investigation_Protocol / § ABAP_Review_Checklist). **Main thread NEVER reads source / AST / semantic / where-used itself** — the reviewer owns that context.

On `BLOCKED` from the reviewer, surface the reason verbatim and stop.

## Step 3 — Report (branching on reviewer's `complexity_hint`)

Read the reviewer's `complexity_hint` (or compute it from severity counts if the field is missing: canned if `critical_count == 0 && total_findings < 10`, else briefing).

### Branch A — canned report (main thread · Haiku)

Default path. Main formats the reviewer's findings into the template defined in [`output-and-tools.md`](output-and-tools.md) § Output Format. No further dispatch.

### Branch B — rich briefing (dispatch `sap-writer` · Haiku 4.5)

Triggered when `complexity_hint = "briefing"`. Emit banner:
```
▶ phase=3.brief · agent=sap-writer · model=Haiku 4.5
```

Dispatch:
```
Agent({
  subagent_type: "sap-writer",
  description: "ABAP review briefing — <OBJECT_NAME>",
  prompt: """
    Render a reader-facing briefing for the code review of <OBJECT_NAME> (language =
    user's current conversation language; default Korean). Consume the reviewer's
    findings (attached below) — do NOT re-run MCP reads.

    Required sections (Markdown, 25–40 lines):
    1. **🧭 Summary** — object name · lines · methods · callers · overall score.
    2. **🚨 Critical & High** — for each: location · root cause · why it matters ·
       concrete fix (code example).
    3. **🟡 Medium** — concise one-liner each.
    4. **🔗 Where-Used impact** — callers count + high-blast-radius call-outs.
    5. **✅ Top 3 impactful fixes** — ordered by estimated impact, not severity.
    6. **▶ Next step hint** — one line pointing to `UpdateClass`/`UpdateProgram` or
       `/sc4sap:create-program` for full rewrite.

    Rules:
    - Do NOT re-fetch the object via MCP.
    - Do NOT restate the full findings list (Branch A covers raw enumeration).
    - Be concrete: prefer "SELECT * on VBAP inside LOOP — move to FOR ALL ENTRIES above the LOOP"
      over "performance could be improved".

    Reviewer findings follow:
    <FULL_FINDINGS_JSON>
  """,
  mode: "dontAsk"
})
```

On writer BLOCKED → fallback to Branch A (canned) and log `briefing: "fallback_to_canned: <reason>"` in the skill's response metadata.

## Step 4 — Action Menu (main thread · Haiku)

After the report (canned or briefing), offer:

1. **"Fix findings"** — explain options: manual `UpdateClass` / `UpdateProgram` / `UpdateInclude`, full rewrite via `/sc4sap:create-program`, or dispatch `sap-executor` here. If user picks executor delegation, emit banner `▶ phase=4.fix · agent=sap-executor · model=Sonnet 4.6` and dispatch.
2. **"Show where-used callers"** — display from the reviewer's where-used data (already in the response).
3. **"Explain finding #N in more detail"** — Haiku main re-reads the specific finding entry and expands it.
4. **"Save report to `.sc4sap/analysis/<object>-<timestamp>.md`"** — Haiku main writes to file.

Stop on user selection or silence.
