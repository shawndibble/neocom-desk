import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const cacheDir = join(root, '.cache');
const stateFile = join(cacheDir, 'storybook-server.json');
const logFile = join(cacheDir, 'storybook-server.log');
const READY_TIMEOUT_MS = 90_000;

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const isUp = async (port) => {
  try {
    return (await fetch(`http://localhost:${port}/index.json`)).ok;
  } catch {
    return false;
  }
};

const readState = () => {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
};

const start = async () => {
  mkdirSync(cacheDir, { recursive: true });
  const port = await freePort();
  const bin = join(root, 'node_modules/storybook/dist/bin/dispatcher.js');
  const log = openSync(logFile, 'w');
  const child = spawn(
    process.execPath,
    [bin, 'dev', '-p', String(port), '--ci', '--no-open', '--host', '127.0.0.1'],
    { cwd: root, detached: true, stdio: ['ignore', log, log] }
  );
  closeSync(log);
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
    rmSync(stateFile, { force: true });
  };
  let exited = false;
  child.once('exit', () => (exited = true));
  writeFileSync(stateFile, JSON.stringify({ pid: child.pid, port }));
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!(await isUp(port))) {
    if (exited || Date.now() > deadline) {
      stop();
      throw new Error(
        `Storybook did not start (${exited ? 'exited' : 'timed out'}). Log: ${logFile}`
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { port, stop };
};

export const withStorybook = async (fn) => {
  const existing = readState();
  let port = existing?.port;
  let stop = () => {};
  if (!(port && (await isUp(port)))) ({ port, stop } = await start());
  const onSignal = () => {
    stop();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn(`http://localhost:${port}`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    stop();
  }
};
