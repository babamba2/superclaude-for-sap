# module-to-process — Area menu (optional second scope source)

Referenced by `workflow.md` (Step 1.4b, 2.1b, 3), `workflow-build.md` (Step 7b) and `SKILL.md`. Path variables: [`paths-and-state.md`](paths-and-state.md).

Usage (ST03N) tells **what users run**; the customer area menu (SE43) tells **how the customer groups its work**. Both together:

| In menu | Used | Meaning | Where it goes |
|---|---|---|---|
| yes | yes | core | menu path on the task sheet; folder names help Step 4 placement |
| yes | no (measured) | dead menu entry | appendix count + tree mark; clean-up candidate for a conversion |
| yes | used, no task | gap | appendix list — placed in the next run (new run: already in scope) |
| no | yes | off-menu | appendix list — run directly or from a role menu |

The menu never adds an unused TCode to the analysis: usage stays the filter, the menu adds TCodes outside the packages (other packages, standard TCodes) and the grouping.

## Step 1.4b — Intake question

ONE question (2 options): `Also use the customer area menu (Recommended)` / `Packages and usage only`. Yes → `GetAreaMenu(menu_pattern='Z*')` (and `Y*` when the result is empty) → numbered table (`# · Menu · Changed on`) → the user answers with numbers / names. Store `intake.json → menus = [<MENU>, …]`. Links to other customer menus are followed by the tool (`follow_links='customer'`); SAP menus are listed only.

## Step 2.1b — Read the menu and widen the scope

1. Per menu: `GetAreaMenu(menu=<MENU>, output='file')` → note `counts` and `path`; copy nothing into the context.
2. Before step 2.3 (usage): `node "<PLUGIN_ROOT>/scripts/process/area-menu.mjs" --menu "<file>" … --usage "<SCOPE_DIR>/used-1.txt" --out "<SCOPE_DIR>/menu.json" --hints "<SCOPE_DIR>/menu-hints.json" --add-scope "<SCOPE_DIR>/tcodes-all.json"` — appends menu TCodes missing from the packages with `packageName: "_MENU"`. Add `_MENU` to `--packages` of `usage-scope.mjs`. The usage step then measures them with the rest; standard TCodes found used join the scope as `kind: std` entries (no source fetch).
3. After step 2.6, run `area-menu.mjs` again with the measured usage (`--usage` = the saved usage file of step 2.3) to refresh `menu.json`. Print `↳ 2 menu <MENU> <entries> entries · <tcodes> TCodes · used <core+gap> · dead <dead> · not measured <unmeasured>`.

## Step 3 / 4 — Placement hint

Pass `<SCOPE_DIR>/menu-hints.json` (`{TCODE: ["<MENU> > folder > …"]}`) to the Step 4 analyst brief as **input 7 — area menu paths**: a folder name is a hint for the L2 / L3 label and for grouping entries of the same folder; the standard backbone still decides the numbering. Never copy a folder name as an L-label without checking it fits the backbone.

## Step 7b — Annotate the model

After `assemble-model.mjs` (and for the English model too):
`node "<PLUGIN_ROOT>/scripts/process/area-menu.mjs" --menu "<file>" … --usage "<saved usage file>" --model "<STATE_DIR>/process-model.json" --out "<SCOPE_DIR>/menu.json" --apply`
→ `model.menu` (counts, gap, off-menu, compact tree) and `row.menuPaths`. The page shows the menu path in the task sheet head and the appendix section **Area menu cross-check** (summary, gap list, tree per top folder with usage and task links, off-menu list). The model keeps a backup `<model>.bak-menu` from the first apply.

## Supplement mode (existing map)

The user asks to add a menu to a map built earlier (e.g. "add area menu ZXX00 to the SD map"):

1. Read the current model: `<STATE_DIR>/process-model.json` must equal the latest `_src/<KEY>-process-v<ver>-<lang>.process.json` (else the page was edited — `build-process-doc.mjs --import` the latest HTML first).
2. `GetAreaMenu(menu=<MENU>, output='file')`.
3. Usage: the saved usage files of the run (`<ARTIFACT_BASE>/usage/tcode-usage-<SID>-<date>[-<part>].json` — pass every part, including the `-STD` one) plus `<SCOPE_DIR>/usage.json`. Menu TCodes still unmeasured → offer ONE `GetTcodeUsage` round for them (same destination) and save the result as an extra usage file; the user may skip it.
4. `area-menu.mjs … --apply` on the ko model and on `process-model.en.json` when it exists. Pass every other module map of the system as `--other-model <STATE_DIR of M2>/process-model.json` — a used TCode documented there counts as **elsewhere**, not as a gap.
5. Build with the next minor version and the change note `Area menu <MENU> cross-check added` (`build-process-doc.mjs <model>`; companion per `workflow-build.md`).
6. Report the counts; the gap list is the proposal. Placing it is a separate, confirmed step (below).

## Placing the gap (existing maps)

The user picks which gap groups to place and in which maps (a new map for a module without one starts from an L1-only model).
1. Per group: Z TCodes → `GetTransaction` (programs) → sources via `sap-checker` (≤ 40 per checker, verify on disk). Standard TCodes need no source.
2. One `sap-analyst` (Opus) per group, ALL in one message, from a shared brief: target model, entry list, `menu-hints.json`, sources. Output `supp-<part>.json` = `new_l2 / new_l3 / new_tasks` (full task sheets), `row_patches` (`tcodes_add`, `objects_add`, `task_add`), `placements`, `unplaced`. The analyst validates with `supplement-model.mjs --check --entries <part list>`.
3. `node "<PLUGIN_ROOT>/scripts/process/supplement-model.mjs" --model <model> --supp <file> …` (backup `<model>.bak-supp`; new rows take the next free number under their parent). The model is now the source of truth — later `assemble-model.mjs` runs would drop the supplement.
4. Korean polish of the new texts, English companion (`companion.mjs texts` → translate only the missing items → `apply`), `area-menu.mjs --apply` again, build the next minor version of every changed map, then integration maps `--same-version`.
