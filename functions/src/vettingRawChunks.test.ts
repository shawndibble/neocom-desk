import { describe, expect, it } from 'vitest';
import type { VettingParty, VettingRawRow, VettingRawSource } from './vettingEngine.js';
import {
  chunkRawRows,
  decodeRawCursor,
  encodeRawCursor,
  rawRowIds,
  sumRawCounts,
} from './vettingRawChunks.js';

const row = (n: number, extra: Partial<VettingRawRow> = {}): VettingRawRow => ({
  characterId: 7,
  at: '2026-10-01T00:00:00Z',
  what: 'player_donation',
  partyId: 2_100_000_000 + n,
  amount: n,
  ...extra,
});
const party = (id: number): VettingParty => ({ id, name: `Name ${id}`, category: 'character' });
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

describe('rawRowIds', () => {
  it('collects party, recipient and corporation ids once', () => {
    expect(rawRowIds(row(1, { recipients: [5, 6, 5], corporationId: 9 }))).toEqual([
      2_100_000_001, 5, 6, 9,
    ]);
  });
});

describe('chunkRawRows', () => {
  it('gives no chunk for no rows', () => {
    expect(chunkRawRows([], [], 1000)).toEqual([]);
  });

  it('keeps every row in order, each chunk under budget, with the parties its rows name', () => {
    const rows = Array.from({ length: 30_000 }, (_, n) => row(n));
    const parties = rows.map((r) => party(r.partyId!));
    const budget = 400_000;
    const chunks = chunkRawRows(rows, parties, budget);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap((chunk) => chunk.rows)).toEqual(rows);
    for (const chunk of chunks) {
      expect(bytes(chunk.rows) + bytes(chunk.parties)).toBeLessThanOrEqual(budget);
      expect(chunk.parties.map((p) => p.id).sort()).toEqual(
        [...new Set(chunk.rows.flatMap(rawRowIds))].sort()
      );
    }
  });

  it('counts the parties inside the budget, so many recipients cannot overflow it', () => {
    const recipients = Array.from({ length: 200 }, (_, n) => 3_000_000 + n);
    const rows = Array.from({ length: 50 }, (_, n) => row(n, { what: 'Sent', recipients }));
    const parties = recipients.map(party);
    const budget = 30_000;
    for (const chunk of chunkRawRows(rows, parties, budget)) {
      expect(bytes(chunk.rows) + bytes(chunk.parties)).toBeLessThanOrEqual(budget);
    }
  });

  it('leaves an unnamed id out of the parties', () => {
    const [chunk] = chunkRawRows([row(1)], [], 10_000);
    expect(chunk.parties).toEqual([]);
  });

  it('puts one row bigger than the budget in a chunk of its own', () => {
    const chunks = chunkRawRows([row(1), row(2), row(3)], [], 10);
    expect(chunks.map((chunk) => chunk.rows.length)).toEqual([1, 1, 1]);
  });
});

describe('cursor', () => {
  it('round-trips a character and a chunk', () => {
    expect(decodeRawCursor(encodeRawCursor(2_100_000_001, 4))).toEqual({
      characterId: 2_100_000_001,
      seq: 4,
    });
  });
  it.each([
    '',
    '!!!',
    'abc',
    Buffer.from('1:x').toString('base64url'),
    Buffer.from('1:-1').toString('base64url'),
    Buffer.from('0:1').toString('base64url'),
  ])('refuses %j', (cursor) => {
    expect(decodeRawCursor(cursor)).toBeNull();
  });
});

describe('sumRawCounts', () => {
  const none = { rows: 0, chunks: 0 };
  const raw = (
    gen: string,
    sources: Partial<Record<VettingRawSource, { rows: number; chunks: number }>>
  ) => ({
    raw: {
      gen,
      sources: {
        wallet: none,
        contact: none,
        mail: none,
        contract: none,
        skills: none,
        history: none,
        ...sources,
      },
    },
  });
  it('adds the characters that carry metadata, and is undefined when none does', () => {
    expect(sumRawCounts([{}, {}])).toBeUndefined();
    expect(
      sumRawCounts([
        raw('a', { wallet: { rows: 3, chunks: 1 } }),
        raw('b', { wallet: { rows: 2, chunks: 1 }, mail: { rows: 1, chunks: 1 } }),
        {},
      ])
    ).toEqual({ wallet: 5, contact: 0, mail: 1, contract: 0, skills: 0, history: 0 });
  });
});
