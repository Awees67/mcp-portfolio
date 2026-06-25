// Smoke-Test: startet den MCP-Server, macht initialize + tools/list + ruft strompreise auf.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn(process.execPath, [path.join(__dir, 'energie-planer-mcp.mjs')], { cwd: __dir });

let buf = '';
const pending = new Map();
srv.stdout.on('data', d => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));

const send = o => srv.stdin.write(JSON.stringify(o) + '\n');
const call = (id, method, params) => new Promise(res => { pending.set(id, res); send({ jsonrpc: '2.0', id, method, params }); });

const init = await call(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0.0' } });
console.log('initialize OK →', init.result?.serverInfo);
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

const tools = await call(2, 'tools/list', {});
console.log('\nWerkzeuge:');
for (const t of tools.result.tools) console.log('  •', t.name);

const show = (label, res) => {
  const txt = res.result?.content?.[0]?.text || JSON.stringify(res);
  console.log(`\n${label}:\n` + txt.split('\n').slice(0, 6).join('\n'));
};

show('strompreise (heute)', await call(3, 'tools/call', { name: 'strompreise', arguments: { tag: 'heute' } }));
show('guenstigstes_fenster (2h, heute)', await call(4, 'tools/call', { name: 'guenstigstes_fenster', arguments: { dauerStunden: 2, tag: 'heute' } }));
show('negativpreis_stunden (heute)', await call(5, 'tools/call', { name: 'negativpreis_stunden', arguments: { tag: 'heute' } }));

srv.kill();
process.exit(0);
