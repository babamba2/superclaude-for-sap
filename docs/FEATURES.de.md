# Funktionen im Detail

← [Zurück zur README](../README.de.md) · [Installation →](INSTALLATION.de.md)

## Inhaltsverzeichnis

- [27 SAP-spezialisierte Agenten](#27-sap-spezialisierte-agenten)
- [31 Skills](#31-skills)
- [Skills — Beispiele & Workflow](#skills--beispiele--workflow)
- [Routing im normalen Chat](#routing-im-normalen-chat)
- [Kostenmodi (standard / eco)](#kostenmodi-standard--eco)
- [Offline-Profil](#offline-profil)
- [Multi-Umgebungs-Profile (Dev / QA / Prod)](#-multi-umgebungs-profile-dev--qa--prod)
- [Fähigkeiten des MCP-ABAP-ADT-Servers](#fähigkeiten-des-mcp-abap-adt-servers--alleinstellungsmerkmale)
- [Gemeinsame Konventionen](#gemeinsame-konventionen-common)
- [Architektur zum Laden des Kontexts (v0.5.2+)](#architektur-zum-laden-des-kontexts-v052)
- [Konvention für das Antwort-Präfix (v0.5.2+)](#konvention-für-das-antwort-präfix-v052)
- [Branchenreferenz](#branchenreferenz-industry)
- [Länder- und Lokalisierungsreferenz](#länder--und-lokalisierungsreferenz-country)
- [Integration aktiver Module](#integration-aktiver-module)
- [Wissen zur SAP-Plattform (ECC / S/4 On-Premise / Cloud)](#wissen-zur-sap-plattform-ecc--s4-on-premise--cloud)
- [Referenz zum SPRO-Customizing](#referenz-zum-spro-customizing)
- [SAP-spezifische Hooks](#sap-spezifische-hooks)
- [Sperrliste für die Datenextraktion](#-sperrliste-für-die-datenextraktion)
- [acknowledge_risk — HARTE REGEL](#-acknowledge_risk--harte-regel)
- [SAP-Verbindung: Web-Port, RFC-Backend, NCo](#-sap-verbindung-web-port-rfc-backend-nco)

## 27 SAP-spezialisierte Agenten

| Kategorie | Agenten |
|----------|--------|
| **Kern (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Checker (1)** | `sap-checker` (Haiku) — schreibgeschützter Fan-out-Worker für Erkundungs-, Prüf- und Erkennungsaufgaben in einem engen Bereich; liefert strukturierte Zeilen, urteilt und korrigiert nie. Wird von `create-program`, `analyze-code`, `compare-programs`, `stock-cbo`, `cbo-relation-map` und `module-to-process` verwendet |
| **Basis (1)** | BC Consultant — Systemadministration, Transportverwaltung, Diagnose |
| **Discovery (1)** | CBO Stocker — CBO-Paketinventar, Verwendungsnachweis-Graph, Katalog wiederverwendbarer Objekte |
| **Module (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**Delegationsübersicht (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant` (betriebswirtschaftliche Semantik) oder `sap-bc-consultant` (Systemebene)
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant` (Transportstrategie, Berechtigungen, Performance, Dimensionierung, Patching) oder Modulberater
- `sap-analyst` / `sap-critic` / `sap-planner` haben zusätzlich einen verpflichtenden Block **Country Context** (lädt `country/<iso>.md`)
- **Direkter MCP-Lesezugriff** für Kern-Agenten — Werkzeuge für Paket, DDIC, Klasse, Programm, Verwendungsnachweis und Laufzeit-Dump sind schreibgeschützt; schreibende CRUD-Operationen bleiben bei `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger`

## 31 Skills

| Skill | Beschreibung |
|-------|-------------|
| `sc4sap:setup` | Plugin-Einrichtung — installiert den MCP-Server automatisch, erzeugt die SPRO-Konfiguration, installiert den Blocklist-Hook |
| `sc4sap:mcp-setup` | Eigenständige Anleitung zur Installation / Neukonfiguration des MCP-ABAP-ADT-Servers |
| `sc4sap:sap-option` | SAP-Profile ansehen / bearbeiten (Zugangsdaten, RFC-Backend, Blocklist, aktive Module), **Multi-Umgebungs-Profile verwalten** (Dev/QA/Prod wechseln/hinzufügen/entfernen) und HUD-Nutzungslimits |
| `sc4sap:sap-doctor` | Diagnose von Plugin + MCP + SAP (6 Ebenen) |
| `sc4sap:create-object` | Anlage von ABAP-Objekten (Hybridmodus — Transport + Paket bestätigen, anlegen, aktivieren) |
| `sc4sap:create-program` | Vollständige ABAP-Programm-Pipeline — Main+Include, OOP/Prozedural, ALV, Dynpro, Textelemente, ABAP Unit |
| `sc4sap:program-to-spec` | Reverse Engineering eines ABAP-Programms in eine Funktionale/Technische Spezifikation (Markdown / Excel) |
| `sc4sap:program-to-manual` | Anwenderhandbuch für ein Programm (einzelne HTML-Datei) — Szenarioschritte auf gezeichneten Bildschirmen mit nummerierten Beschriftungen, Prüfpunkte, Meldungen und Maßnahmen |
| `sc4sap:compare-programs` | Fachlicher Vergleich von 2–5 ABAP-Programmen, die dasselbe Szenario nach Modul / Land / Persona aufteilen — bearbeitbarer HTML-Bericht für Berater (Urteilsmatrix, Feldunterschiede, Bildschirme nebeneinander, Entscheidungshilfe; versioniert, englische Begleitversion) |
| `sc4sap:config-to-document` | Das Customizing eines Moduls aus dem Live-System dokumentiert (zuerst MM) — einzelne HTML-Datei entlang des Einführungsleitfadens: echte Tabellenwerte auf Bildschirmen im SM30-Stil, vom Kunden geänderte Zeilen mit Transporten, Customizing-Prüfungen, SAP-IMG-Dokumentation, von `sap-critic` geprüfte Beraternotizen, Bearbeitungsmodus in der Seite für Notizen, Werte und Änderungshistorie (`--import` übernimmt Änderungen in die nächste Version) |
| `sc4sap:interface-mapping-spec` | Schnittstellen-Mapping-Spezifikation — eine bearbeitbare HTML-Seite im Vorlagenlayout (Deckblatt, Änderungshistorie, Source → Target-Raster mit R / MAPPING, Antwortblock, Konvertierungsregeln, Extraktions-SQL, Feldleitfaden); SAP-Seite aus DDIC / RFC-Signatur oder aus einer Feldliste / einem Beratervorschlag bei neuen Schnittstellen; vorgeschlagene Gegenseite und Konvertierungsregeln; Prüfungen in der Seite; versioniert, englische Begleitversion |
| `sc4sap:smartform-preview` | Erwarteter Ausdruck eines SmartForms als JPG + HTML — Fenster in mm, SmartStyle-Schriften, Template-Raster, SE78-Grafiken, Schleifen mit Beispielzeilen; erfundene Beispielwerte in der Größe der DDIC-Typen; abgeschnittene Zellen und Fenster werden gemeldet (schreibgeschützt) |
| `sc4sap:smartform-from-pdf` | SmartForm aus einem PDF (oder Screenshot) des gedruckten Formulars erstellt — Templates aus den Linien, Texte in vorhandenen SmartStyle-Formaten, Felder / Positionsschleifen / Schnittstelle gemeinsam mit Ihnen festgelegt; auf DEV hochgeladen, dort gedruckt und an der Quellseite bewertet |
| `sc4sap:project-dashboard` | SAP-Projekt-Dashboard — eine bearbeitbare HTML-Seite pro Projekt (Zusammenfassung, KPIs, Meilensteine, PSP / Gantt, Risiken und Entscheidungen, Team, Historie) plus Portfolio-Seite und einseitiger Wochenstatus mit Q-Gate-Prüfung; WRICEF-Phasen je Modul- / Entwicklungsberater; Ist-Daten aus SAP gelesen (Transporte, Paketobjekte, Dumps) |
| `sc4sap:role-matrix` | Arbeitsmappe für Rollen und Berechtigungen — Geschäftsrollen, PFCG-Rollen, Rolle × T-Code F/C/D, Benutzer × Rolle, Berechtigungsobjekte, SoD-Konfliktprüfung; neuer Entwurf oder aus SAP gelesen (nur Benutzer-IDs); seitenweise Blätter für große Systeme |
| `sc4sap:analyze-code` | ABAP-Codeanalyse (Clean ABAP / Performance / Sicherheit) |
| `sc4sap:stock-cbo` | Inventarscanner für Customer Business Objects (CBO) mit modulübergreifender Lückenanalyse |
| `sc4sap:cbo-relation-map` | Beziehungslandkarte der Kundenobjekte eines oder mehrerer Pakete als eine HTML-Seite, gezeichnet aus dem `stock-cbo`-Graphen — Hubs, Verwendung, benannte Gruppen, Nachbarschaftsansicht im Obsidian-Stil, Auswirkung bis zu den TCodes, Pfade, Tabellen-CRUD, CRUD auf Feldebene (Reiter Fields, inkl. Kunden-Appends von Standardtabellen), Quelltextausschnitte, PNG / CSV; sammelt den Graphen, wenn er fehlt (ganzes Paket oder verwendete TCodes; eco = nur Landkarte) |
| `sc4sap:analyze-symptom` | Schrittweise Analyse von SAP-Betriebsfehlern/-Symptomen (Dumps, Logs, SAP-Hinweis-Kandidaten) |
| `sc4sap:ops-health-check` | Betriebsbericht (HTML für Kunden oder PMO: Zusammenfassung, KPIs gegenüber der Vorperiode, Dump-Trend, Probleme und Maßnahmen) — Dumps gruppiert und mit der Vorperiode verglichen, die Transporte, die ein abbrechendes Programm geändert haben, abgebrochene Jobs, Verbuchungsfehler, fehlerhafte IDocs; Urteil + nächste Schritte (schreibgeschützt) |
| `sc4sap:transport-readiness` | CTS-Prüfung von Transportaufträgen vor QA / PRD — offene Aufgaben, inaktive Objekte, lokale Pakete, gemeinsame Objekte (Importreihenfolge), nicht freigegebene DDIC-Abhängigkeiten, optionale Zielprüfung (Merge) über ein SM59-Ziel; Urteil pro Auftrag (schreibgeschützt) |
| `sc4sap:program-test` | Programm auf DEV testen, mit Zeilen aus DEV, QA oder (auf Wunsch) Produktion als Test Doubles (im MCP-Server maskiert, jede Produktionstabelle bestätigt) — erwartete Werte zuerst eingefroren, maskierte Daten, ABAP-Unit-Urteil pro Fall, Mutanten + Manipulationsprüfung, Anteil NOT_TESTABLE (kein Transport, Programm unberührt) |
| `sc4sap:uat-scenarios` | Szenarioset für UAT oder Integrationstest (SIT) — Beraterentwurf, Vorschläge Punkt für Punkt, T-Code-Prüfung, Fortschritt pro Zyklus, Excel-Export in zwei Layouts (in SAP schreibgeschützt) |
| `sc4sap:assist` | Business-Assistent — sucht konkrete Belege und ändert sie über die installierten Business Actions: Abfrage → Vorschau → Ihr Ja → Ausführung → Belegnummern (Produktion: nur Abfragen) |
| `sc4sap:smartform-to-adobe` | **Beta — die Ausgabequalität ist noch niedrig.** Umstellungsplan eines SmartForms auf ein Adobe-Formular, so wie es die SAP-Migration (CL_SSF_MIGRATION) macht — Knoteninventar, Schnittstelle / Kontext / Layout, das von SAP vorhergesagte Protokoll, stille Lücken mit manuellem Schritt; HTML-Bericht (schreibgeschützt; optionaler Lauf auf DEV für SAP-Beispielformulare) |
| `sc4sap:adobe-preview` | Erwarteter Ausdruck eines Adobe-Formulars (SFP, S/4HANA) als HTML / PDF / JPG mit erfundenen Beispielwerten in der Größe der DDIC-Typen der Schnittstelle; auf DEV können SAP-Beispielformulare am SAP-eigenen Ausdruck bewertet werden (schreibgeschützt) |
| `sc4sap:adobe-from-pdf` | Adobe-Formular aus einem PDF des gedruckten Formulars — wartet auf die Freigabe des DEV-Schreibhelfers, noch nicht lauffähig |
| `sc4sap:ask-consultant` | Direkte Frage-Antwort-Runde des Anwenders mit einem Modulberater-Agenten (SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC). Schreibgeschützt — berücksichtigt die konfigurierte SAP-Umgebung. |
| `sc4sap:module-to-process` | Eine bearbeitbare HTML-Prozesslandkarte pro Modul aus den TCodes, die Anwender tatsächlich ausführen (produktives ST03N): Standard-Backbone L1–L4 mit CBO-Aufgaben, Varianten, Verantwortlichen, Systemen; Schwimmbahnen je L3-Szenario; Aufgabenblatt im PDD-Stil je L4 mit belegten Geschäftsregeln, Schritten, Schnittstellen und S/4-Konvertierungshinweisen; optional Beraterprüfung, BPH-Abgleich, englische Begleitversion |
| `sc4sap:eco` | Einen Skill im Kostenmodus eco ausführen, ohne die Einstellungen zu ändern — `/sc4sap:eco <skill> <args>` (günstigere Sub-Agent-Modelle und geringerer Aufwand, gleiches Ergebnis) |
| `sc4sap:trust-session` | NUR INTERN — sitzungsweiter Bootstrap der MCP-Berechtigungen |

## Skills — Beispiele & Workflow

### `/sc4sap:create-object`
Anlage eines einzelnen Objekts im Hybridmodus: bestätigt Transport + Paket interaktiv, legt dann an, erstellt das Grundgerüst und aktiviert.
```
/sc4sap:create-object
→ "Create a class ZCL_SD_ORDER_VALIDATOR in package ZSD_ORDER"
```
Ablauf: Typ ableiten → Paket + Transport bestätigen → MCP `Create*` → erste Implementierung → `GetAbapSemanticAnalysis` → aktivieren.

### `/sc4sap:create-program`
Die Hauptpipeline zur Programmerstellung — Main + Include-Kapselung, OOP oder Prozedural, volle ALV- und Dynpro-Unterstützung.
```
/sc4sap:create-program
→ "Make an ALV report for open sales orders, selection screen by sales org + date range"
```
Ablauf (Phase 0–8):
- Phase 0 — Vorabprüfung der SAP-Version + Laden der aktiven Module
- Phase 1A — betriebswirtschaftliches Interview durch den Modulberater (Vorabprüfung Branche/Land, fachlicher Zweck, SAP-Standardalternative)
- Phase 1B — technisches Interview durch `sap-analyst` + `sap-architect` (7 Dimensionen)
- Phase 2 — Planung mit Prüftoren zur Wiederverwendung von CBO + Customizing
- Phase 3 — Spezifikation + Freigabe durch den Anwender
- Phase 3.5 — Prüftor für den Ausführungsmodus (`auto` / `manual` / `hybrid`)
- Phase 4 — parallele Include-Erzeugung → gebündelte Aktivierung
- Phase 5 — ABAP Unit
- Phase 6 — Konventionsprüfung in 4 Gruppen (Sonnet parallel, Eskalation an Opus bei MAJOR-Befunden)
- Phase 7 — Debug-Eskalation
- Phase 8 — Abschlussbericht mit Zeittabelle

### `/sc4sap:analyze-code`
```
/sc4sap:analyze-code
→ "Review ZCL_SD_ORDER_VALIDATOR for Clean ABAP violations and SELECT * usage"
```

### `/sc4sap:stock-cbo`
Durchläuft ein Z-Paket, katalogisiert wiederverwendbare Objekte und führt eine modulübergreifende Lückenanalyse durch.
```
/sc4sap:stock-cbo
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```
Ablauf: `GetPackageTree` → Durchlauf nach Kategorien → Häufigkeitsheuristik → modulübergreifende Lückenprüfung → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.

### `/sc4sap:cbo-relation-map`
Zeichnet den Referenzgraphen, den `stock-cbo` aufbaut (`graph.json`), als eine eigenständige HTML-Seite pro Paket, koreanisch plus englische Begleitversion. Es erscheinen nur Kundenobjekte — Mitglieder des Pakets sowie Z- / Y- / Namespace-Objekte außerhalb des Pakets; Standardziele bleiben weg. Beziehungen: DDIC-Typisierung, Prüftabellen, Suchhilfen, Wertetabellen, Zeilentypen, View-Basen, Sammelsuchhilfen und aus dem Quelltext Includes, Aufrufe, Submits, Transaktionen, Lese- und Schreibzugriffe — jeweils markiert als in DDIC angegeben, im Quelltext angegeben oder abgeleitet, mit der DD*-Zeile oder Quelltextzeile. Includes werden in ihr Programm oder ihre Funktionsgruppe eingefaltet; Beschreibungen (Walk / Inventar), Verwendung (`usage-result.json`) und Standard-Prüftabellen (DD08L, nur als Text gezeigt) kommen hinzu, wenn der Inventarordner sie enthält. Die Übersicht listet die Hubs nach fachlichen Beziehungen (Typisierungs-Hubs getrennt), Verwendungszahlen und automatisch benannte Louvain-Gruppen; die Erkundungsansicht ist wie der Graph von Obsidian gezeichnet (Canvas, Hover hebt die Nachbarn hervor, Namen blenden beim Zoomen ein) mit Beziehungsvorgaben und Filtern nach Art, Typ, Basis, Verwendung und Paket; das Seitenpanel zeigt die Auswirkung einer Änderung bis zu den TCodes und jede Beziehung mit einem Quelltextausschnitt von ±10 Zeilen; Pfade laufen in beliebiger Richtung oder entlang der Pfeile mit bis zu drei Alternativen; ein Reiter Table CRUD listet, wer jede Tabelle anlegt, liest, ändert und löscht; Export als PNG und CSV. Mehrere Pakete werden zu einer Seite zusammengeführt (Farbe nach Paket). Fehlt der Graph, sammelt der Skill ihn selbst — ganzes Paket (Standard: vollständiges `stock-cbo`; eco: Haiku-Walk + nur Step G) oder die TCodes, die Anwender tatsächlich ausführen (`usage-scope.mjs`). Die Seite selbst ruft SAP nicht auf. `build-relation-map.mjs find --base <dir> … --packages <list>` findet die Graphen offline (ein Ordner pro Paket und Umfang, fehlende und mehrdeutige Pakete werden benannt), sodass ein gehosteter Lauf (die Web-App) die Seite in einem Schritt bauen kann; `--src` (wiederholbar), `--max-bytes` (Neuaufbau ohne Ausschnitte, sonst Exit 3) und `--sid` dienen diesem Lauf.

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_DEMO_POSTING at line 234 during F110"
```
Ablauf: `RuntimeListDumps` → `RuntimeAnalyzeDump` → Stack-Trace → SAP-Hinweis-Kandidaten → Lösungsoptionen.

### `/sc4sap:program-to-spec`
Reverse Engineering eines ABAP-Programms in eine Spezifikation (Markdown/Excel) mit sokratischer Eingrenzung des Umfangs.

### `/sc4sap:program-to-manual`
Schreibt das Handbuch, dem ein Fachanwender folgt: ein Szenario pro Aufgabe („Bestellungen senden", „fehlende Wareneingänge prüfen"), jeder Schritt auf einem gezeichneten Bild des Bildschirms — Selektionsbild, ALV-Ausgabe, Popups und Folgebilder — mit nummerierten Beschriftungen, dazu Prüfpunkte aus den Validierungen im Quelltext, eine Feldreferenz, Meldungen mit der auszuführenden Maßnahme, ein Glossar und eine automatische Änderungshistorie. Eine eigenständige HTML-Datei: am Bildschirm ein Webdokument, im Druck ein Schritt pro A4-Querformat-Seite. Autor, Team, Firma und der Vertraulichkeitshinweis stammen aus der Profildatei `config.json` → `manual`.

### `/sc4sap:uat-scenarios`
Pflegt die UAT-Szenarien eines Moduls oder Prozessbereichs — oder den Integrationstest (SIT) eines durchgängigen Ablaufs über mehrere Module, bei dem jeder Schritt sein Modul trägt und jede Übergabe prüfen muss, was angekommen ist — als ein JSON-Set (`scripts/uat/build-uat.mjs`), das über die Testzyklen bearbeitet statt neu geschrieben wird: Szenarien tragen ihre Prozesskette, ihren Prozess und ihre Aufgabe sowie STEP-Zeilen mit Aktivität, System (SAP oder das angebundene System), T-Code, Prüfpunkten, Eingabedaten, erwarteter Ausgabe, Benutzer-ID des Testers, einem Ergebnis pro Zyklus (pass / fail / blocked), Status, Folgemaßnahme und Issue. Der Modulberater entwirft das Set und schlägt später Änderungen als Patch-Operationen vor (`set-scenario`, `set-step`, `add-step`, `remove-step`, `add-scenario`), die aufgelistet und nur für die vom Anwender akzeptierten Nummern angewendet werden — eine Operation, die einen fehlenden Schritt nennt, wird mit Begründung übersprungen. Der T-Code jedes SAP-Schritts wird mit `GetTransaction` geprüft; `check` listet Lücken (Schritte ohne T-Code oder erwartetes Ergebnis, fehlgeschlagene Schritte ohne Folgemaßnahme) und den Fortschritt pro Zyklus. Exporte: Layout A (Zeitplan, Aktivitäten, ein Blatt pro Szenario mit Übersicht und Testablauf) und Layout B (flache Liste mit einer Kopfzeile pro Szenario und einem Blatt mit Tester-IDs), ohne Tabellenkalkulationsbibliothek geschrieben.

**Defekte und Korrekturen** (`build-uat.mjs defects`). Jedes Issue nennt die Aufträge, die es beheben (`transports`, beliebiges `<SID>K<6>`), und seinen Retest-Zyklus; mit dem `model.json` einer CTS-Prüfung zeigt die Seite pro Defekt den CTS-Status der Aufträge und einen Status — kein Korrekturauftrag, Korrektur nicht geprüft, Korrektur in Arbeit, bereit zum Transport (CTS bereit oder freigegeben; der Import in QA wird nicht gelesen), Retest fällig, Retest bestanden / fehlgeschlagen. Auftragstexte, die `ISS-0003` oder `<SET>/ISS-0003` nennen, kommen als vorgeschlagener Patch zurück, nie als Verknüpfungen. `<ID>-defects.json` ist der KPI-Feed, den das Projekt-Dashboard liest (`uat-defects-open`, `uat-defects-no-fix`, `uat-fix-ready`, `uat-retest-due`, `uat-retest-pass-rate`).

### `/sc4sap:transport-readiness`
Beantwortet „Können diese Aufträge heute Nacht raus, und in welcher Reihenfolge?", bevor jemand STMS öffnet. `scripts/transport/build-tr-check.mjs collect` liest die Aufträge (nach Nummer, nach Eigentümer oder nach einem Textmuster wie `[SD]%`), ihre Aufgaben und Objekte (E070 / E07T / E071, Aufgabenobjekte in ihren Auftrag eingefaltet), dieselben Objekte in anderen offenen Aufträgen, die Pakete der Objekte (TADIR) und die Aktivierung (DWINACTV, wo das System es liest, sonst die ADT-Liste inaktiver Objekte für den Verbindungsbenutzer — als teilweise gemeldet) und für Kunden-DDIC-Objekte in anderen nicht freigegebenen Aufträgen der letzten 90 Tage, ob der Code dieses Auftrags sie verwendet (`GetWhereUsed`). Mit `--target-dest <SM59 destination>` liest er zusätzlich das Zielsystem über `GetRemoteTableContents` (RFC_READ_TABLE, ≤ 200 Objekte): TADIR (existiert das Objekt, welches Paket), VRSD (der Auftrag der letzten Änderung jedes Teils — ein zielseitiger Transport von Kopien exportiert nur und wird übergangen; eine Auftragsnummer, die die Quelle nicht kennt oder mit anderem Datum kennt, ist eine Änderung im Ziel oder auf anderem Weg) und für die Kunden-DDIC-Objekte, die der Code verwendet (Abhängigkeitszeilen und D010TAB), das Ziel-TADIR. Neue Befunde: *im Ziel geändert* und *im Ziel fehlend* blockieren, *älter als im Ziel* (Rollback) und *Ziel nicht gelesen* warnen. `build` gibt jedem Auftrag ein Urteil — blockiert (offene Aufgabe, inaktives Objekt, lokales Paket, nicht freigegebene DDIC-Abhängigkeit), prüfen (gemeinsame Objekte, teilweise Liste inaktiver Objekte), bereit — und die erste Korrektur.

**CAB-Änderungsnotizen** (Modus cab). `collect --cab` ergänzt einen Lesezugriff — eingeplante und freigegebene Jobs (TBTCO Status S / P) mit ihren Schrittprogrammen (TBTCP). `scripts/transport/build-cab-notes.mjs prepare` (offline) gibt jedem Auftrag eine Karte: die Objekte, was sie betreffen — die umgekehrte Reichweite über den CBO-Graphen von `stock-cbo` mit der Auswirkungsregel der Beziehungslandkarte (erster Schritt über jede Beziehung, danach Code-Beziehungen, bis zu 6 Schritte) bis zu den TCodes mit ihrer ST03N-Nutzung, und die eingeplanten Jobs, die ein betroffenes Programm ausführen — Testnachweise nur aus dem, was benannt ist — ein Projekt-Dashboard (WRICEF-Auftrag oder Objekte), UAT-Sets, die dieses Dashboard nennt oder listet (ein verknüpftes Issue oder ein Schritt auf einem betroffenen T-Code, als Vermutung markiert), je mit ihrer Set-ID, eine Risikostufe H / M / L nach festen Regeln und sachliche Rollback-Hinweise, die immer mit „no automatic rollback" beginnen (vorherige Zielversion aus VRSD — in einen neuen Auftrag zurückspielen, den alten Auftrag nie erneut importieren; neues Objekt; Tabellendaten; Customizing; *Ziel ungeprüft*, wenn das Ziel nicht gelesen wurde). Eine Auftragsgruppe ohne Graph zeigt *Auswirkung nicht erhoben*, nie „keine". `sap-writer` entwirft zwei bis drei fachliche Sätze pro Auftrag; `save` weist einen Satz zurück, der ein Objekt, einen T-Code oder eine Nummer nennt, die nicht in seiner Eingabe steht. Die Seite (ko / en, A4 quer) kennzeichnet den Text als *AI draft*, bis ein Mensch ihn bearbeitet; die CAB-Entscheidung und die Kommentare tippen Menschen; Save → `import` behält die Änderungen.

### `/sc4sap:ops-health-check`
Die Morgenprüfung des SM- / AMS-Betriebs. `scripts/ops/build-ops-check.mjs collect` liest für einen Zeitraum (Standard seit gestern) und den gleich langen Zeitraum davor: die Kurzdumps (`RuntimeListDumps` — den ADT-Feed und auf ECC die ST22-Liste), die Transportaufträge ab einer Woche vor dem Zeitraum mit ihren Texten und Code-Objekten (E070 / E07T / E071), abgebrochene Jobs (TBTCO Status A mit dem Programm des ersten Schritts), Verbuchungsaufträge mit Fehler (VBHDR) und IDocs mit Fehlerstatus (EDIDC). `build` gruppiert die Dumps nach Laufzeitfehler und Programm, markiert die Gruppen, die gegenüber der Vorperiode neu sind, listet neben einer Gruppe die Aufträge auf, die ihr Programm, Include, ihre Funktionsgruppe oder Klasse vor dem letzten Dump geändert haben, und gibt ein Urteil (rot / gelb / grün) mit dem nächsten Schritt für jeden Befund — `/sc4sap:analyze-symptom` für eine Dump-Gruppe, SM37 / SM13 / BD87 für den Rest. Auf BASIS < 7.50 laufen die Lesezugriffe über die Aktion `TABLE_READ` von `ZMCP_ADT_DISPATCH`, die die Kopftabellen für Jobs, Verbuchung und IDocs namentlich liest (Job-Logs, Verbuchungsdaten und IDoc-Daten bleiben gesperrt); ein älterer Dispatcher lehnt sie ab, und sie erscheinen als *nicht lesbar — in SM37 / SM13 / WE02 prüfen*, nie als leer. Es werden keine Inhalte von Geschäftsbelegen gelesen; Benutzernamen werden gezählt, nie aufgelistet. Eine eigenständige HTML-Seite (ko / en / ja, hell und dunkel, Druck A4 quer) unter `ops-check/<to>/` der Artefaktbasis des Profils.

### `/sc4sap:program-test`
Testet ein Programm auf DEV, bevor sein Transport weiterwandert. Sie nennen das Programm; der Skill fragt nach der Datenquelle (standardmäßig DEV-Zeilen, eine maskierte Stichprobe von QA- oder Produktionszeilen über das SM59-Ziel, das mit `/sc4sap:sap-option` → *Test data sources* gespeichert wurde) und nach dem Kostenmodus und gibt einen Laufplan aus — die Schritte, die `$TMP`-Testprogramme, die er anlegt, und was Sie gefragt werden —, bevor irgendetwas läuft. Testfälle und erwartete Werte werden aus der Spezifikation und dem Quelltext festgelegt und zuerst eingefroren; die Zeilen werden zu Test Doubles in einem `$TMP`-Harness, der den eigenen Code des Programms mit ABAP Unit ausführt; eingepflanzte Mutanten und ein manipulierter erwarteter Wert müssen fehlschlagen. Das Urteil pro Fall stammt aus dem ABAP-Unit-Ergebnis; der Bericht beginnt mit dem Anteil der nicht testbaren Fälle und bietet nach einem grünen Lauf `/sc4sap:transport-readiness` an.

### `/sc4sap:assist`
Macht aus einem Satz über konkrete Belege („offene Bestellungen von Lieferant 100023", „Fakturasperre auf Auftrag 4711 setzen") eine Business Action des angebundenen Systems: Es fragt Offenes Frage für Frage nach, zeigt die Abfrage als Tabelle, zeigt bei einer Änderung eine Vorschau vorher → nachher mit den Meldungen von SAP und führt nur nach Ihrem Ja genau für diese Vorschau aus. Benötigt `SAP_TOOL_PROFILE=biz` oder `all` und die SAP-seitigen Business-Handler; Produktionsprofile erhalten nur Abfragen.

### `/sc4sap:smartform-to-adobe`
> **Beta — die Ausgabequalität ist noch niedrig.** Prüfen Sie jedes Ergebnis in SFP, bevor Sie sich darauf verlassen.

Bevor jemand die SmartForm-Migration von SAP ausführt (sie speichert sofort und hat keinen Testmodus), ermittelt der Skill Knoten für Knoten, was die Migration aus dem Formular macht — Schnittstelle, Kontext, Layout, die von SAP vorhergesagten Meldungen und was SAP ohne Meldung verwirft — und schreibt einen HTML-Bericht (`adobe-plan-<lang>.html`) mit der Lückenliste, stille Lücken zuerst, und dem manuellen Schritt für jede. Für SAP-Beispiel-SmartForms auf DEV kann er die Migration in neue `$TMP`-Objekte ausführen; das migrierte Formular wird dann mit `/sc4sap:adobe-preview` gezeichnet.

### `/sc4sap:adobe-preview`
Zeichnet, was ein Adobe-Formular (S/4HANA) ohne Druckprogramm ausgibt: Masterseiten, fließende Tabellen mit wiederholten Kopfzeilen, Seitenumbrüche, Picture-Klauseln, Rich Text, Bilder — gefüllt mit erfundenen Werten in der Größe der DDIC-Typen der Schnittstelle. Immer HTML, PDF und JPG mit Chrome / Edge. Auf DEV können SAP-Beispielformulare über ADS gedruckt und an der Vorschau bewertet werden.

### `/sc4sap:ask-consultant`
Eine direkte Frage an einen Modulberater-Agenten („Wo wird die Kreditprüfung bei der Lieferungsanlage customized?"). Die Frage wird per Schlüsselwörtern an `sap-{module}-consultant` (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba, BC) geleitet und anhand von SAP-Version, Branche, Land und aktiven Modulen des Profils beantwortet, zuerst mit dem lokalen SPRO-Cache. Schreibgeschützt — keine Schreibzugriffe, keine Extraktion von Zeilen. Eine Frage zu konkreten Belegen („welche Bestellungen sind offen?") wird im selben Zug an `/sc4sap:assist` übergeben.

### `/sc4sap:compare-programs`
Vergleicht 2–5 Programme, die dasselbe Geschäftsszenario abbilden, aber nach Modul, Land, Persona oder Zeithorizont aufgeteilt sind. Sonnet / Haiku extrahieren die Fakten jedes Programms; ein Opus-Durchgang schreibt den Vergleich für einen Fachberater: eine Urteilsmatrix mit *Differences only*, Feldunterschiede, die Selektions- und Ausgabebilder nebeneinander und eine Entscheidungshilfe. Ein bearbeitbarer, versionierter HTML-Bericht mit englischer Begleitversion.

### `/sc4sap:config-to-document`
Dokumentiert das Customizing eines Moduls so, wie es im System steht (zuerst MM; andere Module über dieselbe Pipeline). Die Seite folgt dem Einführungsleitfaden des Moduls; jede IMG-Aktivität zeigt ihre echten Tabellenwerte auf einem Bildschirm im SM30-Stil, durch Kundentransporte geänderte Zeilen sind mit ihrer Transporthistorie markiert, Customizing-Prüfungen laufen über die Werte, und die eigene IMG-Dokumentation von SAP wird angehängt. Beraternotizen schreibt der Modulberater-Agent, `sap-critic` prüft sie. Der Umfang (Bereiche, Notizpakete) wird vorab mit seinen gemessenen Kosten gewählt.

### `/sc4sap:interface-mapping-spec`
Schreibt eine Schnittstellen-Mapping-Spezifikation als eine bearbeitbare HTML-Seite im klassischen Vorlagenlayout: Deckblatt, Änderungshistorie, Kopf, das Source → Target-Raster mit Konvertierungsregeln und MAPPING, ein optionaler synchroner Antwortblock, die Extraktionsbedingung und ein Feldleitfaden. Die SAP-Seite wird aus DDIC (Tabelle, Struktur, View) oder aus der Signatur eines Funktionsbausteins gelesen; bei einer neuen Schnittstelle stammt sie aus einer Feldliste oder dem Vorschlag des Modulberaters. Die Gegenseite wird vorgeschlagen; Prüfungen in der Seite markieren Lücken; versioniert mit englischer Begleitversion.

### `/sc4sap:module-to-process`
Bildet ab, wie ein Modul im System läuft, anhand der T-Codes, die Anwender tatsächlich ausführen (produktives ST03N über `SAP_USAGE_RFCDEST` oder eine gespeicherte Nutzungsliste): verwendete T-Codes → Programme → Quelltexte → Referenzgraph → der Standard-Prozess-Backbone L1–L4 mit Varianten. Ergebnis: eine bearbeitbare HTML-Seite mit der BPH-Tabelle, Schwimmbahnen je L3-Szenario, einer Variantenmatrix und einem Aufgabenblatt pro L4-Aufgabe (Verantwortlicher, System, Geschäftsregeln mit Quelltextzeilen, Schritte, zugehörige Objekte, Schnittstellen, Konvertierungshinweise). Der Gap-Modus macht aus einer vorhandenen Landkarte eine Fit- / Partial- / Gap-Analyse mit WRICEF-Kandidaten für das Projekt-Dashboard.

### `/sc4sap:eco`
`/sc4sap:eco <skill> <args>` führt einen Skill nur für diesen Lauf im Kostenmodus eco aus — siehe [Kostenmodi](#kostenmodi-standard--eco).

### `/sc4sap:smartform-preview`
Zeichnet den erwarteten Ausdruck eines SmartForms ohne dessen Druckprogramm: `GetSmartFormContent` liest das Formular, seine SmartStyles und seine SE78-Grafiken; die Fenster werden an ihren mm-Positionen gezeichnet, mit Template-Rastern (Rahmen, Schattierung), Schleifen mit Beispielzeilen und den Grafiken in gedruckter Größe, dann von Headless Chrome / Edge als JPG gespeichert. Jedes `&field&` erhält einen erfundenen Beispielwert in der Größe seines DDIC-Typs (keine Geschäftsdaten), sodass das Bild die echten Abschneidungen zeigt — der Bericht listet die Zellen und Fenster, deren Inhalt nicht passt.

### `/sc4sap:smartform-from-pdf`
Die Gegenrichtung: erstellt ein SmartForm aus einem PDF des gedruckten Formulars (oder einem Screenshot, Positionen geschätzt). `read-pdf.mjs` liest die Seite — jeden Text mit Position, Schrift und Größe, die Linien und die Bilder — ohne Abhängigkeiten; `plan-form.mjs` macht aus Linienbereichen Templates und setzt jeden Text in seine Zelle oder ein eigenes Fenster, im Absatz- und Zeichenformat eines **vorhandenen** SmartStyles, der seine Schrift druckt (es wird kein Style angelegt); der Hauptthread entscheidet mit Ihnen, welche Texte Felder sind, welche Rasterzeilen Positionszeilen sind (eine Schleife über eine interne Tabelle) und welche DDIC-Typen die Schnittstelle hat (`shape-form.mjs`); `write-form.mjs` schreibt das XML des Form Builders. Das Formular wird auf das DEV-System hochgeladen (`CreateSmartForm`), dort gedruckt (`RenderSmartForm`) und der Ausdruck an der Quellseite bewertet (`compare-layout.mjs`).

### `/sc4sap:project-dashboard`
Eine bearbeitbare Seite pro SAP-Projekt und eine Portfolio-Seite über alle. Der Plan stammt aus einer Vorlage für den Projekttyp (Neueinführung auf SAP Activate, S/4-Konvertierung, Rollout, AMS-Release, Kleinprojekt); der Fortschritt kommt vom PM im Bearbeitungsmodus und aus dem angebundenen System, schreibgeschützt: Transportaufträge getrennt nach Customizing (Konfigurationsarbeit) und Workbench (Entwicklungsarbeit), Paketobjekte, inaktive Objekte und Dumps nach dem Go-live. Jedes WRICEF-Element durchläuft seine Phasen mit einem Modulberater und einem Entwicklungsberater, sodass die Übergabewarteschlange zwischen beiden sichtbar ist. Teammitglieder kommen und gehen mit Datum; offene Punkte von Ausgeschiedenen werden zur Neuzuweisung markiert. Bearbeitung im Tabellenstil mit fester Kopfzeile, auch mobil.

Wochenstatus: `build-project-doc.mjs status --project <CODE> [--week-end] [--gate] [--evidence <file>]…` schreibt einen einseitigen Status (A4, höchstens zwei gedruckte Seiten, Layout für Smartphones) — Gesamt- und Workstream-RAG mit der eigenen Einschätzung des PM, was sich seit dem letzten Statuslauf bewegt hat, KPI-Änderungen, wichtigste Risiken, nötige Entscheidungen, Meilensteine der nächsten zwei Wochen — und hält die Woche im Modell fest (`statusLog`, 26 Wochen), sodass die Dashboard-Seite die Baseline der nächsten Woche trägt. Mit einem Gate wird jedes Ausstiegskriterium an den übergebenen Nachweisen geprüft (CTS-Prüfung, UAT-Seite oder -Set, Betriebsbericht, UAT-Defekt-Feed) über ein optionales Regel-Tag (`[cts-blocked<=0]`, `[uat-pass:2nd>=95]`, `[defects-open<=3]`, `[wricef>=ut:80]` …), und ein Urteil wird vorgeschlagen; der Meilensteinstatus des PM bleibt bestehen. Risiken und Entscheidungen sind Modelllisten, die in einem eigenen Reiter bearbeitet werden. Offline, außer mit `--refresh`.

### `/sc4sap:role-matrix`
Das Dokument zu Rollen und Berechtigungen als eine bearbeitbare Arbeitsmappe: Deckblatt mit Prüfungen, Geschäftsrollen, PFCG-Rollen, Matrix Geschäftsrolle × T-Code (F Vollzugriff / C Ändern / D Anzeigen), Zuordnung Benutzer × Rolle, Berechtigungsobjekte, SoD-Regeln mit automatischer Konfliktprüfung pro Benutzer und innerhalb einer Rolle, Änderungshistorie. Neuer Entwurf: Der Modulberater schlägt Rollen, T-Codes, Berechtigungsobjekte und SoD-Regeln vor, eingegrenzt auf die T-Codes, die Anwender ausführen, wenn ST03N-Nutzung vorliegt. Aus SAP: Die PFCG-Rollentabellen werden gelesen (Stufen aus ACTVT geschätzt und mit „?" markiert); Benutzerzuordnung nur nach Benutzer-ID und Gültigkeit — Benutzerstamm-, Anmelde- und Kennworttabellen werden nie gelesen, Namen und Abteilungen werden von Hand eingetragen. Rollennamen werden in Bereichen jenseits der 5.000-Zeilen-Grenze eines Lesezugriffs gelesen, und lange Blätter werden seitenweise geführt (Zeilen und 50 Rollenspalten), während Suche, CSV und Einfügen auf dem ganzen Blatt arbeiten.

**Triage-Modus** — ein Benutzer erhält „keine Berechtigung" in einem T-Code: Die SU53-Prüfungen (oder, nur aus der Meldung, die Startprüfungen des T-Codes und die SU24-Vorschläge als Schätzung) werden pro Berechtigungsinstanz gegen die Rollen des Benutzers ausgewertet, mit einem von vier Urteilen — A fehlt, B vorhanden, aber nicht wirksam (Profilgenerierung / Benutzerabgleich), C Zuordnung heute nicht gültig (beendet oder noch nicht begonnen), D unklar. Bis zu fünf Kandidatenrollen werden nach dem Prinzip der minimalen Berechtigung vorgeschlagen, jede mit den SoD-Konflikten auf T-Code-Ebene, die sie hinzufügen würde. Eine HTML-Seite plus eine kurze Ticket-Zusammenfassung; schreibgeschützt; nur die Rollenzuordnungen dieses Benutzers werden gelesen, ein PRD-Lauf fragt zuerst, und die Benutzer-ID bleibt aus Dateinamen und Titeln heraus.

### `/sc4sap:sap-doctor`
Diagnose von Plugin + MCP + SAP-Konnektivität. Das Erste, was Sie ausführen, wenn etwas nicht stimmt.

### `/sc4sap:sap-option`
`.sc4sap/sap.env` ansehen und bearbeiten — Zugangsdaten, RFC-Backend, Blocklist-Richtlinie, aktive Module. Geheimnisse sind maskiert.

## Routing im normalen Chat

Die meisten Anwender beschreiben, was sie wollen, statt einen Slash-Befehl zu tippen. Ein Auszug aus [`common/skill-router.md`](../common/skill-router.md) wird beim Sitzungsstart eingespielt:

- **Direkt ausführen**: Wie- / Warum- / Customizing-Fragen → `ask-consultant`; konkrete Belege (offene Bestellungen, Warenausgang buchen, freigeben, sperren, stornieren) → `assist` (bestätigt vor jedem Schreibzugriff); ein Dump oder Fehler eines Laufs → `analyze-symptom`; tägliche Prüfung / fehlgeschlagene Jobs / Betriebsbericht → `ops-health-check`; dürfen diese Aufträge nach QA / PRD → `transport-readiness`; Verbindungsprobleme → `sap-doctor`.
- **In einer Zeile vorschlagen, bei Ja ausführen**: Skills für Ergebnisse und Schreibzugriffe (create-program, program-to-spec, config-to-document, uat-scenarios, …).
- **Nicht geroutet**: ein vom Anwender getippter Slash-Befehl, ein bereits laufender Skill, Fragen zum Plugin selbst.

[`common/intent-router.md`](../common/intent-router.md) teilt einen Satz in Wissen (`ask-consultant`), Abfrage oder Aktion (`assist`) auf, ohne dass der Anwender ihn neu tippen muss.

## Kostenmodi (standard / eco)

| Modus | Was sich ändert |
|---|---|
| `standard` (Standardwert) | Die Skills wie geschrieben — Opus für Urteile, Sonnet für Vorlagen und Massen-Schreibarbeit, Haiku-Checker für Abruf / Prüfung / Erkennung |
| `eco` | Günstigere Sub-Agent-Modelle und geringerer Aufwand, geringerer Aufwand im Hauptthread; **dasselbe Ergebnis und dieselben Prüfungen** (Reviews, Verifikations-Gates und Sicherheitsschritte werden nie übersprungen) |

Einstellen mit `/sc4sap:sap-option` (`costMode`, oder pro Skill in `costModeBySkill`) oder für einen Lauf mit `/sc4sap:eco <skill> <args>`. Reihenfolge der Auflösung und die Tabellen pro Skill: [`common/cost-mode.md`](../common/cost-mode.md). Skills, die nach einem Modus fragen (zum Beispiel `program-test`), fragen nur, wenn nichts Obiges entscheidet.

## Offline-Profil

Ein Profil mit `connection: offline` hat keine SAP-Verbindung; die MCP-Bridge bleibt aus. Jeder Skill ist **full** (funktioniert gleich, z. B. `uat-scenarios` — T-Codes als ungeprüft markiert), **degraded** (funktioniert ohne Systemabfragen oder mit vom Anwender gelieferten Dateien, z. B. `ask-consultant` aus Referenzen und lokalen Dateien, `smartform-to-adobe` auf einem heruntergeladenen Formular-XML) oder **blocked** (antwortet mit einer Stopp-Zeile). Die Liste und die Reihenfolge des lokalen Wissens stehen in [`common/offline-mode.md`](../common/offline-mode.md).

## 🌐 Multi-Umgebungs-Profile (Dev / QA / Prod)

**Multinationale SAP-Kunden betreiben pro Rechtseinheit eine 3-stufige Systemlandschaft** (Sandbox / Dev / QA / Prod; oft mehrere Rechtseinheiten: KR, US, DE …). sc4sap unterstützt die Verwaltung aller dieser Systeme aus einer einzigen Claude-Code-Sitzung, mit **automatischen Sicherheitsschranken auf allen Nicht-Dev-Stufen.**

### Ablage der Profile

| Wo | Was |
|---|---|
| `~/.sc4sap/profiles/<alias>/sap.env` | Profildefinition auf Benutzerebene (Verbindung, Stufe, Branche, Module). Gilt für alle Repositories. |
| `~/.sc4sap/profiles/<alias>/config.json` | Konfiguration pro Profil auf Benutzerebene (Namenskonvention, systemInfo, Historie des aktiven Transports). |
| `~/.sc4sap/profiles/.trash/` | Weich gelöschte Profile, 7 Tage nach dem Entfernen automatisch bereinigt. |
| `<project>/.sc4sap/active-profile.txt` | Zeiger auf Projektebene — mit welchem Profil dieses Repository gerade spricht. |
| `<project>/.sc4sap/work/<alias>/` | Projektartefakte (Spezifikationen, CBO-Kataloge, Audits) pro Profil. Schreibgeschützte Querschau: Eine QA-Sitzung sieht Dev-Spezifikationen, aber Schreibzugriffe landen immer unter dem aktiven Profil. |

### Schreibschutz nach Stufe (strikte Richtlinie)

`SAP_TIER` ist eine Aufzählung: `DEV` | `QA` | `PRD`. Nicht kanonische Stufen (Sandbox, Staging, Pre-Prod, Training) werden auf die sicherere Entsprechung abgebildet (z. B. Staging → PRD).

| Werkzeugfamilie | DEV | QA | PRD |
|---|---|---|---|
| `Create*` / `Update*` / `Delete*` (DDIC, ABAP, CDS, BO, SB, MDE, Screen, GUI, Package) | ✓ | ✗ | ✗ |
| `CreateTransport` | ✓ | ✗ | ✗ |
| `RunUnitTest` | ✓ | ✓ | ✗ |
| `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` | ✓ | ✗ | ✗ |
| `Get*` / `Read*` / `Search*` / `RuntimeAnalyze*` / `RuntimeList*` / `ValidateServiceBinding` | ✓ | ✓ | ✓ |

Zweistufige Absicherung:
- **Ebene 1 — PreToolUse-Hook** (`scripts/hooks/tier-readonly-guard.mjs`), installiert über `scripts/install-hooks.mjs`. Greift, bevor die Werkzeuganfrage gesendet wird; gibt einen klaren Ablehnungsgrund aus, den das LLM dem Anwender erklären kann.
- **Ebene 2 — Schutz im MCP-Server** (`abap-mcp-adt-powerup/src/lib/readonlyGuard.ts`) — nicht zu umgehen. Selbst wenn der Anwender Hooks abschaltet oder die Plugin-Installation überspringt, lehnt der Server verändernde Werkzeuge auf QA/PRD mit `ERR_READONLY_TIER` ab. `ReloadProfile` ist immer erlaubt, damit Anwender zu Dev zurückwechseln können, ohne über eine Notausgang-Debatte zu streiten.

### OS-Schlüsselbund für Kennwörter (`@napi-rs/keyring`)

Profile speichern `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>` — eine Referenz, nicht das Geheimnis. Der echte Wert liegt im Anmeldedatenspeicher des Betriebssystems:

| Betriebssystem | Backend |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret (GNOME Keyring / KWallet) |

Die Umsetzung nutzt `@napi-rs/keyring` — Rust + vorkompilierte N-API-Binärdateien (keine `node-gyp`-Kompilierung bei der Installation, kein Neubau bei Node-Versionssprüngen). Als `optionalDependencies` deklariert; Umgebungen ohne Oberfläche (Docker, CI) fallen sauber auf `SAP_PASSWORD_STORAGE=file` zurück (Klartext mit deutlicher Warnung). Vorhandene `.sc4sap/sap.env`-Dateien im Klartext werden beim ersten Upgrade in den Schlüsselbund migriert.

### Profile wechseln, hinzufügen, entfernen

Alles über `/sc4sap:sap-option`:

- **Wechseln** — interaktive Auswahl (native `AskUserQuestion`-Oberfläche) mit Vorschaupanel pro Profil, das Verbindungsdetails + die Matrix der erlaubten Werkzeuge zeigt. Schreibt `active-profile.txt`, ruft `mcp__sap__ReloadProfile` auf dem MCP-Server auf (kein Neustart von Claude Code nötig), und das HUD zeichnet sich mit dem neuen Badge `alias [tier] 🔒` neu.
- **Hinzufügen** — Assistent erfasst Alias, Stufe, Host/Mandant/Benutzer und Kennwort (direkt in den Schlüsselbund gestreamt, nie auf dem Bildschirm gezeigt). Automatische Erkennung desselben Unternehmens: Wer `KR-QA` hinzufügt, während `KR-DEV` existiert, bekommt angeboten, `SAP_INDUSTRY`, `SAP_ACTIVE_MODULES`, `ABAP_RELEASE` und den Block `namingConvention` zu kopieren.
- **Entfernen** — verlangt, dass der Anwender den Alias zur Bestätigung wortgleich tippt. Archiviert nach `.trash/{alias}-{timestamp}/`, statt hart zu löschen. Verweigert, wenn der Alias das aktive Profil ist.
- **Bearbeiten** — ändert Felder außer der Stufe (die Stufe ist auf diesem Weg unveränderlich, um versehentliche Herabstufungen von PRD auf DEV zu verhindern). Kennwortänderungen schreiben den Schlüsselbundeintrag neu.
- **Bereinigen** — löscht `.trash/*` älter als 7 Tage endgültig (oder mit `--all` sofort alles).

### Migration von der alten `sap.env` mit einem einzigen Profil

Bestehende Anwender, die auf die Multi-Profil-Version umsteigen, sehen beim ersten Start von Claude Code ein SessionStart-Banner (`scripts/legacy-migration-banner.mjs`) in einem Projekt mit `.sc4sap/sap.env`, aber ohne `active-profile.txt`. Das Banner verweist auf `/sc4sap:sap-option`, das einen Migrationsassistenten mit zwei Fragen (Alias, Stufe) durchläuft. Die alte Datei wird für ein Rollback in `sap.env.legacy` umbenannt; es werden keine Daten gelöscht.

### HUD

Zeile 2 der Statuszeile zeigt `{alias} [{tier}]` mit einem 🔒, wenn `tier != DEV`. Farben werden nicht verwendet — das Schlosssymbol ist das einzige, themenunabhängige Signal.

```
 KR-DEV [DEV]       SID S4H · client 100 · user DEVELOPER · CTS DEVK904224
 KR-PRD [PRD] 🔒    SID S4P · client 400 · user READER
```

### Zugehörige Dateien

- Entwurf: [`multi-profile-design.md`](multi-profile-design.md)
- Umsetzungsplan: [`multi-profile-implementation-plan.md`](multi-profile-implementation-plan.md)
- CLI: `scripts/sap-profile-cli.mjs` (list / switch / add / remove / migrate / purge / keychain-set / keychain-delete)
- Begleitdateien der Skills: `skills/sap-option/profile-management.md`, `skills/sap-option/migration.md`

## Fähigkeiten des MCP-ABAP-ADT-Servers — Alleinstellungsmerkmale

sc4sap stützt sich auf **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)** (150+ Werkzeuge). Über das übliche CRUD für Klasse / Programm / Tabelle / CDS / Funktionsbaustein hinaus bietet er **vollständige R/U/C-Abdeckung für klassische Dynpro-Artefakte**, die die meisten MCP-Server nicht anfassen:

| Artefakt | Abdeckung |
|----------|----------|
| **Screen (Dynpro)** | `GetScreen` / `CreateScreen` / `UpdateScreen` / `DeleteScreen` — vollständiger Round-Trip von Kopf + Ablauflogik |
| **GUI Status** | `GetGuiStatus` / `CreateGuiStatus` / `UpdateGuiStatus` / `DeleteGuiStatus` — Menüleiste, Funktionstasten, Symbolleiste |
| **Text Element** | `GetTextElement` / `CreateTextElement` / `UpdateTextElement` / `DeleteTextElement` — Textsymbole, Selektionstexte, Listenüberschriften |
| **Includes** | `GetInclude` / `CreateInclude` / `UpdateInclude` / `DeleteInclude` — Konvention Main+Include |
| **Lokale Defs/Makros/Tests/Typen** | Lokale Abschnitte im Programm unabhängig bearbeitet |
| **Metadata Extension (CDS)** | `Get/Create/Update/Delete MetadataExtension` — Schichtung von Fiori-/UI-Annotationen |
| **Behavior Definition / Implementation (RAP)** | Kompletter RAP-Zyklus BDEF + BHV |
| **Service Definition / Binding** | Bereitstellung als OData V2/V4 + `ValidateServiceBinding` |
| **Enhancements / BAdI** | Erkennung mit `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` |
| **Laufzeit & Profiling** | `RuntimeAnalyzeDump`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeGetProfilerTraceData`, `RuntimeRunProgramWithProfiling` — ST22 / SM02 / /IWFND/ERROR_LOG / Profiling im SAT-Stil aus Claude |
| **Semantik / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetWhereUsed` |
| **Unit-Tests** | Sowohl ABAP Unit (`CreateUnitTest`) als auch CDS Unit (`CreateCdsUnitTest`) |
| **Transport** | `GetTransport`, `ListTransports`, `CreateTransport` |

## Gemeinsame Konventionen (`common/`)

Skillübergreifende Regeln zur Erstellung liegen in `common/`, damit jeder Skill und jeder Agent demselben Regelwerk folgt. `CLAUDE.md` ist ein schlankes Verzeichnis, das auf diese Dateien verweist.

| Datei | Inhalt |
|------|--------|
| `clean-code.md` + `clean-code-oop.md` + `clean-code-procedural.md` | Clean-ABAP-Standards, nach Paradigma getrennt |
| `include-structure.md` | Hauptprogramm + bedingter Include-Satz (t/s/c/ct/e/o/i/a/f) |
| `oop-pattern.md` | OOP-Aufteilung in zwei Klassen (`LCL_DATA` + `LCL_ALV` in `c`, `LCL_EVENT_ALV` in `e`) |
| `alv-rules.md` | Voller ALV (CL_GUI_ALV_GRID + Docking) gegenüber SALV + SALV-Factory-Feldkatalog |
| `text-element-rule.md` | Verpflichtende Textelemente — Zwei-Durchgänge-Sprachregel (primär + `'E'` als Sicherheitsnetz) |
| `constant-rule.md` | Verpflichtende CONSTANTS für Magic Literals außerhalb des Feldkatalogs |
| `procedural-form-naming.md` | Suffix `_{screen_no}` für ALV-gebundene FORMs |
| `naming-conventions.md` | Gemeinsame Namensgebung für Programme, Includes, LCL_*, Screens, GUI Status |
| `sap-version-reference.md` | Unterschiede zwischen ECC und S/4HANA |
| `abap-release-reference.md` | Verfügbarkeit der ABAP-Syntax nach Release |
| `spro-lookup.md` | Reihenfolge der SPRO-Suche (lokaler Cache → statisch → MCP) |
| `data-extraction-policy.md` | Ablehnungsprotokoll des Agenten + HARTE REGEL `acknowledge_risk` |
| `active-modules.md` | Matrix der modulübergreifenden Integration (MM↔PS, SD↔CO, QM↔PP, …) |
| `context-loading-protocol.md` | Bedarfsgesteuertes Laden von Dateien in 4 Stufen (global → Rolle → ausgelöst → pro Aufgabe) |
| `model-routing-rule.md` | Routing Sonnet / Opus / Haiku + Konvention für das Antwort-Präfix + Konvention für das Phasenbanner. Zur Modellzuordnung pro Skill / Phase siehe **[`skill-model-architecture.md`](skill-model-architecture.md)** (Entwurfsabsicht — das `model:` im Frontmatter ist deklarativ). |
| `ok-code-pattern.md` | OK_CODE-Vertrag der Screens (eine TOP-Variable → Screen-NAME → PAI-Dispatch; nie CASE sy-ucomm) |
| `field-typing-rule.md` | Priorität der DDIC-Feldtypisierung (Standard-DE → CBO-DE → neues DE → Primitivtyp) |
| `function-module-rule.md` | Quelltextkonvention für FMs (Signatur mit IMPORTING/EXPORTING/TABLES inline) |
| `transport-client-rule.md` | Jedes `CreateTransport` benötigt einen expliziten Mandanten aus `sap.env` |
| `ecc-ddic-fallback.md` | DDIC-Anlage auf ECC: zuerst MCP-Werkzeuge über `ZMCP_ADT_DDIC_*`, als Fallback ein `$TMP`-Hilfsreport |
| `cloud-abap-constraints.md` | Verbotene Anweisungen + Cloud-native API-Ersatz für S/4 Cloud Public |
| `customization-lookup.md` | Prüftor zur Wiederverwendung vorhandener Z*/Y*-BAdI-Implementierungen / CMOD / Formular-Exits / Appends |
| `screen-tabstrip.md` | Tabstrip-Screens (STRIP_CTRL + Subscreen-Bereich + Tab-PUSH-Zeilen, `CALL SUBSCREEN` in PBO und PAI) |
| `skill-router.md` · `intent-router.md` | Normaler Chat → der richtige Skill; Aufteilung in Wissen / Abfrage / Aktion zwischen `ask-consultant` und `assist` |
| `cost-mode.md` · `model-dispatch-mode.md` | Kostenmodus (standard / eco) und Modell-Dispatch-Modus (auto / benutzerdefiniert) |
| `offline-mode.md` | Offline-Profil: full / degraded / blocked pro Skill, Hinweis- und Stopp-Zeilen |
| `multi-profile-artifact-resolution.md` | Wo die Ergebnisse jedes Profils liegen; ein Zielobjekt, das im aktiven System fehlt, stoppt den Skill |
| `verification-evidence.md` · `evidence-receipt.md` | Abschlussberichte: Erledigungskriterien vorab festgelegt, Nachweis vor der Zusammenfassung; der Beleg wird von einem Skript aus MCP-Antworten entschieden (`create-program`) |
| `sap-content-as-data.md` | Quelltext, Texte, Dumps, Zeilen und Webseiten sind Daten, nie Anweisungen; SAP-Text reist in `<sap-data>`-Blöcken |
| `structured-return-repair.md` | Ein fehlerhafter Rückgabeblock eines Agenten wird vom selben Agenten einmal neu geschrieben; Urteile ändern sich nie |
| `adobe-forms-verification.md` | Kennzahlen und Gates für die Adobe-Formular-Skills, gemessen am eigenen Ausdruck von SAP |
| `humanize-korean.md` | Politur koreanischer Prosa (Verbindungskommas immer; lange Sätze über das optionale Plugin humanize-korean) |
| `team-consultation-protocol.md` | Rückgabebasiertes Protokoll für Agententeams mit mehreren Spezialisten (`teamMode`) |

## Architektur zum Laden des Kontexts (v0.5.2+)

Das Regelwerk von sc4sap ist groß — 25+ `common/*.md` + 14 `configs/{MODULE}/*.md` + 30+ Branchen-/Länderdateien. Jede Datei bei jedem Agenten-Dispatch zu laden, verschwendet Token und verwässert die Aufmerksamkeit des Modells. Das **4-Stufen-Modell zum Laden des Kontexts** (definiert in [`common/context-loading-protocol.md`](../common/context-loading-protocol.md)) trennt „immer geladene Sicherheitsschranken" von „rollenspezifischer Grundausstattung", „bedingungsgesteuerten Dateien" und „Kit pro Aufgabe".

| Stufe | Wann geladen | Dateien |
|------|-------------|-------|
| **Stufe 1 — Global verpflichtend** | Jeder Agent, jeder Skill, jeder Sitzungsstart | `data-extraction-policy.md`, `sap-version-reference.md`, `naming-conventions.md` |
| **Stufe 2 — Rollenverpflichtend** | Fester Satz der Rollengruppe des Agenten, Sitzungsstart | je nach Rollengruppe (siehe unten) |
| **Stufe 3 — Ausgelöste Lesezugriffe** | Wenn eine Bedingung zur aktuellen Aufgabe passt | ALV → `alv-rules.md` · Prozedural → `clean-code-procedural.md` + `ok-code-pattern.md` · `CALL SCREEN` → `ok-code-pattern.md` · ECC → `ecc-ddic-fallback.md` · Branche/Land gesetzt → entsprechende Datei · usw. |
| **Stufe 4 — Kit pro Aufgabe** | Vom dispatchenden Skill / von Phase / Gruppe deklariert | pro Welle in `phase4-parallel.md`, pro §1-§12 in `phase6-review.md` |

### Rollengruppen der Stufe 2

| Rollengruppe | Agenten | Stufe 2 ergänzt |
|------------|--------|--------------|
| **Code Writer** | `sap-executor`, `sap-qa-tester`, `sap-debugger` | `clean-code.md`, `abap-release-reference.md`, `transport-client-rule.md`, `include-structure.md` (+ Paradigma-Datei) |
| **Reviewer** | `sap-code-reviewer`, `sap-critic` | `clean-code.md`, `abap-release-reference.md`, `include-structure.md` (Eingrenzung pro Gruppe in Phase 6) |
| **Planner / Architect** | `sap-planner`, `sap-architect` | `include-structure.md`, `active-modules.md`, `customization-lookup.md`, `field-typing-rule.md` |
| **Analyst / Writer** | `sap-analyst`, `sap-writer` | `active-modules.md` |
| **Doc Specialist** | `sap-doc-specialist` | *(keine — nur aufgabengesteuert)* |
| **Module Consultant** | 14 Modulberater (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba) | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/*.md` (bei Bedarf — nur die Datei, die die Frage braucht) |
| **Basis Consultant** | `sap-bc-consultant` | `transport-client-rule.md`, `configs/common/*.md` |

### Durchsetzung

Jede Datei `agents/*.md` deklariert ihre Rollengruppe in einem Block `<Mandatory_Baseline>` am Anfang von `<Agent_Prompt>`. Der Agent lädt Stufe 1 + Stufe 2 beim Sitzungsstart vor jedem MCP-Aufruf. Skill-Prompts deklarieren nur Ergänzungen der Stufe 4 (pro Aufgabe); Stufe 1+2 werden vorausgesetzt. Bei einem MAJOR-Blocker gibt der Agent `BLOCKED — context kit insufficient: <list>` zurück, damit der Skill ein aktualisiertes Kit liefern kann.

### Gemessene Wirkung

- Token pro Dispatch: −40 bis −60 % gegenüber dem impliziten Muster „alles laden" vor v0.5.0.
- Opus-Anteil in `/sc4sap:create-program`: −50 % (Routing-Matrix in `model-routing-rule.md`).
- Erkennung von MAJOR-Befunden im Review: verbessert — jeder der Punkte §1-§12 läuft nur mit seiner relevanten Regel im Kontext, statt 12 Regeldateien auf einmal zu überfliegen.

## Konvention für das Antwort-Präfix (v0.5.2+)

Jede durch einen `/sc4sap:*`-Skill ausgelöste Antwort beginnt mit einem einzeiligen Präfix, damit der Anwender auf einen Blick sieht, welches Modell die Arbeit ausführt und welche Sub-Agenten dispatcht wurden:

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

Beispiele:

```
[Model: Opus]
— reine Hauptthread-Antwort, keine Sub-Agent-Dispatches

[Model: Opus · Dispatched: Sonnet×2]
— Hauptthread + zwei parallele Sonnet-Executor (Welle 2, G4-prep Text-Massenarbeit)

[Model: Opus · Dispatched: Opus×1 (planner)]
— Dispatch des Planners in Phase 2

[Model: Opus · Dispatched: Sonnet×3 (B3a executor range α/β/γ)]
— Multi-Executor Split nach multi-executor-split.md Strategie A
```

Die Konvention wird durch einen Block `<Response_Prefix>` in jeder `/sc4sap:*`-SKILL.md durchgesetzt, der auf [`common/model-routing-rule.md`](../common/model-routing-rule.md) § *Response Prefix Convention* verweist. Das Präfix gilt nur für durch Skills ausgelöste Antworten; bei themenfremden Nachrichten des Anwenders entfällt das Präfix in dem Zug, in dem sie eintreffen.

## Branchenreferenz (`industry/`)

14 Branchendateien — von jedem `sap-*-consultant` herangezogen. Jede behandelt **Business Characteristics / Key Processes / Master Data / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**.

Branchen: retail, fashion, cosmetics, tire, automotive, pharmaceutical, food-beverage, chemical, electronics, construction, steel, utilities, banking, public-sector.

## Länder- und Lokalisierungsreferenz (`country/`)

15 Länderdateien + `eu-common.md` — verpflichtend für Analyst / Critic / Planner. Behandelt **Formats / Tax System / e-Invoicing / Banking / Payroll / Statutory Reporting / SAP Country Version / Pitfalls**.

| Datei | Wichtige Besonderheiten |
|------|-------------------|
| 🇰🇷 `kr.md` | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII |
| 🇯🇵 `jp.md` | Qualified Invoice System (2023+), Zengin, 法人番号 |
| 🇨🇳 `cn.md` | Golden Tax, 发票/e-fapiao, SAFE FX |
| 🇺🇸 `us.md` | Sales & Use Tax (no VAT), 1099, Nexus |
| 🇩🇪 `de.md` | USt, ELSTER, XRechnung / ZUGFeRD, SEPA |
| 🇬🇧 `gb.md` | VAT + MTD, BACS/FPS/CHAPS, Post-Brexit (GB vs XI) |
| 🇫🇷 `fr.md` | TVA, FEC, Factur-X 2026 |
| 🇮🇹 `it.md` | IVA, FatturaPA / SDI (mandatory since 2019) |
| 🇪🇸 `es.md` | IVA, SII (real-time 4-day), TicketBAI |
| 🇳🇱 `nl.md` | BTW, KvK, Peppol, XAF |
| 🇧🇷 `br.md` | NF-e, SPED, CFOP, PIX |
| 🇲🇽 `mx.md` | CFDI 4.0, SAT, Carta Porte, SPEI |
| 🇮🇳 `in.md` | GST, IRN e-invoice, e-Way Bill, TDS |
| 🇦🇺 `au.md` | GST, ABN, STP Phase 2, BAS |
| 🇸🇬 `sg.md` | GST, UEN, InvoiceNow, PayNow |
| 🇪🇺 `eu-common.md` | VIES, INTRASTAT, SEPA, GDPR |

Rollouts in mehreren Ländern: Jede relevante Datei wird geladen, und Berührungspunkte zwischen den Ländern (innergemeinschaftliche USt, Intercompany, Verrechnungspreise, Quellensteuer) werden aufgezeigt.

## Integration aktiver Module

`common/active-modules.md` definiert eine Matrix der modulübergreifenden Integration. Sind mehrere Module aktiv, schlagen Skills proaktiv Integrationsfelder vor.

Beispiel: Anlage einer MM-Bestellung in einer Landschaft mit **aktivem PS** → Kontierungstyp `P`/`Q` + `PS_POSID` (PSP-Element) vorschlagen; **aktivem CO** → Kostenstellenfindung vorschlagen; **aktivem QM** → automatische Anlage des Prüfloses beim Wareneingang.

Konfiguration über `/sc4sap:setup` (Schritt 4) oder `/sc4sap:sap-option modules`. Verwendet von `create-program`, `create-object`, `stock-cbo` und allen Berater-Agenten.

## Wissen zur SAP-Plattform (ECC / S/4 On-Premise / Cloud)

`sc4sap:create-program` führt eine verpflichtende SAP-Versions-Vorabprüfung durch und liest dazu `.sc4sap/config.json` für `sapVersion` und `abapRelease`:

- **ECC** — kein RAP/ACDOCA/BP; Syntax nach Release eingegrenzt
- **S/4HANA On-Premise** — klassisches Dynpro mit Warnung; Erweiterbarkeit zuerst, MATDOC + ACDOCA für das Finanzwesen
- **S/4HANA Cloud (Public)** — **klassisches Dynpro verboten**; leitet um auf RAP + Fiori Elements, `if_oo_adt_classrun` oder nur SALV. Vollständige Liste in `common/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP + Business-Partner-APIs bevorzugen

### ECC / BASIS < 7.50 — Kompatibilitätsmatrix der MCP-Werkzeuge

Auf Altsystemen leitet der MCP-Server (`abap-mcp-adt-powerup`) automatisch über `AdtClientLegacy`, wenn eines der folgenden im aktiven Profil gesetzt ist:

- `SAP_VERSION=ECC` — markiert das Profil immer als Altsystem
- `ABAP_RELEASE` numerisch `< 750` (z. B. `740`, `731`)
- `SAP_SYSTEM_TYPE=legacy` — expliziter Override (Abwärtskompatibilität)

Der Legacy-Modus lehnt gezielt eine Teilmenge von Endpunkten ab, die es auf BASIS < 7.50 nicht gibt, und liefert die klare Meldung `"not supported on this SAP system"` statt eines kryptischen 404.

Matrix verifiziert auf ECC 7.40 (BASIS 7.40, SAP_SYSTEM_TYPE=onprem, SAP_VERSION=ECC, ABAP_RELEASE=740):

| Kategorie | Werkzeuge | ECC 7.40 | Hinweise |
|---|---|---|---|
| Sitzung, Suche, Discovery | `GetSession`, `SearchObject`, `GetObjectInfo`, `GetObjectStructure`, `GetInactiveObjects` | ✅ | — |
| Paket lesen | `GetPackageContents`, `GetPackageTree` | ✅ | — |
| Paket-Metadaten | `GetPackage` | ❌ | `/sap/bc/adt/packages` fehlt — SE80/SE21 verwenden |
| DDIC lesen | `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain` | ❌ | `/sap/bc/adt/ddic/{tables,structures,dataelements,domains}` kam mit 7.50 hinzu |
| DDIC schreiben (klassisch) | `Create/Update/Delete` von `Table`, `Structure`, `DataElement`, `Domain` | ❌ | Dieselbe Lücke — der MCP leitet Create an die FMs `ZMCP_ADT_DDIC_*` (Setup Schritt 9a.2, OData-Backend); sonst der **$TMP-Hilfsreport als Fallback** in [`common/ecc-ddic-fallback.md`](../common/ecc-ddic-fallback.md) |
| Klassische View (`VIEW/DV`) | `GetView` für klassische Views im Stil V_T001_CORE | ❌ | Endpunkt für klassische Views liefert auf ECC 7.40 404 |
| CDS-View (`DDLS/DF`) | `GetView`, `CreateView`, `UpdateView`, `DeleteView` | ✅ | `/sap/bc/adt/ddic/ddl/sources/` vorhanden ab BASIS 7.40 SP05+; CDS DDL wird sauber aktiviert |
| ABAP-Quelltext | `Get/Create/Update/Delete` für Program, Class, Interface, Include, FunctionGroup, FunctionModule | ✅ | Volles Lesen/Schreiben; `UpdateFunctionModule` setzt `transport_request` für $TMP-Objekte automatisch auf `"local"` |
| Analyse | `GetAbapSemanticAnalysis`, `GetAbapAST` | ✅ | Parsen auf Client-Seite, kein SAP-Aufruf |
| Verwendungsnachweis | `GetWhereUsed` | ⚠️ | Nur klassische Objekte — Ziel `TABL` meldet „Unsupported object type" |
| Enhancements | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | ❌ | `/sap/bc/adt/enhancements` liefert auf BASIS < 7.50 404 — SE18 / SE19 / CMOD / SMOD verwenden |
| Transport | `ListTransports`, `GetTransport`, `CreateTransport` | ✅ | — |
| Laufzeit / Dumps | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById` | ✅ | ST22 über ADT |
| Screen / GUI Status | `GetScreen`, `GetGuiStatus`, `GetTextElement` (+ Create/Update) | ℹ️ | Über RFC dispatcht — erfordert Vorabprüfung von `SAP_RFC_BACKEND` (odata / soap) |
| RAP / Behavior / Service / MetadataExt | alle `*BehaviorDefinition`, `*BehaviorImplementation`, `*ServiceDefinition`, `*ServiceBinding`, `*MetadataExtension` | ❌ | Nur S/4HANA — den RAP-Stack gibt es auf ECC nicht |
| Tabelleninhalte | `GetTableContents`, `GetSqlQuery` | ℹ️ | Funktioniert, aber pro Profil durch die Sperrliste für Datenextraktion gesteuert (siehe §Sperrliste für die Datenextraktion) |

Legende: ✅ voll · ⚠️ teilweise · ❌ mit klarer Fehlermeldung abgelehnt (Grenze der SAP-Plattform) · ℹ️ funktioniert, hängt aber von vorheriger Einrichtung / Richtlinie ab.

Upstream-Referenz (dieselbe Matrix, kanonische Sicht des MCP-Servers): [`abap-mcp-adt-powerup` README → Legacy (ECC / BASIS < 7.50) Compatibility Matrix](https://github.com/babamba2/abap-mcp-adt-powerup#legacy-ecc--basis--750-compatibility-matrix).

## Referenz zum SPRO-Customizing

Eingebaute Referenzdaten für alle 14 SAP-Module unter `configs/{MODULE}/`:
- `spro.md` — SPRO-Customizing-Tabellen/-Views
- `tcodes.md` — Transaktionscodes
- `bapi.md` — BAPI-/FM-Referenz
- `tables.md` — Schlüsseltabellen
- `enhancements.md` — BAdI / User Exit / BTE / VOFM
- `workflows.md` — Entwicklungsabläufe

Module: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW.

### Lokaler SPRO-Cache (spart Token)

`/sc4sap:setup spro` extrahiert das kundenspezifische SPRO-Customizing nach `.sc4sap/spro-config.json`. Berater folgen `common/spro-lookup.md`:
1. Lokaler Cache → 2. Statische Referenzen → 3. Live-MCP-Abfrage (mit Bestätigung).

## SAP-spezifische Hooks

Registriert in `hooks/hooks.json`:

| Ereignis | Hook | Was er tut |
|---|---|---|
| SessionStart | `session-start.mjs`, `project-memory-session.mjs`, `legacy-migration-banner.mjs` | Plugin-Regeln und der Auszug des Skill-Routers; Projektumgebung aus `.sc4sap/project-memory.json`; Banner für eine alte `sap.env` mit einem einzigen Profil |
| Setup (`init`, `maintenance`) | `setup-init.mjs`, `setup-maintenance.mjs` | `claude --init-only` / `-p --init` legt die `.sc4sap`-Struktur an; `claude -p --maintenance` entfernt veralteten Zustand und prüft die Konfiguration |
| PreToolUse (SAP-Werkzeuge) | `permission-approver.mjs` | Genehmigt SAP-MCP-Aufrufe automatisch, damit Pipelines und ihre Agenten ohne Rückfrage pro Aufruf laufen — außer Lesezugriffen auf Zeilendaten (`GetTableContents`, `GetRemoteTableContents`, `GetSqlQuery`) und Business Actions (`PreviewBusinessAction`, `ExecuteBusinessAction`), die immer ihre Rückfrage behalten Eine enge Ausnahme: ein `GetSqlQuery`, das DD*-Repository-Metadaten in der Form von `stock-cbo` liest, wird automatisch genehmigt. |
| PreToolUse (Zeilen lesen, Quelltext schreiben) | `hooks/block-forbidden-tables.mjs` | 🔒 Sperrliste für die Datenextraktion (unten) — auch für Testcode und CDS-Views, die über Create / Update geschrieben werden, die Kanäle, über die Zeilen gelesen werden könnten |
| PreToolUse (Zeilen lesen) | `program-test/pt-gate.mjs` | Während eines program-test-Laufs: verweigert einen Lesezugriff ohne die `mask` des Laufs sowie Produktionszugriffe außerhalb des eigenen Ziels des Laufs |
| PreToolUse (Dateiwerkzeuge) | `evidence/guard.mjs` | Agenten können die Nachweisdateien nicht schreiben, die ein Skript besitzt (Belege, maskierte Zeilen, Harness) |
| PostToolUse (SAP-Werkzeuge) | `evidence/record.mjs` | Zeichnet MCP-Antworten im Nachweisbuch des Laufs auf |
| PostToolUseFailure | `post-tool-use-failure.mjs` | Zeichnet den Fehler und die Zahl der Wiederholungen für die Wiederholungshinweise auf |
| SubagentStart / SubagentStop | `subagent-tracker.mjs`, `verify-deliverables.mjs` | Verfolgt dispatchte Agenten; warnt (ohne zu blockieren), wenn ein Agent erwartete Ergebnisse nicht geliefert hat |
| Stop / SessionEnd | `context-guard-stop.mjs`, `session-end.mjs` | Schlägt eine Auffrischung der Sitzung vor, wenn der Kontext groß wird; Protokoll der Sitzungszusammenfassung |

Der Stufenwächter (`scripts/hooks/tier-readonly-guard.mjs`, QA / PRD schreibgeschützt) wird von `/sc4sap:setup` in die Projekteinstellungen installiert (siehe Multi-Umgebungs-Profile).

## 🔒 Sperrliste für die Datenextraktion

Verteidigungsebene in der Tiefe, die verhindert, dass Zeilendaten aus sensiblen Tabellen (PII, Zugangsdaten, Lohn und Gehalt, Bankdaten, transaktionales Finanzwesen) über `GetTableContents` / `GetSqlQuery` gelesen werden.

**Vier Durchsetzungsebenen**: L1 Agentenanweisungen · L2 globale Direktive in `CLAUDE.md` · L3 `PreToolUse`-Hook von Claude Code · L4 durch Umgebungsvariablen gesteuerter Schutz im MCP-Server.

**Quelle der Sperrliste**: `exceptions/table_exception.md` ist das Verzeichnis; die eigentlichen Listen liegen in 11 Abschnittsdateien unter `exceptions/`.

| Stufe | Abdeckung |
|------|----------|
| minimal | Bank/Zahlung, PII in Stammdaten, Adressen, Auth/Sicherheit, HR/Lohn und Gehalt, Steuer/behördliche IDs, Preise/Konditionen, kundenspezifische `Z*`-PII-Muster |
| standard | + Geschützte Geschäftsdaten (VBAK/BKPF/ACDOCA/VBRK/EKKO/CDHDR/STXH + CDS) |
| strict | + Audit-/Sicherheitsprotokolle, Kommunikation/Workflow |

**Aktionen**: `deny` (blockiert) gegenüber `warn` (läuft weiter mit Warnblock). Ist eine Tabelle eines Aufrufs `deny`, wird der ganze Aufruf blockiert.

**Profile** (bei `/sc4sap:setup` gewählt): `strict` / `standard` / `minimal` / `custom`. Standortspezifische Ergänzungen über `.sc4sap/blocklist-extend.txt`.

**Installation** (automatisch durch `/sc4sap:setup`; manuell):
```bash
node scripts/install-hooks.mjs            # user-level
node scripts/install-hooks.mjs --project  # project-level
```

**Prüfen**:
```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Expected: JSON with "permissionDecision":"deny"
```

**Durchsetzung auf L4 im Server** (stoppt jeden Client — auch externe Skripte):
```bash
export SC4SAP_POLICY=on
export SC4SAP_POLICY_PROFILE=strict
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md
export SC4SAP_ALLOW_TABLE=TAB1,TAB2  # session emergency exemption (logged)
```

Schema-/DDIC-Metadaten (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`) und Existenzprüfungen bleiben erlaubt.

## 🚫 `acknowledge_risk` — HARTE REGEL

`GetTableContents` / `GetSqlQuery` akzeptieren `acknowledge_risk: true`, um das Ask-Tier-Gate zu umgehen. **Das ist eine Audit-Grenze, kein Komfort-Flag.**

1. **Setzen Sie `acknowledge_risk: true` nie beim ersten Aufruf** — lassen Sie Hook/Server entscheiden
2. **Bei einer `ask`-Antwort** STOPP — geben Sie die Ablehnung an den Anwender weiter
3. **Stellen Sie eine explizite Ja/Nein-Frage** mit Nennung der Tabellen und des Umfangs
4. **Wiederholen Sie mit `acknowledge_risk: true` erst** nach einem ausdrücklichen zustimmenden Schlüsselwort: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `confirmed`
5. **Mehrdeutige Aufforderungen sind KEINE Autorisierung** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"my mistake"`, Schweigen
6. **Pro Aufruf, pro Tabelle, pro Sitzung** — die Autorisierung gilt nicht weiter

Vollständiges Protokoll: `common/data-extraction-policy.md`.

### ⚠️ Falle „Always allow"
Wenn eine Berechtigungsabfrage für `GetTableContents` / `GetSqlQuery` erscheint, wählen Sie **„Allow once"**, nie **„Always allow"**. Claude Code hängt bei „Always allow" die Werkzeug-ID an `permissions.allow` an und schaltet die Schutzmaßnahme damit dauerhaft ab. Wiederherstellung: einen übergeordneten Skill erneut ausführen — `trust-session` Schritt 2 durchsucht bei jedem Aufruf die Einträge `GetTableContents`/`GetSqlQuery` und entfernt sie.

## 🔀 SAP-Verbindung: Web-Port, RFC-Backend, NCo

sc4sap spricht mit SAP über ADT am Web-Port (HTTP 80NN / HTTPS 443NN). Wo der Web-Port nicht geöffnet werden kann, kann es über den **RFC-Port (33NN) mit dem SAP .NET Connector (NCo)** auf einem Windows-Entwickler-PC verbinden — ohne ICF-Knoten, ohne Gateway-Service und ohne `S_SERVICE`; `S_ADT_RES` und die Entwicklungsberechtigungen bleiben gleich. NCo ist lizenzpflichtige SAP-Software, die jeder Anwender selbst installiert; nur Anwendungsserver + Instanz (keine Anmeldegruppen, kein SAProuter, kein SNC). Details: [Erste Schritte → RFC (NCo)](GETTING-STARTED.de.md#wenn-der-web-port-nicht-geöffnet-werden-kann-rfc-nco).

Operationen für Screen / GUI Status / Text Element werden über RFC-fähige FMs in SAP dispatcht. 2 Transport-Backends am Web-Port:

| `SAP_RFC_BACKEND` | Wie | Wann verwenden |
|---|---|---|
| `odata` (Standardwert) | HTTPS OData v2 `ZMCP_ADT_SRV` | Funktioniert in gehärteten Gateway-Installationen; läuft über die Standard-Gateway-Authentifizierung (S_SERVICE). [docs/odata-backend.md](odata-backend.md) |
| `soap` | HTTPS `/sap/bc/soap/rfc` | Klassischer Weg, wenn der ICF-Knoten `/sap/bc/soap/rfc` aktiv ist (in Produktion zunehmend deaktiviert) |

`native`, `gateway` und `zrfc` wurden in MCP 4.10.0 entfernt — der MCP-Server verweigert den Start mit ihnen. Wechseln Sie auf `odata` oder `soap`.

Wechseln Sie jederzeit über `/sc4sap:sap-option`, verbinden Sie den MCP neu und prüfen Sie mit `/sc4sap:sap-doctor`.

---

← [Zurück zur README](../README.de.md) · [Installation →](INSTALLATION.de.md) · [Änderungsprotokoll →](CHANGELOG.de.md)
