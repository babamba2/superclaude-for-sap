# Interview Gating — create-program

Authoritative content for the `<Interview_Gating>` block referenced by `SKILL.md`. Phase 1 of the pipeline. **MANDATORY — never skip, never shortcut, never merge.**

Phase 1 runs as **two sequential sub-phases** (1A then 1B) on every `sc4sap:create-program` invocation. Skipping a dimension, accepting "just build it" to bypass questioning, inferring answers from context, **or bulk-proposing multiple dimensions in a single message** is a protocol violation. If the user pushes to skip, answer: *"The interview is mandatory — I will run Module Interview first, then Program Interview, one question at a time."*

**Two-stage rule**: Phase 1B (technical) NEVER starts before Phase 1A (business) closes. The technical conversation has no meaning without business context.

---

## One-Question-Per-Turn Rule (applies to BOTH Phase 1A and Phase 1B)

**This rule is the single most important enforcement in the entire interview — it protects first-time users who need to understand each decision.** Both sub-phases run as Socratic dialogue, one dimension per message, regardless of user impatience.

**Hard prohibitions**:
- ❌ Do NOT dump all remaining dimensions into a single table/proposal block for "batch approval" — even if the user says *"알아서 해줘"*, *"figure it out"*, *"just decide"*, *"ok everything"*, *"batch them"*.
- ❌ Do NOT present Q2, Q3, Q4 as sub-questions of Q1. One dimension = one message = wait for user answer.
- ❌ Do NOT pre-answer on the user's behalf and ask only *"approve?"*. The user must actively choose for each dimension.

**Handling an impatient user** (`"알아서 해줘"` / *"you decide"*):
1. Acknowledge the fatigue politely.
2. Explain: *"I will keep going one question at a time — this protects you from decisions you didn't see. I can propose a default per question which you confirm with a single word."*
3. Continue with **the next single dimension only**, presenting your recommended default as part of that one question (not as part of a block).
4. Wait for the user's response. Advance only after they confirm or modify that one dimension.

**First-time user safeguard**: The person running `/sc4sap:create-program` for the first time does not know what "Paradigm OOP vs Procedural" or "Full CL_GUI_ALV_GRID vs SALV" actually means. Bulk-proposing all 7 dimensions at once denies them the chance to ask "what does this mean?" on each one. Always keep the door open for one dimension at a time.

**Recovery clause**: If you already bulk-proposed (protocol violation), apologize, roll back, and restart the sub-phase from the first unanswered dimension with strict one-question cadence. Do NOT count a block "ok" as approval for a block proposal — it is invalid by protocol.

---

## Phase 1A — Module Interview (Module Consultant lead)

**Purpose**: Establish business context, validate the need for custom development, identify reusable assets, and let a domain consultant propose SAP-standard alternatives BEFORE any technical decision is made.

