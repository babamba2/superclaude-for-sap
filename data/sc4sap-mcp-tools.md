# SC4SAP MCP Tool Catalog (abap-mcp-adt-powerup)

Index of MCP handlers exposed by the `abap-mcp-adt-powerup` server under the `mcp__plugin_sc4sap_sap__` namespace. Tool identifiers are split by operation class — consult the partial files linked below.

**Consumers**: `trust-session` skill (primary), plus any skill needing to walk the full tool surface. Skills must glob `data/sc4sap-mcp-tools-*.md` (one level deep) to enumerate every auto-approvable handler.

## Section files

| File | Categories | Count |
|---|---|---:|
| [sc4sap-mcp-tools-write.md](sc4sap-mcp-tools-write.md) | Create*, Update*, Delete* | 73 |
| [sc4sap-mcp-tools-read.md](sc4sap-mcp-tools-read.md) | Get* (safe), Read*, List*/Search*/Describe* | 79 |
| [sc4sap-mcp-tools-runtime.md](sc4sap-mcp-tools-runtime.md) | Runtime*, Execution | 11 |

**Total auto-approvable**: 163. **Prompt-gated (never auto-approve)**: 2.

## Exclusion policy — SAFEGUARDED (do NOT auto-approve)

These two tools remain callable but require an explicit per-call user prompt. They are deliberately OMITTED from every section file:

- `mcp__plugin_sc4sap_sap__GetTableContents` — row-level table data extraction
- `mcp__plugin_sc4sap_sap__GetSqlQuery` — arbitrary SQL read

Rationale: metadata operations (`GetTable`, `GetStructure`, `GetDataElement`) return DDIC schema and are safe to auto-approve. Row-level extraction risks pulling PII, financial data, or authorization-sensitive records — each call must remain an explicit user decision, but the tool itself must stay callable (not denied). See `common/data-extraction-policy.md`.

## Wildcard prohibition

Do NOT add `mcp__plugin_sc4sap_sap__*` or `mcp__mcp-abap-adt__*` to `permissions.allow`. Wildcards silently capture the two excluded tools above. `trust-session` must enumerate from the section files explicitly.

## Legacy namespace (`mcp__mcp-abap-adt__`)

When the legacy namespace is installed, apply the same enumeration with the prefix swapped (`mcp__plugin_sc4sap_sap__` → `mcp__mcp-abap-adt__`). The same two exclusions apply: `GetTableContents`, `GetSqlQuery`.
