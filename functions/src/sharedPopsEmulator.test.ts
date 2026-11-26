import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { beforeEach, expect, it } from 'vitest';
import type { Caller } from './actorAuth.js';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { OFFICER_WINDOW_MS } from './sharedPops.js';
import type { Affiliation } from './sharedPopsEsi.js';
import { ROLES_SCOPE } from './corpTaxBookEsi.js';
import type { OfficerAccess } from './corpTaxBook.js';
import { authorizeOfficer, editBookAs, type BookDeps } from './corpTaxBookStore.js';
import {
  linkSharedPopSurvey,
  listCommunityPopSharers,
  publishSharedPops,
  setCommunityPopBlock,
  sharedPopsFor,
  sharedPopSourcesRef,
  sharedPopsRef,
  sharingCommunities,
  stampEditorUse,
  stampFailedRoleCheck,
  type PopViewer,
} from './sharedPopsStore.js';

const BOOK = 98000001;
const ALLIANCE = 99000001;
const OWNER = 98000555;
const H = 3_600_000;
const START = '2026-11-10T00:00:00.000Z';
const ARRIVAL = '2026-11-15T00:00:00.000Z';
const DECAY = '2026-11-15T03:00:00.000Z';
let now = Date.parse(ARRIVAL) - 24 * H;

const OFFICER = 21;
const CORPMATE = 31;
const ALLY = 32;
const STRANGER = 33;
const FRIEND = 34;
const ADMIN = 41;

const affiliation: Record<number, Affiliation> = {
  [OFFICER]: { corporationId: BOOK, allianceId: ALLIANCE },
  [CORPMATE]: { corporationId: BOOK, allianceId: ALLIANCE },
  [ALLY]: { corporationId: 98000777, allianceId: ALLIANCE },
  [STRANGER]: { corporationId: 98000888, allianceId: null },
  [FRIEND]: { corporationId: 98000999, allianceId: null },
  [ADMIN]: { corporationId: 98000999, allianceId: null },
};

const publishDeps = () => ({
  db,
  now: () => now,
  corporationAlliance: async () => ALLIANCE,
});
const readDeps = () => ({
  db,
  now: () => now,
  affiliations: async (ids: readonly number[]) =>
    new Map(ids.flatMap((id) => (affiliation[id] ? [[id, affiliation[id]] as const] : []))),
});
const bookDeps = (): BookDeps => ({
  db,
  now: () => now,
  verifyToken: async () => {
    throw new Error('no tokens here');
  },
  readIdentity: async () => {
    throw new Error('no ESI here');
  },
});
const officerAccess = (roles: { canEdit: boolean }): OfficerAccess => ({
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: roles.canEdit,
  characterId: OFFICER,
  characterName: 'Officer',
  ownerHash: `h${OFFICER}`,
  corporationId: BOOK,
  roles: [roles.canEdit ? 'Accountant' : 'Junior_Accountant'],
  checkedAt: now,
  expiresAt: now + 24 * H,
});
const viewer = (id: number): PopViewer => ({ characterId: id, ownerHash: `h${id}` });
const caller = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const seen = async (id: number) =>
  (await sharedPopsFor(readDeps(), [viewer(id)])).map((p) => p.moonId).sort();

const book = () => db.collection('corps').doc(String(BOOK));
const setSharing = (sharing: Record<string, unknown>) =>
  book().collection('meta').doc('popSharing').set(sharing);

async function join(communityId: string, id: number) {
  await db
    .collection('communities')
    .doc(communityId)
    .collection('members')
    .doc(`char:${id}`)
    .set({ ownerHash: `h${id}`, characterName: `Pilot ${id}`, joinedAt: 0 });
  await db
    .collection('characters')
    .doc(`char:${id}`)
    .collection('communities')
    .doc(communityId)
    .set({ name: 'Ore', joinedAt: 0 });
}

