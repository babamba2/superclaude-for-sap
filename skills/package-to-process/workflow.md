# package-to-process — Workflow (7 Steps)

Referenced by `SKILL.md`. Each step prints a **progress bar** at entry per § Progress Reporting.

## Progress Reporting

**Format** (mandatory at the very first line of each Step entry message):
```
Step X/7 · <label>   [<20-char bar>]  NN%
```

- Bar width = **20 chars**, filled = `█`, empty = `░`, no ANSI colors.
- Filled-cell count = `floor(step_id × 20 / 7)` (Step 0 = 0 filled, Done = 20 filled).
- `NN%` = `floor(step_id × 100 / 7)` at entry (Step 0 = 0%, Done = 100%).
- Right-aligned: two leading spaces before `NN%`, trailing `%`.

**Step → progress mapping** (authoritative):

| Step | Label | Bar | % at entry |
|---|---|---|---|
| 0 | `trust-session bootstrap` | `[░░░░░░░░░░░░░░░░░░░░]` | 0% |
| 1 | `Intake (package + module + context)` | `[██░░░░░░░░░░░░░░░░░░]` | 14% |
| 2 | `CBO inventory ensure (auto stocker if missing)` | `[█████░░░░░░░░░░░░░░░]` | 28% |
| 3 | `Entry-point detection (TCode mapping + 확인)` | `[████████░░░░░░░░░░░░]` | 42% |
| 4 | `Process grouping (sap-analyst, Opus)` | `[███████████░░░░░░░░░]` | 57% |
| 5 | `Per-process narrative (sap-analyst, Opus)` | `[██████████████░░░░░░]` | 71% |
| 6 | `Master .md render (sap-writer, Sonnet)` | `[█████████████████░░░]` | 85% |
| 7 | `Validation + handoff` | `[████████████████████]` | 100% |

When a Step skips (e.g., Step 2 skipped because inventory exists), still print its line with the marker `(skipped — <reason>)` after the percentage so the user sees continuous progression.

---

## Step 0 — Trust-Session Bootstrap

Main thread (no agent dispatch).

1. Print: `Step 0/7 · trust-session bootstrap   [░░░░░░░░░░░░░░░░░░░░]   0%`
2. Run `/sc4sap:trust-session` with `parent_skill=sc4sap:package-to-process` unless `.sc4sap/session-trust.log` already has a line within 24h.
3. Surface the one-line confirmation. No interactive prompts.

---

## Step 1 — Intake (Socratic)

Main thread (Sonnet 4.6).

1. Print: `Step 1/7 · Intake (package + module + context)   [██░░░░░░░░░░░░░░░░░░]  14%`
2. **If `ARGUMENTS` did not supply a package** → ask exactly one question:
   > "Which CBO package should I analyze for end-to-end business process? (e.g., `ZSD_MAIN`, `ZMM_CORE`). Prefix patterns OK (e.g., `ZMM*`)."
3. If prefix → `SearchObject(objectType='DEVC', query=<prefix>)` → list, re-ask.
4. Verify with `GetPackage(<name>)`. Not found → STOP and report.
5. Ask the module (constrained list, exactly one question):
   > "Which SAP module? SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba"
6. Validate against `configs/<MODULE>/` existence.
6b. **Output language + BPML format** — ONE bundled `AskUserQuestion` (two questions, single call):
   - **언어**: `한국어(ko)` / `English(en)` / `日本語(ja)` / Other (free text → ISO 639-1). First option = conversation language, labeled `(Recommended)`. Applies to BOTH the process `.md` and the BPML.
   - **BPML 형식**: `xlsx (Recommended)` / `md` / `both`.
   Store as state `{language, bpml_format}`.
7. Load context (no agent dispatch — main thread reads):
   - `.sc4sap/config.json` → `sapVersion`, `abapRelease`, `industry`, `country`
   - `.sc4sap/sap.env` → `SAP_ACTIVE_MODULES`
   - If unset → ask once; do NOT proceed silently with defaults for industry/country.

Output state held in main thread: `{package, module, sapVersion, abapRelease, industry, country, activeModules, language, bpml_format}`.

---

