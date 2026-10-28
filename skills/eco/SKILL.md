---
name: eco
description: Run one sc4sap skill in eco cost mode (cheaper sub-agent models and effort, lower main-thread effort; same deliverable as standard) without changing preferences — `/sc4sap:eco <skill> <args>`. Also re-applies low effort on continuation turns of an eco run (`--attach`).
argument-hint: "<skill> <args> | --attach"
model: inherit
effort: low
---

# SC4SAP Eco

One-off entry point for **eco cost mode** — same deliverable as standard, cheaper models and effort. Rules: [`../../common/cost-mode.md`](../../common/cost-mode.md). This skill's `effort: low` frontmatter lowers the main-thread effort while it is active — that is lever B of the cost mode. The effect ends at the next user turn, so eco runs re-enter here with `--attach`.

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary> · Mode: eco]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention — except in `--attach` mode, which emits nothing.
</Response_Prefix>

<Modes>

### `--attach`

Called by a skill already running in eco (first action of the run when eco came from preferences / `--eco`, and first action of every continuation turn). Do nothing else: no output, no file reads. Return control to the calling skill and continue its work in this same turn.

### `<skill> <args>` (user-facing)

1. If the arguments contain `--standard` → say that eco and standard conflict, and stop. Parse the first token as the target skill. Accept `create-program`, `/sc4sap:create-program`, `sc4sap:create-program`. Normalize to the bare name.
2. If the target has no eco variant (`setup`, `sap-option`, `sap-doctor`, `mcp-setup`, `trust-session`, `eco`, and every skill listed as "No eco variant" in `common/cost-mode.md` § lever C) → say so in one line and stop. Do not run it.
3. If the target is unknown or missing → list the skills that have an eco recipe (`common/cost-mode.md` § lever C) and stop.
4. Invoke `Skill("sc4sap:<target>", "<args> --eco --via-eco")`. The target resolves `--eco` first and skips its first `--attach` because of `--via-eco` (cost-mode § Resolution), so preferences are not read for the mode and not changed.
5. The target skill owns the run from here: its own prefix (with `· Mode: eco`), banners, questions, and report.

</Modes>

<Examples>
- `/sc4sap:eco compare-programs ZSDR_SALES_KR ZSDR_SALES_EU` → the same report (all dimensions, English companion), scouts on Haiku, analyst and writer on Sonnet · low.
- `/sc4sap:eco program-to-manual ZMMR_PO_STATUS` → the same manual (all scenarios, English companion), written on Sonnet · low.
- `/sc4sap:eco package-to-process ZSD300 lang=ko` → the same documents, Haiku scouts read every source, Sonnet · low analyst and writer.
- To make eco the default instead: `/sc4sap:sap-option cost mode`.
</Examples>
