# Cost Rules — create-program

Companion to [`agent-pipeline.md`](agent-pipeline.md). Measured basis (2026-11-20, one two-program run): main thread 40% of cost, Opus executors 35%, Opus reviewers 18%. Almost all of it was cache re-reads: the main context grew from 87k to 580k tokens and every call re-read it; one third of the main-thread cost came from fix requests after delivery, at 540k+ context.

Sections 1 and 3 apply in **both** cost modes — they move work, they never drop it. Section 2 applies in **eco** only. Where a line elsewhere in this skill conflicts, this file wins. The deliverable never changes ([`../../common/cost-mode.md`](../../common/cost-mode.md) § lever C).

## 1. Fix rounds and the post-delivery hand-off

### 1a. Fix rounds (Phase 4 syntax, Phase 5 QA, Phase 6 review, `--fix`)

- **Never resume** a finished executor or reviewer (`SendMessage` to its id) for a fix or re-review. A resumed agent re-reads its whole earlier context (measured: 840k tokens for a few-line fix).
- **Small fix → main thread**: every finding ≤ ~10 changed lines, ≤ ~30 changed lines in total per include, the include ≤ ~300 lines, and no structural change (no new include, class, FORM / method signature or screen). The main thread reads the paradigm's convention file the fix touches (`oop-pattern.md` / `procedural-form-naming.md`, or the code template's `profile.md`), fetches that one include, Edits locally, `Update*`, then activation (the SAP syntax check runs inside it) + inactive check (Haiku `sap-checker`).
- **Larger or structural fix → fresh executor**: a new `sap-executor` gets only the `FIX` lines, the object names and the paths of `spec.md` / `plan.md` (no source pasted into the prompt). Model per § 2 (standard: Opus). Escalate after two failed attempts on the same finding — counted across actors, main thread included.
- **Logs, whoever fixes**: append the `## Decisions` lines to `decisions.md` and the check result lines to `verify-phase4.md` (newest wins), as [`agent-pipeline.md`](agent-pipeline.md) Phase 4 requires; rebuild `receipt.json` with `scripts/evidence/build-receipt.mjs` before the report.
- **Re-review covers the diff only**: the changed lines plus their enclosing FORM / method, scoped to the fixed findings — a fresh reviewer, never the earlier one.
- **Skip the re-review** when every fixed finding was MINOR (none touched a MAJOR-class item) and syntax check + activation + inactive check pass. A MAJOR fix is always re-reviewed (diff only). The 3-iteration limit and `❌ BLOCKED` rule in [`phase6-output-format.md`](phase6-output-format.md) stay.

### 1b. Post-delivery hand-off (after Phase 8)

Test feedback ("this button is greyed out", "use table X instead") usually arrives after the report, when the main context is largest. Move it to a fresh session:

1. After the report (and the HTML / test hand-off lines), main writes `.sc4sap/program/{PROG}/handoff.md`: active profile alias and SAP system ID / client, platform and `abapRelease`, package, transport, paradigm, code template, program + include names with line counts, open items from the report, and the paths of `spec.md`, `plan.md`, `review.md`, `decisions.md`, `state.json`.
2. Main closes with one line in the user's language: *"For changes after testing, open a new session and run `/sc4sap:create-program {PROG} --fix "<what to change>"` — it starts from handoff.md instead of this long context."* (A host that runs the skill without a terminal may tell it to leave this line out.)
3. When the user still asks for a change in the same session, do it (§ 1a) and repeat the line once, unless the host said to leave it out.

### 1c. `--fix` mode (new session)

Entry: the arguments carry `--fix "<request>"`, or name a `{PROG}` whose `state.json` shows Phase 8 completed. `--eco` / `--standard` still resolve per `cost-mode.md` and are stripped with `--fix`.

- Read `handoff.md`, `state.json` (execution mode, code template) and the `spec.md` sections the request touches — nothing else up front. Phases 0–3 do not re-run; the approved spec stands.
- **Prove the system before any write**: the active profile must match `handoff.md`, and `SearchObject` must find `{PROG}` in the package of `handoff.md`. Mismatch → stop and ask which system is meant.
- Session trust: invoke `/sc4sap:trust-session` as in Phase 1A Step 0 (it skips itself when still valid).
- Change request outside the approved spec (new field, new screen, new table) → show the spec delta, get an approval keyword per [`spec-approval-gate.md`](spec-approval-gate.md), append it to spec.md § Approval as a change entry.
- Fetch only the includes the change touches (scout first when an include is over ~300 lines, § 3), fix per § 1a, diff-only review per § 1a.
- Append a `## Change <n>` section to `report.md` with evidence lines for the checks that ran. Transport: the one in `handoff.md` unless the user names another.

## 2. Executor model in eco

| Work | standard | eco |
|---|---|---|
| Waves 1–3 (DDIC, classes / FMs, includes + main) from an approved spec | Opus · high | **Sonnet · medium** |
| G4-prep text elements, Wave 4 screens / GUI status | Sonnet (frontmatter effort) | Sonnet · low |
| Fix rounds (§ 1a) | main thread first, else Opus | main thread first, else Sonnet · medium |

- Escalate one dispatch to **Opus · medium** (banner `▶ … escalate`) when `ActivateObjects` reports syntax errors twice on the same object, the executor returns `BLOCKED`, or the spec marks a step as novel algorithm (pricing / allocation / scheduling logic with no reference program and no template). This replaces the general eco `BLOCKED` rule in `cost-mode.md` for create-program executors.
- Both modes: the executor writes each include **in one local Write** (complete file), not as a chain of small Edits, and uploads it with one `Create*` / `Update*`. Pass spec / plan / ddic-brief as **paths**, never pasted content.

## 3. Main-thread context (Phases 1A – 2, and `--fix`)

- The main thread does **not** call `GetProgram` / `GetInclude` / `GetProgFullCode` / `GetClass` / `GetFunctionModule` itself on reference objects (programs the user names, includes such as authority-check or logging helpers, the email routine to reuse). One `sap-checker` (`MODE: scout`) per object reads it and returns `FACT` lines: FORM / method names with signatures, the statements to reuse, tables read and written, line ranges. Main appends them to `ddic-brief.md`.
- DDIC of more than 3 objects at once (`GetTable` / `GetStructure`) → the § Phase 1A DDIC scout, never main-thread calls.
- Local files: main reads whole only files ≤ ~200 lines; larger ones (CBO inventory, earlier specs) by Grep or a line range.
- A user hint arriving mid-interview ("use include ZXXX for authority check") is a scout dispatch plus one line in `module-interview.md` / `interview.md`, not a main-thread read.
- Exception: a fix in § 1a fetches the one include it changes.
- Main-thread writes to `.sc4sap/program/{PROG}/` files use the Write / Edit tools, not shell redirection, because the evidence guard may deny shell commands that name the sc4sap state folder.
