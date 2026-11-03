# Code Template — create-program

Lets the user build a program in the layout of an existing program instead of the sc4sap samples. The default stays the sc4sap sample of the chosen paradigm (`common/procedural-sample/`, `common/oop-sample/`). A template changes **how the code is laid out**, never **what the program does** and never the safety rules below.

Templates are saved and reused: the first run extracts a profile from a program on the connected system; later runs pick it from a list.

## When it is asked

Phase 1B dimension **2a — Code template**, asked right after dimension 2 (Paradigm), one question per turn like every other dimension. In a Type D run the lead asks it after the paradigm position is settled.

Options (`AskUserQuestion`, single select):

| Option | Meaning |
|---|---|
| **sc4sap default (Recommended)** | The sc4sap sample of the chosen paradigm. Current behaviour. |
| **Saved template: `<NAME>`** | One option per saved template whose `paradigm` matches. Show `source program · extracted date`. At most 3 listed; more → `Other` takes a name. |
| **New template from a program** | User names a program on the active system; it is extracted, saved, then used. |
| **Mix per include** | Start from the default, then name a template (saved or new) per include. |

Skip the question (record `sc4sap default`) only when no template is saved AND the user's request names no reference program. Phase 1A dimension 5 (Reference assets) naming a Z program is a reason to ask, not to assume.

## Scope — whole program or per include

The answer is an **include map**: one entry per include role of the paradigm, each `default` or a template name.

```
code_template:
  mode: default | template | mix
  map:  { main: ZSD_STD, t: ZSD_STD, s: ZSD_STD, c: default, o: ZSD_STD, i: ZSD_STD, a: ZSD_STD, f: ZSD_STD }
```

- `template` = every role maps to the same template. `mix` = at least one `default`.
- Roles are sc4sap roles (`main t c s o i a f` Procedural; `main t s c ct e o i f` OOP). The template's own include names (`TOP`, `SCR`, `F01` …) are mapped to these roles in the profile.
- **Roles the template lacks**: a role the spec needs but the template does not cover (e.g. a helper class `c` or tests `ct` in a template without them) maps to `default` — sc4sap content, named with the template's include-name pattern (e.g. `{PROG}CLS`, `{PROG}TST` for a 3-character suffix style). Place `c` where the template puts its class include (else right after TOP) and `ct` last. It is listed in `Template deviations`.
- **Extra roles**: a template may have an include the sc4sap layout does not (e.g. an events include `{PROG}ENT`). It is listed in the role map with its own role name and generated only for roles mapped to that template.
- A template whose paradigm differs from dimension 2 is not offered. If the user names one, say so and offer: switch the paradigm / pick another template / default.

Persist in `state.json → code_template` and in `interview.md` (Q&A block for dimension 2a).

## Extracting a new template

1. **Existence** — `SearchObject` on the active profile's system. Not found → stop per `../../common/multi-profile-artifact-resolution.md` § Target object not on the active system.
2. **Scout** — one Haiku `sap-checker` (`MODE: scout`) reads `GetProgFullCode(name, output="file")` and returns structured lines: include list with outline, keyword case, header block, declaration order in the TOP include, FORM / method naming, parameter / variable prefixes, container type, field catalog method, macros, message class, utility classes / FMs called, event blocks in the main program.
3. **Profile** — the main thread writes `profile.md` from those lines (fields below) and copies a **skeleton** per role: the include with business logic cut out — declarations kept as shape (one structure, one table, one ALV object set), one representative FORM / method per kind (selection, read, ALV build, PAI dispatch), bodies reduced to their call pattern.
4. **Confirm** — show the user the role map and the 10 most important profile lines; ask for a template name (default = program name). Save only after the answer.

Never copy business logic, SELECT conditions, customer numbers, user names or credentials into the skeleton.

## Storage

`<artifact base>/templates/<NAME>/` (write path per `../../common/multi-profile-artifact-resolution.md`; other profiles see it read-only):

- `profile.md` — the profile
- `skeleton/<role>.abap` — one file per role the template covers
- `<artifact base>/templates/index.json` (one file for all templates) — `[{ name, paradigm, source_program, system, extracted_at, source_sha256, roles }]`, read for the option list. `source_sha256` = SHA-256 of the `GetProgFullCode` output at extraction.

Saved templates stay in the project's `.sc4sap/` (not in the plugin). A saved template whose source changed (re-read `GetProgFullCode`, compare with `source_sha256`; ADT metadata on ECC has no reliable change date) is offered with `(source changed — refresh?)`; refresh re-runs the extraction and overwrites only after the user confirms.

