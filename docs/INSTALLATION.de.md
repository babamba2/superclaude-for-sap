# Installation & Setup

← [Zurück zur README](../README.de.md)

## Anforderungen

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-Auto--Installed-FF6600)

| Anforderung | Details |
|-------------|---------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI installiert (Max/Pro-Abo oder API-Key) |
| **SAP-System** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT aktiviert |

> **MCP Server** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)) wird während `/sc4sap:setup` **automatisch installiert und konfiguriert** — keine manuelle Vorabinstallation erforderlich.

## Installation

> **Hinweis** — sc4sap ist **noch nicht im offiziellen Claude Code Plugin-Marketplace**. Fügen Sie dieses Repository vorerst als Custom Marketplace in Claude Code hinzu und installieren Sie das Plugin daraus.

### Option A — Als Custom Marketplace hinzufügen (empfohlen)

Innerhalb einer Claude-Code-Sitzung:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

Für spätere Updates:

```
/plugin marketplace update babamba2/superclaude-for-sap
/plugin install sc4sap
```

### Option B — Aus dem Quellcode installieren

```bash
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

Dann in Claude Code `/plugin marketplace add <lokaler-pfad>` auf das lokale Plugin-Verzeichnis.

## Setup

```bash
# Setup-Skill ausführen — Wizard führt eine Frage nach der anderen
/sc4sap:setup
```

### Unterbefehle

```bash
/sc4sap:setup                # Voller Wizard (Standard)
/sc4sap:setup doctor         # Routet zu /sc4sap:sap-doctor
/sc4sap:setup mcp            # Routet zu /sc4sap:mcp-setup
/sc4sap:setup spro           # Nur SPRO-Konfig-Autoextraktion
/sc4sap:setup customizations # Nur Z*/Y* Enhancement- + Extension-Inventar
```

### Multi-Profile-Architektur (0.6.0+)

sc4sap unterstützt mehrere SAP-Verbindungen (Dev / QA / Prod × N Mandanten) in derselben Claude-Code-Session.

```
~/.sc4sap/                                    ← Home-Verzeichnis (geteilt über Repos)
└── profiles/
    ├── KR-DEV/{sap.env, config.json}         ← ein Profil pro Verbindung
    ├── KR-QA/ {sap.env, config.json}
    └── KR-PRD/{sap.env, config.json}

<project>/.sc4sap/                            ← Projekt-Root (Engagement-Scope)
├── active-profile.txt                        ← "KR-DEV"
└── work/
    ├── KR-DEV/{program, cbo, customizations, ...}
    └── KR-PRD/{...}
