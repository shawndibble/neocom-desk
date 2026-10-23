// SRP retention sweep against the Firestore emulator (issue #4856, ADR 0026). Runs only
// under the emulator (FIRESTORE_EMULATOR_HOST); a plain `npm test` skips it.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { sweepSrpClaims } from './srpCleanup.js';
import { SRP_RETENTION_MS } from './srpRetention.js';

const CORP_A = 98000001;
const CORP_B = 98000002;
const NOW = Date.parse('2026-10-23T12:00:00Z');
const OLD = NOW - SRP_RETENTION_MS; // closed exactly a year ago
const DAY = 24 * 60 * 60 * 1000;

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
if (runnable) {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
  db = getFirestore();
}

async function clearEmulator(): Promise<void> {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-neocom-rules/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

const claims = (corp: number) => db.collection('corps').doc(String(corp)).collection('srpClaims');
const claimIds = async (corp: number) => (await claims(corp).get()).docs.map((d) => d.id).sort();
const audit = async (corp: number) =>
  (await db.collection('corps').doc(String(corp)).collection('srpAudit').get()).docs.map((d) =>
    d.data()
  );
const put = (corp: number, id: number, state: string, closedAt?: number) =>
  claims(corp)
    .doc(String(id))
    .set({
      uid: `char:${id}`,
      ownerHash: `h${id}`,
      corporationId: corp,
      killmailId: id,
      pilotName: 'Must Not Leak',
      state,
      ...(closedAt === undefined ? {} : { closedAt }),
    });

suite('SRP retention sweep (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(clearEmulator);

  it('deletes Paid and Rejected claims at one year, keeps the rest, audits each', async () => {
    await put(CORP_A, 1, 'paid', OLD);
    await put(CORP_A, 2, 'rejected', OLD);
    await put(CORP_A, 3, 'paid', OLD + 1); // 1 ms short
    await put(CORP_A, 4, 'pending');
    await put(CORP_A, 5, 'approved');
    await put(CORP_A, 6, 'pending', OLD - 100 * DAY); // re-filed: stale closedAt, pending
    await put(CORP_B, 7, 'paid', OLD - DAY);

    const result = await sweepSrpClaims(db, NOW);

    expect(result).toEqual({ deleted: 3, failed: 0, truncated: false });
    expect(await claimIds(CORP_A)).toEqual(['3', '4', '5', '6']);
    expect(await claimIds(CORP_B)).toEqual([]);
    const entries = await audit(CORP_A);
    expect(entries).toHaveLength(2);
    const byClaim = Object.fromEntries(entries.map((e) => [e.detail.claimId, e.detail]));
    expect(byClaim['1']).toEqual({
      claimId: '1',
      state: 'paid',
      characterId: 1,
      closedAt: OLD,
      deletedAt: NOW,
    });
    expect(byClaim['2'].state).toBe('rejected');
    expect(JSON.stringify(await audit(CORP_B))).not.toContain('Must Not Leak');
    expect(await audit(CORP_B)).toHaveLength(1);
  });

  it('is idempotent: a second run deletes nothing and adds no audit lines', async () => {
    await put(CORP_A, 1, 'paid', OLD);
    await sweepSrpClaims(db, NOW);
    expect(await sweepSrpClaims(db, NOW)).toEqual({ deleted: 0, failed: 0, truncated: false });
    expect(await audit(CORP_A)).toHaveLength(1);
  });

  it('pages and caps a backlog across corps, finishing on the next run', async () => {
    for (let id = 1; id <= 5; id += 1) await put(CORP_A, id, 'paid', OLD - id);
    for (let id = 11; id <= 13; id += 1) await put(CORP_B, id, 'rejected', OLD - id);

    const first = await sweepSrpClaims(db, NOW, { maxDeletes: 6, pageSize: 2 });
    expect(first).toEqual({ deleted: 6, failed: 0, truncated: true });
    const second = await sweepSrpClaims(db, NOW, { maxDeletes: 6, pageSize: 2 });
    expect(second).toEqual({ deleted: 2, failed: 0, truncated: false });
    expect(await claimIds(CORP_A)).toEqual([]);
    expect(await claimIds(CORP_B)).toEqual([]);
    expect((await audit(CORP_A)).length + (await audit(CORP_B)).length).toBe(8);
  });
});
