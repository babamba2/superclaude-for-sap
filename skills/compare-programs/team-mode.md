# compare-programs — Team Mode orchestration (Type A rollout)

Companion to `SKILL.md` + `workflow.md`. Applies Type A (Cross-Module Consultant Panel) of [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) to Step 4b when consultants claim overlapping program ownership. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md).

## Gating — when teamMode activates

teamMode is **escalation-on-ownership-conflict**, layered on top of the existing Step 4b gate (`module_set ≥ 2`). Activates when ALL are true:

1. Step 4 analyst returned `module_set` with ≥ 2 modules (existing Step 4b gate).
2. Round 1 POSITIONs claim the same program as PRIMARY from 2+ modules (ownership conflict).

When the ownership conflict does NOT exist (consultants position on different primary programs → complementary views) → fall through to the legacy Step 4b output path (`module_consultant_outputs` feeds into Step 5 writer render).

## Rounds — lead-orchestrated serialization

### Round 1 — POSITION (always runs in place of legacy Step 4b)

Replaces the legacy Step 4b consultant dispatch. The lead:

1. Generate `team_name` = `compare-programs-<YYYYMMDD-HHMMSS>`.
2. Create team via `TeamCreate`; shared task dir auto-created.
3. Write `00-charter.md` (omit null environment fields):
   ```
   TEAM CHARTER
   team_name: <team_name>
   invoked_by: /sc4sap:compare-programs
   members: <sap-<module>-consultant for each module in module_set>
   round_cap: 3
   environment:
     sapVersion: <from config.json>
     abapRelease: <from config.json>
     industry: <from config.json or sap.env>    # omit if unset
     country: <from config.json or sap.env>     # omit if unset
     activeModules: <comma-separated>
   programs_under_comparison:
     - <program-1 name + one-line business facts>
     - <program-2 name + one-line business facts>
     - ...
   module_set: <list from analyst>
   question: For each of the N compared programs, identify if it is PRIMARY to your module, SECONDARY (you consume its output), or NOT_YOURS. Justify in 1-2 sentences.
   ```
4. Emit phase banner per member, spawn all consultants **in parallel**:
   ```
   ▶ phase=4b.R1 (position-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
   ```
   Spawn shape:
   ```
   Agent({
     subagent_type: "sc4sap:sap-<module>-consultant",
     team_name: "<team_name>",
     name: "sap-<module>-consultant",
     description: "Round 1 POSITION — <MODULE> ownership claims",
     prompt: """
       teamMode=true, round=1.
       Charter: ~/.claude/tasks/<team_name>/00-charter.md

       Follow common/team-consultation-protocol.md § Message file format.

       For each program in programs_under_comparison, decide PRIMARY / SECONDARY / NOT_YOURS
       from your module's perspective. Write your POSITION to
       ~/.claude/tasks/<team_name>/10-<your-name>-position.md

       POSITION fields:
         assumption: (your reading of the programs' purpose)
         recommendation: per-program claim — e.g., "PRIMARY: ZMMGR1 · SECONDARY: ZCOGR1 · NOT_YOURS: ZSDBILL1"
         confidence: high | med | low
         rule-cites: configs/<MODULE>/*.md paths or TCodes

       Reasoning HARD max 5 lines. Return after writing.
     """,
     mode: "dontAsk"
   })
   ```
5. Wait for idle notifications from all N members. Read all `10-*.md` files.

### Divergence check — ownership conflict detection

Lead parses each POSITION's `recommendation` into per-program claims. Rule:

- **No conflict** — for every program, at most ONE member claims `PRIMARY` (others are SECONDARY or NOT_YOURS). → exit teamMode, pass positions as `module_consultant_outputs` to Step 5.
- **Conflict** — at least one program has 2+ members claiming `PRIMARY`. → continue to Round 2 for that program subset.

**Fast-path** — if all positions show exactly one PRIMARY claim per program AND all confidences ≥ `med`, exit immediately without further parsing.

### Round 2 — CHALLENGE + REFINEMENT

