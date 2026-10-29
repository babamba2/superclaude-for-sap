# Phase 4 — Wave 4 (Screens + GUI Status) + Final Activation, with Haiku Verification

Companion file split from [`phase4-parallel.md`](./phase4-parallel.md) (200-line limit). Covers Wave 4, the Final batch activation, and the **Haiku verification fan-out** that checks every "is it really there?" post-condition in Phase 4. Model split per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md): writing stays on `sap-executor`, verifying moves to `sc4sap:sap-checker` (Haiku, `MODE: verify`) — a comparison, not a judgment, at 1/20 of Sonnet's price.

## Verification fan-out — common protocol

1. After the writing step, the main thread dispatches one `sap-checker` per object **in a single message** (one screen, one GUI status, one text pool language, or the inactive list).
2. Each prompt starts with `MODE: verify`, names one object, and lists the assertions with ids (`a1`, `a2`, …) copied from the sections below. No rule files are needed.
3. Main collects the `CHECKER … END` blocks into `.sc4sap/program/{PROG}/verify-phase4.md` (append; keep one block per object per attempt).
4. Any `result=FAIL` or `status=BLOCKED` → main re-dispatches the **writer** (`sap-executor`, same model as the writing step) for that object only, with the failing `ASSERT` lines as context; then verify again. Max 2 rewrite attempts per object, then escalate to Phase 7 with the evidence.
5. Banner: one line per fan-out — `▶ phase=4.W4.verify · agent=sap-checker×N · model=Haiku`.

Text Elements (Wave 2 G4-prep) use the same protocol with the assertions in `phase4-parallel.md` § Wave 2 (`counts.R ≥ 1`, `counts.I == emitted_I`, `counts.S == declared selection fields`) — one checker per language pass.

## Wave 4 — G4-late (Screens + GUI Status)

- **Context kit**: `../../common/alv-rules.md`, `../../common/ok-code-pattern.md`, `../../common/screen-tabstrip.md` (tabstrip screens only)
- **Model**: Sonnet executor for Create/Update; Haiku `sap-checker` ×N for Verify

Needs the main program. **Each screen and each GUI Status MUST follow the 3-step `Create → Update(body) → Verify` protocol** — `Create*` alone creates an empty shell; it does NOT populate flow logic, PFKEYS, menus, or titles. Skipping the `Update*` step has been a recurring Phase 4 regression (screens with `* MODULE STATUS_0100.` commented out and empty GUI statuses passing review).

**Per screen (executor, parallel across screens):**
1. `CreateScreen(program, screen_number, ...)` — shell + field list.
2. `UpdateScreen(program_name, screen_number, dynpro_data=...)` — `dynpro_data` is the screen as JSON (header, containers, `fields_to_containers`, `flow_logic`) — flow logic MUST include uncommented `MODULE STATUS_xxxx.` and `MODULE USER_COMMAND_xxxx.` lines (PBO / PAI). Every field the screen needs must be in the field list. **OK_CODE field binding is mandatory per [`../../common/ok-code-pattern.md`](../../common/ok-code-pattern.md)**: the `fields_to_containers[]` entry with `TYPE=OKCODE` MUST have `NAME` = the OK_CODE variable declared in the TOP include, in upper case (e.g. `OK_CODE` or `GV_OKCODE` — not the placeholder underscores).

**Screen assertions (checker, `GetScreen(program, screen_number)`):**
- `a1` — in `flow_logic`, the section after `PROCESS BEFORE OUTPUT.` has a `MODULE <name>.` line that does not start with `*` or `"` (flow logic never writes `OUTPUT` / `INPUT` on MODULE lines — that suffix belongs to the ABAP module definition in the `{PROG}o` / `{PROG}i` include).
- `a2` — the section after `PROCESS AFTER INPUT.` has a `MODULE <name>.` line (other than `… AT EXIT-COMMAND`) that does not start with `*` or `"`.
- `a3` — the `fields_to_containers[]` entry with `TYPE=OKCODE` has `NAME=<OKVAR>`, where the main thread fills `<OKVAR>` with the OK_CODE variable named in `plan.md` / the TOP include (upper case). Never hardcode `GV_OKCODE`.

