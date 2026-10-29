// SRP retention sweep against the Firestore emulator (issue #4856, ADR 0026). Runs only
// under the emulator (FIRESTORE_EMULATOR_HOST); a plain `npm test` skips it.
import { afterAll, beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb, emulatorSuite } from './testSupport/emulator.js';
import { sweepSrpClaims } from './srpCleanup.js';
import { SRP_RETENTION_MS } from './srpRetention.js';

const CORP_A = 98000001;
const CORP_B = 98000002;
const NOW = Date.parse('2026-10-23T12:00:00Z');
const OLD = NOW - SRP_RETENTION_MS; // closed exactly a year ago
const DAY = 24 * 60 * 60 * 1000;

const db = emulatorDb;

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

emulatorSuite('SRP retention sweep (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(clearEmulator);

  it('deletes Paid and Rejected claims at one year, keeps the rest, one count-only audit entry per corp', async () => {
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
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      at: NOW,
      by: null,
      byName: 'retention sweep',
      action: 'retentionDelete',
      detail: { count: 2 },
    });
    expect(JSON.stringify(entries)).not.toMatch(/char:|characterId|Must Not Leak/);
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
    const second = await sweepSrpClaims(db, NOW + 1000, { maxDeletes: 6, pageSize: 2 });
    expect(second).toEqual({ deleted: 2, failed: 0, truncated: false });
    expect(await claimIds(CORP_A)).toEqual([]);
    expect(await claimIds(CORP_B)).toEqual([]);
    // CORP_A: one entry (run 1). CORP_B: one entry per run.
    expect((await audit(CORP_A)).length + (await audit(CORP_B)).length).toBe(3);
  });

  it("deletes a deleted claim's whole SRP log trail and nothing else (#4942)", async () => {
    const log = (corp: number, id: string, data: Record<string, unknown>) =>
      db.collection('corps').doc(String(corp)).collection('srpAudit').doc(id).set(data);
    const pilot = { by: 501, byName: 'Must Not Leak' };
    const officer = { by: 900, byName: 'Officer' };
    await put(CORP_A, 1, 'paid', OLD);
    await put(CORP_A, 2, 'paid', OLD + DAY); // newer: kept, with its trail
    await log(CORP_A, 'a', { ...pilot, action: 'fileClaim', detail: { killmailId: 1 } });
    await log(CORP_A, 'b', {
      ...officer,
      action: 'rejectClaim',
      detail: { killmailId: 1, pilotCharacterId: 501 },
    });
    await log(CORP_A, 'c', { ...pilot, action: 'refileClaim', detail: { killmailId: 1 } });
    await log(CORP_A, 'd', {
      ...officer,
      action: 'approveClaim',
      detail: { killmailId: 1, pilotCharacterId: 501 },
    });
    await log(CORP_A, 'e', {
      ...officer,
      action: 'markClaimPaid',
      detail: { killmailId: 1, pilotCharacterId: 501 },
    });
    await log(CORP_A, 'f', { ...pilot, action: 'fileClaim', detail: { killmailId: 2 } });
    await log(CORP_A, 'g', {
      ...officer,
      action: 'markClaimPaid',
      detail: { killmailId: 2, pilotCharacterId: 501 },
    });
    await log(CORP_A, 'h', { ...officer, action: 'turnOn', detail: { reenabled: false } });
    await log(CORP_A, 'i', { ...officer, action: 'saveSettings', detail: {} });
    await log(CORP_A, 'j', { ...officer, action: 'addDoctrine', detail: { name: 'Fit' } });
    // Another corp's log about the same killmail id is its own claim.
    await log(CORP_B, 'k', { ...pilot, action: 'fileClaim', detail: { killmailId: 1 } });

    expect(await sweepSrpClaims(db, NOW)).toEqual({ deleted: 1, failed: 0, truncated: false });

    expect(await claimIds(CORP_A)).toEqual(['2']);
    const left = await db.collection('corps').doc(String(CORP_A)).collection('srpAudit').get();
    const kept = left.docs.filter((d) => d.get('action') !== 'retentionDelete').map((d) => d.id);
    expect(kept.sort()).toEqual(['f', 'g', 'h', 'i', 'j']);
    const sweep = left.docs.find((d) => d.get('action') === 'retentionDelete')?.data();
    expect(sweep?.detail).toEqual({ count: 1 });
    expect(JSON.stringify(sweep)).not.toMatch(/killmail|claimIds|501|Must Not Leak/);
    expect((await audit(CORP_B)).map((e) => e.action)).toEqual(['fileClaim']);
  });

  it('writes one count-only entry for a corp however many claims it deletes', async () => {
    const writes = [];
    for (let id = 1; id <= 250; id += 1) writes.push(put(CORP_A, id, 'paid', OLD - id));
    await Promise.all(writes);
    expect(await sweepSrpClaims(db, NOW)).toEqual({ deleted: 250, failed: 0, truncated: false });
    expect((await audit(CORP_A)).map((e) => e.detail)).toEqual([{ count: 250 }]);
  });
});
