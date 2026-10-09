import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPilotKillHistory,
  fetchPilotKillmails,
  resetPilotKillHistoryCache,
  resetPilotKillmailsCache,
} from './zkillboard';

const PILOT = 42;

function killmail(id: number, time: string) {
  return {
    killmail_id: id,
    killmail_time: time,
    solar_system_id: 30000142,
    victim: { ship_type_id: 587 },
    attackers: [{ character_id: PILOT, ship_type_id: 11 }],
    zkb: { hash: `h${id}`, totalValue: 1 },
  };
}

const urls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map((call) => String(call[0]));

describe('one zKillboard request per list, however many readers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetPilotKillHistoryCache();
    resetPilotKillmailsCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      const body = url.includes('/kills/')
        ? [killmail(2, '2026-10-01T00:00:00Z')]
        : [killmail(3, '2026-10-05T00:00:00Z')];
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shares the kills request between the kill history and the recent kills and losses', async () => {
    await fetchPilotKillHistory(PILOT);
    await fetchPilotKillmails(PILOT);
    const kills = urls(fetchMock).filter((url) => url.includes('/kills/'));
    const losses = urls(fetchMock).filter((url) => url.includes('/losses/'));
    expect(kills).toHaveLength(1);
    expect(losses).toHaveLength(1);
  });

  it('shares them when both are asked for at once', async () => {
    const [history, killmails] = await Promise.all([
      fetchPilotKillHistory(PILOT),
      fetchPilotKillmails(PILOT),
    ]);
    expect(history.ok && killmails.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the losses of a pilot whose kills were read first with a single extra request', async () => {
    await fetchPilotKillHistory(PILOT);
    fetchMock.mockClear();
    const result = await fetchPilotKillmails(PILOT);
    expect(result.ok).toBe(true);
    expect(urls(fetchMock)).toEqual([`https://zkillboard.com/api/losses/characterID/${PILOT}/`]);
  });

  it('never keeps a failed answer: the next ask goes to zKillboard again', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('nope', { status: 503 }));
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: false });
    const retry = await fetchPilotKillHistory(PILOT);
    expect(retry.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps only a bounded number of lists, dropping the oldest first', async () => {
    for (let id = 1; id <= 130; id += 1) await fetchPilotKillHistory(id);
    fetchMock.mockClear();
    await fetchPilotKillHistory(130);
    expect(fetchMock).not.toHaveBeenCalled();
    await fetchPilotKillHistory(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps an answer a mutation by one reader cannot reach another', async () => {
    const first = await fetchPilotKillHistory(PILOT);
    if (!first.ok) throw new Error('expected kills');
    first.kills.length = 0;
    const second = await fetchPilotKillHistory(PILOT);
    expect(second.ok && second.kills.length).toBe(1);
  });
});
