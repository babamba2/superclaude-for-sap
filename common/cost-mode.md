# Cost Mode — standard vs eco

Decides how much a `/sc4sap:*` skill run may spend. `standard` is the current behavior (quality first). `eco` lowers cost by changing **models and effort only** (sub-agent model/effort, main-thread effort, which model reads large sources); the deliverable is the same as standard. Safety rules never change between modes.

Measured basis (2026-10, 33 runs): ~91% of cost is cache (re-read 54%, write 37%), output 9%. Most cost sits on the main thread, so lowering sub-agent effort alone saves 0–5%. eco therefore also cuts **call count** and **context size**.

## Setting

| Item | Value |
|---|---|
| File | `~/.sc4sap/preferences.json` (user-level, same file as `modelDispatch`) |
| Keys | `costMode`: `standard` (default) \| `eco` · `costModeBySkill`: `{ "<skill>": "standard" \| "eco" }` |
| Edited via | `/sc4sap:sap-option` → "cost mode" (see [`../skills/sap-option/cost-mode.md`](../skills/sap-option/cost-mode.md)) |
| One-off | `/sc4sap:eco <skill> <args>` — runs one skill in eco without changing the file |

```json
{ "modelDispatch": "auto", "costMode": "standard", "costModeBySkill": { "program-to-spec": "eco" } }
```

Missing file / key, bad JSON, unknown value → `standard`. Never fail a skill because of this file.

## Resolution — once per skill run

Resolve before the first dispatch and keep the result for the whole run, continuation turns included:

1. Run argument `--eco` / `--standard` (also when entered via `/sc4sap:eco`, which implies `--eco`).
2. `costModeBySkill[<skill name without prefix>]`.
3. `costMode`.
4. `standard`.

Read the file in the same step as the `modelDispatch` read (one `Read` of `preferences.json`). Strip `--eco` / `--standard` from the arguments before the skill parses them.

## standard

Change nothing. Agent frontmatter `model:` / `effort:` and the skill MD's own overrides apply as written. Do not pass `effort` on `Agent(...)` calls in standard unless the skill MD says so (today: `config-to-document` Step 4 notes writer, `effort: "medium"`).

## eco — lever A: sub-agent model and effort (per call)

Pass both `model` and `effort` explicitly on every `Agent(...)` call — **never omit `effort` in eco**: without it the agent runs at its frontmatter effort (usually `high`), which was the most common eco miss in measurement. The per-call `effort` parameter overrides the agent's frontmatter (verified 2026-10-26: request `output_config.effort` follows the call).

| Role (agent) | standard (frontmatter / skill MD) | eco |
|---|---|---|
| `sap-planner` | Opus · xhigh | Opus · medium |
| `sap-executor` — novel code | Opus · high | Opus · medium |
| `sap-executor` — template / bulk | Sonnet · high | Sonnet · low |
| `sap-writer` | Haiku, no effort (skill MDs override to Sonnet / Opus) | Haiku, no effort; an Opus override becomes Sonnet · low |
| `sap-code-reviewer` (reviewer or judge) | Opus · high | Sonnet · medium — MAJOR/CRITICAL findings re-judged on Opus · medium |
| `sap-analyst`, `sap-architect`, `sap-critic` | Opus · high | Sonnet · low |
| module consultants, `sap-bc-consultant` | Opus · high | Sonnet · low |
| `sap-debugger` | Sonnet · high (skill MDs may override to Opus) | Sonnet · medium |
| `sap-qa-tester` | Sonnet · high (skill MDs may override to Opus) | Sonnet · medium |
| `sap-stocker`, `sap-doc-specialist` | Sonnet · medium | Sonnet · low |
| `sap-checker` | Haiku | Haiku (unchanged; no `effort`) |

- `BLOCKED` from an eco-lowered agent → re-dispatch the same scope as standard would (the skill MD override, else the agent frontmatter), findings attached; from there the Opus escalation in `model-routing-rule.md` § Escalation pattern applies. Emit the escalation banner.
- `modelDispatch=user-defined` still asks the model; the eco row is the recommendation, and the eco `effort` is passed with whatever model the user picks.
- Prefer at most two model axes per run (Sonnet + Haiku) where the table allows — caches are per model. The novel-code Opus rows and MAJOR re-judges are allowed exceptions.

## eco — lever B: main-thread effort

The main thread's model cannot be changed by a skill (SKILL.md `model:` is ignored — verified 2026-10-26). Its effort can: a skill with `effort: low` frontmatter lowers the session effort while it is active, but the effect **ends at the next user turn**.

- Entered via `/sc4sap:eco` (arguments carry `--via-eco`) → effort is already low for the first turn; skip the first attach.
- Resolved to eco any other way (preferences, `--eco`) → as the first action, invoke `Skill("sc4sap:eco", "--attach")`. It only sets effort and returns.
- **Every continuation turn** of an eco run (the user answered a question, approved a step) → invoke `Skill("sc4sap:eco", "--attach")` as the first action of that turn, then continue.
- Keep interview turns to at most one question round in eco: ask everything you need in one `AskUserQuestion` call (up to 4 questions), defaulting the rest.

## eco — lever C: same output, per skill

**eco changes models and effort only. The deliverable is identical to standard** — same depth, formats, scenarios, steps, English companion, consultant notes, review and QA scope. Never drop or shorten content to save cost.

| Skill | Status |
|---|---|
| `program-to-manual`, `package-to-process`, `compare-programs`, `config-to-document`, `create-program` | eco variant (levers A, B, D). `create-program`: novel business-logic code stays on Opus (medium). |
| `setup`, `sap-option`, `sap-doctor`, `mcp-setup`, `trust-session` | No eco variant — run as standard. |
| `program-to-spec`, `ask-consultant`, `analyze-symptom`, `analyze-code`, `interface-mapping-spec`, `smartform-preview`, `smartform-from-pdf`, `project-dashboard`, `role-matrix`, `analyze-cbo-obj`, `create-object` | **No eco variant — run as standard** (measured 2026-10-26: saving below ~20%, or a large quality loss — fewer review findings, wrong environment, thinner inventory, a spec at one third of the content with no screens; `create-object` / `smartform-from-pdf` dispatch little or no sub-agent work). |

## eco — lever D: context size

- **Eco moves source reading, it never drops it.** Every object whose source standard would read (scouts, stocker walk, analyst evidence) is still read in eco — by `sap-checker` scouts on Haiku. A document whose flows are inferred from names instead of read source is a failed eco run.
- Do not pull large MCP results into the main thread **beyond what the skill's step files assign to it**. Reads a step file gives the main thread (e.g. program-to-spec Step 1 source and screens) stay there. Extra large reads (source over ~300 lines, DDIC of more than 5 objects, package listings) go to a `sap-checker` scout.
- Delegate reading only to `sap-checker` (it has the source and DDIC tools). Never hand a read to `sap-analyst`, `sap-writer`, `sap-planner` or a module consultant — their tool lists have no source readers (observed 2026-10-26: the analyst returned "tools not available" and the run fell back to `general-purpose`).
- Prefer `output: "file"` style results / local files and read only the needed range.
- Reuse existing artifacts (`.sc4sap/cbo/**/inventory.json`, earlier specs, `spro-config.json`) instead of re-reading SAP.
- Batch independent tool calls in one message; no re-reads to "double check" a local file just written (SAP syntax, activation and inactive-object checks still run).

## Never changes in eco

- Reply language: every message, banner text and final report in the language of the user's request (or the document language), exactly as standard — eco shortens answers, it never switches them to English.
- Environment context: read the profile `config.json` / `sap.env` (SAP version, ABAP release, industry, country, active modules) as standard does — answers stay specific to the connected system.
- PreToolUse hooks, blocklist, `acknowledge_risk` rules, QA/PRD read-only.
- Transport and package confirmation, activation, syntax check, inactive-object check.
- Data-extraction approval (`GetTableContents` / `GetSqlQuery` prompts).
- User visual verification steps after SAP mutations.

## Display

- Response prefix: append `· Mode: eco` → `[Model: Opus 5.5 · Dispatched: Sonnet×1 · Mode: eco]`. Standard adds nothing.
- Phase banner: append the effort in eco → `▶ phase=2 (planner) · agent=sap-planner · model=Opus · effort=medium · eco`.
- Final report of an eco run: no "skipped" line — eco skips nothing.

## Non-interactive runs

`claude -p` and other headless runs resolve the mode the same way. Lever B's continuation rule does not apply (single turn).
