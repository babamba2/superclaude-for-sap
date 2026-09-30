# Screen Theme

Controls how SAP screens look in the mockups that `/sc4sap:program-to-spec` and `/sc4sap:program-to-manual` draw (selection screens, output ALV screens, popups). Flowcharts are not affected.

**Storage** — the active profile's `config.json` → `screenTheme`. It is set per SAP system because the SAP GUI colour scheme is usually chosen per system. A single document can still override it with `"theme"` in its `image-spec.json` / `manual.json`.

| Value | Look |
|---|---|
| `signature` (default when unset) | SAP GUI Signature theme, default blue-grey colour scheme |
| `signature-pink` | Signature theme, pink system colour scheme |
| `modern` | the earlier sc4sap look (rounded cards, blue header band) |
| `{ "base": "signature", "page": "#…", … }` | a custom scheme: palette keys of `SCREEN_THEMES.signature` in `scripts/spec/screen-image-renderer.mjs` (`page`, `titleTop`, `titleBot`, `toolbar`, `frameHead`, `frameLine`, `gridHeadTop`, `cell`, `keyCell`, …), each `#RRGGBB` |

## Flow

1. Run `node <PLUGIN_ROOT>/scripts/spec/screen-theme.mjs get`. It returns `value` (null = unset), `effective`, the `config.json` path and the profile alias.
2. Show the current value (`signature (default)` when unset) and the table above.
3. Ask with `AskUserQuestion` (`header: "Theme"`):
   - `Signature (default)`: "SAP GUI Signature, blue-grey scheme"
   - `Signature pink`: "Signature with the pink system colour scheme"
   - `Modern`: "The earlier sc4sap look"
   - `Custom colours`: "Base Signature with my own #RRGGBB colours"

   Mark the current value with ` (current)`. Take shorthand from the request in any language ("theme pink", "시그니처 분홍", "modern theme") and skip the question.
4. For **Custom colours**, ask which keys to change (usually `page`, `titleTop`/`titleBot`, `frameHead`, `cell`). If the user gives a screenshot of their SAP GUI, read the colours from it. Build `{ "base": "signature", … }`.
5. If the value is unchanged, say so and stop. There is no write.
6. Preview the change: `screenTheme: signature → signature-pink`, including the profile alias.
7. Confirm, then write with `node <PLUGIN_ROOT>/scripts/spec/screen-theme.mjs set <value>` (a custom theme is passed as one JSON argument). The script validates the value, keeps every other key and writes atomically. **Default** is `… screen-theme.mjs reset`, which removes the key.
8. Report the path written and the new value. No `/mcp` reconnect or restart is needed. The next spec or manual build uses the new theme. Rebuild an existing manual with `build-manual.mjs … --same-version` to apply it.

## Validation

Done by the script: known names (aliases `default`/`blue` → `signature`, `pink` → `signature-pink`, `legacy` → `modern`). A custom object may only hold `base` (`signature` | `signature-pink`) and known palette keys with `#RRGGBB` values. Show the script's error and ask again.

## Status snapshot row

`Screen theme: <value | signature (default)>`, read from `config.json`. It needs no MCP, so the row is always shown.
