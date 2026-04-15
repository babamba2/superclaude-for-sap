# Examples

User: "Show me sap.env"
→ parse, display masked table, ask what to change.

User: "Change the blocklist to minimal"
→ locate `MCP_BLOCKLIST_PROFILE`, show current, set to `minimal`, preview diff, confirm, write, remind to `/mcp` reconnect.

User: "Add ACDOCA to the whitelist"
→ read `MCP_ALLOW_TABLE`, append `ACDOCA` (dedupe, uppercase), warn about audit logging, confirm, write.

User: "Switch the industry to cosmetics"
→ route to industry-selection.md, show current (`SAP_INDUSTRY` + `config.json.industry`), set both to `cosmetics`, two-file diff, confirm, atomic write to both, remind that consultants will now load `industry/cosmetics.md`.

User: "What's the current industry set to?"
→ render status snapshot only (Industry line), stop.

User: "Change SAP_PASSWORD"
→ prompt for new password (do not echo), validate non-empty, diff shows `*** → ***`, confirm, write backup, remind to reconnect.

User: "Change the HUD weekly limit to $200"
→ route to hud-limits.md flow, edit `~/.claude/settings.json` → `env.SC4SAP_WEEKLY_LIMIT_USD = 200`, preview diff, confirm, write, remind user to **restart Claude Code** (not just `/mcp`).

User: "5h limit 35, weekly 200, extra 100"
→ HUD flow, set all three at once, single diff, single confirmation, single write.
