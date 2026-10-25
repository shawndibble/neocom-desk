import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  deliverServerEvent,
  listPolledDevices,
  onCommunityChildCreated,
  onPledgeCreated,
} from './serverEventStore.js';
import type { PushSender } from './projectionStore.js';
import type { ServerEventFire } from './serverEvents.js';

// Just enough Firestore for this module: docs by path, `where` with
// array-contains / array-contains-any, get/update/delete.
type Data = Record<string, unknown>;
// Loose on purpose: the module under test only reaches these members.
type FakeDocRef = Record<string, unknown> & { id: string };
type FakeCollection = Record<string, unknown>;

class Fake {
  readonly docs = new Map<string, Data>();

  doc(path: string): FakeDocRef {
    const docs = this.docs;
    const collection = (name: string) => this.collection(`${path}/${name}`);
    return {
      id: path.split('/').pop()!,
      path,
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, data: () => data, get: (f: string) => data?.[f] };
      },
      async update(field: unknown, value: unknown) {
        const data = docs.get(path);
        if (!data) throw Object.assign(new Error('not found'), { code: 5 });
        const name = typeof field === 'string' ? field : String(field);
        docs.set(path, { ...data, [name]: value });
      },
      async delete() {
        docs.delete(path);
      },
      collection,
    };
  }

  collection(path: string): FakeCollection {
    const all = this.docs;
    const docRef = (p: string) => this.doc(p);
    const query = (filters: [string, string, unknown][]) => ({
      where(field: string, op: string, value: unknown) {
        return query([...filters, [field, op, value]]);
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...all.entries()]
          .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              const held = data[field];
              if (!Array.isArray(held)) return false;
              if (op === 'array-contains') return held.includes(value);
              return (value as unknown[]).some((v) => held.includes(v));
            })
          )
          .map(([p, data]) => ({ id: p.slice(prefix.length), data: () => data, ref: docRef(p) }));
        return { docs };
      },
    });
    return { ...query([]), doc: (id: string) => docRef(`${path}/${id}`) };
  }
}

const asDb = (fake: Fake) => fake as unknown as Firestore;

function sender() {
  const sent: { token: string; data: Record<string, string> }[] = [];
  const dead = new Set<string>();
  const send: PushSender = {
    async send(message) {
      if (dead.has(message.token)) {
        throw Object.assign(new Error('gone'), {
          code: 'messaging/registration-token-not-registered',
        });
      }
      sent.push(message);
      return 'id';
    },
  };
  return { send, sent, dead };
}

const NOW = Date.parse('2026-10-25T12:00:00Z');

const joinFire: ServerEventFire = {
  eventId: 'communityJoinRequest',
  characterId: 7,
  communityId: 'c1',
  communityName: 'Wing',
  uid: 'char:9',
  characterName: 'Nine',
  at: 1,
};

describe('deliverServerEvent', () => {
  it('pushes only to devices that enabled the event for that Character, outside quiet time', async () => {
    const db = new Fake();
    const events = { '7': ['communityJoinRequest'] };
    db.docs.set('deviceRegistrations/A', {
      fcmToken: 'a',
      characterIds: [7],
      serverEventsByCharacter: events,
    });
    db.docs.set('deviceRegistrations/B', {
      fcmToken: 'b',
      characterIds: [7],
      serverEventsByCharacter: { '7': ['shipLost'] },
    });
    db.docs.set('deviceRegistrations/C', {
      fcmToken: 'c',
      characterIds: [7],
      serverEventsByCharacter: events,
      quietHours: { start: '00:00', end: '23:59', timeZone: 'UTC', allowAttacks: true },
    });
    db.docs.set('deviceRegistrations/D', {
      fcmToken: 'd',
      characterIds: [8],
      serverEventsByCharacter: events,
    });
    const { send, sent } = sender();

    expect(await deliverServerEvent(asDb(db), send, joinFire, NOW)).toBe(1);
    expect(sent.map((s) => s.token)).toEqual(['a']);
    expect(sent[0].data.occurrenceKey).toBe('7:communityJoinRequest:c1:char:9:1');
  });

  it('deletes a device whose token is dead', async () => {
    const db = new Fake();
    db.docs.set('deviceRegistrations/A', {
      fcmToken: 'a',
      characterIds: [7],
      serverEventsByCharacter: { '7': ['communityJoinRequest'] },
    });
    const { send, dead } = sender();
    dead.add('a');
    await deliverServerEvent(asDb(db), send, joinFire, NOW);
    expect(db.docs.has('deviceRegistrations/A')).toBe(false);
  });
});

