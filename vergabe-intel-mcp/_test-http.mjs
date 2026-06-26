// Voller Produktions-Test: verbindet sich wie eine KI über URL + Token an die HTTP-Tür
// und ruft alle Werkzeuge gegen die ECHTEN Daten auf.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ENDPOINT = 'http://localhost:3000/mcp';
const TOKEN = 'geheim-test-123';

async function connect(token) {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  const client = new Client({ name: 'tester', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// 1) OHNE Token -> muss scheitern (Schloss)
try { await connect(null); console.log('OHNE Token: VERBUNDEN (unerwartet!)'); }
catch (e) { console.log('1) OHNE Token  -> abgewiesen  ✅'); }

// 2) MIT Token -> verbinden + Werkzeuge auflisten
const client = await connect(TOKEN);
const tools = await client.listTools();
console.log('2) MIT Token   -> verbunden   ✅  Werkzeuge: ' + tools.tools.map(t => t.name).join(', '));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const txt = r.content?.[0]?.text || JSON.stringify(r);
  console.log(`\n▶ ${name} ${JSON.stringify(args)}\n` + txt.split('\n').slice(0, 6).join('\n'));
}

await call('vergabe_suche', { sektor: 'Energie', land: 'AT', nurOffen: true, limit: 3 });
await call('vergabe_statistik', { gruppierung: 'land' });
await call('vergabe_match', { sektoren: ['Transport'], laender: ['AT'], minWertEur: 1000000, limit: 2 });

await client.close();
console.log('\n=== Alle Werkzeuge über URL + Token getestet ✅ ===');
process.exit(0);
