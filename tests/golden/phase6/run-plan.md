# Phase 6 Golden Set — Run Plan (main thread)

Exact orchestration for one system. Repeat the whole plan per system (ECC 7.40, S/4HANA). **Detection
only — no fix loop**: no `sap-executor` dispatch, no `Update*` on the golden objects after creation.

## 0. Preconditions

1. Active profile = target system; `/sc4sap:trust-session` already granted (parent skill context).
2. All nine cases created per `README.md` § How to create; `GetInactiveObjects` shows only `ZSC4SAP_GS04O`;
   the `RunUnitTest` step of every case with tests is recorded (§ 1a).
3. Resolve once: `sapVersion` (`ECC` | `S4`), `abapRelease` = **740** for the review (the golden-set floor,
   also on S/4), primary logon language, plugin root (absolute path of this repo / installed plugin).
4. Stage reviewer inputs outside the golden folder so no reviewer can browse `expected.json`: for each case
   copy `GSnn/spec.md`, `interview.md`, `plan.md` to `.sc4sap/program/ZSC4SAP_GS0n/` under the
   profile-resolved artifact base. Never pass a `tests/golden/` path to any reviewer or checker.
5. Use a **fresh session per strategy** (buckets session, detect-judge session) so prompt caches and
   transcripts do not mix. Run the nine cases sequentially inside each session.

## 1. Phase 6 inputs per case

| Case | Objects (type) | Paradigm | Screen / GUI | FM |
|------|----------------|----------|--------------|----|
| GS01 | ZSC4SAP_GS01 (PROG/P); ZSC4SAP_GS01T/S/C/CT/E/O/I (PROG/I); 0100 (DYNP); STATUS_0100 (CUAD) | OOP | yes | — |
| GS02 | same shape, ZSC4SAP_GS02* | OOP | yes | — |
| GS03 | same shape, ZSC4SAP_GS03* | OOP | yes | — |
| GS04 | same shape, ZSC4SAP_GS04* | OOP | yes | — |
| GS05 | ZSC4SAP_GS05 (PROG/P); ZSC4SAP_GS05T/S/F/E (PROG/I) | Procedural | no | — |
| GS06 | ZSC4SAP_GS06 (PROG/P) | Procedural | no | — |
| GS07 | ZSC4SAP_GS07 (PROG/P); ZSC4SAP_GS07T/S/O/I/F (PROG/I); 0100 (DYNP); STATUS_0100 (CUAD) | Procedural | yes | — |
| GS08 | ZSC4SAP_GS08 (PROG/P); ZSC4SAP_GS08T/S/F (PROG/I); ZSC4SAP_GSFG (FUGR); ZSC4SAP_GS08_FM (FUNC) | Procedural | no | yes |
| GS09 | ZSC4SAP_GS09 (PROG/P); ZSC4SAP_GS09T/S/C/CT/O/I (PROG/I); 0200, 0210, 0220 (DYNP); STATUS_0200 (CUAD) | OOP | yes (tabstrip) | — |

The object list is the Phase 4 "created objects" list — pass it exactly as above, including GS05's `E`
include (Phase 4 created it) and GS06's single object.

## 1a. Unit-test record (Phase 5 equivalent)

Cases with tests (GS01–GS04, GS09) run `RunUnitTest` (container `PROG`, test class `LCL_TEST`) right after
activation — the recipe step before any PLANTED inactive step. Record per case and system in the results
file: tests run, failures, backend (ECC returns the result inline as `run_result`; on S/4HANA the MCP tool
runs `CLAS` containers only, so run the program tests in ADT / SE80 and record that, or record "not run").
Expected: 2 tests, 0 failures. A red or unrunnable test is a creation deviation: note it, do not "fix" it,
and exclude the case from scoring only when the program itself did not activate. Not scored otherwise.

**Harness context block** — append verbatim to every reviewer / checker / judge prompt:

