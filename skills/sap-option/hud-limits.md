# HUD Limits

HUD usage-limit env vars are **not** part of `sap.env` — Claude Code only exposes env vars declared under `~/.claude/settings.json` → `env` to the statusline subprocess. This skill manages them there.

**Managed keys (all optional; unset = HUD shows bare `$`):**
- `SC4SAP_5H_LIMIT_USD`           — dollar basis for the 5h block percentage (100% at this value).
- `SC4SAP_WEEKLY_LIMIT_USD`       — dollar basis for the 7d percentage (100% at this value).
- `SC4SAP_WEEKLY_EXTRA_LIMIT_USD` — dollar basis for the `+extra` overage segment (shown only when weekly > base).

**Plan preset shortcut (preferred):** if the user says "my plan is X" / "apply pro plan" / "set up max20x" etc., run:

```bash
node "<PLUGIN_ROOT>/scripts/hud/apply-plan.mjs" <plan>
```

where `<plan>` ∈ `pro` | `max5x` | `max20x` | `team` | `api` (aliases in `plan-presets.json`). This writes all three env vars from the preset table. Remind the user that **plan values are publicly discussed estimates**, not official Anthropic figures — they can override any single value via the manual flow below. Use `--show` to display the table, `--unset` to clear.

**Flow (manual per-key edit):**
1. Read `~/.claude/settings.json`. If missing, create it with `{}`.
2. Show the current three values (or `(unset)` each).
3. Ask which to change. Accept numeric dollar value, `unset`/`remove` to delete the key, or `-`/empty to keep.
4. Validate: positive number or `unset`. Reject negatives, strings, zero (zero means unset — suggest `unset` instead).
5. Preview diff (Before/After) for the `env` block only.
6. Confirm, then write back with:
   - Atomic write (`settings.json.tmp` → rename).
   - Preserve all other keys and formatting as much as possible (2-space JSON indent).
   - Back up the previous file to `settings.json.bak` once (do not spam backups — overwrite).
7. Remind the user: **restart Claude Code** for new env values to reach the statusline subprocess. `/mcp` reconnect is not enough.

**Example:**
```
Current HUD limits (~/.claude/settings.json → env):
  SC4SAP_5H_LIMIT_USD            = 35
  SC4SAP_WEEKLY_LIMIT_USD        = 200
  SC4SAP_WEEKLY_EXTRA_LIMIT_USD  = (unset)

Which to change?
> weekly extra = 100
```
