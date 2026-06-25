# MCP-Server-Portfolio

Eine Sammlung selbst gebauter **Model-Context-Protocol-(MCP-)Server** — Werkzeuge, die
eine KI (z.B. Claude) aufrufen kann, um **reale Aufgaben** zu erledigen. Jeder Server
entsteht nach einem **Forward-Deployed-Vorgehen**: erst ein konkretes Szenario und der
Pain Point, *dann* das Werkzeug.

---

## Projekte

| Projekt | Sektor | Was es tut | Datenquelle |
|---|---|---|---|
| [**energie-planer-mcp**](energie-planer-mcp/) | Energy & Environment | legt energieintensive Lasten in die **günstigsten Börsen-Stromstunden** | aWATTar-API (öffentlich, ohne Key) |

---

## Prinzip — in jedem Projekt gleich

- **Tool-Schnitt:** Das Werkzeug tut, was die KI *nicht* zuverlässig kann — Live-Daten
  holen, deterministisch rechnen, PDFs parsen. Das Deuten/Empfehlen macht der Agent
  selbst. **Keine „Schein-Tools", die nur LLM-Denken umhüllen.**
- **Use-case-getrieben:** Szenario → Pain Point → Lösung mit messbarem Nutzen. Die
  Herleitung steht je Projekt in `docs/` (Discovery + Lösungs-Design).
- **Sauber & getestet:** Smoke-Test (MCP-Handshake + Live-Aufruf), eigene README, eigene
  Abhängigkeiten.

## Tech

Node.js (ESM), `@modelcontextprotocol/sdk`, `zod`.
Transport: **stdio** (lokal) — produktionsreif als HTTP-Server hostbar.

## Schnellstart (pro Projekt)

```bash
cd <projekt>
npm install
# in Claude Code registrieren:
claude mcp add <name> -- node "<absoluter-pfad>/<projekt>/<datei>.mjs"
```

Details in der README des jeweiligen Projektordners.

---

*Die „Szenarien" in den `docs/` sind realistische, aber **fiktive** Fälle zu
Demonstrationszwecken. Datenquellen sind öffentlich und ohne Scraping-/AGB-Konflikt
gewählt.*
