# package-to-process — Workflow (Steps 4–7)

Continues [`workflow.md`](workflow.md) (Steps 0–3 + Progress Reporting). Path variables, checkpoint files, escalation and partial-failure rules: [`paths-and-state.md`](paths-and-state.md). The main thread passes **file paths** between steps — it never re-inlines analyst JSON into a prompt.

---

## Step 4 — Process Grouping (sap-analyst, Opus)

1. Print: `Step 4/7 · Process grouping   [███████████░░░░░░░░░]  57%`
2. Phase Banner: `▶ phase=4.group · agent=sap-analyst · model=Opus`
3. Dispatch per [`dispatch-analyst.md`](dispatch-analyst.md) § Step 4 — Auto Process Grouping (grouping algorithm unchanged — `grouping-heuristics.md`). The analyst returns a fenced JSON block + Rationale: `{processes[], residue[], open_questions[]}`.
4. Write the JSON block once to `<STATE_DIR>/step4.json` with `"approved": false`.
5. Present the groups — always a numbered table (`# · Label · Members · Shared tables · Confidence`, residue as the last row), then ask (2 options): `Accept all (Recommended)` / `Edit groups`. Edit takes free text: `merge 2+3`, `split 4: A,B | C`, `rename 1: <label>`, `move ZX to 2`.
6. Apply each edit to `step4.json` with Edit (no re-dispatch), reprint the table, ask again. Cap at 3 edit rounds → then ask whether to continue with the current groups or stop.
7. On accept set `"approved": true`. Final state: `processes[]` in `step4.json`.

---

## Step 5 — Per-Process Narrative (sap-analyst, Opus)

1. Print: `Step 5/7 · Per-process narrative   [██████████████░░░░░░]  71%`
2. Split rule — let `P` = approved process count:
   - `P ≤ 6` → ONE dispatch covering all processes (continuous context). Banner `▶ phase=5.narrate · agent=sap-analyst · model=Opus`.
   - `P > 6` → chunks of ≤ 3 processes in `step4.json` order (`ceil(P/3)` parts), ALL dispatched in ONE message, every part receiving the same inputs (state paths, inventory, rule files) plus its own process numbers. One banner per part: `▶ phase=5.narrate[k/n] · agent=sap-analyst · model=Opus`. Print `↳ 5 narrative <k>/<n> parts` as parts return.
3. Dispatch per [`dispatch-analyst.md`](dispatch-analyst.md) § Step 5. For each process the analyst produces overview, representative `sequenceDiagram`, step table, external boundary (1-hop), cross-module notes; per part also package-level cross-module rows, sensitive objects, open questions.
4. Each part's JSON → written once to `<STATE_DIR>/step5.part-<k>.json` (schema check first: missing required keys → retry that part ONCE with a clarification; second failure → failed).
5. Write `<STATE_DIR>/step5.json` manifest `{parts[], failed_processes[]}`. Partial failure → continue per `paths-and-state.md` § Escalation + partial failure; all parts failed → STOP and ask. Analyst `BLOCKED` in single-dispatch mode → STOP and ask.

---

## Step 6 — Render: Process Document + BPML JSON (sap-writer ×2, Sonnet)

1. Print: `Step 6/7 · Render: process .md + BPML   [█████████████████░░░]  85%`
2. Banners, then BOTH dispatches in ONE message per [`dispatch-writer.md`](dispatch-writer.md):
   - `▶ phase=6.render · agent=sap-writer · model=Sonnet` — master `.md` (+ diagram PNGs via `render-process-images.mjs`)
   - `▶ phase=6b.bpml · agent=sap-writer · model=Sonnet` — BPML spec JSON at `<PROC_DIR>/_img/bpml-<YYYYMMDD>-<lang>.json` per [`bpml-render.md`](bpml-render.md)
   Both read the same `<STATE_DIR>` files by path. The **6b writer is the only author of the BPML JSON** — the main thread never assembles BPML rows.
3. A writer `BLOCKED` → one Opus re-dispatch of that writer only (`paths-and-state.md` § Escalation).
4. 6 writer returns → verify the file exists at `<OUT_PATH>`; print `↳ 6  process .md written · <lines> lines`. `line_count > 2000` → warn and offer a per-process split into appendix files (user approval required; no auto-split).
5. **HTML** (main thread, when `formats` has `html`): `node "<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs" "<process .md>" "<same path .html>"` — PNGs inlined, the `<details>` Mermaid fallbacks drawn by the Mermaid CDN script when opened online. If `md` is not in `formats`, delete the `.md` once the HTML is written (keep `_assets/`). An Excel-only selection keeps its `.md`.

### Step 6b — BPML build (main thread, after the 6b writer returns)

1. Verify the BPML JSON exists at the path the writer returned.
2. Run once per entry in `formats` (the extension picks the mode; HTML = the md content as one self-contained page):
   `node "<PLUGIN_ROOT>/scripts/spec/build-bpml.mjs" "<PROC_DIR>/_img/bpml-<YYYYMMDD>-<lang>.json" "<PROC_DIR>/bpml-<YYYYMMDD>-<lang>.<xlsx|md|html>"`
   Print `↳ 6b BPML build <i>/<n> · <format> · <builder one-line result>` — relay the builder's line verbatim (`rows`, per-level counts; xlsx: flow-sheet/image counts); do not read or reprint the JSON.
   - xlsx: first build rasterizes every diagram via headless Edge (~1s each, 4 in parallel); PNGs cache in `_img/bpml-png-<lang>/`. Builder reports `failed > 0` → rerun the same command once (cached images skip; only failures retry).
3. Builder error (invalid JSON / missing `seq`) → re-dispatch the 6b writer ONCE with the error line; second failure → report and continue to Step 7 (the process document is independent).

---

## Step 7 — Validation + Handoff

Main thread (session model).

1. Print: `Step 7/7 · Validation + handoff   [████████████████████] 100%`
2. Validate:
   - File exists at the expected path; YAML frontmatter parses (required keys: `package`, `module`, `industry`, `country`, `generated_at`, `entry_points`, `process_count`)
   - `process_count` = narrated processes (= approved minus `failed_processes`); each `## N. Process:` has a representative-scenario diagram (`seq-<N>.png` image OR Mermaid fallback) + a Step Table; §0 has `macro.png` (or Mermaid fallback)
   - Every `failed_processes` entry appears under Open Questions
   - Process document exists as `.md` and/or `.html` per `formats`; BPML file(s) exist for every entry in `formats`; builder reported L5 count > 0 (proc_id `[MODULE]-001…` present)
   - No `GetTableContents` traces (sanity: no row data accidentally included)
3. Print final summary:
   ```
   Done [████████████████████] 100%

   ✅ End-to-end process document generated:
      <PROC_DIR>/process-<DATE>-<lang>.<md|html>   (one line per file)
      <PROC_DIR>/bpml-<DATE>-<lang>.<xlsx|md|html>  (one line per file)
      <N> processes (<F> failed) · <D> diagram PNGs (<M> Mermaid-only fallbacks) · <K> external-boundary calls
      BPML rows: L1 <a> · L2 <b> · L3 <c> · L4 <d> · L5 <e>
      Checkpoints: <STATE_DIR>/

   Next options:
     • /sc4sap:program-to-spec <PROG>   — drill into one program
     • /sc4sap:compare-programs <P1,P2> — compare two flow members
     • /sc4sap:ask-consultant           — resolve open questions
   ```
4. If any validation fails → surface concrete failure + leave files in place; do NOT auto-regenerate without user instruction.