**Tabstrip screens** — build per [`../../common/screen-tabstrip.md`](../../common/screen-tabstrip.md) § Creation order: modules uploaded + activated first, then every subscreen (`TYPE I`, `NEXTSCREEN 0000`, one `CUST_CTRL`), then the tabstrip screen. Extra assertions on the tabstrip screen (checker, `GetScreen`):
- `t1` — a container with `TYPE=STRIP_CTRL` exists and its `NAME` equals the `CONTROLS … TYPE TABSTRIP` name in the TOP include.
- `t2` — exactly one container with `TYPE=SUBSCREEN` has `ELEMENT_OF` = the strip name.
- `t3` — every `fields_to_containers[]` row with `CONT_TYPE=STRIP_CTRL` and `TYPE=PUSH` has a non-empty `PUSH_FCODE` and `REF_FIELD` = the subscreen area name.
- `t4` — every subscreen number the program maps a tab to exists (`GetScreen`) with header `TYPE=I`.
- `t5` — `flow_logic` has an uncommented `CALL SUBSCREEN <area> INCLUDING` line after `PROCESS BEFORE OUTPUT.` and an uncommented `CALL SUBSCREEN <area>.` line after `PROCESS AFTER INPUT.`

**Per GUI Status (executor, parallel across statuses):**
1. `CreateGuiStatus(program, status_name, ...)` — shell.
2. `UpdateGuiStatus(program_name, cua_data=...)` — `cua_data` is the program's GUI status definition as JSON — populate PFKEYS (BACK/EXIT/CANC at minimum), application toolbar entries for SAVE/REFRESH/etc., and the status title. **A separate title row per status code must also be emitted (CUAD `TIT` entry).**

**GUI status assertions (checker, `GetGuiStatus(program, status_name)`):**
- `a1` — `definition.STA[*].CODE` contains the requested status name.
- `a2` — at least one PFKEY or toolbar function code is assigned (not just an `STA` + `TIT` pair).
- `a3` — BACK, EXIT and CANC function codes are present.

**Anti-pattern to block**: reporting "Screen/GUI 생성 완료" after only `Create*` returned 200. The empty-shell state is indistinguishable from success unless `Get*` is called after `Update*`. A missing `verify-phase4.md` block for any created screen or status is a MAJOR Phase 6 finding (checked under `phase6-review.md` §1 — the reviewer receives the file path).

## Final Step — Batch Activation + Post-Activation Verification

- **Context kit**: (none — mechanical activation + verify)
- **Model**: main thread (or the leader executor in a split run) activates; Haiku `sap-checker` verifies

1. `GetInactiveObjects` (no arguments; lists every inactive object of the user) → keep the objects created in this session.
2. Single `ActivateObjects` call against the full list.
3. **Mandatory post-activation verification** — dispatch one `sap-checker` (`MODE: verify`) with the object list from `plan.md` (`{PROG}*` plus every created FG / CLAS / TABL) and assertion `a1` — "`GetInactiveObjects` returns 0 entries whose name is in this list". The checker returns the leftover names as evidence. Any leftover means activation partially failed (common case: an include references an identifier that was never activated, so the include stays inactive while the main program activates).
4. If step 3 FAILs: do NOT report "활성화 완료" / "completed". Re-run steps 1–2 targeting the remaining items; on persistent failure (2 attempts) escalate to Phase 7 and surface the exact list of still-inactive objects to the user. Past regression: reviewer reported "5/5 프로그램 활성화 OK" while 30+ sub-includes remained in inactive state — step 3 blocks that class of false positive.

SAP's ADT activation accepts a list and resolves dependencies atomically. If one object fails (rare at this point), reorder by dependency chain and retry the remaining set. Persistent failure → Phase 7.