**Lead agent**: `sap-{module}-consultant` (matched by user's initial request — `sap-sd-consultant`, `sap-mm-consultant`, `sap-fi-consultant`, `sap-co-consultant`, `sap-pp-consultant`, `sap-ps-consultant`, `sap-qm-consultant`, `sap-pm-consultant`, `sap-wm-consultant`, `sap-hcm-consultant`, `sap-tm-consultant`, `sap-tr-consultant`, `sap-ariba-consultant`, `sap-bw-consultant`, `sap-bc-consultant`).

**Industry / Country preflight** (MANDATORY — runs before dimension 1):
- Read `.sc4sap/config.json` (`industry`, `country`) and `.sc4sap/sap.env` (`SAP_INDUSTRY`, `SAP_COUNTRY`). Precedence: `config.json` > `sap.env`.
- If `industry` is set → load `industry/<key>.md` and use it as the consultant's business backdrop. Do **not** re-ask.
- If `country` is set → load `country/<iso>.md` (alpha-2 lowercase; `eu-common` for EU-wide; multi-country = load each and flag intercompany/intra-EU/transfer-pricing touchpoints). Do **not** re-ask.
- If either is missing → asking is **mandatory** before dimension 1. Do not infer from project/package names. Ask:
  - *"Which industry does this program belong to? (`industry/README.md` lists supported keys — e.g. `automotive`, `retail`, `pharma`)"*
  - *"Which country / localization applies? (ISO alpha-2 lowercase: `kr`, `us`, `de`, `eu-common`; multiple allowed)"*
- Offer: *"Save the answer to `.sc4sap/config.json` so future runs skip this question? (yes/no)"*. Persist on `yes`; keep run-scoped on `no`.
- Record resolved values in the `module-interview.md` header (`industry:`, `country:`, `source: config.json | sap.env | user-this-run`).

**Dimensions** (one question per turn):
1. **Module identification** — single or multi (SD/MM/FI/CO/PP/PS/QM/PM/WM/HCM/TM/TR/Ariba/BW/BC). If ambiguous, this is the FIRST question; consultant cannot be summoned until resolved.
2. **Business purpose** — what business outcome does this program produce (handed-off to which role / used for which decision)
3. **Business reason / pain point** — what current Gap, manual workaround, or compliance/regulatory requirement drives the request
4. **Company-specific business rules** — deviations from SAP standard process (special pricing, custom statuses, local compliance, industry-specific calculations, etc.)
5. **Reference assets** — existing CBO packages, prior Z programs, vendor add-ons to model after
   - **If the user names a reference Z program**: consultant MAY invoke `program-to-spec` at depth **L1 (Overview only)** — extract Purpose / inputs / outputs / 1-paragraph flow — and **inline the summary into `module-interview.md`**. Do NOT produce a full spec.md artifact; this is a focused lookup, not a full spec generation run.
6. **Standard SAP solution screen** — consultant MUST propose at least one standard alternative (Fiori app, standard report/transaction, BAPI flow, CDS analytical query, embedded analytics) BEFORE agreeing to a custom build. User explicitly accepts/rejects each alternative; rejections are logged with reason.

**Skip rule**: Skip Phase 1A only for pure technical utilities with zero business logic (e.g., generic string helper, file converter). Default behavior is "do not skip".

**Gate**: business ambiguity ≤ 5%.

**Enforcement**: `.sc4sap/program/{PROG}/module-interview.md` MUST exist before Phase 1B starts. Phase 1B refuses to run if this file is missing or its ambiguity score > 5%.

---

## Phase 1B — Program Interview (Analyst + Architect lead)

**Pre-condition**: Phase 1A closed; `module-interview.md` exists; business ambiguity ≤ 5%.

**Purpose**: Translate the agreed business solution into concrete technical decisions.

**Lead agents**: `sap-analyst` (functional decomposition) + `sap-architect` (technical structure). The skill itself orchestrates the question stream; analyst owns dimensions 1, 5; architect owns dimensions 2, 3, 4, 7; both contribute to dimension 6.

**Dimensions** (one question per turn, pre-filtered by resolved platform — see the global One-Question-Per-Turn Rule above; bulk-proposing all 7 dimensions at once is a protocol violation):
1. **Purpose-type** — Report / CRUD / ALV List / Batch / Interface
2. **Paradigm** — OOP (two-class) vs Procedural (PERFORM)
3. **Display mode** — None / SALV popup / Full CL_GUI_ALV_GRID
4. **Screen/GUI** — required? screen numbers? Docking Container vs Splitter vs TOP_OF_PAGE layout?
5. **Data source** — standard tables / Z-tables / BAPI / CDS view (consistent with Phase 1A reference assets)
6. **Package + Transport** — target package, new or existing transport
7. **Testing scope** — when OOP is selected, which test class methods to cover

For each dimension, the skill may propose a recommended default (derived from Phase 1A context + CBO inventory + platform constraints). The proposal belongs to the **single question** for that dimension — never merge proposals across dimensions into a table.

**Gate**: technical ambiguity ≤ 5%. Do NOT proceed to Phase 2 until ≤ 5%. Upon reaching ≤ 5%, immediately proceed to `<Spec_Approval_Gate>`.

**Enforcement**: `.sc4sap/program/{PROG}/interview.md` MUST exist with one Q&A block per resolved dimension and a final ambiguity score ≤ 5%. The Phase 2 planner MUST refuse to run if either `module-interview.md` or `interview.md` is missing or incomplete.
