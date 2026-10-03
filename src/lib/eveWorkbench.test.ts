import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_AGENT } from '@/esi/userAgent';
import { fetchEveWorkbenchEft } from './eveWorkbench';

const FIT_ID = '69dfd552-9a17-4628-92de-9f07c28ac659';
const EFT = '[Rifter, PvE]\n125mm Gatling AutoCannon I\n';

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    typeof body === 'string'
      ? new Response(body, { status })
      : new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchEveWorkbenchEft', () => {
  it("asks Workbench's public API for the fit's EFT, naming the app", async () => {
    const fetchMock = respond({ Eft: EFT, Error: false, Message: null });
    expect(await fetchEveWorkbenchEft(FIT_ID)).toEqual({ status: 'ok', eft: EFT });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.eveworkbench.com/v1/fits/${FIT_ID}/eft`);
    const headers = new Headers(init.headers);
    expect(headers.get('X-User-Agent')).toBe(USER_AGENT);
    expect(headers.get('X-User-Agent')).not.toContain('@');
  });

  it('escapes a malformed id rather than building a different path', async () => {
    const fetchMock = respond({ Eft: null, Error: true, Message: 'Invalid fittingId received' });
    await fetchEveWorkbenchEft('a/b?c');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.eveworkbench.com/v1/fits/a%2Fb%3Fc/eft'
    );
  });

  it.each([
    [
      'an unpublished or missing fit',
      { Eft: null, Error: true, Message: 'No (published) fit found' },
    ],
    ['a malformed id', { Eft: null, Error: true, Message: 'Invalid fittingId received' }],
    ['an error worded some other way', { Eft: null, Error: true, Message: 'Gone fishing' }],
  ])('reports %s as not found', async (_case, body) => {
    respond(body);
    expect(await fetchEveWorkbenchEft(FIT_ID)).toEqual({ status: 'not-found' });
  });

  it('reports a 404 as not found', async () => {
    respond('', 404);
    expect(await fetchEveWorkbenchEft(FIT_ID)).toEqual({ status: 'not-found' });
  });

  it.each([
    ['a server error', () => respond('', 503)],
    ['a body that is not JSON', () => respond('<html>maintenance</html>')],
    ['a body with no EFT', () => respond({ Error: false })],
    [
      'a network failure',
      () =>
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            throw new TypeError('Failed to fetch');
          })
        ),
    ],
  ])('reports %s as unreachable', async (_case, arrange) => {
    arrange();
    expect(await fetchEveWorkbenchEft(FIT_ID)).toEqual({ status: 'failed' });
  });
});
