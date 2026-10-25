import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPublicWorkbenchFits } from './publicDataWorkbenchFits.js';

const ENV = {
  R2_ENDPOINT: 'https://r2.example.test',
  R2_BUCKET: 'bucket',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
};

afterEach(() => vi.unstubAllGlobals());

describe('runPublicWorkbenchFits', () => {
  it('fails fast on missing R2 settings', async () => {
    await expect(runPublicWorkbenchFits({})).rejects.toThrow('Missing R2 settings');
  });

  it('sends the app user agent to Workbench and stops, checkpointed, on a bad page', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('https://r2.example.test')) {
          const method = typeof input === 'string' ? init?.method : input.method;
          return new Response(null, { status: method === 'PUT' ? 200 : 404 });
        }
        calls.push({ url, headers: init?.headers as Record<string, string> });
        return new Response('{}', { status: 400 });
      })
    );
    const result = await runPublicWorkbenchFits(ENV, { sleep: async () => {} });
    expect(result.stoppedBy).toContain('HTTP 400');
    expect(calls[0].url).toContain('/fits/public?page=1');
    expect(calls[0].headers['X-User-Agent']).toBeTruthy();
    expect(calls[0].headers['User-Agent']).toBe(calls[0].headers['X-User-Agent']);
  });
});
