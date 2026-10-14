# Dispatch — Step 6 + 6b (sap-writer ×2, parallel)

Referenced by `workflow-render.md` § Step 6. Both dispatches use a depth-driven model override (`model: "sonnet"`) and go out in ONE message. They receive **file paths only** — never inlined Step 4/5 JSON. Every path is substituted as an absolute path (see [`paths-and-state.md`](paths-and-state.md)).

## State variables
- `<PACKAGE>`, `<MODULE>`, `<LANG>` (`ko` / `en` / `ja`), `<YYYYMMDD>`
- `<PLUGIN_ROOT>`, `<PROC_DIR>`, `<STATE_DIR>`, `<INVENTORY_PATH>`
- `<OUT_PATH>` — `<PROC_DIR>/process-<YYYYMMDD>-<LANG>.md`
- `<BPML_JSON>` — `<PROC_DIR>/_img/bpml-<YYYYMMDD>-<LANG>.json`

Shared input block (both prompts):

```
## State files (read them; do not ask the caller for their content)
- <STATE_DIR>/intake.json        — package, module, sapVersion, abapRelease, industry,
                                   country, activeModules, language
- <STATE_DIR>/entry_points.json  — confirmed entry points {prog, tcodes[], short_text}
- <STATE_DIR>/step4.json         — approved processes (label, members, shared_tables,
                                   confidence)
- <STATE_DIR>/step5.json         — manifest: parts[] (read every part file in
                                   <STATE_DIR>) + failed_processes[]
- <INVENTORY_PATH>               — inventory (sensitive objects, purposes)
Processes listed in failed_processes get NO section / rows; list each under Open
Questions as: Narrative not generated for "<label>": <reason>.
```

---

## 6 — Process document

```
Agent({
  subagent_type: "sc4sap:sap-writer",
  description: "Render package-to-process master .md for <PACKAGE>",
  model: "sonnet",
  prompt: """
    Render the master end-to-end business-process Markdown for package <PACKAGE>.

    <shared input block>

    ## Template
    Use <PLUGIN_ROOT>/skills/package-to-process/document-template.md verbatim,
    including its § Language Labels row for <LANG>. Substitute <…> placeholders
    from the state files. Honor every constraint in § Renderer Constraints
    (frontmatter mandatory, TOC anchors, PNG diagrams + Mermaid fallback, fixed
    column order, no row data, …). process_count = narrated processes only.
    Merge package_level_cross_module / sensitive_objects / open_questions across
    all step5 parts (dedupe identical rows).

    ## Diagram images (render BEFORE embedding)
    1. Assemble a diagram-spec JSON from the step5 parts:
       { lang: <LANG>, macroTitle, macro:{nodes,edges},
         processes:[{slug:"<N>", title, seq:{actors:[{id,label,kind}], items:[…]}}] }
       seq.items: {m:[from,to],t} sync · {…,r:true} return · {note,over} ·
       {alt|opt|loop} … {end}. Save to <PROC_DIR>/_img/process-images.json
    2. Run: node "<PLUGIN_ROOT>/scripts/spec/render-process-images.mjs"
       "<PROC_DIR>/_img/process-images.json" "<PROC_DIR>/_assets/process-<YYYYMMDD>-<LANG>/"
    3. Embed macro.png at §0 Macro Flow and seq-<N>.png at §<N>.2, each with a
       collapsible <details> Mermaid fallback. Manifest slot null → keep only
       the Mermaid block for that diagram.

    ## File output
    Write to <OUT_PATH>. Create parent directories if missing.
    If the file exists, prepend one line directly under the H1:
    `> Regenerated from <previous frontmatter.generated_at>`.

    ## Language
    Section titles + body in <LANG>. Mermaid syntax is language-neutral; only
    node labels translate. Frontmatter keys stay English.

    ## Return — a short block
    - file_path, line_count
    - section_counts: { processes, external_boundary_rows, sensitive_objects }
    - images: { png: <n>, mermaid_only: <m> }

    Constraints:
    - Do NOT read SAP via MCP. Render from the state files only.
    - Do NOT add sections not present in document-template.md.
  """
})
```

## 6b — BPML spec JSON

```
Agent({
  subagent_type: "sc4sap:sap-writer",
  description: "Author BPML spec JSON for <PACKAGE>",
  model: "sonnet",
  prompt: """
    Author the BPML (Business Process Master List) spec JSON for package <PACKAGE>.

    <shared input block>

    ## Contract
    Follow <PLUGIN_ROOT>/skills/package-to-process/bpml-render.md § BPML JSON
    contract, § Diagram quality bar and § Hard rules exactly: meta.language =
    <LANG>, all row content in <LANG>, staircase rows L1–L5, `seq` REQUIRED on
    every L2–L5 row, NEVER supply proc_id. L1 groups = step4 processes (narrated
    only); L5 leaves = entry-point programs + sub-flows from the step5 narratives.

    ## File output
    Write the JSON to <BPML_JSON> (create the directory). Do NOT run build-bpml.mjs
    — the caller runs it once per output format.

    ## Return — a short block
    - file_path
    - rows: { L1, L2, L3, L4, L5 }
    - seq_missing: <count of L2–L5 rows without seq — must be 0>

    Constraints:
    - Do NOT read SAP via MCP. Derive from the state files only.
    - No row data from GetTableContents / GetSqlQuery — ever.
  """
})
```

---

## Failure handling

- `BLOCKED: <reason>` from either writer → ONE re-dispatch of that writer with `model: "opus"` + the blocker context (`paths-and-state.md` § Escalation); still blocked → STOP, surface, ask the user.
- Writer returns success but its file is missing (`<OUT_PATH>` / `<BPML_JSON>`) → STOP that branch with `Writer reported success but file not found at <path>`; do not retry silently.
- 6b returns `seq_missing > 0` or `build-bpml.mjs` rejects the JSON → re-dispatch the 6b writer ONCE with the error line (`workflow-render.md` § Step 6b).
- 6 returns `line_count > 2000` → warn the user, offer a per-process split into appendix files (requires user approval; no auto-split).
- Writer-generated file fails Step 7 frontmatter validation → surface concrete failure, leave file in place, ask the user whether to retry or hand-edit.
