#!/usr/bin/env node
// Starts Storybook on a free port and prints the URL.
//
// Every worktree runs its own Storybook serving its own code, so no port is
// assumed: the OS hands out a free one. (5173 is the app's dev server and the
// e2e server's, both pinned.) Extra arguments pass through to `storybook dev`.

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

// STORYBOOK_PORT pins the port so `.mcp.json` (which reads the same variable)
// finds this worktree's Storybook; unset, the OS hands out a free one.
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
