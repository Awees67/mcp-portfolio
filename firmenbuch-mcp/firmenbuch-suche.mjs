/**
 * firmenbuch-suche.mjs  —  universell, fuer beliebige Nutzer/Maschinen
 * ---------------------------------------------------------------------------
 * Sucht eine ODER viele Firmen auf openfirmenbuch.at, oeffnet den Browser,
 * macht Screenshots und laedt ALLE veroeffentlichten Jahresabschluss-PDFs
 * herunter und benennt sie lesbar um (Geschaeftsjahr + Einreichdatum).
 *
 * EINMALIGE EINRICHTUNG (im Projektordner):
 *   npm install
 *   npx playwright install chromium
 *
 * AUFRUF:
 *   Eine Firma:     node firmenbuch-suche.mjs "Velartis GmbH"
 *   Viele Firmen:   node firmenbuch-suche.mjs --csv company.csv
 *   (liegt company.csv im Ordner, reicht auch:  node firmenbuch-suche.mjs )
 *
 * company.csv:  eine Firma pro Zeile (1. Spalte). Trennzeichen ; oder ,.
 *               Eine Kopfzeile wie "Firma"/"Unternehmen"/"Company" wird erkannt.
 *
 * Optionen (Umgebungsvariablen):
 *   HEADLESS=1      -> Browser unsichtbar
 *   NO_DOWNLOAD=1   -> nur Suche + Screenshots, keine PDF-Downloads
 *   SLOWMO=200      -> Verzoegerung pro Aktion in ms (Default 120)
 *
 * Ergebnisse:  <Skriptordner>\output\<Firmenname>\  (+ output\_batch-zusammenfassung.csv)
 * ---------------------------------------------------------------------------
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const HEADLESS    = process.env.HEADLESS === '1';
const NO_DOWNLOAD = process.env.NO_DOWNLOAD === '1';
const SLOWMO      = Number(process.env.SLOWMO || 120);
const OUTROOT     = path.join(__dir, 'output');

const log = (...a) => console.log('[fb]', ...a);
// entfernt unter Windows verbotene Dateinamen-Zeichen, Leerzeichen werden zu "_"
const sane  = s => s.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MONTHS = { januar:'01', februar:'02', maerz:'03', 'märz':'03', april:'04', mai:'05', juni:'06',
  juli:'07', august:'08', september:'09', oktober:'10', november:'11', dezember:'12' };
const germanDateToISO = (d, mon, y) => `${y}-${MONTHS[(mon||'').toLowerCase()]||'00'}-${String(d).padStart(2,'0')}`;
function parseDocLabel(label) {
  const txt = label.replace(/\s+/g, ' ').trim();
  const stich = txt.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(\d{4})/);
  const eing  = txt.match(/Eingereicht:\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(\d{4})/i);
  const typM  = txt.match(/(Jahresabschluss|Bilanz|Konzernabschluss)/i);
  return { gjYear: stich ? stich[3] : null, eingISO: eing ? germanDateToISO(eing[1], eing[2], eing[3]) : null, typ: typM ? typM[1] : 'Dokument' };
}

// ---- Firmenliste bestimmen (CLI / CSV) -----------------------------------
function readCompaniesFromCsv(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const delim = line.includes(';') ? ';' : ',';
    const cell = line.split(delim)[0].trim().replace(/^"(.*)"$/, '$1').trim();
    if (!cell) continue;
    if (/^(firma|firmenname|unternehmen|company|name)$/i.test(cell)) continue; // Kopfzeile
    out.push(cell);
  }
  return out;
}
function resolveTargets() {
  const args = process.argv.slice(2);
  const csvFlag = args.indexOf('--csv');
  let csvPath = null;
  if (csvFlag !== -1) csvPath = args[csvFlag + 1] || 'company.csv';
  else if (args[0] && /\.csv$/i.test(args[0])) csvPath = args[0];
  if (csvPath) {
    const p = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
    const file = fs.existsSync(p) ? p : path.join(__dir, csvPath);
    if (!fs.existsSync(file)) { console.error('CSV nicht gefunden:', csvPath); process.exit(1); }
    return readCompaniesFromCsv(file);
  }
  const single = args.filter(a => a !== '--csv').join(' ').trim();
  if (single) return [single];
  // Default: company.csv im Skriptordner / cwd
  for (const cand of [path.join(process.cwd(), 'company.csv'), path.join(__dir, 'company.csv')]) {
    if (fs.existsSync(cand)) return readCompaniesFromCsv(cand);
  }
  console.error('Bitte Firmennamen ODER --csv company.csv angeben.\n  node firmenbuch-suche.mjs "Velartis GmbH"\n  node firmenbuch-suche.mjs --csv company.csv');
  process.exit(1);
}

// ---- eine Firma verarbeiten ----------------------------------------------
async function processCompany(ctx, firma) {
  const OUT = path.join(OUTROOT, sane(firma) || 'firma');
  fs.mkdirSync(OUT, { recursive: true });
  const page = await ctx.newPage();
  const saved = [];
  let lastPdfUrl = null;
  page.on('response', r => {
    const c = (r.headers()['content-type'] || '').toLowerCase();
    if (c.includes('pdf') || r.url().toLowerCase().endsWith('.pdf')) lastPdfUrl = r.url();
  });

  const openFirstResult = async () => {
    for (const loc of [
      page.getByRole('heading', { name: new RegExp(reEsc(firma), 'i') }),
      page.getByText(firma, { exact: true }),
      page.getByText(new RegExp(reEsc(firma), 'i')),
    ]) {
      if (await loc.count()) { await loc.first().click().catch(() => {}); await page.waitForTimeout(2500); if (page.url().includes('/company/')) return true; }
    }
    return page.url().includes('/company/');
  };

  const downloadRow = async (btn, idx) => {
    let label = await btn.locator('xpath=ancestor::tr[1]').innerText().catch(() => '');
    if (!label) label = await btn.locator('xpath=ancestor::*[3]').innerText().catch(() => '');
    const { gjYear, eingISO, typ } = parseDocLabel(label);
    let base = `${sane(firma)}_${typ}`;
    if (gjYear) base += `_${gjYear}`;
    if (eingISO) base += `_eingereicht_${eingISO}`;
    if (!gjYear && !eingISO) base += `_${idx}`;
    let outName = `${base}.pdf`, k = 2;
    while (fs.existsSync(path.join(OUT, outName))) { outName = `${base}_(${k}).pdf`; k++; }

    lastPdfUrl = null;
    const dlP = page.waitForEvent('download', { timeout: 18000 }).catch(() => null);
    const popP = ctx.waitForEvent('page', { timeout: 18000 }).catch(() => null);
    await btn.click();
    const dl = await dlP;
    if (dl) { await dl.saveAs(path.join(OUT, outName)); saved.push(outName); log('   OK', outName); return; }
    const pop = await popP;
    const url = (pop && pop.url()) || lastPdfUrl;
    if (url && /^https?:/.test(url)) {
      const resp = await ctx.request.get(url).catch(() => null);
      if (resp && resp.ok()) { fs.writeFileSync(path.join(OUT, outName), Buffer.from(await resp.body())); saved.push(outName); log('   OK (url)', outName); }
      if (pop) await pop.close().catch(() => {});
    } else log('   FEHLT', base);
  };

  const processDocPage = async (n) => {
    const btns = page.getByRole('button', { name: /Herunterladen/i });
    const cnt = await btns.count();
    for (let i = 0; i < cnt; i++) { await downloadRow(btns.nth(i), `${n}_${i + 1}`); await page.waitForTimeout(350); }
    return cnt;
  };

  let result = { firma, found: false, detailUrl: '', files: 0, outDir: OUT };
  try {
    await page.goto('https://openfirmenbuch.at', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '01-startseite.png') });
    const search = page.locator('input[placeholder*="Firmennamen" i], input[type="text"]:visible').first();
    await search.click(); await search.fill(firma);
    await page.screenshot({ path: path.join(OUT, '02-eingabe.png') });
    await search.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, '03-suchergebnis.png'), fullPage: true });

    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    if (/keine Ergebnisse/i.test(body)) { log('  KEINE Ergebnisse fuer', firma); await page.close(); return result; }
    if (!(await openFirstResult())) { log('  Detailseite nicht erreichbar:', firma); await page.close(); return result; }

    result.found = true; result.detailUrl = page.url();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '04-detail.png'), fullPage: true });
    fs.writeFileSync(path.join(OUT, '_stammdaten.txt'), (await page.locator('body').innerText().catch(() => '')).slice(0, 8000), 'utf8');

    if (!NO_DOWNLOAD) {
      await page.getByText('Firmendokumente').scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
      await processDocPage(1);
      for (let p = 2; p <= 30; p++) {
        const nav = page.getByRole('button', { name: String(p), exact: true });
        if (!(await nav.count())) break;
        await nav.first().click().catch(() => {}); await page.waitForTimeout(1600);
        if ((await processDocPage(p)) === 0) break;
      }
    }
    result.files = saved.length;
    fs.writeFileSync(path.join(OUT, '_ergebnis.txt'),
      `Firma: ${firma}\nDetail-URL: ${result.detailUrl}\nDateien (${saved.length}):\n` + saved.map(s => '  - ' + s).join('\n') + '\n', 'utf8');
  } catch (e) {
    log('  FEHLER bei', firma, '->', e.message);
    try { await page.screenshot({ path: path.join(OUT, '_fehler.png'), fullPage: true }); } catch {}
  }
  await page.close().catch(() => {});
  return result;
}

// ---- Hauptlauf ------------------------------------------------------------
const targets = resolveTargets();
fs.mkdirSync(OUTROOT, { recursive: true });
log(`${targets.length} Firma/Firmen | headless: ${HEADLESS} | Downloads: ${!NO_DOWNLOAD}`);
log('Ausgabe:', OUTROOT);

const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOWMO });
const results = [];
try {
  for (let i = 0; i < targets.length; i++) {
    const firma = targets[i];
    log(`\n[${i + 1}/${targets.length}] ${firma}`);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'de-AT', acceptDownloads: true });
    results.push(await processCompany(ctx, firma));
    await ctx.close().catch(() => {});
  }
} finally {
  if (!HEADLESS && targets.length === 1) { log('Browser bleibt 12s offen ...'); await new Promise(r => setTimeout(r, 12000)); }
  await browser.close();
}

// Batch-Zusammenfassung
const csv = ['Firma;Gefunden;Anzahl_PDFs;Detail-URL', ...results.map(r => `${r.firma};${r.found ? 'ja' : 'nein'};${r.files};${r.detailUrl}`)].join('\n') + '\n';
fs.writeFileSync(path.join(OUTROOT, '_batch-zusammenfassung.csv'), csv, 'utf8');

log('\n=== FERTIG ===');
for (const r of results) log(`  ${r.found ? '✓' : '✗'} ${r.firma}  (${r.files} PDFs)`);
log('Zusammenfassung:', path.join(OUTROOT, '_batch-zusammenfassung.csv'));
