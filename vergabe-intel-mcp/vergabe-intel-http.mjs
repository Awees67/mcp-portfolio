#!/usr/bin/env node
/**
 * vergabe-intel-http.mjs — Einstieg "TÜR" (HTTP).
 * Macht den MCP-Server über eine URL erreichbar: http://localhost:3000/mcp
 * Mit Token-Schloss: /mcp verlangt einen "Authorization: Bearer <TOKEN>"-Header.
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { buildServer } from './server.mjs';

const PORT = Number(process.env.PORT || 3000);
// Das Schloss: das Token kommt von AUSSEN (Umgebungsvariable), nicht aus dem Code.
const TOKEN = process.env.MCP_TOKEN || 'dev-token-bitte-aendern';

const app = express();
app.use(express.json());

// Eine schlichte "Lebt es noch?"-Seite — im Browser unter http://localhost:3000 sichtbar.
app.get('/', (_req, res) =>
  res.type('text/plain').send('vergabe-intel HTTP-MCP läuft. MCP-Endpunkt: POST /mcp'));

// --- DAS SCHLOSS: jeder /mcp-Zugriff braucht das richtige Token ---
app.use('/mcp', (req, res, next) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${TOKEN}`) {                    // falsches/kein Token?
    return res.status(401).json({                      // -> abgewiesen (401)
      jsonrpc: '2.0', id: null,
      error: { code: -32001, message: 'Nicht autorisiert — gültiges Token nötig' },
    });
  }
  next();                                              // richtiges Token -> durchlassen
});

// --- MCP über HTTP: eine Sitzung pro verbundenem KI-Client ---
const sessions = {};
app.post('/mcp', async (req, res) => {
  const sid = req.headers['mcp-session-id'];
  let transport;
  if (sid && sessions[sid]) {
    transport = sessions[sid];                       // bestehende Sitzung weiternutzen
  } else if (!sid && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({   // neue Sitzung beim "Hallo" der KI
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { sessions[id] = transport; },
    });
    transport.onclose = () => { if (transport.sessionId) delete sessions[transport.sessionId]; };
    await buildServer().connect(transport);           // unsere Werkzeuge an diese Sitzung hängen
  } else {
    res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Keine gültige Sitzung' } });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

// GET = Server→Client-Benachrichtigungen, DELETE = Sitzung beenden
const weiter = async (req, res) => {
  const sid = req.headers['mcp-session-id'];
  if (!sid || !sessions[sid]) { res.status(400).send('Ungültige Sitzung'); return; }
  await sessions[sid].handleRequest(req, res);
};
app.get('/mcp', weiter);
app.delete('/mcp', weiter);

app.listen(PORT, () => console.log(`[vergabe-intel] HTTP-MCP bereit → http://localhost:${PORT}/mcp`));
