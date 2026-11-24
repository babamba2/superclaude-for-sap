# Patch Mode — Send the Change, Not the Whole Source

Changing a few lines of an existing object must not cost the whole source as model output. Measured on 45 days of sessions: a re-upload of an object already written in the same session changed **12 %** of its text; the other 88 % was the unchanged source typed out again (`UpdateClass` averaged 56 000 characters per call). Patch mode makes the model emit the edit only.

Two routes, both on MCP `abap-mcp-adt-powerup`:
- **`source_patches`** (first choice) — exact replacements sent with the `Update*` call; the server reads the current source itself, applies them and uploads. One call, no fetch, no `Read`.
- **`source_file`** — fetch to a file, `Read`, `Edit`, upload the file. For when the model must look at the code first.

An older server does not know the argument: it answers that `source_code` is missing or that `source_file` is unknown → fall back to `source_code` for the rest of the run and say so once.

## Server-side patch — `source_patches` (first choice)

Use it whenever the model knows the **exact current text** of the lines it changes: it wrote them earlier in this run, a review finding quotes them verbatim, or it read them (activation error context, an earlier `Get*` answer). Then no fetch and no `Read` are needed — 1 turn.

Tools: `UpdateProgram`, `UpdateInclude`, `UpdateClass`, `UpdateInterface`, `UpdateFunctionModule` (needs `function_group_name`), `UpdateLocalTypes`, `UpdateLocalDefinitions`, `UpdateLocalMacros`. Not `Create*`, not the `*Low` tools.

```json
{ "program_name": "ZMMR0010", "transport_request": "DEVK900123",
  "source_patches": [
    { "old_string": "  lv_total = lv_a + lv_b.", "new_string": "  lv_total = lv_a + lv_b + lv_c." },
    { "old_string": "gc_max TYPE i VALUE 10", "new_string": "gc_max TYPE i VALUE 20", "replace_all": false } ] }
```

