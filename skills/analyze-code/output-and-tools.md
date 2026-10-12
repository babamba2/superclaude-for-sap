# Output Format & MCP Tools

## Output Format

```
ABAP Code Analysis: ZCL_MY_CLASS
==================================
Lines analyzed: 247 | Methods: 12 | Callers: 8

CRITICAL (1)
  Line 45: SELECT * used on large table VBAP — specify explicit field list
  Fix: SELECT vbeln matnr kwmeng FROM vbap INTO TABLE @lt_items WHERE ...

MAJOR (3)
  Line 67: SELECT inside LOOP — moves DB call outside loop
  Line 112: sy-subrc not checked after MODIFY db_table
  Line 189: CONCATENATE used — replace with string template |...|

MINOR (2)
  Line 23: Variable lv_x has non-descriptive name
  Line 78: RAISE EXCEPTION TYPE cx_sy_... — prefer structured exception message

INFO (1)
  Line 1: CREATE OBJECT — prefer NEW (7.40+)

Quality Score: 6.2/10
Top fix: Eliminate SELECT inside LOOP (line 67) — highest performance impact

UNVERIFIED (1) — cited line did not contain the quoted code; not scored
  Line 140: "READ TABLE lt_vbap WITH KEY vbeln" — checker: line 140 is "ENDLOOP."
```

The UNVERIFIED block appears only when Step 2d failed at least one finding.

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
