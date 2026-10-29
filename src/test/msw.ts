import { afterAll, afterEach, beforeAll } from 'vitest';
import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';

/**
 * An MSW server whose lifecycle is bound to the calling test file: it listens
 * before the file's first test (an unmocked request fails the test), drops any
 * per-test `server.use(...)` overrides after each test, and closes after the
 * last. Call it once at module scope; `handlers` are the file's defaults.
 */
export function mswServer(...handlers: RequestHandler[]): ReturnType<typeof setupServer> {
  const server = setupServer(...handlers);
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
