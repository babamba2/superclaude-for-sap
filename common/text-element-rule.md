# Text Element Rule

**All user-visible text MUST use Text Elements** — no hardcoded display literals.

## Scope

- ALV column caption: `<fs_fieldcat>-coltext = text-f01.`
- Screen title: `text-t01`
- Messages / tooltips: `text-m01`
- Selection screen labels: maintained via Text Element editor

## Language Strategy (MANDATORY — two passes)

SAP text pools are language-dependent. The runtime loads texts in the user's logon language; if that pool row is missing, the screen shows **empty** for that text id. A single-language pool is a guaranteed bug the moment anyone logs on in a different language.

**Rule (two passes, both MANDATORY):**

1. **Primary pass — system logon language.** Create every text element in the resolved primary language (from `.sc4sap/config.json` → `systemInfo.language`, fallback to `sap.env` → `SAP_LANGUAGE`). Example: on a Korean-speaking team, primary = `'K'` with Korean source text. This is what the day-to-day users will see.

2. **Safety-net pass — `'E'` (EN), ALWAYS added.** Immediately after the primary pass, create the **same text ids again** in language `'E'` with English translations (or romanization as a stopgap if no English copy exists). Reason: any user with logon language `'E'` — admin, consultant, auditor, or a future migration user — must see populated text, not blanks. `'E'` is also SAP's conventional base language and avoids translation-fallback surprises.

3. **Additional passes (optional, scope-driven).** If the project serves multiple user communities, repeat the CreateTextElement call per target language (`'D'`, `'J'`, `'F'`, …) with the translated string.

The `language` parameter passed to `CreateTextElement` drives which pool row is written. Do NOT omit it — always pass the explicit value per pass; never rely on "default" which is session-dependent.

**Enforcement summary (must satisfy ALL):**
- Every text id exists in the primary logon language row.
- Every text id ALSO exists in `'E'` row. Missing `'E'` row is a MAJOR review finding even when the primary row is present.

For the `create-program` skill, the planner's text-element table in `plan.md` must list TWO columns (primary + `'E'`) at minimum. The executor then issues `CreateTextElement` once per `(text_id, language)` pair — 2 × N calls minimum.

## Enforcement

- `CreateTextElement` MCP registers each text id per program/screen.
- `sap-code-reviewer` **must fail the review** if:
  - hardcoded display literals are found, OR
  - any text id is missing its primary-language row, OR
  - any text id is missing its `'E'` safety-net row.
