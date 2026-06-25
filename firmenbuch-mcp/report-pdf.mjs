/**
 * report-pdf.mjs
 * ---------------------------------------------------------------------------
 * Wandelt eine Markdown- ODER HTML-Datei in ein sauber formatiertes PDF um
 * (gerendert ueber das installierte Chromium von Playwright).
 *
 * AUFRUF:
 *   node report-pdf.mjs <eingabe.md|eingabe.html> [ausgabe.pdf]
 * Beispiel:
 *   node report-pdf.mjs README.md Anleitung.pdf
 *
 * Wenn keine Ausgabedatei angegeben ist, wird <eingabe>.pdf erzeugt.
 * Unterstuetzt im Markdown: # Ueberschriften, **fett**, *kursiv*, `code`,
 * [Links](url), Tabellen (| ... |), Aufzaehlungen (- / 1.) und Absaetze.
 * ---------------------------------------------------------------------------
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('FEHLER: Eingabedatei fehlt/nicht gefunden.  node report-pdf.mjs <datei.md|.html> [ausgabe.pdf]');
  process.exit(1);
}
const output = process.argv[3] || input.replace(/\.(md|markdown|html?)$/i, '') + '.pdf';
const raw = fs.readFileSync(input, 'utf8');
const isHtml = /\.html?$/i.test(input);

function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<i>$2</i>');
  const lines = md.replace(/\r/g, '').split('\n');
  let html = '', i = 0;
  const isList = l => /^\s*[-*]\s+/.test(l);
  const isOl = l => /^\s*\d+\.\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++; }
      html += '<table><tr>' + head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr>';
      for (const r of rows) html += '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
      html += '</table>'; continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = h[1].length; html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) { html += '<hr>'; i++; continue; }
    if (isList(line)) { html += '<ul>'; while (i < lines.length && isList(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`; i++; } html += '</ul>'; continue; }
    if (isOl(line)) { html += '<ol>'; while (i < lines.length && isOl(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`; i++; } html += '</ol>'; continue; }
    let para = line; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*[-*#|]/.test(lines[i]) && !isOl(lines[i])) { para += ' ' + lines[i]; i++; }
    html += `<p>${inline(para)}</p>`;
  }
  return html;
}

const body = isHtml ? raw : mdToHtml(raw);
const styled = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{font-family:"Segoe UI",Arial,sans-serif;color:#1a2235;font-size:11px;line-height:1.55;margin:0}
  h1{font-size:21px;color:#0b6b5e;margin:0 0 4px}
  h2{font-size:15px;color:#0b6b5e;border-bottom:2px solid #00dfc1;padding-bottom:3px;margin:18px 0 8px}
  h3{font-size:12.5px;color:#0b6b5e;margin:12px 0 4px}
  code{background:#eef2f5;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:10px}
  table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:10px}
  th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#0b6b5e;color:#fff}
  tr:nth-child(even) td{background:#f3f6f8}
  ul,ol{margin:4px 0 8px;padding-left:20px}
  a{color:#0b6b5e}
  hr{border:none;border-top:1px solid #d1d5db;margin:14px 0}
  @page{size:A4;margin:16mm 14mm}
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.setContent(styled, { waitUntil: 'networkidle' });
await page.pdf({ path: output, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
await browser.close();
console.log('PDF erstellt:', output);
