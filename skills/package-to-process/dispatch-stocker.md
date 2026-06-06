# Dispatch — Step 2 (sap-stocker)

Referenced by `workflow.md` § Step 2. Fires **conditionally** only when `<INVENTORY_PATH>` does not exist. Dispatch uses `mode: "dontAsk"` and the agent's frontmatter model (Sonnet 4.6).

## State variables
- `<PACKAGE>` — uppercase Z-package name (e.g., `ZMM_MAIN`)
- `<MODULE>` — module key (`MM`, `SD`, …)
- `<INVENTORY_PATH>` — `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`

## Prompt body

```
Agent({
  subagent_type: "sc4sap:sap-stocker",
  description: "CBO inventory (auto-chain from package-to-process) — <PACKAGE>",
  prompt: """
    You are invoked by /sc4sap:package-to-process because <INVENTORY_PATH> is
    missing. Stock the CBO package <PACKAGE> (module <MODULE>) following your
    full Investigation_Protocol steps 2–8 (walk → graph → classify → interpret
    → cross-module gap → safety → persist).

    Flagship programs: none provided (caller will derive entry points in Step 3).
    Treat this as a normal inventory run — write
    .sc4sap/cbo/<MODULE>/<PACKAGE>/index.md and inventory.json.

    Return the standard success block OR `BLOCKED: <reason>`.

    Constraints (caller-enforced):
    - DO NOT call GetTableContents or GetSqlQuery (read-only).
    - DO NOT engage the user (caller owns the conversation).
  """,
  mode: "dontAsk"
})
```

## Failure handling

- On `BLOCKED: <reason>` → main thread STOPS, surfaces the reason verbatim, and asks the user how to proceed. No Step 3 attempted.
- On success but missing `inventory.json` file at the expected path → STOP and surface a `Stocker reported success but inventory.json not found at <path>` message; do not retry silently.
