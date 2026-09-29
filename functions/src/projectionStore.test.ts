import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  dispatchDueProjections,
  projectionDocId,
  writeDeviceRegistration,
  type PushSender,
} from './projectionStore.js';
import { STALE_UNSENT_MS } from './dispatchProjections.js';
import type { ProjectionRowInput } from './registerDevice.js';

// A deliberately tiny in-memory Firestore: only what projectionStore.ts uses
// (`where` with ==, <=, <, array-contains; doc get/set/update/delete; batch).
// It follows real Firestore semantics where it matters here — a document
// missing a field never matches `where(field, '==', x)` — so the legacy-row
// test proves the device-scoped query alone would leave those rows behind.
type Data = Record<string, unknown>;
type Op = '==' | '<=' | '<' | 'array-contains';

class FakeFirestore {
  readonly collections = new Map<string, Map<string, Data>>();

  private store(name: string): Map<string, Data> {
    let s = this.collections.get(name);
    if (!s) this.collections.set(name, (s = new Map()));
    return s;
  }

  seed(collection: string, id: string, data: Data): void {
    this.store(collection).set(id, { ...data });
  }

  ids(collection: string): string[] {
    return [...this.store(collection).keys()].sort();
  }

  get(collection: string, id: string): Data | undefined {
    return this.store(collection).get(id);
  }

  collection(name: string) {
    return this.query(name, []);
  }

  private ref(name: string, id: string) {
    const store = this.store(name);
    return {
      id,
      get: async () => this.snapshotOf(name, id),
      set: async (data: Data) => void store.set(id, { ...data }),
      update: async (data: Data) => {
        const existing = store.get(id);
        if (!existing) throw new Error(`update of missing doc ${name}/${id}`);
        store.set(id, { ...existing, ...data });
      },
      delete: async () => void store.delete(id),
    };
  }

  private snapshotOf(name: string, id: string) {
    const data = this.store(name).get(id);
    return {
      id,
      exists: data !== undefined,
      ref: this.ref(name, id),
      data: () => (data ? { ...data } : undefined),
    };
  }

  private query(name: string, filters: [string, Op, unknown][]) {
    return {
      doc: (id: string) => this.ref(name, id),
      where: (field: string, op: Op, value: unknown) =>
        this.query(name, [...filters, [field, op, value]]),
      get: async () => {
        const docs = [...this.store(name).entries()]
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              if (!(field in data)) return false;
              const actual = data[field];
              if (op === '==') return actual === value;
              if (op === '<=') return (actual as number) <= (value as number);
              if (op === '<') return (actual as number) < (value as number);
              return Array.isArray(actual) && actual.includes(value);
            })
          )
          .map(([id]) => this.snapshotOf(name, id));
        return { docs, empty: docs.length === 0 };
      },
    };
  }

  batch() {
    const ops: (() => Promise<void>)[] = [];
    const batch = {
      set: (ref: { set: (d: Data) => Promise<void> }, data: Data) => {
        ops.push(() => ref.set(data));
        return batch;
      },
      delete: (ref: { delete: () => Promise<void> }) => {
        ops.push(() => ref.delete());
        return batch;
      },
      commit: async () => {
        for (const op of ops) await op();
      },
    };
    return batch;
  }
}

