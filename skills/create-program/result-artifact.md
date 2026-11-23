# Result Artifact — show the completion report as a page (first creation only)

Companion of [`agent-pipeline.md`](agent-pipeline.md) § Phase 8. After the report is shown, the main thread publishes `report.html` as a private claude.ai Artifact and gives the user the link, so the result opens as a page instead of terminal text.

## When

All of these hold, else skip silently:

- **First creation** — this run created `{PROG}`: `state.json` had no completed `8_report` when the run started (a resumed first run counts). Never on a `--fix` run ([`cost-rules.md`](cost-rules.md) § 1c) or any later change round.
- **The host has the `Artifact` tool** (Claude Code with a claude.ai login). A host without it (sc4sap_web, plain API) skips — the web shows its own result page.
- Phase 8 finished and `report.md` exists (a `❌ BLOCKED` run never reaches Phase 8, so it never publishes).

## Steps (main thread)

1. Write `report.html` without asking: `node "<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs" .sc4sap/program/{PROG}/report.md` (`<PLUGIN_ROOT>` = two levels above this skill folder). The Phase 8 HTML line then offers `spec.html` only.
2. Read the whole `report.html` once — the Artifact rules require it before a publish of a file Claude did not write. This page is generated, not authored: publish it as-is, do not load `artifact-design` and do not edit it (its title is the report's H1; theme and layout come from `md-to-html.mjs`). A page problem is fixed in `md-to-html.mjs`, never by hand.
3. Publish: `Artifact({ file_path: "<abs path of report.html>", icon: "code", description: "{PROG} — create-program result, <YYYY-MM-DD>, <SAP system ID>" })`. No `url` (always a new artifact), no `capabilities`, no `pin`.
4. Print one line in the user's language: the link, and that it is private — only the user can open it until they share it from the page's Share menu.
5. Record the URL in `state.json` → `phases.8_report.artifact_url` and in `handoff.md`, so a later `--fix` run can name it. `--fix` runs never republish it.

## Content rules

- The page is the report as written — Evidence first, *Business questions decided automatically* (when `auto` decided any, [`../../common/review-questions.md`](../../common/review-questions.md) § 6), summary, *Decisions & Assumptions*. Nothing is added for the page.
- It carries system-specific names (programs, transport, system ID). The artifact is private by default; never share it or change its sharing for the user.
- A publish error is reported in one line and the run still ends normally — `report.md` / `report.html` on disk are the deliverable.
