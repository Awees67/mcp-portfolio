# 01 — Discovery: Ist-Prozess & Pain Point

*Projekt: energie-planer · Sektor: Energy & Environment · Datum der Aufnahme: 25.06.2026*
*Forward-Deployed-Engagement bei (fiktivem) Kunden **Alpenform GmbH***

---

## Kontext

**Kunde:** Alpenform GmbH — Hersteller von Aluminium-Komponenten bei Linz, ~180
Mitarbeiter. **Energieintensiv:** Schmelz-/Gießöfen, Pumpen, ein 500-kWh-Batteriespeicher
sowie einige zeitlich verschiebbare Prozesse (Vorheizung, Speicher-Ladung).

**Anlass:** Strom ist der zweitgrößte Kostenblock. Der Betrieb bezieht Strom zu
**Börsenpreisen** (stündlich schwankend, teils negativ), nutzt das Potenzial aber kaum.

---

## Methode

Discovery vor Ort: **Beobachtung** des Schichtleiters bei der täglichen Routine +
**strukturiertes Interview** („Zeig mir, wie du das heute machst, als wäre ich nicht da.").
Kein Tool-Bau in dieser Phase — nur Verstehen.

---

## Ist-Prozess (wie es HEUTE läuft)

1. Jeden Werktag **nachmittags** öffnet der Schichtleiter manuell die Website mit den
   Börsen-Strompreisen für **den Folgetag** (stündliche Day-Ahead-Preise).
2. Er **liest die 24 Stundenwerte ab** und tippt sie in eine Excel-Tabelle.
3. Er sucht **per Auge** die günstigsten Stunden und legt dort hinein:
   - die ~**3-stündige Ladung** des 500-kWh-Speichers,
   - **2 verschiebbare Prozesse** (dürfen nur **werktags 06–22 Uhr** laufen).
4. Er notiert den Plan und gibt ihn an die Produktion weiter.

**Dauer:** ~**30 Minuten pro Tag**.

---

## Pain Point (mit Erkennungs-Signalen)

| Signal | Beobachtung |
|---|---|
| Wiederholung nach Plan | täglich nachmittags, jeden Werktag |
| Copy-Paste zwischen Systemen | Website → Excel, von Hand |
| „dauert lange / fehleranfällig" | ~30 Min, Tippfehler bei 24 Werten |
| Geld liegt auf dem Tisch | **verpasst regelmäßig die günstigsten und besonders die negativen Preisfenster** |

→ **Vier von vier Signalen** treffen zu. Klarer Automatisierungs-Fall.

---

## Regeln & Randbedingungen (wichtig fürs Tool-Design!)

- Speicher-Ladung braucht **~3 zusammenhängende Stunden**.
- Verschiebbare Prozesse nur **werktags 06–22 Uhr**.
- Entscheidungsbasis sind **stündliche Day-Ahead-Preise** (werden ca. ab 13:00 für den
  Folgetag veröffentlicht).
- Negative Preise = der Betrieb **bekommt Geld** fürs Verbrauchen → maximal nutzen.

> Diese Randbedingungen sind der Grund, warum das spätere Tool eine **Dauer** *und*
> **Zeitfenster-Grenzen** als Eingabe braucht. Hätte man sofort drauflosgebaut, wäre die
> 06–22-Uhr-Grenze vermutlich vergessen worden.

---

## Erfolgskriterien (messbar)

| Kriterium | Ist | Ziel |
|---|---|---|
| Zeitaufwand pro Tag | ~30 Min | **< 2 Min** |
| Günstigstes Fenster verpasst | regelmäßig | **nie** (deterministisch berechnet) |
| Negative Preise genutzt | selten erkannt | **immer markiert** |
| Fehlerquote (Tippfehler) | vorhanden | **0** (kein manuelles Abtippen) |

---

## Nächster Schritt

→ Aus diesem Ist-Bild die **Werkzeuge schneiden** (siehe `02-loesung-design.md`).
Erst dann wird gebaut.
