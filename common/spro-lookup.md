# SPRO Lookup Protocol

**MANDATORY for all sc4sap consultant agents and any skill that needs SAP Customizing / IMG data.**

When you need SAP Customizing information for a module, resolve the lookup in this order. Steps 2 and 3 are typically combined — the static docs tell you *which table to look at*, the live MCP call tells you *what the customer actually configured*.

## Resolution Order

### 1. Local SPRO Cache (preferred — short-circuits everything below)

Check for `.sc4sap/work/<activeAlias>/spro-config.json` (alias from `.sc4sap/active-profile.txt`; legacy projects without that pointer use `.sc4sap/spro-config.json`). Resolve per [`multi-profile-artifact-resolution.md`](multi-profile-artifact-resolution.md) — every `.sc4sap/spro-config*.json` path below follows the same rule.

- If present:
  - Load the file and use `modules.{MODULE}` for the target module
  - Surface the cache timestamp in your reasoning/output (e.g., "config snapshot: 2026-04-13T…")
  - **Do NOT call MCP** to re-fetch tables that already exist in the cache
  - If the user question targets a module that is missing from the cached `modules` map, fall through to Steps 2+3 for that module only
- Module-specific cache files `.sc4sap/spro-config-{MODULE}.json` are also acceptable if the merged file is absent

Per-module populated keys typically include: customizing tables, view contents, timestamp, extraction source.

### 2. Static Reference Docs — identify WHICH tables/views to read

The plugin ships generic reference docs per module. These never contain the customer's actual configured values, but they tell you the names of the tables, views, BAPIs, and transactions relevant to the question:

- `configs/{MODULE}/spro.md` — SPRO customizing reference (IMG paths → underlying tables)
- `configs/{MODULE}/tcodes.md` — transaction codes
- `configs/{MODULE}/tables.md` — key tables
- `configs/{MODULE}/bapi.md` — BAPI / Function Module reference
- `configs/{MODULE}/enhancements.md` — BAdI / User Exit / BTE
- `configs/{MODULE}/workflows.md` — development workflows

Use this step to produce a short-list of candidate tables/views — for example, "material type customizing → `T134` (header) + `T134T` (texts)". If the static doc alone fully answers the question (purely conceptual / naming / BAPI signature), stop here and cite the file.

### 3. Live MCP Query — read the customer's actual customizing

If the answer depends on the customer's real customizing values (not just table names), chain from Step 2 into MCP:

1. Identify candidate table(s)/view(s) from Step 2
2. Surface the plan to the user before the call, e.g.:
   "Local SPRO cache is not present. I'll read T134 / T134T via MCP to see the configured material types. This consumes tokens. Proceed?"
3. On confirm, call `GetTableContents` / `GetView` / `GetTable` for schema-only questions
4. Never silently hit the server — always surface the cost implication and the chosen table list so the user can veto
5. Respect the data-extraction policy (`common/data-extraction-policy.md`) — some tables require `acknowledge_risk` and explicit user authorization

### Decision flow summary

```
question about SAP customizing
        │
        ▼
  cache present?
    yes ──► use cache, done
     no
        │
        ▼
  Step 2: read configs/{MODULE}/*.md
        │
        ├── question is "what is the name / signature / IMG path?" ──► answer from static doc, done
        │
        └── question is "what is the customer's configured value?"
                 │
                 ▼
         Step 3: pick tables from Step 2, warn user, MCP GetTableContents
```

## Setup Awareness

- The cache is populated by `/sc4sap:setup spro` (optional step during setup)
- If the cache is missing, you MAY recommend the user run `/sc4sap:setup spro` after the current task — but do not block the current task on it
- Treat a stale cache (> 90 days, or user-indicated customizing change) as a prompt to suggest refresh, but still prefer it over live query unless the user explicitly opts out

## Agent Integration Checklist

Every consultant agent's `<Reference_Data>` section MUST list:

1. Local SPRO Cache (`.sc4sap/spro-config.json` → `modules.{MODULE}`) — **priority 1**
2. Static reference (`configs/{MODULE}/spro.md` etc.) — to identify table/view candidates
3. Live MCP (`GetTableContents` / `GetView`) — to read customer values, chained from Step 2
4. Pointer to this protocol: `common/spro-lookup.md`

Any skill that delegates to a consultant MUST pass a "local cache available: yes/no" flag in its handoff context so the consultant can short-circuit the lookup decision.
