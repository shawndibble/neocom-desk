import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFixtureFetch, unexpectedRequests } from './fixtureFetch';
import { SAMPLE_CHARACTERS, SAMPLE_STATION_ID, SAMPLE_SYSTEM_ID } from './sampleData';

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

  it('keeps routing for a story still mounted when another unmounts, in any order', async () => {
    const before = globalThis.fetch;
    const first = installFixtureFetch([{ path: '/a', respond: () => ({ body: 'a' }) }]);
    const second = installFixtureFetch([{ path: '/b', respond: () => ({ body: 'b' }) }]);
    first();
    const response = await fetch('https://esi.evetech.net/b');
    expect(await response.json()).toBe('b');
    second();
    expect(globalThis.fetch).toBe(before);
  });

  it("answers a sample Character's public sheet whatever table is installed (#6114)", async () => {
    uninstall = installFixtureFetch([]);
    const pilot = SAMPLE_CHARACTERS[1]!;
    const response = await fetch(`https://esi.evetech.net/characters/${pilot.characterId}`);
    expect(await response.json()).toMatchObject({
      name: pilot.name,
      corporation_id: pilot.corporationId,
    });
    expect(unexpectedRequests()).toEqual([]);
  });

  it("lets a story's own fixture answer a sample sheet first", async () => {
    const pilot = SAMPLE_CHARACTERS[0]!;
    uninstall = installFixtureFetch([
      { path: /^\/characters\/\d+$/, respond: () => ({ body: { name: 'Story pilot' } }) },
    ]);
    const response = await fetch(`https://esi.evetech.net/characters/${pilot.characterId}`);
    expect(await response.json()).toEqual({ name: 'Story pilot' });
  });

  it("answers a sample Character's location and skill queue whatever table is installed (#6126)", async () => {
    uninstall = installFixtureFetch([]);
    const id = SAMPLE_CHARACTERS[0]!.characterId;
    const location = await fetch(`https://esi.evetech.net/characters/${id}/location`);
    expect(await location.json()).toEqual({
      solar_system_id: SAMPLE_SYSTEM_ID,
      station_id: SAMPLE_STATION_ID,
    });
    const queue = await fetch(`https://esi.evetech.net/characters/${id}/skillqueue`);
    expect(await queue.json()).toEqual([]);
    expect(unexpectedRequests()).toEqual([]);
  });

  it("still records any other Character's location", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    uninstall = installFixtureFetch([]);
    await expect(fetch('https://esi.evetech.net/characters/1/location')).rejects.toThrow();
    expect(unexpectedRequests()).toEqual(['GET https://esi.evetech.net/characters/1/location']);
  });

  it("still records any other Character's sheet", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    uninstall = installFixtureFetch([]);
    await expect(fetch('https://esi.evetech.net/characters/1')).rejects.toThrow();
    expect(unexpectedRequests()).toEqual(['GET https://esi.evetech.net/characters/1']);
  });
});
