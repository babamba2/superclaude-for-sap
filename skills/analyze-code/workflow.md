# analyze-code — Workflow

Referenced by `SKILL.md`. Orchestration is **Socratic intake on main + a size-gated delegated review (scout → reviewer or detectors + judge → evidence verify) + branching report + follow-up menu**.

## Step 1 — Identify Object (main thread)

- If `ARGUMENTS` supplies the object: use directly (e.g., `ZCL_MY_CLASS CLAS`).
- Otherwise ask: *"Which ABAP object do you want to analyze? (name and type — class/program/FM/interface/CDS view)"*
- Verify existence with `SearchObject(<name>, <type>)`. On not-found, report and stop.

Exit condition: `<OBJECT_NAME>` + `<OBJECT_TYPE>` resolved and confirmed.

## Step 2 — Delegated Review (size-gated)

Order: **2a size scout (Haiku) → review → 2d evidence verify (Haiku)**. Steps 2a / 2b / 2c / 2d are specified in [`detect-judge.md`](detect-judge.md).

- Scout reports **≤ 1,500 lines**, or is `BLOCKED` for a reason other than size → the single-reviewer dispatch below.
- Scout reports **> 1,500 lines**, or `BLOCKED reason="scope too large…"` → detector fan-out (2b) + Opus judge (2c) instead of the single reviewer.
- Either path → Step 2d evidence verify on the returned `FINDING` lines.

### Single-reviewer path

Emit phase banner per `common/model-routing-rule.md` § Phase Banner Convention:
```
▶ phase=2 (reviewer) · agent=sap-code-reviewer · model=Opus
```

Dispatch the reviewer with a **minimal prompt** — the agent reads everything itself:
```
Agent({
  subagent_type: "sc4sap:sap-code-reviewer",
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
       Give every finding a FINDING line in the format of
       skills/analyze-code/detect-judge.md § Finding line format (verbatim evidence quote;
       line numbers relative to the include / class / FM, not to GetProgFullCode output).
    5. Include summary metrics: total findings by severity · overall quality score (0–10)
       · top-3 highest-impact fixes.

    Do NOT mutate or suggest write operations — analysis-only.
  """
})
```

The reviewer agent already has the full MCP tool set and rule-file protocols (see [`../../agents/sap-code-reviewer.md`](../../agents/sap-code-reviewer.md) § Investigation_Protocol / § ABAP_Review_Checklist). **Main thread NEVER reads source / AST / semantic / where-used itself** — the reviewer owns that context.

On `BLOCKED` from the reviewer (or the judge in 2c), surface the reason verbatim and stop.

After Step 2d, the report in Step 3 counts only verified findings; failed ones go to a closing **Unverified** section with the checker's evidence line.

**teamMode variant (Type B)** — after the reviewer (or judge) returns and Step 2d has run, if its **verified** findings include ≥ 1 business-alignment finding (business purpose, business-rule faithfulness, or cross-module side-effects — judged by the reviewer, not by dimension number) AND the object touches 2+ modules: with the `team` argument, run Type B teamMode per [`team-mode.md`](team-mode.md) BEFORE Step 3; otherwise write the Step 3 report first (business-alignment findings tagged `consultant review recommended`) and then offer the review (opt-in, see `SKILL.md` `<Team_Mode>`). Consultants live-validate the reviewer's interpretation; the final report in Step 3 then carries "peer-validated" / "peer-refined" / "residual-divergence" annotations.

## Step 3 — Report (branching on verified counts)

Compute the branch from the findings left after Step 2d (Unverified ones excluded): **canned** if `critical_count == 0 && total_findings < 10`, else **briefing**.

### Branch A — canned report (main thread)

Default path. Main formats the reviewer's findings into the template defined in [`output-and-tools.md`](output-and-tools.md) § Output Format. No further dispatch.

### Branch B — rich briefing (main thread, no dispatch)

Triggered when the verified counts give **briefing** (≥ 1 CRITICAL or ≥ 10 findings). The main thread renders the briefing directly from the reviewer's findings (user's conversation language) — no extra agent, no MCP re-reads.

Required sections (Markdown, 25–40 lines):
1. **🧭 Summary** — object name · lines · methods · callers · overall score.
2. **🚨 Critical & High** — for each: location · root cause · why it matters · concrete fix (code example).
3. **🟡 Medium** — concise one-liner each.
4. **🔗 Where-Used impact** — callers count + high-blast-radius call-outs.
5. **✅ Top 3 impactful fixes** — ordered by estimated impact, not severity.
6. **▶ Next step hint** — one line pointing to `UpdateClass`/`UpdateProgram` or `/sc4sap:create-program` for a full rewrite.

Rules: do NOT restate the full findings list (Branch A covers raw enumeration); be concrete — prefer "SELECT * on VBAP inside LOOP — move to FOR ALL ENTRIES above the LOOP" over "performance could be improved".

## Step 4 — Action Menu (main thread)

After the report (canned or briefing), offer:

1. **"Fix findings"** — explain options: manual `UpdateClass` / `UpdateProgram` / `UpdateInclude`, full rewrite via `/sc4sap:create-program`, or dispatch `sap-executor` here. If user picks executor delegation, emit banner `▶ phase=4.fix · agent=sap-executor · model=Sonnet` and dispatch.
2. **"Show where-used callers"** — display from the reviewer's or judge's where-used data (already in the response; on the judge path it may be only the top 10 — say so).
3. **"Explain finding #N in more detail"** — main re-reads the specific finding entry and expands it.
4. **"Save report — Markdown / HTML / both"** — main writes `.sc4sap/analysis/<object>-<timestamp>.md` (the report as rendered in Step 3). For HTML, convert it with `node "<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs" <that .md> <same path .html>` (`<PLUGIN_ROOT>` = two levels above this skill folder; one self-contained file); for HTML only, delete the `.md` afterwards.

Stop on user selection or silence.