```
HARNESS CONTEXT (Phase 6 golden-set run, detection only)
- program: <PROG>; objects: <object list>; transport: none (package $TMP, local objects)
- spec: <base>/.sc4sap/program/<PROG>/spec.md ; interview: .../interview.md ; plan: .../plan.md
- paradigm: <OOP|Procedural>; sapVersion: <ECC|S4>; abapRelease: 740; abapSp: unset; alvFramework: none
- verify-phase4.md: not available in this run — do not report its absence; verify screens and GUI statuses
  directly with GetScreen / GetGuiStatus.
- object names ZSC4SAP_GS* / ZSC4SAP_GSFG / ZSC4SAP_GS08_FM are fixed by the harness (approved naming
  exception, spec.md §Naming); include-suffix rules still apply.
- do not open any path under tests/golden/. Return text only; do not write files; no Update* calls.
```

## 2. Strategy A — `buckets` (default)

Per case, ONE message with 4 parallel dispatches (banner `▶ phase=6 · agent=sap-code-reviewer×4 · model=Sonnet`):

```
Agent({ subagent_type: "sc4sap:sap-code-reviewer", model: "sonnet",
  description: "GOLDEN <CASE> buckets B1",
  prompt: "[GOLDEN <CASE> buckets B1] Review bucket B1 covering items [1,2] (alv-rules, text-element-rule).
           Checklist: <plugin>/skills/create-program/phase6-review.md. Classification:
           <plugin>/skills/create-program/phase6-buckets.md § Finding Classification.
           Return the verdict table as text plus one FIX line per finding; do not write files.
           <HARNESS CONTEXT>" })
```

B2 = items [3,8] (read interview.md Paradigm first; load clean-code.md + exactly one paradigm file),
B3 = items [4,5,6,7], B4 = items [9,10,11,12]. Description tag `GOLDEN <CASE> buckets B<n>` is mandatory —
it is how transcripts are attributed in § 5.

**Escalation (6-3), detection only** — count MAJOR across the 4 bucket outputs:

| MAJOR | Action |
|-------|--------|
| 0 | No Opus. Case result = merged bucket findings. |
| 1–2 | One `sap-code-reviewer`, `model: "opus"`, description `GOLDEN <CASE> buckets OPUS`, scoped to the MAJOR FIX lines + affected objects: "confirm or reject each finding with a one-line reason; return the confirmed list". No executor, no iteration. |
| 3+ | Same agent with all 4 bucket outputs + object list: "confirm / reject every finding, return the confirmed list and a PASS / BLOCK verdict". |

Bucket retry: crash / timeout → re-dispatch that bucket once (same model); second failure → note
`bucket_failed` in results (do not substitute Opus — keeps the cost comparison honest).

**Case result (buckets)** = Opus-confirmed MAJORs (if Opus ran, rejected ones are dropped) + all bucket MINORs.

## 3. Strategy B — `detect-judge`

### Step 1 — detectors (Haiku), ONE message per case

Banner `▶ phase=6.detect · agent=sap-checker×5 · model=Haiku`. Each case is < 3,000 source lines, so one
checker per group covers the whole object list (5 checkers per case; never mix groups):

| Group | Items | Rule files (absolute, from plugin root) |
|-------|-------|----------------------------------------|
| D1 UI | §1 | common/alv-rules.md, common/ok-code-pattern.md (+ common/screen-tabstrip.md for GS09) |
| D2 Text | §2 | common/text-element-rule.md |
| D3 Hygiene | §3, §8 core | common/constant-rule.md, common/clean-code.md |
| D4 Structure | §4, §6, §7 | common/include-structure.md, common/naming-conventions.md (+ common/function-module-rule.md when an FM is in scope) |
| D5 Platform | §9, §10, §12 | common/abap-release-reference.md, common/sap-version-reference.md |

```
Agent({ subagent_type: "sc4sap:sap-checker", model: "haiku",
  description: "GOLDEN <CASE> detect D<n>",
  prompt: "[GOLDEN <CASE> detect D<n>] MODE: detect. Group D<n>. Objects: <list>. Rule files: <abs paths>.
           Checklist items (copied from phase6-review.md): <verbatim text of the group's § items>.
           paradigm=<..> abapRelease=740 sapVersion=<..>. Return CHECKER ... END blocks only.
           <HARNESS CONTEXT>" })
```

