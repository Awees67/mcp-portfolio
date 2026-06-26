# 01 — Discovery: Das Enterprise-Problem

*Projekt: vergabe-intel · Sektor: Public & Infrastructure / Energy · Forward-Deployed-Szenario*

---

## Kontext

**Kunde (fiktiv):** Ein großer Infrastruktur-/Energiekonzern mit einer Abteilung
**Business Development / Bid Management** (12 Personen), die laufend nach relevanten
**öffentlichen Ausschreibungen** in der DACH-Region und EU sucht, um sich darauf zu
bewerben.

## Das Problem (Enterprise-Maßstab)

- EU-weit werden **hunderttausende Ausschreibungen pro Jahr** veröffentlicht (TED).
- Das Team sichtet sie **teils manuell** über mehrere Portale, mit Stichwort-Suchen und
  Excel-Listen.
- Folgen:
  - **Relevante Ausschreibungen werden übersehen** → entgangene Aufträge (Millionen).
  - **Keine konsistente Priorisierung** — was ist *für uns* am wichtigsten?
  - **Keine Gesamtsicht** (wie verteilt sich das Marktvolumen nach Land/Sektor?).
  - Aufwand: mehrere Personentage pro Woche.

Das ist **kein „eine Person spart 30 Minuten"-Fall**, sondern **hohes Volumen, mehrere
Quellen, Experten-Urteil, Millionen-ROI** — Enterprise.

## Ist-Prozess

1. Mitarbeiter öffnen mehrere Vergabe-Portale, suchen nach Stichworten.
2. Kopieren Treffer in Excel, bewerten „passt / passt nicht" von Hand.
3. Diskutieren wöchentlich, worauf man sich bewirbt.
4. Keine verlässliche Statistik, keine wiederholbare Relevanz-Logik.

## Erfolgskriterien (messbar)

| Kriterium | Ist | Ziel |
|---|---|---|
| Relevante Treffer finden | manuell, lückenhaft | **vollständig, in Sekunden** |
| Priorisierung | Bauchgefühl | **nachvollziehbarer Score + Begründung** |
| Marktüberblick | fehlt | **Aggregation nach Land/Sektor auf Knopfdruck** |
| Aufwand | mehrere PT/Woche | **Minuten** |
| Skaliert auf … | — | **Hunderttausende Datensätze** |

## Lösungsrichtung

Ein **Agent**, der über eine **Datenbank** aller Ausschreibungen sucht, aggregiert und
nach einem **Organisationsprofil** die relevantesten findet — schnell, wiederholbar,
nachvollziehbar. Details: `02-architektur.md`.
