# Model Dispatch Mode

Controls whether sc4sap skills pick the sub-agent model automatically or ask the user before each dispatch. Runtime semantics live in [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md); this file only covers viewing and editing the setting.

**Storage** — `~/.sc4sap/preferences.json` → `modelDispatch`. User-level: NOT part of `sap.env` or the profile `config.json`, so it applies to every profile and project and survives profile switches.

| Value | Behavior |
|---|---|
| `auto` (default) | Skills route per `common/model-routing-rule.md` and the skill MDs — no questions. |
| `user-defined` | Before each dispatch group the skill asks Opus / Sonnet / Haiku, with the rule's choice marked `(Recommended)`. |

## Flow

1. Read `~/.sc4sap/preferences.json`. Missing file / key → current value is `auto (default)`. Unparseable JSON → show the error, and offer to overwrite it with `{}` plus the new key (after confirmation).
2. Show the current value and the table above.
3. Ask with `AskUserQuestion` (`header: "Dispatch"`):
   - `Auto (default)` — "Route per model-routing-rule.md. No prompts."
   - `User-defined` — "Ask Opus / Sonnet / Haiku before each agent dispatch (recommendation shown)."
   Mark the current value with ` (current)` in its label. Accept shorthand from the original request in any language (`"set dispatch to user-defined"`, `"let me pick the model"`, `"auto dispatch"`) and skip the question.
4. If the value is unchanged, say so and stop — no write.
5. Preview diff: `modelDispatch: auto → user-defined`.
6. Confirm, then write:
   - Create `~/.sc4sap/` if missing (it normally exists).
   - Preserve every other key in `preferences.json`; 2-space JSON indent.
   - Atomic write (`preferences.json.tmp` → rename). No `.bak` needed — the file holds no secrets and one key.
   - Setting `auto` writes `"modelDispatch": "auto"` explicitly (do not delete the key), so the choice is visible.
7. Report: absolute path written + new value. **No `/mcp` reconnect or restart needed** — skills read the file at the start of each run. A skill run already in progress keeps its old mode until it finishes.

## Validation

- Only `auto` or `user-defined` (case-insensitive input; stored lowercase). Aliases: `user`, `manual`, `ask` → `user-defined`; `default`, `automatic` → `auto`. Anything else → reject and re-ask.

## Status snapshot row

`Model dispatch: <auto (default) | user-defined>` — from `~/.sc4sap/preferences.json`. Always resolvable (no MCP needed), so always shown.
