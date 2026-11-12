// The vetting actions against the Firestore emulator. Runs only under the emulator
// (`npm run test:emulator`); a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { sweepVetting } from './vettingCleanup.js';
import {
  VETTING_DRAFT_HOURS,
  VETTING_KEEP_DAYS,
  type VettingCharacterInput,
  type VettingDealing,
  type VettingParty,
} from './vettingEngine.js';
import type { VettingEsi } from './vettingEsi.js';
import { parseVettingSettingsPatch, type VettingHandle } from './vettingParse.js';
import { VETTING_SCOPES } from './vettingScopes.js';
import {
  addVettingCharacter,
  declineVetting,
  decideVettingReview,
  getVettingCorp,
  getVettingOverview,
  getVettingStatus,
  listMyVettingRequests,
  openVettingReview,
  removeVettingCharacter,
  requestVettingReview,
  saveVettingSettings,
  startVetting,
  submitVetting,
  withdrawVetting,
  type VettingDeps,
} from './vettingStore.js';
import { DAY_MS, HOUR_MS } from './vettingTypes.js';

const CORP = 98000001;
const BAD_CORP = 98000666;
const BAD_ALLIANCE = 99000666;
const T0 = Date.parse('2026-11-01T12:00:00Z');

const CEO = 1;
const DIRECTOR = 2;
const RECRUITER = 3; // Personnel_Manager
const RECRUITER_2 = 4;
const MEMBER = 5;
const OUTSIDER = 6;
/** A second character on the Director's EVE account. */
const DIRECTOR_ALT = 7;
const APPLICANT = 2_100_000_050;
const APPLICANT_ALT = 2_100_000_051;
const SPY = 2_100_000_066; // in BAD_CORP
const STRANGER = 2_100_000_077;

let now = T0;
const identities = new Map<number, CorpIdentity>();
const owners = new Map<number, string>();
const sheets = new Map<number, VettingCharacterInput>();
const names = new Map<number, VettingParty>();
const homes = new Map<number, { corporationId: number; allianceId?: number }>();
/** Scopes each token carries beside the roles scope; all five unless a test narrows them. */
const scopes = new Map<number, string[]>();
const esiCalls: string[] = [];

const ownerOf = (id: number) => owners.get(id) ?? `h${id}`;

function sheet(id: number, dealings: VettingDealing[] = []): VettingCharacterInput {
  return {
    characterId: id,
    name: `Pilot ${id}`,
    corporationId: homes.get(id)?.corporationId ?? CORP,
    birthday: '2015-01-01T00:00:00Z',
    skillPoints: 80_000_000,
    history: [{ corporationId: 1000001, startDate: '2015-01-01T00:00:00Z' }],
    dealings,
    skills: [],
    missing: [],
  };
}

const esi: VettingEsi = {
  readCharacter: async (characterId, accessToken, granted) => {
    esiCalls.push(`read:${characterId}:${accessToken}`);
    const found = sheets.get(characterId) ?? sheet(characterId);
    const shared = (scope: string) => granted.includes(scope);
    return {
      ...found,
      missing: shared('esi-mail.read_mail.v1') ? [] : ['mail'],
      dealings: found.dealings.filter(
        (dealing) => dealing.source !== 'mail' || shared('esi-mail.read_mail.v1')
      ),
    };
  },
  corporation: async (corporationId) => {
    esiCalls.push(`corporation:${corporationId}`);
    const found = names.get(corporationId);
    return found ? { name: found.name, ticker: 'TEST' } : null;
  },
  names: async (ids) => ids.flatMap((id) => (names.has(id) ? [{ ...names.get(id)! }] : [])),
  affiliations: async (ids) =>
    ids.flatMap((id) => (homes.has(id) ? [{ characterId: id, ...homes.get(id)! }] : [])),
  ids: async (wanted) =>
    [...names.values()].flatMap((party) =>
      party.category !== 'other' && wanted.some((w) => w.toLowerCase() === party.name.toLowerCase())
        ? [{ id: party.id, name: party.name, category: party.category }]
        : []
    ),
};

