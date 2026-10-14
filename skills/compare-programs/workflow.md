# Workflow Steps

The main thread follows the session model (`model: inherit`). Every MCP read is pushed into an agent so the orchestrator context stays small even for 5 programs × full source + screens. Full prompt bodies: [`dispatch-prompts.md`](dispatch-prompts.md). Rendering, the HTML page, the English companion and imports: [`render-steps.md`](render-steps.md).

## Step 0 — Trust session + edited pages (main thread)

- Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:compare-programs`. Skip silently if already trusted within 24h.
- **Edited page handed over** (`…-edited.html`, or one in `<base>/comparisons/` newer than the latest `.md` of that name): import it first — [`render-steps.md`](render-steps.md) § Step 5.4 — and continue from the imported version (a re-analysis becomes the next minor version).

## Step 1 — Program Input (main thread)

**Accepts**:
- User passes 2–5 program names in the initial argument: `"compare ZMMR_GR_LIST and ZCOR_GR_LIST"` / `"ZMMR_GR_LIST, ZCOR_GR_LIST, ZFIR_GR_LIST"`.
- User passes nothing → ask (in the user's current conversation language): *"Which 2–5 programs should I compare? (comma-separated, e.g. ZMMR_GR_LIST, ZCOR_GR_LIST)"*.

**Validation**:
1. For each name, call `SearchObject` to resolve the ADT object type (REPS / CLAS / FUGR / CDS) and note a `TRAN/T` hit (the program's T-Code).
2. If a name is ambiguous or missing → list candidates, ask user to choose.
3. If user provides only 1 → suggest `/sc4sap:program-to-spec` instead and stop.
4. If user provides > 5 → ask to trim, or propose splitting into multiple comparison sessions.

Store the confirmed list as `compared_objects` (array of `{name, type, package, tcode}`). Resolve `<NAME>`, the history file and the next version now ([`render-steps.md`](render-steps.md) § Names) — an existing history means this run is the next version of an earlier comparison; say so in the Step 2 echo.

## Step 2 — Scope Confirmation (main thread)

Show the **Scope Prompt** from `comparison-scope.md` with defaults pre-ticked, in the user's conversation language. Accept `ok` / `proceed` / `+N` / `-N` / `only N,M` / `all` (and equivalents), plus `excel` (an `.xlsx` copy), `no english` (skip the English companion) and `major` (new major version).

Store `active_dimensions` (subset of 1–10), `lang` (the conversation language), `english` (true unless `lang` is `en` or the user opted out) and `excel`. Echo one line, e.g.: *"Dimensions 1·2·3·5·6·7·10 (7 of 10) · HTML report v1.0 (ko) + English companion. Starting analysis."*

## Step 3 — Facts Extraction (per-program `sap-checker` scout, Haiku)

**N parallel `Agent(...)` dispatches — one per program, in one message.** Each checker reads its own program's source + structural metadata ITSELF and returns verbatim `FACT` lines. Extraction is read-and-copy work, so it runs on Haiku per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Tier 3; every interpretation happens in the Opus analyst. The main thread never holds full source code.

```
▶ phase=3 (facts-<PROG>) · agent=sap-checker · model=Haiku
```

```
Agent({
  subagent_type: "sc4sap:sap-checker",   // frontmatter model: haiku
  description: "Facts — <PROG>",
  prompt: "<scout prompt per dispatch-prompts.md § Step 3>, scope=<PROG>, type=<TYPE>"
})
```

When dimension 3 or 6 is active, the scout also returns the selection-screen declarations and the output field catalog verbatim (`selection_def`, `output_column`, `gui_button`), so Step 5 can draw the screens without re-reading SAP.

On `status=BLOCKED reason="scope too large …"`, call `GetIncludesList(<PROG>)` and re-dispatch one checker per batch of 4 includes (same prompt, `includes:` filled, the first batch marked "first"; ≤ 16 checkers in total). CLAS / CDS objects cannot be split this way — treat them as the other `BLOCKED` case below. Any other `BLOCKED`, or a split that is still blocked → surface the reason and ask the user whether to proceed with the remaining programs or abort. Store each program's `CHECKER … END` blocks unchanged in `program_facts[<PROG>]`.

**Step 3b — Message texts (main thread).** Collect the `message_class` / `message` facts of every program and read the class messages from T100 in one `GetSqlQuery` per class: `SELECT SPRSL, ARBGB, MSGNR, TEXT FROM T100 WHERE ARBGB = '<class>' AND MSGNR IN (<numbers used>) AND SPRSL IN ('<logon lang>','E')`. Explicit fields, only the numbers the facts name — the one data read this skill allows (SKILL.md § Data_Extraction_Safety). A bare `MESSAGE E019` belongs to the program's own `MESSAGE-ID` class — never assume two programs share one. Add the texts to `program_facts` as `t100` lines; a number with no row in a language is noted "(no <lang> text)". Check placeholders: a `MESSAGE … WITH x` whose text has no `&` never shows `x` — a finding for §8.

## Step 4 — Analysis & Narrative (single `sap-analyst` dispatch, Opus)

**One consolidated dispatch** (prompt: [`dispatch-prompts.md`](dispatch-prompts.md) § Step 4). The analyst receives all N programs' `FACT` lines + the active dimensions + `lang`, and returns in one continuous reasoning pass:

- A. module classification · B. dimension matrix (✅ / 🔷 / ⚠️ / ❓ per [`comparison-scope.md`](comparison-scope.md)) · C. executive summary + the one must-not-miss decision
- D. decision guide — situation → program → why, plus a decision tree (≤ 7 questions)
- E. field presence — selection fields and output columns × program (● / ○), with a business meaning per field (dims 3 / 6)
- F. per-program profile, consolidation opportunities, risks / open questions
- G. `module_set` for Step 4b

```
▶ phase=4 (analyst) · agent=sap-analyst · model=Opus
```

## Step 4b — Module Specialist Pass (conditional, parallel consultants)

Triggered when the analyst returns `module_set` with ≥ 2 modules. For each distinct module, dispatch the matching consultant in parallel (prompt: [`dispatch-prompts.md`](dispatch-prompts.md) § Step 4b). Each returns 2–3 sentences from the module's operational perspective.

**teamMode variant** — Step 4b always runs as Round 1 of Type A teamMode (Cross-Module Consultant Panel). If POSITIONs reveal an **ownership conflict** (same program claimed PRIMARY by 2+ modules), escalate to Rounds 2-3 per [`team-mode.md`](team-mode.md) § Rounds. No conflict → positions feed directly into Step 5 via `module_consultant_outputs`. Use the Round 1 spawn shape in `team-mode.md` § Round 1 (inlined charter + `teamMode=true`; consultants return POSITION blocks that the lead persists — no `team_name`).

```
▶ phase=4b (consultant-<MODULE>) · agent=sap-<module>-consultant · model=Opus
```

If `module_set` has 1 module, SKIP Step 4b.

## Step 5 — Render (screens + report + page)

Run [`render-steps.md`](render-steps.md) Steps 5 → 5.1 (→ 5.1b when `excel`) → 5.2 → 5.3 in order: `sap-writer` (Sonnet) draws the screens and writes the `.md`, the main thread builds the editable page, the review loop, then the English companion. Completion block (in the user's language — English skeleton):

```
Comparison report generated: ZMMR_GR_LIST vs ZCOR_GR_LIST  v1.0 · ko
Dimensions: 7 · Divergent: 3 · Variant: 2 · Same: 2 · Unclear: 0
Screens drawn: 4 (2 selection, 2 output) · Decision guide: 4 situations
Key divergence: ZMMR = quantity-centric (MSEG) / ZCOR = cost-value-centric (ACDOCA)
File: <base>/comparisons/ZMMR_GR_LIST__vs__ZCOR_GR_LIST-v1.0-ko.html
English: <base>/comparisons/ZMMR_GR_LIST__vs__ZCOR_GR_LIST-v1.0-en.html
History: …-ko.history.json · …-en.history.json
```

## Step 6 — Follow-up Options (main thread — offer, don't execute)

Present as a short menu (localized):

- Deeper analysis of a specific dimension — user specifies the number
- Add more programs to the comparison (current N → up to 5) — next minor version
- Import a page a reader edited (`…-edited.html`) — [`render-steps.md`](render-steps.md) § Step 5.4
- Generate the report in another language (ja / de / …) — same as Step 5.3 with that language
- Add Where-used analysis to compare actual call-site frequency
- Derive a consolidation / split recommendation report from the findings
- Excel copy (.xlsx) of the current version, when it was not built — [`render-steps.md`](render-steps.md) § Step 5.1b

Wait for user instruction — do not loop automatically.

## Safety Rails

- Blocklist: `GetTableContents` is **forbidden**; `GetSqlQuery` only for the T100 message texts of Step 3b (explicit fields, the numbers used) — never in a checker dispatch. Screen mockups use invented sample rows only.
- Country/Industry context: if dimension 9 is active, the analyst loads `country/<iso>.md` based on `.sc4sap/config.json` → `country` (or `sap.env` → `SAP_COUNTRY`). If unset, the analyst asks once for the relevant country list via its `BLOCKED` channel.
- Module activation: respect `common/active-modules.md` — if a module is not active in the project, the analyst flags with "(module not active in this landscape — observation only)".
- Per-call transports: this skill is **read-only** — never creates or modifies transports.
