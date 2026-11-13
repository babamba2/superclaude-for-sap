# Remote read destinations

Companion to [`SKILL.md`](SKILL.md) → `<Remote_Destinations>`.

`GetRemoteTableContents` reads rows of one table in another SAP system through an SM59 ABAP destination (type 3) of the connected system, with the standard `RFC_READ_TABLE`. The MCP server saves each destination after its first successful read in the active profile's `config.json` → `remoteDestinations` (array of strings, most recent first, max 10). A failed read never adds an entry, so typos stay out of the list.

The tool never guesses a destination. Called without one, it returns this list so the agent can ask the user.

## Status panel row

`Remote destinations: <names joined by ", " | (none)>` — from `config.json` → `remoteDestinations`. Show `(none)` when the key is missing or empty.

## Edit flow

1. Read `~/.sc4sap/profiles/<alias>/config.json` (legacy: `<project>/.sc4sap/config.json`). Show the list numbered, most recent first.
2. Offer, via `AskUserQuestion`:
   - **Remove** one or more entries.
   - **Move to top** — the first entry is the one the agent offers first.
   - **Clear all**.
   - **Add** a name — warn that it is not checked here; the first successful read proves it. Prefer letting the tool save it.
3. Write `config.json` back keeping every other key unchanged (read → change `remoteDestinations` only → write). Keep at most 10 entries.
4. Summarize the change and the absolute path edited. No MCP restart is needed — the server reads the file on each call.

## Validation

- SM59 names are case-sensitive: store them exactly as the user typed them. Trim whitespace.
- Max 32 characters (`RFCDEST`); reject empty names and duplicates.

## Notes for the user

- The connected system needs the `REMOTE_READ` action in `ZMCP_ADT_DISPATCH` (sc4sap `abap/zmcp_adt_dispatch.abap` / `_ecc.abap`). Without it the tool returns an upload hint.
- The RFC user of the destination needs `S_TABU_DIS` / `S_TABU_NAM` in the remote system for the tables read.
- Rows are real data: mask personal fields before using them as test data. The table blocklist applies as for `GetTableContents`.
- Filter on key / indexed fields. A non-indexed condition on a large remote table can run past the client timeout while the remote work process keeps running.