describe('listPolledDevices', () => {
  it('lists each device’s Characters with a polled event, with their inputs and readings', async () => {
    const db = new Fake();
    db.docs.set('deviceRegistrations/A', {
      fcmToken: 'a',
      characterIds: [7, 8],
      polledServerEvents: ['shipLost'],
      serverEventsByCharacter: { '7': ['shipLost'], '8': ['communityJoinRequest'] },
      serverInputsByCharacter: { '7': { shipLostMinimumIsk: 5 } },
      serverEventBaselines: { '7': { shipLossIds: [1] } },
    });
    db.docs.set('deviceRegistrations/B', {
      fcmToken: 'b',
      characterIds: [7],
      polledServerEvents: [],
    });
    expect(await listPolledDevices(asDb(db))).toEqual([
      {
        deviceId: 'A',
        fcmToken: 'a',
        characters: [
          {
            characterId: 7,
            events: ['shipLost'],
            inputs: { shipLostMinimumIsk: 5 },
            baseline: { shipLossIds: [1] },
          },
        ],
      },
    ]);
  });
});

describe('community triggers', () => {
  function seeded() {
    const db = new Fake();
    db.docs.set('communities/c1', { name: 'Wing', adminUid: 'char:7' });
    db.docs.set('deviceRegistrations/A', {
      fcmToken: 'a',
      characterIds: [7, 5],
      serverEventsByCharacter: {
        '7': ['communityJoinRequest', 'communityMemberJoined'],
        '5': ['communityRequestPledged'],
      },
    });
    return db;
  }

  it('pushes a join request and a new Member to the admin, and ignores other collections', async () => {
    const db = seeded();
    const { send, sent } = sender();
    const log = () => {};
    await onCommunityChildCreated(
      asDb(db),
      send,
      { communityId: 'c1', collection: 'requests', docId: 'char:9' },
      { characterName: 'Nine', requestedAt: 100 },
      NOW,
      log
    );
    await onCommunityChildCreated(
      asDb(db),
      send,
      { communityId: 'c1', collection: 'members', docId: 'char:9' },
      { characterName: 'Nine', joinedAt: 200 },
      NOW,
      log
    );
    await onCommunityChildCreated(
      asDb(db),
      send,
      { communityId: 'c1', collection: 'fittings', docId: 'x' },
      {},
      NOW,
      log
    );
    expect(sent.map((s) => s.data.occurrenceKey)).toEqual([
      '7:communityJoinRequest:c1:char:9:100',
      '7:communityMemberJoined:c1:char:9:200',
    ]);
  });

  it('pushes a Pledge to the requester, named from the roster', async () => {
    const db = seeded();
    db.docs.set('communities/c1/itemRequests/r1', {
      ownerUid: 'char:5',
      closed: false,
      expiresAt: NOW + 1000,
      notify: { app: true },
      lines: [{ name: 'Rifter' }],
    });
    db.docs.set('communities/c1/members/char:9', { characterName: 'Nine' });
    const { send, sent } = sender();
    await onPledgeCreated(
      asDb(db),
      send,
      { communityId: 'c1', requestId: 'r1', pledgerUid: 'char:9' },
      { updatedAt: { toMillis: () => 300 } },
      NOW,
      () => {}
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].data.occurrenceKey).toBe('5:communityRequestPledged:c1:r1:char:9:300');
    expect(JSON.parse(sent[0].data.fire)).toMatchObject({
      characterName: 'Nine',
      requestLabel: 'Rifter',
    });
  });
});
