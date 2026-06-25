# Alex' Projekt — Firmenbuch-Recherche mit Browser-Automatisierung

**Ziel:** Eine österreichische Firma auf **openfirmenbuch.at** suchen, den Browser **sichtbar** öffnen, **Screenshots** machen und **alle veröffentlichten Jahresabschluss-PDFs herunterladen** — vollständig automatisiert und in einem neuen Chatfenster exakt reproduzierbar.

Dieses Dokument beschreibt: **was** genutzt wurde, **wie**, **warum**, **was nicht funktioniert hat**, und liefert die fertigen Skripte + einen **Copy-&-Paste-Prompt** für ein neues Chat.

---

## 1. Endergebnis (Beispiel Velartis GmbH)

- Browser (Chromium) öffnet openfirmenbuch.at, sucht „Velartis GmbH", öffnet die Detailseite.
- Screenshots: Startseite, Eingabe, Suchergebnis, Detailseite.
- **12 Jahresabschluss-PDFs (2014–2024)** heruntergeladen und lesbar umbenannt:
  `Velartis_GmbH_Jahresabschluss_2024_eingereicht_2025-06-04.pdf` usw.
- Daraus erstellt: Kennzahlen-CSV, Analyse-Markdown und **Analyse-PDF**.

Alles reproduzierbar über die beiden Skripte in diesem Ordner.

---

## 2. Voraussetzungen / Umgebung

| Komponente | Status auf diesem PC | Hinweis |
|---|---|---|
| Betriebssystem | Windows 11 | |
| Node.js | `C:\Program Files\nodejs\node.exe` (im PATH) | `node -v` zum Prüfen |
| Playwright | `@playwright/test` ist im Projekt **core-app** installiert | wird von hier aus mitgenutzt |
| Browser | Chromium (ms-playwright-Cache, `chromium-1217`) | bereits installiert |
| Shell | PowerShell **oder** Git-Bash | beide funktionieren |

**Wichtig — woher kommt Playwright:** Beide Skripte laden Playwright über einen kleinen Resolver (`loadChromium()`): **zuerst aus diesem Repo** (`./node_modules`, sobald `npm install` gelaufen ist), **sonst aus dem Projekt core-app** auf diesem PC. So läuft es sowohl frisch geklont als auch auf der ursprünglichen Maschine.

> Empfohlen nach dem Klonen des Repos (macht es unabhängig von core-app):
> ```powershell
> npm install
> npx playwright install chromium
> ```
> Der Fallback-Pfad auf core-app steht direkt in `loadChromium()` in beiden `.mjs`-Dateien und kann bei Bedarf angepasst werden.

---

## 3. Schnellstart (so wird es benutzt)

PowerShell im Ordner `alexs projekt` öffnen (im Explorer in die Adressleiste `powershell` tippen) und:

```powershell
# Firma suchen, Browser SICHTBAR, alle Jahresabschlüsse herunterladen
node "firmenbuch-suche.mjs" "Velartis GmbH"

# Nur Suche + Screenshots, ohne Downloads
$env:NO_DOWNLOAD=1; node "firmenbuch-suche.mjs" "Firma XY GmbH"; Remove-Item Env:NO_DOWNLOAD

# Schnell & unsichtbar (kein Fenster) – z.B. für Tests
$env:HEADLESS=1; node "firmenbuch-suche.mjs" "Velartis GmbH"; Remove-Item Env:HEADLESS
```

Ergebnisse landen unter **`alexs projekt\output\<Firmenname>\`** (Screenshots `01`–`04`, PDFs, `_stammdaten.txt`, `_ergebnis.txt`).

**Output als PDF erzeugen** (z.B. aus einer Markdown-Zusammenfassung):
```powershell
node "report-pdf.mjs" "meine-analyse.md" "Analyse.pdf"
```

---

## 4. Genauer Ablauf — was, wie, warum

**Schritt 0 — Werkzeugwahl.** Zuerst geprüft, ob ein **Playwright-MCP-Server** verfügbar ist (wäre der direkteste Weg, den Browser zu steuern). War **nicht** vorhanden → stattdessen das **Playwright-npm-Paket** über kurze Node-Skripte genutzt. Warum Playwright: zuverlässige Browsersteuerung inkl. **Download-Handling** und Screenshots; bereits im Projekt installiert.

**Schritt 1 — Umgebung verifiziert.** `node`, Edge und der Chromium-Cache geprüft, bevor irgendetwas läuft (spart Fehlversuche).

**Schritt 2 — Suche.** `https://openfirmenbuch.at` geöffnet, Suchfeld (`input[placeholder*="Firmennamen"]`) befüllt, Enter. Ergebnisseite-URL: `…/results/?query=<Firma>&page=1`.

