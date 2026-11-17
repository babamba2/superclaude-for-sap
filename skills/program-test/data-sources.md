# Program test — data sources, destinations and masking

Companion to [`SKILL.md`](SKILL.md) → Steps 1, 4.

## Three sources

| Source | Read with | Destination | Confirmation |
|---|---|---|---|
| `dev` (default) | `GetSqlQuery` on the connected DEV system | none | per-call data-extraction consent ([`../../common/data-extraction-policy.md`](../../common/data-extraction-policy.md)) |
| `qa` | `GetRemoteTableContents` | `config.json` → `testDataSources.qa` | the user's go on the whole plan, then each call's permission prompt |
| `prd` | `GetRemoteTableContents` | `config.json` → `testDataSources.prd` | **locked** until the MCP masking release is pinned and installed (`MASKING_RELEASE_PINNED`; `init` exits 7). Then **one explicit yes per table**: destination, table, fields, WHERE, row cap shown in one line before the call; only after a masked probe proved the MCP server masks (§ Masking) |

All three feed the same pipeline: plan → masked capture → frozen expected → doubles on DEV. Nothing runs on QA / PRD (`RFC_READ_TABLE` only reads) and nothing is written there. The blocklist hook and the MCP blocklist apply to every read exactly as for `GetTableContents`; a denial is final for this run.

## Profile key

```json
"testDataSources": { "qa": "QASCLNT100", "prd": "PRDCLNT100" }
```

In the active profile's `config.json` (legacy: `<project>/.sc4sap/config.json`). Names are SM59 destinations of the **connected DEV system**, case-sensitive, ≤ 32 characters. Edited with `/sc4sap:sap-option` → *Test data sources* ([`../sap-option/remote-destinations.md`](../sap-option/remote-destinations.md)). `remoteDestinations` (the tool's recent list) has no role, so it is never used to guess which one is QA or production.

## Destination missing

`pt.mjs init --source qa|prd` exits 5 and prints the set-up steps. Show them as they are, offer `dev`, and stop when the user declines. The skill never creates or changes SM59 entries, RFC users or roles — that is the user's (Basis) job:

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

`pt.mjs check` enforces: source / destination match the run; fields listed (no full rows); `max_rows` 1–200 (default 20); a WHERE for QA / PRD; personal fields only with `personal_reason`; personal / credential tables refused (HR `PA*` / `HRP*` / `PCL*`, `USR*`, `AGR_*`, `ADR2–6`, bank details `LFBK` / `KNBK` / `BUT0BK`, `BUT0ID`, secure store). Choose rows that hit each case: the WHERE picks documents with the statuses the cases need, not the first N rows.

## Masking

Masking happens in the MCP server, before the answer reaches the model:

- **Read gate** (`scripts/program-test/pt-gate.mjs`, PreToolUse): while a run is active, `GetTableContents` / `GetSqlQuery` / `GetRemoteTableContents` must carry `mask: { salt: <the run's salt>, extra_fields: <the run's mask_extra> }`, else the read is denied before it runs. A `prd` run also needs one earlier read in the same run that came back masked by the server (an older MCP server ignores `mask` and would answer raw).
- **Server** (`mask` argument, abap-mcp-adt-powerup `src/lib/policy/personalMask.ts`): refuses personal / credential tables, takes for `GetSqlQuery` only the strict grammar below, reads the table's DDIC on the connected DEV system, masks default-deny with the same rules as `pt-lib.mjs` (shared rule vectors `tests/validation/fixtures/mask-vectors.json`), and returns only the masked rows, column metadata and a `masking` block (`version`, masked columns). Tokens are HMAC-SHA256 under a key the server generates and keeps next to the profile (`mask.key`, mode 600) — never in a tool argument, response, log or this plugin — over run salt | table | field | value, so a guessed value cannot be checked against a token. Any failure returns no rows. The key file is owner-only (mode 600; on Windows an owner-only ACL set with icacls). The evidence guard (`scripts/evidence/guard.mjs`) denies the model any read of it: a tool input naming `mask.key` (also with quotes, backslashes, `[ ]`, `+` removed), a `Grep` whose search root holds the profile folders, a shell command naming the profiles folder (incl. `cd` into it) other than a move / delete or a read of exactly `sap.env` / `config.json`, a wildcard or recursive read of the sc4sap home, an interpreter one-liner or encoded PowerShell on it, and any shell call while the shell sits in a profile folder.

