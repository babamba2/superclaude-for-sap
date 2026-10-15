# Interview — Interface Mapping Specification

Referenced by `SKILL.md` Steps 1, 2 and 4. Keep it short: the consultant fills details faster in the page than in chat. Ask in the user's language; option labels below are English templates — translate them.

## Project (first run only — `<base>/interfaces/project.json` missing)

One `AskUserQuestion` with two questions, then one free-text ask:

1. **IF ID numbering** — options: `{module}{seq:5}` (e.g. SD00001) · `IF-{seq:4}` (e.g. IF-0001) · "No numbering, I give the ID each time". The user may type another pattern via Other (`{module}`, `{seq:N}`, fixed text).
2. **Region list** — options: "Default list (Korea, China, Asia-Pacific, Europe, Americas, Global)" (Recommended) · "Our own list" (ask for it in the free-text step).

Free text, one message: project name, document title (default: the template title in the page language), document-number pattern (default `IF-MAP-{ifId}`), copyright / confidentiality lines, own region list if chosen.

```json
{
  "projectName": { "ko": "…", "en": "…" },
  "title": { "ko": "인터페이스 매핑 정의서", "en": "Interface Mapping Specification" },
  "docNo": "IF-MAP-{ifId}",
  "copyright": ["…"],
  "idPattern": "{module}{seq:5}",
  "codes": { "region": ["…"] }
}
```

Any text may be a plain string or `{ ko, en }`. `codes` overrides any default list by name (`region`, `adapter`, `cycle`, `dataType`, `transfer`, `trigger`, `relation`, `cardinality`, `structure`); an entry is a string or `{ v, ko, en }`. Omit `codes` to keep the defaults. Never invent customer names.

## Interface (every new document)

**Round 1 — one `AskUserQuestion`, three questions:**

1. **Scenario** (pre-fills transfer mode, trigger, cycle, relation, target logic, structure, occurrence, response block):
   - Master data outbound — SAP → external, scheduled (`master-out`)
   - Transaction outbound — SAP document → external, on event (`txn-out`)
   - Inbound into SAP — external → SAP document, result returned (`inbound`)
   - Query — external system asks SAP, synchronous answer (`query`)
2. **SAP fields from** (decision 19):
   - An existing SAP object — table / view / structure / proxy structure / function module
   - A field list — `TABLE-FIELD` or data elements (e.g. `LIKP-VBELN, LIPS-MATNR, MEINS`)
   - Describe the business — the module consultant proposes the fields (Step 3)
   - Empty grid — fill or paste in the page
3. **IF ID** — when `idPattern` exists, run `<B> next-id --module <M>` first and offer the result as the first option "(Recommended)"; otherwise options "I'll type it" (Other). The module comes from the user's request or the active modules; ask inside this question's description if unclear.

**Round 2 — one free-text message** asking only what the round-1 answers left open:
- interface name and one-line summary
- the counterpart system (name, adapter if known) and the SAP system name as the project calls it
- the SAP object name, or the field list, or the business description (per question 2)
- author (name, contact) — reuse the previous document's author if there is one

Everything else (owners, region, cycle count, sizes, SQL, remarks) is filled in the page. Do not ask further rounds unless the SAP object cannot be found.

## Answers file (Step 4)

`<base>/interfaces/_answers/<IF_ID>.json`, written with `Write`:

```json
{
  "ifId": "SD00003",
  "module": "SD",
  "lang": "ko",
  "preset": "txn-out",
  "header": { "name": "…", "summary": "…", "author": "…" },
  "sides": {
    "source": { "system": "ERP", "module": "SD", "region": "KR", "adapter": "ABAP Proxy", "object": "…" },
    "target": { "system": "…", "region": "KR", "adapter": "JDBC (Oracle)" }
  },
  "objects": { "source": { "object": "Z_RFC_…", "kind": "FUNCTION" } },
  "fields": { "source": ["LIKP-VBELN", "LIPS-MATNR"] }
}
```

- `sapSide` follows the preset (`source` for outbound, `target` for inbound / query); set it only when the user says otherwise, or `both` for SAP-to-SAP.
- Give `objects` **or** `fields` for the SAP side, never both. `sides.<side>.structure` / `cardinality` are optional: they only seed the kind and occurrence of the first group (the preset does that otherwise); in the page they live on the ▸ group rows. `kind` is optional (`TABLE`, `STRUCTURE`, `VIEW`, `FUNCTION`); `lines: { "PARAM": "STRUCTURE" }` names line types the system cannot resolve (older releases).
- Leave `ifId` empty with `module` set to let `init` number it from `idPattern`.
- Header and side values for code lists use the stored codes: `transfer` SYNC / ASYNC / ASYNC_CB, `cycle` YEAR / MONTH / WEEK / DAY / HOUR / MIN / SEC / REALTIME / ADHOC / OTHER, `region` as in the region list (`v`), `trigger` PUSH / PULL.