**Schritt 3 — Treffer öffnen.** Auf die Firmenkarte geklickt → Detailseite `…/company/?fnr=<FN>`. Die Karten sind **keine `<a>`-Links**, sondern per JavaScript klickbar → man muss den Text/Heading klicken, nicht eine URL aufrufen.

**Schritt 4 — Screenshots + Stammdaten.** Vollseiten-Screenshot der Detailseite, Stammdaten-Text gesichert (Adresse, Geschäftsführer, FN, Kennzahlen).

**Schritt 5 — Dokumente herunterladen.** Im Block **„Firmendokumente"** gibt es je Zeile einen **„Herunterladen"**-Button. Per `page.getByRole('button',{name:/Herunterladen/i})` alle gefunden, nacheinander geklickt und das Playwright-**`download`-Event** abgefangen (`page.waitForEvent('download')` → `download.saveAs(...)`). Die Tabelle ist **paginiert** (Buttons „1", „2", …) → Folgeseiten anklicken und erneut abarbeiten.

**Schritt 6 — Umbenennen.** Die Original-Dateinamen vom Server sind kryptisch (`document_422436_0070752521244_…_PDF.pdf`). Aus der Tabellenzeile wird **Geschäftsjahr + Einreichdatum** geparst → lesbarer Name `…_Jahresabschluss_2024_eingereicht_2025-06-04.pdf`.

**Schritt 7 — Inhalte auslesen.** Die PDFs sind **maschinenlesbar** (Textebene). Sie wurden direkt gelesen; jeder Abschluss zeigt das **laufende Jahr in EUR** und das **Vorjahr in TEUR**. Daraus Kennzahlen + Trend rekonstruiert (Jahresergebnis = Bilanzgewinn − Gewinnvortrag).

**Schritt 8 — Output als PDF.** HTML gebaut und über Chromium `page.pdf({format:'A4'})` gerendert (kein Office/PDF-Tool nötig). Siehe `report-pdf.mjs`.

---

## 5. Wichtige Erkenntnisse über openfirmenbuch.at

- **Suchfeld-Platzhalter:** „Geben Sie den Firmennamen ein…"
- **Ergebnis-URL:** `…/results/?query=<text>&page=1` — „Keine Ergebnisse gefunden" bei Falschschreibung.
- **Detail-URL:** `…/company/?fnr=<Firmenbuchnummer>` (z.B. `422436f`).
- **Status-Filter** (Aktiv/Historisch/Gelöscht) sind standardmäßig **alle** an.
- **Dokumente:** Tabelle „Firmendokumente", Spalten Datum/Typ/Datei/Aktionen, je Zeile „Anzeigen" + „Herunterladen", **paginiert** (10 pro Seite).
- **Finanz-Tabs (Jahre 2024–2020)** auf der Detailseite zeigen **immer nur den zuletzt ausgewerteten Jahrgang** (hier 2024) — **kein** verlässlicher Verlauf! Historische Zahlen stehen **nur in den PDFs**.
- **Kleinst-/Klein-GmbHs legen nur die Bilanz offen — keine GuV** → kein Umsatz/keine Marge im Firmenbuch.

---

## 6. Was NICHT funktioniert hat / Schwierigkeiten (chronologisch)

| # | Problem | Ursache | Lösung |
|---|---|---|---|
| 1 | Kein Playwright-MCP | nicht installiert | Playwright-npm-Paket per Node-Skript genutzt |
| 2 | „Verlartis GmbH" → **0 Treffer** | **Tippfehler** im Firmennamen | Richtige Schreibweise **Velartis** → 1 Treffer. *Lehre: Schreibweise zählt.* |
| 3 | Kryptische Download-Dateinamen | Server liefert interne Namen | aus Tabellenzeile Jahr+Datum geparst und umbenannt |
| 4 | Umbenennen schlug fehl (`ENOENT`) | Dateiname enthielt **`:`** (unter Windows verboten) | Zeichen `< > : " / \ \| ? *` aus Namen entfernen |
| 5 | Großes HTML im Bash-**Heredoc** → „unexpected EOF" | Sonderzeichen/Quotes im Heredoc | Skript als **`.mjs`-Datei** schreiben und mit `node datei.mjs` ausführen |
| 6 | **Nullbyte** in geschriebener `.mjs` | Leerzeichen in einer Regex-Zeichenklasse wurde fehlerhaft gespeichert | Leerzeichen aus Zeichenklassen heraushalten; mit `node --check` prüfen |
| 7 | Skript findet Playwright nicht (außerhalb von core-app) | ESM sucht `node_modules` ab Skript-Ordner, nicht ab cwd | `createRequire(<core-app/package.json>)` als Anker → läuft von überall |
| 8 | Kein Finanz-Verlauf auf der Website | Seite wertet nur den neuesten Abschluss aus | Verlauf direkt aus den heruntergeladenen PDFs gelesen |

---

## 7. Dateien in diesem Ordner

