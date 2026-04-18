<p align="center">
  <img src="sc4sap.png" alt="SuperClaude for SAP" width="720"/>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a> | <a href="README.ja.md">日本語</a> | Deutsch
</p>

# SuperClaude for SAP (sc4sap)

> Claude-Code-Plugin für die SAP-ABAP-Entwicklung — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)

[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Was ist sc4sap?

SuperClaude for SAP verwandelt Claude Code in einen Full-Stack-SAP-Entwicklungsassistenten. Über den [MCP ABAP ADT Server](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ Tools) verbindet es sich mit dem SAP-System und erstellt, liest, aktualisiert und löscht ABAP-Objekte direkt — Klassen, Funktionsbausteine, Reports, CDS-Views, Dynpro, GUI-Status und mehr.

## Kernfunktionen

| Funktion | Beschreibung |
|----------|--------------|
| 🔌 **Auto-MCP-Installation** | `abap-mcp-adt-powerup` wird während `/sc4sap:setup` automatisch installiert, konfiguriert und verbindungsgetestet. Keine manuelle MCP-Verdrahtung. |
| 🏗️ **Formatierter Auto-Programm-Generator** | Erstellt ABAP-Programme End-to-End: Main + bedingte Includes (OOP/Prozedural), volles ALV + Docking, Dynpro + GUI-Status, obligatorische Text Elements, ABAP-Unit-Tests — plattformbewusst (ECC / S4 On-Prem / Cloud). |
| 🔍 **Programmanalyse** | Lese beliebige ABAP-Objekte via MCP, führe Clean ABAP / Performance / Security Review aus, oder Reverse Engineering zu Fach-/Technikspezifikation (Markdown/Excel). |
| 🧪 **Code-Analyse** | `/sc4sap:analyze-code` — dedizierter statischer Review-Pass (`sap-code-reviewer`): Clean ABAP, Performance, Security, SAP-Standard-Compliance. Nach Schweregrad sortierte Befunde mit konkreten Korrekturvorschlägen. |
| 🔀 **Programme vergleichen** | `/sc4sap:compare-programs` — Business-orientierter Seite-an-Seite-Vergleich von 2–5 ABAP-Programmen, die dasselbe Szenario teilen, aber nach Modul (MM/CO), Land (KR/EU) oder Persona (Controller/Lager) aufgeteilt sind. Berater-gerechter Markdown-Bericht über 10 konfigurierbare Dimensionen. |
| 🩺 **Betriebsdiagnose** | Operative Triage: ST22-Dumps, SM02, /IWFND/ERROR_LOG, Profiler-Traces, Logs, Where-Used — alles aus Claude. |
| ♻️ **CBO-Wiederverwendung** | Z-Paket einmal inventarisieren → `create-program` / `program-to-spec` bevorzugen bestehende CBO-Assets statt Duplikate. Essenziell für Brownfield. |
| 🧷 **CBO-Extension-Erkennung (CMOD / GGB1·2 / BAdI / APPEND)** | Inventarisiert User-Exits (CMOD), Substitutionen & Validierungen (GGB1/GGB2), BAdI-Implementierungen und APPEND-Strukturen. `create-program` / BAPI-Aufrufe bevorzugen bestehende Extension-Felder (z. B. BAPI `EXTENSIONIN` / Tabellen-Append) gegenüber neuen CBOs; die Dump- und Störungsdiagnose prüft Extension-Stellen als erstklassige Verdächtige. |
| 🏭 **Branchenkontext** | 14 Branchen-Referenzdateien (retail, fashion, cosmetics, tire, automotive, pharma, F&B, chemical, electronics, construction, steel, utilities, banking, public-sector). |
| 🌏 **Länder-/Lokalisierung** | 15 länderspezifische Dateien + EU-Common (KR/JP/CN/US/DE/GB/FR/IT/ES/NL/BR/MX/IN/AU/SG). E-Invoicing, Banking, Payroll, Steuerlokalisierung. |
| 🧩 **Aktive-Modul-Erkennung** | Cross-Module-Integrationshinweise: MM + PS aktiv → WBS-Felder für MM-CBOs vorschlagen; SD + CO aktiv → CO-PA-Ableitung. [Details →](common/active-modules.md) |
| 🤝 **Modul-Consulting** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect` delegieren an 14 Modulberater + 1 BC-Berater, wenn Business-Urteil erforderlich ist. |

## Dokumentation

- 📦 **[Installation & Setup →](docs/INSTALLATION.de.md)** — Anforderungen, Installationsoptionen, Wizard-Schritte, Blocklist-Konfiguration
- 🎯 **[Funktionen im Detail →](docs/FEATURES.de.md)** — 25 Agenten, 18 Skills, MCP-Tools, RFC-Backends, Hooks, Datenextraktionsrichtlinie
- 📜 **[Changelog →](docs/CHANGELOG.de.md)** — Versionshistorie und Breaking Changes

## Unleashed

<p align="center">
  <a href="sc4sap_unleashed.png">
    <img src="sc4sap_unleashed.png" alt="SC4SAP Unleashed" width="100%"/>
  </a>
</p>

## Autor

- **paek seunghyun** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## Mitwirkende

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## Danksagung

Dieses Projekt wurde von [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) von **허예찬 (Hur Ye-chan)** inspiriert. Die Multi-Agent-Orchestrierungsmuster, Socratic Deep-Interview Gating, persistente Loop-Konzepte und die gesamte Plugin-Philosophie lassen sich auf diese Arbeit zurückführen.

[**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt) von **fr0ster** hat wesentlich zum Aufbau unseres angepassten MCP-Servers (`abap-mcp-adt-powerup`) beigetragen. Die bahnbrechende ADT-über-MCP-Arbeit — Request-Shaping, Endpoint-Abdeckung, Objekt-I/O — war die konzeptionelle Grundlage, auf die wir uns beim Entwurf und der Erweiterung unseres eigenen Servers gestützt haben.

## Lizenz

[MIT](LICENSE)
