# vergabe-intel — Enterprise-MCP-Server

> **Vergabe-Intelligence:** Ein KI-Agent durchsucht, aggregiert und priorisiert
> **tausende öffentliche Ausschreibungen** für eine große Organisation. Datenbank-gestützt,
> paginiert, injection-sicher — gebaut wie ein echtes Produkt, nicht wie ein Demo-Skript.

---

## Das Problem (Enterprise)

Große Infrastruktur-/Energie-Organisationen müssen laufend **hunderttausende
Ausschreibungen** sichten, um relevante Aufträge nicht zu verpassen — heute teils manuell
über mehrere Portale. Folge: verpasste Aufträge (Millionen), keine Priorisierung, kein
Marktüberblick.

Volle Herleitung: [`docs/01-discovery.md`](docs/01-discovery.md) · Architektur:
[`docs/02-architektur.md`](docs/02-architektur.md).

## Die Werkzeuge

| Werkzeug | Tut |
|---|---|
| `vergabe_suche` | gefilterte, **paginierte** Suche (Stichwort, Land, Sektor, Wertspanne, nur offene) |
| `vergabe_details` | eine Ausschreibung vollständig |
| `vergabe_statistik` | Aggregation nach Land / Sektor / Status (Anzahl + Gesamtwert) |
| `vergabe_match` | findet die relevantesten **offenen** Ausschreibungen für ein Profil — mit **Score + Begründung** |

**Prinzip:** Die Werkzeuge **suchen/aggregieren/scoren** (das kann die KI über große
Datenmengen nicht zuverlässig). Das **Empfehlen** macht der Agent.

## Was es „enterprise & scalable" macht

- **Datenbank-gestützt** (SQLite, eingebaut in Node ≥22) — einmal ingestiert, beliebig oft
  abgefragt. **Echte Daten: ~2.500 Ausschreibungen aus der EU-TED-API** (60.000+ verfügbar),
  Abfragen in **1–12 ms**.
- **Pagination überall** (`limit` max 100 + `offset`/`total`) — nie ungebremste Mengen.
- **Sicher:** DB **read-only**, **parametrisierte SQL** (keine Injection),
  **Input-Validierung** (zod), Whitelist für Gruppierungen.
- **Beobachtbar:** Trace-Logging pro Aufruf; strukturierte Fehler.

## Schnellstart

```bash
npm install           # @modelcontextprotocol/sdk, zod  (SQLite ist in Node ≥22 eingebaut)
node ingest.mjs 3000  # holt ECHTE Ausschreibungen aus der EU-TED-API → vergabe.db
npm run smoke         # Test: Handshake + Aufrufe gegen die echte DB, mit Zeitmessung
```

**In Claude Code registrieren:**
```bash
claude mcp add vergabe-intel -- node "<absoluter-pfad>/vergabe-intel-mcp/vergabe-intel-mcp.mjs"
```

Dann z. B. fragen:
> „Such mir offene Energie-Ausschreibungen in Österreich über 1 Mio €."
> „Welche Ausschreibungen passen zu uns? Wir machen Ladeinfrastruktur und Photovoltaik in AT/DE."
> „Wie verteilt sich das Ausschreibungsvolumen nach Sektor?"

## Architektur (kurz)

```
KI-Agent → vergabe-intel-mcp → (read-only, parametrisiert) → SQLite-DB
                                                              (Produktion: Ingest aus EU TED / Kunden-ERP)
```

### Produktions-Weg (gebaut & getestet)

Neben dem stdio-Weg (Demo) ist der Produktions-Weg umgesetzt:

- **HTTP-Server mit URL:** `node vergabe-intel-http.mjs` → erreichbar unter `http://localhost:3000/mcp`
- **Token-Schloss:** `/mcp` verlangt `Authorization: Bearer <MCP_TOKEN>`. Das Token kommt von außen (Umgebungsvariable), nicht aus dem Code — ohne/falsches Token → **401**.
- **Registrieren per URL + Token:**
  ```bash
  claude mcp add --transport http vergabe-intel http://localhost:3000/mcp --header "Authorization: Bearer <TOKEN>"
  ```
- **Container:** das `Dockerfile` packt alles in eine Kiste, die überall gleich läuft:
  ```bash
  docker build -t vergabe-intel .
  docker run -p 3000:3000 -e MCP_TOKEN=<TOKEN> vergabe-intel
  ```

stdio (lokal) für die Demo; in Produktion HTTP + Token-Auth, gehostete DB (Postgres), Monitoring —
**derselbe Werkzeug-Code**, siehe `docs/02-architektur.md`.

---

*Die Daten kommen **live aus der offiziellen EU-TED-API** (Tenders Electronic Daily —
api.ted.europa.eu, offen, ohne Key) via `ingest.mjs`. `seed.mjs` erzeugt alternativ einen
generierten Datensatz als Offline-Fallback.*
