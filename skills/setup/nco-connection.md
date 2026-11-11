# RFC over SAP .NET Connector (NCo) — `nco`

Referenced by `rfc-backend-selection.md` when the user picks `3) nco`. Windows only.

The MCP server reaches SAP over RFC through SAP .NET Connector (NCo 3.x) instead of HTTPS:

- `SAP_RFC_BACKEND=nco` — the sc4sap helper FMs (`ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL`, the DDIC FMs, business actions) are called over RFC. No OData service (Step 9c) and no SOAP ICF node.
- `SAP_CONNECTION_TYPE=nco` (optional, second question) — the ADT requests themselves go over RFC too (standard FM `SADT_REST_RFC_ENDPOINT`, the same path Eclipse ADT uses through JCo). The system then needs no HTTP access at all, only the RFC gateway port (`33<sysnr>`).

`odata` / `soap` and the HTTP connection stay unchanged; NCo runs only on a profile that sets these values.

## Preflight (run before writing the keys)

1. `process.platform` is `win32`. Otherwise stop: "NCo needs Windows — pick odata or soap".
2. NCo 3.x is in the GAC: `C:\Windows\Microsoft.NET\assembly\GAC_64\sapnco\` or `GAC_32\sapnco\` holds a `v4.0_3.*` folder with `sapnco.dll` (and `sapnco_utils\` next to it). SAP GUI usually installs the 32-bit one. Missing → tell the user to install "SAP Connector for Microsoft .NET 3.1 for .NET Framework 4.x" from the SAP Support Portal (it is SAP-licensed; sc4sap never ships it), then re-run this step.
3. Gateway port reachable: TCP connect to `<app server host>:33<sysnr>` within 3 s (PowerShell `System.Net.Sockets.TcpClient`). Closed → the firewall / VPN blocks RFC; offer odata / soap instead.

The bridge program (`nco-bridge.exe`) is compiled on first use with the `csc.exe` of .NET Framework 4.x against the installed NCo — nothing to download.

## Keys (one question each, written to the active profile `sap.env`)

```
SAP_RFC_BACKEND=nco
SAP_CONNECTION_TYPE=nco   # only when the user also wants ADT over RFC
SAP_NCO_SYSNR=00          # system number; default derived from the SAP_URL port 80XX → XX
SAP_NCO_ASHOST=           # only when the app server host differs from the SAP_URL host
                          # (web dispatcher, load balancer)
```

`SAP_CLIENT`, `SAP_USERNAME`, `SAP_PASSWORD` (keychain reference allowed) and `SAP_LANGUAGE` from Step 4 are reused for the RFC logon. Direct application-server logon only (no message server, SAProuter or SNC).

## SAP side

- `ZMCP_ADT_DISPATCH` must contain the action `FM_PROXY` (current `abap/zmcp_adt_dispatch*.abap`, Step 9a). The FMs that are not remote-enabled (DDIC reads, `ZMCP_ADT_DDIC_TTYP`, `ZMCP_ADT_DDIC_BADI`, `ZMCP_WL_*`) are called through it. An older dispatcher answers "Unknown action: FM_PROXY" — reinstall it via Step 9a.
- Authorization: `S_RFC` for function groups `SADT_REST` (when `SAP_CONNECTION_TYPE=nco`), `ZMCP_ADT_UTILS`, `ZMCP_BIZ`, `ZMCP_WL`, `SYST` (RFC_PING).
- Step 9c (OData classes) is skipped for `nco`.

## Verify

After the MCP restart (Step 5), `/sc4sap:sap-doctor` Layer 6.nco runs the RFC checks.
