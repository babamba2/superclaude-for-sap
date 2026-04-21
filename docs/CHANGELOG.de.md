# Changelog

← [Zurück zur README](../README.de.md) · [Installation](INSTALLATION.de.md) · [Funktionen](FEATURES.de.md)

Alle nennenswerten Änderungen an sc4sap werden hier dokumentiert. Vollständige Release Notes: [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases).

Das Projekt folgt [Semantic Versioning](https://semver.org/) und dem [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)-Format.

---

## [Unveröffentlicht]

_Keine unveröffentlichten Änderungen._

---

## [0.6.1] - 2026-04-21

### Hinzugefügt
- **`/sc4sap:setup` Multi-Profile-Unterstützung** — Wizard erhält Step 0 (Legacy-Erkennung + Profil-Bootstrap) und einen dedizierten Profil-Erstellungs-Flow (`skills/setup/wizard-step-04-profile-creation.md`). Nutzer mit einer Pre-0.6.0 `<project>/.sc4sap/sap.env` werden automatisch via `sap-profile-cli.mjs migrate` migriert; Neuinstallationen legen ihr erstes Profil unter `~/.sc4sap/profiles/<alias>/` mit OS-Keychain-gestützter Passwort-Speicherung an.
- **Tier-gatetes Step 9** — ABAP-Utility-Installation (`ZMCP_ADT_UTILS`, `ZCL_S4SAP_CM_*`, OData/ZRFC-Klassen) läuft nun nur bei `SAP_TIER=DEV`. QA/PRD-Profile verweigern die Installation und drucken CTS-Import-Guidance; DEV-Installationen werden per `SAP_URL+SAP_CLIENT` über Geschwisterprofile dedupliziert (Sentinel unter `~/.sc4sap/profiles/<alias>/.abap-utils-installed`).
- **Step 12 doppelte PreToolUse-Hooks** — Setup installiert jetzt BEIDE `block-forbidden-tables.mjs` UND `tier-readonly-guard.mjs` in `.claude/settings.json` (projektweit) mit Smoke-Tests für jeden.
- **Geteilter Profil-Resolver** (`scripts/lib/profile-resolve.mjs`) — `resolveSapEnvPath`, `resolveConfigJsonPath`, `resolveArtifactBase`, `readActiveSapEnv`, `readActiveConfigJson`, `readDotenv`, `normalizeTier`. Zentralisiert das active-profile → `~/.sc4sap/profiles/<alias>/` Auflösungsmuster für HUD, Hooks und Skripte.
- **Gap-Plan-Dokument** (`docs/multi-profile-setup-gap.md`) — Schwesterdokument zu `multi-profile-design.md` + `-implementation-plan.md`; hält die 5 Entscheidungen zum Setup-Skill-Retrofit fest.
- **Aktive-Modul-Erkennung** (`common/active-modules.md`) — Cross-Module-Integrationsmatrix. `SAP_ACTIVE_MODULES` Env-Var + `activeModules` in `config.json` steuern nun proaktive Integrationsfeld-Vorschläge in `create-program`, `create-object`, `analyze-cbo-obj` und Consultant-Agenten. Beispiel: MM-Objekt + PS aktiv → automatischer WBS-Feld-Vorschlag (`PS_POSID` / `AUFNR`).
- **Fix #3 `handleUpdateDomain.ts`** — Handler-Property-Namen angeglichen an die snake_case-Erwartungen von `AdtDomain.update()` (`value_table`, `fixed_values`, `conversion_exit`, `sign_exists`). Zuvor silent drop.
- **Fix #4 `core/domain/update.ts`** (mcp-abap-adt-clients) — `patchXmlBlock` ersetzt `patchXmlElementAttribute` für den `<doma:valueTableRef>` Self-Closing-Fall; emittiert jetzt volle `adtcore:uri` + `adtcore:type` + `adtcore:name` Attribute.

### Geändert
- **Artefakt-Pfade im Multi-Profile-Modus** — `extract-spro.mjs`, `extract-customizations.mjs` und konsumierende Skills schreiben nun nach `<project>/.sc4sap/work/<activeAlias>/` statt direkt nach `<project>/.sc4sap/` (siehe `common/multi-profile-artifact-resolution.md`). Legacy-Fallback (kein `active-profile.txt`) bleibt erhalten.
- **`rfc-backend-selection.md`** — alle `SAP_RFC_*` Env-Keys für `soap` / `native` / `gateway` / `odata` / `zrfc`-Backends werden in die aktive Profil-Env (`~/.sc4sap/profiles/<alias>/sap.env`) geschrieben, nie in den Projekt-Ordner. Bootstrap-Reihenfolge-Note für `odata` / `zrfc` bleibt erhalten.
- **`handleCreateTable.ts`** — MANDT-basierte Transparent-Table-Skeleton (`key mandt : mandt not null`) direkt nach Create injiziert; ersetzt das CDS-Style-Default `key client : abap.clnt` des SAP-Backends. Erstanwender laufen nicht mehr auf `ExceptionResourceAlreadyExists` bei UpdateTable.
- **`handleUpdateTable.ts`** — `ddl_code` Schema-Description mit MANDT-Beispiel + Annotations-Preservation-Leitfaden aktualisiert.

### Behoben
- **Passwort-Leak in `sap-profile-cli.mjs list`/`show`** — `passwordRef`-Feld gab das rohe Klartextpasswort aus, wenn die Profil-Env den Plaintext-Fallback nutzte (Keychain nicht verfügbar). Liefert jetzt den Literal `"plaintext (masked)"` für Nicht-Keychain-Werte; `keychain:…`-Refs passieren unverändert.
- **HUD ENV-Status nach Migration** — `sc4sap-status.mjs::sapEnvPresent / readConfig / activeTransport / systemInfo / sproCacheAge` schauten alle ausschließlich nach `<project>/.sc4sap/…`, das nach der Multi-Profile-Migration nicht mehr existiert. Lösen jetzt zuerst über den Active-Profile-Pointer auf, Legacy-Fallback bleibt erhalten.
- **`block-forbidden-tables.mjs` Profil-Mismatch** — Hook meldete den Default `standard` selbst wenn die `config.json` des aktiven Profils etwas anderes sagte, weil nur die gelöschte Legacy-`config.json` gelesen wurde. Liest nun die Config des aktiven Profils.
- **`code-simplifier.mjs`** und **`sap-option-tui.mjs`** — Stop-Hook bzw. standalone-TUI lasen nur Legacy-Projektpfade; lösen nun über den geteilten Profil-Helper auf.

### Dokumentation
- **`INSTALLATION.md` / `.ko.md` / `.ja.md` / `.de.md`** — alle vier Sprachvarianten für das 0.6.0-Multi-Profile-Setup neu geschrieben. Fügt "Multi-Profile-Architektur"-Sektion hinzu, erweitert Wizard-Tabelle von 12 auf 14 Schritte (neuer Step 0 + Step 13 HUD), dokumentiert Drei-Schichten-Verteidigung (L1a Row-Extraction-Hook + L1b Tier-Hook + L2 MCP-Server-Guard), ergänzt Profilverwaltungs- und Rollback-Rezepte nach dem Setup.
- README aufgeteilt — Main-Seite ist jetzt schlank (Kernfunktionen + Autor + Mitwirkende). Installation / Features / Changelog nach `docs/INSTALLATION.md` / `docs/FEATURES.md` / `docs/CHANGELOG.md` (diese Datei) verschoben.

---

## Release-Historie

Ältere Releases siehe [Git-Tag-Historie](https://github.com/babamba2/superclaude-for-sap/tags) und [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases).

### Versionsschema

sc4sap folgt `v{MAJOR}.{MINOR}.{PATCH}`:
- **MAJOR** — Breaking Changes an Skill-API, Config-Schema oder Mindest-SAP/Claude-Code-Version
- **MINOR** — neue Skills, neue Agenten, neue Common-Regeln, rückwärtskompatible Feature-Erweiterungen
- **PATCH** — Bugfixes, reine Dokumentationsänderungen, nicht-breaking Refaktorierungen

### Kompatibilität

- **Claude Code**: >= 2.x
- **Node.js**: >= 20.0.0
- **SAP**: ECC 6.0 / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)
- **MCP-Server**: gebündeltes `abap-mcp-adt-powerup` (auto-installiert durch `/sc4sap:setup`; Version pro Release gepinnt)

---

← [Zurück zur README](../README.de.md)
