#!/usr/bin/env node
/**
 * energie-planer-mcp.mjs — MCP-Server "energie-planer"
 * ---------------------------------------------------------------------------
 * Use Case (siehe docs/01-discovery.md): Ein energieintensiver Betrieb (Alpenform GmbH)
 * legt taeglich Speicher-Ladung und verschiebbare Prozesse von Hand in die guenstigsten
 * Boersen-Stromstunden (~30 Min/Tag, fehleranfaellig, verpasst negative Preise).
 *
 * Dieser Server gibt einer KI drei Werkzeuge, um das in <2 Min zu erledigen:
 *   strompreise            → stuendliche Day-Ahead-Preise (heute/morgen) aus der aWATTar-API
 *   guenstigstes_fenster   → billigstes zusammenhaengendes N-Stunden-Fenster (+ Ersparnis),
 *                            optional begrenzt auf ein Zeitfenster (z.B. 06-22 Uhr)
 *   negativpreis_stunden   → Stunden mit negativem Preis (Betrieb bekommt Geld)
 *
 * Prinzip: Das Werkzeug holt Live-Daten + rechnet deterministisch. Das Deuten/Empfehlen
 * macht der Agent. Quelle: aWATTar (oeffentlich, kostenlos, ohne Key) — kein Scraping.
 * Transport: stdio.
 * ---------------------------------------------------------------------------
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = 'https://api.awattar.at/v1/marketdata';

// --- Datenbeschaffung -------------------------------------------------------
// aWATTar liefert { data: [{ start_timestamp, end_timestamp, marketprice, unit }] }
// marketprice ist EUR/MWh -> ct/kWh = EUR/MWh / 10.
async function ladeMarktdaten() {
  const res = await fetch(API, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`aWATTar HTTP ${res.status}`);
  const json = await res.json();
  return (json.data || []).map(d => ({
    start: d.start_timestamp,            // epoch ms
    end: d.end_timestamp,
    ctKwh: d.marketprice / 10,           // EUR/MWh -> ct/kWh
  }));
}

// Lokales Datum (Europe/Vienna = Maschinen-Zeitzone) fuer "heute"/"morgen".
function zielDatumStr(tag) {
  const d = new Date();
  if (tag === 'morgen') d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('de-AT');
}
function fuerTag(daten, tag) {
  const ziel = zielDatumStr(tag);
  return daten
    .filter(x => new Date(x.start).toLocaleDateString('de-AT') === ziel)
    .sort((a, b) => a.start - b.start);
}

const hh = ms => String(new Date(ms).getHours()).padStart(2, '0') + ':00';
const ct = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

// --- Server -----------------------------------------------------------------
const server = new McpServer({ name: 'energie-planer', version: '1.0.0' });

server.registerTool(
  'strompreise',
  {
    title: 'Boersen-Strompreise',
    description:
      'Liefert die stuendlichen Day-Ahead-Boersenstrompreise (ct/kWh) fuer heute oder morgen ' +
      '(aWATTar, Oesterreich). Morgen ist meist ab ca. 13:00 verfuegbar.',
    inputSchema: { tag: z.enum(['heute', 'morgen']).optional().describe('Default: morgen') },
  },
  async ({ tag = 'morgen' }) => {
    let daten;
    try { daten = fuerTag(await ladeMarktdaten(), tag); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: `Preise nicht abrufbar: ${e.message}` }] }; }
    if (!daten.length) {
      return { content: [{ type: 'text', text: `Noch keine Preise fuer ${tag} verfuegbar (Day-Ahead meist ab ~13:00 fuer den Folgetag).` }] };
    }
    const schnitt = daten.reduce((s, x) => s + x.ctKwh, 0) / daten.length;
    const zeilen = daten.map(d => `${hh(d.start)}  ${ct(d.ctKwh).padStart(6)} ct/kWh`).join('\n');
    return { content: [{ type: 'text', text:
      `# Strompreise ${tag} (${daten.length} Std., aWATTar)\n` +
      `Tagesschnitt: ${ct(schnitt)} ct/kWh\n\n${zeilen}` }] };
  }
);

server.registerTool(
  'guenstigstes_fenster',
  {
    title: 'Guenstigstes Zeitfenster',
    description:
      'Berechnet das billigste ZUSAMMENHAENGENDE N-Stunden-Fenster (z.B. fuer eine ' +
      'Speicher-Ladung) und die Ersparnis gegenueber dem Tagesschnitt. Optional auf ein ' +
      'Zeitfenster begrenzbar (z.B. fruehestens 6, spaetestens 22 fuer werktags 06-22 Uhr).',
    inputSchema: {
      dauerStunden: z.number().int().min(1).max(24).describe('Laenge des benoetigten Fensters in Stunden'),
      fruehestens: z.number().int().min(0).max(23).optional().describe('fruehester Startstunde (0-23), Default 0'),
      spaetestens: z.number().int().min(1).max(24).optional().describe('spaetestes Ende als Stunde (1-24), Default 24'),
      tag: z.enum(['heute', 'morgen']).optional().describe('Default: morgen'),
    },
  },
  async ({ dauerStunden, fruehestens = 0, spaetestens = 24, tag = 'morgen' }) => {
    let daten;
    try { daten = fuerTag(await ladeMarktdaten(), tag); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: `Preise nicht abrufbar: ${e.message}` }] }; }
    if (daten.length < dauerStunden) {
      return { content: [{ type: 'text', text: `Nicht genug Preisdaten fuer ${tag} (${daten.length} Std.).` }] };
    }
    const schnitt = daten.reduce((s, x) => s + x.ctKwh, 0) / daten.length;
    let best = null;
    for (let i = 0; i + dauerStunden <= daten.length; i++) {
      const fenster = daten.slice(i, i + dauerStunden);
      const startH = new Date(fenster[0].start).getHours();
      if (startH < fruehestens || startH + dauerStunden > spaetestens) continue; // Randbedingung 06-22
      const avg = fenster.reduce((s, x) => s + x.ctKwh, 0) / dauerStunden;
      if (!best || avg < best.avg) best = { avg, von: fenster[0].start, bis: fenster[dauerStunden - 1].end };
    }
    if (!best) {
      return { content: [{ type: 'text', text: `Kein ${dauerStunden}-Std.-Fenster zwischen ${fruehestens}:00 und ${spaetestens}:00 moeglich.` }] };
    }
    const ersparnis = schnitt - best.avg;
    return { content: [{ type: 'text', text:
      `# Guenstigstes ${dauerStunden}-Stunden-Fenster (${tag})\n` +
      `Zeitraum: ${hh(best.von)} – ${hh(best.bis)}\n` +
      `Schnittpreis im Fenster: ${ct(best.avg)} ct/kWh\n` +
      `Tagesschnitt: ${ct(schnitt)} ct/kWh\n` +
      `Ersparnis: ${ct(ersparnis)} ct/kWh guenstiger als der Tagesschnitt` +
      (best.avg < 0 ? `\nHinweis: negativer Preis — der Betrieb bekommt in diesem Fenster Geld fuers Verbrauchen.` : '') }] };
  }
);

server.registerTool(
  'negativpreis_stunden',
  {
    title: 'Negativpreis-Stunden',
    description:
      'Listet die Stunden mit NEGATIVEM Boersenpreis (Betrieb bekommt Geld fuers ' +
      'Verbrauchen). Gut, um Lasten gezielt dorthin zu legen.',
    inputSchema: { tag: z.enum(['heute', 'morgen']).optional().describe('Default: morgen') },
  },
  async ({ tag = 'morgen' }) => {
    let daten;
    try { daten = fuerTag(await ladeMarktdaten(), tag); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: `Preise nicht abrufbar: ${e.message}` }] }; }
    const neg = daten.filter(d => d.ctKwh < 0);
    if (!neg.length) {
      return { content: [{ type: 'text', text: `Keine negativen Preise ${tag}.` }] };
    }
    const zeilen = neg.map(d => `${hh(d.start)}  ${ct(d.ctKwh)} ct/kWh`).join('\n');
    return { content: [{ type: 'text', text: `# Negativpreis-Stunden (${tag}) — ${neg.length} Std.\n${zeilen}` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[energie-planer] bereit (stdio) — Werkzeuge: strompreise, guenstigstes_fenster, negativpreis_stunden');