const deps = (): VettingDeps => ({
  db,
  now: () => now,
  verifyToken: async (token) => {
    const id = Number(/^tok-(\d+)$/.exec(token)?.[1]);
    if (!id) throw new Error('bad token');
    return {
      characterId: id,
      ownerHash: ownerOf(id),
      name: `Pilot ${id}`,
      scopes: [ROLES_SCOPE, ...(scopes.get(id) ?? VETTING_SCOPES)],
      clientId: 'c',
    };
  },
  readIdentity: async (characterId) => {
    const identity = identities.get(characterId);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  lookupCorporation: async (characterId) => homes.get(characterId)?.corporationId ?? CORP,
  esi,
});

const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: ownerOf(id) });
const call = (id: number) => parseBookCall({ corporationId: CORP, accessToken: `tok-${id}` });
const tok = (id: number) => `tok-${id}`;

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(((err as HttpsError).details as { reason?: string } | undefined)?.reason);
  }
  throw new Error('expected the call to fail');
}

const corp = () => db.collection('corps').doc(String(CORP));
const reviewDoc = (id: string) => corp().collection('vettingReviews').doc(id);
const stored = async (id: string) => (await reviewDoc(id).get()).data();
const inputIds = async (id: string) =>
  (await reviewDoc(id).collection('inputs').get()).docs.map((d) => d.id).sort();

const save = (patch: Record<string, unknown>, by = DIRECTOR) =>
  saveVettingSettings(deps(), who(by), call(by), parseVettingSettingsPatch({ patch }));
const turnOn = (patch: Record<string, unknown> = {}) => save({ on: true, ...patch });
const start = (id = APPLICANT) =>
  startVetting(deps(), { corporationId: CORP, accessToken: tok(id) });
const submit = (handle: VettingHandle, note = '') => submitVetting(deps(), { ...handle, note });
const open = (reviewId: string, by: number) =>
  openVettingReview(deps(), who(by), call(by), { reviewId });
const decide = (reviewId: string, by: number, decision: 'yes' | 'no', note = '') =>
  decideVettingReview(deps(), who(by), call(by), { reviewId, decision, note });
const request = (memberName: string, role = 'Director', by = DIRECTOR) =>
  requestVettingReview(deps(), who(by), call(by), { memberName, role });
const myRequests = (id: number) => listMyVettingRequests(deps(), who(id), { accessToken: tok(id) });

/** An application shared with the corp, ready for sign-offs. */
async function shared(id = APPLICANT): Promise<VettingHandle> {
  const { handle } = await start(id);
  await submit(handle);
  return handle;
}

