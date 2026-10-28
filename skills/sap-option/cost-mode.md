# Cost Mode

Chooses between `standard` (quality first, current behavior) and `eco` (cost first) for every sc4sap skill, or per skill. Runtime semantics live in [`../../common/cost-mode.md`](../../common/cost-mode.md); this file only covers viewing and editing the setting.

**Storage** — `~/.sc4sap/preferences.json` → `costMode` and `costModeBySkill`. User-level: applies to every profile and project.

| Value | Behavior |
|---|---|
| `standard` (default) | Current behavior. |
| `eco` | Cheaper sub-agent models and effort, low main-thread effort. Same deliverable as standard; safety and verification unchanged. |

## Flow

1. Read `~/.sc4sap/preferences.json`. Missing file / key → `standard (default)`. Unparseable JSON → show the error and offer to overwrite it with `{}` plus the new keys (after confirmation).
2. Show the current global value and any `costModeBySkill` entries.
3. Ask with `AskUserQuestion` (`header: "Cost mode"`):
   - `Standard (default)` — "Quality first. Current behavior."
   - `Eco for all skills` — "Cheaper models and effort. Same deliverable."
   - `Per skill` — "Pick skills that run in eco; the rest stay standard."
   Mark the current value with ` (current)`. Accept shorthand from the request in any language (`"eco mode on"`, `"saving mode"`, `"program-to-spec only eco"`) and skip the question.
4. `Per skill` → second `AskUserQuestion` with `multiSelect: true`, options = the four most-used document/review skills (`program-to-manual`, `package-to-process`, `compare-programs`, `config-to-document`); other skills via "Other" (comma-separated names). Selected → `"eco"`; previously listed but unselected → remove the key.
5. Unchanged → say so and stop. Else preview the diff (`costMode: standard → eco`, `costModeBySkill.program-to-spec: + eco`), confirm, then write:
   - Preserve every other key (`modelDispatch`, …); 2-space JSON indent; atomic write (`.tmp` → rename).
   - Write `"costMode": "standard"` explicitly rather than deleting the key.
   - Remove `costModeBySkill` when it becomes empty.
6. Report the absolute path and new values. No reconnect or restart needed — skills read the file at the start of each run.
7. Mention the one-off alternative once: `/sc4sap:eco <skill> <args>`.

## Validation

- Values: `standard` | `eco` (case-insensitive, stored lowercase). Aliases: `normal`, `default` → `standard`; `economy`, `saving`, `cheap` → `eco` (and their equivalents in the user's language).
- Skill names: bare names of skills listed in `common/cost-mode.md` § lever C, excluding those marked "No eco variant". Unknown name → reject that name and re-ask.

## Status snapshot row

`Cost mode: <standard (default) | eco>[ · eco: <skill>, <skill>]` — from `~/.sc4sap/preferences.json`. Always shown.