- 1–50 patches, applied **in order** (a later patch sees the earlier result) to the newest saved version (inactive if one exists, else active) — the version the upload overwrites.
- `old_string`: exact text, non-empty, occurring **exactly once** (overlapping occurrences count) — add a neighbouring line when it is not unique, or set `replace_all: true` to change every occurrence. Line endings do not matter (matching runs on `\n`; the upload keeps the object's own style) — except in a source with mixed line endings, where `old_string` must match as written or the call is refused ("send source_code"). Indentation and spaces do.
- One patch with 0 or several matches refuses the **whole** call (nothing is uploaded); the error names the patch index and the match count. Fix that `old_string` and send the call again — or, when unsure of the current text, take the file route below.
- Never together with `source_code` / the tool's source field or `source_file` — not even as `""` (the server refuses it, the blocklist hook denies it). Same transport, same `activate` flag as a normal upload.
- The server reads the source, then the update locks the object: a change saved by someone else in between is overwritten — the same exposure as a `source_code` upload.
- The answer carries `patched: { count, replacements, bytes, source_sha256 }` — never the source.
- A failed patched call leaves nothing behind: when the patched text was saved and a later step failed (an include is checked only by its activation), the server uploads the pre-patch source again — activated when there was no inactive version, else as the previous inactive version — and the error ends with "the failed patch was undone" (also when the tool reports an error after its activation — the change is then reverted too). "UNDO FAILED" says what is saved now (the patched text, or the old text not yet activated): act on that before anything else. An include patch is validated only with `activate: true` (or by the run's later `ActivateObjects`).
- `source_patches` is for business code. Sources with test classes (`FOR TESTING` before or after the patch, or a class `IMPLEMENTATION` whose `DEFINITION` sits in another include) and test-class parts (`UpdateLocalTestClass`) are always sent as full `source_code` — the server and the blocklist hook refuse a patch to them, so the hook can scan the test code.
- Evidence ledger: `source_patches: { count, sha256, uploaded_sha256 }` (no `source_sha256`); a mixed call is recorded as `source_patches_mixed`, never as a source upload.

## File route — `source_file` (when the code must be read first)

Use it when the current text of the lines to change is **not** known exactly (a fix that needs the surrounding code, an object changed by someone else, a vague finding). Choose by the table below.

Every extra turn re-reads the whole conversation, so turns cost more than the source text on a long thread (measured 2026-11-24: a 6 000-character program on a 215k-token main thread — patch cut the output by 77 % but its 2 extra turns cost 5× what they saved). Count turns, not only characters.

| Situation | Mode | Turns |
|---|---|---|
| Exact current text of the changed lines is known (written in this run, quoted by a finding, read earlier) | **`source_patches`** — one `Update*` call | 1 |
| Second and later uploads of an object written earlier in the same run via its file (its file is already there) | **patch** — `Edit` + upload in one message, no fetch, no read | 1 |
| Existing objects (one or several changed together: review fixes, Phase 6 fix lists, activation-error fixes) whose **combined source in characters ≥ 0.2 × the conversation's tokens** (200k-token main thread → 40 000 characters; 40k-token sub-agent → 8 000) | **patch, batched** — one `sap-batch` fetch for all, one message of `Read`s, one message of every `Edit` + every upload | 3 for any number of objects |
| Existing objects below that size | `source_code` | 1 |
| New object, first upload (the whole source is new text anyway) — write it to `<MCP output dir>/src/<name>.<kind>.abap` with `Write` and upload with `source_file`, so later fixes need no fetch | `source_file` (written) | 1 |
| Whole-file rewrite (more than half of the lines change) | `source_code` | 1 |

## Steps

1. **Fetch to file** — skip when the file is already there from this run. One object: the read tool with `output: "file"` — `GetProgram` / `GetInclude` / `GetClass` / `GetInterface` / `GetFunctionModule` / `GetProgFullCode` (programs with includes); the answer carries the absolute `path` (or `code_objects[].path`). Two or more objects: one batch, one line per object (read tools only):
   `node "<PLUGIN_ROOT>/scripts/lib/sap-batch.mjs" --tool GetProgram --each "<A>,<B>,…" --keys program_name --args '{"output":"file"}' --pick path`
   (`GetInclude` → `--keys include_name`, `GetClass` → `--keys class_name`; the `OK` line carries the path).
2. **Read** the files in **one message** (only the relevant part of a large one — `offset` / `limit`).
3. **Edit + upload in one message**: every `Edit` (only `old_string` → `new_string`, a few lines of context; several changes → several `Edit` calls, never a re-`Write`), then every upload with the usual tool and `source_file: "<absolute path>"` instead of `source_code` (same transport, same `activate` flag). The calls run in the order sent, so each upload sends the edited file. The path must be **absolute** and inside the MCP output directory or the profile work folder (`<project>/.sc4sap/work/<alias>/`); the server refuses anything else, and the plugin's blocklist hook refuses a path it cannot read (it scans the uploaded source as before).
4. **Next fix** → `Edit` the same file and upload, again in one message. Do not fetch again unless someone else may have changed the object (then step 1).

## Rules

- One file per object, kept for the whole run. Never edit a file in `src/` that another run or agent is editing.
- Line endings: keep what the file has. `Edit` matches exact text — copy `old_string` from the file you just read, never from memory.
- `source_code`, `source_file` and `source_patches` are exclusive → the server refuses a mix. Pick one.
- Evidence is unchanged: the evidence ledger hashes the file's text (`source_sha256`, plus `source_file`), the blocklist hook scans it, the tier guard and transport rules apply to the call as before.
- Report nothing new to the user: patch mode is an internal way of uploading, not a deliverable.

## Unit test results

`RunUnitTest` with `result_format: "summary"` returns `run_summary` (method counts plus the failing methods and class-level alerts with their title and first details) instead of the raw XML. Use it wherever only pass / fail and the failure text matter (create-program / create-object verification, fix loops, debugger re-runs). **`/sc4sap:program-test` keeps the default `"full"`**: its verdicts need every method's result, and the ledger never takes a summary run as a program-test result.
