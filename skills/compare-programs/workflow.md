# Workflow Steps

Main thread runs on Haiku 4.5 (skill frontmatter). Every MCP read is pushed into an agent so the orchestrator context stays small even for 5 programs × full source + AST + screens.

## Step 0 — Trust Session (mandatory, see SKILL.md)

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:compare-programs`. Skip silently if already trusted within 24h.

## Step 1 — Program Input (main thread, Haiku)

**Accepts**:
- User passes 2–5 program names in the initial argument: `"compare ZMMR_GR_LIST and ZCOR_GR_LIST"` / `"ZMMR_GR_LIST, ZCOR_GR_LIST, ZFIR_GR_LIST"`.
- User passes nothing → ask (in the user's current conversation language): *"Which 2–5 programs should I compare? (comma-separated, e.g. ZMMR_GR_LIST, ZCOR_GR_LIST)"*.

**Validation**:
1. For each name, call `SearchObject` to resolve the ADT object type (REPS / CLAS / FUGR / CDS).
2. If a name is ambiguous or missing → list candidates, ask user to choose.
3. If user provides only 1 → suggest `/sc4sap:program-to-spec` instead and stop.
4. If user provides > 5 → ask to trim, or propose splitting into multiple comparison sessions.

Store the confirmed list as `compared_objects` (array of `{name, type, package}`).

## Step 2 — Scope Confirmation (main thread, Haiku)

Show the **Scope Prompt** from `comparison-scope.md` with defaults pre-ticked. Render the prompt in the user's current conversation language. Wait for user response. Accept `ok` / `proceed` / `+N` / `-N` / `only N,M` / `all` (and equivalent phrasings in other languages).

Store the confirmed dimension set as `active_dimensions` (subset of 1–10). Echo back one line confirming the selection, e.g.: *"Dimensions confirmed: 1·2·3·5·6·7·10 (7 of 10). Starting analysis."*

## Step 3 — Facts Extraction (per-program `sap-code-reviewer` dispatch, Sonnet 4.6 override)

**Fires N parallel `Agent(...)` dispatches — one per program.** Each reviewer reads its own program's source + structural metadata ITSELF. The main thread never holds full source code.

For each program in `compared_objects`, emit phase banner:
```
▶ phase=3 (facts-<PROG>) · agent=sap-code-reviewer · model=Sonnet 4.6
```

Dispatch shape (repeat per program, parallel in one message):
```
Agent({
  subagent_type: "sc4sap:sap-code-reviewer",
  model: "sonnet",   // override base Opus — facts-only extraction doesn't need Opus judgment
  description: "Facts — <PROG>",
  prompt: "<facts-extraction prompt per dispatch-prompts.md § Step 3>, target=<PROG>, type=<TYPE>",
  mode: "dontAsk"
})
```

The full facts-extraction prompt (MCP tool list + output schema + safety rules) lives in [`dispatch-prompts.md`](dispatch-prompts.md) § Step 3. Keep workflow.md compact.

On any reviewer `BLOCKED`, surface the reason and ask the user whether to proceed with the remaining programs or abort. Store the N facts blobs in `program_facts[<PROG>]`.

## Step 4 — Analysis & Narrative (single `sap-analyst` dispatch, Opus 4.7)

**One consolidated dispatch.** The analyst receives all N facts blobs + the active dimension set + user's conversation language, and returns module classification + dimension scoring + executive summary + recommendation in one continuous reasoning pass.

Emit phase banner:
```
▶ phase=4 (analyst) · agent=sap-analyst · model=Opus 4.7
```

Dispatch:
```
Agent({
  subagent_type: "sc4sap:sap-analyst",
  description: "Compare — analyst synthesis",
  prompt: """
    Compare <N> programs across dimensions <active_dimensions>.

    Facts (one block per program):
    <JSON dump of program_facts>

    Perform in this order, produce all outputs in ONE response:

    A. Module classification — for each program, decide primary module based on package prefix,
       table families touched, and TITLE wording. Output: [{prog, module}].

    B. Dimension scoring — per active dimension × per program, mark ✅ / 🔷 / ⚠️ / ❓ per the rubric
       in skills/compare-programs/comparison-scope.md. Output: matrix (JSON).

    C. Executive Summary — 3 sentences. Headline = the single biggest divergence among the programs.
       Write in the user's current conversation language.

    D. Recommendation — "when to use which" matrix (one row per program, one column per likely use-case).

    E. If programs span 2+ distinct modules (from step A), list the module set so the skill can fan
       out to module-specialist consultants in Step 4b. Output: module_set: [MM, CO, ...].

    All narrative text in the user's current conversation language.
  """,
  mode: "dontAsk"
})
```

## Step 4b — Module Specialist Pass (conditional, parallel consultants)

Triggered when the analyst returns `module_set` with ≥ 2 modules. For each distinct module, dispatch the matching consultant in parallel. Each returns 2–3 sentences from the module's operational perspective.

**teamMode variant** — Step 4b always runs as Round 1 of Type A teamMode (Cross-Module Consultant Panel). If POSITIONs reveal an **ownership conflict** (same program claimed PRIMARY by 2+ modules), escalate to Rounds 2-3 per [`team-mode.md`](team-mode.md) § Rounds. No conflict → positions feed directly into Step 5 via `module_consultant_outputs`. Spawn shape below is the legacy single-shot; use the Round 1 spawn shape in `team-mode.md` § Round 1 (adds `team_name`, `name`, charter-file reference) when adopting teamMode.

For each module in `module_set`:
```
▶ phase=4b (consultant-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
```

Dispatch shape:
```
Agent({
  subagent_type: "sc4sap:sap-<module>-consultant",   // frontmatter pins Opus 4.7
  description: "<MODULE> angle on compared programs",
  prompt: """
    From a <MODULE> consultant's view, briefly explain (2–3 sentences each) which of these
    programs a <MODULE> user would reach for — and why. Facts:
    <subset of program_facts relevant to this module>

    Answer in the user's current conversation language.
  """,
  mode: "dontAsk"
})
```

If `module_set` has 1 module, SKIP Step 4b.

## Step 5 — Render (`sap-writer` dispatch, Haiku 4.5)

Emit banner:
```
▶ phase=5 (render) · agent=sap-writer · model=Haiku 4.5
```

Dispatch:
```
Agent({
  subagent_type: "sc4sap:sap-writer",
  description: "Render comparison report",
  prompt: """
    Render the comparison report using skills/compare-programs/report-template.md as the skeleton.
    Do NOT re-read any MCP objects — work only from the inputs below.

    Inputs:
    - compared_objects: <list>
    - active_dimensions: <list>
    - program_facts: <N facts blobs>
    - analyst_outputs: { module_classification, dimension_matrix, exec_summary, recommendation }
    - module_consultant_outputs (optional): <per-module blobs>
    - user_language: <lang>

    Write the Markdown file to .sc4sap/comparisons/<filename>.md (path rule in SKILL.md
    <Output_Location>). Return a short confirmation block with file path + dimension counts
    + headline divergence.
  """,
  mode: "dontAsk"
})
```

Emit a concise completion block to the user (in the user's current conversation language — English skeleton below):

```
Comparison report generated.
File: .sc4sap/comparisons/ZMMR_GR_LIST__vs__ZCOR_GR_LIST-20260423.md
Dimensions: 7 · Divergent: 3 · Variant: 2 · Same: 2
Key divergence: ZMMR = quantity-centric (MSEG, M_MSEG_WWA) / ZCOR = cost-value-centric (ACDOCA, F_BKPF_*)
```

## Step 6 — Follow-up Options (main thread, Haiku — offer, don't execute)

Present as a short menu (localized to the user's language at render time):

- Deeper analysis of a specific dimension — user specifies the number
- Add more programs to the comparison (current N → up to 5)
- Convert to Excel (.xlsx) *(deferred — stub for future parity with program-to-spec)*
- Generate the report in another language
- Add Where-used analysis to compare actual call-site frequency
- Derive a consolidation / split recommendation report from the findings

Wait for user instruction — do not loop automatically.

## Safety Rails

- Blocklist: `GetTableContents` / `GetSqlQuery` are **forbidden** in this skill — enforced per-reviewer-dispatch.
- Country/Industry context: if dimension 9 is active, the analyst loads `country/<iso>.md` based on `.sc4sap/config.json` → `country` (or `sap.env` → `SAP_COUNTRY`). If unset, the analyst asks once for the relevant country list via its `BLOCKED` channel.
- Module activation: respect `common/active-modules.md` — if a module is not active in the project, the analyst flags with "(module not active in this landscape — observation only)".
- Per-call transports: this skill is **read-only** — never creates or modifies transports.
