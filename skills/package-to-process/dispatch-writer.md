# Dispatch — Step 6 (sap-writer)

Referenced by `workflow.md` § Step 6. Dispatch uses `mode: "dontAsk"` and a depth-driven model override (`model: "sonnet"`) — see `SKILL.md` § Agent_Composition.

## State variables
- `<PACKAGE>`, `<MODULE>`, `<SAPV>`, `<ABAP_RELEASE>`
- `<INDUSTRY>`, `<COUNTRY>`, `<ACTIVE_MODULES>` — from `config.json` + `sap.env`
- `<ENTRY_POINTS>` — confirmed list from Step 3
- `<STEP5_JSON>` — analyst output from Step 5 (per-process structured data)
- `<OUT_PATH>` — `.sc4sap/processes/<MODULE>/<PACKAGE>/process-<YYYYMMDD>-<lang>.md`
- `<LANG>` — `ko` / `en` / `ja`

---

## Prompt body

```
Agent({
  subagent_type: "sc4sap:sap-writer",
  description: "Render package-to-process master .md for <PACKAGE>",
  model: "sonnet",
  prompt: """
    Render the master end-to-end business-process Markdown for package <PACKAGE>.

    ## State (from Steps 1–5)
    - frontmatter values: { package: <PACKAGE>, module: <MODULE>,
      sap_version: <SAPV>, abap_release: <ABAP_RELEASE>,
      industry: <INDUSTRY>, country: <COUNTRY>,
      active_modules: <ACTIVE_MODULES>, entry_points: <ENTRY_POINTS>,
      language: <LANG> }
    - per-process structured output: <STEP5_JSON>

    ## Template
    Use skills/package-to-process/document-template.md verbatim. Substitute
    <…> placeholders from the state above. Honor every constraint in the
    template's § Renderer Constraints (frontmatter mandatory, TOC anchors,
    no nested Mermaid, fixed column order, no row data, …).

    ## File output
    Write to <OUT_PATH>. Create parent directories if missing.
    If the file exists, prepend one line directly under the H1:
    `> Regenerated from <previous frontmatter.generated_at>`.

    ## Language
    Section titles + body in <LANG>. Mermaid syntax is language-neutral; only
    node labels translate. Frontmatter keys stay English.

    ## Return — a short block
    - file_path
    - line_count
    - section_counts: { processes, external_boundary_rows, sensitive_objects }

    Constraints:
    - Do NOT read SAP via MCP. Render from state only.
    - Do NOT add sections not present in document-template.md.
  """,
  mode: "dontAsk"
})
```

---

## Failure handling

- `BLOCKED: <reason>` → main thread STOPS, surfaces reason, asks user.
- Writer returns success but file is missing at `<OUT_PATH>` → STOP with `Writer reported success but file not found at <path>`; do not retry silently.
- Writer returns success with `line_count > 2000` → warn the user, offer a per-process split into appendix files (requires user approval; no auto-split).
- Writer-generated file fails Step 7 frontmatter validation → surface concrete failure, leave file in place, ask the user whether to retry or hand-edit.