The PostToolUse recorder then hands every table read made while a run is active to `pt-capture.mjs`. Server-masked rows (`masking.version` known, `default_deny` set) are saved as they came — the plugin never makes tokens; an unmasked answer — an older server that ignores `mask` — is never saved, for any source, and the run ends `INCOMPLETE`. The rules the server applies:

- **Default-deny.** The server reads the table's DDIC on the connected DEV system (ECC bridge or S/4 table source); a local read whose DDIC cannot be read returns no rows, and a remote table the DEV system does not know (e.g. a Z table only in QA) comes back with every column masked. Each column is traced to its source field — `GetSqlQuery` aliases (`name1 AS n`, `a~name1`) are resolved from the SELECT list — and kept only when that field belongs to the table, its data element, domain or data type is on the clear list (client, org keys, country / region / language, partner and document numbers, type / status / flag codes, document / posting / validity dates by data element — a generic `DATUM` / `DATS` field is masked —, amounts, quantities, currency and unit keys), and it matches no personal shape. Amounts and quantities (`CURR` / `QUAN`) stay clear by type, also a custom salary-like amount; it is pseudonymous only because the person's keys and names are masked — name such a field in `mask-extra` when the amount itself is sensitive. Every other field is masked — also a field whose data element is simply unknown to the list (`masking.version` `hmac-v2`; `hmac-v1` servers kept such fields clear and are not accepted). Expressions (`concat( … ) AS full`), unknown columns and fields from includes the DDIC does not list are masked.
- Personal shapes (checked first, they win over the clear list): names, address, phone / fax / mail, bank, tax and ID numbers, birth data, personnel numbers and user IDs (`ERNAM`, `AENAM`, …), by field name or by data element / domain (e.g. a custom `ZZCONTACT` typed with `AD_SMTPADR`), plus the run's `mask-extra` fields. Stand-ins are deterministic per run, table and field (same value → same token there; a masked field joined across two tables gets different tokens — keys are usually not personal and stay readable); length never grows; digits stay digits; birth dates become `19000101`.
- **Refused** by the server and again at capture (rows discarded, only the refusal logged): a personal / credential table anywhere in the statement (`FROM`, `JOIN`, sub-query); array rows with an unnamed column.
- **`GetSqlQuery` allow-list** (server and capture). Rows are returned and saved only when the statement parses under a strict grammar: `SELECT [SINGLE] [DISTINCT] <field [AS alias]>… | * FROM <one table> [[AS] alias] [WHERE <condition>] [UP TO n ROWS] [ORDER BY fields]`, where the condition holds only fields, literals, comparisons, `AND` / `OR` / `NOT`, `IN ( list )`, `BETWEEN`, `LIKE`, `IS [NOT] NULL / INITIAL`. Anything else — `JOIN`, sub-query, `UNION` / `INTERSECT` / `EXCEPT`, `WITH`, expressions or functions, host variables, comments, semicolons — is logged as *not saved*.
- Only server-masked rows reach `<run>/rows/<TABLE>.json`; no raw personal value ever reaches the model, so there is nothing to fingerprint.
- With the server masking, no raw personal value reaches the model. Agents still work from `rows/*.json` and `pt.mjs abap-rows` only, and the report shows masked values only.
- Before the read, look at the captured DDIC for custom fields that hold personal data under a neutral type (free-text `ZZ*` fields typed `TEXT40`) and add them with `pt.mjs mask-extra`. The server's shapes are generic (names like `CUSTNAME`, `CONTACT*`, `OWNER`, `URL`, `IP_ADDR`; unlisted data elements are masked anyway), so customer-specific personal fields still need `mask-extra` — above all a field typed with a clear-list data element, whose value the server would otherwise return as is.

Rows read from another source than the run's (`remote:<dest>` on a `dev` run, DEV rows on a `qa` run) make the verdict `INVALID`.

## Reading tips

- Filter on key / indexed fields; a non-indexed WHERE on a large remote table can run past the client timeout while the remote work process keeps running.
- One table per call, no joins: read the header first, then the items with the keys found (`EBELN IN (…)`).
- A row longer than 512 characters fails in `RFC_READ_TABLE` — list fewer fields.
