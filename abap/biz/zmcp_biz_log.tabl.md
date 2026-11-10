# ZMCP_BIZ_LOG — SE11 definition

Log of business-action previews and executions (`ZCL_MCP_BIZ_EXEC`).
Create it in SE11 on ECC (ADT cannot create tables below 7.50).

## Attributes

| Attribute | Value |
|---|---|
| Short description | MCP business action log |
| Delivery class | A (application table) |
| Data browser / table view maint. | Display/Maintenance allowed with restrictions |
| Data class | APPL1 |
| Size category | 0 |
| Log data changes | off |
| Enhancement category | Can be enhanced (character-type or numeric) |

## Fields

| Field | Key | Initial values | Data element / predefined type | Description |
|---|---|---|---|---|
| MANDT | X | X | MANDT | Client |
| TOKEN | X | X | SYSUUID_C32 | Preview token |
| ACTION_ID | | | CHAR 40 (predefined) | Action ID, e.g. MM.PO.RELEASE |
| STATUS | | | CHAR 1 (predefined) | P preview, X executing, E executed, F failed |
| UNAME | | | SYUNAME | User |
| PARAMS_HASH | | | CHAR 40 (predefined) | SHA1 of the parameters |
| IDEM_KEY | | | CHAR 64 (predefined) | Idempotency key |
| CREATED_AT | | | TIMESTAMPL | Preview time (UTC) |
| EXECUTED_AT | | | TIMESTAMPL | Execution time (UTC) |
| PARAMS_JSON | | | STRING (predefined) | Parameters as sent |
| RESULT_JSON | | | STRING (predefined) | Result of the execution |

Predefined types: in SE11 press "Predefined Type" on the Fields tab, then
enter Data Type / Length. STRING fields must come after all key fields
(they do here).

## Technical settings (SE13)

- Data class APPL1, size category 0, buffering not allowed, no logging.

## Transport

Package and request of the target DEV system. On 7.31 systems use the
package and request of that system.
