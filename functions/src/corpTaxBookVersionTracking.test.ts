// The version marker's write hook (issue #5047), with no backend: each Admin
// SDK write route is called but nothing reaches the network — a batch's commit
// is stubbed, and a BulkWriter is never flushed. What matters is the
// recording, which happens when the write is built.
import { describe, expect, it, vi } from 'vitest';
import { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { bookPathOf } from './corpTaxBookVersionKeys.js';
import {
  installBookWriteTracking,
  withBookVersions,
  type BookStamper,
} from './corpTaxBookVersionTracking.js';

installBookWriteTracking();
const db = new Firestore({ projectId: 'demo-book-version', host: '127.0.0.1:9', ssl: false });
// What `DocumentReference.set` and friends commit through: never let it leave the process.
vi.spyOn(WriteBatch.prototype, 'commit').mockResolvedValue([]);

/** Runs `run` in a scope and returns what each book's stamp was asked for. */
async function touchedBy(run: () => unknown): Promise<Record<string, string[]>> {
  const stamped: Record<string, string[]> = {};
  const stamp: BookStamper = async (id, names) => {
    stamped[id] = [...names].sort();
  };
  await withBookVersions(stamp, run, vi.fn());
  return stamped;
}

const ignore = (p: Promise<unknown>) => void p.catch(() => undefined);

describe('bookPathOf', () => {
  it('names the book and the subcollection directly under it', () => {
    expect(bookPathOf('corps/7')).toEqual({ corporationId: '7', collection: null });
    expect(bookPathOf('corps/7/miners/m1')).toEqual({ corporationId: '7', collection: 'miners' });
    expect(bookPathOf('corps/7/miners')).toEqual({ corporationId: '7', collection: 'miners' });
    expect(bookPathOf('corps/7/feeders/9/payouts/p1')).toEqual({
      corporationId: '7',
      collection: 'feeders',
    });
    expect(bookPathOf('characters/char:1/settings/x')).toBeUndefined();
    expect(bookPathOf('corpsX/7/miners/m1')).toBeUndefined();
  });
});

describe('withBookVersions', () => {
  const book = db.collection('corps').doc('7');

  it('records a WriteBatch write', async () => {
    expect(
      await touchedBy(() => {
        const batch = db.batch();
        batch.set(book.collection('miners').doc('m1'), { a: 1 });
        batch.update(book.collection('meta').doc('paid'), { ids: [] });
        batch.delete(book.collection('feeders').doc('9').collection('payouts').doc('p'));
      })
    ).toEqual({ '7': ['feeders', 'meta', 'miners'] });
  });

  it('records a DocumentReference write, which builds its own WriteBatch', async () => {
    expect(
      await touchedBy(() => {
        ignore(book.collection('statements').doc('s1').set({ a: 1 }));
        ignore(book.collection('observed').doc('o1').create({ a: 1 }));
        ignore(book.collection('payments').doc('p1').update({ a: 1 }));
        ignore(book.collection('dismissals').doc('d1').delete());
      })
    ).toEqual({ '7': ['dismissals', 'observed', 'payments', 'statements'] });
  });

  it('records a write to the book document itself, with no subcollection', async () => {
    expect(await touchedBy(() => ignore(book.set({ active: true }, { merge: true })))).toEqual({
      '7': [],
    });
  });

  it('records a BulkWriter write (what recursiveDelete uses)', async () => {
    expect(
      await touchedBy(() => {
        // Never flushed or closed, so nothing is sent.
        const writer = db.bulkWriter();
        ignore(writer.set(book.collection('writeOffs').doc('w1'), { a: 1 }));
        ignore(writer.delete(book.collection('adjustments').doc('a1')));
      })
    ).toEqual({ '7': ['adjustments', 'writeOffs'] });
  });

  it('records a BulkWriter write when it is called, even once buffered past the pending limit', async () => {
    // Past 500 pending operations a BulkWriter builds the write later, from
    // another operation's completion, outside this scope's context.
    const writer = db.bulkWriter();
    expect(
      await touchedBy(() => {
        for (let i = 0; i < 600; i++)
          ignore(writer.set(db.collection('corps').doc('3').collection('miners').doc(`m${i}`), {}));
        ignore(writer.set(book.collection('extractions').doc('late'), { a: 1 }));
      })
    ).toEqual({ '3': ['miners'], '7': ['extractions'] });
  });

  it('records a recursiveDelete where it is called, before it streams anything', async () => {
    expect(
      await touchedBy(() => {
        ignore(db.recursiveDelete(book.collection('declarations')));
        ignore(db.recursiveDelete(book.collection('feeders').doc('9')));
      })
    ).toEqual({ '7': ['declarations', 'feeders'] });
  });

  it('ignores the officer, audit and SRP subcollections, and paths outside a book', async () => {
    expect(
      await touchedBy(() => {
        const batch = db.batch();
        batch.set(book.collection('officers').doc('char:1'), { a: 1 });
        batch.set(book.collection('audit').doc('x'), { a: 1 });
        batch.set(book.collection('srpClaims').doc('x'), { a: 1 });
        batch.set(db.collection('characters').doc('char:1'), { a: 1 });
      })
    ).toEqual({});
  });

  it('keeps concurrent scopes apart', async () => {
    const [a, b] = await Promise.all([
      touchedBy(async () => {
        await Promise.resolve();
        db.batch().set(db.collection('corps').doc('1').collection('miners').doc('m'), {});
      }),
      touchedBy(async () => {
        await Promise.resolve();
        db.batch().set(db.collection('corps').doc('2').collection('statements').doc('s'), {});
      }),
    ]);
    expect(a).toEqual({ '1': ['miners'] });
    expect(b).toEqual({ '2': ['statements'] });
  });

  it('records nothing outside a scope', async () => {
    const stamp = vi.fn<BookStamper>(async () => undefined);
    db.batch().set(book.collection('miners').doc('m1'), { a: 1 });
    await withBookVersions(stamp, () => undefined, vi.fn());
    expect(stamp).not.toHaveBeenCalled();
  });

  it('stamps when the work throws, and rethrows', async () => {
    const stamp = vi.fn<BookStamper>(async () => undefined);
    await expect(
      withBookVersions(
        stamp,
        () => {
          db.batch().set(book.collection('miners').doc('m1'), { a: 1 });
          throw new Error('boom');
        },
        vi.fn()
      )
    ).rejects.toThrow('boom');
    expect(stamp).toHaveBeenCalledWith('7', new Set(['miners']));
  });

  it('stamps a book soon after its writes while a long job is still running', async () => {
    const stamps: [string, string[]][] = [];
    const stamp: BookStamper = async (id, names) => {
      stamps.push([id, [...names].sort()]);
    };
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await withBookVersions(
      stamp,
      async () => {
        db.batch().set(db.collection('corps').doc('1').collection('miners').doc('m'), {});
        await pause(40);
        // The first book is stamped while the job moves on to the next one.
        expect(stamps).toEqual([['1', ['miners']]]);
        db.batch().set(db.collection('corps').doc('2').collection('statements').doc('s'), {});
      },
      vi.fn(),
      10
    );
    expect(stamps).toEqual([
      ['1', ['miners']],
      ['2', ['statements']],
    ]);
  });

  it('logs a failed stamp without failing the work', async () => {
    const onError = vi.fn();
    const result = await withBookVersions(
      async () => {
        throw new Error('contention');
      },
      () => {
        db.batch().set(book.collection('miners').doc('m1'), { a: 1 });
        return 'done';
      },
      onError
    );
    expect(result).toBe('done');
    expect(onError).toHaveBeenCalledWith(
      'Corp Tax Book version stamp failed',
      expect.objectContaining({ corporationId: '7', error: 'contention' })
    );
  });
});
