import { afterAll, afterEach, beforeAll } from 'vitest';
import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';

export function mswServer(...handlers: RequestHandler[]): ReturnType<typeof setupServer> {
  const server = setupServer(...handlers);
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
