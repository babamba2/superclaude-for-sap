# package-to-process — Workflow (Steps 0–3)

Referenced by `SKILL.md`. Steps 4–7 continue in [`workflow-render.md`](workflow-render.md). Path variables (`<PLUGIN_ROOT>`, `<ARTIFACT_BASE>`, `<PROC_DIR>`, `<STATE_DIR>`, `<INVENTORY_PATH>`, `<CONFIG_JSON>`), checkpoints, resume and escalation are defined in [`paths-and-state.md`](paths-and-state.md). Each step prints a **progress bar** at entry per § Progress Reporting.

## Progress Reporting

**Format** (mandatory at the very first line of each Step entry message):
```
Step X/7 · <label>   [<20-char bar>]  NN%
```

- Bar width = **20 chars**, filled = `█`, empty = `░`, no ANSI colors.
- Filled-cell count = `floor(step_id × 20 / 7)` (Step 0 = 0 filled, Done = 20 filled).
- `NN%` = `floor(step_id × 100 / 7)` at entry (Step 0 = 0%, Done = 100%).
- Right-aligned: two leading spaces before `NN%`, trailing `%`.

**Step → progress mapping** (authoritative):

| Step | Label | Bar | % at entry |
|---|---|---|---|
| 0 | `trust-session bootstrap` | `[░░░░░░░░░░░░░░░░░░░░]` | 0% |
| 1 | `Intake (package + module + context)` | `[██░░░░░░░░░░░░░░░░░░]` | 14% |
| 2 | `CBO inventory ensure (auto stocker if missing)` | `[█████░░░░░░░░░░░░░░░]` | 28% |
| 3 | `Entry-point detection (TCode mapping + confirmation)` | `[████████░░░░░░░░░░░░]` | 42% |
| 4 | `Process grouping (sap-analyst, Opus)` | `[███████████░░░░░░░░░]` | 57% |
| 5 | `Per-process narrative (sap-analyst, Opus)` | `[██████████████░░░░░░]` | 71% |
| 6 | `Render: process .md + BPML (sap-writer ×2, Sonnet)` | `[█████████████████░░░]` | 85% |
| 7 | `Validation + handoff` | `[████████████████████]` | 100% |

When a Step skips (inventory exists, resumed from a checkpoint), still print its line with `(skipped — <reason>)` or `(resumed — <file>)` after the percentage so the user sees continuous progression.

**Sub-progress lines** (indented, printed as each sub-phase starts; no bar):
```
  ↳ 2.A walk                      (or: walk reused — walk.json <age>)
  ↳ 2.C scout <done>/<b> batches   (once per checker message; ECC adds "· where-used skipped (ECC)")
  ↳ 2.D finalize
  ↳ 5 narrative <k>/<n> parts      (split mode only)
  ↳ 6  process .md written · <lines> lines
  ↳ 6b BPML build <i>/<n> · <format> · <builder one-line result>
```

---

## Step 0 — Trust-Session Bootstrap + Path Resolution

Main thread (no agent dispatch).

1. Print: `Step 0/7 · trust-session bootstrap   [░░░░░░░░░░░░░░░░░░░░]   0%`
2. Run `/sc4sap:trust-session` with `parent_skill=sc4sap:package-to-process` unless `.sc4sap/session-trust.log` already has a line within 24h.
3. Resolve `<PLUGIN_ROOT>`, `<PROJECT>`, `<ACTIVE_ALIAS>`, `<CONFIG_JSON>`, `<ARTIFACT_BASE>` per `paths-and-state.md`. Surface one line: `trust ok · plugin=<PLUGIN_ROOT> · profile=<ACTIVE_ALIAS or legacy>`. No interactive prompts.

---

## Step 1 — Intake (Socratic)

Main thread (session model). `AskUserQuestion` takes 2–4 options per question (Other is added automatically) — never put a longer list into options.

1. Print: `Step 1/7 · Intake (package + module + context)   [██░░░░░░░░░░░░░░░░░░]  14%`
2. **If `ARGUMENTS` did not supply a package** → ask exactly one question:
   > "Which CBO package should I analyze for end-to-end business process? (e.g., `ZSD_MAIN`, `ZMM_CORE`). Prefix patterns OK (e.g., `ZMM*`)."
3. If prefix → `SearchObject(objectType='DEVC', query=<prefix>)` → print the hits as a numbered table, ask for the number or name (free text), re-ask.
4. Verify with `GetPackage(<name>)`. Not found → STOP and report.
5. **Resume check** — per `paths-and-state.md` § Resume. Resume → skip to the offered Step.
6. **Module** — infer candidates, then ONE question with the top 3 + Other:
   - existing inventory: Glob `<PROJECT>/.sc4sap/**/cbo/*/<PACKAGE>/inventory.json` → the `<MODULE>` folder of each hit (strongest signal);
   - package prefix: drop the leading `Z` / `Y` (and a `/namespace/`), match the longest key from the `<PLUGIN_ROOT>/configs/` folder list at the start (`ZMM_CORE` → MM, `ZSDR01` → SD, `YHCM_PAY` → HCM);
   - fill remaining slots from `SAP_ACTIVE_MODULES`, in order.
   First candidate labeled `(Recommended)`. Other = free text, validated against the `<PLUGIN_ROOT>/configs/` folder list (normalize to uppercase; invalid → re-ask once).
