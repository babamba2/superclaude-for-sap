# Analyze CBO Objects — Workflow Steps

Referenced by `SKILL.md`. Follow these 8 steps (Step 1 through Step 8) in order whenever the skill runs. Never skip ahead — downstream steps consume state produced by earlier ones (e.g., Step 4 ranking depends on `<KEY_PROGRAMS>` captured in Step 1.5).

**Step 1 — Ask for the CBO package name** (exactly one question)
> "Which CBO package do you want to analyze? (e.g., `ZSD_MAIN`, `ZMM_CORE`). If you only know a prefix like `ZSD*`, tell me the prefix and I will search for packages."

- If the user gives a prefix pattern: call `SearchObject(objectType='DEVC', query=<prefix>)` and list matches, then re-ask.
- Verify the final package with `GetPackage(<name>)`. If it does not exist, report and stop.

**Step 1.5 — Ask about flagship programs in this package** (exactly one question, optional)
> "Are there any programs in this package that are especially frequently used? If yes, list them comma-separated (e.g., `ZSDR_ORDER_ALV, ZSDR_BILL_POST`). Type `skip` if none or unknown."

- Accept a comma-separated list of PROG names. Normalize to uppercase and trim whitespace.
- Verify each name via `SearchObject(<name>, PROG)`. For unknown names, print a one-line warning (`"ZXXX not found — ignored"`) and drop them.
- Keep the validated list as `<KEY_PROGRAMS>` (may be empty if the user typed `skip` or gave no valid names).
- **Why this step exists**: CBO objects referenced by programs the user explicitly marks as flagship carry stronger business signal than pure internal reference count. In Step 4 they receive a ranking boost so they surface at the very top of the inventory, and Step 6 sorts them before every other object.

**Step 2 — Ask which module this package belongs to** (exactly one question, constrained list)
> "Which SAP module does this package belong to? Pick one of: SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba."

- Valid values = the folder list under `configs/`. Reject anything else and re-ask.
- Normalize to uppercase (e.g., `sd` → `SD`) and verify `configs/<MODULE>/` exists.

**Step 3 — Walk the package** (auto)
- `GetPackageContents(package=<name>)` for the root package.
- If sub-packages exist, walk them with `GetPackageTree`.
- Collect objects of these types (ignore the rest):
  | Type | MCP object type | What it represents |
  |------|-----------------|--------------------|
  | Table | `TABL` | Transparent / pooled table |
  | Structure | `STRU` | DDIC structure |
  | Table type | `TTYP` | DDIC table type |
  | Data element | `DTEL` | Field semantics |
  | Domain | `DOMA` | Value range |
  | View | `VIEW` | DDIC view / CDS view |
  | Class | `CLAS` | Global class (ZCL_) |
  | Interface | `INTF` | Global interface (ZIF_) |
  | Function group | `FUGR` | Function pool (and its FMs) |
  | Program | `PROG` | Executable / include / module pool |

**Step 4 — Build the reference graph** (auto)
- For each collected object, call `GetWhereUsed(<object>)` to get its usage locations.
- Keep only usages whose owning object is **also inside the package** (internal reuse). Drop SAP-standard callers.
- For each object compute:
  - `ref_count` = number of internal usages
  - `used_by_key_programs` = subset of `<KEY_PROGRAMS>` (from Step 1.5) that appear in the usage list — sub-objects too: an include / FORM / method belonging to a key program counts as that program
  - `key_boost` = `len(used_by_key_programs) * 10` — large multiplier so any flagship-program usage dominates ref_count
  - `score` = `ref_count + key_boost`
- Label the top tier **"frequently used"** by score:
  - Any object with `used_by_key_programs` non-empty → **always frequently used** (priority tier)
  - Else, fall back to package-size thresholds on `ref_count`: small (<30 objects) ≥ 2 · medium (30–150) ≥ 3 · large (>150) ≥ 5
- Additionally keep any object whose name ends in patterns that signal shared utility (`*_UTIL*`, `*_HELPER*`, `*_COMMON*`, `*_CONST*`, `*_TYPES*`, `*_MSG*`).
- Record `used_by_key_programs` on every object that has any — this drives the Step 6 sort and the index.md "pinned" section.

**Step 5 — Infer business purpose** (auto, per frequently-used object)
For each object in the frequently-used set, collect the signals below and summarise the business purpose in 1–2 sentences:
- DDIC short description (`GetObjectInfo`)
- For tables/structures: primary key + foreign keys to SAP standard tables (VBAK/MARA/BKPF/...) from `GetTable` / `GetStructure`
- For data elements: domain, field label, documentation — via `GetDataElement`
- For classes: public interface list, key method names — via `GetClass`
- For function modules: importing/exporting/tables parameters — via `GetFunctionGroup` + `GetFunctionModule`
- Heuristic role classification: `header / line / log / mapping / classification / config / util / service / event / dto`

**Step 6 — Persist the inventory** (auto)
Write to `.sc4sap/cbo/<MODULE>/<PACKAGE>/`:

- `index.md` — human-readable summary. **Sort order is priority-first**:
  1. `## 📌 Pinned — used by flagship programs` — every object whose `used_by_key_programs` is non-empty, grouped by the flagship program that pulls it in. Each entry: object name · type · `used_by_key_programs` · role · one-line business purpose · reuse_hint. This section is **always first** so consumers (create-program / program-to-spec) see it before falling back to generic frequency lists.
  2. `## Frequently used tables`, `## Frequently used structures`, `## Frequently used data elements`, `## Frequently used classes`, `## Frequently used function modules`, `## Frequently used table types`, `## Frequently used programs/views` — the remaining (non-pinned) frequently-used objects, sorted by `score` descending.
  - Each entry: object name · ref count (`+key_boost` if any) · role · one-line business purpose · suggested reuse scenario.
- `inventory.json` — machine-readable, consumed by `create-program` / `program-to-spec` / `create-object`. `objects[]` is sorted so that **every object with `used_by_key_programs` non-empty appears first**, then the rest by `score` descending:
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
    ]
  }
  ```
- `raw-walk.md` (optional) — full list of every object in the package with type + description, for reference. Only generate if user asks for it or package has <200 objects.

**Step 7 — PII / blocklist check** (auto, mandatory)
Objects whose name contains `PII`, `HR`, `CUST`, `VEND`, `BANK`, `PRICE`, `SALARY`, `PAY`, `CARD` (or similar) must be flagged in `index.md` under a `## Sensitive CBO objects` section and compared against `exceptions/custom-patterns.md`. Suggest the user add matching tables to `.sc4sap/blocklist-extend.txt`. Never call `GetTableContents` here — this skill only reads DDIC metadata, never row data.

**Step 8 — Hand-off summary** (auto)
Print to the user:
```
CBO inventory written:
  .sc4sap/cbo/<MODULE>/<PACKAGE>/index.md
  .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json

📌 Pinned (used by flagship programs [P1, P2]): P objects — always surfaced first
Frequently used: N tables · M structures · K data elements · P classes · Q FMs
Sensitive objects flagged: X

Downstream skills (/sc4sap:create-program, /sc4sap:program-to-spec, /sc4sap:autopilot)
read inventory.json and prefer pinned objects > frequently-used objects > new creation.
```
