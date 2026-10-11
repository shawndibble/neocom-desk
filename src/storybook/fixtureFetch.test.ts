import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFixtureFetch, unexpectedRequests } from './fixtureFetch';

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.restoreAllMocks();
});

describe('installFixtureFetch', () => {
  it('answers a routed request from its fixture', async () => {
    uninstall = installFixtureFetch([
      { path: '/characters/1/wallet', respond: () => ({ body: 42, headers: { 'X-Pages': '1' } }) },
    ]);
    const response = await fetch('https://esi.evetech.net/characters/1/wallet?x=1');
    expect(await response.json()).toBe(42);
    expect(response.headers.get('X-Pages')).toBe('1');
    expect(unexpectedRequests()).toEqual([]);
  });

  it('rejects, logs and records a request with no fixture', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    uninstall = installFixtureFetch([]);
    await expect(fetch('https://esi.evetech.net/characters/1/assets')).rejects.toThrow(
      /no fixture.*GET https:\/\/esi\.evetech\.net\/characters\/1\/assets/
    );
    expect(unexpectedRequests()).toEqual(['GET https://esi.evetech.net/characters/1/assets']);
    expect(error).toHaveBeenCalled();
  });

  it('matches by method and passes the parsed POST body to the fixture', async () => {
    uninstall = installFixtureFetch([
      {
        method: 'POST',
        path: '/universe/names',
        respond: ({ body }) => ({ body: (body as number[]).map((id) => ({ id })) }),
      },
    ]);
    const response = await fetch('https://esi.evetech.net/universe/names', {
      method: 'POST',
      body: JSON.stringify([7]),
    });
    expect(await response.json()).toEqual([{ id: 7 }]);
    await expect(fetch('https://esi.evetech.net/universe/names')).rejects.toThrow();
  });

  it('restores the previous fetch on uninstall', () => {
    const before = globalThis.fetch;
    installFixtureFetch([])();
    expect(globalThis.fetch).toBe(before);
  });
});
