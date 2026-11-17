# Program test — data sources, destinations and masking

Companion to [`SKILL.md`](SKILL.md) → Steps 1, 4.

## Three sources

| Source | Read with | Destination | Confirmation |
|---|---|---|---|
| `dev` (default) | `GetSqlQuery` on the connected DEV system | none | per-call data-extraction consent ([`../../common/data-extraction-policy.md`](../../common/data-extraction-policy.md)) |
| `qa` | `GetRemoteTableContents` | `config.json` → `testDataSources.qa` | the user's go on the whole plan, then each call's permission prompt |
| `prd` | — | `config.json` → `testDataSources.prd` (reserved) | **refused for now**: `init` exits 7, `check` rejects the plan. The raw read response reaches the model once before the capture hook masks it; production data waits for masking inside the MCP read tools, then each table read gets its own yes |

DEV and QA feed the same pipeline: plan → masked capture → frozen expected → doubles on DEV. Nothing runs on QA / PRD (`RFC_READ_TABLE` only reads) and nothing is written there. The blocklist hook and the MCP blocklist apply to every read exactly as for `GetTableContents`; a denial is final for this run.

## Profile key

```json
"testDataSources": { "qa": "QASCLNT100", "prd": "PRDCLNT100" }
```

In the active profile's `config.json` (legacy: `<project>/.sc4sap/config.json`). Names are SM59 destinations of the **connected DEV system**, case-sensitive, ≤ 32 characters. Edited with `/sc4sap:sap-option` → *Test data sources* ([`../sap-option/remote-destinations.md`](../sap-option/remote-destinations.md)). `remoteDestinations` (the tool's recent list) has no role, so it is never used to guess which one is QA or production.

## Destination missing

`pt.mjs init --source qa` exits 5 and prints the set-up steps. Show them as they are, offer `dev`, and stop when the user declines. The skill never creates or changes SM59 entries, RFC users or roles — that is the user's (Basis) job:

1. SM59 → ABAP Connections → create (type 3) with the target host / instance and client.
2. Logon with a technical RFC user of the target system that has `S_RFC` (`RFC_READ_TABLE`, `SDTX`) and `S_TABU_DIS` / `S_TABU_NAM` display (`03`) for the tables to read — nothing more.
3. Connection Test and Remote Logon succeed.
4. `/sc4sap:sap-option` → Test data sources → set the name.

The connected DEV system also needs the `REMOTE_READ` action in `ZMCP_ADT_DISPATCH`; without it the tool returns an upload hint — report it and offer `dev`.

## Data plan (`plan.json`)

```json
{ "source": "qa", "destination": "QASCLNT100",
  "tables": [ { "table": "EKPO", "fields": ["EBELN","EBELP","MENGE","WEMNG","ELIKZ"],
                "where": "EBELN BETWEEN '4500000000' AND '4500000999'", "max_rows": 20, "cases": ["C01","C02"] } ] }
```

`pt.mjs check` enforces: source / destination match the run; fields listed (no full rows); `max_rows` 1–200 (default 20); a WHERE for QA; no `prd` plan; personal fields only with `personal_reason`; personal / credential tables refused (HR `PA*` / `HRP*` / `PCL*`, `USR*`, `AGR_*`, `ADR2–6`, bank details `LFBK` / `KNBK` / `BUT0BK`, `BUT0ID`, secure store). Choose rows that hit each case: the WHERE picks documents with the statuses the cases need, not the first N rows.

## Masking

The PostToolUse recorder hands every table read made while a run is active to `pt-capture.mjs`:

- **Default-deny.** Rows are saved only for a table whose DDIC the run captured (`GetTable` during the run → `<run>/ddic/<TABLE>.json`, ECC bridge or S/4 table source); without it nothing is saved. Each column is traced to its source field — `GetSqlQuery` aliases (`name1 AS n`, `a~name1`) are resolved from the SELECT list — and kept only when that field belongs to the table and is not personal by field name, data element or domain. Expressions (`concat( … ) AS full`), unknown columns and fields from includes the DDIC does not list are masked.
- Personal means: names, address, phone / fax / mail, bank, tax and ID numbers, birth data, personnel numbers and user IDs (`ERNAM`, `AENAM`, …), by field name or by data element / domain (e.g. a custom `ZZCONTACT` typed with `AD_SMTPADR`), plus the run's `mask-extra` fields. Stand-ins are deterministic per run (same value → same token), so keys that join two tables still match; length never grows; digits stay digits; birth dates become `19000101`.
- **Refused at capture**, rows discarded and only the refusal logged: a personal / credential table anywhere in the statement (`FROM`, `JOIN`, sub-query); array rows with an unnamed column.
- **`GetSqlQuery` allow-list.** Rows are saved only when the statement parses under a strict grammar: `SELECT [SINGLE] [DISTINCT] <field [AS alias]>… | * FROM <one table> [[AS] alias] [WHERE <condition>] [UP TO n ROWS] [ORDER BY fields]`, where the condition holds only fields, literals, comparisons, `AND` / `OR` / `NOT`, `IN ( list )`, `BETWEEN`, `LIKE`, `IS [NOT] NULL / INITIAL`. Anything else — `JOIN`, sub-query, `UNION` / `INTERSECT` / `EXCEPT`, `WITH`, expressions or functions, host variables, comments, semicolons — is logged as *not saved*.
- Only masked rows reach `<run>/rows/<TABLE>.json`. A salted fingerprint of each replaced value goes to `fingerprints.json`; `pt.mjs harness` refuses a test class that contains a value with a known fingerprint.
- The raw response still reaches the model's context once (MCP returns it). Agents work from `rows/*.json` and `pt.mjs abap-rows` only, never from the raw response, and the report shows masked values only.
- Before the read, look at the captured DDIC for custom fields that hold personal data under a neutral type (free-text `ZZ*` fields typed `TEXT40`) and add them with `pt.mjs mask-extra`.

Rows read from another source than the run's (`remote:<dest>` on a `dev` run, DEV rows on a `qa` run) make the verdict `INVALID`.

## Reading tips

- Filter on key / indexed fields; a non-indexed WHERE on a large remote table can run past the client timeout while the remote work process keeps running.
- One table per call, no joins: read the header first, then the items with the keys found (`EBELN IN (…)`).
- A row longer than 512 characters fails in `RFC_READ_TABLE` — list fewer fields.