```

Das Tier-Enum (`DEV` / `QA` / `PRD`) steuert die Readonly-Durchsetzung: QA/PRD-Profile blockieren `Create*` / `Update*` / `Delete*` in zwei Schichten — einem PreToolUse-Hook (L1, vor der Wire-Request) und dem internen MCP-Server-Guard (L2, nicht umgehbar). QA/PRD-Profile lehnen auch die Installation der ABAP-Utilities in Schritt 9 **ab** — transportieren Sie die Utilities stattdessen per CTS vom passenden DEV-Profil.

Passwörter werden im OS-Keychain gespeichert (Windows Credential Manager / macOS Keychain / Linux libsecret) via `@napi-rs/keyring`. Wenn der Keychain nicht verfügbar ist (headless / Docker / fehlendes Optional-Dep), fällt sc4sap transparent auf Klartext in der Profil-Env zurück und warnt.

Volles Design: [`multi-profile-design.md`](multi-profile-design.md). Artefakt-Auflösungsregeln: [`../common/multi-profile-artifact-resolution.md`](../common/multi-profile-artifact-resolution.md).

### Wizard-Schritte

Der Wizard stellt **eine Frage nach der anderen** — kein kompletter Fragenkatalog auf einmal. Bestehende Profilwerte werden angezeigt, Enter zum Beibehalten.

| # | Schritt | Was passiert |
|---|---------|-------------|
| **0** | **Legacy-Erkennung & Profil-Bootstrap** | Läuft **vor** allen anderen Fragen. Ruft `sap-profile-cli.mjs detect-legacy` auf. Wird ein Pre-0.6.0 `<project>/.sc4sap/sap.env` gefunden → Weiterleitung zur Migration (Alias + Tier erfassen → `sap-profile-cli.mjs migrate` → nach `sap.env.legacy` archivieren → Projekt-`config.json` löschen → `active-profile.txt` auf das neue Profil setzen → weiter ab Schritt 5). Keine Legacy + keine Profile → Neuinstallation ab Schritt 1. Profile bereits vorhanden → Umschalten oder neues Profil anlegen anbieten |
| 1 | **Versionsprüfung** | Claude-Code-Versionskompatibilität verifizieren |
| 2 | **SAP-Version + Branche** | `S4` / `ECC` wählen, ABAP-Release eingeben, Branche aus 15er-Menü wählen. Steuert SPRO-Tabellen / BAPIs / TCodes + ABAP-Syntax-Gating + branchenspezifische Konfigurationsmuster |
| 3 | **MCP-Server installieren** | `abap-mcp-adt-powerup` nach `<PLUGIN_ROOT>/vendor/abap-mcp-adt/` klonen+bauen. Übersprungen wenn bereits installiert (`--update` zum Auffrischen) |
| **4** | **Profilerstellung & SAP-Verbindung** | Erfasst `alias` (`^[A-Z0-9_-]+$`, Konvention `{ISO-COUNTRY}-{TIER}` z. B. `KR-DEV`), `SAP_TIER` (`DEV`/`QA`/`PRD`), optional Same-Company-Meta-Copy, dann Verbindungsfelder (`SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE`) einzeln. Schreiben delegiert an `sap-profile-cli.mjs add` → Profil-Env nach `~/.sc4sap/profiles/<alias>/`, Passwort in OS-Keychain, Zeiger `<project>/.sc4sap/active-profile.txt=<alias>`. `<project>/.sc4sap/sap.env` und `<project>/.sc4sap/config.json` werden **niemals** erstellt |
| 4bis | **RFC-Backend-Auswahl** | `soap` / `native` / `gateway` / `odata` / `zrfc` wählen. Alle `SAP_RFC_*`-Keys landen in der aktiven Profil-Env. Siehe [RFC-Backends](FEATURES.de.md#-rfc-backend-auswahl) |
| 5 | **MCP neu verbinden** | `/mcp` ausführen. Das `ReloadProfile`-Tool des Servers liest Zeiger + Profil-Env (mit Keychain-Auflösung) und erneuert die gecachete Verbindung — kein Neustart von Claude Code nötig |
| 6 | **Verbindung testen** | `GetSession`-Roundtrip gegen SAP |
| 7 | **Systeminfo bestätigen** | System-ID, Mandant, Benutzer, Sprache anzeigen. Nach `~/.sc4sap/profiles/<alias>/config.json → systemInfo` schreiben (nicht in den Projekt-Ordner) |
| 8 | **ADT-Berechtigungsprüfung** | `GetInactiveObjects` zur Verifikation von ADT-Berechtigungen |
| **9** | **ABAP-Utility-Objekte erstellen (Tier-gesichert)** | **Nur DEV.** Installiert `ZMCP_ADT_UTILS` FG + `ZIF_S4SAP_CM` / `ZCL_S4SAP_CM_*` ALV-OOP-Handler (+ OData / ZRFC-Klassen falls in 4bis gewählt). System-Dedup per `SAP_URL + SAP_CLIENT` — ein Sibling-DEV-Profil auf demselben Host verwendet die Installation wieder. Auf **QA / PRD** wird Schritt 9 **abgelehnt** und ein CTS-Import-Leitfaden ausgegeben — Utilities vom passenden DEV-System per Standard-TMS-Route transportieren |
| 10 | **Profil-`config.json` finalisieren** | `sapVersion`, `abapRelease`, `industry`, `activeModules`, `namingConvention`, `blocklistProfile`, `activeTransport` nach `~/.sc4sap/profiles/<alias>/config.json` schreiben. Das Projekt-`.sc4sap/` enthält im Multi-Profile-Modus **keine** `config.json` |
| 11 | **SPRO-Extraktion (optional)** | `y/N` — tokenintensiv; cached nach `<project>/.sc4sap/work/<alias>/spro-config.json`. Spätere Skills nutzen den Cache wieder |
| 11b | **Customizing-Inventar (optional)** | `y/N` — scant `Z*`/`Y*`-Enhancements + Append-Strukturen; schreibt `<project>/.sc4sap/work/<alias>/customizations/{MODULE}/{enhancements,extensions}.json` |
| **12** | **🔒 PreToolUse-Hooks (PFLICHT)** | Installiert **beide** Hooks `block-forbidden-tables.mjs` (Row-Extraction-Guard) UND `tier-readonly-guard.mjs` (Tier-basierter Mutations-Guard) in `.claude/settings.json` via `node scripts/install-hooks.mjs --project`. Smoke-Tests beider. Setup abgeschlossen erst, wenn beide erfolgreich sind |
| 13 | **HUD-Statuszeile** | sc4sap-Statuszeile in `~/.claude/settings.json` registrieren. Nach Neustart zeigt das HUD `{alias} [{tier}] {🔒 if readonly}` + Tokenverbrauch |

> **Defense-in-Depth — drei Enforcement-Schichten**
> - **L1a (Schritt 12, Row-Extraction)** — Claude Code `PreToolUse`-Hook. Profil in `~/.sc4sap/profiles/<alias>/config.json → blocklistProfile`. Lehnt `GetTableContents` / `GetSqlQuery` auf sensiblen Tabellen ab
> - **L1b (Schritt 12, Tier)** — Claude Code `PreToolUse`-Hook. Liest bei jedem Aufruf den `SAP_TIER` des aktiven Profils neu (stateless). Lehnt Mutationen auf QA/PRD ab
> - **L2 (MCP-Server, nicht umgehbar)** — Interner Guard von `abap-mcp-adt-powerup`. Row-Extraction via `sap.env → MCP_BLOCKLIST_PROFILE`; Tier via `@readonly(tier)`-Dekorator, gesetzt bei `ReloadProfile`. Feuert auch wenn die Hooks fehlen oder fehlerhaft konfiguriert sind
>
> L1-Hooks fallen bei IO/Parse-Fehlern OPEN; der L2-MCP-Guard ist immer aktiv. Empfohlene Defaults: L1a `strict`, MCP-Server-Blocklist `standard`.

## Nach dem Setup

### Profilverwaltung

- Aktives System umschalten: `/sc4sap:sap-option switch <alias>` (oder interaktiver Picker — via `AskUserQuestion` mit Tier + Tools-Matrix-Preview)
- Weiteren Mandanten / Tier hinzufügen: `/sc4sap:sap-option add` (Wizard: Alias → Tier → optional Same-Company-Meta-Copy → Verbindung + Keychain-Passwort)
- Profilliste: `/sc4sap:sap-option list` — Alias, Tier-Badge, Host, `●`-Marker für aktives Profil
- Entfernen / rotieren / purgen: `/sc4sap:sap-option remove|edit|purge` — Soft-Delete nach `~/.sc4sap/profiles/.trash/<alias>-<ts>/`, 7-Tage-Auto-Purge
- Tier ist an einem bestehenden Profil unveränderlich — Ändern via remove + add

### Health & Wartung

- Health-Check: `/sc4sap:sap-doctor`
- Credentials rotieren / Branche ändern / L2-MCP-Blocklist anpassen: `/sc4sap:sap-option`
- SPRO neu extrahieren: `/sc4sap:setup spro` (aktives Profil erforderlich)
- Customizing-Inventar erneut ausführen: `/sc4sap:setup customizations` (aktives Profil erforderlich)

### Migrations-Rollback (0.6.0-Upgrade rückgängig)

```bash
mv .sc4sap/sap.env.legacy .sc4sap/sap.env
rm .sc4sap/active-profile.txt
rm -rf ~/.sc4sap/profiles/<alias>
# Falls das Passwort im Keychain gespeichert wurde (kein Plaintext-Fallback):
echo '{"service":"sc4sap","account":"<alias>/<user>"}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/sap-profile-cli.mjs" keychain-delete
```

---

Siehe auch: [Funktionen im Detail →](FEATURES.de.md) · [Changelog →](CHANGELOG.de.md)
