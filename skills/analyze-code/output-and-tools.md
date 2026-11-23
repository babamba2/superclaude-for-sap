# Output Format & MCP Tools

## Output Format

```
ABAP Code Analysis: ZCL_MY_CLASS
==================================
🛠 To fix: 7 · 💬 To answer: 1 — collected under To do
Review load: ●●●●○ 4/5 · about 30 min
Read: 247 lines (1 class, 12 methods) + 9 rule files
⚠ Not read: callers beyond the top 10, runtime data, customizing values — please check these yourself

🛠 To do
1. 💬 Question — ZCL_MY_CLASS:88 — Should one failed item stop the whole posting run? (COMMIT WORK per item) — confirm the intent
2. 🛠 Fix — Line 45: SELECT * on VBAP (CRITICAL)
3. 🛠 Fix — Line 67: SELECT inside LOOP (HIGH)
4. 🛠 Fix — Line 112: sy-subrc not checked after MODIFY (HIGH)
5. 🛠 Fix — Line 189: CONCATENATE → string template (HIGH)
6. 🛠 Fix — Line 23: non-descriptive name lv_x (MEDIUM)
7. 🛠 Fix — Line 78: unstructured exception message (MEDIUM)
+1 more

Lines analyzed: 247 | Methods: 12 | Callers: 8

CRITICAL (1)
  Line 45: SELECT * used on large table VBAP — specify explicit field list
  Fix: SELECT vbeln matnr kwmeng FROM vbap INTO TABLE @lt_items WHERE ...

HIGH (3)
  Line 67: SELECT inside LOOP — moves DB call outside loop
  Line 112: sy-subrc not checked after MODIFY db_table
  Line 189: CONCATENATE used — replace with string template |...|

MEDIUM (2)
  Line 23: Variable lv_x has non-descriptive name
  Line 78: RAISE EXCEPTION TYPE cx_sy_... — prefer structured exception message

LOW (1)
  Line 1: CREATE OBJECT — prefer NEW (7.40+)

Quality Score: 6.2/10
Top fix: Eliminate SELECT inside LOOP (line 67) — highest performance impact

QUESTIONS (1) — business intent; not scored
  Q1 Line 88: Should one failed item stop the whole posting run?
     If not intended: collect errors, one COMMIT WORK after the loop (HIGH) — answer: <after Step 3b>

UNVERIFIED (1) — cited line did not contain the quoted code; not scored
  Line 140: "READ TABLE lt_vbap WITH KEY vbeln" — checker: line 140 is "ENDLOOP."
```

Severity groups use the reviewer's labels as-is — `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` (same set as `workflow.md` Step 2 and the `FINDING sev=` line in `detect-judge.md`); never rename them to MAJOR / MINOR / INFO. Omit empty groups.

The UNVERIFIED block appears only when Step 2d failed at least one finding. The To do header and the QUESTIONS block follow [`../../common/review-questions.md`](../../common/review-questions.md) § 3 and § 5; QUESTIONS appears only when the reviewer returned a verified `QUESTION` line. Render the labels in the user's conversation language.

## MCP Tools Used

**Only `SearchObject` is called by the main thread (Step 1 intake verification).** Every other MCP tool below is called **by the `sap-code-reviewer` agent** or **the `sap-checker` workers** inside their dispatches (Step 2), keeping the orchestrator context light.

### Main thread
- `SearchObject` — verify object exists during Step 1 intake

### Reviewer agent (Opus, inside Step 2 dispatch)
- `GetClass` / `GetProgram` / `GetFunctionModule` / `GetInterface` / `GetView` — read source
- `GetProgFullCode` — full program source including includes
- `GetAbapAST` — parse tree and structural analysis
- `GetAbapSemanticAnalysis` — semantic and type analysis
- `GetWhereUsed` — usage scope and caller list
- `GetObjectInfo` — object metadata (package, transport, author)

### Checker workers (Haiku, Steps 2a / 2b / 2d)
- `GetIncludesList` + `GetProgram` / `GetInclude` / `GetClass` / `GetFunctionModule` / `GetInterface` — units, line counts, source for detect / verify
- `GetWhereUsed` — caller count for the size scout
