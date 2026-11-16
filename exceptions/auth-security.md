# Authentication / Authorization / Security
<!-- tier: minimal -->

User logon data, password hashes, authorization profiles, RFC destinations with embedded credentials, cryptographic material. Extraction of these tables is a direct credential / privilege-escalation risk.

| Table | Description | Why |
|-------|-------------|-----|
| USR02 | User master — logon | **Password hashes** — NEVER extract |
| USH02 | Password change history | Historical password hashes |
| USRBF2 | User buffer — auth values | Auth value cache |
| USR01 | User master — runtime | Logon metadata |
| USR04 | User master auth profile buffer | Auth profiles |
| USR10 | User auth profiles | Profile assignments |
| USR12 | Auth values | Auth field values |
| USR21 | User → BP/address link | Identity linkage |
| USR22 | Logon data (extra) | Login details |
| USR40 | Prohibited passwords | Security policy |
| USR41 | Multi-logon | Session data |
| USR_CUST | User-specific customizing | Personal settings |
| AGR_1251 | Authorization data for roles | Auth field-value combos |
| AGR_USERS | User-role assignment | Role PII linkage |
| AGR_AGRS | Composite role contents | Role config |
| AGR_1016 | Role → generated profile | Profile generation state — opened only by the role-matrix triage script |
| AGR_TIMEB | Role change / generation times | Admin user names — opened only by the role-matrix triage script (user fields never read) |
| PRGN_CUST | PFCG customizing | Auth system config |
| RFCDES | RFC destinations | **Embedded RFC passwords/secrets** |
| RSECACTB / RSECTAB | Secure Store keys | Crypto key material |
| SNCSYSACL | SNC access list | Security policy |
| SSF_PSE_D | PSE / X.509 data | Crypto material |

### Related Standard CDS Views

| View | Wraps | Why |
|------|-------|-----|
| I_User | USR02 / USR21 | User master (do NOT extract) |
| I_UserAuthorization | AGR_1251 / USR12 | Auth values |
| I_UserRole | AGR_USERS | Role assignments |
| I_UserInfo | USR01 / USR21 | User metadata |
