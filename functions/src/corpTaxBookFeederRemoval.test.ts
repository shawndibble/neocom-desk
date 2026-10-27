import { describe, expect, it, vi } from 'vitest';
import type { CorpSyncDeps } from './corpSyncGrant.js';
import {
  finalizeDueRemovals,
  parseRemovalCall,
  parseRemovalLinkCall,
  parseRemovalNoticeCall,
} from './corpTaxBookFeederRemoval.js';
import { parseSetFeederPayeeInput } from './corpTaxBookPayee.js';

const book = { corporationId: 98000001, accessToken: 'tok' };

describe('removal input', () => {
  it('needs the moon owner corporation', () => {
    expect(parseRemovalCall({ ...book, feederCorporationId: 98000002 }).feederCorporationId).toBe(
      98000002
    );
    expect(() => parseRemovalCall(book)).toThrow();
    expect(() => parseRemovalCall({ ...book, feederCorporationId: 0 })).toThrow();
  });

  it('takes an optional send time and refuses a non-number', () => {
    const base = { ...book, feederCorporationId: 98000002 };
    expect(parseRemovalNoticeCall(base).sentAt).toBeUndefined();
    expect(parseRemovalNoticeCall({ ...base, sentAt: 5 }).sentAt).toBe(5);
    expect(() => parseRemovalNoticeCall({ ...base, sentAt: 'now' })).toThrow();
  });

  it('bounds the link code', () => {
    expect(parseRemovalLinkCall({ code: 'abc' }).code).toBe('abc');
    expect(() => parseRemovalLinkCall({ code: '' })).toThrow();
    expect(() => parseRemovalLinkCall({ code: 'x'.repeat(65) })).toThrow();
  });
});

describe('payee input', () => {
  // The moon owner's own corporation: the moon owner sets its payee (#4619).
  const base = { corporationId: 98000002, accessToken: 'tok' };
  it('takes a player or a corporation', () => {
    expect(
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'character', id: 5 } }).payee
    ).toEqual({
      kind: 'character',
      id: 5,
    });
    expect(
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'corporation', id: 9 } }).payee.kind
    ).toBe('corporation');
  });
  it('refuses anything else', () => {
    expect(() =>
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'alliance', id: 5 } })
    ).toThrow();
    expect(() =>
      parseSetFeederPayeeInput({ ...base, payee: { kind: 'character', id: 0 } })
    ).toThrow();
    expect(() => parseSetFeederPayeeInput(base)).toThrow();
  });
});

// Nothing here is due (no effectiveAt), so these pin only how the hourly run finds candidates.
describe('finalizeDueRemovals reads', () => {
  const pending = { status: 'pending-removal', removal: { startedAt: 1 } };
  function fakeDeps(opts: { missingIndex?: boolean; failRead?: string } = {}) {
    const reads: string[] = [];
    const log = vi.fn();
    const doc = (path: string, data: unknown) => ({
      id: path.split('/').at(-1)!,
      ref: { path, parent: { parent: { id: path.split('/')[1] } } },
      data: () => data,
      get: (f: string) => (data as Record<string, unknown>)[f],
    });
    const db = {
      collectionGroup: () => ({
        where: () => ({
          get: async () => {
            if (opts.missingIndex) throw Object.assign(new Error('needs index'), { code: 9 });
            reads.push('group');
            return { docs: [doc('corps/1/feeders/2', pending), doc('other/1/feeders/3', pending)] };
          },
        }),
      }),
      collection: (name: string) => ({
        get: async () => {
          reads.push(name);
          return {
            docs: [
              doc(`${name}/2`, { collectorCorporationId: 1 }),
              doc(`${name}/4`, { collectorCorporationId: 1 }),
            ],
          };
        },
        doc: (c: string) => ({
          collection: (sub: string) => ({
            doc: (f: string) => ({
              get: async () => {
                const path = `${name}/${c}/${sub}/${f}`;
                reads.push(path);
                if (path === opts.failRead) throw new Error('unavailable');
                return { data: () => pending };
              },
            }),
          }),
        }),
      }),
    };
    return { deps: { db, log, now: () => 10 } as unknown as CorpSyncDeps, reads, log };
  }

  it('is one collection-group query, ignoring a same-named collection outside corps', async () => {
    const f = fakeDeps();
    expect(await finalizeDueRemovals(f.deps)).toEqual({ ended: 0 });
    expect(f.reads).toEqual(['group']);
  });

  it('falls back to the pointer scan until the index is deployed; one bad read skips only itself', async () => {
    const f = fakeDeps({ missingIndex: true, failRead: 'corps/1/feeders/2' });
    expect(await finalizeDueRemovals(f.deps, 'pointers')).toEqual({ ended: 0 });
    expect(f.reads).toEqual(['pointers', 'corps/1/feeders/2', 'corps/1/feeders/4']);
    expect(f.log).toHaveBeenCalledTimes(2); // the fallback notice and the failed read
  });
});
