import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import {
  clearEmulator,
  emulatorDb as db,
  emulatorSuite,
  staggerTransactionRetries,
} from './testSupport/emulator.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { sweepVetting } from './vettingCleanup.js';
import {
  VETTING_DEFAULT_SETTINGS,
  VETTING_DRAFT_HOURS,
  VETTING_INVITES_MAX,
  VETTING_KEEP_DAYS,
  VETTING_OPEN_KEEP_DAYS,
  type VettingCharacterInput,
  type VettingDealing,
  type VettingParty,
  type VettingRawRow,
  type VettingRawSource,
} from './vettingEngine.js';
import type { VettingEsi } from './vettingEsi.js';
import { parseVettingSettingsPatch, type VettingHandle } from './vettingParse.js';
import { VETTING_SCOPES } from './vettingScopes.js';
import {
  addVettingCharacter,
  clearVettingCorpCache,
  createVettingInvite,
  declineVetting,
  decideVettingReview,
  getVettingCorp,
  getVettingOverview,
  getVettingRawRows,
  getVettingStatus,
  listMyVettingRequests,
  openVettingReview,
  removeVettingCharacter,
  recordVettingRequestMail,
  requestVettingReview,
  revokeVettingInvite,
  saveVettingSettings,
  startVetting,
  submitVetting,
  withdrawVetting,
  type VettingDeps,
} from './vettingStore.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';

const CORP = 98000001;
const BAD_CORP = 98000666;
const BAD_ALLIANCE = 99000666;
const T0 = Date.parse('2026-11-01T12:00:00Z');

const CEO = 1;
const DIRECTOR = 2;
const RECRUITER = 3;
const RECRUITER_2 = 4;
const MEMBER = 5;
const OUTSIDER = 6;
const DIRECTOR_ALT = 7;
const APPLICANT = 2_100_000_050;
const APPLICANT_ALT = 2_100_000_051;
const SPY = 2_100_000_066;
const STRANGER = 2_100_000_077;

