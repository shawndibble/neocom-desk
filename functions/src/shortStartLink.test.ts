import { describe, expect, it } from 'vitest';
import {
  START_LINK_TTL_MS,
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

/** A store that keeps links in memory, honouring the "same link renews, different link is taken" rule. */
function memoryStore() {
  const rows = new Map<string, { search: string; expiresAt: number }>();
  const store: ShortLinkStore = {
    claim(id, search, now, expiresAt) {
      const held = rows.get(id);
      if (held && held.expiresAt > now && held.search !== search) return Promise.resolve('taken');
      rows.set(id, { search, expiresAt });
      return Promise.resolve('ok');
    },
  };
  return { rows, store };
}

describe('makeShortStartLink', () => {
  const NOW = 1_800_000_000_000;

  it('answers with the short path, url and 30-day expiry', async () => {
    const { rows, store } = memoryStore();
    const res = await makeShortStartLink({ place: 'Efa' }, store, NOW, 'https://neocomdesk.com/');
    expect(res.status).toBe(200);
    const id = res.body.id as string;
    expect(res.body.path).toBe(`/s/${id}`);
    expect(res.body.url).toBe(`https://neocomdesk.com/s/${id}`);
    expect(res.body.expiresAt).toBe(new Date(NOW + START_LINK_TTL_MS).toISOString());
    expect(rows.get(id)?.search).toBe('place=Efa');
  });

  it('gives the same short link for the same details, however they were sent', async () => {
    const { rows, store } = memoryStore();
    const a = await makeShortStartLink({ place: 'Efa', rate: 5 }, store, NOW, 'https://x.test');
    const b = await makeShortStartLink(
      { rate: '5', place: 'Efa' },
      store,
      NOW + 1,
      'https://x.test'
    );
    expect(b.body.id).toBe(a.body.id);
    expect(rows.size).toBe(1);
  });

  it('takes the next id when another link holds this one', async () => {
    const { rows, store } = memoryStore();
    const first = shortIdFor('place=Efa');
    rows.set(first, { search: 'place=Other', expiresAt: NOW + 1000 });
    const res = await makeShortStartLink({ place: 'Efa' }, store, NOW, 'https://x.test');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(shortIdFor('place=Efa', 1));
  });

  it('refuses bad details with a 400', async () => {
    const { store } = memoryStore();
    const res = await makeShortStartLink({ rate: 500 }, store, NOW, 'https://x.test');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rate/);
  });
});
