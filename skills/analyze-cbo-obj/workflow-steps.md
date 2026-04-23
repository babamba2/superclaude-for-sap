# Analyze CBO Objects — Workflow Steps

Referenced by `SKILL.md`. The orchestration is **3 main-thread Socratic steps** (Step 1 / 1.5 / 2) followed by **one delegated dispatch to `sap-stocker`** (Step 3–7) and a **main-thread hand-off summary** (Step 8).

## Main-thread Socratic intake

**Step 1 — Ask for the CBO package name** (exactly one question)
> "Which CBO package do you want to analyze? (e.g., `ZSD_MAIN`, `ZMM_CORE`). If you only know a prefix like `ZSD*`, tell me the prefix and I will search for packages."

- If the user gives a prefix pattern: call `SearchObject(objectType='DEVC', query=<prefix>)` and list matches, then re-ask.
- Verify the final package with `GetPackage(<name>)`. If it does not exist, report and stop.

**Step 1.5 — Ask about flagship programs in this package** (exactly one question, optional)
> "Are there any programs in this package that are especially frequently used? If yes, list them comma-separated (e.g., `ZSDR_ORDER_ALV, ZSDR_BILL_POST`). Type `skip` if none or unknown."

- Accept comma-separated PROG names. Normalize to uppercase and trim whitespace.
- Verify each name via `SearchObject(<name>, PROG)`. For unknown names, print a one-line warning (`"ZXXX not found — ignored"`) and drop them.
- Keep the validated list as `<KEY_PROGRAMS>` (may be empty).
- **Why this step exists**: CBO objects referenced by user-marked flagship programs carry stronger business signal than pure internal reference count. In the stocker's scoring pass they receive a `key_boost = len(used_by_key_programs) * 10` so they surface at the top of the inventory.

**Step 2 — Ask which module this package belongs to** (exactly one question, constrained list)
> "Which SAP module does this package belong to? Pick one of: SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba."

- Valid values = folder list under `configs/`. Reject anything else and re-ask.
- Normalize to uppercase (e.g., `sd` → `SD`) and verify `configs/<MODULE>/` exists.

## Delegated stocking (single agent dispatch)

**Step 3–7 — Dispatch to `sap-stocker`** (one `Agent(...)` call)

Emit phase banner per `common/model-routing-rule.md` § Phase Banner Convention:
```
▶ phase=walk (stocker) · agent=sap-stocker · model=Sonnet 4.6
```

Dispatch with the collected intake as context:
```
Agent({
  subagent_type: "sap-stocker",
  description: "CBO inventory — <PACKAGE>",
  prompt: """
    Stock the CBO package <PACKAGE> (module <MODULE>).
    Flagship programs (may be empty): <KEY_PROGRAMS>.
    Follow your Investigation_Protocol steps 2–8 (walk → graph → classify → interpret → cross-module gap → safety → persist).
    Return the standard success block or BLOCKED with reason.
  """,
  mode: "dontAsk"
})
```

The stocker executes the full inventory pass internally — consult `agents/sap-stocker.md` § Investigation_Protocol and § Success_Criteria for the authoritative spec. Summary of what happens inside:

- **Walk** (`GetPackageContents` + `GetPackageTree`): TABL / STRU / TTYP / DTEL / DOMA / VIEW / CLAS / INTF / FUGR / PROG (+ DDLS / BDEF / SRVB on S/4).
- **Reference graph** (`GetWhereUsed` per object, filtered to in-package callers): `ref_count`, `used_by_key_programs`, `key_boost`, `score`.
- **Frequently-used tier**: package-size thresholds (small <30 ≥2 · medium 30–150 ≥3 · large >150 ≥5); flagship-referenced → always pinned.
- **Business purpose inference** (DDIC signals): role classification — `header / line / log / mapping / classification / config / util / service / event / dto` — plus 1–2 sentence purpose.
- **Cross-module gap** (read `SAP_ACTIVE_MODULES` from `sap.env`/`config.json`): per `common/active-modules.md` matrix, flag expected-but-missing integration fields (e.g., MM CBO without `PS_POSID` when PS is active) → `inventory.json → crossModuleGaps[]`.
- **Sensitive-name check** against `exceptions/custom-patterns.md` (PII / HR / CUST / BANK / PRICE / ...). Never calls `GetTableContents` or `GetSqlQuery`.
- **Persist** `.sc4sap/cbo/<MODULE>/<PACKAGE>/{index.md, inventory.json}` (+ optional `raw-walk.md` if the package has <200 objects).

