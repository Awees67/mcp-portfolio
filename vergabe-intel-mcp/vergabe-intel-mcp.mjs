#!/usr/bin/env node
/**
 * vergabe-intel-mcp.mjs — Einstieg "SCHUBLADE" (stdio).
 * Die KI-App startet dieses Programm selbst und redet über stdin/stdout.
 * Die Werkzeuge stecken in server.mjs (gemeinsam mit der HTTP-Variante).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.mjs';

const transport = new StdioServerTransport();
await buildServer().connect(transport);
console.error('[vergabe-intel] bereit (stdio) — Werkzeuge: vergabe_suche, vergabe_details, vergabe_statistik, vergabe_match');
