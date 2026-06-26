/**
 * server.mjs — die WERKZEUGE (gemeinsam für stdio UND HTTP).
 * buildServer() erstellt den MCP-Server mit den 4 Werkzeugen und gibt ihn zurück.
 * Welcher "Transport" (Schublade=stdio oder Tür=HTTP) genutzt wird, entscheiden
 * die zwei kleinen Einstiegsdateien (vergabe-intel-mcp.mjs / vergabe-intel-http.mjs).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import { searchTenders, getTender, statistik, matchTenders } from './db.mjs';

const eur = n => '€' + Number(n || 0).toLocaleString('de-AT');
const PAGE_MAX = 100;

let seq = 0;
function trace(name, ms, ok, extra = '') {
  const id = `${Date.now().toString(36)}-${(++seq).toString(36)}`;
  console.error(`[vergabe-intel] ${id} ${name} ${ok ? 'ok' : 'ERR'} ${ms}ms ${extra}`);
}
function tool(name, fn) {
  return async (args) => {
    const t0 = performance.now();
    try {
      const text = await fn(args);
      trace(name, Math.round(performance.now() - t0), true);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      trace(name, Math.round(performance.now() - t0), false, e.message);
      return { isError: true, content: [{ type: 'text', text: `Fehler in ${name}: ${e.message}` }] };
    }
  };
}

export function buildServer() {
  const server = new McpServer({ name: 'vergabe-intel', version: '1.0.0' });

  server.registerTool('vergabe_suche', {
    title: 'Ausschreibungen suchen',
    description: 'Durchsucht tausende öffentliche Ausschreibungen mit Filtern (Stichwort, Land, Sektor, Wertspanne, nur offene). Paginiert: gibt Gesamttreffer + eine Seite zurück.',
    inputSchema: {
      query: z.string().optional().describe('Stichwort in Titel/Beschreibung'),
      land: z.string().length(2).optional().describe('Ländercode, z.B. AT, DE, FR'),
      sektor: z.enum(['Energie', 'Bau', 'IT', 'Transport', 'Beratung', 'Umwelt', 'Gesundheit', 'Sonstige']).optional(),
      minWertEur: z.number().int().nonnegative().optional(),
      maxWertEur: z.number().int().nonnegative().optional(),
      nurOffen: z.boolean().optional().describe('nur Ausschreibungen mit offener Frist'),
      limit: z.number().int().min(1).max(PAGE_MAX).default(20).describe('Treffer pro Seite (max 100)'),
      offset: z.number().int().nonnegative().default(0).describe('Startindex für Pagination'),
    },
  }, tool('vergabe_suche', ({ limit = 20, offset = 0, ...f }) => {
    const { total, items } = searchTenders({ ...f, limit, offset });
    if (!total) return 'Keine Treffer für diese Filter.';
    const zeilen = items.map(t =>
      `• ${t.id} — ${t.title}\n  ${t.buyer} (${t.country}) · ${t.sector} · ${t.value_eur ? eur(t.value_eur) : 'Wert k.A.'} · Frist ${t.deadline || '—'} · ${t.status}`
    ).join('\n');
    const von = offset + 1, bis = offset + items.length;
    const next = bis < total ? `\nNächste Seite: offset=${offset + limit}` : '\n(Ende der Treffer)';
    return `# Ausschreibungen — ${total} Treffer (zeige ${von}–${bis})\n\n${zeilen}${next}`;
  }));

  server.registerTool('vergabe_details', {
    title: 'Ausschreibung im Detail',
    description: 'Gibt alle Felder einer Ausschreibung anhand ihrer ID zurück.',
    inputSchema: { id: z.string().describe('Ausschreibungs-ID, z.B. 434091-2026') },
  }, tool('vergabe_details', ({ id }) => {
    const t = getTender(id);
    if (!t) return `Keine Ausschreibung mit ID ${id} gefunden.`;
    return `# ${t.title}\nID: ${t.id}\nAuftraggeber: ${t.buyer} (${t.country})\nSektor: ${t.sector} · CPV ${t.cpv}\nWert: ${t.value_eur ? eur(t.value_eur) : 'k.A.'}\nVeröffentlicht: ${t.published} · Frist: ${t.deadline || '—'} · Status: ${t.status}\n\n${t.description}`;
  }));

  server.registerTool('vergabe_statistik', {
    title: 'Vergabe-Statistik',
    description: 'Aggregiert alle Ausschreibungen nach Land, Sektor oder Status (Anzahl + Gesamtwert).',
    inputSchema: { gruppierung: z.enum(['land', 'sektor', 'status']).describe('Gruppierungs-Dimension') },
  }, tool('vergabe_statistik', ({ gruppierung }) => {
    const rows = statistik(gruppierung);
    const zeilen = rows.map(r => `${String(r.gruppe).padEnd(12)} ${String(r.anzahl).padStart(6)}   ${eur(r.summe_eur)}`).join('\n');
    return `# Statistik nach ${gruppierung}\n${'Gruppe'.padEnd(12)} ${'Anzahl'.padStart(6)}   Gesamtwert\n${zeilen}`;
  }));

  server.registerTool('vergabe_match', {
    title: 'Relevante Ausschreibungen finden',
    description: 'Findet die für ein Organisationsprofil relevantesten OFFENEN Ausschreibungen und bewertet sie (Score + Begründung). Vorfilterung in der DB hält es skalierbar.',
    inputSchema: {
      sektoren: z.array(z.enum(['Energie', 'Bau', 'IT', 'Transport', 'Beratung', 'Umwelt', 'Gesundheit', 'Sonstige'])).optional(),
      laender: z.array(z.string().length(2)).optional(),
      minWertEur: z.number().int().nonnegative().optional(),
      stichworte: z.array(z.string()).max(10).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
  }, tool('vergabe_match', ({ limit = 10, ...p }) => {
    const res = matchTenders({ ...p, limit });
    if (!res.length) return 'Keine passenden offenen Ausschreibungen für dieses Profil.';
    const zeilen = res.map((t, i) =>
      `${i + 1}. [Score ${t.score}] ${t.id} — ${t.title}\n   ${t.buyer} (${t.country}) · ${t.sector} · ${t.value_eur ? eur(t.value_eur) : 'Wert k.A.'} · Frist ${t.deadline || '—'}\n   Treffergründe: ${t.gruende.join(', ')}`
    ).join('\n');
    return `# Top ${res.length} relevante Ausschreibungen\n\n${zeilen}`;
  }));

  return server;
}
