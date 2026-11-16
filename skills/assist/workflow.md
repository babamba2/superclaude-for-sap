# assist — step details

Companion of [`SKILL.md`](SKILL.md). Rules here refine the workflow steps; they never relax § Safety.

## Parameters

- Parameter names and types come from `catalog.mjs show <ID>` (`params[]`). SAP refuses unknown names, so never invent one.
- Pass values as strings; parameters typed `string[]` / `array` in the catalog (`ebelp`, `items`, `lines`, `cbo`) as arrays of strings — even for a single item (`"ebelp": ["10"]`); a plain string there reaches SAP as empty. Keep leading zeros as the user typed them — the handlers pad document numbers.
- Dates: `YYYYMMDD`. Quantities and amounts: plain decimal with a dot.
- A `required: true` parameter with no value and no `clarify` entry → ask for it plainly ("Which purchase order?").
- Never fill a business-meaning parameter from a default (`date_basis`, `include_unreleased`, the meaning of "close" …). Technical defaults in the catalog (`max_rows`) may be used silently.

## Socratic clarify

- One question per turn, with the catalog `options` as a numbered list; accept the number or the words.
- `when` on a clarify entry limits it (e.g. ask the scope only when no vendor, plant or purchasing group was given).
- After every answer, re-check which `clarify` entries are still open; stop asking as soon as all required parameters are known.
- Ambiguous term (catalog `ambiguity`): ask its `ask` text first; the answer picks the action, then continue with that action's clarify list.

## Value lists

A clarify entry with `values` asks for a customizing code (delivery / billing block reason, rejection reason, pricing condition type, reversal reason, payment block key, document type, shipment type, notification / order type). Offer the codes of the connected system instead of asking blind:

1. `node scripts/assist/values.mjs plan <values> --lang <SAP_LANGUAGE> --family <ECC|S4>` → two single-table SELECTs (keys, texts) on customizing tables of the `configs/<M>/spro.md` § Value tables map.
2. Run each with `GetSqlQuery`, `output: "file"`, unchanged.
3. `node scripts/assist/values.mjs merge <values> --keys <keys file> --texts <texts file> --lang <SAP_LANGUAGE> [--find-file <words file>]` → `{ total, shown, choices[{ n, key, text, textEn }] }`.
4. Four choices or fewer → one `AskUserQuestion` with one option per code (`key — text`); the user can still type another code. More → a numbered list in plain text, `n. key — text (English text when it differs)`, answered with a number or a code. `total` ≤ 30 → no `--find-file`: the user picks from the list, and a word they type is matched against it in the conversation. `total` > `shown` → show the first ones and ask for words or the code; to narrow, `Write` the user's words to `<mcp-output>/sql/find-<values>.txt` and run merge again with `--find-file` that file. **Never put the user's words on the command line**, not even quoted. `Write` not available or refused (e.g. the web's business profile) → run merge once more with `--max 300` and match the user's word against that list in the conversation; still more than 300 → ask for the exact code. The user's code or number is the value; a code not in the list → say so and ask again.

`GetSqlQuery` not offered (MCP `SAP_TOOL_PROFILE=biz`), a read error, or no rows → ask plainly as before; never invent codes. The list is read again per conversation, not stored.

## Preferences

- Answers hold for the conversation ("same as before" reuses them).
- When the user says to keep an answer for next time, store it in `~/.sc4sap/assist-prefs.json` as `{ "<ACTION.ID>": { "<param>": <value> } }` (per user, never in the project). Show the stored value the next time ("using your saved choice: due today — change?").
- Stored preferences never apply to the meaning of a write (which action) and never replace the execute confirmation.

## Lookup tables

- Columns: the result fields the action returns, in its order; rename to short business labels (Doc, Item, Material, Qty, Open, Due, Status).
- More than 20 rows: show 20, the total, and offer filters from the action's optional parameters.
- Rows the user can act on are numbered so they can answer "2 and 5".

## Preview

- Show only what changes plus the key (document / item). Unchanged fields are not listed.
- `ok: false` in the tool answer = refused; show `message` and go to § Consultant when it is a configuration / status cause, or ask for a corrected value when it is an input cause (unknown document, wrong item).
- `preview_limits` from the catalog: list them under "The preview cannot prove:" — for example a BAPI without a test mode where only checks ran.
- The token expires (about 10 minutes) and is single-use. If the user changes anything, run a new preview.

## Execute

- The confirmation must follow the latest preview and refer to it (yes / 네 / 진행 / execute). Ambiguous replies ("ok so what now?") are not a yes — ask again.
- Pass an `idem_key` (`<ACTION.ID>-<document>-<yyyymmddhhmm>`) so a retried call after a timeout does not post twice; on a timeout, retry once with the same key and then re-read with the query action.
- Report every number from the result (material document, FI document, confirmation, billing document, CO document) with the year. Say plainly when SAP accepted but a re-read shows a different value.
- Offer the catalog `reverse` action when one exists; never run it without a new preview and yes.

## Consultant

When PRECHECK or PREVIEW blocks for a reason the user cannot fix by changing the input:

```
Agent({
  subagent_type: "sc4sap:sap-<module>-consultant",
  description: "<MODULE> — why <ACTION.ID> is blocked",
  prompt: "<environment line from .sc4sap/config.json>
Explain in short sentences why SAP blocks this business action and what configuration or master-data change (IMG path / TCode) fixes it. Do not change anything.
<sap-data>action, parameters (IDs only), SAP messages with class and number, PRECHECK facts</sap-data>"
})
```

Module of the action prefix → consultant: MM / PP / SD / FI / CO / WM / PM / QM as named; EWM (S/4 warehouse lookups) → `sap-wm-consultant`; LE (shipments, picking, packing, shipment costs on ECC) → `sap-sd-consultant`; OUT → the module of the document (PO → MM, delivery / billing → SD).

Show the consultant's answer under the SAP message. The fix itself is the user's (or their consultant's) work in the TCode; this skill does not change configuration.

## Errors that are not refusals

- Tool not found → Prerequisites 1.
- "not installed" / dispatcher "Unknown action: BIZ_EXECUTE" → Prerequisites 2 (dispatcher release without the business branch).
- Authorization refusal → show which check failed; do not suggest another user.
- Production block (subrc 8) → lookups only on this system.
