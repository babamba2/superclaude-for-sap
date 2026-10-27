---
name: package-to-process
description: Replaced by /sc4sap:module-to-process (one release redirect). Business-process documentation of custom packages now runs per module, only on the TCodes users actually use, into one editable HTML process map. Invoking this skill hands the request over to module-to-process with the given package(s) as scope.
model: inherit
---

# SC4SAP Package → Process (redirect)

This skill was replaced in 0.6.47 by [`/sc4sap:module-to-process`](../module-to-process/SKILL.md) and is kept for one release so existing habits and links keep working. It is removed in the next release.

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Redirect>
1. Tell the user in one line: `package-to-process is now module-to-process — one process map per module, built only from the TCodes users run. Continuing there with <PACKAGE> as scope.`
2. Invoke `Skill("sc4sap:module-to-process", "<the original arguments>")`. The package named here becomes the Step 1 package list; the module is inferred from the package name as before and confirmed in Step 1.
3. Do not run the old Markdown / BPML pipeline. Its companion files stay in this folder only because other skills still link to them; they are deleted with this redirect.
</Redirect>

<What_Changed>
| Before (package-to-process) | Now (module-to-process) |
|---|---|
| One package | One module or process area, any number of packages, plus loose Z TCodes |
| Every program of the package | Only TCodes used on the productive system (ST03N), unused ones counted |
| Markdown / HTML / Excel BPML | One self-contained editable HTML page (BPH table, scenario maps, task sheets) |
| Process grouping by shared tables | Standard process backbone (L1–L4) with CBO tasks placed on it, variants, owners, systems |
</What_Changed>

Task: $ARGUMENTS