function asFirestore(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

class FakeMessaging implements PushSender {
  readonly sent: { token: string; data: Record<string, string> }[] = [];
  readonly failures = new Map<string, string>();

  async send(message: { token: string; data: Record<string, string> }): Promise<string> {
    const code = this.failures.get(message.token);
    if (code) throw Object.assign(new Error(code), { code });
    this.sent.push(message);
    return 'message-id';
  }
}

const NOW = 1_700_000_000_000;
const CHAR = 1;

function row(eventId: string, fireAt = NOW + 3_600_000): ProjectionRowInput {
  return {
    eventId,
    occurrenceKey: `${CHAR}:${eventId}:${fireAt}`,
    fireAt,
    title: `${eventId} title`,
    body: `${eventId} body`,
  };
}

async function upload(
  db: FakeFirestore,
  deviceId: string,
  projections: { characterId: number; rows: ProjectionRowInput[] }[],
  characterIds = projections.map((p) => p.characterId)
): Promise<void> {
  await writeDeviceRegistration(asFirestore(db), {
    deviceId,
    fcmToken: `token-${deviceId}`,
    characterIds,
    projections,
  });
}

function unfiredRowsOf(db: FakeFirestore, deviceId: string): string[] {
  return db
    .ids('projections')
    .filter((id) => db.get('projections', id)?.deviceId === deviceId)
    .filter((id) => db.get('projections', id)?.fired === false);
}

describe('writeDeviceRegistration', () => {
  it("keeps device A's unfired rows when device B uploads for the same Character", async () => {
    const db = new FakeFirestore();
    const jobA = row('industryJobComplete');
    const skillB = row('skillTrainingComplete');

    await upload(db, 'A', [{ characterId: CHAR, rows: [jobA] }]);
    // B has industry jobs switched off, so its Projection omits jobA entirely.
    await upload(db, 'B', [{ characterId: CHAR, rows: [skillB] }]);

    expect(unfiredRowsOf(db, 'A')).toEqual([projectionDocId('A', jobA.occurrenceKey)]);
    expect(unfiredRowsOf(db, 'B')).toEqual([projectionDocId('B', skillB.occurrenceKey)]);
  });

  it("replaces this device's own unfired rows wholesale, leaving its fired rows alone", async () => {
    const db = new FakeFirestore();
    const old = row('industryJobComplete');
    const next = row('skillTrainingComplete');
    await upload(db, 'A', [{ characterId: CHAR, rows: [old] }]);
    const firedId = projectionDocId('A', 'fired-key');
    db.seed('projections', firedId, {
      deviceId: 'A',
      characterId: CHAR,
      occurrenceKey: 'fired-key',
      fired: true,
      firedAt: NOW,
    });

    await upload(db, 'A', [{ characterId: CHAR, rows: [next] }]);

    expect(unfiredRowsOf(db, 'A')).toEqual([projectionDocId('A', next.occurrenceKey)]);
    expect(db.get('projections', firedId)?.fired).toBe(true);
  });

  it('stores the uploader deviceId, the characterId and eveType on each row', async () => {
    const db = new FakeFirestore();
    const r = { ...row('eveNotification'), eveType: 'StructureLostShields' };
    await upload(db, 'A', [{ characterId: CHAR, rows: [r] }]);

    expect(db.get('projections', projectionDocId('A', r.occurrenceKey))).toEqual({
      deviceId: 'A',
      characterId: CHAR,
      eventId: 'eveNotification',
      occurrenceKey: r.occurrenceKey,
      fireAt: r.fireAt,
      title: r.title,
      body: r.body,
      eveType: 'StructureLostShields',
      fired: false,
      firedAt: null,
    });
  });

  it('writes the registration doc with the verified characterIds and token', async () => {
    const db = new FakeFirestore();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);

    expect(db.get('deviceRegistrations', 'A')).toMatchObject({
      fcmToken: 'token-A',
      characterIds: [CHAR],
    });
  });

  it("deletes this device's unfired rows for a Character it no longer holds (roster drift)", async () => {
    const db = new FakeFirestore();
    const kept = row('industryJobComplete');
    const dropped = { ...row('skillTrainingComplete'), occurrenceKey: '2:skill:1' };
    await upload(db, 'A', [
      { characterId: CHAR, rows: [kept] },
      { characterId: 2, rows: [dropped] },
    ]);
    // Device B's rows for Character 2 must survive A dropping it.
    await upload(db, 'B', [{ characterId: 2, rows: [dropped] }]);

    await upload(db, 'A', [{ characterId: CHAR, rows: [kept] }]);

    expect(unfiredRowsOf(db, 'A')).toEqual([projectionDocId('A', kept.occurrenceKey)]);
    expect(unfiredRowsOf(db, 'B')).toEqual([projectionDocId('B', dropped.occurrenceKey)]);
  });

  it("deletes a Character's legacy (deviceId-less) unfired rows on the first per-device upload", async () => {
    const db = new FakeFirestore();
    const legacy = row('industryJobComplete');
    const legacyOther = row('planetExtractorExpired');
    const legacyFired = row('skillTrainingComplete', NOW - 1);
    for (const r of [legacy, legacyOther]) {
      db.seed('projections', r.occurrenceKey, {
        ...r,
        characterId: CHAR,
        fired: false,
        firedAt: null,
      });
    }
    db.seed('projections', legacyFired.occurrenceKey, {
      ...legacyFired,
      characterId: CHAR,
      fired: true,
      firedAt: NOW,
    });
    // A pre-#2240 registration: no per-device marker.
    db.seed('deviceRegistrations', 'A', { fcmToken: 'token-A', characterIds: [CHAR] });

    // This upload no longer mentions legacyOther, so a blind delete of the
    // uploaded keys alone would miss it.
    await upload(db, 'A', [{ characterId: CHAR, rows: [legacy] }]);

    expect(db.get('projections', legacy.occurrenceKey)).toBeUndefined();
    expect(db.get('projections', legacyOther.occurrenceKey)).toBeUndefined();
    expect(db.get('projections', legacyFired.occurrenceKey)?.fired).toBe(true);
    expect(unfiredRowsOf(db, 'A')).toEqual([projectionDocId('A', legacy.occurrenceKey)]);
  });

  it('skips the legacy sweep once the device has uploaded per-device before', async () => {
    const db = new FakeFirestore();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    // A straggler written by a device that never re-registered after the deploy.
    const straggler = row('industryJobComplete');
    db.seed('projections', straggler.occurrenceKey, {
      ...straggler,
      characterId: CHAR,
      fired: false,
      firedAt: null,
    });

    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);

    expect(db.get('projections', straggler.occurrenceKey)).toBeDefined();
  });
});