Main concatenates the `CHECKER … END` blocks unchanged into
`.sc4sap/program/<PROG>/review-candidates.md`. `status=BLOCKED` → split that scope once and re-dispatch;
still blocked → hand it to the judge as "unscanned".

### Step 2 — judge (Opus), one dispatch per case

```
Agent({ subagent_type: "sc4sap:sap-code-reviewer", model: "opus",
  description: "GOLDEN <CASE> judge",
  prompt: "[GOLDEN <CASE> judge] Follow <plugin>/skills/create-program/phase6-detect-judge.md Step 2:
           adjudicate every CAND line in <base>/.sc4sap/program/<PROG>/review-candidates.md, run §5, §8
           paradigm design and §11 yourself, review unscanned scopes, classify MINOR / MAJOR, return the
           review.md body + FIX lines. <HARNESS CONTEXT>" })
```

Banner `▶ phase=6.judge · agent=sap-code-reviewer · model=Opus`. **Step 3 (fix loop) is skipped.**

**Case result (detect-judge)** = judge-confirmed findings.

## 4. Scoring (main thread, after both sessions)

For each case × strategy, compare the case result with `GSnn/expected.json` (main thread only):

1. **Planted found** — a finding whose object matches `planted[].objects` (or the program for program-wide
   items) AND whose checklist item equals `checklist_item` or one of `also_acceptable_as`. Line numbers are
   a tie-breaker, not required (GS02 / GS04 have no source line).
2. **Severity hit** — that finding is MAJOR.
3. Every other finding: if it describes an `unavoidable_secondary_findings` facet → ignore; if it matches a
   `must_not_flag` construct → false (tag the `MNF-*` id); otherwise false. Count MAJOR and MINOR separately.
4. Fill the README results template. Keep raw outputs in `.sc4sap/program/<PROG>/golden-<strategy>.md`.

## 5. Cost collection

Transcripts: `~/.claude/projects/<project-slug>/<session-id>/subagents/agent-*.jsonl` (one file per
subagent). Attribute a file to a run by its first user message, which starts with the `[GOLDEN <CASE> …]`
tag. Per assistant line, read `message.model` and `message.usage`:
`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. A response can
appear on several lines (streamed blocks) — dedupe by `message.id`, keep the last line per id.

```
cost = Σ (input × P_in + cache_creation × P_cw + cache_read × P_cr + output × P_out) / 1e6
```

All `P_*` come from `scripts/hud/lib/pricing.mjs` (`priceFor(model)` → `{ input, output, cacheWrite,
cacheWrite1h, cacheRead }`, `costOf(usage, price)` — the single price source, also quoted in
`common/model-routing-rule.md`). Record the file's "Last checked" date in the results header. `costOf`
splits 5-minute / 1-hour cache writes and applies the Haiku 5.5 long-prompt tier per request. Main-thread
tokens are excluded (same orchestration overhead for both strategies). A helper the main thread may save
(via Write) and run with `node <file> <subagents-dir> <plugin-root>`:

```js
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [dir, root] = process.argv.slice(2);
const { priceFor, costOf } = await import(pathToFileURL(path.join(root, 'scripts/hud/lib/pricing.mjs')).href);
const out = {};
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('agent-') && x.endsWith('.jsonl'))) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const first = lines.find((l) => l.type === 'user');
  const txt = JSON.stringify(first?.message?.content ?? '');
  const tag = (txt.match(/\[GOLDEN [^\]]+\]/) || ['[untagged]'])[0];
  const byId = new Map(); for (const l of lines) if (l.message?.usage && l.message?.id) byId.set(l.message.id, l.message);
  let usd = 0;
  for (const m of byId.values()) usd += costOf(m.usage, priceFor(m.model));
  out[tag] = (out[tag] || 0) + usd;
}
console.log(JSON.stringify(out, null, 2));
```

Sum the tags per case × strategy (`buckets B1–B4 + OPUS`, `detect D1–D5 + judge`).

## 6. Wall-clock

Main thread records an ISO timestamp immediately before the first dispatch of a case × strategy and
immediately after the last result arrives (buckets: after Opus escalation if it ran; detect-judge: after
the judge). Wall-clock = difference in seconds. Do not include creation time or scoring time.
