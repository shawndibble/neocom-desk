import { describe, expect, it } from 'vitest';
import {
  NEW_LINKS_PER_WINDOW,
  NEW_LINK_WINDOW_MS,
  NEW_LINK_GAP_MS,
  checkNewLink,
  type CallerState,
  START_LINK_TTL_MS,
  callerKey,
  callerAddress,
  clientIp,
  canonicalSearch,
  makeShortStartLink,
  shortIdFor,
  type ShortLinkStore,
} from './shortStartLink.js';

describe('canonicalSearch', () => {
  it('puts the fields in one fixed order, whatever order they arrive in', () => {
    const a = canonicalSearch({ notes: 'hi', rate: '5', payeeId: '98', place: 'Efa' });
    const b = canonicalSearch({ place: 'Efa', payeeId: 98, rate: 5, notes: 'hi' });
    expect(a).toEqual({ ok: true, search: 'place=Efa&payeeId=98&rate=5&notes=hi' });
    expect(b).toEqual(a);
  });

  it('ignores blank fields and refuses a request with nothing in it', () => {
    expect(canonicalSearch({ place: '  ', rate: '' })).toMatchObject({ ok: false });
    expect(canonicalSearch(null)).toMatchObject({ ok: false });
    expect(canonicalSearch(['x'])).toMatchObject({ ok: false });
  });

  it('refuses values the start page would refuse, with the field named', () => {
    expect(canonicalSearch({ rate: 101 })).toEqual({
      ok: false,
      error: 'rate must be a number from 0 to 100',
    });
    expect(canonicalSearch({ placeId: 'abc' })).toMatchObject({ ok: false });
    expect(canonicalSearch({ placeId: '0' })).toMatchObject({ ok: false });
    expect(canonicalSearch({ place: 'x'.repeat(121) })).toMatchObject({ ok: false });
    expect(canonicalSearch({ payee: 'x'.repeat(101) })).toMatchObject({ ok: false });
    expect(canonicalSearch({ notes: 'x'.repeat(1001) })).toMatchObject({ ok: false });
    expect(canonicalSearch({ notes: 5 })).toMatchObject({ ok: false });
  });

  it('encodes newlines and symbols in notes', () => {
    const result = canonicalSearch({ notes: 'Boost: 90km | x\nline2' });
    expect(result).toEqual({
      ok: true,
      search: 'notes=Boost%3A+90km+%7C+x%0Aline2',
    });
  });
});

describe('shortIdFor', () => {
  it('is six characters of the share alphabet, the same for the same query', () => {
    const id = shortIdFor('place=Efa');
    expect(id).toMatch(/^[2-9a-hj-kmnp-z]{6}$/);
    expect(shortIdFor('place=Efa')).toBe(id);
    expect(shortIdFor('place=Efa', 1)).not.toBe(id);
  });
});

/**
 * A store that keeps links in memory, honouring the real one's rules: the same link renews
 * (free), a different live link holds its id, and a caller's new links are limited.
 */
function memoryStore() {
  const rows = new Map<string, { search: string; expiresAt: number }>();
  const callers = new Map<string, CallerState>();
  const store: ShortLinkStore = {
    claim(id, search, caller, now, expiresAt) {
      const held = rows.get(id);
      const live = held !== undefined && held.expiresAt > now;
      if (live && held.search !== search) return Promise.resolve('taken');
      if (!live) {
        const check = checkNewLink(callers.get(caller) ?? null, now);
        if (!check.ok)
          return Promise.resolve({ limitedFor: check.limitedFor, reason: check.reason });
        callers.set(caller, check.next);
      }
      rows.set(id, { search, expiresAt });
      return Promise.resolve('ok');
    },
  };
  return { rows, store };
}

