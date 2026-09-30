# Program → Manual — Workflow Steps

Referenced by `SKILL.md`. Run Step 0 through Step 7 in order. Paths below use `<base>` = the artifact base from [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) (`.sc4sap/work/<alias>/` with an active profile, `.sc4sap/` otherwise).

## Step 0 — Trust + target

- Run `Session_Trust_Bootstrap` (SKILL.md).
- Target program from `ARGUMENTS`; if missing or ambiguous, ask once and confirm with `SearchObject`. A class / FM / CDS target → stop and point to `program-to-spec` (SKILL.md `Do_Not_Use_When`).

## Step 1 — Opener (one `AskUserQuestion` call)

| # | Header | Question | Options (Recommended first) |
|---|--------|----------|-----------------------------|
| 1 | Language | Manual language? | the user's current language (Recommended) · the other two of Korean / English / Japanese |
| 2 | Version | (only when `<base>/manuals/<PROGRAM>-<lang>.history.json` exists) This program already has manual v<x>. What is this run? | New minor version (Recommended) · New major version · Rebuild v<x> in place |

Keep the answers as `lang` and `versionMode` (`minor` / `major` / `same`).

## Step 2 — Cover settings + inventory

**2a. Cover settings.** Run `node scripts/manual/manual-config.mjs get`.
- `found: true` → use it, say which profile it came from in one line.
- `found: false` → one `AskUserQuestion` (four free-text questions: Author, Team, Company, Confidentiality notice; when the result has `suggestion`, offer "Use the values from profile <suggestionFrom>" as the Recommended option of a single first question instead). Save with `node scripts/manual/manual-config.mjs set --author "…" --team "…" --company "…" --confidentiality "…"` (omit keys the user left empty). Never invent company names.

**2b. Inventory** (parallel MCP reads — same sources as [`../program-to-spec/workflow-steps.md`](../program-to-spec/workflow-steps.md) Step 1, minus AST / where-used / enhancements):
- `GetObjectInfo` (package), and the T-Code that starts the program: `SearchObject` with the program name lists a `TRAN/T` hit next to the `PROG/P` (`GetTransaction` answers "Not implemented" on some systems). No T-Code → use `SA38 / <PROGRAM>` in the step header and say so.
- Source: `GetProgFullCode` + `GetIncludesList`. A large program exceeds the tool output limit and lands in a saved file — split its JSON (`code_objects[].code`) into one `<INCLUDE>.abap` per include under `<base>/manuals/_work/<PROGRAM>/`. The Step 3 agents read the source from there; never paste 100k+ characters into a prompt.
- Text elements: `GetTextElement` `language: "E"` first, then the manual language if it has a text pool.
- Screens: `GetScreensList`, then `GetScreen` for **every** dynpro; `GetGuiStatusList` + `GetGuiStatus` for every status an output screen or popup sets. A manual walks through follow-up screens, so every screen a scenario can reach must be read — never guess its layout.
- Messages: every `MESSAGE` in the source → T100 text via `GetSqlQuery` per `SKILL.md` § Data_Extraction_Safety. On BASIS < 7.50 (ECC) `GetSqlQuery` is not available: take the text from the `WITH` literal or the source comment, and write `E015 (T100 not readable on this release)` otherwise.
- Write what the screens, statuses, texts and messages say into `<base>/manuals/_work/<PROGRAM>/screens.md` (dynpro flow logic and elements, function codes with texts and keys per status, text symbols, selection texts, message classes) so both Step 3 agents work from the same inventory.
- Module: from the package's CBO folder (`<base>/cbo/<MODULE>/<PACKAGE>/`) or ask one question. When a CBO inventory exists, pass it to both Step 3 agents.

## Step 3 — Analysis (two dispatches in ONE message, parallel)

```
▶ phase=3.analyst (scenarios, screens, check points) · agent=sc4sap:sap-analyst · model=Opus
▶ phase=3.consultant (business context) · agent=sc4sap:sap-<module>-consultant · model=<frontmatter>
```

