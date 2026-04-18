# Field Typing Rule — Data Element First

**Scope.** Every Table / Structure / Table Type field-type decision made by sc4sap skills or agents (standard `CreateTable` / `CreateStructure` flow **and** the ECC helper-program fallback under `ecc-ddic-fallback.md`).

**Problem this rule fixes.** Past runs generated fields like `LIFNR CHAR 10`, `MATNR CHAR 40`, `WERKS CHAR 4` — raw data-type + length — even though SAP ships authoritative Data Elements with exactly the same semantics (`LIFNR`, `MATNR`, `WERKS_D`, …). That strips search helps, foreign-key propagation, conversion exits, and documentation from every consuming program. Reuse is mandatory, not optional.

## Priority (MANDATORY — applied per field)

| Priority | Source | When to use |
|---|---|---|
| **1 — Standard DE** | SAP-delivered data element (e.g., `LIFNR`, `MATNR`, `WERKS_D`, `BELNR_D`, `BUDAT`, `MENGE_D`, `MEINS`, `WAERS`, `USNAM`, `CPUDT`, `CPUTM`, `MANDT`) | Field semantics match a standard business term. This is the default — try it first. |
| **2 — CBO DE** | Existing customer Z/Y data element from the project CBO inventory | No standard DE fits, but a previously-created project DE does (e.g., from `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`). Reuse over create. |
| **3 — New CBO DE** | Freshly-created Z data element (triggers a `CreateDataElement` / ECC DTEL helper) | Semantics are genuinely new AND the field will appear in ≥ 2 places OR carries domain-specific meaning that deserves a label + F1 help. Must follow `naming-conventions.md` (`ZFIE00010`, …). |
| **4 — Data Type + Length** | `CHAR 10`, `NUMC 4`, `DEC 15 2`, … directly on the field | Last resort. Only for purely technical / internal fields with NO business meaning (counters, flags, temporary buffers, checksums). Never for business keys (vendor, material, plant, doc no, date, quantity, UoM, currency, user, …). |

## Lookup Protocol (before picking a priority)

Each field goes through this order on every run — no shortcut, no cached guess.

1. **Standard DE search** — call `SearchObject` with `query = <field-semantic-guess>` and `object_type = DTEL`, or match the field name against the **Common Standard DE Reference** below.
   - Hit → priority 1. Use that DE as `rollname`. Stop.
   - Miss → continue.
2. **CBO DE search** — if `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` exists, grep it for a DE whose role / domain / length / label matches. Also call `SearchObject` with the project Z-prefix (e.g., `ZFIE*`).
   - Hit → priority 2. Stop.
   - Miss → continue.
3. **New CBO DE decision** — does the field justify a new DE? Apply the priority-3 gate (reuse ≥ 2 OR domain-specific label). If yes → priority 3; emit a `CreateDataElement` (S/4) or an ECC DTEL helper program (ECC, per `ecc-ddic-fallback.md`). Then reference it as `rollname`.
4. **Primitive only if all above fail** — priority 4. Justify inline in the plan / spec (`"Field X: primitive CHAR 20 — internal scratch buffer, no business meaning"`).

## Common Standard DE Reference (quick lookup — expand as needed)

Business partners / org:
- Vendor: `LIFNR` · Customer: `KUNNR` · Plant: `WERKS_D` · Storage location: `LGORT_D` · Company code: `BUKRS` · Purchasing org: `EKORG` · Sales org: `VKORG` · Cost center: `KOSTL` · Profit center: `PRCTR` · WBS: `PS_POSID` · Internal order: `AUFNR`

Material / quantity:
- Material: `MATNR` · Batch: `CHARG_D` · Quantity: `MENGE_D` · UoM: `MEINS` · Base UoM: `LAGME` · Gross weight: `BRGEW` · Net weight: `NTGEW`

Document / item:
- FI doc: `BELNR_D` · MM doc: `MBLNR` · SD doc: `VBELN` · PO: `EBELN` · PO item: `EBELP` · Line item: `POSNR` · Fiscal year: `GJAHR` · Period: `MONAT`

Money / currency:
- Amount (local crcy): `DMBTR` · Amount (doc crcy): `WRBTR` · Currency: `WAERS` · Exchange rate: `UKURS`

Date / time / user:
- Posting date: `BUDAT` · Document date: `BLDAT` · Entry date: `CPUDT` · Entry time: `CPUTM` · Changed on: `AEDAT` · User: `USNAM` · Changed by: `AENAM`

Technical / system:
- Client: `MANDT` · Language: `SPRAS` · Country: `LAND1` · Unit: `UNIT`

Agents facing an unlisted field MUST call `SearchObject` against `DTEL` with 2–3 synonym queries (e.g., `vendor`, `supplier`, `creditor`) before concluding "no standard DE exists." Document negative searches in the plan so the next run can verify.

## Anti-Patterns (STOP — these must never pass review)

- `LIFNR CHAR 10` ← use data element `LIFNR`
- `MATNR CHAR 40` ← use data element `MATNR`
- `WERKS CHAR 4` ← use data element `WERKS_D`
- `BUKRS CHAR 4` ← use data element `BUKRS`
- `BELNR CHAR 10` ← use data element `BELNR_D` (or `VBELN` / `MBLNR` / `EBELN` depending on doc type)
- `BUDAT DATS 8` ← use data element `BUDAT`
- `MENGE QUAN 13 3` without UoM companion ← use `MENGE_D` + sibling `MEINS` field
- `WAERS CHAR 5` ← use data element `WAERS`
- `USNAM CHAR 12` ← use data element `USNAM`
- `MANDT CLNT 3` ← use data element `MANDT` (also: client field must be `MANDT` name + `MANDT` DE, at position 1 of every client-dependent transparent table)

## Integration Points

- `skills/create-object/workflow-steps.md` → Step 5 (standard flow) and Step 4-ECC (helper-program generation) both route field-type decisions through this rule.
- `skills/create-program/phase4-parallel.md` → Wave 1 sub-step 3 (parallel `CreateTable` / `CreateStructure`) applies this rule per field before emitting `rollname`.
- `skills/create-program/phase6-review.md` → reviewer fails the plan if any field drops to priority 4 without an inline justification, or if any priority-1 miss is visible (a standard DE existed and the plan still used a primitive).
- `skills/analyze-cbo-obj/` → CBO inventory `inventory.json` is the source for priority 2 (existing CBO DE). Keep it fresh; stale inventory forces needless priority-3 creations.

## Enforcement Checklist (per field, before `CreateTable` / `UpdateTable` / ECC helper emission)

1. Ran `SearchObject` for standard DE OR matched against the quick-lookup table → decision recorded.
2. If no standard hit, checked `cbo-context.md` for a CBO DE → decision recorded.
3. If priority 3 (new CBO DE), DE name follows `ZFIE{NN}` / `ZMME{NN}` / … from `naming-conventions.md`.
4. If priority 4 (primitive), inline justification exists in `plan.md` / `spec.md`.
5. Client-dependent table → field 1 is `MANDT` with DE `MANDT`, key-flag `X`.
