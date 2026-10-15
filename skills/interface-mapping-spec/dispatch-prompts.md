# Dispatch Prompts — Interface Mapping Specification

Referenced by `SKILL.md` Steps 3 and 5. Use verbatim with the `{placeholders}` filled.

## § 1 — Field proposal (module consultant)

```
▶ phase=3 (field proposal) · agent=sap-<module>-consultant · model=<frontmatter>
```

`Agent(subagent_type: "sc4sap:sap-{module}-consultant", description: "Propose interface fields", prompt: …)`

```
Propose the SAP-side fields of a new interface. You read DDIC (GetTable, GetStructure,
GetDataElement) to check every field exists in this system; you never read table contents.

Interface: {name} — {summary}
Direction: SAP is the {source|target} system; counterpart: {counterpart}
Scenario: {preset label}
Business description from the consultant:
{description}

Return ONLY these lines, one field per line, most important first, at most 40:
FIELD <TABLE>-<FIELD> | <why the interface needs it, max 12 words> | <key Y/N>
Then one line per open question that changes the field list (at most 3):
ASK <question>

Rules:
- Use the standard tables of this release ({sapVersion}); prefer header / item tables of the business
  document (e.g. LIKP / LIPS, EKKO / EKPO, VBAK / VBAP) and existing CBO tables only when the
  description names them.
- Include the document keys, the organisational units the receiver needs, quantities with their unit
  field and amounts with their currency field.
- Every line must name a field you saw in DDIC; drop anything you could not confirm.
```

The main thread shows the `FIELD` lines as a table (field, reason, key) and the `ASK` lines, and asks the user to confirm, trim or add in one message. The confirmed list goes into `fields` of the answers file; `init` reads each one from DDIC again and reports any it cannot find.

## § 2 — English companion (translator)

```
▶ phase=5 (translate) · agent=sap-writer · model=Sonnet (override)
```

`Agent(subagent_type: "sc4sap:sap-writer", model: "sonnet", description: "Translate mapping spec texts", prompt: …)`

```
Translate the texts of an interface mapping specification into English.

Read {todoFile}: a JSON object { "<path>": "<text>" }. Write {outFile} with the Write tool: the same
keys, each value translated. Nothing else in the file.

Rules:
- Keep table, field, object, function-module, conversion-exit and BAPI names, codes, numbers and
  SQL exactly as they are.
- Field descriptions: short noun phrases as SAP field labels read ("Delivery date", "Ship-to party").
- Interface name: title case, no articles. Summaries and rules: plain sentences, same meaning, no
  additions.
- Keep line breaks inside a value.
Reply with the number of texts written.
```

Texts already translated for an earlier version, the proposed rules and texts without Hangul are reused by `texts` and never sent (`reused` in its output).
