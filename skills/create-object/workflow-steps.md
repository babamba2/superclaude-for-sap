# create-object Workflow Steps

Referenced from `SKILL.md` → `<Workflow_Steps>`. Main thread runs Haiku 4.5; object creation / implementation / activation and the final report are delegated to agents so the orchestrator stays light.

Full Agent prompt bodies live in [`dispatch-prompts.md`](dispatch-prompts.md) (kept separate to honor the 200-line cap).

## Step 0 — Trust Session (skill-to-skill, Haiku)

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:create-object`. Skip silently if already trusted within 24h.

## Step 1 — Classify Object Type (main thread, Haiku)

- Parse user request to determine object type (class / interface / program / function module / table / structure / data element / domain / CDS view / service definition / service binding / behavior definition / screen / GUI status).
- If ambiguous: ask a single clarifying question and stop.

## Step 2 — Collect Metadata (main thread, Haiku)

- **Object name**: suggest based on description; enforce `Z`/`Y` prefix, ≤ 30 chars, uppercase, no special chars except underscore. Reject generic names (`ZTEST` / `ZTEMP` / `ZDUMMY`).
- **Short description**: 1 line, ≤ 60 chars.
- **Package**: show recent packages or search via `GetPackage`; warn if `$TMP` (local, non-transportable).
- **Transport**: list open transports owned by current user via `ListTransports`; offer create-new if no suitable TR exists.
- **Module-active context** (conditional): when the object targets a specific module (MM table, SD structure, PS data element, …), read `SAP_ACTIVE_MODULES` from `sap.env` / `config.json` and consult `common/active-modules.md`. If companion modules are active, propose integration fields (e.g., MM table in a landscape with PS active → suggest `PS_POSID` / `AUFNR`). User accepts/declines; pass the confirmed field list to the executor dispatch.

## Step 3 — Pre-Creation Check (main thread, Haiku)

- Call `SearchObject(<name>, <type>)` to verify the name does NOT already exist.
- If it exists: *"Object {name} already exists. Modify via direct MCP `Update*` calls (`UpdateClass`, `UpdateProgram`, `UpdateInclude`, etc.)."* Stop.

## Step 3.5 — Version Branch Decision (main thread, Haiku)

- Read `SAP_VERSION` from `.sc4sap/config.json` (or `sap.env`).
- If `SAP_VERSION = ECC` **and** object type ∈ {Table, Data Element, Domain} → go to Step 4-ECC.
- Otherwise → go to Step 4 (standard flow).

## Step 4 + 5 + 6 — Create + Implement + Activate (one `sap-executor` dispatch, Opus override)

**Standard flow (S/4HANA, or non-DDIC on ECC).** Single dispatch covers object creation, initial implementation code, and activation — no round-trip to the main thread between them. Opus override is required because Step 5 is novel code generation per `common/model-routing-rule.md` § Tier 2 (field typing priority 1–4, class/FM body, etc.).

Emit phase banner:
```
▶ phase=4 (executor-create) · agent=sap-executor · model=Opus 4.7
```

Dispatch shape:
```
Agent({
  subagent_type: "sap-executor",
  model: "opus",                    // override base Sonnet
  description: "Create + implement <TYPE> <NAME>",
  prompt: "<standard-flow prompt per dispatch-prompts.md § Step 4+5+6>",
  mode: "dontAsk"
})
```

On `BLOCKED` or `FAILED` activation: main surfaces the error verbatim via Step 7 writer (flow = `failed`); do NOT retry from main.

## Step 4-ECC — DDIC Helper Program (one `sap-executor` dispatch, Opus override)

**ECC branch only** (SAP_VERSION=ECC + Table/DTEL/DOMA). The DDIC object itself cannot be created via MCP on ECC; the executor generates a helper ABAP program the user runs in SE38.

Emit phase banner:
```
▶ phase=4-ECC (executor-helper) · agent=sap-executor · model=Opus 4.7
```

Dispatch shape:
```
Agent({
  subagent_type: "sap-executor",
  model: "opus",
  description: "ECC DDIC helper — <TYPE> <NAME>",
  prompt: "<ecc-helper prompt per dispatch-prompts.md § Step 4-ECC>",
  mode: "dontAsk"
})
```

## Step 7 — Completion Report (one `sap-writer` dispatch, Haiku)

Pure formatting from the executor's structured return. Writer localizes to the user's current conversation language. For ECC fallback, uses the MANDATORY verbatim format (do NOT rephrase the ⚠ header + 3-step SE38/SE11 checklist).

Emit phase banner:
```
▶ phase=7 (report) · agent=sap-writer · model=Haiku 4.5
```

Dispatch shape:
```
Agent({
  subagent_type: "sap-writer",
  description: "Create-object completion report",
  prompt: "<report prompt per dispatch-prompts.md § Step 7>",
  mode: "dontAsk"
})
```

## Safety Rails

- ECC DDIC: NEVER call `CreateTable` / `CreateDataElement` / `CreateDomain` when `SAP_VERSION = ECC` — enforced in the Step 4-ECC executor prompt.
- Field typing: NEVER emit `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` or any other raw-primitive declaration where an authoritative SAP Data Element exists — enforced by `common/field-typing-rule.md`.
- FM signature: NEVER emit the placeholder `" You can use the template 'functionModuleParameter' ..."` line, never use `*"*"Local Interface:` blocks as a substitute — enforced by `common/function-module-rule.md`.
- Naming: validated by main before dispatch (Step 2); executor performs a second-pass check and refuses on violation.
