# Skill Router — plain chat → the right sc4sap skill

Most users do not type `/sc4sap:<skill>`; they describe what they want in plain chat. The main thread decides once per request whether an sc4sap skill owns it and then either runs that skill or proposes it in one line. The digest below is injected at session start by `scripts/session-start.mjs` (single source — edit it here only).

Related: [`intent-router.md`](intent-router.md) splits `knowledge` / `lookup` / `action` between `ask-consultant` and `assist` once one of them runs. [`offline-mode.md`](offline-mode.md) decides which skills can run without a connection.

## Digest (injected at session start)

<!-- skill-router:start -->
[SC4SAP] Skill routing for plain chat (common/skill-router.md). When a user request is SAP work an sc4sap skill owns, use it — do not do the job ad hoc and do not make the user type the slash command.
- RUN directly (Skill tool, reuse the user's sentence):
  - how / why / configuration / process / design question → ask-consultant
  - data of specific documents or a change to them (open POs, post GI, release, block, reverse …) → assist (it confirms before any write)
  - dump / short dump / error / "why does it fail" for a run in the system → analyze-symptom
  - connection or plugin not working → sap-doctor
- PROPOSE in one line (skill + target + what it produces), run on yes:
  - build a program / report / ALV / batch → create-program · one DDIC object, class, FM → create-object
  - review or check ABAP code → analyze-code · spec of a program → program-to-spec · user manual → program-to-manual
  - compare 2–5 similar programs → compare-programs · interface mapping spec → interface-mapping-spec
  - document a module's configuration → config-to-document · how a module runs (process map) → module-to-process
  - CBO package inventory → stock-cbo · how custom objects relate → cbo-relation-map
  - SmartForm print preview → smartform-preview · SmartForm from a PDF / image → smartform-from-pdf
  - project dashboard → project-dashboard · roles & authorizations → role-matrix
  - connect / add a SAP system → setup · MCP install → mcp-setup · settings / cost mode → sap-option
- Do NOT route: a slash command the user typed (it wins); a skill already running (its rules apply); questions about the plugin itself or its development; small talk or general programming unrelated to the SAP system.
- Ambiguous between two skills: ask one question naming both. Offline profile: only skills marked full / degraded in common/offline-mode.md.
<!-- skill-router:end -->

## Why two modes

| Mode | Skills | Reason |
|---|---|---|
| Run | `ask-consultant`, `assist`, `analyze-symptom`, `sap-doctor` | Answer-shaped, read-only or self-confirming, finish in minutes. Asking first only adds a turn. |
| Propose | every skill that writes a deliverable file, writes to SAP, or dispatches many agents | Takes minutes and money, or changes the system. The user should see the target and the output before it starts. |

`assist` stays in Run: its own flow previews every write and waits for an explicit yes ([`intent-router.md`](intent-router.md) § 4).

## Proposal line

One line in the user's language, then wait. Name the skill, the target taken from the sentence, and the output:

- KO: `이 요청은 /sc4sap:program-to-spec ZXX_SALES_REPORT 으로 처리할 수 있어요 — 기능·기술 명세서(HTML)를 만들어요. 진행할까요?`
- EN: `This fits /sc4sap:program-to-spec ZXX_SALES_REPORT — it writes a functional / technical spec (HTML). Shall I run it?`

Missing target (no program, package or module in the sentence) → ask for it in the same line. On yes, invoke the skill with the user's sentence plus the answer as arguments; never ask the user to retype.

## Signals

1. A slash command or an explicit skill name in the sentence → that skill, no routing.
2. An object name (Z/Y program, class, FM, table, SmartForm, package) + a deliverable verb (spec, manual, review, compare, preview, map) → the matching Propose row.
3. A document number or a business-data verb → `assist`; a how / why / setting question → `ask-consultant` ([`intent-router.md`](intent-router.md) § 2).
4. An error text, dump name (e.g. `CONVT_NO_NUMBER`), ST22, "fails", "에러", "덤프" with a program or user → `analyze-symptom`.
5. Nothing matches → answer normally; do not force a skill.

## Never

- Never run a Propose skill without the user's yes.
- Never route plugin-development talk (editing skills, hooks, tests in this repository) into a skill.
- Never switch skills in the middle of a running skill except through that skill's own handoff rules.
