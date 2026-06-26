/**
 * seed.mjs — legt die SQLite-Datenbank an und füllt sie mit N realistischen
 * Ausschreibungen. EINMALIG ausführen:  node seed.mjs [anzahl]
 *
 * In Produktion käme dieser Ingest aus dem echten Feed (EU TED / Kunden-ERP).
 * Für die Demo erzeugen wir einen realistischen Datensatz, um SKALIERUNG zu zeigen.
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dir, 'vergabe.db');
const N = Number(process.argv[2] || 20000);

const LAENDER = ['AT', 'AT', 'AT', 'DE', 'DE', 'FR', 'IT', 'NL', 'PL', 'ES', 'CZ'];
const SEKTOREN = [
  { sektor: 'Energie',    cpv: '09310000', titel: ['Lieferung von Photovoltaikanlagen', 'Rahmenvertrag Stromlieferung', 'Errichtung Umspannwerk', 'Wartung Windpark', 'Batteriespeicher-System'] },
  { sektor: 'Bau',        cpv: '45000000', titel: ['Sanierung Brücke', 'Neubau Verwaltungsgebäude', 'Straßenbau Abschnitt', 'Tunnelinstandsetzung', 'Hochwasserschutz-Damm'] },
  { sektor: 'IT',         cpv: '72000000', titel: ['Rahmenvertrag IT-Dienstleistungen', 'Einführung Fachverfahren', 'Cloud-Migration', 'Cybersicherheits-Audit', 'Softwareentwicklung Portal'] },
  { sektor: 'Transport',  cpv: '60000000', titel: ['Beschaffung Schienenfahrzeuge', 'Buslinien-Konzession', 'Instandhaltung Gleisanlagen', 'Ladeinfrastruktur Busdepot', 'Verkehrsleitsystem'] },
  { sektor: 'Beratung',   cpv: '79000000', titel: ['Strategieberatung Digitalisierung', 'Prozessoptimierung', 'Projektsteuerung', 'Gutachten Klimaneutralität', 'Organisationsentwicklung'] },
  { sektor: 'Umwelt',     cpv: '90000000', titel: ['Abfallentsorgung Rahmenvertrag', 'Kläranlagen-Erweiterung', 'Bodensanierung', 'Trinkwasser-Leitungsbau', 'Emissionsmonitoring'] },
  { sektor: 'Gesundheit', cpv: '85000000', titel: ['Medizintechnik-Beschaffung', 'Reinigungsdienstleistungen Klinik', 'IT für Krankenhaus', 'Laborgeräte Rahmenvertrag', 'Pflegedienst-Leistungen'] },
];
const BUYER = {
  AT: ['Bundesbeschaffung GmbH', 'Stadt Wien', 'ÖBB-Infrastruktur AG', 'Land Niederösterreich', 'Wiener Netze GmbH', 'ASFINAG', 'Land Steiermark'],
  DE: ['Deutsche Bahn AG', 'Stadt München', 'Bundesanstalt für Immobilienaufgaben', 'Land NRW', 'Stadtwerke Hamburg'],
  FR: ['SNCF Réseau', 'Ville de Paris', 'Région Île-de-France'],
  IT: ['Comune di Milano', 'Ferrovie dello Stato', 'Regione Lombardia'],
  NL: ['Rijkswaterstaat', 'Gemeente Amsterdam'],
  PL: ['PKP Polskie Linie Kolejowe', 'Miasto Warszawa'],
  ES: ['Adif', 'Ayuntamiento de Madrid'],
  CZ: ['Správa železnic', 'Hlavní město Praha'],
};

const pick = a => a[Math.floor(Math.random() * a.length)];
const iso = d => d.toISOString().slice(0, 10);
// log-normal-artiger Auftragswert: 50k bis ~50M, Schwerpunkt im unteren Bereich
const wert = () => Math.round((50000 * Math.pow(10, Math.random() * 3)) / 1000) * 1000;

const db = new DatabaseSync(DB_PATH);
db.exec('DROP TABLE IF EXISTS tenders');
db.exec(`
  CREATE TABLE tenders (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    buyer       TEXT NOT NULL,
    country     TEXT NOT NULL,
    sector      TEXT NOT NULL,
    cpv         TEXT NOT NULL,
    value_eur   INTEGER NOT NULL,
    published   TEXT NOT NULL,
    deadline    TEXT NOT NULL,
    status      TEXT NOT NULL,
    description TEXT NOT NULL
  )`);

const insert = db.prepare(`INSERT INTO tenders
  (id, title, buyer, country, sector, cpv, value_eur, published, deadline, status, description)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const heute = new Date();
db.exec('BEGIN');
for (let i = 1; i <= N; i++) {
  const land = pick(LAENDER);
  const s = pick(SEKTOREN);
  const ort = pick(['Wien', 'Linz', 'Graz', 'Salzburg', 'Innsbruck', 'Berlin', 'Paris', 'Mailand', 'Amsterdam']);
  const titelBasis = pick(s.titel);
  const title = `${titelBasis} – Los ${1 + (i % 9)}`;
  const pubOffset = Math.floor(Math.random() * 60);              // 0–60 Tage her veröffentlicht
  const dlOffset = Math.floor(Math.random() * 120) - 30;         // Deadline -30..+90 Tage
  const published = new Date(heute.getTime() - pubOffset * 864e5);
  const deadline = new Date(heute.getTime() + dlOffset * 864e5);
  const status = deadline >= heute ? 'offen' : 'geschlossen';
  const description = `${titelBasis} im Auftrag einer öffentlichen Stelle in ${ort}. Sektor ${s.sektor}, CPV ${s.cpv}. Geschätzter Auftragswert und Fristen siehe Strukturdaten.`;
  insert.run(
    `TED-2026-${String(i).padStart(6, '0')}`,
    title, pick(BUYER[land]), land, s.sektor, s.cpv, wert(),
    iso(published), iso(deadline), status, description,
  );
}
db.exec('COMMIT');

// Indizes für skalierbare Abfragen
db.exec('CREATE INDEX idx_country  ON tenders(country)');
db.exec('CREATE INDEX idx_sector   ON tenders(sector)');
db.exec('CREATE INDEX idx_value    ON tenders(value_eur)');
db.exec('CREATE INDEX idx_deadline ON tenders(deadline)');
db.exec('CREATE INDEX idx_status   ON tenders(status)');

const total = db.prepare('SELECT COUNT(*) AS n FROM tenders').get().n;
const offen = db.prepare("SELECT COUNT(*) AS n FROM tenders WHERE status='offen'").get().n;
console.log(`Seed fertig: ${total} Ausschreibungen (${offen} offen) in ${DB_PATH}`);
db.close();
