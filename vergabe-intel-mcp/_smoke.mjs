// Smoke-Test: Handshake + tools/list + echte Aufrufe gegen die 20k-DB, mit Zeitmessung.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn(process.execPath, ['--no-warnings', path.join(__dir, 'vergabe-intel-mcp.mjs')], { cwd: __dir });

let buf = '';
const pending = new Map();
srv.stdout.on('data', d => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));

let id = 0;
const send = o => srv.stdin.write(JSON.stringify(o) + '\n');
const call = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); send({ jsonrpc: '2.0', id: i, method, params }); });

const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0.0' } });
console.log('initialize OK →', init.result?.serverInfo);
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

const tools = await call('tools/list', {});
console.log('Werkzeuge:', tools.result.tools.map(t => t.name).join(', '));

async function callTool(name, args) {
  const t0 = performance.now();
  const r = await call('tools/call', { name, arguments: args });
  const ms = Math.round(performance.now() - t0);
  const txt = r.result?.content?.[0]?.text || JSON.stringify(r);
  console.log(`\n▶ ${name} ${JSON.stringify(args)}  (${ms}ms)\n` + txt.split('\n').slice(0, 7).join('\n'));
}

await callTool('vergabe_suche', { sektor: 'Energie', land: 'AT', nurOffen: true, limit: 3 });
await callTool('vergabe_statistik', { gruppierung: 'sektor' });
await callTool('vergabe_match', { sektoren: ['Energie', 'Transport'], laender: ['AT'], minWertEur: 1000000, stichworte: ['Photovoltaik', 'Ladeinfrastruktur'], limit: 3 });

srv.kill();
process.exit(0);