| Datei | Zweck |
|---|---|
| `firmenbuch-suche.mjs` | **Hauptskript:** Suche → Screenshots → Download aller Jahresabschlüsse |
| `firmenbuch-mcp.mjs` | **MCP-Server:** stellt das Tool als KI-Werkzeug bereit (siehe Abschnitt 9) |
| `report-pdf.mjs` | Wandelt Markdown/HTML in ein formatiertes **PDF** (via Chromium) |
| `README.md` | Diese Anleitung |
| `Anleitung.pdf` | PDF-Version dieser Anleitung |
| `NEUER-CHAT-PROMPT.txt` | Fertiger Text zum Einfügen in ein neues Chatfenster |
| `output\<Firma>\` | Ergebnisse je Firma (Screenshots, PDFs, Stammdaten) |

---

## 8. Prompt für ein NEUES Chatfenster (kopieren & einfügen)

> Öffne mit Playwright sichtbar den Browser, gehe auf openfirmenbuch.at und suche **„<FIRMENNAME> GmbH"**. Öffne den ersten Treffer (Detailseite), mach Screenshots und lade **alle** Jahresabschluss-PDFs herunter (auch Folgeseiten der Dokumententabelle), benenne sie lesbar nach `Firma_Jahresabschluss_<Jahr>_eingereicht_<JJJJ-MM-TT>.pdf`.
>
> Nutze das fertige Skript: führe in PowerShell aus
> `node "<ABSOLUTER-PFAD>/mcp-portfolio/firmenbuch-mcp/firmenbuch-suche.mjs" "<FIRMENNAME> GmbH"`.
> Die Ergebnisse liegen dann in `…\alexs projekt\output\<Firma>\`.
>
> Danach: lies die PDFs aus, erstelle eine Zusammenfassung mit allen Bilanz-Kennzahlen und Trend, und gib mir das Ergebnis **als PDF** (z.B. via `report-pdf.mjs`). Achte auf: korrekte Schreibweise des Firmennamens (sonst 0 Treffer), keine `:`/Sonderzeichen in Dateinamen, kleine GmbHs haben **keine GuV** (nur Bilanz).

---

## 9. MCP-Server — das Tool als KI-Werkzeug (`firmenbuch-mcp.mjs`)

**Was das ist:** Ein MCP-Server hat **keine Oberfläche** — er ist ein Adapter, der eine
KI (z.B. Claude in Claude Desktop / Claude Code) das Firmenbuch-Tool **selbst aufrufen**
lässt. Statt `node firmenbuch-suche.mjs "Velartis GmbH"` im Terminal zu tippen, sagt man
der KI in normaler Sprache *„recherchiere Velartis GmbH"* — die KI ruft das Werkzeug auf,
der Server führt den bewährten Scraper aus und gibt das Ergebnis an die KI zurück.

**Tool-Prinzip:** Die Werkzeuge tun, was die KI *nicht* kann (Browser steuern, PDFs
parsen). Das Deuten der Zahlen macht der Agent selbst.

| Werkzeug | Eingabe | Tut |
|---|---|---|
| `firmenbuch_suche` | `{ firma, nurScreenshots? }` | ruft den Scraper headless auf, gibt Stammdaten + Dateiliste zurück |
| `firmenbuch_kennzahlen` | `{ firma, maxJahre?, zeichenProPdf? }` | liest die heruntergeladenen PDFs (Textebene) je Jahr für die Bilanzanalyse |

Der Server fasst `firmenbuch-suche.mjs` **nicht** an — er ruft es als Unterprozess auf
(via `process.execPath`, `HEADLESS=1`). Transport: **stdio**.

### Einrichtung

```powershell
npm install        # @modelcontextprotocol/sdk, zod, pdf-parse (einmalig)
```

**In Claude Desktop** — Eintrag in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "firmenbuch": {
      "command": "node",
      "args": ["<ABSOLUTER-PFAD>/mcp-portfolio/firmenbuch-mcp/firmenbuch-mcp.mjs"]
    }
  }
}
```

**In Claude Code** — ein Befehl:
```bash
claude mcp add firmenbuch -- node "<ABSOLUTER-PFAD>/mcp-portfolio/firmenbuch-mcp/firmenbuch-mcp.mjs"
```

Danach App/Claude Code neu starten. Test mit:
> „Recherchiere die Velartis GmbH und analysiere mir den Bilanz-Trend."

### Smoke-Test (ohne KI-App)

Der Handshake (`initialize` + `tools/list`) wurde verifiziert — der Server bietet beide
Werkzeuge an. Ein Wiederhol-Test lässt sich mit einem kleinen stdio-Client gegen
`node firmenbuch-mcp.mjs` fahren.

---

*Erstellt am 13.06.2026, MCP-Server ergänzt 25.06.2026. Datenquelle: öffentliche Firmenbuch-Auszüge über openfirmenbuch.at.*