> R2 operational details (inline peer POSITIONs, `-r2` name suffix for re-spawn, withdrawal-as-CONCUR) — see [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § R2 spawn mechanics + § Message types.

Scoped to programs with ownership conflict. Spawn all members in parallel with peer POSITIONs attached.

```
▶ phase=4b.R2 (challenge-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
```

Spawn prompt includes:
- Round 1 positions for conflicted programs only.
- Instruction: "For each peer's PRIMARY claim on a program you also claim PRIMARY, write `20-<own>-challenge-<target>.md` citing why your module has stronger ownership (table anchoring, TCode-native user, downstream consumer)."

Read `20-*.md` and `30-*.md` (refinements) after completion.

Second divergence check → if refined POSITIONs converge (each program has single PRIMARY) → synthesis. Else → Round 3.

### Round 3 — CONCUR / ESCALATE

Spawn all members in parallel with all R1+R2 content. Each appends ONE entry to `40-consensus.md`:
- `CONCUR`: accept peer's PRIMARY claim on the conflicted program, own module becomes SECONDARY.
- `ESCALATE`: program is genuinely shared — both modules claim legitimate PRIMARY use; lead arbitrates or records as "dual-primary" in output.

### Lead arbitration (ESCALATE only)

Write `99-lead-arbitration.md`. For compare-programs, "dual-primary" is often the correct recording (program genuinely serves both modules equally) — lead should NOT force a single owner unless rules strongly favor one side. Flag explicitly in Step 5 writer input.

## Synthesis — Step 5 writer input variant

Unlike ask-consultant (writer produces user-facing answer), compare-programs Step 5 writer renders the full comparison matrix. teamMode output feeds `module_consultant_outputs` for Step 5.

**Writer spawn** (regular Agent, NOT team member, per common pattern — see ask-consultant team-mode.md § Synthesis footnote):

1. Emit banner:
   ```
   ▶ phase=5 (render) · agent=sap-writer · model=Haiku 4.5
   ```
2. Spawn `sap-writer` **WITHOUT `team_name`**. Pass:
   - Path to all task files (`00-charter.md` through `40-consensus.md`, `99-lead-arbitration.md` if present).
   - Analyst output from Step 4 (pre-existing).
   - Instruction: "Use `40-consensus.md` as authoritative per-program ownership. For dual-primary programs (from 99-lead-arbitration.md), render BOTH module perspectives side-by-side in the comparison matrix."

## Response prefix — teamMode variant

Override standard prefix to include team cost:

```
[Model: <main> · Dispatched: Opus×K (sap-<module>-consultant names), Opus×1 (sap-analyst), Haiku×1 (sap-writer) · Team: <K> members × <rounds> rounds]
```

Where `<K>` = distinct modules in module_set, `<rounds>` = actual rounds (1 if no ownership conflict; 2 or 3 if escalated).

## Cleanup

After Step 5 renders the final report:

1. **Shutdown teammates** — `SendMessage(to=<name>, message={type:"shutdown_request", reason:"compare teamMode complete"})` to each consultant in parallel.
2. **Keep directories** — do NOT `TeamDelete` (audit trail for prototype evaluation).

Writer is not a team member so no shutdown_request.

## Prototype notes

- Type A's ask-consultant prototype covers the peer-deliberation mechanics. This skill's contribution to Phase 2 evaluation: **ownership-conflict detection** (a richer divergence signal than ask-consultant's "same TCode / different TCode"). If positions rarely conflict in real programs, the teamMode path will rarely activate — that's fine, legacy Step 4b handles it.
- Consider pruning Round 2 when only 2 programs are compared (2-program + 2-consultant case is small enough that lead arbitration after R1 is cheaper than R2 + R3).

## Related

- [`SKILL.md`](SKILL.md), [`workflow.md`](workflow.md) — main skill spec (workflow.md Step 4b is the integration point)
- [`../ask-consultant/team-mode.md`](../ask-consultant/team-mode.md) — Type A template (prototype)
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc
