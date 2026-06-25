#!/usr/bin/env node
/**
 * firmenbuch-mcp.mjs — MCP-Server, der das Firmenbuch-Tool als KI-Werkzeug bereitstellt.
 * ---------------------------------------------------------------------------
 * Stellt einer KI (z.B. Claude in Claude Desktop / Claude Code) Werkzeuge bereit:
 *
 *   firmenbuch_suche      → sucht eine Firma auf openfirmenbuch.at, laedt alle
 *                           Jahresabschluss-PDFs, gibt Stammdaten + Dateiliste zurueck.
 *                           (Browser-Automation — kann die KI selbst nicht.)
 *   firmenbuch_kennzahlen → liest die heruntergeladenen PDFs (Textebene) je Jahr,
 *                           damit die KI Bilanz-Kennzahlen + Trend ANALYSIEREN kann.
 *                           (PDF-Parsing macht das Werkzeug; das Deuten macht der Agent.)
 *
 * Der Server fasst den bewaehrten Scraper NICHT an — er ruft ihn als Unterprozess auf.
 * Transport: stdio (die KI-App startet diesen Server als Kindprozess).
 *
 * In Claude Desktop / Claude Code registrieren (Beispiel claude_desktop_config.json):
 *   "mcpServers": {
 *     "firmenbuch": { "command": "node", "args": ["<voller Pfad>/firmenbuch-mcp.mjs"] }
 *   }
 * ---------------------------------------------------------------------------
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const execFileP = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.join(__dir, 'firmenbuch-suche.mjs');

// EXAKT dieselbe Namens-Bereinigung wie im Scraper -> selber Ausgabeordner.
const sane = s => s.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const outDir = firma => path.join(__dir, 'output', sane(firma) || 'firma');
const readIf = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

const server = new McpServer({ name: 'firmenbuch', version: '1.0.0' });

// --- Werkzeug 1: Suche + Download (ruft den bestehenden Scraper headless auf) ---
server.registerTool(
  'firmenbuch_suche',
  {
    title: 'Firmenbuch-Suche & Download',
    description:
      'Sucht eine oesterreichische Firma auf openfirmenbuch.at, laedt ALLE veroeffentlichten ' +
      'Jahresabschluss-PDFs herunter und gibt Stammdaten (Adresse, Geschaeftsfuehrung, FN) ' +
      'sowie die Liste der heruntergeladenen Dateien zurueck. Exakte Schreibweise des ' +
      'Firmennamens wichtig (sonst 0 Treffer).',
    inputSchema: {
      firma: z.string().min(2).describe('Exakter Firmenname, z.B. "Velartis GmbH"'),
      nurScreenshots: z.boolean().optional().describe('true = nur Suche + Screenshots, keine PDF-Downloads'),
    },
  },
  async ({ firma, nurScreenshots }) => {
    const env = { ...process.env, HEADLESS: '1' };
    if (nurScreenshots) env.NO_DOWNLOAD = '1';
    try {
      await execFileP(process.execPath, [SCRAPER, firma], {
        cwd: __dir, env, timeout: 240000, maxBuffer: 16 * 1024 * 1024,
      });
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `Scraper-Fehler bei "${firma}": ${e.message}` }] };
    }
    const dir = outDir(firma);
    const ergebnis = readIf(path.join(dir, '_ergebnis.txt'));
    const stamm = readIf(path.join(dir, '_stammdaten.txt'));
    if (!ergebnis && !stamm) {
      return { isError: true, content: [{ type: 'text', text: `Keine Ergebnisse fuer "${firma}" — Schreibweise pruefen.` }] };
    }
    const text =
      `# Firmenbuch-Ergebnis: ${firma}\n\n` +
      `## Stammdaten\n${(stamm || '(keine)').slice(0, 4000)}\n\n` +
      `## Heruntergeladene Dokumente\n${ergebnis || '(keine)'}\n\n` +
      `Ausgabeordner: ${dir}\n` +
      `Naechster Schritt: firmenbuch_kennzahlen({ firma: "${firma}" }) fuer die Bilanzanalyse.`;
    return { content: [{ type: 'text', text }] };
  }
);

// --- Werkzeug 2: PDFs auslesen (Textebene) fuer die Bilanzanalyse durch die KI ---
server.registerTool(
  'firmenbuch_kennzahlen',
  {
    title: 'Jahresabschluesse auslesen',
    description:
      'Liest die zuvor heruntergeladenen Jahresabschluss-PDFs einer Firma (Textebene) und gibt ' +
      'den Rohtext je Jahr zurueck, damit die KI Bilanz-Kennzahlen (Umsatz, Bilanzsumme, ' +
      'Eigenkapital, Jahresergebnis) und den Trend selbst analysieren kann. ' +
      'Voraussetzung: vorher firmenbuch_suche aufrufen.',
    inputSchema: {
      firma: z.string().min(2).describe('Firmenname wie bei firmenbuch_suche'),
      maxJahre: z.number().int().positive().optional().describe('Wie viele PDFs maximal lesen (Default 12)'),
      zeichenProPdf: z.number().int().positive().optional().describe('Textlaenge je PDF (Default 3500)'),
    },
  },
  async ({ firma, maxJahre = 12, zeichenProPdf = 3500 }) => {
    // pdf-parse robust laden (Unterpfad umgeht den Debug-Selbsttest des Pakets)
    let pdfParse;
    try { pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default; }
    catch (e) { return { isError: true, content: [{ type: 'text', text: `pdf-parse nicht ladbar: ${e.message}. Im Projektordner "npm install pdf-parse" ausfuehren.` }] }; }

    const dir = outDir(firma);
    if (!fs.existsSync(dir)) {
      return { isError: true, content: [{ type: 'text', text: `Kein Ordner fuer "${firma}". Zuerst firmenbuch_suche aufrufen.` }] };
    }
    const pdfs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort().slice(0, maxJahre);
    if (!pdfs.length) {
      return { isError: true, content: [{ type: 'text', text: `Keine PDFs in ${dir}. Zuerst firmenbuch_suche aufrufen.` }] };
    }
    let out = `# Jahresabschluss-Texte: ${firma} (${pdfs.length} Dateien)\n` +
      `Hinweis: laufendes Jahr meist in EUR, Vorjahr in TEUR. Jahresergebnis = Bilanzgewinn - Gewinnvortrag.\n`;
    for (const f of pdfs) {
      try {
        const data = await pdfParse(fs.readFileSync(path.join(dir, f)));
        out += `\n\n## ${f}\n${data.text.replace(/\n{3,}/g, '\n\n').slice(0, zeichenProPdf)}`;
      } catch (e) {
        out += `\n\n## ${f}\n(Lesefehler: ${e.message})`;
      }
    }
    return { content: [{ type: 'text', text: out }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[firmenbuch-mcp] bereit (stdio) — Werkzeuge: firmenbuch_suche, firmenbuch_kennzahlen');
