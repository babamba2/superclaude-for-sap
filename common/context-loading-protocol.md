# Context Loading Protocol — 4-Tier On-Demand Model

Rule for how agents and skills read rule files. Replaces the implicit "load CLAUDE.md + every common/*.md" pattern. Four tiers: global mandatory safety baseline, role-mandatory per-agent fixed set, triggered reads, and per-task context kits.

## Why

sc4sap has 25+ `common/*.md` + 14 `configs/{MODULE}/*.md` + 30 `industry/*.md` + 16 `country/*.md`. Loading everything wastes tokens and dilutes enforcement. But unconditional per-task loading also breaks — some files are load-bearing safety rails that every dispatch must honor regardless of task. The 4 tiers separate "must always read" from "read when needed" from "read only for this phase".

## The 4 tiers

### Tier 1 — Global Mandatory (every agent, every skill, every session)

These files are safety rails and platform baselines. Every agent loads them at session start — they are NOT in the declared kit because they are assumed. Skipping them leaks PII, generates broken-platform code, or produces objects that violate the Z/Y namespace.

| File | Why mandatory |
|---|---|
| [`data-extraction-policy.md`](data-extraction-policy.md) | `GetTableContents` / `GetSqlQuery` gating — `acknowledge_risk` HARD RULE. Non-negotiable safety. |
| [`sap-version-reference.md`](sap-version-reference.md) | ECC vs S/4HANA platform differences drive every table / BAPI / syntax choice. |
| [`naming-conventions.md`](naming-conventions.md) | Z/Y namespace + module prefix — applies to any mention, creation, or review of a custom object. |
| [`context-loading-protocol.md`](context-loading-protocol.md) | This file — agents must understand kit discipline before applying it. |
| [`model-routing-rule.md`](model-routing-rule.md) | Sonnet↔Opus escalation rule. Agents hitting a blocker must know how to return `BLOCKED` correctly. |

### Tier 2 — Role-Mandatory (agent role group → fixed additional set)

Each agent declares its role group. The group determines additional files always loaded at session start, on top of Tier 1.

| Role group | Agents | Additional files |
|---|---|---|
| **Code Writer** | `sap-executor`, `sap-qa-tester`, `sap-debugger` | `clean-code.md`, `abap-release-reference.md`, `transport-client-rule.md`, `include-structure.md` |
| **Reviewer** | `sap-code-reviewer`, `sap-critic` | `clean-code.md`, `abap-release-reference.md`, `include-structure.md` *(per-bucket kits in `phase6-review.md` §1-§12 narrow further)* |
| **Planner / Architect** | `sap-planner`, `sap-architect` | `include-structure.md`, `active-modules.md`, `customization-lookup.md`, `field-typing-rule.md` |
| **Analyst / Writer** | `sap-analyst`, `sap-writer` | `active-modules.md` |
| **Doc Specialist** | `sap-doc-specialist` | *(none — task-driven only)* |
| **Module Consultant** | `sap-sd-`, `sap-mm-`, `sap-pp-`, `sap-pm-`, `sap-qm-`, `sap-wm-`, `sap-tm-`, `sap-tr-`, `sap-fi-`, `sap-co-`, `sap-hcm-`, `sap-bw-`, `sap-ps-`, `sap-ariba-consultant` | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/spro.md`, `configs/{MODULE}/tcodes.md`, `configs/{MODULE}/bapi.md`, `configs/{MODULE}/tables.md`, `configs/{MODULE}/enhancements.md`, `configs/{MODULE}/workflows.md` |
| **Basis Consultant** | `sap-bc-consultant` | `transport-client-rule.md`, `configs/common/*.md` (system admin) |

**Loading timing — session start**. When an agent is dispatched, the FIRST action is to load Tier 1 + Tier 2 before doing any MCP call, reading spec.md, or writing code. This ensures consistent behavior across a session even if the dispatching skill's kit declaration is minimal.

**Paradigm gate** — agents in **Code Writer** and **Reviewer** groups additionally load `clean-code-oop.md` OR `clean-code-procedural.md` after reading `interview.md` → Paradigm dimension. Loading both or the wrong one is a MAJOR finding.

### Tier 3 — Triggered Reads (on-demand when a condition is detected)

Additive to Tier 1 + Tier 2. Loaded only when the trigger condition is true for the current task.

| Trigger | Loads |
|---|---|
| ALV output present | `alv-rules.md` |
| `paradigm = Procedural` | `clean-code-procedural.md`, `procedural-form-naming.md`, `ok-code-pattern.md` |
| `paradigm = OOP` | `clean-code-oop.md`, `oop-pattern.md` |
| Source contains `CALL SCREEN` | `ok-code-pattern.md` |
| `SAP_VERSION = ECC` | `ecc-ddic-fallback.md` |
| `SAP_VERSION = S4_CLOUD_PUBLIC` | `cloud-abap-constraints.md` |
| industry set | `industry/<key>.md` |
| country set | `country/<iso>.md` |
| DDIC Table/Structure/DataElement creation | `field-typing-rule.md` |
| Function Module creation / update | `function-module-rule.md` |
| Text element emission | `text-element-rule.md` |
| Magic literal / fcode / status literal | `constant-rule.md` |

### Tier 4 — Per-Task Context Kit (skill declares at dispatch)

Skill phase / Wave / reviewer bucket declares the **minimal** additional files specific to the task. Agent reads only those in addition to Tier 1-3.

Format:
```
**Context kit**: [alv-rules.md, text-element-rule.md]
**Triggered reads**: if `paradigm=Procedural` → add ok-code-pattern.md
```

Declared in:
- `skills/create-program/phase4-parallel.md` — per Wave
- `skills/create-program/phase6-review.md` — per §1-§12 bucket
- `skills/create-program/agent-pipeline.md` — per Phase
- Any skill's SKILL.md that dispatches agents

## Enforcement — agent side

Every sc4sap agent prompt begins with a `<Mandatory_Baseline>` block declaring its role group. The agent, at session start, MUST:

1. Load Tier 1 (5 files) — unconditional.
2. Load Tier 2 for its declared role group.
3. When the task begins, evaluate Tier 3 triggers and load matching files.
4. Read the dispatched Tier 4 context kit.
5. Begin work.

**Expansion protocol**: if the agent needs a file outside Tier 1-4 (e.g., a corner-case rule not covered), it may fetch ONE file on demand and log the expansion in its summary. More than 2 on-demand expansions → return `BLOCKED — context kit insufficient: <list>` so the skill can provide an updated kit.

## Anti-patterns

- **Skipping Tier 1** — "I didn't load data-extraction-policy because my task doesn't touch row data" — false economy; the policy applies even to refusing a user ask. Tier 1 is mandatory.
- **Implicit preload** of all `common/*.md` — defeats the protocol; same outcome as no protocol at all.
- **Skill prompt restates Tier 1/2 as "read these"** — redundant; the agent already loads them from its role group. Skill should only declare Tier 4 kit + Tier 3 triggers.
- **Agent silently reads outside its tier set** without logging — loses audit trail.

## Integration

- `agents/*.md` — each agent declares `<Mandatory_Baseline>` citing its role group; inherits Tier 1+2 automatically.
- `skills/create-program/phase4-parallel.md` — each Wave declares Tier 4 kit + Tier 3 triggers.
- `skills/create-program/phase6-review.md` — each §1-§12 declares Tier 4 narrow kit (bucket-scoped).
- `skills/create-program/agent-pipeline.md` — top paragraph anchors discipline; per-Phase kit declared.
- `CLAUDE.md` index — flags Tier 1 as the "always-loaded baseline".