emulatorSuite('vetting (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    esiCalls.length = 0;
    for (const map of [identities, owners, sheets, names, homes, scopes]) map.clear();
    identities.set(CEO, { corporationId: CORP, ceoId: CEO, roles: [] });
    identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    identities.set(DIRECTOR_ALT, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    identities.set(RECRUITER, { corporationId: CORP, ceoId: CEO, roles: ['Personnel_Manager'] });
    identities.set(RECRUITER_2, { corporationId: CORP, ceoId: CEO, roles: ['Personnel_Manager'] });
    identities.set(MEMBER, { corporationId: CORP, ceoId: CEO, roles: ['Accountant'] });
    identities.set(OUTSIDER, { corporationId: 98000999, ceoId: null, roles: ['Director'] });
    owners.set(DIRECTOR_ALT, ownerOf(DIRECTOR));
    homes.set(APPLICANT, { corporationId: 98000050 });
    homes.set(APPLICANT_ALT, { corporationId: 98000050 });
    homes.set(SPY, { corporationId: BAD_CORP, allianceId: BAD_ALLIANCE });
    homes.set(STRANGER, { corporationId: 98000077 });
    const name = (id: number, text: string, category: VettingParty['category']) =>
      names.set(id, { id, name: text, category });
    name(CORP, 'Test Corp', 'corporation');
    name(98000050, 'Old Corp', 'corporation');
    name(98000077, 'Stranger Corp', 'corporation');
    name(BAD_CORP, 'Bad Corp', 'corporation');
    name(BAD_ALLIANCE, 'Bad Alliance', 'alliance');
    name(1000001, 'Doomheim', 'corporation');
    name(SPY, 'Spy', 'character');
    name(STRANGER, 'Stranger', 'character');
    name(MEMBER, 'Pilot 5', 'character');
    name(APPLICANT, 'Pilot 2100000050', 'character');
  });

  it('tells the public page whether a corp takes reports, and refuses a start when it does not', async () => {
    expect(await getVettingCorp(deps(), { corporationId: CORP })).toEqual({
      corporationId: CORP,
      name: 'Test Corp',
      ticker: 'TEST',
      on: false,
    });
    expect(await reason(getVettingCorp(deps(), { corporationId: 98000404 }))).toBe('unknown-corp');
    expect(await reason(start())).toBe('vetting-off');
    expect(esiCalls.filter((c) => c.startsWith('read:'))).toEqual([]);

    await turnOn();
    esiCalls.length = 0;
    expect(await getVettingCorp(deps(), { corporationId: CORP })).toMatchObject({ on: true });
    // The name is kept beside the settings, so the public page costs no ESI call.
    expect(esiCalls).toEqual([]);
  });

  it('starts a draft, adds, re-reads and removes characters', async () => {
    await turnOn();
    const { handle, status } = await start();
    expect(handle.corporationId).toBe(CORP);
    expect(status).toMatchObject({
      id: handle.reviewId,
      corporationName: 'Test Corp',
      corporationTicker: 'TEST',
      kind: 'application',
      state: 'draft',
      note: '',
      readAt: null,
      characters: [
        {
          characterId: APPLICANT,
          name: `Pilot ${APPLICANT}`,
          corporationName: 'Old Corp',
          missing: [],
        },
      ],
      openedBy: [],
    });
    expect(await inputIds(handle.reviewId)).toEqual([String(APPLICANT)]);

    scopes.set(APPLICANT_ALT, ['esi-skills.read_skills.v1']);
    const added = await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });
    expect(added.characters.map((c) => [c.characterId, c.missing])).toEqual([
      [APPLICANT, []],
      [APPLICANT_ALT, ['mail']],
    ]);

    // A re-read replaces the character in place.
    scopes.delete(APPLICANT_ALT);
    const again = await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });
    expect(again.characters.map((c) => [c.characterId, c.missing])).toEqual([
      [APPLICANT, []],
      [APPLICANT_ALT, []],
    ]);
    expect(await inputIds(handle.reviewId)).toEqual([String(APPLICANT), String(APPLICANT_ALT)]);

    const removed = await removeVettingCharacter(deps(), { ...handle, characterId: APPLICANT });
    expect(removed.characters.map((c) => c.characterId)).toEqual([APPLICANT_ALT]);
    expect(await inputIds(handle.reviewId)).toEqual([String(APPLICANT_ALT)]);
    expect((await stored(handle.reviewId))?.pilot).toMatchObject({ characterId: APPLICANT_ALT });

    // Never a token, and the key only as a hash.
    const kept = JSON.stringify([
      await stored(handle.reviewId),
      (await reviewDoc(handle.reviewId).collection('inputs').get()).docs.map((d) => d.data()),
    ]);
    expect(kept).not.toContain('tok-');
    expect(kept).not.toContain(handle.key);
  });

  it('needs the key, and gives a wrong key and a missing review the same answer', async () => {
    await turnOn();
    const { handle } = await start();
    const wrong = { ...handle, key: 'x'.repeat(43) };
    const gone = { ...handle, reviewId: 'nosuchreview0000000000' };
    expect(await reason(getVettingStatus(deps(), wrong))).toBe('bad-key');
    expect(await reason(getVettingStatus(deps(), gone))).toBe('bad-key');
    expect(
      await reason(addVettingCharacter(deps(), { ...wrong, accessToken: tok(APPLICANT_ALT) }))
    ).toBe('bad-key');
    expect(await reason(removeVettingCharacter(deps(), { ...wrong, characterId: APPLICANT }))).toBe(
      'bad-key'
    );
    expect(await reason(submit(wrong))).toBe('bad-key');
    expect(await reason(withdrawVetting(deps(), wrong))).toBe('bad-key');
    expect(await reason(declineVetting(deps(), wrong))).toBe('bad-key');
    // A wrong key costs no ESI read.
    expect(esiCalls.filter((c) => c.startsWith('read:'))).toHaveLength(1);
    expect((await getVettingStatus(deps(), handle)).state).toBe('draft');
  });

  it('runs the checks on submit, keeps only what the flags name, and deletes what was read', async () => {
    await turnOn({ addWatchNames: ['Bad Alliance'] });
    sheets.set(
      APPLICANT,
      sheet(APPLICANT, [
        {
          source: 'wallet',
          at: '2026-10-20T00:00:00Z',
          partyId: SPY,
          what: 'player_donation',
          amount: 250_000_000,
        },
        {
          source: 'wallet',
          at: '2026-10-21T00:00:00Z',
          partyId: STRANGER,
          what: 'player_donation',
          amount: 5,
        },
        // Named by nothing: ESI 404s it, and it is dropped.
        { source: 'mail', at: '2026-10-22T00:00:00Z', partyId: 2_100_009_999, what: 'mail' },
      ])
    );
    const { handle } = await start();
    expect(await reason(submit(handle, 'x'.repeat(10)).then(() => submit(handle)))).toBe(
      'wrong-state'
    );

    const review = await stored(handle.reviewId);
    expect(review).toMatchObject({
      state: 'open',
      note: 'x'.repeat(10),
      readAt: T0,
      expiresAt: null,
      signOffsNeeded: 1,
    });
    expect(review?.assessment.flags).toMatchObject([
      {
        check: 'watchlistIsk',
        severity: 'critical',
        characterIds: [APPLICANT],
        facts: { received: 250_000_000, sent: 0, rows: 1, partyId: SPY },
        evidenceTotal: 1,
      },
    ]);
    // The spy, and where the spy sits; not the stranger, who is on no flag.
    expect((review?.parties as VettingParty[]).map((p) => p.id).sort()).toEqual(
      [SPY, BAD_CORP, BAD_ALLIANCE].sort()
    );
    expect(review?.reportCharacters).toEqual([
      {
        characterId: APPLICANT,
        name: `Pilot ${APPLICANT}`,
        corporationId: 98000050,
        corporationName: 'Old Corp',
        birthday: '2015-01-01T00:00:00Z',
        skillPoints: 80_000_000,
        corporations: 1,
        missing: [],
      },
    ]);
    expect(review?.log.map((e: { action: string }) => e.action)).toEqual(['started', 'shared']);
    expect(await inputIds(handle.reviewId)).toEqual([]);
    expect(JSON.stringify(review)).not.toContain(String(STRANGER));

    // Shared: no more characters, and the pilot still reads their status.
    expect(
      await reason(addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) }))
    ).toBe('wrong-state');
    expect(await getVettingStatus(deps(), handle)).toMatchObject({ state: 'open', readAt: T0 });
  });

  it('will not share a report with no characters', async () => {
    await turnOn();
    const { handle } = await start();
    await removeVettingCharacter(deps(), { ...handle, characterId: APPLICANT });
    expect(await reason(submit(handle))).toBe('no-characters');
  });

  it('withdraw deletes the review and what was read, before and after a decision', async () => {
    await turnOn();
    const { handle } = await start();
    expect(await withdrawVetting(deps(), handle)).toEqual({});
    expect((await reviewDoc(handle.reviewId).get()).exists).toBe(false);
    expect(await inputIds(handle.reviewId)).toEqual([]);
    expect(await reason(getVettingStatus(deps(), handle))).toBe('bad-key');

    const decided = await shared();
    await decide(decided.reviewId, RECRUITER, 'no');
    await withdrawVetting(deps(), decided);
    expect((await reviewDoc(decided.reviewId).get()).exists).toBe(false);
  });

  it('limits drafts per character per day and reads per report', async () => {
    await turnOn();
    let last = await start();
    for (let i = 1; i < 10; i++) last = await start();
    expect(await reason(start())).toBe('rate-limited');
    now = T0 + DAY_MS;
    await start();

    await reviewDoc(last.handle.reviewId).update({ reads: 30 });
    const reads = esiCalls.length;
    expect(
      await reason(addVettingCharacter(deps(), { ...last.handle, accessToken: tok(APPLICANT_ALT) }))
    ).toBe('rate-limited');
    expect(esiCalls.length).toBe(reads);
  });

  it('shows the overview to a Director, the CEO and a Personnel_Manager only', async () => {
    await turnOn();
    const draft = await start(APPLICANT_ALT);
    const handle = await shared();

    const asDirector = await getVettingOverview(deps(), who(DIRECTOR), call(DIRECTOR));
    expect(asDirector.canConfigure).toBe(true);
    expect(asDirector.settings).toEqual({
      on: true,
      watchlist: [],
      signOffs: { application: 1, promotion: 2 },
    });
    // A draft is not with the corp yet.
    expect(asDirector.reviews.map((r) => r.id)).toEqual([handle.reviewId]);
    expect(asDirector.reviews[0]).toMatchObject({
      kind: 'application',
      state: 'open',
      characters: 1,
      flags: 0,
      signed: 0,
      needed: 1,
      yours: true,
    });
    expect((await getVettingOverview(deps(), who(CEO), call(CEO))).canConfigure).toBe(true);
    expect((await getVettingOverview(deps(), who(RECRUITER), call(RECRUITER))).canConfigure).toBe(
      false
    );

    expect(await reason(getVettingOverview(deps(), who(MEMBER), call(MEMBER)))).toBe(
      'not-a-reviewer'
    );
    expect(await reason(getVettingOverview(deps(), who(OUTSIDER), call(OUTSIDER)))).toBe(
      'wrong-corp'
    );
    // Another Character's token.
    expect(await reason(getVettingOverview(deps(), who(MEMBER), call(DIRECTOR)))).toBe(
      'token-mismatch'
    );
    expect(await reason(open(handle.reviewId, MEMBER))).toBe('not-a-reviewer');
    expect(await reason(decide(handle.reviewId, MEMBER, 'yes'))).toBe('not-a-reviewer');
    expect(await reason(open(draft.handle.reviewId, DIRECTOR))).toBe('not-found');
    // No officer record is written: nothing reads Firestore from a client.
    expect((await corp().listCollections()).map((c) => c.id).sort()).toEqual([
      'vetting',
      'vettingReviews',
      'vettingThrottle',
    ]);
  });

  it('logs an open once per reviewer per hour, where the pilot can see it', async () => {
    await turnOn();
    const handle = await shared();
    await open(handle.reviewId, RECRUITER);
    now = T0 + HOUR_MS - 1;
    await open(handle.reviewId, RECRUITER);
    await open(handle.reviewId, DIRECTOR);
    now = T0 + HOUR_MS;
    const view = await open(handle.reviewId, RECRUITER);
    expect(view.log.filter((e) => e.action === 'opened').map((e) => [e.characterId, e.at])).toEqual(
      [
        [RECRUITER, T0],
        [DIRECTOR, T0 + HOUR_MS - 1],
        [RECRUITER, T0 + HOUR_MS],
      ]
    );
    expect((await getVettingStatus(deps(), handle)).openedBy).toEqual([
      { name: `Pilot ${RECRUITER}`, at: T0 + HOUR_MS },
      { name: `Pilot ${DIRECTOR}`, at: T0 + HOUR_MS - 1 },
      { name: `Pilot ${RECRUITER}`, at: T0 },
    ]);
  });

  it('accepts an application on one yes and rejects on a no', async () => {
    await turnOn();
    const accepted = await shared();
    now = T0 + 5;
    expect(await decide(accepted.reviewId, RECRUITER, 'yes', 'fine')).toMatchObject({
      state: 'accepted',
      signed: 1,
      needed: 1,
      decidedAt: T0 + 5,
      deleteAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
      signOffs: [{ characterId: RECRUITER, you: true, decision: 'yes', note: 'fine' }],
    });
    expect(await reason(decide(accepted.reviewId, DIRECTOR, 'yes'))).toBe('not-open');
    expect(await getVettingStatus(deps(), accepted)).toMatchObject({
      state: 'accepted',
      decidedAt: T0 + 5,
      deleteAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
    });

    const rejected = await shared(APPLICANT_ALT);
    expect(await decide(rejected.reviewId, DIRECTOR, 'no')).toMatchObject({ state: 'rejected' });
    expect(await reason(decide('nosuchreview0000000000', DIRECTOR, 'no'))).toBe('not-found');
  });

  it('needs two people for a promotion, bars the requester, and keeps the second review blind', async () => {
    await turnOn();
    await request('Pilot 5');
    const [{ handle }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(MEMBER) });
    await submit(handle);
    const id = handle.reviewId;

    // The Director asked: neither that character nor another on the same account may sign.
    expect((await open(id, DIRECTOR)).barred).toBe(true);
    expect(await reason(decide(id, DIRECTOR, 'yes'))).toBe('barred');
    expect(await reason(decide(id, DIRECTOR_ALT, 'yes'))).toBe('barred');

    const first = await decide(id, RECRUITER, 'yes', 'first note');
    expect(first).toMatchObject({ state: 'open', signed: 1, needed: 2, yours: false });
    expect(await reason(decide(id, RECRUITER, 'yes'))).toBe('already-signed');
    // The same person on a second character of the same EVE account.
    owners.set(RECRUITER_2, ownerOf(RECRUITER));
    expect(await reason(decide(id, RECRUITER_2, 'yes'))).toBe('already-signed');
    owners.delete(RECRUITER_2);

    // Blind: the second reviewer sees that someone signed, not what they said.
    const blind = await open(id, RECRUITER_2);
    expect(blind.signOffs).toEqual([
      { characterId: RECRUITER, name: `Pilot ${RECRUITER}`, you: false, at: T0 },
    ]);
    expect(JSON.stringify(blind)).not.toContain('first note');

    const second = await decide(id, RECRUITER_2, 'yes', 'second note');
    expect(second).toMatchObject({
      state: 'accepted',
      signed: 2,
      signOffs: [
        { characterId: RECRUITER, you: false, decision: 'yes', note: 'first note' },
        { characterId: RECRUITER_2, you: true, decision: 'yes', note: 'second note' },
      ],
    });
    // Decided: every reviewer sees every decision.
    expect((await open(id, CEO)).signOffs[0]).toMatchObject({
      decision: 'yes',
      note: 'first note',
    });
  });

  it('asks a member for a review, which they find, answer or decline', async () => {
    await turnOn();
    expect(await reason(request('Nobody At All'))).toBe('unknown-name');
    expect(await reason(request('Stranger'))).toBe('not-a-member');
    expect(await reason(request('Pilot 5', 'Director', MEMBER))).toBe('not-a-reviewer');

    const overview = await request('pilot 5', 'Fleet Commander', RECRUITER);
    expect(overview.reviews).toMatchObject([
      {
        kind: 'promotion',
        role: 'Fleet Commander',
        state: 'requested',
        pilot: { characterId: MEMBER, name: 'Pilot 5', corporationName: 'Test Corp' },
        characters: 0,
        needed: 2,
        yours: false,
      },
    ]);
    expect(await reason(request('Pilot 5'))).toBe('already-requested');

    expect(await myRequests(DIRECTOR)).toEqual([]);
    const [mine] = await myRequests(MEMBER);
    expect(mine.status).toMatchObject({
      kind: 'promotion',
      role: 'Fleet Commander',
      state: 'requested',
      requestedBy: { characterId: RECRUITER, name: `Pilot ${RECRUITER}` },
      characters: [],
    });
    // Each listing hands out a fresh key; the one before it stops working.
    const [again] = await myRequests(MEMBER);
    expect(again.handle.reviewId).toBe(mine.handle.reviewId);
    expect(await reason(getVettingStatus(deps(), mine.handle))).toBe('bad-key');
    expect((await getVettingStatus(deps(), again.handle)).state).toBe('requested');
    // Another Character's token finds nothing of this member's.
    expect(
      await reason(listMyVettingRequests(deps(), who(MEMBER), { accessToken: tok(DIRECTOR) }))
    ).toBe('token-mismatch');

    // The request is about this member: an alt alone does not answer it.
    await addVettingCharacter(deps(), { ...again.handle, accessToken: tok(APPLICANT_ALT) });
    expect(await reason(submit(again.handle))).toBe('pilot-missing');
    expect((await stored(again.handle.reviewId))?.expiresAt).toBe(
      T0 + VETTING_DRAFT_HOURS * HOUR_MS
    );

    expect(await declineVetting(deps(), again.handle)).toEqual({});
    expect(await stored(again.handle.reviewId)).toMatchObject({
      state: 'declined',
      characters: [],
      expiresAt: T0 + 30 * DAY_MS,
    });
    expect(await inputIds(again.handle.reviewId)).toEqual([]);
    expect(await reason(declineVetting(deps(), again.handle))).toBe('wrong-state');
    expect(await myRequests(MEMBER)).toEqual([]);
    // Declined, so a new request may be made.
    await request('Pilot 5');
    expect(await myRequests(MEMBER)).toHaveLength(1);
  });

  it('refuses a request while vetting is off, and an application cannot be declined', async () => {
    expect(await reason(request('Pilot 5'))).toBe('vetting-off');
    await turnOn();
    const { handle } = await start();
    expect(await reason(declineVetting(deps(), handle))).toBe('wrong-state');
  });

  it('saves settings for a Director or the CEO only', async () => {
    expect(await reason(save({ on: true }, RECRUITER))).toBe('role-required');
    expect(await reason(save({ on: true }, MEMBER))).toBe('not-a-reviewer');

    const first = await save(
      { on: true, signOffs: { application: 0, promotion: 9 }, addWatchNames: ['bad corp', 'Spy'] },
      CEO
    );
    expect(first.settings).toEqual({
      on: true,
      signOffs: { application: 1, promotion: 3 },
      watchlist: [
        { id: BAD_CORP, name: 'Bad Corp', category: 'corporation' },
        { id: SPY, name: 'Spy', category: 'character' },
      ],
    });

    const err = await save({ addWatchNames: ['Bad Alliance', 'No Such Thing'] }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).details).toEqual({ reason: 'unknown-name' });
    expect((err as HttpsError).message).toContain('No Such Thing');

    const second = await save({ removeWatch: [BAD_CORP], addWatchNames: ['Bad Alliance', 'Spy'] });
    expect(second.settings).toMatchObject({
      on: true,
      signOffs: { application: 1, promotion: 3 },
      watchlist: [
        { id: SPY, name: 'Spy', category: 'character' },
        { id: BAD_ALLIANCE, name: 'Bad Alliance', category: 'alliance' },
      ],
    });

    const full = Array.from({ length: 200 }, (_, i) => ({
      id: 90_000_000 + i,
      name: `W${i}`,
      category: 'character',
    }));
    await corp().collection('vetting').doc('settings').update({ watchlist: full });
    expect(await reason(save({ addWatchNames: ['Spy'] }))).toBe('watchlist-full');

    // A review keeps the count it was shared under.
    await save({ signOffs: { application: 2, promotion: 2 } });
    const handle = await shared();
    await save({ signOffs: { application: 1, promotion: 2 } });
    expect(await decide(handle.reviewId, RECRUITER, 'yes')).toMatchObject({
      state: 'open',
      needed: 2,
    });
  });

  it('sweeps stale drafts, unanswered requests and decided reviews, and nothing else', async () => {
    await turnOn();
    const draft = await start(APPLICANT_ALT);
    const open_ = await shared();
    const decided = await shared(STRANGER);
    await decide(decided.reviewId, RECRUITER, 'yes');
    await request('Pilot 5');
    const [{ handle: asked }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...asked, accessToken: tok(MEMBER) });
    const ids = async () => (await corp().collection('vettingReviews').get()).docs.map((d) => d.id);
    const all = [draft.handle, open_, decided, asked].map((h) => h.reviewId).sort();

    expect(await sweepVetting(db, T0 + VETTING_DRAFT_HOURS * HOUR_MS - 1)).toMatchObject({
      deleted: 0,
      cleared: 0,
    });
    expect((await ids()).sort()).toEqual(all);

    // A day on: the draft goes; the request stays, without what was read into it.
    expect(await sweepVetting(db, T0 + VETTING_DRAFT_HOURS * HOUR_MS)).toEqual({
      deleted: 1,
      cleared: 1,
      failed: 0,
      truncated: false,
    });
    expect(await ids()).not.toContain(draft.handle.reviewId);
    expect(await inputIds(draft.handle.reviewId)).toEqual([]);
    expect(await stored(asked.reviewId)).toMatchObject({
      state: 'requested',
      characters: [],
      expiresAt: T0 + 30 * DAY_MS,
    });
    expect(await inputIds(asked.reviewId)).toEqual([]);

    // 30 days on: the request and the decided review go; the open one is never swept.
    expect(await sweepVetting(db, T0 + 30 * DAY_MS)).toMatchObject({ deleted: 2, cleared: 0 });
    expect(await ids()).toEqual([open_.reviewId]);
    expect(await sweepVetting(db, T0 + 400 * DAY_MS)).toMatchObject({ deleted: 0 });
    expect(await ids()).toEqual([open_.reviewId]);
  });
});
