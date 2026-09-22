# HUD Status Line (auto-enabled)

Referenced by `SKILL.md` — this file holds the full HUD specification.

The plugin ships a sc4sap-branded status line that renders **below the input box** on every prompt. It is declared both in `.claude-plugin/plugin.json` → `statusLine` *and* injected into the user's `~/.claude/settings.json` by the setup wizard, because some Claude Code versions do not render plugin-declared statusLines unless the user's own settings carry the same entry.

## Activation (new installs)

`/sc4sap:setup` runs `scripts/hud/install-statusline.mjs` as Step 13, which writes a `statusLine` block into `~/.claude/settings.json` pointing at `<PLUGIN_ROOT>/scripts/hud/statusline.mjs`. The installer is **idempotent** and refuses to overwrite a non-sc4sap `statusLine` unless invoked with `--force`, so a user who has customized their own status line is never silently clobbered.

Manual install / re-install:

```bash
node "<PLUGIN_ROOT>/scripts/hud/install-statusline.mjs"            # install if absent
node "<PLUGIN_ROOT>/scripts/hud/install-statusline.mjs" --force    # overwrite existing
node "<PLUGIN_ROOT>/scripts/hud/install-statusline.mjs" --uninstall
```

Restart Claude Code after install for the status line to appear.

## Displayed segments

1. `sc4sap` — plugin brand
2. `S4/756` — SAP version / ABAP release from `.sc4sap/config.json` (shows `not-configured` until setup runs)
3. `MCP●  ENV●` — health dots: vendor MCP build, `sap.env` presence (green = OK, red = missing)
4. `⚡ working` / `✓ idle` — agent activity indicator. Working when the session transcript was modified in the last 5 seconds, OR the last assistant message has tool_use blocks without matching tool_results (CC is waiting on a tool callback). Idle otherwise.
5. `ctx 420K/1.00M 42%` — current context window usage from the latest assistant `usage` block. The window follows the subscription plan, not the model alone: `claudeAiOauth.subscriptionType` in `~/.claude/.credentials.json` = `max` / `team` / `enterprise` → 1M, `pro` / other → 200K. A `[1m]` model id or a window size in the statusLine payload wins over the plan; Haiku, Claude 3 and Opus/Sonnet 4.0–4.1 stay at 200K. No credentials file (API-key login) → 200K.
6. `5h 42%` — rolling 5-hour block utilization from Anthropic's `/api/oauth/usage` endpoint (real utilization, not an estimate). Falls back to transcript-derived `$` cost vs `SC4SAP_5H_LIMIT_USD` when the API is unavailable.
7. `⏳ 2h 17m` — time remaining in the 5h block, computed from `five_hour.resets_at` when the API is reachable.
8. `7d 87%` — rolling 7-day utilization from the same OAuth endpoint (`seven_day.utilization`). Falls back to transcript-derived weekly cost when the API is down.
9. `+12% extra` — **only shown when weekly utilization exceeds 100%.** Equals `seven_day.utilization − 100`. In fallback mode, represents weekly-cost overage vs `SC4SAP_WEEKLY_EXTRA_LIMIT_USD`.
10. `Opus 4.6` — active model

## Performance

- ~150ms cold, ~240ms with 7-day scan; within Claude Code's 300ms budget
- Transcript parser reads only the **tail (256KB)** of the JSONL — file size is irrelevant
- 5h block: 1MB tail per session file, mtime-filtered
- 7-day window: scans every project dir under `~/.claude/projects/` but **caches the result to `.sc4sap/.hud-week.json` with a 60s TTL** so keystroke refreshes hit the cache, not disk

## Environment variables

- `SC4SAP_5H_LIMIT_USD=35` — 100% basis for the 5h block segment. Unset = show bare dollars instead of a percentage.
- `SC4SAP_WEEKLY_LIMIT_USD=200` — 100% basis for the 7d segment. Unset = show bare dollars instead of a percentage.
- `SC4SAP_WEEKLY_EXTRA_LIMIT_USD=100` — 100% basis for the `+extra` overage segment. Only consulted when weekly usage exceeds the base limit. Unset = show overage in bare dollars.
- `SC4SAP_CONTEXT_WINDOW=1000000` — force the context-window size (tokens) when plan detection is wrong.
- `NO_COLOR=1` — disable ANSI colors.

## Overriding / disabling

- To suppress the HUD, run the installer with `--uninstall` (removes the `statusLine` key from `~/.claude/settings.json`), or manually set `statusLine: { type: "command", command: "" }` in the same file.

## Implementation files

- `scripts/hud/statusline.mjs` — entry point (stdin JSON → segment assembly → stdout)
- `scripts/hud/install-statusline.mjs` — user-settings installer (injects the `statusLine` block into `~/.claude/settings.json`)
- `scripts/hud/lib/pricing.mjs` — model-to-price table
- `scripts/hud/lib/context-window.mjs` — context-window size from plan + model (see segment 5)
- `scripts/hud/lib/transcript.mjs` — JSONL tail scanner + 5h/7d aggregation
- `scripts/hud/lib/sc4sap-status.mjs` — reads `.sc4sap/config.json`, checks MCP/sap.env/SPRO
- `scripts/hud/lib/cache.mjs` — 60s TTL disk cache for weekly roll-up
- `scripts/hud/lib/format.mjs` — ANSI, humanized numbers, `NO_COLOR` support
