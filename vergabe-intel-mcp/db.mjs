/**
 * db.mjs — Abfrage-Schicht über die SQLite-DB.
 * Sicherheit: öffnet die DB READ-ONLY (der MCP-Server kann nie schreiben/löschen),
 * alle Abfragen sind PARAMETRISIERT (keine SQL-Injection). Spalten für Gruppierung
 * kommen aus einer WHITELIST, nie aus freiem Nutzertext.
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dir, 'vergabe.db');

let _db = null;
function db() {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) throw new Error('Datenbank fehlt — zuerst "node seed.mjs" ausführen.');
  _db = new DatabaseSync(DB_PATH, { readOnly: true }); // <-- nur lesen
  return _db;
}

const COLS = 'id, title, buyer, country, sector, cpv, value_eur, published, deadline, status';

// --- Suche mit Filtern + Pagination (gibt total + Seite zurück) ---
export function searchTenders({ query, land, sektor, minWertEur, maxWertEur, nurOffen, limit, offset }) {
  const where = [], args = [];
  if (query)              { where.push('(title LIKE ? OR description LIKE ?)'); args.push(`%${query}%`, `%${query}%`); }
  if (land)               { where.push('country = ?'); args.push(land); }
  if (sektor)             { where.push('sector = ?');  args.push(sektor); }
  if (minWertEur != null) { where.push('value_eur >= ?'); args.push(minWertEur); }
  if (maxWertEur != null) { where.push('value_eur <= ?'); args.push(maxWertEur); }
  if (nurOffen)           { where.push("status = 'offen'"); }
  const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db().prepare(`SELECT COUNT(*) AS n FROM tenders ${wsql}`).get(...args).n;
  const items = db().prepare(
    `SELECT ${COLS} FROM tenders ${wsql} ORDER BY published DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return { total, limit, offset, items };
}

export function getTender(id) {
  return db().prepare(`SELECT ${COLS}, description FROM tenders WHERE id = ?`).get(id) || null;
}

// --- Aggregation (Gruppierungs-Spalte aus Whitelist) ---
const GROUP_COLS = { land: 'country', sektor: 'sector', status: 'status' };
export function statistik(gruppierung) {
  const col = GROUP_COLS[gruppierung];
  if (!col) throw new Error(`Ungültige Gruppierung: ${gruppierung}`);
  return db().prepare(
    `SELECT ${col} AS gruppe, COUNT(*) AS anzahl, SUM(value_eur) AS summe_eur
     FROM tenders GROUP BY ${col} ORDER BY anzahl DESC`
  ).all();
}

// --- Relevanz-Match: in SQL vorfiltern (skaliert), dann scoren ---
export function matchTenders({ sektoren = [], laender = [], minWertEur, stichworte = [], limit = 10 }) {
  const where = ["status = 'offen'"], args = [];
  // Vorfilter in SQL hält die Menge klein (skaliert auch bei Millionen Zeilen)
  if (sektoren.length) { where.push(`sector IN (${sektoren.map(() => '?').join(',')})`); args.push(...sektoren); }
  if (laender.length)  { where.push(`country IN (${laender.map(() => '?').join(',')})`); args.push(...laender); }
  if (minWertEur != null) { where.push('value_eur >= ?'); args.push(minWertEur); }
  const rows = db().prepare(
    `SELECT ${COLS}, description FROM tenders WHERE ${where.join(' AND ')} LIMIT 5000`
  ).all(...args);

  const scored = rows.map(r => {
    let score = 0; const gruende = [];
    if (sektoren.includes(r.sector)) { score += 40; gruende.push(`Sektor ${r.sector}`); }
    if (laender.includes(r.country)) { score += 25; gruende.push(`Land ${r.country}`); }
    if (minWertEur != null && r.value_eur >= minWertEur) { score += 15; gruende.push('Wert über Schwelle'); }
    for (const kw of stichworte) {
      if (`${r.title} ${r.description}`.toLowerCase().includes(String(kw).toLowerCase())) {
        score += 10; gruende.push(`Stichwort „${kw}"`);
      }
    }
    return { id: r.id, title: r.title, buyer: r.buyer, country: r.country, sector: r.sector,
             value_eur: r.value_eur, deadline: r.deadline, score, gruende };
  }).sort((a, b) => b.score - a.score).slice(0, limit);

  return scored;
}