**sap-analyst** gets the `_work/<PROGRAM>/` paths (source per include + `screens.md`) and must read every include in full, and returns (text only, no files):
1. **Scenarios** — the tasks a user performs. Each radio option / execution mode / processing button that leads to a different outcome is its own scenario ("Send POs to the warehouse", "Check missing goods receipts", "Reprocess failed receipts"). A pure display toggle is not.
2. **Steps per scenario** — one step per screen state the user sees, in order: selection screen with the inputs this scenario needs → output screen → each popup / follow-up screen / second ALV the scenario opens → the final result. For each step: the screen (selection / dynnr), the input values that make sense, the elements the user touches (field names, radio names, function codes, column names), and what happens next.
3. **Check points per scenario**, each with its source: mandatory inputs, `AT SELECTION-SCREEN` checks, authority checks, confirmation popups, locks, and processing that cannot be undone (posting, sending, deleting) — plus what the user must check before pressing the button.
4. **Fields** — selection fields (required, F4, what to enter) and the output columns a user reads to decide something.
5. **Messages** — code, type, T100 text, the condition in the source that raises it.
6. **Screen specs** for every screen above, per [`../program-to-spec/selection-schema.md`](../program-to-spec/selection-schema.md) and [`../program-to-spec/alv-buttons-schema.md`](../program-to-spec/alv-buttons-schema.md) §2 (`screen`, `toolbar`, `fields`, `columns`, invented `sampleRows`). Read, never guess:
   - **Button icons** — the SAP icon name from `GetGuiStatus` (`FUN[].TEXT_NAME`, e.g. `ICON_TRANSPORT`) or the ALV toolbar handler (`ICON = ICON_OPERATOR`); a function whose `ICON_TEXT` is empty is an icon-only button (no `label`).
   - **Which buttons a popup shows** — a dialog-box status (`STA[].MODAL = P`) shows only its application-toolbar entries (`BUT` of its `PFKCODE`, in `NO` order; `PFNO = S` is a separator). A function reachable only by F-key (often `EXIT` on F12) has no button.
   - **Key columns** — `"key": true` on every column whose field catalog sets `KEY = 'X'` (per grid; drawn tinted like SAP key fields).
   - **Modal dialog boxes** — `"modal": true` on the `screen` of every dynpro called with `CALL SCREEN … STARTING AT` (status `MODAL = P`) and of standard popups (`POPUP_TO_CONFIRM`, SALV popups): SAP puts their buttons at the bottom right.
   - **Screen titles** — the `SET TITLEBAR` in the screen PBO; without one, SAP keeps the last title set in the program (often the main screen title), so the popup shows that one.
   - **Standard popups** — read the wrapper method and the FM defaults: `POPUP_TO_CONFIRM` with only `TEXT_QUESTION` shows a blank title and **Yes / No / Cancel**. Give the question text a `name` (`QUESTION`) so a callout can point at it.

**sap-<module>-consultant** gets the program purpose summary, the message list and the configured industry / country, and returns: purpose, background, business rules, users (role, not names), glossary terms, and a user action for each message. It tags every statement it inferred rather than read in the source with `[inferred]`.

## Step 4 — Interview (only what is uncertain)

- Collect the `[inferred]` statements that matter to a user (who runs it, when, why, a business rule). Ask at most **3** of them in one `AskUserQuestion` (confirm / correct). Whatever stays unconfirmed goes to `intro.unverified` and shows a "to be confirmed" badge — never silently state it as fact.
- Confirm the scenario list in the same call so the user can drop scenarios nobody uses. `AskUserQuestion` offers at most 4 options, so with more than 4 scenarios ask about the doubtful ones only (merge two follow-up scenarios? drop an org-specific one?) instead of listing all.
- Also ask about code findings a user would trip over: a button with no handler (leave it out of the manual?), a function that only works in a certain state (document it as intended?).

## Step 5 — Write `manual.json`

```
▶ phase=5.writer (manual.json) · agent=sc4sap:sap-writer · model=Sonnet (override)
```

Before the dispatch, save the analyst and consultant reports verbatim to `_work/<PROGRAM>/analyst.md` and `consultant.md`; the writer reads them there together with the interview answers (listed in its prompt). The writer reads [`manual-schema.md`](manual-schema.md) and writes `<base>/manuals/_draft/<PROGRAM>-<lang>.manual.json` with the `Write` tool (one call; never through Bash). Input: analyst + consultant results, interview answers, `lang`, `changeNote` (what changed in this version; "Initial version" in the manual language for v1.0).

## Step 6 — Build and fix

```bash
node scripts/manual/build-manual.mjs <base>/manuals/_draft/<PROGRAM>-<lang>.manual.json [--major | --same-version]
```

The first build uses the Step 1 `versionMode` (`major` → `--major`, `same` → `--same-version`, `minor` → no flag).

- Every `⚠ build-manual:` line is a defect: a callout anchor that is not on its screen (the message lists the anchors that are), a scenario without check points, a screen schema problem, or `LANGUAGE MIX`. Fix `manual.json` with `Edit` and rebuild with `--same-version` until no warning is left.
- The script prints the HTML, history and source paths as JSON.

## Step 7 — Review loop

- Show the Output_Format summary (SKILL.md) and the list of `intro.unverified` items.
- Ask: "OK to finalize, or change a scenario / step / wording?" Apply changes to the draft `manual.json` and rebuild with `--same-version` (the revision history keeps one entry per version, the latest build wins).
- On confirm, print the absolute path of the HTML file. The user opens it in a browser and prints / saves as PDF for the slide-style layout.