describe('clientIp', () => {
  it('takes the address the front end appended, which a caller cannot forge', () => {
    expect(clientIp('6.6.6.6, 203.0.113.9')).toBe('203.0.113.9');
    expect(clientIp(['6.6.6.6', ' 203.0.113.9 '])).toBe('203.0.113.9');
    expect(clientIp('203.0.113.9')).toBe('203.0.113.9');
  });

  it('falls back to the socket address, then to a shared bucket', () => {
    expect(clientIp(undefined, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientIp('', undefined)).toBe('unknown');
  });
});

describe('callerAddress', () => {
  const base = {
    proxyClient: '203.0.113.9',
    proxySecret: 's3cret',
    forwardedFor: '6.6.6.6, 198.51.100.7',
    ip: '10.0.0.1',
    expectedSecret: 's3cret',
  };

  it('believes the proxy about who the caller is, when it knows the secret', () => {
    expect(callerAddress(base)).toBe('203.0.113.9');
  });

  it('ignores the claim without the right secret, using the address the front end saw', () => {
    expect(callerAddress({ ...base, proxySecret: 'guess' })).toBe('198.51.100.7');
    expect(callerAddress({ ...base, proxySecret: undefined })).toBe('198.51.100.7');
  });

  it('ignores the claim when no secret is configured here, or the client is blank', () => {
    expect(callerAddress({ ...base, expectedSecret: undefined })).toBe('198.51.100.7');
    expect(callerAddress({ ...base, expectedSecret: '', proxySecret: '' })).toBe('198.51.100.7');
    expect(callerAddress({ ...base, proxyClient: ' ' })).toBe('198.51.100.7');
  });
});

describe('callerKey', () => {
  it('is a stable hash, not the address', () => {
    expect(callerKey('203.0.113.9')).toBe(callerKey('203.0.113.9'));
    expect(callerKey('203.0.113.9')).not.toBe(callerKey('203.0.113.10'));
    expect(callerKey('203.0.113.9')).not.toContain('203');
  });
});

describe('makeShortStartLink', () => {
  const NOW = 1_800_000_000_000;
  const A = 'caller-a';

  it('answers with the short path, url and 30-day expiry', async () => {
    const { rows, store } = memoryStore();
    const res = await makeShortStartLink(
      { place: 'Efa' },
      store,
      A,
      NOW,
      'https://neocomdesk.com/'
    );
    expect(res.status).toBe(200);
    const id = res.body.id as string;
    expect(res.body.path).toBe(`/s/${id}`);
    expect(res.body.url).toBe(`https://neocomdesk.com/s/${id}`);
    expect(res.body.expiresAt).toBe(new Date(NOW + START_LINK_TTL_MS).toISOString());
    expect(rows.get(id)?.search).toBe('place=Efa');
  });

  it('gives the same short link for the same details, however they were sent, with no wait', async () => {
    const { rows, store } = memoryStore();
    const a = await makeShortStartLink({ place: 'Efa', rate: 5 }, store, A, NOW, 'https://x.test');
    const b = await makeShortStartLink(
      { rate: '5', place: 'Efa' },
      store,
      A,
      NOW + 1,
      'https://x.test'
    );
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(rows.size).toBe(1);
  });

  it('takes the next id when another link holds this one', async () => {
    const { rows, store } = memoryStore();
    rows.set(shortIdFor('place=Efa'), { search: 'place=Other', expiresAt: NOW + 1000 });
    const res = await makeShortStartLink({ place: 'Efa' }, store, A, NOW, 'https://x.test');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(shortIdFor('place=Efa', 1));
  });

  it('refuses a second new link from the same caller within 30 seconds, with a Retry-After', async () => {
    const { rows, store } = memoryStore();
    await makeShortStartLink({ place: 'Efa' }, store, A, NOW, 'https://x.test');
    const res = await makeShortStartLink(
      { place: 'Jita' },
      store,
      A,
      NOW + 10_000,
      'https://x.test'
    );
    expect(res.status).toBe(429);
    expect(res.headers).toEqual({ 'Retry-After': '20' });
    expect(res.body.retryAfterSeconds).toBe(20);
    expect(rows.size).toBe(1);
  });

  it('lets that caller make another after the gap, and other callers meanwhile', async () => {
    const { store } = memoryStore();
    await makeShortStartLink({ place: 'Efa' }, store, A, NOW, 'https://x.test');
    const other = await makeShortStartLink(
      { place: 'Jita' },
      store,
      'caller-b',
      NOW + 1,
      'https://x.test'
    );
    const later = await makeShortStartLink(
      { place: 'Amarr' },
      store,
      A,
      NOW + NEW_LINK_GAP_MS,
      'https://x.test'
    );
    expect(other.status).toBe(200);
    expect(later.status).toBe(200);
  });

  it('stops a caller at 30 new links an hour, then frees them when the hour is up', async () => {
    const { store } = memoryStore();
    let t = NOW;
    for (let n = 0; n < NEW_LINKS_PER_WINDOW; n++) {
      const ok = await makeShortStartLink({ place: `Place ${n}` }, store, A, t, 'https://x.test');
      expect(ok.status).toBe(200);
      t += NEW_LINK_GAP_MS;
    }
    const over = await makeShortStartLink({ place: 'One more' }, store, A, t, 'https://x.test');
    expect(over.status).toBe(429);
    expect(over.body.error).toBe('at most 30 new short links an hour');
    expect(over.body.retryAfterSeconds).toBe(Math.ceil((NOW + NEW_LINK_WINDOW_MS - t) / 1000));
    const after = await makeShortStartLink(
      { place: 'One more' },
      store,
      A,
      NOW + NEW_LINK_WINDOW_MS,
      'https://x.test'
    );
    expect(after.status).toBe(200);
  });

  it('refuses bad details with a 400, before any limit', async () => {
    const { store } = memoryStore();
    const res = await makeShortStartLink({ rate: 500 }, store, A, NOW, 'https://x.test');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rate/);
  });
});

describe('checkNewLink', () => {
  it('starts a window at the first link and counts within it', () => {
    const first = checkNewLink(null, 1000);
    expect(first).toEqual({ ok: true, next: { lastAt: 1000, windowStart: 1000, count: 1 } });
    const second = checkNewLink(first.ok ? first.next : null, 1000 + NEW_LINK_GAP_MS);
    expect(second).toMatchObject({ ok: true, next: { windowStart: 1000, count: 2 } });
  });

  it('reports the gap before the hour when both apply', () => {
    const full: CallerState = { lastAt: 5000, windowStart: 0, count: NEW_LINKS_PER_WINDOW };
    expect(checkNewLink(full, 6000)).toMatchObject({ ok: false, reason: 'gap' });
    expect(checkNewLink(full, 5000 + NEW_LINK_GAP_MS)).toMatchObject({ ok: false, reason: 'hour' });
  });
});
