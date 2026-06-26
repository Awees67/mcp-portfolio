# 02 — Architektur: Was es „enterprise & scalable" macht

*Projekt: vergabe-intel · baut auf `01-discovery.md` auf*

---

## Überblick

```
KI-Agent ──(Werkzeug-Aufruf)──► vergabe-intel-mcp ──(read-only, parametrisiert)──► SQLite-DB
                                                                                  (ingestiert aus
                                                                                   TED / Kunden-ERP)
```

Kernidee, die einen einfachen von einem produktionsreifen MCP-Server trennt: **Daten werden EINMAL
ingestiert und liegen in einer Datenbank** — Abfragen sind dann schnell und beliebig oft,
statt bei jeder Frage alles neu zu holen.

---

## 1. Skalierbarkeit

- **Datenbank statt Live-Abruf:** Ausschreibungen liegen in SQLite (aktuell ~2.500 **echte**
  TED-Notices; in der TED-API sind **60.000+** verfügbar). Der Agent fragt die DB ab — nicht
  bei jeder Frage das Quellsystem.
- **Indizes** auf `country, sector, value_eur, deadline, status` → Filter bleiben schnell,
  auch wenn die Tabelle wächst.
- **Pagination überall:** jedes Such-Tool gibt `total` + eine begrenzte Seite zurück
  (`limit` max **100**, plus `offset`/nächste Seite). Es werden **nie** unbegrenzt Zeilen
  in den Kontext gekippt.
- **Match skaliert:** Vorfilterung der Kandidaten **in SQL** (Sektor/Land/Wert), erst die
  kleine Restmenge wird gescored.
- **Gemessen:** Filter + Aggregation über ~2.500 **echte** Zeilen je **1–12 ms**.

## 2. Sicherheit (3-fach-Check)

- **DB read-only:** Der MCP-Server öffnet die Datenbank mit `readOnly: true` — selbst bei
  einem Fehler kann er **nichts schreiben/löschen** (Least Privilege).
- **Parametrisierte SQL:** *alle* Abfragen nutzen `?`-Platzhalter → **keine SQL-Injection**.
  Gruppierungs-Spalten kommen aus einer **Whitelist**, nie aus freiem Nutzertext.
- **Input-Validierung:** `zod`-Schemas validieren jeden Parameter (Typ, Länge, Wertebereich,
  Enum) — ungültige Eingaben werden abgewiesen, bevor sie die DB erreichen.

## 3. Beobachtbarkeit & Robustheit

- **Trace-Logging:** jeder Aufruf loggt (stderr) Trace-ID, Werkzeug, Dauer, ok/Fehler.
- **Strukturierte Fehler:** jeder Tool-Fehler kommt als sauberes `isError`-Ergebnis zurück,
  der Server bleibt stabil.

## 4. Werkzeug-Schnitt (Tool-Prinzip)

Die Werkzeuge tun, was die KI **nicht** zuverlässig kann: **suchen, aggregieren, scoren**
über große Datenmengen. Das **Deuten und Empfehlen** („worauf sollten wir uns bewerben?")
macht der **Agent** mit den gelieferten Fakten.

| Werkzeug | Aufgabe |
|---|---|
| `vergabe_suche` | gefilterte, paginierte Suche |
| `vergabe_details` | ein Datensatz vollständig |
| `vergabe_statistik` | Aggregation nach Land/Sektor/Status |
| `vergabe_match` | Relevanz-Scoring gegen ein Organisationsprofil (+ Begründung) |

## 5. Von der lokalen Entwicklung zur Produktion

| Aspekt | Dieses Repo (lokal) | Produktion beim Kunden |
|---|---|---|
| Daten | **echter Feed: EU-TED-API** (`ingest.mjs`) | zusätzlich Kunden-ERP, häufigerer Ingest |
| Transport | stdio (lokal) | **HTTP + Token-Auth**, gehostet 24/7 |
| DB | SQLite-Datei | Postgres/Managed-DB, Replikation |
| Betrieb | — | Monitoring, Alerting, Auto-Restart, Audit-Log |

Der **Code der Werkzeuge bleibt gleich** — es ändern sich Datenquelle, Transport und Betrieb.
