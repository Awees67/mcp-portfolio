# energie-planer — MCP-Server

> Ein use-case-getriebener MCP-Server: Er legt energieintensive Lasten automatisch in die
> **günstigsten Börsen-Stromstunden**. Gebaut nach einem echten Forward-Deployed-Vorgehen
> — erst Szenario & Pain Point, dann das Werkzeug.

---

## Das Szenario (kurz)

**Alpenform GmbH** (fiktiv) — Aluminium-Hersteller bei Linz, energieintensiv, mit
500-kWh-Batteriespeicher. Der Schichtleiter sucht **täglich ~30 Minuten** von Hand die
günstigsten Börsenstrom-Stunden für morgen heraus (Website → Excel → Augenmaß), tippt sich
dabei vertippen und **verpasst regelmäßig die günstigsten und die negativen Preisfenster.**

Volle Aufnahme: [`docs/01-discovery.md`](docs/01-discovery.md) · Lösungs-Design:
[`docs/02-loesung-design.md`](docs/02-loesung-design.md).

## Die Lösung

Eine KI bekommt drei Werkzeuge und erledigt den Job in **<2 Minuten**. Der Schichtleiter
fragt einfach:

> „Wann soll ich morgen den Speicher 3 Stunden laden — nur zwischen 6 und 22 Uhr?"

| Werkzeug | Tut |
|---|---|
| `strompreise` | stündliche Day-Ahead-Preise (heute/morgen), ct/kWh |
| `guenstigstes_fenster` | billigstes zusammenhängendes N-Std.-Fenster + Ersparnis; optional auf Zeitfenster begrenzt (z.B. 6–22 Uhr) |
| `negativpreis_stunden` | Stunden mit negativem Preis (Betrieb bekommt Geld) |

**Prinzip:** Das Werkzeug holt Live-Daten + rechnet deterministisch; das Deuten/Empfehlen
macht der Agent. Quelle: **aWATTar-API** (öffentlich, kostenlos, **ohne Key** — kein
Scraping, kein Rechtsrisiko).

## ROI

Ersetzt eine **tägliche 30-Minuten-Handarbeit**, eliminiert Tippfehler und fängt günstige/
negative Preisfenster ab, die das Team vorher verpasst hat.

---

## Einrichtung

```bash
npm install        # @modelcontextprotocol/sdk, zod  (kein Browser noetig)
```

**In Claude Code registrieren:**
```bash
claude mcp add energie-planer -- node "<ABSOLUTER-PFAD>/mcp-portfolio/energie-planer-mcp/energie-planer-mcp.mjs"
```

**In Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "energie-planer": {
      "command": "node",
      "args": ["<ABSOLUTER-PFAD>/mcp-portfolio/energie-planer-mcp/energie-planer-mcp.mjs"]
    }
  }
}
```

App neu starten, dann z.B.:
> „Zeig mir die Strompreise für morgen und plane mir die 3-stündige Speicherladung in das
> günstigste Fenster zwischen 6 und 22 Uhr."

## Test ohne KI-App

```bash
npm run smoke      # MCP-Handshake + tools/list + Live-Aufruf von strompreise
```

---

## Architektur

```
Schichtleiter ──(Sprache)──► KI (Claude) ──(Werkzeug-Aufruf)──► energie-planer-mcp.mjs ──fetch──► api.awattar.at
```

- Transport: **stdio** (lokal). Kein Browser → leichtgewichtig, später leicht als
  HTTP-Server hostbar (Produktion).
- Node ≥18 (globales `fetch`). Abhängigkeiten: nur SDK + zod.

*Hinweis: Das Szenario ist ein realistischer, fiktiver Fall (Demonstration). Die
Day-Ahead-Preise von morgen sind i.d.R. erst ab ca. 13:00 verfügbar — davor liefert
`tag: "heute"` Daten.*