emulatorSuite('Shared Pops', () => {
  beforeEach(async () => {
    await clearEmulator();
    now = Date.parse(ARRIVAL) - 24 * H;
    await book().set({
      corporationId: BOOK,
      active: true,
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' }],
      structureExpiryHours: {},
      lastSync: { at: now - H },
    });
    const pull = (structureId: number, moonId: number, extra: Record<string, unknown> = {}) =>
      book()
        .collection('extractions')
        .doc(`${structureId}_${Date.parse(START)}`)
        .set({
          id: `${structureId}_${Date.parse(START)}`,
          structureId,
          moonId,
          extractionStartTime: START,
          chunkArrivalTime: ARRIVAL,
          naturalDecayTime: DECAY,
          oreLines: [{ typeId: 45490, quantity: 1000 }],
          ...extra,
        });
    await pull(1000, 40001);
    await pull(2000, 40002, { sourceCorporationId: OWNER });
    await book()
      .collection('feeders')
      .doc(String(OWNER))
      .set({
        status: 'active',
        refineryStructures: { '2000': { name: 'Owner Athanor', solarSystemId: 30000144 } },
      });
    await setSharing({
      enabled: true,
      defaults: { audiences: [{ kind: 'corp' }], popTime: 'ready', showOre: true },
      moons: {
        '40002': {
          audiences: [{ kind: 'alliance' }, { kind: 'community', communityId: 'c1', name: 'Ore' }],
        },
      },
    });
    await db
      .collection('communities')
      .doc('c1')
      .set({ name: 'Ore', adminUid: `char:${ADMIN}` });
    await join('c1', ADMIN);
    await join('c1', FRIEND);
  });

  it('shows a pop to its audience and to nobody else', async () => {
    const doc = await publishSharedPops(publishDeps(), BOOK);
    expect(doc?.allianceId).toBe(ALLIANCE);
    expect(await seen(STRANGER)).toEqual([]);
    expect(await seen(CORPMATE)).toEqual([40001, 40002]);
    expect(await seen(ALLY)).toEqual([40002]);
    const [pop] = await sharedPopsFor(readDeps(), [viewer(ALLY)]);
    expect(pop).toMatchObject({
      id: `${BOOK}_2000_${Date.parse(START)}`,
      corporationId: BOOK,
      refineryName: 'Owner Athanor',
      solarSystemId: 30000144,
      popAt: ARRIVAL,
      ratePct: 10,
      ore: [{ typeId: 45490, quantity: 1000 }],
    });
    expect(pop).not.toHaveProperty('audiences');
  });

  it('counts any of the viewer’s Characters', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    const pops = await sharedPopsFor(readDeps(), [viewer(STRANGER), viewer(ALLY)]);
    expect(pops.map((p) => p.moonId)).toEqual([40002]);
  });

  it("takes a moon owner's pops away when it opts out", async () => {
    await book()
      .collection('feeders')
      .doc(String(OWNER))
      .update({ popSharingOptOut: { by: 5, at: now } });
    await publishSharedPops(publishDeps(), BOOK);
    expect(await seen(CORPMATE)).toEqual([40001]);
    expect(await seen(ALLY)).toEqual([]);
  });

  it("hides an opted-out or no longer handled moon owner's pops before any republish", async () => {
    await publishSharedPops(publishDeps(), BOOK);
    const feeder = book().collection('feeders').doc(String(OWNER));
    await feeder.update({ popSharingOptOut: { by: 5, at: now } });
    expect(await seen(CORPMATE)).toEqual([40001]);
    await feeder.update({ popSharingOptOut: FieldValue.delete(), status: 'removed' });
    expect(await seen(CORPMATE)).toEqual([40001]);
    await feeder.update({ status: 'active' });
    expect(await seen(CORPMATE)).toEqual([40001, 40002]);
  });

  it('hides every pop once sharing is off or the book inactive, before any republish', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await setSharing({ enabled: false });
    expect(await seen(CORPMATE)).toEqual([]);
    await setSharing({ enabled: true, defaults: { audiences: [{ kind: 'corp' }] } });
    await book().update({ active: false });
    expect(await seen(CORPMATE)).toEqual([]);
  });

  it('takes every pop away when sharing is turned off', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await setSharing({ enabled: false });
    expect(await publishSharedPops(publishDeps(), BOOK)).toBeNull();
    expect((await sharedPopsRef(db, BOOK).get()).exists).toBe(false);
    expect(await seen(CORPMATE)).toEqual([]);
  });

  it('takes a pop away from an audience removed from it', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await setSharing({
      enabled: true,
      defaults: { audiences: [{ kind: 'corp' }] },
      moons: { '40002': { audiences: [{ kind: 'corp' }] } },
    });
    await publishSharedPops(publishDeps(), BOOK);
    expect(await seen(ALLY)).toEqual([]);
    expect(await seen(CORPMATE)).toEqual([40001, 40002]);
  });

  it('shares into a Community only while an officer of the book is a Member there', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    expect(await seen(FRIEND)).toEqual([]);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - H);
    expect(await seen(FRIEND)).toEqual([]);
    await join('c1', OFFICER);
    expect(await seen(FRIEND)).toEqual([40002]);
    expect(Object.fromEntries(await sharingCommunities(readDeps(), BOOK, ['c1', 'c2']))).toEqual({
      c1: { officer: true, blocked: false },
      c2: { officer: false, blocked: false },
    });
  });

  it('drops the Community share 30 days after the last editing use, or on a failed role check', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await join('c1', OFFICER);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - OFFICER_WINDOW_MS);
    expect(await seen(FRIEND)).toEqual([]);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - H);
    expect(await seen(FRIEND)).toEqual([40002]);
    await stampFailedRoleCheck(db, BOOK, OFFICER, now);
    expect(await seen(FRIEND)).toEqual([]);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now + 1);
    expect(await seen(FRIEND)).toEqual([40002]);
  });

  it('drops the Community share at once when the officer leaves it or leaves the corporation', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await join('c1', OFFICER);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - H);
    expect(await seen(FRIEND)).toEqual([40002]);
    affiliation[OFFICER] = { corporationId: 98000888, allianceId: null };
    try {
      expect(await seen(FRIEND)).toEqual([]);
    } finally {
      affiliation[OFFICER] = { corporationId: BOOK, allianceId: ALLIANCE };
    }
    await db
      .collection('communities')
      .doc('c1')
      .collection('members')
      .doc(`char:${OFFICER}`)
      .delete();
    expect(await seen(FRIEND)).toEqual([]);
  });

  it("lets the Community's admin block a sharing corporation, and only the admin", async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await join('c1', OFFICER);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - H);
    expect((await listCommunityPopSharers(readDeps(), caller(ADMIN), 'c1')).sharers).toEqual([
      { corporationId: BOOK, sharing: true, blocked: false },
    ]);
    await expect(
      setCommunityPopBlock(
        db,
        caller(FRIEND),
        { communityId: 'c1', corporationId: BOOK, blocked: true },
        now
      )
    ).rejects.toThrow();
    await setCommunityPopBlock(
      db,
      caller(ADMIN),
      { communityId: 'c1', corporationId: BOOK, blocked: true },
      now
    );
    expect(await seen(FRIEND)).toEqual([]);
    expect(await seen(ALLY)).toEqual([40002]);
    expect((await listCommunityPopSharers(readDeps(), caller(ADMIN), 'c1')).sharers).toEqual([
      { corporationId: BOOK, sharing: true, blocked: true },
    ]);
    await setCommunityPopBlock(
      db,
      caller(ADMIN),
      { communityId: 'c1', corporationId: BOOK, blocked: false },
      now
    );
    expect(await seen(FRIEND)).toEqual([40002]);
  });

  it("keeps a sharer on the admin's list between extractions, and says when its pops show", async () => {
    await publishSharedPops(publishDeps(), BOOK);
    const sharers = async () =>
      (await listCommunityPopSharers(readDeps(), caller(ADMIN), 'c1')).sharers;
    expect(await sharers()).toEqual([{ corporationId: BOOK, sharing: false, blocked: false }]);
    await join('c1', OFFICER);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - H);
    now = Date.parse(DECAY) + 48 * H + 72 * H;
    expect(await publishSharedPops(publishDeps(), BOOK)).toBeNull();
    expect((await sharedPopsRef(db, BOOK).get()).exists).toBe(false);
    expect(await sharers()).toEqual([{ corporationId: BOOK, sharing: true, blocked: false }]);
    await setSharing({ enabled: false });
    await publishSharedPops(publishDeps(), BOOK);
    expect(await sharers()).toEqual([]);
  });

  it('stops showing an Alliance pop once the book leaves its alliance, before any republish', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await stampEditorUse(db, BOOK, viewer(OFFICER), now - H);
    expect(await seen(ALLY)).toEqual([40002]);
    affiliation[OFFICER] = { corporationId: BOOK, allianceId: null };
    try {
      expect(await seen(ALLY)).toEqual([]);
    } finally {
      affiliation[OFFICER] = { corporationId: BOOK, allianceId: ALLIANCE };
    }
  });

  it("cancels a pop's unfired Scheduled Push for its old time once the laser fires early", async () => {
    await publishSharedPops(publishDeps(), BOOK);
    const popId = `${BOOK}_1000_${Date.parse(START)}`;
    const row = (popAtMs: number, fired = false) => ({
      occurrenceKey: `sharedMoonPop:${popId}:${popAtMs}:0`,
      eventId: 'sharedMoonPop',
      fireAt: popAtMs,
      fired,
    });
    const projections = db.collection('projections');
    await projections.doc('dev1:old').set(row(Date.parse(ARRIVAL)));
    await projections.doc('dev1:fired').set(row(Date.parse(ARRIVAL) - H, true));
    await projections.doc('dev1:other').set({
      ...row(Date.parse(ARRIVAL)),
      occurrenceKey: `sharedMoonPop:${BOOK}_2000_${Date.parse(START)}:${Date.parse(ARRIVAL)}:0`,
    });
    const fired = '2026-11-14T06:00:00.000Z';
    await book()
      .collection('extractions')
      .doc(`1000_${Date.parse(START)}`)
      .update({ laserFiredAt: fired });
    now = Date.parse(fired) + H;
    await publishSharedPops(publishDeps(), BOOK);
    const left = (await projections.get()).docs.map((d) => d.id).sort();
    expect(left).toEqual(['dev1:fired', 'dev1:other']);
  });

  it('keeps an Expired pop three days, then drops it and publishes nothing once all are', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    now = Date.parse(DECAY) + 48 * H;
    expect(await seen(CORPMATE)).toEqual([40001, 40002]);
    expect(await publishSharedPops(publishDeps(), BOOK)).not.toBeNull();
    now = Date.parse(DECAY) + 48 * H + 72 * H;
    expect(await seen(CORPMATE)).toEqual([]);
    expect(await publishSharedPops(publishDeps(), BOOK)).toBeNull();
  });

  it('links a Survey started from a pop for its audience, and an officer link replaces it', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    const popId = `${BOOK}_1000_${Date.parse(START)}`;
    await db
      .collection('shares')
      .doc('abc234')
      .set({ type: 'survey', expiresAt: Timestamp.fromMillis(now + 24 * H) });
    await expect(
      linkSharedPopSurvey(readDeps(), caller(STRANGER), { popId, surveyId: 'abc234' })
    ).rejects.toThrow(/not shared with you/);
    await expect(
      linkSharedPopSurvey(readDeps(), caller(CORPMATE), { popId, surveyId: 'zzz999' })
    ).rejects.toThrow(/does not exist/);
    await linkSharedPopSurvey(readDeps(), caller(CORPMATE), { popId, surveyId: 'abc234' });
    const linked = (await sharedPopsFor(readDeps(), [viewer(CORPMATE)])).find(
      (p) => p.id === popId
    );
    expect(linked?.surveyId).toBe('abc234');
    await editBookAs(
      bookDeps(),
      officerAccess({ canEdit: true }),
      { corporationId: BOOK },
      { action: 'linkSurvey', extractionId: `1000_${Date.parse(START)}`, surveyId: 'def567' }
    );
    const after = (await sharedPopsFor(readDeps(), [viewer(CORPMATE)])).find((p) => p.id === popId);
    expect(after?.surveyId).toBe('def567');
  });

  it('links only an unlinked pop when asked to, and never overwrites a live link', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    const popId = `${BOOK}_1000_${Date.parse(START)}`;
    const expiresAt = Timestamp.fromMillis(now + 24 * H);
    await db.collection('shares').doc('abc234').set({ type: 'survey', expiresAt });
    await db.collection('shares').doc('def567').set({ type: 'survey', expiresAt });
    const linkedTo = async () =>
      (await sharedPopsFor(readDeps(), [viewer(CORPMATE)])).find((p) => p.id === popId)?.surveyId;
    await linkSharedPopSurvey(readDeps(), caller(CORPMATE), {
      popId,
      surveyId: 'abc234',
      onlyIfUnlinked: true,
    });
    expect(await linkedTo()).toBe('abc234');
    await expect(
      linkSharedPopSurvey(readDeps(), caller(CORPMATE), {
        popId,
        surveyId: 'def567',
        onlyIfUnlinked: true,
      })
    ).rejects.toMatchObject({ code: 'failed-precondition', message: 'already linked' });
    expect(await linkedTo()).toBe('abc234');
    await expect(
      linkSharedPopSurvey(readDeps(), caller(CORPMATE), {
        popId,
        surveyId: 'abc234',
        onlyIfUnlinked: true,
      })
    ).resolves.toEqual({ linked: true });
    await linkSharedPopSurvey(readDeps(), caller(CORPMATE), { popId, surveyId: 'def567' });
    expect(await linkedTo()).toBe('def567');
  });

  it('republishes when an officer turns sharing off through the edit callable', async () => {
    await publishSharedPops(publishDeps(), BOOK);
    await editBookAs(
      bookDeps(),
      officerAccess({ canEdit: true }),
      { corporationId: BOOK },
      { action: 'setPopSharing', enabled: false }
    );
    expect((await sharedPopsRef(db, BOOK).get()).exists).toBe(false);
    expect(await seen(CORPMATE)).toEqual([]);
  });

  it("stamps an editor's use of the book, and a failed role check when an edit is refused", async () => {
    const officerDoc = book().collection('officers').doc(`char:${OFFICER}`);
    const call = { corporationId: BOOK };
    await officerDoc.set(officerAccess({ canEdit: true }));
    await authorizeOfficer(bookDeps(), caller(OFFICER), call, 'view', { live: false });
    const stamped = (await sharedPopSourcesRef(db, BOOK).get()).get(`editors.char:${OFFICER}`);
    expect(stamped).toMatchObject({ characterId: OFFICER, ownerHash: `h${OFFICER}`, usedAt: now });

    now += 1;
    await officerDoc.set(officerAccess({ canEdit: false }));
    await expect(
      authorizeOfficer(bookDeps(), caller(OFFICER), call, 'edit', { live: false })
    ).rejects.toThrow();
    const failed = (await sharedPopSourcesRef(db, BOOK).get()).get(`editors.char:${OFFICER}`);
    expect(failed).toMatchObject({ usedAt: now - 1, failedAt: now });
  });

  it('reads the stamp at most hourly per officer, and never stamps a book with no Pop Sharing', async () => {
    const officerDoc = book().collection('officers').doc(`char:${OFFICER}`);
    const call = { corporationId: BOOK };
    await book().collection('meta').doc('popSharing').delete();
    await officerDoc.set(officerAccess({ canEdit: true }));
    await authorizeOfficer(bookDeps(), caller(OFFICER), call, 'view', { live: false });
    expect((await sharedPopSourcesRef(db, BOOK).get()).exists).toBe(false);
    expect((await officerDoc.get()).get('editorCheckedAt')).toBe(now);

    await setSharing({ enabled: true, defaults: { audiences: [{ kind: 'corp' }] } });
    const later = async (minutes: number) => {
      now += minutes * 60_000;
      await officerDoc.update({ checkedAt: now });
    };
    await later(30);
    await authorizeOfficer(bookDeps(), caller(OFFICER), call, 'view', { live: false });
    expect((await sharedPopSourcesRef(db, BOOK).get()).get(`editors.char:${OFFICER}`)).toBe(
      undefined
    );
    await later(31);
    await authorizeOfficer(bookDeps(), caller(OFFICER), call, 'view', { live: false });
    expect(
      (await sharedPopSourcesRef(db, BOOK).get()).get(`editors.char:${OFFICER}`)
    ).toMatchObject({ usedAt: now });
  });

  it('stamps the officer who turns sharing on, and the other editing officers', async () => {
    await setSharing({ enabled: false });
    const officers = book().collection('officers');
    await officers.doc('char:22').set({
      ...officerAccess({ canEdit: true }),
      characterId: 22,
      ownerHash: 'h22',
      checkedAt: now - 2 * H,
    });
    await officers.doc('char:23').set({
      ...officerAccess({ canEdit: false }),
      characterId: 23,
      ownerHash: 'h23',
    });
    await book().collection('meta').doc('scheduledSync').set({ status: 'active' });
    await editBookAs(
      bookDeps(),
      officerAccess({ canEdit: true }),
      { corporationId: BOOK },
      { action: 'setPopSharing', enabled: true }
    );
    expect(
      (await sharedPopSourcesRef(db, BOOK).get()).get(`editors.char:${OFFICER}`)
    ).toMatchObject({ characterId: OFFICER, ownerHash: `h${OFFICER}`, usedAt: now });
    const sources = await sharedPopSourcesRef(db, BOOK).get();
    expect(sources.get('editors.char:22')).toMatchObject({ usedAt: now - 2 * H });
    expect(sources.get('editors.char:23')).toBeUndefined();
  });

  it('keeps the stamp check time across a live role re-check', async () => {
    const officerDoc = book().collection('officers').doc(`char:${OFFICER}`);
    await officerDoc.set({ ...officerAccess({ canEdit: true }), editorCheckedAt: now });
    const live: BookDeps = {
      ...bookDeps(),
      verifyToken: async () =>
        ({
          characterId: OFFICER,
          ownerHash: `h${OFFICER}`,
          name: 'Officer',
          scopes: [ROLES_SCOPE],
          clientId: 'c',
        }) as never,
      readIdentity: async () => ({ corporationId: BOOK, ceoId: null, roles: ['Accountant'] }),
    };
    now += 20 * 60_000;
    await authorizeOfficer(
      live,
      caller(OFFICER),
      { corporationId: BOOK, accessToken: 'tok' },
      'view',
      { live: true }
    );
    const record = (await officerDoc.get()).data();
    expect(record).toMatchObject({ checkedAt: now, editorCheckedAt: now - 20 * 60_000 });
  });
});
