# Context Loading Protocol — On-Demand, Per-Task

Rule for how agents and skills read rule files. Replaces the implicit "load CLAUDE.md + every common/*.md" pattern that inflates every prompt and dilutes the model's attention.

## Why

sc4sap has 25+ `common/*.md` rule files + ~20 `configs/{MODULE}/*.md` + 30 `industry/*.md` + 16 `country/*.md`. Loading all of them into every agent dispatch:

- burns tokens on rules irrelevant to the current task,
- reduces the model's effective attention budget for the actual work,
- and — observed in past runs — dilutes enforcement (reviewer "skims" 12 rule files instead of deeply applying 3).

The fix: treat `CLAUDE.md` as an **index**, not a context payload. Each skill phase / reviewer bucket / agent turn declares an explicit **context kit** — the minimal set of rule files required for THIS step — and agents read only those.

## The 3 rules

### Rule 1 — CLAUDE.md is an index, not a payload

`CLAUDE.md` at repo root is loaded once at session start as an **index**. Agents and skills do NOT re-read every `common/*.md` referenced from it. The index's purpose is to tell the reader "a rule exists for topic X, at path P" — the actual rule file is fetched on demand.

### Rule 2 — Every dispatch declares a context kit

Every skill phase, every Phase 6 reviewer bucket section, every `Agent(...)` call MUST declare the minimum file set required for that step. Format:

```
**Context kit**: [naming-conventions.md, field-typing-rule.md, ecc-ddic-fallback.md]
```

The agent's first action is to `Read` exactly those files — and NOT others. If during execution the agent encounters a decision that needs a rule outside the declared kit, it MUST either:

- fetch that file on demand (and log the expansion), OR
- respond with `BLOCKED — context kit insufficient for <decision>` and request an updated kit.

### Rule 3 — Progressive disclosure via "triggered reads"

Some files load only when a trigger keyword appears in the task. Example triggers declared in the skill prompt:

| Trigger | Loads |
|---|---|
| `ALV` present in interview | `common/alv-rules.md` |
| `Procedural` paradigm | `common/clean-code-procedural.md`, `common/procedural-form-naming.md`, `common/ok-code-pattern.md` |
| `OOP` paradigm | `common/clean-code-oop.md`, `common/oop-pattern.md` |
| `CALL SCREEN` in source | `common/ok-code-pattern.md` |
| `ECC` platform | `common/ecc-ddic-fallback.md` |
| module = `MM`/`SD`/… | `configs/{MODULE}/spro.md` + `configs/{MODULE}/tcodes.md` |
| industry set | `industry/<key>.md` |
| country set | `country/<iso>.md` |

Triggered reads are additive to the declared context kit.

## Enforcement — agent side

Every sc4sap agent prompt ends with this directive:

> **Context kit discipline**: Read only the files listed in your Context kit + any triggered reads that apply. Do NOT preemptively load `CLAUDE.md` references, do NOT tab through `common/*.md` "just in case". If the kit is insufficient for a decision, stop and report — do not invent rules from prior training.

## Context kit ownership

- **Skills** declare the kit for each phase (see per-phase blocks in `skills/create-program/phase4-parallel.md`, `phase6-review.md`, `agent-pipeline.md`).
- **Agents** inherit the kit from the dispatching skill unless explicitly overridden.
- **Reviewer** per Phase 6 bucket — each of §1–§12 has its own narrow kit (e.g., §1 ALV → only `alv-rules.md` + `ok-code-pattern.md`; §2 Text → only `text-element-rule.md`).

## Example — Phase 4 Wave 1 (DDIC)

Instead of loading 25 rule files, Wave 1 declares:

```
**Context kit**: [field-typing-rule.md, naming-conventions.md, ecc-ddic-fallback.md]
**Triggered reads**: if ECC → ecc-ddic-fallback.md (already in kit); if industry set → industry/<key>.md
```

Agent dispatched for Wave 1 reads those 3 files only. If it encounters an ALV-related decision (it shouldn't in Wave 1 — that's Wave 4), it requests `alv-rules.md` explicitly.

## Anti-patterns

- **Implicit "read all of common"** at agent start — wastes tokens, dilutes attention.
- **Skill prompt lists 15 rule files as "read these"** without filtering — defeats the protocol; same outcome as implicit loading.
- **Agent silently reads a file outside its kit** without logging the expansion — loses audit trail; reviewer can't tell what was actually considered.

## Integration

- `skills/create-program/phase4-parallel.md` — each Wave declares its kit at top.
- `skills/create-program/phase6-review.md` — each §1–§12 annotation lists its kit inline.
- `skills/create-program/agent-pipeline.md` — each Phase bullet lists its kit.
- `agents/sap-executor.md`, `agents/sap-code-reviewer.md` — "Context Kit Protocol" section instructs on the discipline.