7. **Output language + output formats** — ONE bundled `AskUserQuestion` (two questions, single call):
   - **Language** (single-select): `Korean (ko)` / `English (en)` / `Japanese (ja)`. First option = conversation language, labeled `(Recommended)`. Only ko / en / ja are supported (template labels and BPML builder dictionaries) — an Other answer gets "only Korean, English, Japanese are supported" and one re-ask. Applies to the process document AND the BPML.
   - **Output formats** (`multiSelect: true`): `Markdown` / `HTML` / `Excel`. Default when the user picks nothing specific: Markdown + Excel. Applies to both deliverables:
     - Process document → `.md` if Markdown, `.html` if HTML. It has no Excel form, so when Excel is the ONLY choice, keep the `.md` as its readable form.
     - BPML → one file per selected format (`.md` / `.html` / `.xlsx`).
8. Load context (main thread reads, no dispatch): `<CONFIG_JSON>` → `sapVersion`, `abapRelease`, `industry`, `country`; the profile `sap.env` → `SAP_ACTIVE_MODULES`. Industry / country unset → ask once (one bundled question); do NOT proceed silently with defaults.
9. Write `<STATE_DIR>/intake.json` with `{package, module, sapVersion, abapRelease, industry, country, activeModules, language, formats}`.

---

## Step 2 — CBO Inventory Ensure (Conditional Dispatch)

1. Print: `Step 2/7 · CBO inventory ensure   [█████░░░░░░░░░░░░░░░]  28%`
2. Resolve `<INVENTORY_PATH>` per `paths-and-state.md` § Inventory resolution (own profile → cross-view → legacy). Cross-view → refuse or ask as defined there.
3. **Branch A — inventory usable**: read `scanned_at`, print `(skipped — inventory found at <path> · scanned <N> days ago)` after the bar.
   - `scanned_at` older than 30 days (or missing) → ask (2 options): `Use as-is (Recommended)` / `Refresh (re-stock now)`. Refresh → Branch B.
4. **Branch B — missing / refused / refresh**: run the stocking pass per [`dispatch-stocker.md`](dispatch-stocker.md) — walk (reused when a recent `walk.json` exists) → scout fan-out (≥ 30 objects) → finalize, with the `↳ 2.A / 2.C / 2.D` sub-progress lines and one banner per dispatch. Load the new `inventory.json`.
5. Stocker `BLOCKED` → one Opus re-dispatch (`paths-and-state.md` § Escalation); still blocked → STOP and surface (cannot continue without inventory).
6. Update `<STATE_DIR>/intake.json` → `inventory: {path, from, scanned_at}` (Edit).

---

## Step 3 — Entry-Point Detection

Main thread (session model). (Detection logic below is unchanged; a later reference-graph step will supply entry points here.)

1. Print: `Step 3/7 · Entry-point detection   [████████░░░░░░░░░░░░]  42%`
2. From `inventory.json` → collect all PROG objects.
3. For each PROG, look up TCode mapping:
   - `SearchObject(objectType='TRAN', query='<prog_name>')` — TCodes that launch this program
   - Cross-reference with `<PLUGIN_ROOT>/configs/<MODULE>/tcodes.md` for documented Z-TCodes
4. Build candidate entry-point list: `{prog, tcodes[], short_text}`. Programs without a TCode are still considered as candidates if they appear as flagship in `inventory.json → key_programs[]`.
5. Confirm with the user:
   - ≤ 4 candidates → one `AskUserQuestion(multiSelect: true)` with the candidates as options (all checked by default); Other = programs to add.
   - > 4 candidates → print a numbered table (`# · Program · TCodes · Short text`), then ask (2 options): `Accept all (Recommended)` / `Edit list` — Edit takes free text such as `drop 3,7 · add ZMMR0100`. Apply, reprint once, continue.
6. Final list = state `entry_points[]`.
7. If `entry_points[]` is empty → do NOT stop silently. Name the largest PROG in the inventory (`lines` fact when known, else the highest-`score` PROG) and ask (2 options): `Use <X> as the entry point (Recommended)` / `Enter entry programs` (free text); Other / "stop" → STOP. No PROG at all in the inventory → STOP and report (the skill needs ≥ 1 program).
8. Write `<STATE_DIR>/entry_points.json`.

Continue with Step 4 in [`workflow-render.md`](workflow-render.md).
