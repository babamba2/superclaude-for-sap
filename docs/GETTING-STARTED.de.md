# sc4sap Erste Schritte (für Erstanwender)

← [Zurück zur README](../README.de.md) · [English](GETTING-STARTED.md) · [한국어](GETTING-STARTED.ko.md) · [日本語](GETTING-STARTED.ja.md) · alle Optionen: [Installation & Einrichtung](INSTALLATION.de.md)

Eine Schritt-für-Schritt-Anleitung für Personen, die Claude Code noch nie benutzt haben. Folgen Sie ihr von oben nach unten.

> **Windows · etwa 30–40 Minuten**

## Schritte

- [ ] [0. Vorbereitung](#0-vorbereitung)
- **SAP-Server vorbereiten (Basis)**
  - [ ] [B1. Web-Port öffnen (zuerst)](#b1-web-port-öffnen-zuerst)
  - [ ] [B2. ICF-Services aktivieren](#b2-icf-services-aktivieren)
  - [ ] [B3. Benutzerberechtigungen](#b3-benutzerberechtigungen)
  - [ ] [B4. System- und Benutzereinstellungen](#b4-system--und-benutzereinstellungen)
- **Ihr PC**
- [ ] [1. PowerShell-Ausführungsrichtlinie](#1-powershell-skripte-erlauben)
- [ ] [2. Git installieren](#2-git-installieren)
- [ ] [3. Node.js installieren](#3-nodejs-installieren)
- [ ] [4. Claude Code installieren](#4-claude-code-installieren)
- [ ] [5. Anmelden](#5-anmelden)
- [ ] [6. Arbeitsordner anlegen](#6-arbeitsordner-anlegen)
- [ ] [7. Das sc4sap-Plugin installieren](#7-das-sc4sap-plugin-installieren)
- [ ] [8. Mit SAP verbinden](#8-mit-sap-verbinden)
- [ ] [B5. Gateway-Service registrieren](#b5-gateway-service-registrieren)
- [ ] [B6. Profil prüfen](#b6-profil-prüfen)
- [ ] [9. Prüfen, ob alles funktioniert](#9-prüfen-ob-alles-funktioniert)
- [ ] [B7. Verbindungsprüfungen (im Detail)](#b7-verbindungsprüfungen-im-detail)
- [Fehlerbehebung](#fehlerbehebung) · [Aktualisieren](#aktualisieren)

---

## 0. Vorbereitung

Halten Sie Folgendes bereit.

| Punkt | Details |
|---|---|
| PC | Windows 10 / 11. Mit Administratorrechten geht es leichter. |
| Claude-Tarif | Claude Pro oder Max. Ein Team- / Enterprise-Konto des Unternehmens funktioniert ebenfalls. Ein API-Schlüssel funktioniert auch. |
| SAP-System | ECC 6.0 oder S/4HANA On-Premise, mit aktiviertem ADT. |
| SAP-Anmeldung | Server-URL, Mandant, Benutzer-ID, Passwort, Sprache. |
| Internet | Zugriff auf github.com, npmjs.org und claude.ai. Blockiert das Firmennetz diese Adressen, fragen Sie die IT. |

<details>
<summary>Sie wissen nicht, wie die SAP-URL lautet?</summary>

Es ist dieselbe Adresse, die Eclipse ADT verwendet, meist etwa `https://servername:44300`. Fragen Sie Ihr Basis-Team nach der „ADT-URL".
</details>

<details>
<summary>So prüfen Sie, ob ADT aktiviert ist</summary>

Starten Sie `SICF` im SAP GUI. Der Service `/sap/bc/adt` muss aktiv sein. Fehlt Ihnen die Berechtigung, fragen Sie Ihr Basis-Team.
</details>

> **Sie verbinden sich zum ersten Mal mit einem SAP-Server Ihres Unternehmens?** Bitten Sie Ihr Basis-Team zuerst um [B1–B4](#b1-web-port-öffnen-zuerst). Der **Web-Port aus B1** muss offen sein, bevor sich irgendetwas anderes testen lässt. Installieren Sie einmal auf dem DEV-Server; QA und PRD erhalten die Objekte per Transport.

✅ Alles ist bereit.

---

## B1. Web-Port öffnen (zuerst)

**[Basis]** sc4sap verbindet sich über den **Web-Port (HTTP/HTTPS)** mit dem SAP-Server. Es nutzt weder den SAP-GUI-Port (32xx) noch den RFC-Port (33xx). Solange dieser Port geschlossen ist, lässt sich ab B2 nichts testen.

### Portnummern

SAP-Ports bestehen meist aus **einem Präfix + der Instanznummer**. Die Beispiele gelten für Instanz `00`.

| Verwendung | Regel | Beispiel (Instanz 00) |
|---|---|---|
| SAP GUI | 32 + Nummer | 3200 |
| RFC | 33 + Nummer | 3300 |
| **Web HTTP (von sc4sap verwendet)** | **80 + Nummer** | **8000** |
| Web HTTPS (von sc4sap verwendet) | 443 + Nummer | 44300 |

Manche Server verwenden andere Nummern. Schritt 1 unten zeigt die tatsächlichen.

### Schritte

| Schritt | Wer | Was | Prüfung |
|---|---|---|---|
| 1 | Basis | Prüfen, ob der Server einen Web-Port hat: `SMICM` → Goto → Services | Eine aktive HTTP-Zeile (oder HTTPS-Zeile) mit Portnummer. |
| 2 | Basis | Falls nicht, einen anlegen: in `RZ10` `icm/server_port_<n>` = `PROT=HTTP,PORT=8000` setzen → ICM neu starten | Die neue Zeile erscheint in Schritt 1. |
| 3 | Basis · Netzwerk-Team | In der Firewall Entwickler-PCs → Server-IP und Web-Port freigeben. | — |
| 4 | Entwickler | Vom PC aus testen (Befehl unten). | `TcpTestSucceeded : True` |

```powershell
Test-NetConnection sapdev.example.com -Port 8000
```

> **Was Sie die Basis fragen sollten:** „Bitte machen Sie den Web-Port des SAP-Servers (80 + Instanznummer, oder HTTPS 443 + Instanznummer) von den Entwickler-PCs aus erreichbar."

### Wenn der Web-Port nicht geöffnet werden kann: RFC (NCo)

Statt über den Web-Port kann sc4sap über den **RFC-Port (33 + Instanznummer)** mit dem SAP .NET Connector (NCo) auf dem Entwickler-PC verbinden.

| Punkt | Web-Port | NCo |
|---|---|---|
| Port | Web 80NN / 443NN | RFC 33NN |
| ICF-Knoten (B2) | erforderlich | nicht erforderlich |
| Registrierung des Gateway-Service (B5) | erforderlich | nicht erforderlich |
| `S_SERVICE` | erforderlich | nicht erforderlich |
| `S_ADT_RES` | erforderlich | **ebenfalls erforderlich** (ADT prüft es auch über RFC) |
| `S_RFC` | ADT + Z-Funktionsbausteine | gleich + `SADT_REST` (ADT über RFC) |
| Z-Funktionen installieren und transportieren | auf DEV installieren → per Transport nach QA | gleich |
| Entwickler-PC | beliebig | Windows mit installiertem NCo |

> **Jeder Anwender installiert NCo auf seinem eigenen PC.** NCo (SAP Connector for Microsoft .NET 3.1) ist lizenzpflichtige SAP-Software, daher kann sc4sap es nicht mitliefern. Laden Sie es im SAP Support Portal (Software Downloads) mit einem S-User herunter, der Software herunterladen darf. Haben Sie keinen, bitten Sie Ihr Basis-Team um das Installationsprogramm. Auf manchen PCs ist es bereits mit dem SAP GUI installiert.

| Weitere Einschränkungen | Details |
|---|---|
| Nur Windows | Nicht auf Mac oder Linux; diese PCs nutzen den Web-Port. |
| Nur direkter Server | Nur Anwendungsserver + Instanznummer. Kein Message Server (Logon-Gruppen), kein SAProuter, kein SNC. |
| Verschlüsselung | Ohne SNC ist der RFC-Verkehr nicht verschlüsselt. Nutzen Sie es nur im Firmennetz und stimmen Sie sich mit der Basis ab. |
| Version der Z-Funktion | `ZMCP_ADT_DISPATCH` benötigt die NCo-Funktion (`FM_PROXY`). Die aktuellen Quellen enthalten sie. |
| Gleiche Berechtigungen | `S_ADT_RES` sowie die Lese- und Entwicklungsberechtigungen bleiben gleich. Nur ICF, Gateway und `S_SERVICE` entfallen. |

---

## B2. ICF-Services aktivieren

**[Basis]** Aktivieren Sie diese Knoten in der Transaktion `SICF`. Ein untergeordneter Knoten funktioniert nicht, solange sein übergeordneter Knoten inaktiv ist.

| Knoten | Erforderlich | Verwendung |
|---|---|---|
| `/default_host/sap`, `/default_host/sap/bc` | ja | übergeordnete Knoten |
| `/default_host/sap/bc/adt` | ja | ADT-Pfad (alle Lese- und Schreibzugriffe). Das CSRF-Token kommt von `/sap/bc/adt/core/discovery`. |
| `/default_host/sap/opu/odata` | ja | OData-Pfad (Dynpros, GUI-Status, Textpools, Dumps) |

---

## B3. Benutzerberechtigungen

**[Basis]** Gehen Sie von einer Kopie der SAP-Standardrolle `SAP_BC_DWB_ABAPDEVELOPER` aus und fügen Sie die folgenden Berechtigungen hinzu. Systeme unterscheiden sich, lassen Sie es daher von der Basis bestätigen.

### Basisberechtigungen (jeder Benutzer)

| Objekt | Felder und Werte | Verwendung | Schreibender Benutzer | Nur-Lese-Benutzer |
|---|---|---|---|---|
| `S_ADT_RES` | `URI` = `/sap/bc/adt/*` | ADT-Zugriff | ja | ja |
| `S_RFC` | `RFC_TYPE` = FUGR, `RFC_NAME` = `SADT*`, `SDTX`, `SYST`, `RFC1`, `ACTVT` = 16 | ADT-interne RFCs | ja | ja |
| `S_RFC` (zusätzlich) | `RFC_NAME` = `ZMCP_ADT_UTILS` | Dispatcher, Textpool, DDIC-Funktionsbausteine | ja | ja |
| `S_SERVICE` | Service `ZMCP_ADT_SRV` | OData-Pfad | ja | ja |
| `S_DEVELOP` | `DEVCLASS` = `$TMP`, `Z*`, `Y*` · `OBJTYPE` = PROG, CLAS, INTF, FUGR, DEVC, … · `OBJNAME` = `Z*`, `Y*` · `ACTVT` = 01, 02, 03, 06, 07, 16 | 01 anlegen · 02 ändern · 03 anzeigen · 06 löschen · 07 aktivieren · 16 ausführen | alle | nur 03 |
| `S_TRANSPRT` | `TTYPE` = DTRA, TASK · `ACTVT` = 01, 02, 03 | Transporte anzeigen, anlegen und zuordnen | alle | nur 03 |
| `S_TABU_DIS`, `S_TABU_NAM` | Tabellengruppen / -namen zum Lesen, `ACTVT` = 03 | Tabellen lesen | ja | ja |
| ST22 anzeigen | — | Dump-Liste | optional | optional |

### Gateway-Registrierung (ein Entwickler)

Nur nötig, wenn ein Entwickler den Gateway-Service (B5) selbst registriert. Die Standard-Entwicklerrolle enthält sie nicht. Die Registrierung erfolgt einmal pro Server, eine Person genügt also.

| Objekt | Felder und Werte | Verwendung |
|---|---|---|
| `S_TCODE` | `/IWBEP/REG_SERVICE`, `/IWFND/MAINT_SERVICE`, `/IWFND/CACHE_CLEANUP`, `/IWFND/ERROR_LOG`, `SEGW`, `SICF` | registrieren, Caches leeren, Fehlerprotokoll |
| `/IWBEP/SB` | Projekt `ZMCP_ADT` (oder `Z*`), alle Aktivitäten | Registrierung über SEGW (Alternative) |
| `S_DEVELOP` (zusätzlich) | `OBJTYPE` = Gateway-Repository-Objekte (Service, Modell, Servicegruppe, …) · `OBJNAME` = `ZMCP_ADT*` · `ACTVT` = 01, 02, 03 | Einträge im Gateway-Katalog |
| `S_ICF_ADM` | Knoten `ZMCP_ADT_SRV` | ICF-Knoten aktivieren |
| `S_TRANSPRT` | `ACTVT` = 01, 02 | nur bei Registrierung in einem transportierbaren Paket |

---

## B4. System- und Benutzereinstellungen

**[Basis]**

| Punkt | Erforderlich | Sonst |
|---|---|---|
| Entwicklerschlüssel | für den Benutzer registriert | Schreiben von Z-Objekten schlägt fehl |
| Systemänderbarkeit | Kundennamensraum (Z/Y) und lokale Objekte änderbar | Schreibzugriffe schlagen fehl |
| Mandanteneinstellungen | Änderungen an Repository-Objekten und mandantenübergreifenden Objekten erlaubt | Schreibzugriffe schlagen fehl |
| Benutzertyp | Dialog- oder Servicebenutzer | Anmeldung schlägt fehl |
| Passwort | nicht initial (einmal im SAP GUI anmelden und ändern) | HTTP-Anmeldung schlägt fehl |

---

## 1. PowerShell-Skripte erlauben

Windows blockiert PowerShell-Skripte standardmäßig. Erlauben Sie sie nicht, brechen das Claude-Code-Installationsprogramm sowie die Befehle `claude` und `npm` mit einem Fehler ab.

**① PowerShell öffnen**

1. Drücken Sie <kbd>Win</kbd> und tippen Sie „PowerShell".
2. Klicken Sie auf **Windows PowerShell**.
3. Für Administratorrechte klicken Sie mit der rechten Maustaste und wählen **Als Administrator ausführen**.

**② Aktuelle Einstellung prüfen**

```powershell
Get-ExecutionPolicy -List
```

Sind `CurrentUser` und `LocalMachine` beide `Undefined` oder `Restricted`, sind Skripte blockiert.

**③ Skripte erlauben — führen Sie eine dieser Varianten aus**

Variante A — nur Ihr Konto (keine Administratorrechte nötig, empfohlen)

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Variante B — der gesamte PC (in einer PowerShell mit Administratorrechten)

```powershell
Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned
```

Bei der Rückfrage geben Sie <kbd>Y</kbd> (oder <kbd>A</kbd>) ein und drücken <kbd>Enter</kbd>.

**④ Erneut prüfen**

```powershell
Get-ExecutionPolicy
```

Die Ausgabe sollte `RemoteSigned` lauten.

<details>
<summary>Was ist RemoteSigned?</summary>

Auf Ihrem PC erstellte Skripte laufen; aus dem Internet heruntergeladene Skripte laufen nur, wenn sie signiert sind. Eine übliche Einstellung auf Entwickler-PCs.
</details>

<details>
<summary>„overridden by a policy defined at a more specific scope"</summary>

Ihr Unternehmen hat dies per Gruppenrichtlinie festgelegt, Sie können es daher nicht selbst ändern. Bitten Sie die IT, die PowerShell-Ausführungsrichtlinie RemoteSigned zu erlauben.
</details>

✅ Die Ausführungsrichtlinie ist `RemoteSigned`.

---

## 2. Git installieren

Claude Code und sc4sap nutzen Git intern. Unter Windows ist es erforderlich.

1. Laden Sie das Installationsprogramm von [git-scm.com/download/win](https://git-scm.com/download/win) herunter.
2. Behalten Sie alle Voreinstellungen bei und klicken Sie auf **Next**.
3. Öffnen Sie danach ein **neues PowerShell-Fenster** und prüfen Sie:

```powershell
git --version
```

Die Ausgabe sollte etwa `git version 2.xx.x` lauten.

✅ Git ist installiert.

---

## 3. Node.js installieren

Der SAP-Verbindungsserver von sc4sap (MCP) läuft auf Node.js. Erforderlich ist **Version 20 oder höher**.

1. Laden Sie die **LTS**-Version von [nodejs.org](https://nodejs.org) herunter.
2. Behalten Sie die Voreinstellungen bei.
3. Schließen Sie geöffnete PowerShell-Fenster, öffnen Sie ein neues und prüfen Sie:

```powershell
node --version
npm --version
```

Die Ausgabe sollte `v20` oder höher lauten, z. B. `v22.11.0`.

✅ Node.js ist installiert.

---

## 4. Claude Code installieren

Claude Code ist Claude in Ihrem Terminal. sc4sap ist ein Plugin dafür.

Variante A — offizielles Installationsskript (empfohlen)

```powershell
irm https://claude.ai/install.ps1 | iex
```

Variante B — npm (wenn Variante A im Firmennetz blockiert ist)

```powershell
npm install -g @anthropic-ai/claude-code
```

Schließen Sie PowerShell, öffnen Sie ein neues Fenster und prüfen Sie:

```powershell
claude --version
```

Es sollte eine Versionsnummer erscheinen.

<details>
<summary>„claude is not recognized"</summary>

Öffnen Sie ein neues PowerShell-Fenster. Klappt es weiterhin nicht, starten Sie den PC neu.
</details>

✅ Claude Code ist installiert.

---

## 5. Anmelden

Beim ersten Start erscheinen die Anmeldebildschirme.

```powershell
claude
```

1. Wählen Sie mit den Pfeiltasten ein Farbschema und drücken Sie <kbd>Enter</kbd>.
2. Wählen Sie **Claude account with subscription**. Bei einem API-Schlüssel wählen Sie **Anthropic Console**.
3. Ein Browser öffnet sich. Melden Sie sich mit Ihrem Claude-Konto an und bestätigen Sie.
4. Zurück im Terminal sehen Sie die Eingabeaufforderung (`>`).

> **Prüfen** — Tippen Sie `hello`. Antwortet Claude, sind Sie angemeldet.
>
> **Beenden** — Tippen Sie `/exit` oder drücken Sie zweimal <kbd>Ctrl</kbd> + <kbd>C</kbd>.

✅ Sie sind angemeldet.

---

## 6. Arbeitsordner anlegen

sc4sap legt seine Arbeitsdateien in dem Ordner ab, aus dem Sie es starten. Legen Sie dafür einen Ordner an.

```powershell
mkdir $HOME\Documents\sap-work
cd $HOME\Documents\sap-work
claude
```

> **Starten Sie ab jetzt immer so** — PowerShell öffnen, `cd $HOME\Documents\sap-work`, dann `claude`.

<details>
<summary>Werden Sie gefragt, ob Sie dem Ordner vertrauen?</summary>

Wählen Sie **Yes, proceed**. Es ist Ihr eigener Arbeitsordner.
</details>

✅ Claude Code ist in Ihrem Arbeitsordner geöffnet.

---

## 7. Das sc4sap-Plugin installieren

> ⚠️ Ab hier tippen Sie in die **Claude-Code-Eingabeaufforderung (`>`)**, nicht in PowerShell.

**① Marketplace hinzufügen**

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
```

**② Plugin installieren**

```
/plugin install sc4sap
```

Wenn nach dem Geltungsbereich gefragt wird, ist **User** (in jedem Ordner verfügbar) am einfachsten.

**③ Claude Code neu starten**

1. Beenden Sie mit `/exit`.
2. Starten Sie `claude` im selben Ordner erneut.

> **Prüfen** — Tippen Sie nur `/sc4sap`. Erscheint eine Liste mit `/sc4sap:setup` und weiteren Einträgen, hat es funktioniert.

✅ Das Plugin ist installiert.

---

## 8. Mit SAP verbinden

Der Einrichtungsassistent stellt Ihnen eine Frage nach der anderen.

```
/sc4sap:setup
```

**Ablauf des Assistenten**

```
SAP version · industry → MCP server installed automatically → logon details → connection test → safety hooks → done
```

**Häufige Fragen**

| Frage | Antwort |
|---|---|
| SAP-Version | `S4` oder `ECC`. Das ABAP-Release finden Sie im SAP GUI unter **System → Status**, z. B. `757` |
| Branche | Wählen Sie die Branche Ihres Unternehmens aus der Liste; im Zweifel die nächstliegende. |
| Profilname (Alias) | `country-purpose` wird empfohlen, z. B. `KR-DEV` |
| Tier | `DEV` für ein Entwicklungssystem, `QA` für Qualitätssicherung, `PRD` für Produktion. QA und PRD werden automatisch schreibgeschützt. |
| SAP_URL | Die ADT-Adresse, z. B. `https://sapdev.example.com:44300` |
| SAP_CLIENT | Die Mandantennummer, z. B. `100` |
| Benutzer / Passwort | Ihre übliche SAP-Anmeldung. Das Passwort wird im Windows-Anmeldeinformationsverwaltung (Credential Manager) gespeichert. |
| RFC-Backend | Im Zweifel die Voreinstellung (`soap`) beibehalten. |
| ABAP-Hilfsobjekte | Wird nur auf DEV gefragt. Ein Transportauftrag kann nötig sein. |
| SPRO-Extraktion / Customizing-Inventar | Beim ersten Mal können Sie mit <kbd>N</kbd> überspringen und es später ausführen. |

<details>
<summary>Eine Berechtigungsabfrage erscheint</summary>

Claude fragt nach, bevor es Dateien schreibt oder Befehle ausführt. Während der Einrichtung können Sie **Yes** wählen.
</details>

<details>
<summary>Sie sollen den MCP-Server neu verbinden</summary>

Tippen Sie `/mcp`, wählen Sie den Server `sap` und dann **Reconnect**.
</details>

✅ Der Einrichtungsassistent ist fertig.

---

## B5. Gateway-Service registrieren

**[Entwickler]** Der OData-Pfad benötigt den Service `ZMCP_ADT_SRV`. Registrieren Sie ihn **sowohl** im Backend (`/IWBEP`) **als auch** im Frontend (`/IWFND`); eines allein funktioniert nicht. Überspringen Sie diesen Schritt, wenn Sie NCo verwenden (B1).

### Bevor Sie beginnen

- `/sc4sap:setup` (Schritt 8) muss Folgendes vorbereitet haben:
  - SEGW-Projekt `ZMCP_ADT`, Typ „Service with SAP Annotations" — Sie legen es bei der Einrichtung im SAP GUI an.
  - Klassen `ZCL_ZMCP_ADT_MPC_EXT`, `ZCL_ZMCP_ADT_DPC_EXT` — die Einrichtung schreibt und aktiviert sie.
  - Funktionsbausteine `ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL` — remote-fähig. Wenn die Einrichtung danach fragt, setzen Sie in SE37 den Haken bei „Remote-Enabled".
- Der Knoten `/default_host/sap/opu/odata` aus B2 ist aktiv.
- Sie haben die Berechtigungen für die Gateway-Registrierung aus B3.

### Werte

| Feld | Wert |
|---|---|
| Servicename · externer Servicename | `ZMCP_ADT_SRV` |
| Modellname | `ZMCP_ADT_MDL` |
| Version | `0001` |
| Namensraum | leer |
| Model-Provider-Klasse | `ZCL_ZMCP_ADT_MPC_EXT` |
| Data-Provider-Klasse | `ZCL_ZMCP_ADT_DPC_EXT` |
| Systemalias | `LOCAL` (gleicher Server, RFC-Destination `NONE`) |
| Paket | das Paket der Klassen oder `$TMP` |

### Schritte

1. **Backend** — `/IWBEP/REG_SERVICE` → Register → Werte eingeben → Speichern
2. **Frontend** — `/IWFND/MAINT_SERVICE` → Add Service → Systemalias `LOCAL`, externer Servicename `ZMCP_ADT_SRV` → Get Services → Add Selected Services → Paket wählen
3. **ICF-Knoten** — `SICF` → `/default_host/sap/opu/odata/sap/ZMCP_ADT_SRV` → Activate Service
4. **Caches** — `/IWFND/CACHE_CLEANUP` → Modell-Cache bereinigen → Execute

> **Alternative:** Mit `/IWBEP/SB` können Sie statt Schritt 1 SEGW verwenden: `ZMCP_ADT` öffnen → Generate Runtime Objects (F6) → aktivieren → Register (Systemalias `LOCAL`). Führen Sie dann die Schritte 2–4 wie oben aus.

### Prüfung

Öffnen Sie im Browser:

```
https://sapdev.example.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV/$metadata?sap-client=100
```

- Ein XML-Dokument, das mit `<edmx:Edmx>` beginnt, bedeutet: Es funktioniert.
- Es muss `FunctionImport Name="Dispatch"` und `ComplexType Name="DispatchResult"` enthalten.

### Probleme

| Symptom | Ursache | Lösung |
|---|---|---|
| `$metadata` liefert 404 | ICF-Knoten inaktiv oder Frontend-Registrierung fehlt | Schritte 3 (SICF) und 2 (Add Service) |
| `$metadata` liefert 200, aber Aufrufe liefern 500 | Backend-Registrierung (`/IWBEP`) fehlt (der Backend-Tab von `/IWFND/MAINT_SERVICE` ist leer) | Schritt 1 ausführen → Frontend-Service löschen und neu hinzufügen |
| nach der Registrierung weiterhin 500 | alter Modell-Cache | `/IWFND/CACHE_CLEANUP` ausführen sowie `ZMCP_ADT_FLUSH_CACHE` mit `P_FLUSH` |
| unerklärliches 500 | eine ABAP-Ausnahme hinter dem OData-Fehler | Transaktions-ID in `/IWFND/ERROR_LOG` nachschlagen, `ZMCP_ADT_FLUSH_CACHE` mit `P_DIAG` ausführen |
| 401 | Anmeldung fehlgeschlagen | Benutzer und Passwort prüfen sowie prüfen, dass das Passwort nicht initial ist |

> **Notlösung:** `P_REG` von `ZMCP_ADT_FLUSH_CACHE` schreibt die Backend-Tabellen direkt und kann Werte übersehen. Nutzen Sie nach Möglichkeit die obigen Schritte.

---

## B6. Profil prüfen

**[Entwickler]** Die Verbindung steht in `~/.sc4sap/profiles/<alias>/sap.env`; `/sc4sap:setup` schreibt sie. Das Passwort steht nicht in der Datei — es liegt im Windows-Anmeldeinformationsverwaltung (Credential Manager). Ändern Sie Werte mit `/sc4sap:sap-option`.

| Schlüssel | Beispiel | Bedeutung |
|---|---|---|
| `SAP_URL` | `https://sapdev.example.com:44300` | Serveradresse |
| `SAP_CLIENT` | `100` | Anmeldemandant |
| `SAP_AUTH_TYPE` | `basic` | Basisauthentifizierung |
| `SAP_USERNAME` | `SC4SAP_DEV01` | Anmeldebenutzer (Beispiel) |
| `SAP_PASSWORD` | (Credential Manager) | niemals in der Datei |
| `SAP_LANGUAGE` | `EN` | Anmeldesprache |
| `SAP_SYSTEM_TYPE` | `onprem` | On-Premise-Server |
| `SAP_VERSION` | `ECC` oder `S4` | ECC nutzt die ECC-spezifische Behandlung |
| `ABAP_RELEASE` | `740` | BASIS-Release-Nummer |
| `SAP_TIER` | `DEV` | QA / PRD blockieren Schreibzugriffe |
| `SAP_RFC_BACKEND` | `odata` | OData-Pfad (`nco` für NCo) |
| `SAP_RFC_ODATA_SERVICE_URL` | `https://sapdev.example.com:44300/sap/opu/odata/sap/zmcp_adt_srv` | Adresse des OData-Service |
| `SAP_RFC_ODATA_CSRF_TTL_SEC` | `600` | Wiederverwendungszeit des CSRF-Tokens (Sekunden) |
| `MCP_BLOCKLIST_PROFILE` | `minimal` | Sperrstufe für geschützte Tabellen |
| `MCP_BLOCKLIST_EXTEND` | `ZHR*` | zusätzlich zu sperrende Tabellen |

> **sc4sap sperrt geschützte Tabellen von sich aus.** Tabellen wie BKPF oder KNA1 benötigen vor dem Lesen die Zustimmung des Benutzers. Die Sperre von sc4sap gilt auch dann, wenn der SAP-Benutzer berechtigt ist.

---

## 9. Prüfen, ob alles funktioniert

Führen Sie die Systemprüfung aus.

```
/sc4sap:sap-doctor
```

Wenn alles besteht, ist die Installation abgeschlossen.

**Gute erste Befehle**

| Was Sie möchten | Beispiel |
|---|---|
| Ein Programm analysieren | `/sc4sap:analyze-code ZMY_REPORT` |
| Spezifikation eines Programms | `/sc4sap:program-to-spec ZMY_REPORT` |
| Einen Modulberater fragen | `/sc4sap:ask-consultant Where is the credit check on delivery creation configured?` |
| Die Ursache eines Dumps finden | `/sc4sap:analyze-symptom look at yesterday's ST22 dumps` |
| Ein neues Programm erstellen | `/sc4sap:create-program` |
| Einstellungen ansehen oder ändern | `/sc4sap:sap-option` |
| Programm vor dem Transport auf DEV testen | `/sc4sap:program-test ZMY_REPORT` |
| Dürfen diese Transportaufträge nach QA? | `/sc4sap:transport-readiness DEVK900123, DEVK900124` |
| Betriebsbericht seit gestern | `/sc4sap:ops-health-check` |
| UAT-Szenarien für ein Modul | `/sc4sap:uat-scenarios MM Einkauf` |
| Belege anzeigen oder ändern (offene Bestellungen, Sperren …) | `/sc4sap:assist offene Bestellungen des Lieferanten 100023` |
| Umstellung SmartForm → Adobe-Formular planen (Beta, Qualität noch niedrig) | `/sc4sap:smartform-to-adobe ZSD_INVOICE` |

> Sie können auch einfach in normalen Worten fragen, z. B. „Read the source of ZMY_REPORT and explain what it does".

✅ `sap-doctor` ist bestanden.

---

## B7. Verbindungsprüfungen (im Detail)

Nutzen Sie diese, wenn `sap-doctor` fehlschlägt oder Sie wissen möchten, welcher Pfad blockiert ist. Geben Sie sie unverändert in Claude Code ein.

| Reihenfolge | Fragen Sie Claude | Prüft |
|---|---|---|
| 1 | „Search for table MARA" | ADT-Pfad (B1, B2, B3) |
| 2 | „Show the GUI status of program SAPLSPO1" | OData → Pfad über `ZMCP_ADT_DISPATCH` (B5) |
| 3 | `/sc4sap:sap-doctor` | ADT und OData zusammen |
| 4 | „Create a test program in $TMP, change it, activate it, then delete it" | Schreibberechtigungen (schreibender Benutzer, nur DEV) |

> **Funktioniert 1, aber 2 nicht,** ist ADT offen und der OData-Pfad blockiert. Siehe Prüfung und Probleme in B5.

---

## Fehlerbehebung

| Symptom | Lösung |
|---|---|
| `claude` / `node` / `git` nicht erkannt | PowerShell schließen und ein neues Fenster öffnen. Klappt es weiterhin nicht, den PC neu starten. |
| Fehler, dass das Ausführen von Skripten deaktiviert ist | [Schritt 1](#1-powershell-skripte-erlauben) erneut prüfen: `Get-ExecutionPolicy` muss `RemoteSigned` sein. Durch Gruppenrichtlinie blockiert → IT fragen. |
| npm-Installation hängt oder schlägt fehl | Wahrscheinlich Proxy oder Firewall des Unternehmens. Bitten Sie die IT um Zugriff auf npmjs.org und github.com. |
| `/sc4sap:setup` steht nicht in der Liste | Claude Code vollständig schließen und neu starten. Unter `/plugin` prüfen, ob sc4sap installiert ist. |
| SAP-Verbindungstest schlägt fehl (401) | Benutzer-ID, Passwort und Mandant prüfen. Mit `/sc4sap:sap-option` korrigieren. |
| SAP-Verbindungstest schlägt fehl (403 / 404) | `/sap/bc/adt` ist in SICF inaktiv oder die ADT-Berechtigung fehlt. Fragen Sie Ihr Basis-Team. |
| Zertifikatsfehler (SSL) | Der Server nutzt möglicherweise ein Firmenzertifikat. Fügen Sie die Fehlermeldung in Claude ein und fragen Sie nach. |
| Passwort geändert, aber das alte wird weiter verwendet | Claude Code vollständig beenden und neu starten. Der Verbindungsserver liest das Passwort beim Start. |
| `UserPromptSubmit hook ... keyword-detector.mjs / skill-injector.mjs timed out`, oder die Einrichtung fragt im Chat nach dem SAP-Passwort | Eine alte sc4sap-Version (vor 0.6.59) ist installiert: Aktuelle Versionen haben solche Hooks nicht und nehmen das Passwort in einem maskierten PowerShell-Fenster entgegen. Aktualisieren Sie wie unter [Aktualisieren](#aktualisieren), starten Sie neu und prüfen Sie die Version unter `/plugin`. Bleiben die Hooks bestehen, gehören sie einem anderen Plugin (z. B. oh-my-claudecode). |
| Sie wissen nicht, was falsch ist | `/sc4sap:sap-doctor` ausführen und Claude das Ergebnis zeigen. |

## Aktualisieren

In der Claude-Code-Eingabeaufforderung:

```
/plugin marketplace update sc4sap
/plugin install sc4sap
```

Starten Sie Claude Code nach dem Aktualisieren neu.

> 🔒 **Sicherheit** — Auf QA- und PRD-Profilen ist das Anlegen, Ändern und Löschen von Objekten in zwei Schichten blockiert. Datenzugriffe auf sensible Tabellen sind standardmäßig gesperrt.