## Profile fields (`profile.md`)

Header: `name`, `source_program`, `system`, `extracted_at`, `paradigm`, `abap_release_seen` (syntax level used in the source).

Sections, one line each where possible:

- **Role map** — template include → sc4sap role (`ZSDR00010TOP → t`, `ZSDR00010SCR → s`, …) and the include name pattern for new programs (`{PROG}TOP`, `{PROG}F01`).
- **Main program** — header block lines, `REPORT` options, include order, event blocks and the FORM each one calls.
- **Naming** — globals / locals / parameters / constants / types prefixes; FORM or method naming; screen suffix rule; keyword and identifier case.
- **TOP layout** — section order and section comments.
- **Selection screen** — block / line layout pattern.
- **Screens** — PBO / PAI module names, OK_CODE variable name, exit-command handling.
- **ALV** — container type, grid split, settings bundle or separate globals, field catalog method, toolbar exclude list, event receiver location.
- **Messages** — message class and the way texts are passed.
- **Utilities** — Z classes / FMs / message classes / shared includes the template relies on, each with when a new program uses it. A shared include (named after another program) is reused with `INCLUDE`, never copied or changed. Business objects of the source (its Z tables, structures) are not utilities.
- **Requirements** — objects the layout needs from the planner, e.g. a DDIC output structure when the field catalog comes from `LVC_FIELDCATALOG_MERGE`.
- **Rule adaptations** — numbered list of source lines that break a rule below and how new code handles them; copied into `Template deviations` of every spec that uses the template.
- **Comments** — banner style above FORMs and sections.

## What a template may change — and what it may not

Template wins (style): include names and order, header block, naming and case, TOP section layout, selection-screen layout, container type, field catalog method, settings bundle vs globals, macros, comment banners, utility classes it calls. The layout anti-patterns in `../../common/include-structure.md` (event blocks in an include, globals outside TOP) and the sample rules in `clean-code-procedural.md` § Mandatory Main Program Template are style too: for template roles they are not findings.

Rules win (never overridden — a template line that breaks one is adapted, and the change is listed):

- OK_CODE binding (`../../common/ok-code-pattern.md`) — never `CASE sy-ucomm`
- Text elements in the primary language + `E` (`../../common/text-element-rule.md`); no hard-coded display text
- ABAP release and SAP version gates (`abap-release-reference.md`, `sap-version-reference.md`)
- Z/Y prefix, transport and client rules, activation + `GetInactiveObjects` check
- `sy-subrc` checked after statements that set it; no swallowed errors in new code (a silent `CHECK SY-SUBRC = 0` is allowed only where the caller cannot act on the failure, e.g. a dynamic `ASSIGN` of a known global)
- FORM parameters typed (`TYPE` / `TYPE REF TO` / generic `CSEQUENCE`, `ANY TABLE`), no boolean `USING` — skeleton FORMs without types are typed in new code
- Text passed with `MESSAGE ... WITH` fits `SY-MSGV1`–`4` (50 characters each)
- Program-global data keeps the global prefix even when the template declares it inside a MODULE or FORM include
- Data extraction policy and blocklist

**Utilities**: every Z class / FM / message class / shared include the profile names is checked on the target system in Phase 2 (`SearchObject`). Missing → the planner replaces it with standard code and lists it.

**Requirements**: the planner adds each profile requirement to the plan (e.g. a new DDIC structure in Phase 4 Wave 1, or reuse of an existing one). On ECC a new structure goes through `CreateStructure`'s ECC path (MCP 4.8.18+, `ZMCP_ADT_DDIC_TABL`); with an older MCP it needs a helper report + SE11 step per `../../common/ecc-ddic-fallback.md` — say so at the spec gate.

## Downstream

- **Spec approval gate** — `spec.md` gets a `Code template` section: the include map, the template names, and `Template deviations` (each rule that won over a template line, each missing utility). The user approves it with the spec.
- **Phase 4** — for a role mapped to a template, the executor's context kit is `profile.md` + `skeleton/<role>.abap` instead of the sc4sap sample for that role. `default` roles keep the sc4sap sample.
- **Phase 6** — reviewer bucket B3 checks template roles against `profile.md` + skeleton: a structural mismatch is MAJOR. sc4sap-sample structure findings are not raised for those roles. All other buckets run unchanged.
