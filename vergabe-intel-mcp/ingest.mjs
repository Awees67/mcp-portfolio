/**
 * ingest.mjs — holt ECHTE Ausschreibungen aus der offiziellen EU-TED-API
 * (https://api.ted.europa.eu/v3/notices/search, offen, ohne Key) und schreibt
 * sie in die SQLite-DB. Mapping: Mehrsprachigkeit → Deutsch, CPV → Sektor,
 * ISO3-Land → ISO2.
 *
 * Aufruf:  node ingest.mjs [zielAnzahl]      (Default 3000)
 * Filter überschreiben:  TED_QUERY="place-of-performance IN (AUT)" node ingest.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dir, 'vergabe.db');
const ZIEL = Number(process.argv[2] || 3000);
const BASIS_QUERY = process.env.TED_QUERY
  || 'place-of-performance IN (AUT DEU) AND publication-date>=20260101';
const API = 'https://api.ted.europa.eu/v3/notices/search';

const ISO3_2 = { AUT:'AT', DEU:'DE', FRA:'FR', ITA:'IT', NLD:'NL', POL:'PL', ESP:'ES', CZE:'CZ',
  BEL:'BE', SWE:'SE', DNK:'DK', FIN:'FI', PRT:'PT', IRL:'IE', HUN:'HU', ROU:'RO', GRC:'GR',
  SVK:'SK', SVN:'SI', HRV:'HR', BGR:'BG', LUX:'LU' };
const CPV_SEKTOR = { '45':'Bau', '44':'Bau', '71':'Beratung', '79':'Beratung', '80':'Beratung',
  '72':'IT', '48':'IT', '09':'Energie', '31':'Energie', '65':'Energie',
  '60':'Transport', '34':'Transport', '63':'Transport', '90':'Umwelt', '24':'Umwelt',
  '85':'Gesundheit', '33':'Gesundheit' };

// Mehrsprachiges Feld → Deutsch bevorzugt, sonst Englisch/erstes
const lang = v => {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return lang(v[0]);
  if (typeof v === 'object') {
    for (const k of ['deu', 'eng', 'fra']) if (v[k]) return lang(v[k]);
    return lang(Object.values(v)[0]);
  }
  return String(v);
};
const land2 = arr => {
  const c3 = (arr || []).find(c => /^[A-Z]{3}$/.test(c));
  return c3 ? (ISO3_2[c3] || c3.slice(0, 2)) : '??';
};
const sektor = cpv => CPV_SEKTOR[String(cpv || '').slice(0, 2)] || 'Sonstige';

async function ladeSeite(page, limit) {
  const body = {
    query: `${BASIS_QUERY} SORT BY publication-date DESC`,
    fields: ['publication-number', 'notice-title', 'buyer-name', 'place-of-performance',
             'classification-cpv', 'total-value', 'deadline-receipt-tender-date-lot', 'publication-date'],
    limit, page, scope: 'ACTIVE', paginationMode: 'PAGE_NUMBER', checkQuerySyntax: false,
  };
  for (let v = 0; v < 3; v++) {
    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * (v + 1))); continue; }
    throw new Error(`TED HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('TED rate-limit — aufgegeben');
}

const db = new DatabaseSync(DB_PATH);
db.exec('DROP TABLE IF EXISTS tenders');
db.exec(`CREATE TABLE tenders (
  id TEXT PRIMARY KEY, title TEXT, buyer TEXT, country TEXT, sector TEXT, cpv TEXT,
  value_eur INTEGER, published TEXT, deadline TEXT, status TEXT, description TEXT)`);
const ins = db.prepare(`INSERT OR IGNORE INTO tenders
  (id,title,buyer,country,sector,cpv,value_eur,published,deadline,status,description)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

const LIMIT = 100;
let geladen = 0, page = 1, total = null;
console.log(`Ingest aus EU-TED-API · Query: ${BASIS_QUERY}`);
db.exec('BEGIN');
while (geladen < ZIEL) {
  const j = await ladeSeite(page, LIMIT);
  total = j.totalNoticeCount ?? total;
  const notices = j.notices || [];
  if (!notices.length) break;
  for (const n of notices) {
    const cpvArr = n['classification-cpv'] || [];
    const cpv = cpvArr[0] || '';
    const title = lang(n['notice-title']) || '(ohne Titel)';
    const buyer = lang(n['buyer-name']) || '(unbekannt)';
    const value = n['total-value'] != null ? Math.round(Number(n['total-value'])) : null;
    const deadline = n['deadline-receipt-tender-date-lot']
      ? String(lang(n['deadline-receipt-tender-date-lot'])).slice(0, 10) : null;
    const pub = n['publication-date'] ? String(n['publication-date']).slice(0, 10) : null;
    const desc = `${title}. Auftraggeber: ${buyer}. CPV ${cpvArr.slice(0, 3).join(', ')}.`;
    ins.run(n['publication-number'], title, buyer, land2(n['place-of-performance']),
            sektor(cpv), cpv, value, pub, deadline, 'offen', desc);
    geladen++;
  }
  process.stderr.write(`\r... ${geladen} geladen (Seite ${page}, verfügbar ~${total})   `);
  page++;
  if (total && (page - 1) * LIMIT >= total) break;
  await new Promise(r => setTimeout(r, 300)); // höflich zur API
}
db.exec('COMMIT');

db.exec('CREATE INDEX idx_country   ON tenders(country)');
db.exec('CREATE INDEX idx_sector    ON tenders(sector)');
db.exec('CREATE INDEX idx_value     ON tenders(value_eur)');
db.exec('CREATE INDEX idx_published ON tenders(published)');
db.exec('CREATE INDEX idx_status    ON tenders(status)');

const n = db.prepare('SELECT COUNT(*) AS n FROM tenders').get().n;
console.log(`\nIngest fertig: ${n} ECHTE Ausschreibungen aus der EU-TED-API → ${DB_PATH}`);
db.close();
