[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | Deutsch

# SuperClaude for SAP (sc4sap)

> Claude-Code-Plugin für die SAP-ABAP-Entwicklung — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)

[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Was ist sc4sap?

SuperClaude for SAP verwandelt Claude Code in einen vollwertigen SAP-Entwicklungsassistenten. Es verbindet sich mit Ihrem SAP-System über den [MCP-ABAP-ADT-Server](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ Werkzeuge) und kann ABAP-Objekte direkt anlegen, lesen, ändern und löschen — Klassen, Funktionsbausteine, Reports, CDS-Views, Dynpros, GUI-Status und mehr.

### Kernfunktionen

| Fähigkeit | Was sie leistet | Skill |
|------------|--------------|-------|
| **🔌 Automatische MCP-Installation** | `abap-mcp-adt-powerup` wird beim Setup automatisch installiert, konfiguriert und die Verbindung getestet. Keine manuelle MCP-Verdrahtung, kein Editieren der `claude_desktop_config.json` — Zugangsdaten landen in `.sc4sap/sap.env`, und die Hook-/Blocklist-Schichten registrieren sich selbst. | `/sc4sap:setup` |
| **🏗️ Formatierter Auto-Programm-Maker** | Erstellt ABAP-Programme durchgängig nach sc4sap-Konventionen: Main + konditionale Includes (t/s/c/a/o/i/e/f/_tst), OOP- oder prozeduraler Split (`LCL_DATA` / `LCL_ALV` / `LCL_EVENT`), volles ALV (CL_GUI_ALV_GRID + Docking) oder SALV, verpflichtende Text-Elemente & CONSTANTS, Dynpro + GUI-Status, ABAP-Unit-Tests — alles plattform-aware (ECC / S4 On-Prem / Cloud). | `/sc4sap:create-program`, `/sc4sap:autopilot` |
| **🔍 Programm-Analyse** | Intelligenz in Gegenrichtung: beliebiges ABAP-Objekt über MCP einlesen, Clean-ABAP-/Performance-/Security-Review laufen lassen oder ein Programm als Fach-/Technische Spezifikation (Markdown oder Excel) mit sokratischem Scope-Narrowing reverse-engineeren. | `/sc4sap:analyze-code`, `/sc4sap:program-to-spec` |
| **🩺 Wartungsdiagnose** | Operative Triage-Schleife: ST22-Dumps, SM02-Systemmeldungen, /IWFND/ERROR_LOG-Gateway-Errors, SAT-ähnliche Profiler-Traces, Logs und Where-Used-Graphen direkt aus Claude inspizieren; Hypothesen eingrenzen, SAP-Note-Kandidaten aufzeigen und Plugin- / MCP- / SAP-Konnektivität diagnostizieren. | `/sc4sap:analyze-symptom`, `/sc4sap:sap-doctor` |
| **♻️ CBO-Reuse (Brownfield-Beschleuniger)** | Ein Customer-Business-Object-(Z-)Paket einmal inventarisieren — häufig verwendete Z-Tabellen / FMs / Datenelemente / Klassen / Strukturen / Tabellentypen katalogisieren und nach `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` persistieren. `create-program` / `program-to-spec` laden das Inventar zur Planungszeit und **bevorzugen die Wiederverwendung bestehender CBO-Assets gegenüber Duplikaten** — essenziell für Brownfield-Systeme mit Hunderten von Legacy-Z-Objekten. | `/sc4sap:analyze-cbo-obj` → `/sc4sap:create-program` |
| **🏭 Branchenkontext** | 14 Branchen-Referenzdateien (`industry/*.md`) — Retail, Fashion, Cosmetics, Tire, Automotive, Pharmaceutical, Food-Beverage, Chemical, Electronics, Construction, Steel, Utilities, Banking, Public-Sector. Consultants laden die branchenspezifische Datei des Projekts, um bei Konfigurationsanalyse, Fit-Gap oder Stammdatenentscheidungen geschäftsspezifische Muster, Fallstricke und SAP-IS-Mappings anzuwenden. | Alle Consultants |
| **🌏 Länder / Lokalisierung** | 15 Länderdateien + `eu-common.md` (KR, JP, CN, US, DE, GB, FR, IT, ES, NL, BR, MX, IN, AU, SG, EU-common). Deckt Datums-/Zahlenformate, VAT/GST-Struktur, verpflichtende E-Invoicing (SDI / SII / MTD / CFDI / NF-e / 세금계산서 / Golden Tax / IRN / Peppol / STP), Bankformate (IBAN / BSB / CLABE / SPEI / PIX / UPI / SEPA / Zengin …), Payroll-Lokalisierung und gesetzliche Meldefristen ab. Pflicht für Analyst / Critic / Planner; in jeden Consultant verdrahtet. | Alle Consultants + Analyst / Critic / Planner |
| **🤝 Modul-Konsultation** | `sap-analyst`, `sap-critic`, `sap-planner` und `sap-architect` geben einen `## Module Consultation Needed`-Block aus, sobald die Frage von modulspezifischer Geschäftseinschätzung abhängt (Preisfindung, Kopiersteuerung, MRP, Charge, Payroll…) → delegiert an `sap-{module}-consultant`. Systemweite Themen → `sap-bc-consultant`. Erfindet nichts aus allgemeinem SAP-Wissen. | Analyst / Critic / Planner / Architect |

## Voraussetzungen

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-Auto--Installed-FF6600)

| Voraussetzung | Details |
|-------------|---------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI installiert (Max/Pro-Abo oder API-Key) |
| **SAP-System** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT aktiviert |

> **MCP-Server** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)) wird während `/sc4sap:setup` **automatisch installiert und konfiguriert** — keine manuelle Vorinstallation nötig.

## Installation

> **Hinweis** — sc4sap ist **noch nicht im offiziellen Claude-Code-Plugin-Marketplace**. Fügen Sie bis dahin dieses Repository als Custom-Marketplace in Claude Code hinzu und installieren Sie das Plugin von dort.

### Option A — Als Custom-Marketplace hinzufügen (empfohlen)

In einer Claude-Code-Sitzung ausführen:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

Spätere Aktualisierung:

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

Anschließend Claude Code per `/plugin marketplace add <local-path>` auf das lokale Plugin-Verzeichnis zeigen lassen.

## Einrichtung

```bash
# Setup-Skill starten — führt Sie Frage für Frage durch den Assistenten
/sc4sap:setup
```

### Subcommands

```bash
/sc4sap:setup                # kompletter Wizard (Default)
/sc4sap:setup doctor         # leitet zu /sc4sap:sap-doctor weiter
/sc4sap:setup mcp            # leitet zu /sc4sap:mcp-setup weiter
/sc4sap:setup spro           # nur SPRO-Config-Auto-Extraktion
/sc4sap:setup customizations # nur Z*/Y*-Enhancement-+-Extension-Inventar
```

### Wizard-Schritte

Der Wizard stellt **immer nur eine Frage auf einmal** — kippt nie den ganzen Fragebogen aus. Bestehende Werte in `.sc4sap/sap.env` / `.sc4sap/config.json` werden angezeigt, sodass Sie mit Enter den Wert beibehalten können.

