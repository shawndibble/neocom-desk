import { describe, expect, it } from 'vitest';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  dispatchDueProjections,
  purgeFiredProjections,
  projectionDocId,
  writeDeviceRegistration,
  type PushSender,
} from './projectionStore.js';
import {
  STALE_UNSENT_MS,
  FIRED_RETENTION_MS,
  isDue,
  isPastRetention,
} from './dispatchProjections.js';
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
  /** Batch commits left to fail before they start succeeding again. */
  failCommits = 0;
  /** Batched set/delete ops committed, to prove what a call actually wrote. */
  batchWrites = 0;
  batchDeletes = 0;
  /** `get()` calls on a collection query (not a single doc), by `where` field names. */
  queryGets: string[] = [];

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
      set: async (data: Data, options?: { mergeFields?: string[] }) => {
        if (!options?.mergeFields) return void store.set(id, { ...data });
        // The Admin SDK: listed fields are written, a listed field set to
        // `FieldValue.delete()` is deleted, every other field is kept — and a
        // listed field absent from `data` throws ("Input data is missing for
        // field …") before anything is written.
        const missing = options.mergeFields.find((field) => !(field in data));
        if (missing) throw new Error(`Input data is missing for field "${missing}".`);
        const next: Data = { ...(store.get(id) ?? {}) };
        for (const field of options.mergeFields) {
          const value = data[field];
          if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[field];
          else next[field] = value;
        }
        store.set(id, next);
      },
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

  private query(
    name: string,
    filters: [string, Op, unknown][],
    max = Infinity,
    orderField?: string,
    after?: { id: string; value: unknown }
  ) {
    return {
      doc: (id: string) => this.ref(name, id),
      where: (field: string, op: Op, value: unknown) =>
        this.query(name, [...filters, [field, op, value]], max, orderField, after),
      limit: (n: number) => this.query(name, filters, n, orderField, after),
      orderBy: (field: string) => this.query(name, filters, max, field, after),
      startAfter: (snap: { id: string; data: () => Data | undefined }) =>
        this.query(name, filters, max, orderField, {
          id: snap.id,
          value: orderField ? snap.data()?.[orderField] : undefined,
        }),
      get: async () => {
        this.queryGets.push(name);
        const sorted = [...this.store(name).entries()];
        if (orderField) {
          sorted.sort(
            ([ia, a], [ib, b]) =>
              (a[orderField] as number) - (b[orderField] as number) || ia.localeCompare(ib)
          );
        }
        const docs = sorted
          .filter(([id, data]) => {
            if (!after || !orderField) return true;
            const v = data[orderField] as number;
            const av = after.value as number;
            return v > av || (v === av && id > after.id);
          })
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
          .slice(0, max)
          .map(([id]) => this.snapshotOf(name, id));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  batch() {
    const ops: (() => Promise<void>)[] = [];
    const batch = {
      set: (ref: { set: (d: Data) => Promise<void> }, data: Data) => {
        ops.push(async () => {
          this.batchWrites += 1;
          await ref.set(data);
        });
        return batch;
      },
      delete: (ref: { delete: () => Promise<void> }) => {
        ops.push(async () => {
          this.batchDeletes += 1;
          await ref.delete();
        });
        return batch;
      },
      commit: async () => {
        if (this.failCommits > 0) {
          this.failCommits -= 1;
          throw new Error('batch commit failed');
        }
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
  characterIds = projections.map((p) => p.characterId),
  eveTypesByCharacter: Record<number, string[]> = {}
): Promise<void> {
  await writeDeviceRegistration(asFirestore(db), {
    deviceId,
    fcmToken: `token-${deviceId}`,
    characterIds,
    projections,
    eveTypesByCharacter,
  });
}

function unfiredRowsOf(db: FakeFirestore, deviceId: string): string[] {
  return db
    .ids('projections')
    .filter((id) => db.get('projections', id)?.deviceId === deviceId)
    .filter((id) => db.get('projections', id)?.fired === false);
}

describe('writeDeviceRegistration', () => {
  it('re-registering an identical set writes and deletes no rows', async () => {
    const db = new FakeFirestore();
    const rows = [row('industryJobComplete'), row('skillTrainingComplete')];
    await upload(db, 'A', [{ characterId: CHAR, rows }]);
    db.batchWrites = 0;
    db.batchDeletes = 0;

    await upload(db, 'A', [{ characterId: CHAR, rows }]);

    expect(db.batchWrites).toBe(0);
    expect(db.batchDeletes).toBe(0);
    expect(unfiredRowsOf(db, 'A')).toHaveLength(2);
  });

  it('reads no projection docs for a repeat upload with no changes (issue #5238)', async () => {
    const db = new FakeFirestore();
    const rows = [row('industryJobComplete'), row('skillTrainingComplete')];
    await upload(db, 'A', [{ characterId: CHAR, rows }]);
    db.queryGets = [];

    await upload(db, 'A', [{ characterId: CHAR, rows: [...rows].reverse() }]);

    expect(db.queryGets).toEqual([]);
    expect(unfiredRowsOf(db, 'A')).toHaveLength(2);
  });

  it('diffs again once an upload adds, changes or removes a row', async () => {
    const db = new FakeFirestore();
    const a = row('industryJobComplete');
    const b = row('skillTrainingComplete');
    await upload(db, 'A', [{ characterId: CHAR, rows: [a, b] }]);

    await upload(db, 'A', [{ characterId: CHAR, rows: [a, b, row('eveNotification')] }]);
    expect(unfiredRowsOf(db, 'A')).toHaveLength(3);

    await upload(db, 'A', [{ characterId: CHAR, rows: [a, { ...b, title: 'new' }] }]);
    expect(unfiredRowsOf(db, 'A')).toHaveLength(2);
    expect(db.get('projections', projectionDocId('A', b.occurrenceKey))?.title).toBe('new');

    await upload(db, 'A', [{ characterId: CHAR, rows: [a] }]);
    expect(unfiredRowsOf(db, 'A')).toEqual([projectionDocId('A', a.occurrenceKey)]);
  });

  it('does not record the hash when a batch failed, so the retry still writes', async () => {
    const db = new FakeFirestore();
    const rows = [row('industryJobComplete')];
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    db.failCommits = 1;
    await expect(upload(db, 'A', [{ characterId: CHAR, rows }])).rejects.toThrow();

    await upload(db, 'A', [{ characterId: CHAR, rows }]);

    expect(unfiredRowsOf(db, 'A')).toHaveLength(1);
  });

  it('writes only changed and added rows and deletes only removed ones', async () => {
    const db = new FakeFirestore();
    const same = row('industryJobComplete');
    const changed = row('skillTrainingComplete');
    const removed = row('eveNotification');
    await upload(db, 'A', [{ characterId: CHAR, rows: [same, changed, removed] }]);
    db.batchWrites = 0;
    db.batchDeletes = 0;
    const added = row('marketOrderExpired');

    await upload(db, 'A', [
      { characterId: CHAR, rows: [same, { ...changed, fireAt: changed.fireAt + 1 }, added] },
    ]);

    expect(db.batchWrites).toBe(2);
    expect(db.batchDeletes).toBe(1);
    expect(unfiredRowsOf(db, 'A').sort()).toEqual(
      [same, changed, added].map((r) => projectionDocId('A', r.occurrenceKey)).sort()
    );
    expect(db.get('projections', projectionDocId('A', changed.occurrenceKey))?.fireAt).toBe(
      changed.fireAt + 1
    );
  });

  it('stores each device’s own eveTypes, so two devices keep independent lists', async () => {
    const db = new FakeFirestore();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }], [CHAR], { [CHAR]: ['X', 'Y'] });
    await upload(db, 'B', [{ characterId: CHAR, rows: [] }], [CHAR], { [CHAR]: ['Z'] });
    await upload(db, 'B', [{ characterId: CHAR, rows: [] }], [CHAR], { [CHAR]: [] });

    // An upload that omits the list (older client) keeps this device's stored one.
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    expect(db.get('deviceRegistrations', 'A')?.eveTypesByCharacter).toEqual({
      [String(CHAR)]: ['X', 'Y'],
    });
    expect(db.get('deviceRegistrations', 'A')?.eveTypesByCharacter).toEqual({
      [String(CHAR)]: ['X', 'Y'],
    });
    expect(db.get('deviceRegistrations', 'B')?.eveTypesByCharacter).toEqual({
      [String(CHAR)]: [],
    });
  });

  it('stores server-pushed events and inputs per device, keeps them when omitted, and lists the polled ones (issue #5121)', async () => {
    const db = new FakeFirestore();
    const other = CHAR + 1;
    await writeDeviceRegistration(asFirestore(db), {
      deviceId: 'A',
      fcmToken: 'token-A',
      characterIds: [CHAR, other],
      projections: [],
      eveTypesByCharacter: {},
      serverEventsByCharacter: {
        [CHAR]: ['communityJoinRequest', 'priceAlertTriggered'],
        [other]: [],
      },
      serverInputsByCharacter: { [CHAR]: { priceStationId: 60003760 } },
    });
    const first = db.get('deviceRegistrations', 'A');
    expect(first?.serverEventsByCharacter).toEqual({
      [String(CHAR)]: ['communityJoinRequest', 'priceAlertTriggered'],
      [String(other)]: [],
    });
    expect(first?.serverInputsByCharacter).toEqual({
      [String(CHAR)]: { priceStationId: 60003760 },
    });
    expect(first?.polledServerEvents).toEqual(['priceAlertTriggered']);

    // The tick's baselines survive a re-registration for Characters still held.
    db.seed('deviceRegistrations', 'A', {
      ...first,
      serverEventBaselines: {
        [String(CHAR)]: { shipLossIds: [1], priceAlerts: [] },
        [String(other)]: {},
      },
    });
    // An older client omits both: this device's stored lists stay.
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    const second = db.get('deviceRegistrations', 'A');
    expect(second?.serverEventsByCharacter).toEqual({
      [String(CHAR)]: ['communityJoinRequest', 'priceAlertTriggered'],
    });
    expect(second?.serverInputsByCharacter).toEqual({
      [String(CHAR)]: { priceStationId: 60003760 },
    });
    // The reading of a retired event (a loss list) is dropped with the rest of the stale baseline.
    expect(second?.serverEventBaselines).toEqual({ [String(CHAR)]: { priceAlerts: [] } });
    expect(second?.polledServerEvents).toEqual(['priceAlertTriggered']);
  });

  it("keeps routeRules when an upload omits them, and never touches the poller's nearbyState (issue #5122)", async () => {
    const db = new FakeFirestore();
    const rules = { preference: 'shortest' as const, securityPenalty: 50, avoid: [30000142] };
    await writeDeviceRegistration(asFirestore(db), {
      deviceId: 'A',
      fcmToken: 'token-A',
      characterIds: [CHAR],
      projections: [],
      eveTypesByCharacter: {},
      routeRules: rules,
    });
    // The poller's own state rides on the doc; an upload never wipes it.
    const nearbyState = { characters: {}, pushed: { k: 1 } };
    await asFirestore(db).collection('deviceRegistrations').doc('A').update({ nearbyState });
    // An older client sends no rules.
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    const doc = db.get('deviceRegistrations', 'A');
    expect(doc?.nearbyState).toEqual(nearbyState);
    expect(doc?.routeRules).toEqual(rules);
  });

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

  it('sweeps legacy rows for a Character the marked device newly adds', async () => {
    const db = new FakeFirestore();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    // Character 2's legacy rows come from a device that has not upgraded yet.
    const legacy = { ...row('industryJobComplete'), occurrenceKey: '2:job:1' };
    db.seed('projections', legacy.occurrenceKey, {
      ...legacy,
      characterId: 2,
      fired: false,
      firedAt: null,
    });

    await upload(db, 'A', [
      { characterId: CHAR, rows: [] },
      { characterId: 2, rows: [legacy] },
    ]);

    expect(db.get('projections', legacy.occurrenceKey)).toBeUndefined();
    expect(unfiredRowsOf(db, 'A')).toEqual([projectionDocId('A', legacy.occurrenceKey)]);
  });

  it('still sweeps on the retry when the first per-device upload failed part-way', async () => {
    const db = new FakeFirestore();
    const legacy = row('industryJobComplete');
    const legacyOther = row('planetExtractorExpired');
    for (const r of [legacy, legacyOther]) {
      db.seed('projections', r.occurrenceKey, {
        ...r,
        characterId: CHAR,
        fired: false,
        firedAt: null,
      });
    }
    db.failCommits = 1;

    await expect(upload(db, 'A', [{ characterId: CHAR, rows: [legacy] }])).rejects.toThrow();
    // The registration landed without the marker, so the retry still sweeps.
    expect(db.get('deviceRegistrations', 'A')?.perDeviceProjections).toBeUndefined();

    await upload(db, 'A', [{ characterId: CHAR, rows: [legacy] }]);

    expect(db.get('projections', legacy.occurrenceKey)).toBeUndefined();
    expect(db.get('projections', legacyOther.occurrenceKey)).toBeUndefined();
    expect(db.get('deviceRegistrations', 'A')?.perDeviceProjections).toBe(true);
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

  it('keeps the registration when FCM rejects the payload rather than the token', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    messaging.failures.set('token-A', 'messaging/invalid-argument');
    await upload(db, 'A', [{ characterId: CHAR, rows: [due] }]);

    await dispatchDueProjections(asFirestore(db), messaging, NOW, () => {});

    expect(db.get('deviceRegistrations', 'A')).toBeDefined();
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

// The Firestore queries in `dispatchDueProjections` and `purgeFiredProjections` re-express `isDue` and
// `isPastRetention` as `where` filters (a query cannot call them), so these
// pin each query's boundary to the function it mirrors.
describe('dispatchDueProjections query boundaries', () => {
  it.each([-1, 0, 1])(
    'dispatches a row exactly when isDue says so (fireAt = now %i)',
    async (d) => {
      const db = new FakeFirestore();
      const messaging = new FakeMessaging();
      const r = row('industryJobComplete', NOW + d);
      await upload(db, 'A', [{ characterId: CHAR, rows: [r] }]);

      await dispatchDueProjections(asFirestore(db), messaging, NOW);

      expect(messaging.sent.length > 0).toBe(isDue(r, NOW));
    }
  );

  it.each([-1, 0, 1])(
    'purges a fired row exactly when isPastRetention says so (age = retention %i)',
    async (d) => {
      const db = new FakeFirestore();
      const r = row('industryJobComplete', NOW - 60_000);
      await upload(db, 'A', [{ characterId: CHAR, rows: [r] }]);
      await dispatchDueProjections(asFirestore(db), new FakeMessaging(), NOW);
      const id = projectionDocId('A', r.occurrenceKey);
      expect(db.get('projections', id)).toMatchObject({ fired: true, firedAt: NOW });

      const later = NOW + FIRED_RETENTION_MS + d;
      await purgeFiredProjections(asFirestore(db), later);

      expect(db.get('projections', id) === undefined).toBe(isPastRetention(NOW, later));
    }
  );
});

describe('dispatchDueProjections paging and lookups', () => {
  function seedLegacy(db: FakeFirestore, key: string, fireAt: number, characterId = CHAR): void {
    db.seed('projections', key, {
      ...row('industryJobComplete', fireAt),
      occurrenceKey: key,
      characterId,
      fired: false,
      firedAt: null,
    });
  }

  it('reads due rows a page at a time, oldest first, until the backlog is clear', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    for (let i = 0; i < 5; i += 1) seedLegacy(db, `k${i}`, NOW - 10_000 + i);

    db.queryGets = [];
    await dispatchDueProjections(asFirestore(db), messaging, NOW, () => {}, { pageSize: 2 });

    expect(messaging.sent).toHaveLength(5);
    // 2 + 2 + 1: the short last page ends the run.
    expect(db.queryGets.filter((n) => n === 'projections')).toHaveLength(3);
  });

  it('stops after maxPasses and leaves the rest of the backlog for the next tick', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    for (let i = 0; i < 5; i += 1) seedLegacy(db, `k${i}`, NOW - 10_000 + i);

    db.queryGets = [];
    await dispatchDueProjections(asFirestore(db), messaging, NOW, () => {}, {
      pageSize: 2,
      maxPasses: 2,
    });

    expect(messaging.sent).toHaveLength(4);
    expect(db.get('projections', 'k4')?.fired).toBe(false);
  });

  it('does not re-read a row left unfired by a transient send failure', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    messaging.failures.set('token-A', 'messaging/internal-error');
    for (let i = 0; i < 3; i += 1) seedLegacy(db, `k${i}`, NOW - 10_000 + i);

    db.queryGets = [];
    await dispatchDueProjections(asFirestore(db), messaging, NOW, () => {}, { pageSize: 2 });

    expect(db.queryGets.filter((n) => n === 'projections')).toHaveLength(2);
    expect(db.get('projections', 'k0')?.fired).toBe(false);
  });

  it('looks up the devices holding a Character once per run, not once per legacy row', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    for (let i = 0; i < 4; i += 1) seedLegacy(db, `k${i}`, NOW - 10_000 + i);
    seedLegacy(db, 'other', NOW - 5_000, 2);

    db.queryGets = [];
    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toHaveLength(4);
    // One due query + one holder lookup per distinct Character (1 and 2).
    expect(db.queryGets.filter((n) => n === 'deviceRegistrations')).toHaveLength(2);
  });

  it('stops sending to a device that FCM reported dead within the same run', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upload(db, 'A', [{ characterId: CHAR, rows: [] }]);
    messaging.failures.set('token-A', 'messaging/registration-token-not-registered');
    for (let i = 0; i < 3; i += 1) seedLegacy(db, `k${i}`, NOW - 10_000 + i);

    db.queryGets = [];
    await dispatchDueProjections(asFirestore(db), messaging, NOW, () => {}, { pageSize: 1 });

    expect(db.ids('deviceRegistrations')).toEqual([]);
    expect(messaging.sent).toHaveLength(0);
  });
});

describe('purgeFiredProjections', () => {
  it('purges in bounded pages and says when a backlog is left for the next day', async () => {
    const db = new FakeFirestore();
    const old = NOW - FIRED_RETENTION_MS - 1;
    for (let i = 0; i < 5; i += 1) db.seed('projections', `r${i}`, { fired: true, firedAt: old });
    db.seed('projections', 'recent', { fired: true, firedAt: NOW });
    expect(
      await purgeFiredProjections(asFirestore(db), NOW, { pageSize: 2, maxPasses: 2 })
    ).toEqual({ deleted: 4, truncated: true });
    expect(
      await purgeFiredProjections(asFirestore(db), NOW, { pageSize: 2, maxPasses: 2 })
    ).toEqual({ deleted: 1, truncated: false });
    expect(db.ids('projections')).toEqual(['recent']);
  });
});

describe('quiet time (issue #4566)', () => {
  const due = row('industryJobComplete', NOW - 60_000);
  const hour = new Date(NOW).getUTCHours();
  const hh = (h: number) => `${String((h + 24) % 24).padStart(2, '0')}:00`;
  const insideNow = (over: Record<string, unknown> = {}) => ({
    start: hh(hour - 1),
    end: hh(hour + 1),
    timeZone: 'UTC',
    allowAttacks: false,
    ...over,
  });
  const upWith = async (
    db: FakeFirestore,
    quietHours: Parameters<typeof writeDeviceRegistration>[1]['quietHours']
  ) =>
    writeDeviceRegistration(asFirestore(db), {
      deviceId: 'A',
      fcmToken: 'token-A',
      characterIds: [CHAR],
      projections: [{ characterId: CHAR, rows: [due] }],
      eveTypesByCharacter: {},
      quietHours,
    });

  it('stores the window, keeps it when an upload omits it, and drops it on null', async () => {
    const db = new FakeFirestore();
    await upWith(db, insideNow());
    expect(db.get('deviceRegistrations', 'A')?.quietHours).toEqual(insideNow());
    await upWith(db, undefined);
    expect(db.get('deviceRegistrations', 'A')?.quietHours).toEqual(insideNow());
    await upWith(db, null);
    expect(db.get('deviceRegistrations', 'A')?.quietHours).toBeUndefined();
  });

  it('does not push inside the window, and marks the row fired so it is not sent late', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upWith(db, insideNow());

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toEqual([]);
    expect(db.get('projections', projectionDocId('A', due.occurrenceKey))).toMatchObject({
      fired: true,
      firedAt: NOW,
    });
  });

  it('leaves a legacy row with no holder unfired so a later tick retries it', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    db.seed('projections', 'legacy', {
      characterId: CHAR,
      eventId: 'x',
      occurrenceKey: 'legacy',
      fireAt: NOW - 60_000,
      title: 't',
      body: 'b',
      fired: false,
      firedAt: null,
    });

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent).toEqual([]);
    expect(db.get('projections', 'legacy')).toMatchObject({ fired: false });
  });

  it('pushes outside the window', async () => {
    const db = new FakeFirestore();
    const messaging = new FakeMessaging();
    await upWith(db, insideNow({ start: hh(hour + 2), end: hh(hour + 3) }));

    await dispatchDueProjections(asFirestore(db), messaging, NOW);

    expect(messaging.sent.map((m) => m.token)).toEqual(['token-A']);
  });
});