`inventory.json` schema example (authoritative — also referenced by `create-program`, `create-object`):
```json
{
  "package": "ZSD_MAIN",
  "module": "SD",
  "scanned_at": "<ISO timestamp>",
  "sap_version": "<S4|ECC>",
  "key_programs": ["ZSDR_ORDER_ALV", "ZSDR_BILL_POST"],
  "objects": [
    {
      "name": "ZSD_ORDER_LOG",
      "type": "TABL",
      "ref_count": 7,
      "key_boost": 20,
      "score": 27,
      "used_by_key_programs": ["ZSDR_ORDER_ALV", "ZSDR_BILL_POST"],
      "role": "log",
      "purpose": "append-only sales-order processing log keyed by VBELN",
      "keys": ["MANDT", "VBELN", "POSNR", "LOGDATE"],
      "fk_to_standard": ["VBAK-VBELN", "VBAP-POSNR"],
      "reuse_hint": "extend this table instead of creating a new order log — used by both flagship programs"
    }
  ],
  "crossModuleGaps": []
}
```

Sort order in `objects[]`: every object with `used_by_key_programs` non-empty first, then the rest by `score` descending.

Sort order in `index.md`:
1. `## 📌 Pinned — used by flagship programs` (grouped by the flagship program that pulls each in)
2. `## Frequently used tables`, `## Frequently used structures`, ... (remaining non-pinned frequently-used objects, by score descending)
3. `## Sensitive CBO objects` (name-pattern flagged; suggest additions to `.sc4sap/blocklist-extend.txt`)

## Main-thread hand-off (branches on `Logic-heavy` flag)

**Step 8 — Hand-off summary** (auto, on stocker success)

Read the `Logic-heavy: <true|false>` line from the stocker's return block (classification rule defined in [`../../agents/sap-stocker.md`](../../agents/sap-stocker.md) § Output_Format). Branch:

### Branch A — `Logic-heavy: false` (DDIC-dominant package) · **canned summary, main thread**

No agent dispatch. Main thread (Haiku — skill frontmatter `model: haiku`) prints:
```
CBO inventory written:
  .sc4sap/cbo/<MODULE>/<PACKAGE>/index.md
  .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json

📌 Pinned (used by flagship programs [P1, P2]): P objects — always surfaced first
Frequently used: N tables · M structures · K data elements · P classes · Q FMs
Cross-module gaps: G (or "n/a — SAP_ACTIVE_MODULES unset")
Sensitive objects flagged: X

Downstream skills (/sc4sap:create-program, /sc4sap:program-to-spec, /sc4sap:create-object)
read inventory.json and prefer pinned objects > frequently-used objects > new creation.
```

### Branch B — `Logic-heavy: true` (FM / class / interface / large PROG in the inventory) · **dispatch `sap-writer`**

Structured counts alone do not convey what the business-logic assets DO. Delegate to `sap-writer` for a reader-facing briefing.

Emit phase banner:
```
▶ phase=8.brief · agent=sap-writer · model=Haiku 4.5
```

Dispatch:
```
Agent({
  subagent_type: "sap-writer",
  description: "CBO briefing — <MODULE>/<PACKAGE>",
  prompt: """
    Read .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json and produce a reader-facing briefing for the user (language = user's current conversation language; default Korean).

    Required sections (15–25 lines, markdown):
    1. **📌 Pinned highlights** — for each pinned object, one line: name · type · 1-sentence purpose · reuse_hint.
    2. **🔧 Business-logic assets** — top 3 most-referenced FUGR/CLAS/INTF (outside pinned). For each: name · what it does in business terms · when to call it vs write new.
    3. **🔗 Cross-module gaps** — if `crossModuleGaps[]` non-empty, explain each gap in one sentence with a concrete remediation hint. If empty, one line "No integration gaps detected for active modules: <list>".
    4. **⚠️ Sensitive objects** — if any, list with short reason and blocklist-extension suggestion. Skip section if none.
    5. **▶ Next step hint** — one line pointing to which downstream skill to run next (create-program / create-object / program-to-spec).

    Rules:
    - Do NOT re-read SAP via MCP. Work only from inventory.json.
    - Do NOT restate the full file counts (main thread already printed that).
    - Be concrete: prefer "ZFM_CALC_SD_MARGIN — calculates gross margin per sales order line; call from any billing-related new program" over generic "utility FM".
  """,
  mode: "dontAsk"
})
```

After the writer returns, print its output verbatim to the user. Prepend one header line identifying the artifacts:
```
CBO inventory written:
  .sc4sap/cbo/<MODULE>/<PACKAGE>/index.md
  .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json
```

### Failure handling (both branches)

On `BLOCKED: <reason>` from the stocker, surface the reason verbatim and stop — do not retry on main thread. On writer BLOCKED in Branch B, fall back to Branch A (canned summary) and log `briefing: "fallback_to_canned: <reason>"` in `inventory.json → meta`.