## Step 2 — CBO Inventory Ensure (Conditional Dispatch)

1. Print: `Step 2/7 · CBO inventory ensure   [█████░░░░░░░░░░░░░░░]  28%`
2. Check `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.
3. **Branch A — file exists**: print `(skipped — inventory found at <path>)` after the bar. Load JSON into state.
4. **Branch B — file missing**: dispatch `sap-stocker` per [`dispatch-stocker.md`](dispatch-stocker.md). Phase Banner: `▶ phase=2.stocker · agent=sap-stocker · model=Sonnet 4.6`. After return, load `inventory.json`.
5. On stocker `BLOCKED: <reason>` → STOP and surface to user (cannot continue without inventory).

---

## Step 3 — Entry-Point Detection

Main thread (Sonnet 4.6).

1. Print: `Step 3/7 · Entry-point detection   [████████░░░░░░░░░░░░]  42%`
2. From `inventory.json` → collect all PROG objects.
3. For each PROG, look up TCode mapping:
   - `SearchObject(objectType='TRAN', query='<prog_name>')` — TCodes that launch this program
   - Cross-reference with `configs/<MODULE>/tcodes.md` for documented Z-TCodes
4. Build candidate entry-point list: `{prog, tcodes[], short_text}`. Programs without a TCode are still considered as candidates if they appear as flagship in `inventory.json → key_programs[]`.
5. Single `AskUserQuestion(multiSelect: true)` — present candidates, allow user to:
   - confirm checked defaults (all auto-detected),
   - uncheck batch-only / utility programs,
   - add manually-known entry programs missing from auto-detect.
6. Final list = state `entry_points[]`.
7. If `entry_points[]` is empty → STOP and ask: "No interactive entry points were found. Should I treat the largest PROG `<X>` as the entry point, or stop?" — wait for response.

---

## Step 4 — Process Grouping (sap-analyst, Opus)

1. Print: `Step 4/7 · Process grouping   [███████████░░░░░░░░░]  57%`
2. Phase Banner: `▶ phase=4.group · agent=sap-analyst · model=Opus 4.7`
3. Dispatch per [`dispatch-analyst.md`](dispatch-analyst.md) § Step 4 — Auto Process Grouping. The analyst:
   - Reads `inventory.json` + `grouping-heuristics.md` module dictionary
   - Calls `GetWhereUsed` for entry-point programs (1-hop in-package + 1-hop out-of-package)
   - Clusters programs by shared core tables (e.g., EBAN+EKKO+EKPO+MSEG → "PR→PO→GR" cluster)
   - Returns proposed groups with rationale: `[{name, members[], shared_tables[], confidence}]`
4. Present groups to the user via `AskUserQuestion`:
   - Approve as-is
   - Merge groups (`Process 2 ⊕ Process 3`)
   - Split a group (give which members go where)
   - Rename labels
5. Loop until user approves OR cap at 3 iterations → ask user how to proceed.
6. Final state: `processes[] = [{label, members[], rationale}]`.

---

## Step 5 — Per-Process Narrative (sap-analyst, Opus)

1. Print: `Step 5/7 · Per-process narrative   [██████████████░░░░░░]  71%`
2. Phase Banner: `▶ phase=5.narrate · agent=sap-analyst · model=Opus 4.7`
3. Dispatch per [`dispatch-analyst.md`](dispatch-analyst.md) § Step 5 — Per-Process Narrative. ONE dispatch covers all processes (continuous context). For each process the analyst produces:
   - Overview paragraph (3–6 sentences, business voice)
   - Mermaid `sequenceDiagram` for the representative scenario (user → entry-PROG → FM/CLAS → DB tables → output)
   - Step Table: `Step · Actor · CBO Object · Tables · Trigger · Output`
   - External Boundary (1-hop): standard BAPIs / other-package Z calls / CDS — table form
   - Cross-module Notes (only if `activeModules` shows ≥2 modules and an integration touchpoint exists)
4. Returns a structured JSON block per process + freeform narrative text.

---

## Step 6 — Master .md Render (sap-writer, Sonnet)

1. Print: `Step 6/7 · Master .md render   [█████████████████░░░]  85%`
2. Phase Banner: `▶ phase=6.render · agent=sap-writer · model=Sonnet 4.6`
3. Dispatch per [`dispatch-writer.md`](dispatch-writer.md). Writer reads:
   - State from Steps 1–5 (passed in prompt)
   - [`document-template.md`](document-template.md) skeleton
4. Writer renders the diagrams as high-quality PNGs BEFORE embedding:
   - Assemble a diagram-spec JSON from Step 5 data: `{ lang, macro:{nodes,edges}, processes:[{slug,title,seq:{actors,items}}] }` (schema in `document-template.md` § Renderer Constraints #3). Save to `.sc4sap/processes/<MODULE>/<PACKAGE>/_img/process-images.json`.
   - Run `node scripts/spec/render-process-images.mjs <spec.json> .sc4sap/processes/<MODULE>/<PACKAGE>/_assets/process-<YYYYMMDD>-<lang>/` → writes `macro.png` + `seq-<N>.png` and prints a manifest.
   - Embed each PNG with `![…](_assets/process-<YYYYMMDD>-<lang>/<file>.png)` + a collapsible `<details>` Mermaid fallback. Any manifest slot that is `null` (no headless browser) → keep only the Mermaid block for that diagram.
5. Writer produces the final `.md` and saves to `.sc4sap/processes/<MODULE>/<PACKAGE>/process-<YYYYMMDD>-<lang>.md`.
6. Returns the file path + line count + per-section count summary + image manifest.

### Step 6b — BPML render (main thread, after writer returns)

1. Assemble the BPML spec JSON from Steps 3–5 state per [`bpml-render.md`](bpml-render.md) (`meta.language` = Step 1 selection; row content in that language; NEVER include `proc_id` — builder auto-numbers L5 as `[MODULE]-NNN`). Save to `_img/bpml-<YYYYMMDD>-<lang>.json`.
2. Run `node scripts/spec/build-bpml.mjs <spec.json> <out>` per `bpml_format`: `xlsx`, `md`, or both (two runs). Output: `.sc4sap/processes/<MODULE>/<PACKAGE>/bpml-<YYYYMMDD>-<lang>.{xlsx,md}`.
   - xlsx mode auto-adds one process-flow sheet per L1 group (seq-diagram PNGs embedded; L1 label cells hyperlink to their sheet). First build rasterizes every diagram via headless Edge (~1s each, 4 in parallel); PNGs cache in `_img/bpml-png-<lang>/` so rebuilds are instant. If the builder reports `failed > 0`, rerun the same command — cached images are skipped and only failures retry.
3. Surface the builder's one-line result (`rows`, per-level counts; xlsx: flow-sheet/image counts) to the user.

---

## Step 7 — Validation + Handoff

Main thread (Sonnet 4.6).

1. Print: `Step 7/7 · Validation + handoff   [████████████████████] 100%`
2. Validate file:
   - File exists at the expected path
   - YAML frontmatter parses (required keys: `package`, `module`, `industry`, `country`, `generated_at`, `entry_points`, `process_count`)
   - Each `## N. Process:` has a representative-scenario diagram (rendered `seq-<N>.png` image OR a Mermaid fallback block) + a Step Table; §0 has the macro `macro.png` (or Mermaid fallback)
   - BPML file(s) exist per `bpml_format`; builder reported L5 count > 0 (proc_id `[MODULE]-001…` present)
   - No `GetTableContents` traces (sanity: no row data accidentally included)
3. Print final summary:
   ```
   Done [████████████████████] 100%

   ✅ End-to-end process document generated:
      .sc4sap/processes/<MODULE>/<PACKAGE>/process-<DATE>-<lang>.md
      .sc4sap/processes/<MODULE>/<PACKAGE>/bpml-<DATE>-<lang>.<xlsx|md>
      <N> processes · <M> Mermaid diagrams · <K> external-boundary calls

   Next options:
     • /sc4sap:program-to-spec <PROG>   — drill into one program
     • /sc4sap:compare-programs <P1,P2> — compare two flow members
     • /sc4sap:ask-consultant           — resolve open questions
   ```
4. If any validation fails → surface concrete failure + leave file in place; do NOT auto-regenerate without user instruction.
