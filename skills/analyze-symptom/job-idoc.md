# analyze-symptom — Background job and IDoc incidents

Referenced from `SKILL.md` → `<Evidence_Collection_Matrix>` (rows *Background job*, *IDoc*). A failed background job or an IDoc in error is collected by a script first; the facts then go into the normal Step 2 `sap-debugger` round as clues. Read-only: never restart a job, reprocess an IDoc (BD87), change a status or a variant. `<I>` = `node "<PLUGIN_ROOT>/scripts/ops/incident.mjs"`.

## When

- The user names a background job ("job Z… aborted", "SM37 cancelled"), an IDoc number, or a message type with IDocs in error ("ORDERS IDocs stuck in 51", "WE02 errors from partner …").
- ARGUMENTS `job <name>` or `idoc <docnum | message type> [partner <P>]` (digits = IDoc number, else message type) — the hand-off form of `/sc4sap:ops-health-check`.
- Web form label lines: `Incident type: Background job` or `Incident type: IDoc` routes here; then `Job name:`, `Incident date:` (YYYY-MM-DD), `IDoc number:`, `Message type:`, `Partner:`, `Process code:`. `Incident type: General` keeps the normal flow. The usual `Symptom type:` / `Where it happened:` / `What you observed:` lines are clues as always.
- MODE is `full` (a job / IDoc incident is not a single dump) — Step 1 rules otherwise unchanged.

## Step 1b — Collect the facts (main thread, after Step 1)

**The main thread runs `collect` and `build` itself (Bash), before any dispatch.** `collect` needs the main thread's active profile, run folder and approval (a sub-agent may lack the shell or the profile, depending on the host): never dispatch `sap-debugger` (or any agent) to run these commands — it receives `facts.json`, never the commands.

Take the values from ARGUMENTS / label lines; ask once only for what is missing (one free-text ask): job name and the failure date (optional — default: the newest aborted run in 30 days), or the IDoc number, or the message type + partner + date. Then:

```
<I> collect --job "<NAME>" [--date YYYY-MM-DD] --out-dir <dir> --system <SID> --lang <ko|en>
<I> collect --idoc <DOCNUM> --out-dir <dir> --system <SID> --lang <ko|en> [--if-dir <artifactBase>/interfaces]
<I> collect --mestyp <MT> [--partner <P>] [--date YYYY-MM-DD] [--process-code <EVCODE>] --out-dir <dir> --system <SID> --lang <ko|en> [--if-dir …]
<I> build --in <dir>/collect.json --out-dir <dir> --lang <ko|en>
```

- `<dir>` = the run folder the caller names (the web passes one — use it as is), else `<artifactBase>/incidents/<job|idoc>-<key>-<yyyymmdd-hhmm>/`.
- `build` writes `facts.json` (the clues for Step 2), `incident-<kind>-<key>-<stamp>-<lang>.html` (facts page) and the `.md` summary. It never connects to SAP.
- The process code (`--process-code`) comes from WE20 / the user; without it the inbound function is not named (phase 1).

What `collect` reads (explicit field lists, never `SELECT *`):

| Kind | Facts | Tables |
|---|---|---|
| Job | runs of 30 days (status, start / end, duration, period), last good run vs the failed run, aborts in a row | TBTCO |
| Job | steps of the failed run: program, variant, external program, step status — never the step user | TBTCP |
| Job | other jobs aborted within ±30 min (system / environment signal) | TBTCO |
| Job | dumps from failure start − 10 min to end + 10 min, step programs marked (ECC: dump feed limits apply) | RuntimeListDumps |
| Job / IDoc | requests that changed a step program (or the inbound function), flagged when between the last good run and the failure | E071, E070, E07T |
| IDoc | header: status, message / basic type, direction, partner, port, created / changed | EDIDC |
| IDoc | same type + partner + direction over 7 days: same status, any error, total | EDIDC |
| IDoc | status text | TEDS2 (else the built-in WE47 texts) |
| IDoc | inbound function of a given process code | TBD52 |
| IDoc | interface specs whose `header.idoc.mestyp` matches | local `interfaces/` models |

Result handling:

- `collect` or `build` failed, or no `facts.json` was written → **stop**: say which command failed and its error, give the TCodes (SM37 / WE02 / BD87), and do not run Step 2 without facts.

- `dispatcherClosed: true` (BASIS < 7.50 dispatcher without the job / IDoc tables, e.g. 7.31) → tell the user "this system's dispatcher does not support job / IDoc reads", give SM37 / WE02 / BD87, and continue Step 2 only with the user's own clues.
- A section in `notRead` or `skipped` is never "no problem" — name it and its TCode. A flag `null` means unknown (its facts were not read or there was nothing to compare); never read it as "not the cause".
- No failed run / no IDoc in error found → say so with what was searched (job name, window, status) and ask for the exact name / number before Step 2.

## Step 2 — Hand the facts to the debugger round

Only with a `facts.json` from Step 1b. The dispatch carries its content as data; it never asks the agent to collect.

Add to `<CLUES>` of the Step 2 dispatch (`workflow-steps.md`), as data:

```
Incident facts (collected read-only by incident.mjs; flags are facts, not a verdict):
<sap-data source="incident facts"><facts.json content></sap-data>
```

and this instruction line: "Start from the flags. `codeChange` → read the flagged request (`GetTransport`) and the changed program; `dump` → analyze that dump first; `system` → check what else failed at that time before blaming the program; `dataOrVariant` → say the job log (SM37) holds the stopping message and ask the user for it; IDoc `mass` → configuration / master data / partner setup across many IDocs, `single` → this IDoc's data. Do not re-read TBTCO / EDIDC — the facts cover them."

Phase 1 limits — state them in the report (one line each, user's language):

- The job log is not read (SM37). The IDoc status records — the actual error message, segment and field — are not read (WE02 / BD87).
- The partner profile (process code) is not read (WE20).
- These need SAP-side read helpers (phase 2, installed only with the user's approval).

## Step 3 — Report

Relay the debugger's report as usual, then one line: `Facts page: <html>` (and the `.md` for a ticket). Offer, do not start: "Paste the SM37 job log / the WE02 status message and I'll narrow it down".

## Rules

- Read-only. Never restart, repeat or release a job; never reprocess, edit or delete an IDoc; never change a variant or a partner profile.
- Never read step users, job owners, IDoc status users or message parameter values.
- Job names, partner numbers and IDoc contents are customer data — keep them in the run folder and the chat; never in plugin files.