| # | Schritt | Was passiert |
|---|------|--------------|
| 1 | **Versionsprüfung** | Kompatibilität der Claude-Code-Version prüfen |
| 2 | **SAP-Systemversion + Branche** | (a) `S4` (S/4HANA — BP, MATDOC, ACDOCA, Fiori, CDS) oder `ECC` (ECC 6.0 — XK01/XD01, MKPF/MSEG, BKPF/BSEG) wählen. (b) **ABAP-Release** eingeben (z. B. `750`, `756`, `758`). (c) **Branche** aus einem 15-Punkte-Menü wählen (retail / fashion / cosmetics / tire / automotive / pharmaceutical / food-beverage / chemical / electronics / construction / steel / utilities / banking / public-sector / other) — Consultants laden die passende `industry/*.md`. Steuert SPRO-Tabellen / BAPIs / TCodes + ABAP-Syntax-Gating + branchenspezifische Konfigurationsmuster |
| 3 | **MCP-Server installieren** | `abap-mcp-adt-powerup` nach `<PLUGIN_ROOT>/vendor/abap-mcp-adt/` klonen + bauen. Übersprungen, wenn bereits installiert (`--update` zum Aktualisieren) |
| 4 | **SAP-Verbindung** | Ein Feld pro Frage — `SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE` (`basic` / `xsuaa`), `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE` (`onprem` / `cloud`), `SAP_VERSION`, `ABAP_RELEASE`, `TLS_REJECT_UNAUTHORIZED` (nur dev). Wird in `.sc4sap/sap.env` geschrieben. Optionale L4-MCP-Server-Blocklist-Variablen (`MCP_BLOCKLIST_PROFILE`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`) werden als auskommentierte Beispiele geschrieben |
| 5 | **MCP neu verbinden** | Aufforderung, `/mcp` auszuführen, damit der neu installierte Server startet |
| 6 | **Verbindungstest** | `GetSession`-Round-Trip gegen SAP |
| 7 | **Systeminfo bestätigen** | Zeigt System-ID, Mandant, Benutzer |
| 8 | **ADT-Berechtigungsprüfung** | `GetInactiveObjects`, um ADT-Rechte zu verifizieren |
| 9 | **`ZMCP_ADT_UTILS` anlegen** | Pflicht-Utility-Funktionsgruppe (Paket `$TMP`, nur lokal). Legt `ZMCP_ADT_DISPATCH` (Screen-/GUI-Status-Dispatcher) und `ZMCP_ADT_TEXTPOOL` (Text-Pool R/W) an — beide **RFC-fähig** und aktiviert. Übersprungen, wenn die FG bereits existiert |
| 10 | **`config.json` schreiben** | Plugin-seitige Config mit `sapVersion` + `abapRelease` (synchron mit `sap.env`) |
| 11 | **SPRO-Extraktion (optional)** | Abfrage `y/N` — Erstextraktion ist token-intensiv, aber der entstehende `.sc4sap/spro-config.json`-Cache reduziert künftigen Token-Verbrauch dramatisch. Überspringen ist OK; statische `configs/{MODULE}/*.md`-Referenzen funktionieren weiterhin. Läuft modul-parallel über `scripts/extract-spro.mjs` |
| 11b | **🆕 Customization-Inventar (optional)** | Abfrage `y/N` — parst `configs/{MODULE}/enhancements.md` jedes Moduls, fragt danach live in SAP ab, welche Standard-Exits der Kunde tatsächlich mit `Z*`/`Y*`-Objekten implementiert hat. Schreibt `.sc4sap/customizations/{MODULE}/{enhancements,extensions}.json`. Strikte Persistenzregeln: BAdI nur, wenn eine Z-Impl existiert; SMOD nur, wenn ein Z-CMOD-Projekt sie einschließt; **GGB0 / GGB1 Substitutions + Validations + Rules** (aus `GB03`, pro Modul-`APPLAREA`); **BTE Publish/Subscribe + Process FMs** (aus `TBE24` / `TPS34`, per `APPL` — FI/CO/PS/TR/AA/PM/SD/HCM); Append-Strukturen + Custom Fields landen separat in `extensions.json`. Verbraucht von `/sc4sap:create-program` (Reuse-first) und `/sc4sap:analyze-symptom` (Standard-Exit-Herkunft) — sodass ein Agent eine bestehende `ZGL0001`-Substitution oder einen `Z_BTE_1025_*`-Subscriber-FM erweitert, statt parallel einen neuen BAdI anzulegen. Läuft modul-parallel über `scripts/extract-customizations.mjs` |
| 12 | **🔒 Blocklist-Hook (PFLICHT)** | **(a)** Profil wählen — `strict` (Default, alles) / `standard` (PII + Credentials + HR + transaktionale Finanzdaten) / `minimal` (nur PII + Credentials + HR + Tax) / `custom` (User-Liste in `.sc4sap/blocklist-custom.txt`). **(b)** Installation via `node scripts/install-hooks.mjs` (User-Ebene) oder `--project` (Projekt-Ebene). **(c)** Smoke-Test mit einem BNKA-Payload, `permissionDecision: deny` erwartet. **(d)** Finalen Hook-Eintrag + Extend-/Custom-Datei-Status drucken. Das Setup schließt nur ab, wenn dies gelingt |

> **Zwei Blocklist-Schichten, getrennt konfiguriert**
> - **L3 (Schritt 12)** — Claude Code `PreToolUse`-Hook, Profil in `.sc4sap/config.json` → `blocklistProfile`. Greift in jeder Claude-Code-Sitzung, unabhängig vom MCP-Server.
> - **L4 (Schritt 4, optional)** — interner Guard des MCP-Servers, Profil in `sap.env` → `MCP_BLOCKLIST_PROFILE`. Greift nur für `abap-mcp-adt-powerup`.
>
> Typisch: L3 `strict`, L4 `standard`. L3 ändern durch erneutes `/sc4sap:setup`; L4 ändern via `/sc4sap:sap-option`.

### Nach dem Setup

- Health prüfen: `/sc4sap:sap-doctor`
- Credentials rotieren / L4-Blocklist anpassen: `/sc4sap:sap-option`
- SPRO später neu extrahieren: `/sc4sap:setup spro`

## Features

### 25 SAP-spezialisierte Agents

| Kategorie | Agents |
|----------|--------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — Systemadministration, Transportmanagement, Diagnose |
| **Module (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**Delegations-Map (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → geben `## Module Consultation Needed` aus → `sap-{module}-consultant` (fachliche Semantik) oder `sap-bc-consultant` (systemweit)
- `sap-architect` → gibt `## Consultation Needed` aus → `sap-bc-consultant` für Basis-Themen (Transportstrategie, Berechtigungen, Performance, Sizing, Systemkopie, Patching) oder `sap-{module}-consultant` für modul-spezifische Design-Fragen
- `sap-analyst` / `sap-critic` / `sap-planner` haben zusätzlich einen **verpflichtenden Country-Context-Block**, der das Laden von `country/<iso>.md` vor der Ausgabe erzwingt
- **Direkter MCP-Lesezugriff für Core-Agents** — `sap-analyst`, `sap-architect`, `sap-code-reviewer`, `sap-critic`, `sap-debugger`, `sap-doc-specialist`, `sap-planner`, `sap-qa-tester`, `sap-writer` tragen jetzt Read-only-MCP-Tools (Paket / DDIC / Klasse / Programm / Where-Used / Runtime-Dump) und prüfen SAP-Objekte direkt statt über Hand-off. Schreib-CRUD bleibt bei `sap-executor`, `sap-planner`, `sap-writer`, `sap-qa-tester`, `sap-debugger`.

### 18 Skills

| Skill | Beschreibung |
|-------|-------------|
| `sc4sap:setup` | Plugin-Setup — installiert `abap-mcp-adt-powerup` automatisch, generiert SPRO-Config, installiert Blocklist-Hook |
| `sc4sap:mcp-setup` | Standalone-Anleitung zur MCP-ABAP-ADT-Server-Installation / -Rekonfiguration |
| `sc4sap:sap-option` | `.sc4sap/sap.env` ansehen / bearbeiten (Credentials, RFC-Backend, Blocklist-Profil, Whitelists) |
| `sc4sap:sap-doctor` | Plugin- + MCP- + SAP-Verbindungsdiagnose (6 Schichten inkl. RFC-Backend) |
| `sc4sap:create-object` | ABAP-Objektanlage (Hybrid-Modus — Transport + Paket bestätigen, anlegen, aktivieren) |
| `sc4sap:create-program` | Vollständige ABAP-Programm-Pipeline — Main+Include, OOP/Prozedural, ALV, Dynpro, Text-Elemente, ABAP-Unit |
| `sc4sap:program-to-spec` | ABAP-Programm zu Fach-/Technischer Spezifikation (Markdown / Excel) reverse-engineeren |
| `sc4sap:analyze-code` | ABAP-Code-Analyse & Verbesserung (Clean ABAP / Performance / Security) |
| `sc4sap:analyze-cbo-obj` | **Customer-Business-Object (CBO) Inventar** — Z-Paket scannen, häufig genutzte Z-Tabellen / FMs / Datenelemente / Klassen / Strukturen / Tabellentypen katalogisieren; persistiert nach `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`, damit `create-program` / `program-to-spec` bestehende CBO-Assets bevorzugt wiederverwenden statt neue zu erzeugen |
| `sc4sap:analyze-symptom` | Schrittweise Analyse operativer SAP-Fehler/Symptome (Dumps, Logs, SAP-Note-Kandidaten) |
| `sc4sap:autopilot` | Vollautomatische Pipeline — Idee → aktivierter, getesteter ABAP |
| `sc4sap:ralph` | Persistente Selbstkorrektur-Schleife, bis Syntax sauber + Aktivierung + Unit-Tests bestehen |
| `sc4sap:ralplan` | Konsensbasiertes Planungs-Gate (Analyst / Architect / Critic-Konvergenz) |
| `sc4sap:deep-interview` | Sokratische Anforderungserfassung vor der Implementierung |
| `sc4sap:team` | Koordinierte parallele Agent-Ausführung (native Claude-Code-Teams) |
| `sc4sap:release` | CTS-Transport-Release-Workflow (validieren, freigeben, Import-Monitor) |

### MCP-ABAP-ADT-Server — Einzigartige Fähigkeiten

sc4sap basiert auf **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)**, einem erweiterten ADT-MCP-Server (150+ Werkzeuge). Über das übliche Class / Program / Table / CDS / Function-Module-CRUD hinaus, das Standard-ADT-MCPs bieten, ergänzt es **vollständige Read / Update / Create-Abdeckung für klassische Dynpro-Artefakte**, die die meisten MCP-Server nicht unterstützen:

| Artefakt | Read | Create | Update | Delete | Hinweise |
|----------|------|--------|--------|--------|-------|
| **Screen (Dynpro)** | `GetScreen`, `ReadScreen`, `GetScreensList` | `CreateScreen` | `UpdateScreen` | `DeleteScreen` | Vollständiger Dynpro-Header + Flow-Logic-Round-Trip in MCP-JSON (Großschrift-Keys `HEADER` / `FLOW_LOGIC` / `LINE`) |
| **GUI Status** | `GetGuiStatus`, `ReadGuiStatus`, `GetGuiStatusList` | `CreateGuiStatus` | `UpdateGuiStatus` | `DeleteGuiStatus` | Menüleiste, Funktionstasten, Application Toolbar — programmatisch anlegen und bearbeiten |
| **Text-Element** | `GetTextElement` | `CreateTextElement` | `UpdateTextElement` | `DeleteTextElement` | Textsymbole, Selektionstexte, Listenüberschriften — benötigt für die Text-Element-Pflichtregel |
| **Includes** | `GetInclude`, `GetIncludesList` | `CreateInclude` | `UpdateInclude` | `DeleteInclude` | Von der Main+Include-Konvention genutzt |
| **Local defs/macros/tests/types** | `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes` | — | `UpdateLocalDefinitions`, `UpdateLocalMacros`, `UpdateLocalTestClass`, `UpdateLocalTypes` | `DeleteLocal*` | Programminterne Local-Abschnitte unabhängig bearbeitbar |
| **Metadata Extension (CDS)** | `GetMetadataExtension` | `CreateMetadataExtension` | `UpdateMetadataExtension` | `DeleteMetadataExtension` | Fiori-/UI-Annotationsschicht über CDS |
| **Behavior Definition / Implementation (RAP)** | `Get/Read BehaviorDefinition`, `Get/Read BehaviorImplementation` | `Create*` | `Update*` | `Delete*` | Vollständiger RAP-BDEF-+-BHV-Zyklus |
| **Service Definition / Binding** | `Get/Read ServiceDefinition`, `Get/Read ServiceBinding`, `ListServiceBindingTypes`, `ValidateServiceBinding` | `Create*` | `Update*` | `Delete*` | OData-V2/V4-Bereitstellung und Validierung |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | — | — | — | Auffinden von Erweiterungspunkten |
| **Runtime & Profiling** | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`, `RuntimeCreateProfilerTraceParameters`, `RuntimeRunProgramWithProfiling`, `RuntimeRunClassWithProfiling` | — | — | — | ST22-Dump-Analyse + SM02-Systemmeldungen + /IWFND/ERROR_LOG-Gateway-Errors + SAT-artiges Profiling komplett aus Claude heraus |
| **Semantik / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetAdtTypes`, `GetTypeInfo`, `GetWhereUsed` | — | — | — | Reichere Analyse als reine Syntaxprüfung |
| **Unit-Tests (ABAP + CDS)** | `GetUnitTest`, `GetUnitTestResult`, `GetUnitTestStatus`, `GetCdsUnitTest`, `GetCdsUnitTestResult`, `GetCdsUnitTestStatus` | `CreateUnitTest`, `CreateCdsUnitTest` | `UpdateUnitTest`, `UpdateCdsUnitTest` | `DeleteUnitTest`, `DeleteCdsUnitTest` | ABAP-Unit und CDS-Test-Framework |
| **Transport** | `GetTransport`, `ListTransports` | `CreateTransport` | — | — | Vollständiger Transport-Lebenszyklus im MCP |

Insbesondere Dynpro- / GUI-Status- / Text-Element-CRUD ermöglicht es der klassischen UI-Pipeline von sc4sap (`sc4sap:create-program` mit ALV + Docking + Selektionsbild), vollständig KI-gesteuert durchzulaufen — ein Szenario, das die meisten ADT-MCP-Server nicht abdecken können.

### Gemeinsame Konventionen (`common/`)

Übergreifende Autorenregeln liegen in `common/`, sodass jeder Skill und Agent demselben Spielplan folgt, ohne Text zu duplizieren. `CLAUDE.md` ist ein schlanker **Index**, der diese Dateien referenziert (kein Duplikat); Agents laden die Detailregeln bei Bedarf.

| Datei | Inhalt |
|------|--------|
| `common/clean-code.md` | **Konsolidierte Clean-ABAP-Standards** — Naming, Kontrollfluss, Open SQL, Modularisierung, Tests, Performance, Security, Versions-Awareness + Self-Check-Checkliste |
| `common/include-structure.md` | Main-Programm + konditionales Include-Set (t/s/c/a/o/i/e/f/_tst) |
| `common/oop-pattern.md` | Zwei-Klassen-OOP-Split (`LCL_DATA` + `LCL_ALV` + optional `LCL_EVENT`) |
| `common/alv-rules.md` | Full ALV (CL_GUI_ALV_GRID + Docking-Container) vs SALV + SALV-Factory-Fieldcatalog-Muster |
| `common/text-element-rule.md` | Text-Elemente verpflichtend — keine hartcodierten Anzeige-Literale; **Zwei-Pass-Sprachregel** (primäre Anmeldesprache + `'E'`-Sicherheitsnetz werden IMMER gemeinsam angelegt; fehlender Pass = MAJOR-Review-Befund) |
| `common/constant-rule.md` | `CONSTANTS` verpflichtend für Magic-Literale außerhalb des Fieldcatalogs |
| `common/procedural-form-naming.md` | `_{screen_no}`-Suffix für ALV-gebundene FORMs |
| `common/naming-conventions.md` | Gemeinsames Naming für Programme, Includes, LCL_*, Screens, GUI-Status |
| `common/sap-version-reference.md` | ECC- vs S/4HANA-Unterschiede (Tabellen, TCodes, BAPIs, Muster) |
| `common/abap-release-reference.md` | ABAP-Syntax-Verfügbarkeit je Release (Inline-Deklaration, Open-SQL-Ausdrücke, RAP, …) |
| `common/spro-lookup.md` | SPRO-Lookup-Priorität — Local Cache → statische Docs → MCP-Query |
| `common/data-extraction-policy.md` | Agent-seitiges Refusal-Protokoll + **`acknowledge_risk`-HARD-RULE** (explizite pro-Request-User-Zustimmung erforderlich) |

### Branchen-Referenz (`industry/`)

Pro-Branche-Dateien mit Geschäftsmerkmalen — von jedem `sap-*-consultant` vor Konfigurationsanalyse, Fit-Gap oder Stammdatenentscheidungen konsultiert. Jede Datei behandelt **Business Characteristics / Key Processes / Master Data Specifics / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**.

| Datei | Branche |
|------|----------|
| `industry/retail.md` | Retail (Article, Site, POS, Assortment) |
| `industry/fashion.md` | Fashion / Apparel (Style × Color × Size, AFS/FMS) |
| `industry/cosmetics.md` | Cosmetics (Batch, Shelf Life, Channel Pricing) |
| `industry/tire.md` | Tire (OE/RE, Mixed Mfg, Mold, Recall) |
| `industry/automotive.md` | Automotive (JIT/JIS, Scheduling Agreement, PPAP) |
| `industry/pharmaceutical.md` | Pharmaceutical (GMP, Serialization, Batch Status) |
| `industry/food-beverage.md` | Food & Beverage (Catch Weight, FEFO, TPM) |
| `industry/chemical.md` | Chemical (Process, DG, Formula Pricing) |
| `industry/electronics.md` | Electronics / High-Tech (VC / AVC, Serial, RMA) |
| `industry/construction.md` | Construction / E&C (PS, POC Billing, Subcontracting) |
| `industry/steel.md` | Steel / Metals (Characteristic-based inventory, Coil, Heat) |
| `industry/utilities.md` | Utilities (IS-U, FI-CA, Device Mgmt) |
| `industry/banking.md` | Banking (FS-CD, FS-BP, Parallel Ledger) |
| `industry/public-sector.md` | Public Sector (Funds Mgmt, Grants Mgmt, Budget Control) |

### Länder- / Lokalisierungs-Referenz (`country/`)

Pro-Land-Regeln zu rechtlichen Anforderungen — von jedem Consultant konsultiert (**verpflichtend** für Analyst / Critic / Planner). Jede Datei behandelt **Formate (Datum / Zahl / Währung / Telefon / Postleitzahl / Zeitzone) / Sprache & Locale / Steuersystem / E-Invoicing / Fiskalberichterstattung / Banking & Payments / Stammdaten-Besonderheiten / Statutory Reporting / SAP-Länderversion / Common Customizations / Pitfalls**.

| Datei | Land | Wichtige Besonderheiten |
|------|---------|-------------------|
| `country/kr.md` | 🇰🇷 Korea | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII-Regeln |
| `country/jp.md` | 🇯🇵 Japan | Qualified Invoice System (2023+), Zengin, 法人番号 |
| `country/cn.md` | 🇨🇳 China | Golden Tax, 发票 / e-fapiao, 统一社会信用代码, SAFE FX |
| `country/us.md` | 🇺🇸 USA | Sales & Use Tax (kein VAT), EIN, 1099, ACH, Nexus-Regeln |
| `country/de.md` | 🇩🇪 Deutschland | USt, ELSTER, DATEV, XRechnung / ZUGFeRD E-Rechnung, SEPA |
| `country/gb.md` | 🇬🇧 UK | VAT + MTD, BACS / FPS / CHAPS, Post-Brexit (GB vs XI) |
| `country/fr.md` | 🇫🇷 Frankreich | TVA, FEC, Factur-X 2026, SIREN/SIRET |
| `country/it.md` | 🇮🇹 Italien | IVA, FatturaPA / SDI (Pflicht seit 2019), Split Payment |
| `country/es.md` | 🇪🇸 Spanien | IVA, SII (Echtzeit 4 Tage), TicketBAI, Confirming |
| `country/nl.md` | 🇳🇱 Niederlande | BTW, KvK, Peppol, XAF, G-rekening |
| `country/br.md` | 🇧🇷 Brasilien | NF-e, SPED, CFOP, ICMS/IPI/PIS/COFINS, Boleto / PIX |
| `country/mx.md` | 🇲🇽 Mexiko | CFDI 4.0, SAT, Complementos, Carta Porte, SPEI |
| `country/in.md` | 🇮🇳 Indien | GST (CGST/SGST/IGST), IRN-E-Invoice, e-Way Bill, TDS |
| `country/au.md` | 🇦🇺 Australien | GST, ABN, STP Phase 2, BAS, BSB-Banking |
| `country/sg.md` | 🇸🇬 Singapur | GST 9%, UEN, InvoiceNow (Peppol), PayNow |
| `country/eu-common.md` | 🇪🇺 EU-weit | VAT-ID-Format je Land (VIES), INTRASTAT, ESL, OSS/IOSS, SEPA, DSGVO |

Aktives Land aus `.sc4sap/config.json` → `country` (oder `sap.env` → `SAP_COUNTRY`, ISO-Alpha-2 lowercase) bestimmen. Bei Multi-Country-Rollouts werden alle relevanten Dateien geladen und länderübergreifende Touchpoints (Intra-EU-VAT, Intercompany, Transfer Pricing, grenzüberschreitende Quellensteuer) herausgestellt.

### SAP-Plattform-Awareness (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` läuft vor allem anderen durch einen obligatorischen **SAP-Version-Preflight**, der `.sc4sap/config.json` auf `sapVersion` (ECC / S4 On-Prem / S/4HANA Cloud Public / Private) und `abapRelease` liest. Die Pipeline verzweigt entsprechend:

- **ECC** — kein RAP/ACDOCA/BP; Syntax per Release gated (keine Inline-Deklaration <740, kein CDS <750 etc.)
- **S/4HANA On-Premise** — klassisches Dynpro technisch möglich, aber wird gewarnt; Extensibility-first, MATDOC/ACDOCA für Finanzen
- **S/4HANA Cloud (Public)** — **klassisches Dynpro verboten**; Umleitung auf RAP + Fiori Elements, `if_oo_adt_classrun` oder SALV-only-Output. Vollständige Verbotenes-Statement-Liste + Cloud-native API-Ersetzungen in `skills/create-program/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP, Business-Partner-APIs bevorzugen

### SPRO-Konfigurationsreferenz

Eingebaute Referenzdaten für alle 13 SAP-Module:

```
configs/{MODULE}/
  ├── spro.md        # SPRO-Konfigurationstabellen/-views
  ├── tcodes.md      # Transaktionscodes
  ├── bapi.md        # BAPI/FM-Referenz
  ├── tables.md      # Schlüsseltabellen
  ├── enhancements.md # BAdI / User Exit / BTE / VOFM
  └── workflows.md   # Entwicklungs-Workflows
configs/common/      # Modulübergreifende Referenzen (IDOC, Fabrikkalender, DD*-Tabellen etc.)
```

**Module**: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW

### SPRO-Local-Cache (Token-Sparen)

`/sc4sap:setup spro` extrahiert kundenspezifisches SPRO-Customizing aus dem Live-S/4HANA-System nach `.sc4sap/spro-config.json`. Jeder Consultant-Agent folgt `common/spro-lookup.md`:

1. **Priorität 1 — Local Cache** (`.sc4sap/spro-config.json` → `modules.{MODULE}`) — kein MCP-Call
2. **Priorität 2 — Statische Referenzen** (`configs/{MODULE}/*.md`)
3. **Priorität 3 — Live-MCP-Query** — nur mit Nutzerbestätigung (Token-Kosten werden gewarnt)

Einmalige Extraktion spart substanziell Tokens über alle künftigen Sessions.

### SAP-spezifische Hooks

- **SPRO-Auto-Injection** — Haiku-LLM klassifiziert Nutzer-Input und injiziert die relevante Modul-SPRO-Config
- **Transport-Validation** — prüft vor MCP-ABAP-Create/Update-Operationen, ob der Transport existiert
- **Auto-Activation** — löst nach Erstellung/Änderung die ABAP-Objekt-Aktivierung aus
- **Syntax-Checker** — führt bei ABAP-Fehlern automatisch Semantic Analysis aus
- **🔒 Data-Extraction-Blocklist** — `PreToolUse`-Hook blockiert Zeilenextraktion aus sensiblen SAP-Tabellen (siehe unten)

### 🔒 Data-Extraction-Blocklist

Eine verpflichtende Defense-in-Depth-Schicht, die Zeilendaten aus sensiblen Tabellen (PII, Credentials, Payroll, Banking, transaktionale Finanzdaten) davor schützt, via `GetTableContents` / `GetSqlQuery` extrahiert zu werden — durch sc4sap-Agents, direkte Nutzerprompts oder andere Plugins in derselben Claude-Code-Session.

**Vier Durchsetzungsschichten**:

| Schicht | Ort | Was sie tut |
|-------|-------|--------------|
| L1 — Agent-Anweisungen | `common/data-extraction-policy.md`, Consultant-Agents | Jeder Agent verweigert geblockte Extraktionen mit kategorisierter Begründung + Alternativen |
| L2 — Globale Direktive | `CLAUDE.md` "Data Extraction Policy"-Block | In jede Claude-Session geladen, auch direkte Prompts |
| L3 — Claude-Code-Hook | `scripts/hooks/block-forbidden-tables.mjs` (`PreToolUse`) | Programmatischer Block — fängt den MCP-Call ab und liefert `deny`-Entscheidung zurück |
| L4 — MCP-Server (Opt-in) | `abap-mcp-adt-powerup`-Quelle (`src/lib/policy/blocklist.ts`) | Hardcoded-Block innerhalb des MCP-Servers unabhängig vom Caller — aktivieren mit Env `SC4SAP_POLICY=on` |

**Blocklist-Quelle**: `exceptions/table_exception.md` ist der **Index**; die eigentlichen Tabellenlisten leben in **11 Sektionsdateien** unter `exceptions/`, damit jede Datei klein und grep-bar bleibt. Der Hook scannt automatisch jede `*.md` im Ordner außer dem Index.

| Stufe | Datei | Abdeckung |
|------|------|--------|
| minimal | `banking-payment.md` | Banking- / Payment-Credentials (BNKA, KNBK, LFBK, REGUH, PAYR, CCARD, FPAYH…) |
| minimal | `master-data-pii.md` | Customer- / Vendor- / BP-Stamm-PII (KNA1, LFA1, BUT000, BUT0ID, KNVK…) + zugehörige CDS-Views (I_Customer, I_Supplier, I_BusinessPartner, I_Employee…) |
| minimal | `addresses-communication.md` | ADR* (Adresse, E-Mail, Telefon, Fax) + CDS (I_Address, I_AddressEmailAddress…) |
| minimal | `auth-security.md` | USR02-Passwort-Hashes, RFCDES, AGR_1251, SSF_PSE_D + CDS (I_User, I_UserAuthorization…) |
| minimal | `hr-payroll.md` | PA* / HRP* / PCL*-Infotypes und -Cluster (Gehalt, Medizinisches, Angehörige…) |
| minimal | `tax-government-ids.md` | KNAS, LFAS, BUT0TX, Brasilien J_1B*, BP-Steuernummern |
| minimal | **`pricing-conditions.md`** | **Pricing / Conditions / Rebates** — KONH, KONP, KONV, KONA, KOTE*, `PRCD_ELEMENT`, `PRCD_COND_HEAD`, `PRCD_COND`, `A###` (A001–A999 Zugriffstabellen) + Pricing-CDS (I_PriceCondition, I_PricingProcedure, I_RebateAgreement, I_SalesOrderItemPrice…). Top-tier-Geschäftsrisiko — Leak offenbart kundenspezifische Rabatte und Marge |
| minimal | `custom-patterns.md` | `Z*` / `Y*` mit PII-Inhalt, ZHR_*, ZPA_*, ZCUST_*, ZVEND_*, ZKNA_* |
| standard | `protected-business-data.md` | VBAK / BKPF / ACDOCA / VBRK / EKKO / CDHDR / STXH + transaktionale CDS (I_JournalEntry, I_SalesOrder, I_BillingDocument, I_PurchaseOrder, I_Payable, I_Receivable…) |
| strict | `audit-security-logs.md` | BALDAT, SLG1, RSAU_BUF_DATA, SNAP, DBTABLOG |
| strict | `communication-workflow.md` | SAPoffice (SOOD, SOC3), Workflow (SWWWIHEAD, SWWCONT), Broadcast |

**Muster-Syntax** — exakte Namen, `TABLE*`-Wildcard, `TABLExxx`-Legacy-Wildcard und `A###` (neu: `#` = genau eine Ziffer, sodass `A###` A001–A999 präzise ohne Fehltreffer matched).

**Zwei Aktionen — `deny` vs `warn`**:

- **`deny`** (Default für jede Kategorie) — der Call wird direkt blockiert. SAP wird nicht kontaktiert. Der Agent nennt Kategorie, Grund und sicherere Alternativen.
- **`warn`** — der Call läuft durch, aber die Antwort wird mit einem `⚠️ sc4sap blocklist WARNING`-Block versehen, der Tabelle(n), Kategorie und empfohlene Alternativen aufzählt. Gedacht für Kategorien mit häufiger legitimer Nutzung.

`warn`-Default-Kategorien: **Protected Business Data** (VBAK/BKPF/ACDOCA/etc.) und **Customer-Specific PII Patterns** (`Z*`-Tabellen). Alles andere bleibt `deny`. Berührt ein einzelner Call *irgendeine* `deny`-Tabelle, wird der gesamte Call blockiert — `deny` gewinnt.

**Konfigurierbarer Scope** — ein Profil während `/sc4sap:setup` wählen:

| Profil | Blockiert |
|---------|--------|
| `strict` (Default) | PII + Credentials + HR + transaktionale Finanzdaten + Audit-Logs + Workflow |
| `standard` | PII + Credentials + HR + transaktionale Finanzdaten |
| `minimal` | PII + Credentials + HR + nur Tax (Geschäftstabellen erlaubt) |
| `custom` | Nur vom Nutzer gelieferte Liste (`.sc4sap/blocklist-custom.txt`) |

Jedes Profil honoriert zusätzlich `.sc4sap/blocklist-extend.txt` (ein Tabellenname oder Muster pro Zeile) für standortspezifische Ergänzungen.

**Installation** — automatisiert und **erforderlich** per `/sc4sap:setup`; manuelle Installation:

```bash
node scripts/install-hooks.mjs            # User-Ebene (~/.claude/settings.json)
node scripts/install-hooks.mjs --project  # Projekt-Ebene (.claude/settings.json)
node scripts/install-hooks.mjs --uninstall
```

**Verifizieren**:

```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Erwartet: JSON mit "permissionDecision":"deny"
```

Schema-/DDIC-Metadaten (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`), Existenzprüfungen (`SearchObject`) und Counts/Aggregate via `GetSqlQuery` bleiben erlaubt. Pro-Aufgabe-Ausnahmen können in `.sc4sap/data-access-approval-{YYYYMMDD}.md` dokumentiert werden.

**L4 Server-seitige Durchsetzung** (stoppt Calls von beliebigen Clients — direkte JSON-RPC, andere LLMs, externe Skripte):

```bash
# Beim Starten von mcp-abap-adt-powerup aktivieren
export SC4SAP_POLICY=on                    # oder: strict | standard | minimal | custom
export SC4SAP_POLICY_PROFILE=strict        # optional, Default bei SC4SAP_POLICY=on
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md  # optional zusätzliche Liste
export SC4SAP_ALLOW_TABLE=TAB1,TAB2        # sitzungsgebundene Notfall-Ausnahme (geloggt)
```

Wird eine blockierte Tabelle angesprochen, antwortet der MCP-Server mit `isError: true` und der kategorisierten Begründung — es findet kein SAP-Round-Trip statt.

### 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery` akzeptieren einen Parameter `acknowledge_risk: true`, der das `ask`-Bestätigungs-Gate des MCP-Servers umgeht. **Diese Flag ist eine Audit-Grenze, keine Convenience-Flag** — ihr Wert wird auf stderr geloggt und stellt eine Attestierung dar, dass der Nutzer eine pro-Request-Freigabe erteilt hat. Agents MÜSSEN diese Regeln ausnahmslos befolgen:

1. **Nie `acknowledge_risk: true` beim ersten Call setzen.** Hook / Server das Request gaten lassen.
2. **Bei einer `ask`-Antwort** STOPPEN — kein Retry. Ablehnung dem Nutzer offenlegen.
3. **Explizite Ja/Nein-Frage stellen**, die Tabellen und Scope benennt.
4. **Nur mit `acknowledge_risk: true` erneut ausführen nach explizitem affirmativem Keyword** des Nutzers: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `go ahead` / `confirmed`.
5. **Mehrdeutige Imperative sind KEINE Freigabe** — inklusive `"pull it"`, `"try it"`, `"뽑아봐"`, `"가져와봐"`, `"해봐"`, `"my mistake"`, Schweigen.
6. **Pro-Call, pro-Tabelle, pro-Session.** Autorisierung überträgt sich nicht über Requests hinaus.

Vollständiges Protokoll: `common/data-extraction-policy.md` → "The `acknowledge_risk` Parameter — HARD RULE".

### 🔀 RFC-Backend-Auswahl

Die Screen- / GUI-Status- / Text-Element-Operationen verteilen sich über RFC-fähige Funktionsbausteine in SAP. sc4sap bietet **4 Transport-Backends** — wählen Sie das passende zu Ihrer Umgebung:

| `SAP_RFC_BACKEND` | Wie es SAP aufruft | Wann zu nutzen |
|---|---|---|
| `soap` (Default) | HTTPS `/sap/bc/soap/rfc` | Die meisten Setups — funktioniert out of the box, wenn der ICF-Knoten aktiv ist |
| `native` | Direktes RFC via `node-rfc` + NW-RFC-SDK | Power-User, niedrigste Latenz, benötigt SDK auf jedem Laptop |
| `gateway` | HTTPS an eine sc4sap-rfc-gateway-Middleware | Teams ab 10 Entwicklern, zentrales Deployment |
| 🆕 `odata` | HTTPS OData-v2-Service `ZMCP_ADT_SRV` | **NEU in v0.2.4** — wenn die Firma `/sap/bc/soap/rfc` blockiert, aber das OData-Gateway erlaubt. Erfordert einmalige Basis-Registrierung des `ZMCP_ADT_SRV`-Service. Siehe [`docs/odata-backend.md`](docs/odata-backend.md) für den End-to-End-Registrierungs- + Client-Switch-Leitfaden |

Backends jederzeit über `/sc4sap:sap-option` wechseln, MCP neu verbinden, mit `/sc4sap:sap-doctor` verifizieren.

### 🏢 RFC-Gateway (Enterprise-Deployment)

Für große SAP-Entwicklungsteams (typischerweise Dutzende Entwickler) unterstützt sc4sap eine **zentrale RFC-Gateway-Middleware**, sodass Entwickler-Laptops nie das SAP-NW-RFC-SDK, MSVC-Build-Tools oder S-User-SDK-Downloads brauchen. Ein Linux-Host fährt `node-rfc` + SDK; alle MCP-Clients sprechen HTTPS/JSON darauf.

Wann das relevant ist:

- Ihre IT-Richtlinie verbietet das SAP-NW-RFC-SDK auf Entwickler-Maschinen
- Das SAP-Basis-Team hat den ICF-Endpoint `/sap/bc/soap/rfc` unternehmensweit deaktiviert
- Sie wollen zentrales RFC-Logging, Rate Limiting und pro-Entwickler-Audit-Trail

Konfiguration auf jedem Entwickler-Laptop:

```
/sc4sap:sap-option
# SAP_RFC_BACKEND=gateway setzen
#     SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
#     SAP_RFC_GATEWAY_TOKEN=<team-or-per-user-bearer>
```

Das Gateway leitet die SAP-Credentials des Entwicklers bei jedem Request über `X-SAP-*`-Header weiter, sodass SAPs Audit-Log den echten User identifiziert (nicht einen geteilten Service-Account).

> **Privates Repository.** Der Gateway-Quellcode liegt in einem **privaten Repo**, weil das Docker-Image gegen das SAP-lizenzierte NW-RFC-SDK gebaut werden muss, das nicht weiterverbreitet werden darf. Organisationen kontaktieren den Maintainer für Zugriff; sie klonen dann, laden das SDK selbst herunter (S-User nötig) und bauen das Image im eigenen Netzwerk. Einzelne Open-Source-sc4sap-Nutzer sollten weiter `SAP_RFC_BACKEND=soap` (Default) verwenden — kein Gateway nötig.

Der Client-seitige Entwurf lebt in diesem Repo (`abap-mcp-adt-powerup/src/lib/gatewayRfc.ts`) — der HTTP-Vertrag ist dokumentiert, und jede konforme Middleware (Node, Java, Python, …) funktioniert. Kontaktieren Sie den Maintainer für Repo-Zugriff oder um alternative Gateway-Implementierungen zu besprechen.

## Skills — Beispiele & Workflow

Jeder Skill unten zeigt eine Einzeilen-Invocation, einen typischen Prompt und was unter der Haube passiert. Screenshots werden in einem künftigen Update ergänzt.

### `/sc4sap:setup`

Einmaliges Onboarding: installiert den MCP-ABAP-ADT-Server, extrahiert den SPRO-Cache, installiert den Data-Extraction-Blocklist-Hook.

```
/sc4sap:setup
```

**Ablauf** — Verbindungstest → SAP-Version-Detect (ECC / S4 On-Prem / Cloud) → SPRO-Extraktion pro Modul → Blocklist-Profil-Abfrage (`strict` / `standard` / `minimal` / `custom`) → Hook-Registrierung in `settings.json`.

> _Screenshot-Platzhalter — Setup-Wizard_

---

### `/sc4sap:create-object`

Hybrid-Modus-Einzelobjektanlage: bestätigt Transport + Paket interaktiv, erstellt, scaffoldet und aktiviert.

```
/sc4sap:create-object
→ "Create a class ZCL_SD_ORDER_VALIDATOR in package ZSD_ORDER"
```

**Ablauf** — Typ-Inferenz (Class / Interface / Program / FM / Table / Structure / Data Element / Domain / CDS / Service Def / Service Binding) → Paket + Transport bestätigen → MCP `Create*` → Initial-Implementierung geschrieben → `GetAbapSemanticAnalysis` → aktivieren.

> _Screenshot-Platzhalter — create-object-Bestätigung + Aktivierung_

---

### `/sc4sap:create-program`

Flaggschiff-Programm-Anlage-Pipeline mit Main + Include-Wrapping, OOP oder prozedural, volle ALV- + Dynpro-Unterstützung.

```
/sc4sap:create-program
→ "Make an ALV report for open sales orders, selection screen by sales org + date range"
```

**Ablauf** — SAP-Version-Preflight (`.sc4sap/config.json`) → **Phase 1A Modul-Interview** (Modul-Consultant führt — Industry/Country-Preflight, Geschäftszweck / Pain Point / firmenspezifische Regeln / Referenz-Assets, verpflichtender Vorschlag einer Standard-SAP-Alternative; schreibt `module-interview.md`, Gate ≤ 5%) → **Phase 1B Programm-Interview** (`sap-analyst` + `sap-architect` klären 7 technische Dimensionen — Zweck-Typ / Paradigma / Anzeige / Screen / Daten / Paket / Testumfang; schreibt `interview.md`, Gate ≤ 5%) → `sap-planner` konsolidiert beide Dateien → Spec → User-Freigabe → Executor schreibt Main-Programm + konditionale Includes (t/s/c/a/o/i/e/f/_tst) + Screen + GUI-Status + Text-Elemente → qa-tester schreibt ABAP-Unit → code-reviewer-Gate → aktivieren. Phase 1B startet nie vor Abschluss von Phase 1A. Verzweigt je Plattform (ECC / S4 On-Prem / Cloud Public verbietet klassisches Dynpro → automatische Umleitung auf `if_oo_adt_classrun` / SALV / RAP).

> _Screenshot-Platzhalter — Programm-Pipeline mit ALV-Output_

---

### `/sc4sap:analyze-code`

Liest ein bestehendes ABAP-Objekt via MCP, führt `sap-code-reviewer` gegen Clean ABAP + Performance + Security aus und liefert kategorisierte Befunde mit Vorschlägen.

```
/sc4sap:analyze-code
→ "Review ZCL_SD_ORDER_VALIDATOR for Clean ABAP violations and SELECT * usage"
```

**Ablauf** — `ReadClass` / `GetProgFullCode` → `GetAbapSemanticAnalysis` + `GetWhereUsed` → sap-code-reviewer-Analyse → kategorisierter Report (Clean ABAP / Performance / Security / SAP-Standard) → optionale Apply-Fix-Schleife.

> _Screenshot-Platzhalter — Review-Befund-Tabelle_

---

### `/sc4sap:analyze-cbo-obj`

Customer-Business-Object (CBO)-Inventarscanner. Geht ein Z-Paket ab und katalogisiert wiederverwendbare Z-Tabellen / FMs / Datenelemente / Klassen / Strukturen / Tabellentypen — persistiert die Liste dann, sodass nachgelagerte Generatoren (`create-program`, `program-to-spec`) standardmäßig **wiederverwenden** statt duplizieren.

```
/sc4sap:analyze-cbo-obj
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```

**Ablauf** — `GetPackageTree` auf Ziel-Z-Paket → `GetObjectsByType` pro CBO-Kategorie → Frequenz- + Zweck-Heuristiken → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` schreiben. `create-program` / `program-to-spec` laden dieses JSON zur Planungszeit und fügen vor jedem `Create*`-Call ein Reuse-First-Gate hinzu.

Ideal für Brownfield-Systeme mit Hunderten bestehender Z-Objekte; einmal pro Paket ausführen und wochenlang für Folgearbeit warm halten.

> _Screenshot-Platzhalter — CBO-Inventar-Output_

---

### `/sc4sap:analyze-symptom`

Schrittweise Runtime- / operative Fehleruntersuchung: Dumps, Logs, SAP-Note-Kandidaten.

```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_POSTING at line 234 during F110"
```

**Ablauf** — `RuntimeListDumps` / `RuntimeGetDumpById` / `RuntimeAnalyzeDump` (ST22) — optional ergänzt um `RuntimeListSystemMessages` (SM02 Banner-Meldungen) und `RuntimeGetGatewayErrorLog` (/IWFND/ERROR_LOG) für vollständigen Operations-Kontext — → Stacktrace parsen → SAP-Note-Kandidatensuche → Root-Cause-Hypothese → Behebungsoptionen (Config / Code / User-Action).

> _Screenshot-Platzhalter — Dump-Analyse und Note-Kandidaten_

---

### `/sc4sap:program-to-spec`

Ein bestehendes ABAP-Programm wieder in eine Fach-/Technische Spezifikation — Markdown oder Excel — reverse-engineeren. Sokratisches Scope-Narrowing verhindert "Alles dokumentieren"-Wildwuchs.

```
/sc4sap:program-to-spec
→ "Write a spec for ZSD_ORDER_RELEASE — focus on approval logic and BAdI hooks"
```

**Ablauf** — Scope-Narrowing-Q&A → `GetProgFullCode` / `ReadClass` / Includes-Walk → `GetWhereUsed` + `GetEnhancements` → strukturierte Spec (Zweck / Selektionsbild / Datenfluss / APIs / Enhancements / Berechtigungen) → Markdown- oder Excel-Artefakt.

> _Screenshot-Platzhalter — generiertes Spec-Artefakt_

---

### `/sc4sap:autopilot`

Vollautomatische Pipeline von vager Idee zu aktivierten, getesteten ABAP-Objekten — läuft `deep-interview` → `ralplan` → Agent-Pipeline → `ralph`-Schleife, bis sauber.

```
/sc4sap:autopilot
→ "Build a custom Vendor Payment approval workflow"
```

**Ablauf** — Deep-Interview kristallisiert Scope → ralplan Konsensplan → sap-planner WRICEF-Zerlegung → sap-executor legt Objekte an → sap-qa-tester führt Unit-Tests aus → sap-code-reviewer gated → ralph-Schleife wiederholt, bis grün.

> _Screenshot-Platzhalter — Autopilot-Progress-Stream_

---

### `/sc4sap:ralph`

Persistente Selbstkorrektur-Schleife: läuft, bis Syntax sauber ist, Aktivierung gelingt und Unit-Tests bestehen. Drop-in für jede "make it work"-Aufgabe.

```
/sc4sap:ralph
→ "Fix all activation errors in ZMM_GR_POSTING and its includes"
```

**Ablauf** — Iterieren: `GetAbapSemanticAnalysis` → Fehler identifizieren → via `UpdateProgram` / `UpdateClass` / `UpdateInclude` bearbeiten → aktivieren → Unit-Test erneut laufen lassen → stoppen, wenn alle drei bestehen. Bricht bei manueller Intervention oder Max-Iterationen ab.

> _Screenshot-Platzhalter — Ralph-Iterations-Log_

---

### `/sc4sap:ralplan`

Konsens-Planungs-Gate — mehrere Agent-Perspektiven (analyst / architect / critic) konvergieren auf einen Plan, bevor gecodet wird. Verhindert, dass Autopilot das Falsche baut.

```
/sc4sap:ralplan
→ "Plan the rewrite of legacy ZSD_ORDER_RELEASE to RAP-based workflow"
```

**Ablauf** — sap-analyst extrahiert Anforderungen → sap-architect schlägt technisches Design vor → sap-critic fordert Design heraus → Konvergenziterationen → genehmigter Plan an Autopilot / Team übergeben.

> _Screenshot-Platzhalter — ralplan-Konvergenz-Diff_

---

### `/sc4sap:deep-interview`

Sokratische Anforderungserfassung, bevor Code geschrieben wird. Fördert verborgene Annahmen, Edge-Cases und modulübergreifende Effekte zutage.

```
/sc4sap:deep-interview
→ "I need a custom credit-limit check"
```

**Ablauf** — initiale Nutzerintention → geschichtete Fragen (welche Module, welche Stammdaten, welches Timing, welche Fehler-UX, wer genehmigt) → Spezifikations-Zusammenfassung → Nutzerbestätigung.

> _Screenshot-Platzhalter — Interview-Q&A_

---

### `/sc4sap:team`

Koordinierte parallele Agent-Ausführung über native Claude-Code-Teams (in-process).

```
/sc4sap:team
→ "Split this WRICEF list into 4 workers and build in parallel"
```

**Ablauf** — geteilte Task-Liste → N Worker picken Tasks → jeder fährt create-object / program / ralph → Merge-Back via Transport.

> _Screenshot-Platzhalter — tmux-Pane-Ansicht / Team-Dashboard_

---

### `/sc4sap:release`

CTS-Transport-Release-Workflow — listen, validieren (keine inaktiven Objekte, keine Syntaxfehler), freigeben und Import ins Folgesystem bestätigen.

```
/sc4sap:release
→ "Release transport DEVK900123"
```

**Ablauf** — `GetTransport` → Validierungs-Checkliste → Freigabe via STMS → Import-Status überwachen → Post-Import-Smoke-Check.

> _Screenshot-Platzhalter — Release-Checkliste_

---

### `/sc4sap:sap-doctor`

Plugin- + MCP- + SAP-Systemdiagnose. Erstes Kommando, wenn etwas nicht stimmt. (Umbenannt von `doctor`, um Konflikt mit Claude Codes eingebautem `/doctor` zu vermeiden.)

```
/sc4sap:sap-doctor
```

**Ablauf** — Plugin-Install-Prüfung → MCP-Server-Handshake → SAP-RFC/ADT-Konnektivität → SPRO-Cache-Frische → Hook-Registrierung → Blocklist aktiv → Report mit umsetzbaren Fixes.

> _Screenshot-Platzhalter — Doctor-Report_

---

### `/sc4sap:mcp-setup`

Standalone-Leitfaden zur Installation / Rekonfiguration von `abap-mcp-adt-powerup`, falls `/sc4sap:setup` es nicht ausgeführt hat (z. B. bestehende globale MCP-Config).

```
/sc4sap:mcp-setup
```

### `/sc4sap:sap-option`

Interaktives Ansehen und Bearbeiten von `.sc4sap/sap.env` — SAP-Verbindungs-Credentials, TLS-Einstellungen und Blocklist-Policy für Row-Extraction-Sicherheit. Secrets sind in der Anzeige maskiert; Writes werden von einem Diff-Preview begleitet und legen ein `sap.env.bak`-Backup an.

```
/sc4sap:sap-option
```

Typische Anwendungen: `SAP_PASSWORD` rotieren, `SAP_CLIENT` wechseln, `MCP_BLOCKLIST_PROFILE` ändern (`minimal` / `standard` / `strict` / `off`), einen auditieren `MCP_ALLOW_TABLE`-Eintrag hinzufügen oder an `MCP_BLOCKLIST_EXTEND` anhängen. Nach dem Speichern MCP neu verbinden (`/mcp`).

## Tech-Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_SDK-Protocol-FF6600)

## Acknowledgments

Dieses Projekt wurde von [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) von **허예찬 (Hur Ye-chan)** inspiriert. Die Multi-Agent-Orchestrierungsmuster, das sokratische Deep-Interview-Gating, die ralph-/autopilot-Pipelines und die gesamte Plugin-Philosophie gehen auf diese Arbeit zurück. Großer Dank — sc4sap würde in dieser Form ohne sie nicht existieren.

Der mitgelieferte MCP-Server (`abap-mcp-adt-powerup`) baut auf [**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt) von **fr0ster** auf. Dieses Projekt lieferte das ursprüngliche ADT-über-MCP-Fundament — Request-Shaping, Endpoint-Abdeckung, Objekt-I/O —, auf das sich jeder sc4sap-Tool-Call verlässt. Es war eine enorme Hilfe; aufrichtigen Dank an fr0ster für die Pionierarbeit.

## Autor

- **paek seunghyun** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## Contributors

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## Lizenz

[MIT](LICENSE)