describe('dispatchDueProjections', () => {
  const due = row('industryJobComplete', NOW - 60_000);

  it("sends a device's row only to that device's token", async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);
    await upload(db, 'B', [{ characterId: CHAR, rows: [] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent.map((m) => m.token)).toEqual(['token-A']);
    expect(messaging.sent[0]?.data).toMatchObject({
      characterId: String(CHAR),
      occurrenceKey: due.occurrenceKey,
    });
    expect(db.get('projections', projectionDocId('A', due.occurrenceKey))).toMatchObject({
      fired: true,
      firedAt: NOW,
    });
  });

  it('sends each of two devices their own row for the same occurrence, once each', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);
    await upload(db, 'B', [{ characterId: CHAR, rows: [due] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent.map((m) => m.token).sort()).toEqual(['token-A', 'token-B']);
  });

  it('does not send a row that is not yet due', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [row('industryJobComplete')] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toEqual([]);
  });

  it("skips and deletes a row whose device no longer lists the row's Character (roster drift)", async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);
    db.seed('deviceRegistrations', 'A', { fcmToken: 'token-A', characterIds: [2] });

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toEqual([]);
    expect(db.get('projections', projectionDocId('A', due.occurrenceKey))).toBeUndefined();
  });

  it('deletes an orphan row whose device has no registration, without sending it', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);
    await upload(db, 'B', [{ characterId: CHAR, rows: [] }]);
    db.collections.get('deviceRegistrations')?.delete('A');

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toEqual([]);
    expect(db.get('projections', projectionDocId('A', due.occurrenceKey))).toBeUndefined();
  });

  it('still fans a legacy (deviceId-less) row out to every device holding its Character', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    db.seed('projections', due.occurrenceKey, {
      ...due,
      characterId: CHAR,
      fired: false,
      firedAt: null,
    });
    db.seed('deviceRegistrations', 'A', { fcmToken: 'token-A', characterIds: [CHAR] });
    db.seed('deviceRegistrations', 'B', { fcmToken: 'token-B', characterIds: [CHAR] });
    db.seed('deviceRegistrations', 'C', { fcmToken: 'token-C', characterIds: [2] });

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent.map((m) => m.token).sort()).toEqual(['token-A', 'token-B']);
    expect(db.get('projections', due.occurrenceKey)?.fired).toBe(true);
  });

  it('deletes a row more than 7 days past fireAt unsent', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    const stale = row('industryJobComplete', NOW - STALE_UNSENT_MS - 1);
    await upload(db, 'A', [{ characterId: CHAR, rows: [stale] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toEqual([]);
    expect(db.get('projections', projectionDocId('A', stale.occurrenceKey))).toBeUndefined();
  });

  it('deletes the registration on an UNREGISTERED send error and leaves the row unfired', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    messaging.failures.set('token-A', 'messaging/registration-token-not-registered');
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(db.get('deviceRegistrations', 'A')).toBeUndefined();
    expect(db.get('projections', projectionDocId('A', due.occurrenceKey))?.fired).toBe(false);
  });

  it('leaves the registration and the row alone on a transient send error', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    messaging.failures.set('token-A', 'messaging/internal-error');
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW, () => {});

    expect(db.get('deviceRegistrations', 'A')).toBeDefined();
    expect(db.get('projections', projectionDocId('A', due.occurrenceKey))?.fired).toBe(false);
  });
});
