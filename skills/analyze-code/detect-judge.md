# analyze-code — Size Scout, Detect-Judge, Evidence Verify

Referenced by [`workflow.md`](workflow.md) Step 2. Same pattern as create-program Phase 6 ([`../create-program/phase6-detect-judge.md`](../create-program/phase6-detect-judge.md)): **cheap Haiku workers do the reading, one Opus agent decides**. Model rationale: [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Tier 3.

## Step 2a — Size scout (Haiku, `sc4sap:sap-checker`, `MODE: scout`)

One dispatch. Banner: `▶ phase=2a (size-scout) · agent=sap-checker · model=Haiku`.

```
MODE: scout
Scope: <OBJECT_NAME> (<OBJECT_TYPE>) — outline and line counts only; do not read every line.
Use GetProgFullCode (PROG / FUGR) or GetClass (CLAS) with output: "file" — it returns file paths
plus an outline with line ranges; count lines from the ranges / file (Grep -c), not by reading.
Return FACT lines with obj=<OBJECT_NAME> kind=<INCL for an include unit, else the object kind>:
- key="unit"        value="<include / class / FM name> lines=<n>"  — one per source unit
- key="total_lines" value="<sum>"
- key="callers"     value="<GetWhereUsed count> top=<up to 10 names>"
```

Main reads `total_lines` and branches:
- **≤ 1,500 lines** → single-reviewer path ([`workflow.md`](workflow.md) Step 2), then Step 2d.
- **> 1,500 lines** → Steps 2b + 2c below, then Step 2d.
- `BLOCKED reason="scope too large…"` → 2b without line counts: PROG / FUGR — main calls `GetIncludesList` (names only), batches of 4 includes per checker; CLAS — one checker per group on the whole class, told to fetch with `output: "file"` and Grep rather than read every line.
- Any other `BLOCKED` → single-reviewer path (the reviewer reads everything itself, as before).

## Step 2b — Detector fan-out (Haiku × N, `MODE: detect`)

Detector groups cover the dimensions answerable by pattern + count ([`analysis-dimensions.md`](analysis-dimensions.md)):

| Group | Dimensions | Rule files passed (absolute paths) |
|---|---|---|
| **G1 Naming** | §2 Naming, §5 Procedural/Form naming | `common/naming-conventions.md`, `common/procedural-form-naming.md` (the module-aware `configs/common/naming-conventions.md` is left to the judge — 2-file cap) |
| **G2 Literals** | §3 Constants, §7 Text elements & messages | `common/constant-rule.md`, `common/text-element-rule.md` |
| **G3 UI & layout** | §6 Include structure, §8 ALV | `common/include-structure.md`, `common/alv-rules.md` |
| **G4 Runtime** | §10 Performance, §11 Error handling | none — the dimension text is the rule list |
| **G5 Platform** | §12 Modern ABAP, §13 Security | none — dimension text; main inlines `abapRelease` / `sapVersion` from `.sc4sap/config.json` into the prompt |

Dispatch rules (main thread, ONE message):
- One checker per **(group × unit batch)**: batch units from Step 2a so one checker sees ≤ ~3,000 lines; never mix groups. Cap 16 checkers — above that, widen the batches, but never past ~6,000 lines per checker (beyond that, run G4 and G5 first and the other groups in a second message).
- Each prompt: `MODE: detect`, group id, the unit list, the rule file paths, and the dimension bullets copied from `analysis-dimensions.md` for that group (the checker does not open that file). `CAND` line numbers are unit-relative.
- Main writes every `CHECKER … END` block unchanged to `.sc4sap/analysis/<OBJECT>-candidates.md`. A `BLOCKED` scope → split once and re-dispatch; still blocked → hand it to the judge as "unscanned".
- Banner: `▶ phase=2b (detect) · agent=sap-checker×N · model=Haiku`.

## Step 2c — Opus judge (`sc4sap:sap-code-reviewer`, frontmatter model)

One dispatch. Banner: `▶ phase=2c (judge) · agent=sap-code-reviewer · model=Opus`. The prompt gives the candidates file path, the Step 2a facts, and the user's focus (if any). The judge:

1. **Adjudicates every `CAND` line** — confirm or reject with a one-line reason, reading source only around the cited line. Merges duplicates across groups.
2. **Evaluates the judgment dimensions itself** — §1 Syntax/semantics (`GetAbapAST`, `GetAbapSemanticAnalysis`), §4 OO patterns (`common/oop-pattern.md`), §9 SPRO lookup (`common/spro-lookup.md`), §14 where-used impact (`GetWhereUsed` — the scout's top-10 is only a start), plus module-aware naming from `configs/common/naming-conventions.md`.
3. **Reviews every "unscanned" scope** directly.
4. Returns the same contract as the single reviewer: `FINDING` lines below, summary metrics, top-3 fixes.

`BLOCKED` from the judge → surface the reason verbatim and stop, as for the single reviewer.

## Finding line format (both reviewer paths)

Every finding carries one machine-readable line, so Step 2d can test it:

```
FINDING id=F<n> sev=<CRITICAL|HIGH|MEDIUM|LOW> dim=<§n> unit=<include/class/FM> line=<n|-> evidence="<verbatim source, ≤120 chars>" fix="<≤120 chars>"
```

- `line` is **relative to `unit`** (the include / class / FM source as `GetInclude` / `GetClass` / `GetFunctionModule` return it) — never a line of the expanded `GetProgFullCode` text.
- Findings about something *missing* (no `AUTHORITY-CHECK`, no `sy-subrc` check) cite the statement that should carry it.
- `line=-` with `evidence="-"` only for findings with no source anchor (object naming, SPRO design, where-used impact).

## Step 2d — Evidence verify (Haiku × N, `MODE: verify`)

Catches findings whose quoted code does not exist — the reviewer's most damaging failure mode in a report the user acts on.

- Group the line-anchored `FINDING` lines by `unit`; one checker per unit batch (≤ 20 findings each), all in ONE message. Banner: `▶ phase=2d (evidence) · agent=sap-checker×N · model=Haiku`.
- Each assertion: `a<F-id>` — "`<unit>` contains `<evidence>` (whitespace and case ignored); evidence = the line number where it occurs".
- `PASS` → finding stays; if the reported line differs from the cited one by more than 3, main corrects `line` to the reported one. `FAIL` → finding moves to an **Unverified** list: left out of severity counts and the quality score, shown at the end of the report with the checker's evidence line.
- `line=-` findings skip 2d and are labelled *not line-anchored* in the report. Skip 2d entirely when there are no line-anchored findings.

## Cost and fallback

Haiku costs 1/40 of Opus per output token, so the scout + detectors + verifiers usually cost less than the Opus reviewer reading a large program end to end. If the fan-out fails (MCP errors on most checkers), fall back to the single-reviewer path and say so in the report header.
