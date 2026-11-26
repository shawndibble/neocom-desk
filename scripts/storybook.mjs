#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const port = Number(process.env.STORYBOOK_PORT) || (await freePort());
console.log(`Storybook: http://localhost:${port}/`);
console.log(`MCP: http://localhost:${port}/mcp`);
console.log(`Components manifest: http://localhost:${port}/manifests/components.json`);

const bin = fileURLToPath(
  new URL('../node_modules/storybook/dist/bin/dispatcher.js', import.meta.url)
);
const child = spawn(
  process.execPath,
  [bin, 'dev', '-p', String(port), '--ci', '--no-open', ...process.argv.slice(2)],
  { stdio: 'inherit' }
);
child.on('exit', (code) => process.exit(code ?? 0));