let now = T0;
const identities = new Map<number, CorpIdentity>();
const owners = new Map<number, string>();
const sheets = new Map<number, VettingCharacterInput>();
const names = new Map<number, VettingParty>();
const homes = new Map<number, { corporationId: number; allianceId?: number }>();
const scopes = new Map<number, string[]>();
const rawOverride = new Map<number, Partial<Record<VettingRawSource, VettingRawRow[]>>>();
let rawChunkBytes: number | undefined;
const esiCalls: string[] = [];
const pushed: { token: string; data: Record<string, string> }[] = [];
let pushFails = false;

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
    const dealings = found.dealings.filter(
      (dealing) => dealing.source !== 'mail' || shared('esi-mail.read_mail.v1')
    );
    const rows = (source: string): VettingRawRow[] =>
      dealings
        .filter((dealing) => dealing.source === source)
        .map((dealing) => ({
          characterId,
          at: dealing.at,
          what: dealing.what,
          partyId: dealing.partyId,
          ...(dealing.amount === undefined ? {} : { amount: dealing.amount }),
        }));
    const over = rawOverride.get(characterId) ?? {};
    return {
      input: {
        ...found,
        missing: shared('esi-mail.read_mail.v1') ? [] : ['mail'],
        dealings,
      },
      raw: {
        wallet: over.wallet ?? rows('wallet'),
        contact: over.contact ?? rows('contact'),
        mail: over.mail ?? (shared('esi-mail.read_mail.v1') ? rows('mail') : []),
        contract: over.contract ?? rows('contract'),
        skills: over.skills ?? [],
        history: over.history ?? [],
      },
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
  rawChunkBytes,
  push: {
    send: async (message) => {
      if (pushFails) throw new Error('fcm down');
      pushed.push(message);
      return 'id';
    },
  },
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

const rawIds = async (id: string) =>
  (await reviewDoc(id).collection('rawRows').get()).docs.map((d) => d.id).sort();
const rawPage = (
  reviewId: string,
  by: number,
  source: VettingRawSource = 'wallet',
  cursor?: string
) =>
  getVettingRawRows(deps(), who(by), call(by), {
    reviewId,
    source,
    ...(cursor === undefined ? {} : { cursor }),
  });
async function rawAll(reviewId: string, by: number, source: VettingRawSource = 'wallet') {
  const rows: VettingRawRow[] = [];
  const parties: VettingParty[] = [];
  let pages = 0;
  for (let cursor: string | undefined; ;) {
    const page = await rawPage(reviewId, by, source, cursor);
    pages += 1;
    rows.push(...page.rows);
    parties.push(...page.parties);
    if (page.next === null) return { rows, parties, pages };
    cursor = page.next;
  }
}
const manyRows = (characterId: number, count: number): VettingRawRow[] =>
  Array.from({ length: count }, (_, n) => ({
    characterId,
    at: `2026-10-${String(1 + (n % 28)).padStart(2, '0')}T00:00:00Z`,
    what: 'player_donation',
    partyId: n % 3 === 0 ? 1_000_125 : n % 3 === 1 ? STRANGER : 2_100_009_999,
    amount: n,
  }));

const save = (patch: Record<string, unknown>, by = DIRECTOR) =>
  saveVettingSettings(deps(), who(by), call(by), parseVettingSettingsPatch({ patch }));
const turnOn = (patch: Record<string, unknown> = {}) => save({ on: true, ...patch });
const start = (id = APPLICANT, invite?: string) =>
  startVetting(deps(), {
    corporationId: CORP,
    accessToken: tok(id),
    ...(invite !== undefined ? { invite } : {}),
  });
const submit = (
  handle: VettingHandle,
  note = '',
  answers: { questionId: string; answer: string }[] = []
) => submitVetting(deps(), { ...handle, note, answers });
const overviewAs = (by: number) => getVettingOverview(deps(), who(by), call(by));
const invite = (label: string, by = RECRUITER) =>
  createVettingInvite(deps(), who(by), call(by), { label });
const revoke = (code: string, by = RECRUITER) =>
  revokeVettingInvite(deps(), who(by), call(by), { code });
const settingsDoc = () => corp().collection('vetting').doc('settings');
const device = (id: string, characterId: number, events: string[]) =>
  db
    .collection('deviceRegistrations')
    .doc(id)
    .set({
      fcmToken: `fcm-${id}`,
      characterIds: [characterId],
      serverEventsByCharacter: { [String(characterId)]: events },
    });
const open = (reviewId: string, by: number) =>
  openVettingReview(deps(), who(by), call(by), { reviewId });
const decide = (reviewId: string, by: number, decision: 'yes' | 'no', note = '') =>
  decideVettingReview(deps(), who(by), call(by), { reviewId, decision, note });
const request = (memberName: string, role = 'Director', by = DIRECTOR) =>
  requestVettingReview(deps(), who(by), call(by), { memberName, role });
const myRequests = (id: number) => listMyVettingRequests(deps(), who(id), { accessToken: tok(id) });

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
    clearVettingCorpCache();
    esiCalls.length = 0;
    pushed.length = 0;
    pushFails = false;
    for (const map of [identities, owners, sheets, names, homes, scopes, rawOverride]) map.clear();
    rawChunkBytes = undefined;
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
      welcome: '',
      minimums: { ageDays: 0, skillPoints: 0, characters: 1 },
      inviteOnly: false,
      inviteOk: true,
    });
    expect(await reason(getVettingCorp(deps(), { corporationId: 98000404 }))).toBe('unknown-corp');
    expect(await reason(start())).toBe('vetting-off');
    expect(esiCalls.filter((c) => c.startsWith('read:'))).toEqual([]);

    now = T0 + HOUR_MS - 1;
    expect(await getVettingCorp(deps(), { corporationId: CORP })).toMatchObject({
      name: 'Test Corp',
      on: false,
    });
    expect(await reason(getVettingCorp(deps(), { corporationId: 98000404 }))).toBe('unknown-corp');
    expect(esiCalls).toEqual([`corporation:${CORP}`, 'corporation:98000404']);
    now = T0 + HOUR_MS;
    await getVettingCorp(deps(), { corporationId: CORP });
    expect(esiCalls).toHaveLength(3);
    now = T0;

    await turnOn();
    esiCalls.length = 0;
    expect(await getVettingCorp(deps(), { corporationId: CORP })).toMatchObject({ on: true });
    expect(esiCalls).toEqual([]);
  });

  it('refuses a start when vetting was turned off while the character was read', async () => {
    await turnOn();
    const read = esi.readCharacter;
    esi.readCharacter = async (...args) => {
      await settingsDoc().update({ on: false });
      return read(...args);
    };
    try {
      expect(await reason(start())).toBe('vetting-off');
    } finally {
      esi.readCharacter = read;
    }
    expect((await corp().collection('vettingReviews').get()).size).toBe(0);
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
      deleteAt: T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS,
      expiresAt: T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS,
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

    expect(
      await reason(addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) }))
    ).toBe('wrong-state');
    expect(await getVettingStatus(deps(), handle)).toMatchObject({
      state: 'open',
      readAt: T0,
      deleteAt: T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS,
    });
  });

  it('treats a draft past its day as gone, before the sweep has run', async () => {
    await turnOn();
    const { handle } = await start();
    const reads = esiCalls.length;
    now = T0 + VETTING_DRAFT_HOURS * HOUR_MS - 1;
    expect((await getVettingStatus(deps(), handle)).state).toBe('draft');

    now = T0 + VETTING_DRAFT_HOURS * HOUR_MS;
    expect(await reason(getVettingStatus(deps(), handle))).toBe('bad-key');
    expect(
      await reason(addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) }))
    ).toBe('bad-key');
    expect(
      await reason(removeVettingCharacter(deps(), { ...handle, characterId: APPLICANT }))
    ).toBe('bad-key');
    expect(await reason(submit(handle))).toBe('bad-key');
    expect(esiCalls.length).toBe(reads);
    expect(await stored(handle.reviewId)).toMatchObject({ state: 'draft', reads: 1 });
    expect(await withdrawVetting(deps(), handle)).toEqual({});
    expect((await reviewDoc(handle.reviewId).get()).exists).toBe(false);
    expect(await inputIds(handle.reviewId)).toEqual([]);
  });

  it('drops what a member read into a request a day ago instead of using it', async () => {
    await turnOn();
    await request('Pilot 5');
    const [{ handle }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });

    now = T0 + VETTING_DRAFT_HOURS * HOUR_MS;
    const added = await addVettingCharacter(deps(), { ...handle, accessToken: tok(MEMBER) });
    expect(added.characters.map((c) => c.characterId)).toEqual([MEMBER]);
    expect(await inputIds(handle.reviewId)).toEqual([String(MEMBER)]);
    expect((await stored(handle.reviewId))?.expiresAt).toBe(now + VETTING_DRAFT_HOURS * HOUR_MS);

    now = T0 + 2 * VETTING_DRAFT_HOURS * HOUR_MS;
    expect(await reason(submit(handle))).toBe('no-characters');
    expect(await stored(handle.reviewId)).toMatchObject({
      state: 'requested',
      characters: [],
      expiresAt: T0 + 30 * DAY_MS,
    });
    expect(await inputIds(handle.reviewId)).toEqual([]);
    expect((await getVettingStatus(deps(), handle)).characters).toEqual([]);
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
    for (let i = 0; i < 10; i++) await start();
    expect(await reason(start())).toBe('rate-limited');
    now = T0 + DAY_MS;
    const last = await start();

    await reviewDoc(last.handle.reviewId).update({ reads: 30 });
    const reads = esiCalls.length;
    expect(
      await reason(addVettingCharacter(deps(), { ...last.handle, accessToken: tok(APPLICANT_ALT) }))
    ).toBe('rate-limited');
    expect(esiCalls.length).toBe(reads);

    await reviewDoc(last.handle.reviewId).update({ reads: 29 });
    const restore = staggerTransactionRetries();
    const both = await Promise.allSettled(
      [APPLICANT_ALT, STRANGER].map((id) =>
        addVettingCharacter(deps(), { ...last.handle, accessToken: tok(id) })
      )
    ).finally(restore);
    expect(both.map((out) => out.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(esiCalls.length).toBe(reads + 1);
    expect(await stored(last.handle.reviewId)).toMatchObject({ reads: 30 });
    expect((await stored(last.handle.reviewId))?.characters).toHaveLength(2);
  });

  it('shows the overview to a Director, the CEO and a Personnel_Manager only', async () => {
    await turnOn();
    const draft = await start(APPLICANT_ALT);
    const handle = await shared();

    const asDirector = await getVettingOverview(deps(), who(DIRECTOR), call(DIRECTOR));
    expect(asDirector.canConfigure).toBe(true);
    expect(asDirector.settings).toEqual({
      ...VETTING_DEFAULT_SETTINGS,
      on: true,
      watchlist: [],
      signOffs: { application: 1, promotion: 2 },
    });
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
    expect(await reason(getVettingOverview(deps(), who(MEMBER), call(DIRECTOR)))).toBe(
      'token-mismatch'
    );
    expect(await reason(open(handle.reviewId, MEMBER))).toBe('not-a-reviewer');
    expect(await reason(decide(handle.reviewId, MEMBER, 'yes'))).toBe('not-a-reviewer');
    expect(await reason(open(draft.handle.reviewId, DIRECTOR))).toBe('not-found');
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

    expect((await open(id, DIRECTOR)).barred).toBe(true);
    expect(await reason(decide(id, DIRECTOR, 'yes'))).toBe('barred');
    expect(await reason(decide(id, DIRECTOR_ALT, 'yes'))).toBe('barred');

    const first = await decide(id, RECRUITER, 'yes', 'first note');
    expect(first).toMatchObject({ state: 'open', signed: 1, needed: 2, yours: false });
    expect(await reason(decide(id, RECRUITER, 'yes'))).toBe('already-signed');
    owners.set(RECRUITER_2, ownerOf(RECRUITER));
    expect(await reason(decide(id, RECRUITER_2, 'yes'))).toBe('already-signed');
    owners.delete(RECRUITER_2);

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
    expect((await open(id, CEO)).signOffs[0]).toMatchObject({
      decision: 'yes',
      note: 'first note',
    });
  });

  it('keeps a review open after a no, so an open review says nothing of its sign-offs', async () => {
    await turnOn();
    await request('Pilot 5');
    const [{ handle }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(MEMBER) });
    await submit(handle);
    const id = handle.reviewId;

    now = T0 + 5;
    expect(await decide(id, RECRUITER, 'no', 'not this one')).toMatchObject({
      state: 'open',
      signed: 1,
      needed: 2,
      decidedAt: null,
      deleteAt: T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS,
    });
    const blind = await open(id, RECRUITER_2);
    expect(blind).toMatchObject({ state: 'open', signed: 1, yours: true });
    expect(blind.signOffs).toEqual([
      { characterId: RECRUITER, name: `Pilot ${RECRUITER}`, you: false, at: T0 + 5 },
    ]);
    expect(JSON.stringify(blind)).not.toContain('not this one');
    expect((await open(id, DIRECTOR)).signOffs[0]).not.toHaveProperty('decision');
    expect(await getVettingStatus(deps(), handle)).toMatchObject({
      state: 'open',
      decidedAt: null,
    });

    now = T0 + 9;
    expect(await decide(id, RECRUITER_2, 'yes')).toMatchObject({
      state: 'rejected',
      signed: 2,
      decidedAt: T0 + 9,
      deleteAt: T0 + 9 + VETTING_KEEP_DAYS * DAY_MS,
      signOffs: [
        { characterId: RECRUITER, decision: 'no', note: 'not this one' },
        { characterId: RECRUITER_2, you: true, decision: 'yes' },
      ],
    });
    expect((await stored(id))?.expiresAt).toBe(T0 + 9 + VETTING_KEEP_DAYS * DAY_MS);
  });

  it('keeps every row read, in chunks, past a submit, and pages them to an officer', async () => {
    await turnOn();
    rawChunkBytes = 3000;
    rawOverride.set(APPLICANT, {
      wallet: manyRows(APPLICANT, 120),
      mail: [
        {
          characterId: APPLICANT,
          at: 't',
          what: 'Sent',
          partyId: STRANGER,
          recipients: [STRANGER, SPY],
        },
      ],
    });
    const { handle } = await start();
    const id = handle.reviewId;
    const draftIds = await rawIds(id);
    expect(draftIds.length).toBeGreaterThan(3);
    expect(await inputIds(id)).toEqual([String(APPLICANT)]);
    expect(await reason(rawPage(id, RECRUITER))).toBe('not-found');

    await submit(handle);
    expect(await inputIds(id)).toEqual([]);
    expect(await rawIds(id)).toEqual(draftIds);
    const review = await stored(id);
    expect(review?.rawCounts).toEqual({
      wallet: 120,
      contact: 0,
      mail: 1,
      contract: 0,
      skills: 0,
      history: 0,
    });
    expect((await open(id, RECRUITER)).rawCounts).toEqual(review?.rawCounts);

    const first = await rawPage(id, RECRUITER);
    expect(first.next).not.toBeNull();
    expect(first).toMatchObject({ reviewId: id, source: 'wallet' });
    const all = await rawAll(id, RECRUITER);
    expect(all.pages).toBe(draftIds.filter((d) => d.includes('_wallet_')).length);
    expect(all.rows).toEqual(manyRows(APPLICANT, 120));
    expect(all.parties.map((p) => p.id).sort()).toContain(STRANGER);
    expect(all.parties.some((p) => p.id === 2_100_009_999)).toBe(false);
    const mail = await rawAll(id, RECRUITER, 'mail');
    expect(mail.rows).toHaveLength(1);
    expect(mail.rows[0]).toMatchObject({ what: 'Sent', recipients: [STRANGER, SPY] });
    expect(mail.parties.map((p) => p.id).sort()).toEqual([SPY, STRANGER].sort());
    expect(await rawPage(id, RECRUITER, 'contract')).toMatchObject({ rows: [], next: null });

    expect(
      ((await stored(id))?.log as { action: string; characterId: number }[]).filter(
        (entry) => entry.action === 'opened' && entry.characterId === RECRUITER
      )
    ).toHaveLength(1);

    expect(await reason(rawPage(id, RECRUITER, 'wallet', 'abc'))).toBe('bad-cursor');
    const absent = Buffer.from(`${STRANGER}:0`).toString('base64url');
    expect(await reason(rawPage(id, RECRUITER, 'wallet', absent))).toBe('bad-cursor');
    const past = Buffer.from(`${APPLICANT}:999`).toString('base64url');
    expect(await reason(rawPage(id, RECRUITER, 'wallet', past))).toBe('bad-cursor');
  });

  it('shows the rows to an officer only, never the subject or an account they were read from', async () => {
    await turnOn();
    names.set(RECRUITER, { id: RECRUITER, name: 'Pilot 3', category: 'character' });
    await request('Pilot 3');
    const [{ handle }] = await myRequests(RECRUITER);
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(RECRUITER) });
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });
    await submit(handle);
    const id = handle.reviewId;

    expect(await reason(rawPage(id, RECRUITER))).toBe('own-review');
    identities.set(APPLICANT_ALT, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    expect(await reason(rawPage(id, APPLICANT_ALT))).toBe('own-review');
    owners.set(RECRUITER_2, ownerOf(APPLICANT_ALT));
    expect(await reason(rawPage(id, RECRUITER_2))).toBe('own-review');
    owners.delete(RECRUITER_2);
    expect(await reason(rawPage(id, MEMBER))).toBe('not-a-reviewer');
    expect(await reason(rawPage(id, OUTSIDER))).toBe('wrong-corp');
    expect((await getVettingStatus(deps(), handle)).openedBy).toEqual([]);

    for (const by of [DIRECTOR, CEO, RECRUITER_2]) {
      expect((await rawPage(id, by, 'history')).next).toBeNull();
    }
    expect(JSON.stringify(await getVettingStatus(deps(), handle))).not.toContain('rawCounts');
  });

  it('replaces a re-read character rows, drops removed and unreferenced chunks', async () => {
    await turnOn();
    rawChunkBytes = 1500;
    rawOverride.set(APPLICANT, { wallet: manyRows(APPLICANT, 30) });
    const { handle } = await start();
    const id = handle.reviewId;
    const first = await rawIds(id);
    rawOverride.set(APPLICANT, { wallet: manyRows(APPLICANT, 5) });
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT) });
    const second = await rawIds(id);
    expect(second.filter((doc) => first.includes(doc))).toEqual([]);
    expect(second.length).toBeLessThan(first.length);

    rawOverride.set(APPLICANT_ALT, { wallet: manyRows(APPLICANT_ALT, 4) });
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });
    const both = await rawIds(id);
    expect(both.some((doc) => doc.startsWith(`${APPLICANT_ALT}_`))).toBe(true);
    await removeVettingCharacter(deps(), { ...handle, characterId: APPLICANT_ALT });
    expect(await rawIds(id)).toEqual(second);

    await reviewDoc(id)
      .collection('rawRows')
      .doc(`${APPLICANT}_deadbeef_wallet_0`)
      .set({ json: JSON.stringify(manyRows(APPLICANT, 2)), partiesJson: '[]' });
    await submit(handle);
    expect(await rawIds(id)).toEqual(second);
    expect((await rawAll(id, DIRECTOR)).rows).toEqual(manyRows(APPLICANT, 5));
    expect((await stored(id))?.rawCounts).toMatchObject({ wallet: 5 });
  });

  it('keeps working for a review stored before rows were kept', async () => {
    await turnOn();
    const handle = await shared();
    const id = handle.reviewId;
    for (const doc of (await reviewDoc(id).collection('rawRows').get()).docs)
      await doc.ref.delete();
    const review = (await stored(id))!;
    delete review.rawCounts;
    for (const character of review.characters) delete character.raw;
    await reviewDoc(id).set(review);
    const view = await open(id, RECRUITER);
    expect('rawCounts' in view).toBe(false);
    expect(await rawPage(id, RECRUITER)).toMatchObject({ rows: [], parties: [], next: null });
    await decide(id, RECRUITER, 'yes');
    expect(await sweepVetting(db, T0 + 30 * DAY_MS)).toMatchObject({ deleted: 1, failed: 0 });
  });

  it('deletes the rows with the review: withdraw, decline, a draft that expired, a decided review', async () => {
    await turnOn();
    for (const id of [APPLICANT, STRANGER, APPLICANT_ALT, MEMBER, SPY]) {
      rawOverride.set(id, { wallet: manyRows(id, 3) });
    }
    const draft = await start();
    expect((await rawIds(draft.handle.reviewId)).length).toBeGreaterThan(0);
    await withdrawVetting(deps(), draft.handle);
    expect(await rawIds(draft.handle.reviewId)).toEqual([]);
    const sent = await shared(STRANGER);
    expect((await rawIds(sent.reviewId)).length).toBeGreaterThan(0);
    await withdrawVetting(deps(), sent);
    expect(await rawIds(sent.reviewId)).toEqual([]);
    const kept = await shared(APPLICANT_ALT);
    const before = await rawIds(kept.reviewId);
    expect(await reason(withdrawVetting(deps(), { ...kept, key: 'x'.repeat(43) }))).toBe('bad-key');
    expect(await rawIds(kept.reviewId)).toEqual(before);

    await request('Pilot 5');
    const [{ handle: asked }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...asked, accessToken: tok(MEMBER) });
    expect((await rawIds(asked.reviewId)).length).toBeGreaterThan(0);
    await declineVetting(deps(), asked);
    expect(await rawIds(asked.reviewId)).toEqual([]);

    const old = await start(MEMBER);
    await request('Pilot 5');
    const [{ handle: again }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...again, accessToken: tok(MEMBER) });
    expect((await rawIds(old.handle.reviewId)).length).toBeGreaterThan(0);
    expect((await rawIds(again.reviewId)).length).toBeGreaterThan(0);
    await decide(kept.reviewId, RECRUITER, 'yes');
    const undecided = await shared(SPY);
    expect((await rawIds(undecided.reviewId)).length).toBeGreaterThan(0);
    await sweepVetting(db, T0 + VETTING_DRAFT_HOURS * HOUR_MS);
    expect(await rawIds(old.handle.reviewId)).toEqual([]);
    expect(await rawIds(again.reviewId)).toEqual([]);
    expect(await stored(again.reviewId)).toMatchObject({ state: 'requested', characters: [] });

    expect(await sweepVetting(db, T0 + 30 * DAY_MS - 1)).toMatchObject({ deleted: 0, failed: 0 });
    expect(await rawIds(kept.reviewId)).toEqual(before);
    expect(await sweepVetting(db, T0 + 30 * DAY_MS)).toMatchObject({ failed: 0 });
    expect((await reviewDoc(kept.reviewId).get()).exists).toBe(false);
    expect(await rawIds(kept.reviewId)).toEqual([]);
    expect((await rawIds(undecided.reviewId)).length).toBeGreaterThan(0);
    expect(await sweepVetting(db, T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS)).toMatchObject({
      failed: 0,
    });
    expect(await rawIds(undecided.reviewId)).toEqual([]);
  });

  it('does not serve the rows of a request or a declined request, only of a shared review', async () => {
    await turnOn();
    rawOverride.set(MEMBER, { wallet: manyRows(MEMBER, 5) });
    await request('Pilot 5');
    const [{ handle }] = await myRequests(MEMBER);
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(MEMBER) });
    expect((await rawIds(handle.reviewId)).length).toBeGreaterThan(0);
    expect(await reason(rawPage(handle.reviewId, DIRECTOR))).toBe('not-found');
    await submit(handle);
    expect((await rawPage(handle.reviewId, DIRECTOR)).rows).toHaveLength(5);

    await decide(handle.reviewId, RECRUITER, 'no');
    await decide(handle.reviewId, RECRUITER_2, 'no');
    await request('Pilot 5', 'Director', CEO);
    const [{ handle: second }] = await myRequests(MEMBER);
    await declineVetting(deps(), second);
    expect(await reason(rawPage(second.reviewId, DIRECTOR))).toBe('not-found');
  });

  it('leaves no chunk behind when writing them fails part way', async () => {
    await turnOn();
    rawChunkBytes = 1500;
    rawOverride.set(APPLICANT, { wallet: manyRows(APPLICANT, 300) });
    rawOverride.set(APPLICANT_ALT, { wallet: manyRows(APPLICANT_ALT, 300) });
    const failSecondBatch = () => {
      const original = Object.getPrototypeOf(db).batch as () => FirebaseFirestore.WriteBatch;
      let commits = 0;
      return vi.spyOn(Object.getPrototypeOf(db), 'batch').mockImplementation(function (
        this: unknown
      ) {
        const batch = original.call(this);
        const commit = batch.commit.bind(batch);
        batch.commit = async () => {
          commits += 1;
          if (commits === 2) throw new Error('write failed');
          return commit();
        };
        return batch;
      });
    };

    const spy = failSecondBatch();
    await expect(start()).rejects.toThrow('write failed');
    spy.mockRestore();
    const made = await corp().collection('vettingReviews').get();
    expect(made.size).toBe(1);
    expect(await rawIds(made.docs[0].id)).toEqual([]);

    const { handle } = await start(APPLICANT);
    const before = await rawIds(handle.reviewId);
    expect(before.length).toBeGreaterThan(10);
    const again = failSecondBatch();
    await expect(
      addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) })
    ).rejects.toThrow('write failed');
    again.mockRestore();
    expect(await rawIds(handle.reviewId)).toEqual(before);
  });

  it('keeps the rows of a review the sweep finds no longer due when it decides again', async () => {
    await turnOn();
    rawOverride.set(APPLICANT, { wallet: manyRows(APPLICANT, 3) });
    const handle = await shared();
    const before = await rawIds(handle.reviewId);
    expect(before.length).toBeGreaterThan(0);
    const original = db.runTransaction.bind(db);
    const spy = vi.spyOn(db, 'runTransaction').mockImplementationOnce(((fn: never, opts: never) =>
      reviewDoc(handle.reviewId)
        .update({ expiresAt: T0 + 200 * DAY_MS })
        .then(() => original(fn, opts))) as never);
    const result = await sweepVetting(db, T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS);
    spy.mockRestore();
    expect(result).toMatchObject({ deleted: 0, failed: 0 });
    expect((await reviewDoc(handle.reviewId).get()).exists).toBe(true);
    expect(await rawIds(handle.reviewId)).toEqual(before);
  });

  it('never shows a reviewer the report about themselves', async () => {
    await turnOn();
    names.set(RECRUITER, { id: RECRUITER, name: 'Pilot 3', category: 'character' });
    await request('Pilot 3');
    const [{ handle }] = await myRequests(RECRUITER);
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(RECRUITER) });
    await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });
    await submit(handle);
    const id = handle.reviewId;

    expect(await reason(open(id, RECRUITER))).toBe('own-review');
    expect(await reason(decide(id, RECRUITER, 'yes'))).toBe('own-review');
    identities.set(APPLICANT_ALT, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    expect(await reason(open(id, APPLICANT_ALT))).toBe('own-review');
    owners.set(RECRUITER_2, ownerOf(APPLICANT_ALT));
    expect(await reason(open(id, RECRUITER_2))).toBe('own-review');
    expect(await reason(decide(id, RECRUITER_2, 'yes'))).toBe('own-review');
    owners.delete(RECRUITER_2);

    expect(await stored(id)).toMatchObject({ state: 'open', signOffs: [] });
    expect((await getVettingStatus(deps(), handle)).openedBy).toEqual([]);
    const queue = await getVettingOverview(deps(), who(RECRUITER), call(RECRUITER));
    expect(queue.reviews).toMatchObject([{ id, state: 'open', yours: false }]);

    expect((await open(id, DIRECTOR)).barred).toBe(true);
    expect(await reason(decide(id, DIRECTOR, 'yes'))).toBe('barred');
    expect(await decide(id, RECRUITER_2, 'yes')).toMatchObject({ state: 'open', signed: 1 });
    expect(JSON.stringify(await open(id, CEO))).not.toContain(ownerOf(APPLICANT_ALT));
    expect(JSON.stringify(await getVettingStatus(deps(), handle))).not.toContain(
      ownerOf(APPLICANT_ALT)
    );
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

    const askedId = overview.reviews[0].id;
    const mailed = (by: number) =>
      recordVettingRequestMail(deps(), who(by), call(by), { reviewId: askedId });
    expect(await reason(mailed(RECRUITER_2))).toBe('not-asker');
    const afterMail = await mailed(RECRUITER);
    expect(afterMail.reviews[0]).toMatchObject({
      requestedBy: { characterId: RECRUITER },
      requestMail: { sentAt: T0 },
    });
    expect(await reason(mailed(RECRUITER))).toBe('mail-cooldown');

    expect(await myRequests(DIRECTOR)).toEqual([]);
    const [mine] = await myRequests(MEMBER);
    expect(mine.status).toMatchObject({
      kind: 'promotion',
      role: 'Fleet Commander',
      state: 'requested',
      requestedBy: { characterId: RECRUITER, name: `Pilot ${RECRUITER}` },
      characters: [],
    });
    const [again] = await myRequests(MEMBER);
    expect(again.handle.reviewId).toBe(mine.handle.reviewId);
    expect(await reason(getVettingStatus(deps(), mine.handle))).toBe('bad-key');
    expect((await getVettingStatus(deps(), again.handle)).state).toBe('requested');
    expect(
      await reason(listMyVettingRequests(deps(), who(MEMBER), { accessToken: tok(DIRECTOR) }))
    ).toBe('token-mismatch');

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
      ...VETTING_DEFAULT_SETTINGS,
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

    await save({ signOffs: { application: 2, promotion: 2 } });
    const handle = await shared();
    await save({ signOffs: { application: 1, promotion: 2 } });
    expect(await decide(handle.reviewId, RECRUITER, 'yes')).toMatchObject({
      state: 'open',
      needed: 2,
    });
  });

  it('sweeps stale drafts, requests, decided and undecided reviews and throttle counters', async () => {
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

    expect(await sweepVetting(db, T0 + VETTING_DRAFT_HOURS * HOUR_MS)).toEqual({
      deleted: 1,
      cleared: 1,
      throttles: 0,
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

    const throttles = async () =>
      (await corp().collection('vettingThrottle').get()).docs.map((d) => d.id).sort();
    expect(await throttles()).toEqual([APPLICANT, APPLICANT_ALT, STRANGER].map(String).sort());
    expect(await sweepVetting(db, T0 + 2 * DAY_MS - 1)).toMatchObject({ deleted: 0, throttles: 0 });
    expect(await sweepVetting(db, T0 + 2 * DAY_MS)).toMatchObject({ deleted: 0, throttles: 3 });
    expect(await throttles()).toEqual([]);

    expect(await sweepVetting(db, T0 + 30 * DAY_MS)).toMatchObject({ deleted: 2, cleared: 0 });
    expect(await ids()).toEqual([open_.reviewId]);
    const openGoes = T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS;
    expect(await sweepVetting(db, openGoes - 1)).toMatchObject({ deleted: 0 });
    expect(await ids()).toEqual([open_.reviewId]);
    expect(await sweepVetting(db, openGoes)).toMatchObject({ deleted: 1, failed: 0 });
    expect(await ids()).toEqual([]);
  });

  it('reads a settings document written before the newer settings as their defaults', async () => {
    await settingsDoc().set({
      on: true,
      watchlist: [],
      signOffs: { application: 1, promotion: 2 },
      corporationName: 'Test Corp',
      corporationTicker: 'TEST',
    });
    const seen = await overviewAs(DIRECTOR);
    expect(seen.settings).toEqual({ ...VETTING_DEFAULT_SETTINGS, on: true });
    expect(seen.invites).toEqual([]);
    expect(await getVettingCorp(deps(), { corporationId: CORP })).toMatchObject({
      on: true,
      welcome: '',
      inviteOnly: false,
      inviteOk: true,
    });
    const { handle, status } = await start();
    expect(status).toMatchObject({ contact: '', questions: [], answers: [], unmet: [] });
    expect(await submit(handle)).toMatchObject({ state: 'open', answers: [] });
  });

  it('saves the newer settings, keeps question ids, and gives a new question one', async () => {
    const first = await save({
      on: true,
      welcome: ' Welcome aboard ',
      contact: 'Ask Bob',
      questions: [
        { label: 'Why us?', required: true },
        { id: 'forged', label: 'Timezone?', required: false },
      ],
      minimums: { ageDays: 30, skillPoints: 9e12, characters: 0 },
      rejection: { wording: 'notNow', showReason: true },
      inviteOnly: true,
      notifyReviewers: false,
      mailDecision: false,
    });
    const [why, zone] = first.settings.questions;
    expect(first.settings).toMatchObject({
      welcome: 'Welcome aboard',
      contact: 'Ask Bob',
      questions: [
        { label: 'Why us?', required: true },
        { label: 'Timezone?', required: false },
      ],
      minimums: { ageDays: 30, skillPoints: 500_000_000, characters: 1 },
      rejection: { wording: 'notNow', showReason: true },
      inviteOnly: true,
      notifyReviewers: false,
      mailDecision: false,
    });
    expect(why.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(zone.id).not.toBe('forged');
    expect(zone.id).not.toBe(why.id);

    const second = await save({
      questions: [
        { id: zone.id, label: 'Your timezone?', required: true },
        { id: why.id, label: 'Why us?', required: true },
        { label: 'Anything else?', required: false },
      ],
    });
    expect(second.settings.questions.slice(0, 2)).toEqual([
      { id: zone.id, label: 'Your timezone?', required: true },
      { id: why.id, label: 'Why us?', required: true },
    ]);
    expect(second.settings).toMatchObject({ welcome: 'Welcome aboard', inviteOnly: true });
    expect(await reason(save({ welcome: 'x' }, RECRUITER))).toBe('role-required');
    expect(() => parseVettingSettingsPatch({ patch: { welcome: 'x'.repeat(601) } })).toThrow(
      HttpsError
    );
  });

  it('lets any reviewer hand out and revoke invites, up to the cap', async () => {
    await turnOn();
    expect(await reason(invite('Reddit', MEMBER))).toBe('not-a-reviewer');
    expect(await reason(invite('Reddit', OUTSIDER))).toBe('wrong-corp');
    const made = await invite('Reddit', RECRUITER);
    expect(made.invites).toEqual([
      {
        code: expect.stringMatching(/^[A-Za-z0-9_-]{12}$/),
        label: 'Reddit',
        createdBy: { characterId: RECRUITER, name: `Pilot ${RECRUITER}` },
        createdAt: T0,
        uses: 0,
      },
    ]);
    const two = await invite('Discord', CEO);
    expect(two.invites.map((held) => held.label)).toEqual(['Reddit', 'Discord']);
    expect(new Set(two.invites.map((held) => held.code)).size).toBe(2);
    expect((await save({ welcome: 'Hi' })).invites).toHaveLength(2);

    expect(await reason(revoke(made.invites[0].code, MEMBER))).toBe('not-a-reviewer');
    const left = await revoke(made.invites[0].code, DIRECTOR);
    expect(left.invites.map((held) => held.label)).toEqual(['Discord']);
    expect((await revoke(made.invites[0].code)).invites).toHaveLength(1);

    const full = Array.from({ length: VETTING_INVITES_MAX }, (_, i) => ({
      code: `code${String(i).padStart(8, '0')}`,
      label: `L${i}`,
      createdBy: { characterId: RECRUITER, name: 'Pilot 3' },
      createdAt: T0,
      uses: 0,
    }));
    await settingsDoc().update({ invites: full });
    expect(await reason(invite('One more'))).toBe('invites-full');
  });

  it('hands out an invite for a corp that has saved no settings yet', async () => {
    const made = await invite('Early');
    expect(made.invites).toHaveLength(1);
    expect(made.settings).toEqual(VETTING_DEFAULT_SETTINGS);
    const info = (code?: string) =>
      getVettingCorp(deps(), { corporationId: CORP, ...(code ? { invite: code } : {}) });
    expect(await info()).toMatchObject({ name: 'Test Corp', inviteOnly: false, inviteOk: true });
    await settingsDoc().update({ inviteOnly: true });
    expect(await info()).toMatchObject({ inviteOnly: true, inviteOk: false });
    expect(await info('wrongwrong12')).toMatchObject({ inviteOk: false });
    expect(await info(made.invites[0].code)).toMatchObject({ inviteOk: true });
    expect(await info()).toMatchObject({ inviteOk: false });
    expect(esiCalls).toEqual([`corporation:${CORP}`]);
  });

  it('starts an invite-only application only with a live code, counts it, and shows its label', async () => {
    const minimums = { ageDays: 90, skillPoints: 5_000_000, characters: 1 };
    await turnOn({ inviteOnly: true, welcome: 'Fly with us', minimums });
    const { invites } = await invite('Reddit');
    const code = invites[0].code;
    const info = await getVettingCorp(deps(), { corporationId: CORP, invite: code });
    expect(info).toMatchObject({
      inviteOnly: true,
      inviteOk: true,
      welcome: 'Fly with us',
      minimums,
    });
    expect(JSON.stringify(info)).not.toContain('Reddit');
    const closed = {
      corporationId: CORP,
      name: 'Test Corp',
      ticker: 'TEST',
      on: true,
      welcome: '',
      minimums: VETTING_DEFAULT_SETTINGS.minimums,
      inviteOnly: true,
      inviteOk: false,
    };
    expect(await getVettingCorp(deps(), { corporationId: CORP })).toEqual(closed);
    expect(await getVettingCorp(deps(), { corporationId: CORP, invite: 'wrongwrong12' })).toEqual(
      closed
    );

    expect(await reason(start())).toBe('invite-required');
    expect(await reason(start(APPLICANT, 'wrongwrong12'))).toBe('invite-required');
    expect(esiCalls.filter((c) => c.startsWith('read:'))).toEqual([]);

    const { handle, status } = await start(APPLICANT, code);
    expect(JSON.stringify(status)).not.toContain(code);
    expect(await stored(handle.reviewId)).toMatchObject({ invite: { code, label: 'Reddit' } });
    await start(APPLICANT_ALT, code);
    expect((await overviewAs(RECRUITER)).invites).toMatchObject([{ code, uses: 2 }]);

    await submit(handle);
    const seen = await overviewAs(RECRUITER);
    const row = seen.reviews.find((r) => r.id === handle.reviewId);
    expect(row?.invite).toBe('Reddit');
    const opened = await open(handle.reviewId, RECRUITER);
    expect(opened.invite).toBe('Reddit');
    expect(JSON.stringify(opened)).not.toContain(code);

    await revoke(code);
    expect(await reason(start(STRANGER, code))).toBe('invite-required');
    expect((await open(handle.reviewId, RECRUITER)).invite).toBe('Reddit');

    await save({ inviteOnly: false });
    const again = (await invite('Discord')).invites[0].code;
    const viaLink = await start(STRANGER, again);
    expect(await stored(viaLink.handle.reviewId)).toMatchObject({ invite: { label: 'Discord' } });
    const dead = await start(SPY, code);
    expect(await stored(dead.handle.reviewId)).not.toHaveProperty('invite');
    expect((await overviewAs(RECRUITER)).invites).toMatchObject([{ code: again, uses: 1 }]);
  });

  it('needs the required answers before a share, and keeps the settled ones', async () => {
    const { settings } = await turnOn({
      questions: [
        { label: 'Why us?', required: true },
        { label: 'Timezone?', required: false },
      ],
    });
    const [why, zone] = settings.questions;
    const { handle, status } = await start();
    expect(status.questions).toEqual(settings.questions);

    expect(await reason(submit(handle))).toBe('answers-required');
    expect(await reason(submit(handle, '', [{ questionId: zone.id, answer: 'EU' }]))).toBe(
      'answers-required'
    );
    expect(await reason(submit(handle, '', [{ questionId: why.id, answer: '   ' }]))).toBe(
      'answers-required'
    );
    expect(await stored(handle.reviewId)).toMatchObject({ state: 'draft' });
    expect(await inputIds(handle.reviewId)).toEqual([String(APPLICANT)]);

    const answers = [{ questionId: why.id, label: 'Why us?', answer: 'Friends fly here' }];
    const shared_ = await submit(handle, '', [
      { questionId: why.id, answer: ' Friends fly here ' },
      { questionId: 'not-a-question', answer: 'dropped' },
    ]);
    expect(shared_).toMatchObject({ state: 'open', answers });
    expect((await stored(handle.reviewId))?.answers).toEqual(answers);
    expect((await open(handle.reviewId, RECRUITER)).answers).toEqual(answers);

    await save({ questions: [{ id: why.id, label: 'Why join?', required: true }] });
    expect(await getVettingStatus(deps(), handle)).toMatchObject({
      questions: [{ id: why.id, label: 'Why join?', required: true }],
      answers,
    });

    await withdrawVetting(deps(), handle);
    expect(await stored(handle.reviewId)).toBeUndefined();
  });

  it('holds an application to the minimums, and a promotion to neither questions nor minimums', async () => {
    await turnOn({
      questions: [{ label: 'Why us?', required: true }],
      minimums: { ageDays: 365, skillPoints: 50_000_000, characters: 2 },
    });
    const { settings } = await overviewAs(DIRECTOR);
    const answer = [{ questionId: settings.questions[0].id, answer: 'Friends' }];
    sheets.set(APPLICANT, {
      ...sheet(APPLICANT),
      birthday: new Date(T0 - 30 * DAY_MS).toISOString(),
      skillPoints: 5_000_000,
    });
    const { handle, status } = await start();
    expect(status.unmet).toEqual(['ageDays', 'skillPoints', 'characters']);
    const refused = await submit(handle, '', answer).catch((e) => e);
    expect(refused).toBeInstanceOf(HttpsError);
    expect((refused as HttpsError).code).toBe('failed-precondition');
    expect((refused as HttpsError).details).toEqual({ reason: 'below-minimum' });
    expect((refused as HttpsError).message).toBe('ageDays,skillPoints,characters');

    const added = await addVettingCharacter(deps(), { ...handle, accessToken: tok(APPLICANT_ALT) });
    expect(added.unmet).toEqual([]);
    expect(await submit(handle, '', answer)).toMatchObject({ state: 'open', unmet: [] });

    const second = await start(STRANGER);
    expect(second.status.unmet).toEqual(['characters']);
    await save({ minimums: { ageDays: 0, skillPoints: 0, characters: 1 } });
    expect((await getVettingStatus(deps(), second.handle)).unmet).toEqual([]);
    await save({ minimums: { ageDays: 0, skillPoints: 0, characters: 5 } });

    await request('Pilot 5');
    const [{ handle: asked, status: askedStatus }] = await myRequests(MEMBER);
    expect(askedStatus).toMatchObject({ questions: [], unmet: [] });
    await addVettingCharacter(deps(), { ...asked, accessToken: tok(MEMBER) });
    expect(await submit(asked)).toMatchObject({ state: 'open', questions: [], answers: [] });
  });

  it('tells the pilot the contact once shared, and only the reasons written while the corp showed them', async () => {
    await turnOn({ contact: 'Ask Bob in Discord', signOffs: { application: 2, promotion: 2 } });
    const { handle, status } = await start();
    expect(status.contact).toBe('');
    expect((await submit(handle)).contact).toBe('Ask Bob in Discord');
    expect(await getVettingStatus(deps(), handle)).not.toHaveProperty('rejection');

    await decide(handle.reviewId, RECRUITER, 'no', 'Too new to the game');
    const closed = await decide(handle.reviewId, RECRUITER_2, 'yes', 'Seems fine to me');
    expect(closed.signOffs).toMatchObject([
      { decision: 'no', note: 'Too new to the game', reasonShown: false },
      { decision: 'yes', reasonShown: false },
    ]);
    expect((await stored(handle.reviewId))?.signOffs).toMatchObject([
      { reasonShown: false },
      { reasonShown: false },
    ]);
    expect(await getVettingStatus(deps(), handle)).toMatchObject({
      state: 'rejected',
      contact: 'Ask Bob in Discord',
      rejection: { wording: 'rejected', reasons: [] },
    });
    await save({ rejection: { wording: 'notNow', showReason: true } });
    const kept = await getVettingStatus(deps(), handle);
    expect(kept.rejection).toEqual({ wording: 'notNow', reasons: [] });
    expect(JSON.stringify(kept)).not.toContain('Too new');

    const later = await start(STRANGER);
    await submit(later.handle);
    const first = await decide(later.handle.reviewId, RECRUITER, 'no', 'Come back in a year');
    expect(first.signOffs).toMatchObject([{ note: 'Come back in a year', reasonShown: true }]);
    await decide(later.handle.reviewId, RECRUITER_2, 'yes', 'Seems fine to me');
    const told = await getVettingStatus(deps(), later.handle);
    expect(told.rejection).toEqual({ wording: 'notNow', reasons: ['Come back in a year'] });
    expect(JSON.stringify(told)).not.toContain('Seems fine');
    await save({ rejection: { wording: 'rejected', showReason: false } });
    expect((await getVettingStatus(deps(), later.handle)).rejection).toEqual({
      wording: 'rejected',
      reasons: ['Come back in a year'],
    });
  });

  it('records who the overview saw as a reviewer, and nobody it refused', async () => {
    const reviewers = async () =>
      (await corp().collection('vetting').doc('reviewers').get()).data()?.reviewers;
    expect(await reason(overviewAs(MEMBER))).toBe('not-a-reviewer');
    expect(await reviewers()).toBeUndefined();
    await overviewAs(RECRUITER);
    await overviewAs(DIRECTOR);
    expect(await reviewers()).toEqual({
      [`char:${RECRUITER}`]: { characterId: RECRUITER, ownerHash: `h${RECRUITER}`, lastSeenAt: T0 },
      [`char:${DIRECTOR}`]: { characterId: DIRECTOR, ownerHash: `h${DIRECTOR}`, lastSeenAt: T0 },
    });
    now = T0 + HOUR_MS;
    await overviewAs(RECRUITER);
    expect((await reviewers())[`char:${RECRUITER}`].lastSeenAt).toBe(T0);
    now = T0 + 30 * DAY_MS;
    await overviewAs(RECRUITER);
    expect(await reviewers()).toEqual({
      [`char:${RECRUITER}`]: {
        characterId: RECRUITER,
        ownerHash: `h${RECRUITER}`,
        lastSeenAt: now,
      },
    });
  });

  it('pushes a shared report once to each known reviewer device that chose it', async () => {
    await turnOn();
    await overviewAs(RECRUITER);
    await overviewAs(DIRECTOR);
    await device('recruiter', RECRUITER, ['vettingShared']);
    await device('director', DIRECTOR, ['newMail']);
    await device('member', MEMBER, ['vettingShared']);

    const { handle } = await start();
    expect(pushed).toEqual([]);
    await submit(handle);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].token).toBe('fcm-recruiter');
    expect(pushed[0].data).toMatchObject({
      characterId: String(RECRUITER),
      eventId: 'vettingShared',
      occurrenceKey: `${RECRUITER}:vettingShared:${CORP}:${handle.reviewId}`,
    });
    expect(JSON.parse(pushed[0].data.fire)).toEqual({
      eventId: 'vettingShared',
      characterId: RECRUITER,
      corporationId: CORP,
      reviewId: handle.reviewId,
      kind: 'application',
    });
    expect(JSON.stringify(pushed[0].data)).not.toContain(`Pilot ${APPLICANT}`);

    now = T0 + 30 * DAY_MS;
    pushed.length = 0;
    await submit((await start(STRANGER)).handle);
    expect(pushed).toEqual([]);
  });

  it('pushes nothing when the corp turned it off, and a failed push never fails the share', async () => {
    await turnOn({ notifyReviewers: false });
    await overviewAs(RECRUITER);
    await device('recruiter', RECRUITER, ['vettingShared']);
    await shared();
    expect(pushed).toEqual([]);

    await save({ notifyReviewers: true });
    pushFails = true;
    const { handle } = await start(STRANGER);
    expect(await submit(handle)).toMatchObject({ state: 'open' });
    expect(pushed).toEqual([]);
  });

  it("never pushes a report to a reviewer on the pilot's own account", async () => {
    await turnOn();
    owners.set(RECRUITER_2, ownerOf(APPLICANT));
    await overviewAs(RECRUITER);
    await overviewAs(RECRUITER_2);
    await device('recruiter', RECRUITER, ['vettingShared']);
    await device('own-alt', RECRUITER_2, ['vettingShared']);
    await shared();
    expect(pushed.map((message) => message.token)).toEqual(['fcm-recruiter']);
  });

  it('answers the pilot without the push when it takes longer than its budget', async () => {
    await turnOn();
    await overviewAs(RECRUITER);
    await device('recruiter', RECRUITER, ['vettingShared']);
    const { handle } = await start();
    const warned: string[] = [];
    const slow: VettingDeps = {
      ...deps(),
      push: { send: () => new Promise<string>(() => {}) },
      notifyBudgetMs: 50,
      logWarn: (message) => warned.push(message),
    };
    const status = await submitVetting(slow, { ...handle, note: '', answers: [] });
    expect(status).toMatchObject({ state: 'open' });
    expect(warned).toEqual(['vettingShared push timed out']);
  });
});
