# Funktionen im Detail

← [Zurück zur README](../README.de.md) · [Installation →](INSTALLATION.de.md)

## Inhaltsverzeichnis

- [25 SAP-spezialisierte Agenten](#25-sap-spezialisierte-agenten)
- [18 Skills](#18-skills)
- [Skills — Beispiele & Workflow](#skills--beispiele--workflow)
- [MCP ABAP ADT Server — Alleinstellungsmerkmale](#mcp-abap-adt-server--alleinstellungsmerkmale)
- [Gemeinsame Konventionen](#gemeinsame-konventionen-common)
- [Context-Loading-Architektur (v0.5.2+)](#context-loading-architektur-v052)
- [Response-Prefix-Konvention (v0.5.2+)](#response-prefix-konvention-v052)
- [Branchen-Referenz](#branchen-referenz-industry)
- [Länder-/Lokalisierung](#länderlokalisierungsreferenz-country)
- [Aktive-Modul-Integration](#aktive-modul-integration)
- [SAP-Plattform-Erkennung](#sap-plattform-erkennung-ecc--s4-on-prem--cloud)
- [SPRO-Konfigurationsreferenz](#spro-konfigurationsreferenz)
- [SAP-spezifische Hooks](#sap-spezifische-hooks)
- [Datenextraktions-Blocklist](#-datenextraktions-blocklist)
- [acknowledge_risk HARD RULE](#-acknowledge_risk--hard-rule)
- [RFC-Backend-Auswahl](#-rfc-backend-auswahl)
- [RFC-Gateway (Enterprise)](#-rfc-gateway-enterprise-deployment)

## 25 SAP-spezialisierte Agenten

| Kategorie | Agenten |
|-----------|---------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — Systemadministration, Transportmanagement, Diagnose |
| **Modules (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**Delegations-Map (Module Consultation Protocol)**:
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant` (Business-Semantik) oder `sap-bc-consultant` (System-Ebene)
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant` (Transportstrategie, Autorisierung, Performance, Sizing, Patching) oder Modulberater
- `sap-analyst` / `sap-critic` / `sap-planner` haben zusätzlich einen obligatorischen **Country Context**-Block (lädt `country/<iso>.md`)
- **Direkter MCP-Lesezugriff** für Core-Agenten — Package / DDIC / Class / Program / Where-Used / Runtime-Dump Tools als Read-Only; Write-CRUD bleibt bei `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger`

## 18 Skills

| Skill | Beschreibung |
|-------|--------------|
| `sc4sap:setup` | Plugin-Setup — Auto-Installation des MCP-Servers, SPRO-Konfig generieren, Blocklist-Hook installieren |
| `sc4sap:mcp-setup` | Eigenständiger MCP ABAP ADT Server Install-/Rekonfig-Guide |
| `sc4sap:sap-option` | `.sc4sap/sap.env` anzeigen/bearbeiten (Credentials, RFC-Backend, Blocklist, aktive Module) |
| `sc4sap:sap-doctor` | Plugin + MCP + SAP Diagnose (6 Schichten) |
| `sc4sap:create-object` | ABAP-Objekterstellung (Hybrid-Mode — Transport + Paket bestätigen, erstellen, aktivieren) |
| `sc4sap:create-program` | Volle ABAP-Programm-Pipeline — Main+Include, OOP/Prozedural, ALV, Dynpro, Text Elements, ABAP Unit |
| `sc4sap:program-to-spec` | ABAP-Programm zu Fach-/Technikspezifikation reverse-engineeren (Markdown / Excel) |
| `sc4sap:analyze-code` | ABAP-Codeanalyse (Clean ABAP / Performance / Security) |
| `sc4sap:analyze-cbo-obj` | CBO-Inventarscanner + Cross-Module-Gap-Analyse |
| `sc4sap:analyze-symptom` | Schritt-für-Schritt-Analyse von SAP-Betriebsfehlern/-symptomen (Dumps, Logs, SAP-Note-Kandidaten) |
| `sc4sap:trust-session` | INTERNAL-ONLY — sessionweiter MCP-Berechtigungs-Bootstrap |
| `sc4sap:deep-interview` | Sokratische Anforderungserhebung vor Implementierung |
| `sc4sap:team` | Koordinierte parallele Agent-Ausführung (native Claude Code Teams) |
| `sc4sap:release` | CTS-Transport-Release-Workflow |

## Skills — Beispiele & Workflow

### `/sc4sap:create-object`
Hybrid-Mode Single-Object-Erstellung: Transport + Paket interaktiv bestätigen, dann erstellen, scaffolden und aktivieren.
```
/sc4sap:create-object
→ "Klasse ZCL_SD_ORDER_VALIDATOR im Paket ZSD_ORDER erstellen"
```
Flow: Typinferenz → Paket + Transport bestätigen → MCP `Create*` → Initialimplementierung → `GetAbapSemanticAnalysis` → aktivieren.

### `/sc4sap:create-program`
Flagship-Programm-Erstellungs-Pipeline — Main + Include Wrapping, OOP oder Prozedural, volles ALV + Dynpro-Support.
```
/sc4sap:create-program
→ "ALV-Report für offene Kundenaufträge, Selektionsbildschirm nach Vertriebsorg + Datumsbereich"
```
Flow (Phase 0–8):
- Phase 0 — SAP-Versions-Preflight + Aktive-Module-Laden
- Phase 1A — Modulberater-Businessinterview (Branchen-/Länder-Preflight, Business-Zweck, Standard-SAP-Alternative)
- Phase 1B — `sap-analyst` + `sap-architect` Technikinterview (7 Dimensionen)
- Phase 2 — Planung mit CBO + Customizing-Reuse-Gates
- Phase 3 — Spezifikation + Benutzerfreigabe
- Phase 3.5 — Execution-Mode-Gate (`auto` / `manual` / `hybrid`)
- Phase 4 — parallele Include-Generierung → Batch-Aktivierung
- Phase 5 — ABAP Unit
- Phase 6 — 4-Bucket-Konventionsreview (Sonnet parallel, Opus-Eskalation bei MAJOR-Findings)
- Phase 7 — Debug-Eskalation
- Phase 8 — Abschlussbericht mit Timing-Tabelle

### `/sc4sap:analyze-code`
```
/sc4sap:analyze-code
→ "ZCL_SD_ORDER_VALIDATOR auf Clean-ABAP-Verstöße und SELECT * Nutzung prüfen"
```

### `/sc4sap:analyze-cbo-obj`
Walkt ein Z-Paket, katalogisiert wiederverwendbare Assets, führt Cross-Module-Gap-Analyse durch.
```
/sc4sap:analyze-cbo-obj
→ "ZSD_ORDER-Paket auf MM-Modul-Wiederverwendungskandidaten scannen"
```
Flow: `GetPackageTree` → Kategorie-Walk → Häufigkeitsheuristik → Cross-Module-Gap-Check → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_POSTING Zeile 234 während F110"
```
Flow: `RuntimeListDumps` → `RuntimeAnalyzeDump` → Stacktrace → SAP-Note-Kandidaten → Remediation-Optionen.

### `/sc4sap:program-to-spec`
Reverse-Engineering eines ABAP-Programms zu einer Spezifikation (Markdown/Excel) mit sokratischer Scope-Verengung.

### `/sc4sap:team`
Koordinierte parallele Agent-Ausführung über native Claude Code Teams.

### `/sc4sap:release`
CTS-Transport-Release-Workflow — auflisten, validieren, freigeben, Import bestätigen.

### `/sc4sap:sap-doctor`
Plugin + MCP + SAP Konnektivitätsdiagnose. Das erste, was man ausführt, wenn etwas nicht stimmt.

### `/sc4sap:sap-option`
`.sc4sap/sap.env` anzeigen und bearbeiten — Credentials, RFC-Backend, Blocklist-Policy, aktive Module. Secrets maskiert.

## MCP ABAP ADT Server — Alleinstellungsmerkmale

sc4sap wird durch **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)** (150+ Tools) angetrieben. Über das übliche Class / Program / Table / CDS / FM CRUD hinaus bietet es **volle R/U/C-Abdeckung für klassische Dynpro-Artefakte**, die die meisten MCP-Server nicht anfassen:

| Artefakt | Abdeckung |
|----------|-----------|
| **Screen (Dynpro)** | `GetScreen` / `CreateScreen` / `UpdateScreen` / `DeleteScreen` — Header + Ablauflogik-Roundtrip |
| **GUI-Status** | `GetGuiStatus` / `CreateGuiStatus` / `UpdateGuiStatus` / `DeleteGuiStatus` — Menüleiste, Funktionstasten, Symbolleiste |
| **Text Element** | `GetTextElement` / `CreateTextElement` / `UpdateTextElement` / `DeleteTextElement` — Textsymbole, Selektionstexte, Listenüberschriften |
| **Includes** | `GetInclude` / `CreateInclude` / `UpdateInclude` / `DeleteInclude` — Main+Include-Konvention |
| **Lokale Defs/Macros/Tests/Types** | Programm-interne lokale Abschnitte unabhängig editieren |
| **Metadata Extension (CDS)** | Fiori/UI-Annotation-Layering |
| **Behavior Definition / Implementation (RAP)** | Voller RAP BDEF + BHV-Zyklus |
| **Service Definition / Binding** | OData V2/V4-Exposition + `ValidateServiceBinding` |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` Discovery |
| **Runtime & Profiling** | `RuntimeAnalyzeDump`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeGetProfilerTraceData`, `RuntimeRunProgramWithProfiling` — ST22 / SM02 / `/IWFND/ERROR_LOG` / SAT-Profiling aus Claude |
| **Semantic / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetWhereUsed` |
| **Unit Tests** | Sowohl ABAP Unit (`CreateUnitTest`) als auch CDS Unit (`CreateCdsUnitTest`) |
| **Transport** | `GetTransport`, `ListTransports`, `CreateTransport` |

## Gemeinsame Konventionen (`common/`)

Cross-Skill-Authoring-Regeln leben in `common/`. `CLAUDE.md` ist ein dünner Index, der diese Dateien referenziert.

| Datei | Inhalt |
|-------|--------|
| `clean-code.md` + `clean-code-oop.md` + `clean-code-procedural.md` | Clean ABAP Standards, nach Paradigma getrennt |
| `include-structure.md` | Main-Programm + bedingte Include-Set (t/s/c/a/o/i/e/f/_tst) |
| `oop-pattern.md` | Zwei-Klassen-OOP-Split (`LCL_DATA` + `LCL_ALV` + `LCL_EVENT`) |
| `alv-rules.md` | Volles ALV (CL_GUI_ALV_GRID + Docking) vs SALV + SALV-Factory-Fieldcatalog |
| `text-element-rule.md` | Obligatorische Text Elements — Zwei-Pass-Sprachregel (primär + `'E'` Sicherheitsnetz) |
| `constant-rule.md` | Obligatorische CONSTANTS (non-fieldcatalog Magic-Literale) |
| `procedural-form-naming.md` | `_{screen_no}` Suffix für ALV-gebundene FORMs |
| `naming-conventions.md` | Gemeinsame Namensgebung für Programme, Includes, LCL_*, Screens, GUI-Status |
| `sap-version-reference.md` | ECC vs S/4HANA Unterschiede |
| `abap-release-reference.md` | ABAP-Syntaxverfügbarkeit nach Release |
| `spro-lookup.md` | SPRO-Lookup-Priorität (lokaler Cache → statisch → MCP) |
| `data-extraction-policy.md` | Agenten-Verweigerungsprotokoll + `acknowledge_risk` HARD RULE |
| `active-modules.md` | Cross-Module-Integrationsmatrix (MM↔PS, SD↔CO, QM↔PP…) |
| `context-loading-protocol.md` | 4-Tier On-Demand-Dateiladung (global → role → triggered → per-task) |
| `model-routing-rule.md` | Sonnet / Opus / Haiku Routing + Response-Prefix-Konvention |
| `ok-code-pattern.md` | Prozedurales Screen-OK_CODE-3-Schritt-Vertrag (TOP-Deklaration → Screen NAME → PAI-FORM-Local-Routing) |
| `field-typing-rule.md` | DDIC-Feld-Typing-Priorität (Standard DE → CBO DE → neues DE → Primitiv) |
| `function-module-rule.md` | FM-Source-Konvention (Inline IMPORTING/EXPORTING/TABLES Signatur) |
| `transport-client-rule.md` | Jedes `CreateTransport` erfordert expliziten Client aus `sap.env` |
| `ecc-ddic-fallback.md` | ECC `$TMP` Helper-Report-Pfad für Table/DTEL/Domain-Erstellung |
| `cloud-abap-constraints.md` | Verbotene Statements + Cloud-native API-Ersatz für S/4 Cloud Public |
| `customization-lookup.md` | Bestehende Z*/Y* BAdI-Impl / CMOD / Form-Exit / Append Reuse-Gate |

## Context-Loading-Architektur (v0.5.2+)

Die Regel-Korpus von sc4sap ist umfangreich — 25+ `common/*.md` + 14 `configs/{MODULE}/*.md` + 30+ Industry/Country-Dateien. Jede Agent-Dispatch die ganze Korpus zu laden verschwendet Tokens und verdünnt die Modell-Aufmerksamkeit. Das **4-Tier Context-Loading-Modell** (definiert in [`common/context-loading-protocol.md`](../common/context-loading-protocol.md)) trennt "immer-geladene Safety-Railings" von "rollen-spezifischer Baseline" von "bedingungs-getriggert" von "per-task Kit".

| Tier | Geladen wann | Dateien |
|------|--------------|---------|
| **Tier 1 — Global Mandatory** | Jeder Agent, jeder Skill, jeder Session-Start | `data-extraction-policy.md`, `sap-version-reference.md`, `naming-conventions.md`, `context-loading-protocol.md`, `model-routing-rule.md` |
| **Tier 2 — Role-Mandatory** | Rollen-Gruppe festes Set, Session-Start | variiert nach Rollen-Gruppe (siehe unten) |
| **Tier 3 — Triggered Reads** | Wenn eine Bedingung im aktuellen Task übereinstimmt | ALV → `alv-rules.md` · Procedural → `clean-code-procedural.md` + `ok-code-pattern.md` · `CALL SCREEN` → `ok-code-pattern.md` · ECC → `ecc-ddic-fallback.md` · industry/country gesetzt → entsprechende Datei · etc. |
| **Tier 4 — Per-Task Kit** | Vom dispatcher-Skill/Phase/Bucket deklariert | pro Wave in `phase4-parallel.md`, pro §1-§12 in `phase6-review.md` |

### Tier 2 Rollen-Gruppen

| Rollen-Gruppe | Agenten | Tier 2 fügt hinzu |
|---------------|---------|-------------------|
| **Code Writer** | `sap-executor`, `sap-qa-tester`, `sap-debugger` | `clean-code.md`, `abap-release-reference.md`, `transport-client-rule.md`, `include-structure.md` (+ Paradigma-Datei) |
| **Reviewer** | `sap-code-reviewer`, `sap-critic` | `clean-code.md`, `abap-release-reference.md`, `include-structure.md` (Phase-6 Bucket-Verengung) |
| **Planner / Architect** | `sap-planner`, `sap-architect` | `include-structure.md`, `active-modules.md`, `customization-lookup.md`, `field-typing-rule.md` |
| **Analyst / Writer** | `sap-analyst`, `sap-writer` | `active-modules.md` |
| **Doc Specialist** | `sap-doc-specialist` | *(keine — task-getrieben)* |
| **Module Consultant** | 14 Modul-Consultants (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba) | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/{spro,tcodes,bapi,tables,enhancements,workflows}.md` |
| **Basis Consultant** | `sap-bc-consultant` | `transport-client-rule.md`, `configs/common/*.md` |

### Durchsetzung

Jede `agents/*.md` deklariert ihre Rollen-Gruppe in einem `<Mandatory_Baseline>`-Block am Anfang von `<Agent_Prompt>`. Agent lädt Tier 1 + Tier 2 beim Session-Start vor jedem MCP-Aufruf. Skill-Prompts deklarieren nur Tier 4 (per-task) Ergänzungen; Tier 1+2 werden vorausgesetzt. Bei MAJOR Blocker gibt der Agent `BLOCKED — context kit insufficient: <list>` zurück, damit der Skill ein aktualisiertes Kit liefert.

### Gemessene Effekte

- Per-Dispatch Tokens: −40 bis −60% gegenüber pre-v0.5.0 implizitem Load-All-Muster.
- Opus-Nutzungsanteil in `/sc4sap:create-program`: −50% (Routing-Matrix in `model-routing-rule.md`).
- Reviewer MAJOR-Finding-Erkennung: verbessert — jedes §1-§12 läuft nur mit seiner relevanten Regel im Kontext.

## Response-Prefix-Konvention (v0.5.2+)

Jede `/sc4sap:*`-Skill-getriggerte Antwort beginnt mit einer einzeiligen Prefix-Zeile, damit der Benutzer auf einen Blick sieht, welches Modell die Arbeit erledigt und welche Sub-Agents dispatched wurden:

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

Beispiele:

```
[Model: Opus 4.7]
— reine Main-Thread-Antwort, keine Sub-Agent-Dispatches

[Model: Opus 4.7 · Dispatched: Sonnet×2]
— Main + zwei parallele Sonnet-Executor (Wave 2 G4-prep Text-Bulk)

[Model: Opus 4.7 · Dispatched: Opus×1 (planner)]
— Phase-2-Planner-Dispatch

[Model: Opus 4.7 · Dispatched: Sonnet×3 (B3a executor range α/β/γ)]
— Multi-Executor-Split nach multi-executor-split.md Strategie A
```

Die Konvention wird durch einen `<Response_Prefix>`-Block in jeder `/sc4sap:*` SKILL.md durchgesetzt, der auf [`common/model-routing-rule.md`](../common/model-routing-rule.md) § *Response Prefix Convention* verweist. Das Prefix gilt nur für skill-getriggerte Turns und wird bei einem thematischen Wechsel durch den Benutzer in diesem Turn entfernt.

## Branchen-Referenz (`industry/`)

14 Branchen-Dateien — von jedem `sap-*-consultant` konsultiert. Jede Datei deckt **Business Characteristics / Key Processes / Master Data / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls** ab.

Branchen: retail, fashion, cosmetics, tire, automotive, pharmaceutical, food-beverage, chemical, electronics, construction, steel, utilities, banking, public-sector.

## Länder-/Lokalisierungsreferenz (`country/`)

15 länderspezifische Dateien + `eu-common.md` — obligatorisch für Analyst / Critic / Planner. Jede Datei deckt **Formats / Tax System / e-Invoicing / Banking / Payroll / Statutory Reporting / SAP Country Version / Pitfalls** ab.

| Datei | Wichtige Besonderheiten |
|-------|-------------------------|
| 🇰🇷 `kr.md` | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII |
| 🇯🇵 `jp.md` | Qualified Invoice System (2023+), Zengin, 法人番号 |
| 🇨🇳 `cn.md` | Golden Tax, 发票/e-fapiao, SAFE FX |
| 🇺🇸 `us.md` | Sales & Use Tax (kein VAT), 1099, Nexus |
| 🇩🇪 `de.md` | USt, ELSTER, XRechnung / ZUGFeRD, SEPA |
| 🇬🇧 `gb.md` | VAT + MTD, BACS/FPS/CHAPS, Post-Brexit (GB vs XI) |
| 🇫🇷 `fr.md` | TVA, FEC, Factur-X 2026 |
| 🇮🇹 `it.md` | IVA, FatturaPA / SDI (seit 2019 verpflichtend) |
| 🇪🇸 `es.md` | IVA, SII (Echtzeit 4-Tage), TicketBAI |
| 🇳🇱 `nl.md` | BTW, KvK, Peppol, XAF |
| 🇧🇷 `br.md` | NF-e, SPED, CFOP, PIX |
| 🇲🇽 `mx.md` | CFDI 4.0, SAT, Carta Porte, SPEI |
| 🇮🇳 `in.md` | GST, IRN e-invoice, e-Way Bill, TDS |
| 🇦🇺 `au.md` | GST, ABN, STP Phase 2, BAS |
| 🇸🇬 `sg.md` | GST, UEN, InvoiceNow, PayNow |
| 🇪🇺 `eu-common.md` | VIES, INTRASTAT, SEPA, GDPR |

Multi-Country-Rollouts: alle relevanten Dateien werden geladen + länderübergreifende Berührungspunkte (intra-EU VAT, Intercompany, Transfer Pricing, grenzüberschreitende Quellensteuer) aufgeführt.

## Aktive-Modul-Integration

`common/active-modules.md` definiert eine Cross-Module-Integrationsmatrix. Wenn mehrere Module aktiv sind, schlagen Skills proaktiv Integrationsfelder vor.

Beispiel: MM-PO-Erstellung in einer Landschaft mit **PS aktiv** → Kontierungskategorie `P`/`Q` + `PS_POSID` (PSP-Element) vorschlagen; **CO aktiv** → Kostenstellen-Ableitung vorschlagen; **QM aktiv** → Prüflos-Autoerstellung bei GR.

Konfigurieren via `/sc4sap:setup` (Schritt 4) oder `/sc4sap:sap-option modules`. Konsumiert von `create-program`, `create-object`, `analyze-cbo-obj`, allen Consultant-Agenten.

## SAP-Plattform-Erkennung (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` führt einen obligatorischen SAP-Versions-Preflight durch und liest `.sc4sap/config.json` für `sapVersion` und `abapRelease`:

- **ECC** — kein RAP/ACDOCA/BP; Syntax durch Release gegated
- **S/4HANA On-Premise** — klassisches Dynpro gewarnt; Extensibility-first, MATDOC + ACDOCA für Finance
- **S/4HANA Cloud (Public)** — **klassisches Dynpro verboten**; leitet auf RAP + Fiori Elements, `if_oo_adt_classrun` oder SALV-only um. Vollständige Liste in `common/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP + Business Partner APIs bevorzugt

## SPRO-Konfigurationsreferenz

Eingebaute Referenzdaten für alle 14 SAP-Module unter `configs/{MODULE}/`:
- `spro.md` — SPRO-Konfigurationstabellen/-views
- `tcodes.md` — Transaktionscodes
- `bapi.md` — BAPI/FM-Referenz
- `tables.md` — Schlüsseltabellen
- `enhancements.md` — BAdI / User Exit / BTE / VOFM
- `workflows.md` — Entwicklungsworkflows

Module: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW.

### SPRO Lokaler Cache (Token-Einsparung)

`/sc4sap:setup spro` extrahiert kundenspezifisches SPRO-Customizing nach `.sc4sap/spro-config.json`. Consultants folgen `common/spro-lookup.md`:
1. Lokaler Cache → 2. Statische Referenzen → 3. Live-MCP-Query (mit Bestätigung).

## SAP-spezifische Hooks

- **SPRO Auto-Injection** — Haiku LLM klassifiziert User-Input und injiziert relevante Modul-SPRO-Konfig
- **Transport-Validierung** — Prüft vor MCP Create/Update, ob Transport existiert
- **Auto-Aktivierung** — Triggert ABAP-Objekt-Aktivierung nach Create/Modify
- **Syntax-Checker** — Auto-Run semantischer Analyse bei ABAP-Fehlern
- **🔒 Datenextraktions-Blocklist** — `PreToolUse`-Hook blockiert Row-Extraction aus sensiblen SAP-Tabellen

## 🔒 Datenextraktions-Blocklist

Defense-in-Depth-Layer, der Row-Daten aus sensiblen Tabellen (PII, Credentials, Payroll, Banking, Transactional Finance) über `GetTableContents` / `GetSqlQuery` verhindert.

**Vier Enforcement-Layer**: L1 Agenten-Anweisungen · L2 globale Direktive in `CLAUDE.md` · L3 Claude Code `PreToolUse`-Hook · L4 MCP-Server Env-gated Guard.

**Blocklist-Quelle**: `exceptions/table_exception.md` ist der Index; tatsächliche Listen leben in 11 Section-Dateien unter `exceptions/`.

| Tier | Abdeckung |
|------|-----------|
| minimal | Banking/Payment, Master-Data PII, Addresses, Auth/Security, HR/Payroll, Tax/Govt IDs, Pricing/Conditions, custom `Z*` PII-Muster |
| standard | + Protected Business Data (VBAK/BKPF/ACDOCA/VBRK/EKKO/CDHDR/STXH + CDS) |
| strict | + Audit/Security Logs, Communication/Workflow |

**Aktionen**: `deny` (blockiert) vs `warn` (läuft mit Warnungsblock weiter). Wenn eine Tabelle in einem Call `deny` ist → ganzer Call blockiert.

**Profile** (bei `/sc4sap:setup` gewählt): `strict` / `standard` / `minimal` / `custom`. Standortspezifische Ergänzungen via `.sc4sap/blocklist-extend.txt`.

**Installation** (automatisiert durch `/sc4sap:setup`; manuell):
```bash
node scripts/install-hooks.mjs            # user-level
node scripts/install-hooks.mjs --project  # project-level
```

**Verifizieren**:
```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Erwartet: JSON mit "permissionDecision":"deny"
```

**L4 serverseitige Enforcement** (stoppt jeden Client — inklusive externer Skripte):
```bash
export SC4SAP_POLICY=on
export SC4SAP_POLICY_PROFILE=strict
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md
export SC4SAP_ALLOW_TABLE=TAB1,TAB2  # Session-Notfallausnahme (geloggt)
```

Schema/DDIC-Metadaten (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`) und Existence-Checks bleiben erlaubt.

## 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery` akzeptieren `acknowledge_risk: true` zum Umgehen des Ask-Tier-Gates. **Es ist eine Audit-Grenze, kein Convenience-Flag**.

1. **Nie `acknowledge_risk: true` beim ersten Call setzen** — lass den Hook/Server gaten
2. **Bei einer `ask`-Response**: STOP — Verweigerung an User weitergeben
3. **Explizite Ja/Nein-Frage** mit Nennung der Tabellen und des Scopes
4. **Nur mit `acknowledge_risk: true` erneut versuchen** nach explizitem bestätigenden Keyword: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `confirmed`
5. **Mehrdeutige Imperative sind KEINE Autorisierung** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"my mistake"`, Schweigen
6. **Pro-Call, pro-Tabelle, pro-Session** — Autorisierung wird nicht übertragen

Vollständiges Protokoll: `common/data-extraction-policy.md`.

### ⚠️ "Always allow"-Falle
Wenn ein `GetTableContents` / `GetSqlQuery`-Permission-Prompt erscheint, **"Allow once"** wählen, nie **"Always allow"**. Claude Code hängt die Tool-ID bei "Always allow" an `permissions.allow` an und deaktiviert damit dauerhaft dieses Sicherheitsnetz. Recovery: Parent-Skill erneut ausführen — `trust-session` Step 2 scannt und entfernt `GetTableContents`/`GetSqlQuery`-Einträge bei jedem Aufruf.

## 🔀 RFC-Backend-Auswahl

Screen / GUI Status / Text Element Operationen dispatchen über RFC-fähige FMs auf SAP. 5 Transport-Backends:

| `SAP_RFC_BACKEND` | Wie | Wann verwenden |
|---|---|---|
| `soap` (Standard) | HTTPS `/sap/bc/soap/rfc` | Die meisten Setups — läuft sofort, wenn ICF-Node aktiv ist |
| `native` | `node-rfc` + NW RFC SDK | Niedrigste Latenz; erfordert bezahltes SDK. _Veraltet — `zrfc` verwenden_ |
| `gateway` | HTTPS zu sc4sap-rfc-gateway Middleware | 10+ Teams, zentralisiert |
| `odata` | HTTPS OData v2 `ZMCP_ADT_SRV` | SOAP blockiert, OData Gateway erlaubt. [docs/odata-backend.md](odata-backend.md) |
| 🆕 `zrfc` | HTTPS ICF-Handler `/sap/bc/rest/zmcp_rfc` | SOAP zu, OData Gateway schwierig (typisches ECC). Kein SDK, kein Gateway — eine Klasse + ein SICF-Node |

Jederzeit wechseln via `/sc4sap:sap-option`, MCP neu verbinden, mit `/sc4sap:sap-doctor` verifizieren.

## 🏢 RFC-Gateway (Enterprise Deployment)

Für große SAP-Entwicklungsteams (Dutzende Entwickler) unterstützt sc4sap ein **zentrales RFC-Gateway**-Middleware, so dass Entwickler-Laptops nie das SAP NW RFC SDK / MSVC brauchen. Ein Linux-Host betreibt `node-rfc` + SDK; alle MCP-Clients sprechen HTTPS/JSON mit ihm.

**Wann wichtig**:
- IT-Richtlinie verbietet SAP NW RFC SDK auf Entwicklermaschinen
- SAP Basis hat `/sap/bc/soap/rfc` firmenweit deaktiviert
- Zentrales RFC-Logging, Rate Limiting, Entwickler-spezifische Audit-Trails nötig

**Konfiguration**:
```
/sc4sap:sap-option
# SAP_RFC_BACKEND=gateway
#     SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
#     SAP_RFC_GATEWAY_TOKEN=<team-or-per-user-bearer>
```

Gateway leitet Entwickler-Credentials via `X-SAP-*`-Header weiter — SAP-Audit-Log identifiziert den echten User.

> **Privates Repository.** Gateway-Quellcode in einem privaten Repo — Docker-Image muss gegen das SAP-lizenzierte NW RFC SDK gebaut werden (nicht redistribuierbar). Organisationen kontaktieren den Maintainer für Zugang, klonen, SDK selbst herunterladen (S-User), Image im eigenen Netz bauen. Open-Source-Nutzer: weiterhin `SAP_RFC_BACKEND=soap` (Standard).

Clientseitiges Design ist öffentlich (`abap-mcp-adt-powerup/src/lib/gatewayRfc.ts`) — der HTTP-Kontrakt ist dokumentiert, jede konforme Middleware (Node/Java/Python) funktioniert.

---

← [Zurück zur README](../README.de.md) · [Installation →](INSTALLATION.de.md) · [Changelog →](CHANGELOG.de.md)
