import { describe, expect, it } from 'vitest';
import {
  addVettingInvite,
  appendVettingLog,
  applyVettingSettingsPatch,
  decideSignOff,
  decideVettingSweep,
  hasExpiredInputs,
  isExpiredDraft,
  isSubject,
  liveVettingInvite,
  nextDraftSlot,
  openExpiry,
  pilotStatus,
  readVettingSettings,
  recallTimed,
  referencedPartyIds,
  rememberTimed,
  reportCharacter,
  reviewSummary,
  reviewView,
  seenVettingReviewer,
  shouldLogOpen,
  unknownWatchName,
  vettingInviteOk,
  vettingSharedRecipients,
  withoutCharacter,
  wireSettings,
  withoutInputs,
  withoutVettingInvite,
} from './vettingDecide.js';
import {
  VETTING_DEFAULT_SETTINGS,
  VETTING_INVITES_MAX,
  VETTING_KEEP_DAYS,
  VETTING_OPEN_KEEP_DAYS,
  type VettingAssessment,
  type VettingInvite,
} from './vettingEngine.js';
import {
  DAY_MS,
  HOUR_MS,
  VETTING_REVIEWER_DAYS,
  type StoredVettingReview,
  type StoredVettingSettings,
  type VettingActor,
} from './vettingTypes.js';

const T0 = Date.parse('2026-11-01T12:00:00Z');
const actor = (id: number, owner = `h${id}`): VettingActor => ({
  characterId: id,
  name: `Pilot ${id}`,
  uid: `char:${id}`,
  ownerHash: owner,
});

const review = (over: Partial<StoredVettingReview> = {}): StoredVettingReview => ({
  corporationId: 98000001,
  corporationName: 'Test Corp',
  corporationTicker: 'TEST',
  state: 'open',
  kind: 'promotion',
  pilot: { characterId: 50, name: 'Pilot 50', corporationName: 'Test Corp' },
  requestedBy: actor(1),
  keyHash: 'secret-hash',
  note: 'hello',
  characters: [
    {
      characterId: 50,
      name: 'Pilot 50',
      corporationId: 98000001,
      corporationName: 'Test Corp',
      missing: ['mail'],
      readAt: T0,
    },
  ],
  reads: 1,
  reportCharacters: [],
  parties: [],
  assessment: null,
  signOffs: [],
  log: [],
  signOffsNeeded: 2,
  createdAt: T0,
  readAt: T0,
  decidedAt: null,
  deleteAt: null,
  expiresAt: null,
  ...over,
});

const settingsOf = (over: Partial<StoredVettingSettings> = {}): StoredVettingSettings => ({
  ...readVettingSettings({}),
  ...over,
});

const invite = (code: string, over: Partial<VettingInvite> = {}): VettingInvite => ({
  code,
  label: `Label ${code}`,
  createdBy: { characterId: 2, name: 'Pilot 2' },
  createdAt: T0,
  uses: 0,
  ...over,
});

const decided = (r: StoredVettingReview, by: VettingActor, decision: 'yes' | 'no', at = T0) => {
  const out = decideSignOff(r, by, decision, `note ${by.characterId}`, at);
  if (!out.ok) throw new Error(out.reason);
  return out.review;
};

describe('decideSignOff', () => {
  it('refuses a review that is not open', () => {
    expect(decideSignOff(review({ state: 'requested' }), actor(2), 'yes', '', T0)).toEqual({
      ok: false,
      reason: 'not-open',
    });
  });

  it('bars the requester, on any character of the same account, and the pilot', () => {
    expect(decideSignOff(review(), actor(1), 'yes', '', T0)).toMatchObject({ reason: 'barred' });
    expect(decideSignOff(review(), actor(9, 'h1'), 'yes', '', T0)).toMatchObject({
      reason: 'barred',
    });
    expect(decideSignOff(review(), actor(50), 'yes', '', T0)).toMatchObject({ reason: 'barred' });
  });

  it('takes one sign-off per person, not per character', () => {
    const once = decided(review(), actor(2), 'yes');
    expect(once.state).toBe('open');
    expect(decideSignOff(once, actor(2), 'yes', '', T0)).toMatchObject({
      reason: 'already-signed',
    });
    expect(decideSignOff(once, actor(22, 'h2'), 'yes', '', T0)).toMatchObject({
      reason: 'already-signed',
    });
  });

  it('accepts when everyone the review needs has signed yes', () => {
    const twice = decided(decided(review(), actor(2), 'yes'), actor(3), 'yes', T0 + 5);
    expect(twice).toMatchObject({
      state: 'accepted',
      decidedAt: T0 + 5,
      deleteAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
      expiresAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
    });
    expect(twice.log.map((entry) => entry.action)).toEqual(['decided', 'decided']);
  });

  it('stays open after a no until everyone needed has signed, then rejects', () => {
    const open = review({ deleteAt: T0 + 9, expiresAt: T0 + 9 });
    const once = decided(open, actor(2), 'no');
    // Indistinguishable from a yes: still open, nothing decided, the submit's expiry kept.
    expect(once).toMatchObject({
      state: 'open',
      decidedAt: null,
      deleteAt: T0 + 9,
      expiresAt: T0 + 9,
    });
    expect({ ...once, signOffs: [] }).toEqual({
      ...decided(open, actor(2), 'yes'),
      signOffs: [],
    });

    expect(decided(once, actor(3), 'yes', T0 + 5)).toMatchObject({
      state: 'rejected',
      decidedAt: T0 + 5,
      deleteAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
      expiresAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
    });
    expect(decided(decided(open, actor(2), 'yes'), actor(3), 'no').state).toBe('rejected');
  });

  it('rejects on a single no when one sign-off is all the review needs', () => {
    expect(decided(review({ signOffsNeeded: 1 }), actor(2), 'no')).toMatchObject({
      state: 'rejected',
      decidedAt: T0,
      deleteAt: T0 + VETTING_KEEP_DAYS * DAY_MS,
    });
  });
});

describe('isSubject', () => {
  const read = { ...review().characters[0], characterId: 51, ownerHash: 'h51' };
  const about = review({
    characters: [read],
    reportCharacters: [
      {
        characterId: 52,
        name: 'Pilot 52',
        corporationId: 98000001,
        corporationName: 'Test Corp',
        birthday: '2015-01-01T00:00:00Z',
        skillPoints: null,
        corporations: 1,
        missing: [],
      },
    ],
  });

  it('is the pilot, a character read into the review or on its report', () => {
    expect(isSubject(about, actor(50))).toBe(true);
    expect(isSubject(about, actor(51))).toBe(true);
    expect(isSubject(about, actor(52))).toBe(true);
  });

  it('is another character of the account a read came from', () => {
    expect(isSubject(about, actor(60, 'h51'))).toBe(true);
  });

  it('is not the requester or anyone else', () => {
    expect(isSubject(about, actor(1))).toBe(false);
    expect(isSubject(about, actor(2))).toBe(false);
    // A read stored without its account matches by character only.
    expect(isSubject(review(), actor(60, 'h50'))).toBe(false);
  });
});

describe('reviewView', () => {
  it('hides another reviewer’s decision and note until the viewer has decided', () => {
    const once = decided(review({ signOffsNeeded: 3 }), actor(2), 'yes');
    const blind = reviewView('r1', once, actor(3));
    expect(blind.signOffs).toEqual([{ characterId: 2, name: 'Pilot 2', you: false, at: T0 }]);
    expect(blind.yours).toBe(true);

    const own = reviewView('r1', once, actor(2));
    expect(own.signOffs[0]).toMatchObject({ you: true, decision: 'yes', note: 'note 2' });
    expect(own.yours).toBe(false);

    const twice = decided(once, actor(3), 'yes');
    expect(reviewView('r1', twice, actor(3)).signOffs).toMatchObject([
      { you: false, decision: 'yes', note: 'note 2' },
      { you: true, decision: 'yes', note: 'note 3' },
    ]);
  });

  it('gives a no away no more than a yes while the review is open', () => {
    const open = review({ signOffsNeeded: 3 });
    const seen = (decision: 'yes' | 'no') => {
      const view = reviewView('r1', decided(open, actor(2), decision), actor(3));
      expect(view).toMatchObject({ state: 'open', signed: 1, needed: 3, yours: true });
      return JSON.stringify(view);
    };
    expect(seen('no')).toBe(seen('yes'));
    expect(seen('no')).not.toContain('note 2');
  });

  it('shows every decision once the review is decided', () => {
    const rejected = decided(decided(review(), actor(2), 'no'), actor(3), 'yes');
    expect(reviewView('r1', rejected, actor(4))).toMatchObject({
      state: 'rejected',
      signed: 2,
      signOffs: [
        { decision: 'no', note: 'note 2' },
        { decision: 'yes', note: 'note 3' },
      ],
    });
  });

  it('tells the requester they are barred, and never sends the key hash or an owner hash', () => {
    const view = reviewView('r1', decided(review(), actor(2), 'yes'), actor(1));
    expect(view.barred).toBe(true);
    expect(view.yours).toBe(false);
    expect(view.requestedBy).toEqual({ characterId: 1, name: 'Pilot 1' });
    const sent = JSON.stringify(view);
    expect(sent).not.toContain('secret-hash');
    expect(sent).not.toContain('"h1"');
    expect(sent).not.toContain('"h2"');
    expect(sent).not.toContain('char:');
  });
});

describe('reviewSummary', () => {
  it('counts flags, the worst of them, and checks that could not run', () => {
    const assessment: VettingAssessment = {
      flags: [
        {
          check: 'corpHopping',
          severity: 'warning',
          characterIds: [50],
          facts: {},
          evidence: [],
          evidenceTotal: 0,
        },
        {
          check: 'watchlistIsk',
          severity: 'critical',
          characterIds: [50],
          facts: {},
          evidence: [],
          evidenceTotal: 0,
        },
      ],
      checks: [
        { check: 'watchlistMail', state: 'missing', missingFor: [50] },
        { check: 'corpHopping', state: 'flag', missingFor: [] },
        { check: 'thinCharacter', state: 'clear', missingFor: [] },
      ],
    };
    expect(reviewSummary('r1', review({ assessment, role: 'Director' }), actor(2))).toEqual({
      id: 'r1',
      kind: 'promotion',
      role: 'Director',
      state: 'open',
      pilot: { characterId: 50, name: 'Pilot 50', corporationName: 'Test Corp' },
      characters: 1,
      flags: 2,
      worst: 'critical',
      missing: 1,
      signed: 0,
      needed: 2,
      yours: true,
      readAt: T0,
      createdAt: T0,
      decidedAt: null,
    });
  });
});

describe('what an officer sees of invites and answers', () => {
  it("shows the invite's label only, and the stored answers", () => {
    const answers = [{ questionId: 'q1', label: 'Why us?', answer: 'Friends' }];
    const held = review({ invite: { code: 'abcDEF123_-x', label: 'Reddit' }, answers });
    expect(reviewSummary('r1', held, actor(2)).invite).toBe('Reddit');
    const view = reviewView('r1', held, actor(2));
    expect(view.invite).toBe('Reddit');
    expect(view.answers).toEqual(answers);
    expect(JSON.stringify(view)).not.toContain('abcDEF123_-x');
    // A review stored before answers and invites existed.
    expect(reviewSummary('r1', review(), actor(2))).not.toHaveProperty('invite');
    expect(reviewView('r1', review(), actor(2)).answers).toEqual([]);
  });
});

describe('pilotStatus', () => {
  it('lists who opened the report, newest first, and nothing of the decision', () => {
    const log = [
      { at: T0, characterId: 2, name: 'Pilot 2', action: 'opened' as const },
      { at: T0 + 9, characterId: 3, name: 'Pilot 3', action: 'opened' as const },
      { at: T0 + 5, characterId: 2, name: 'Pilot 2', action: 'decided' as const },
    ];
    const status = pilotStatus('r1', decided(review({ log }), actor(2), 'yes'), settingsOf(), T0);
    expect(status).toMatchObject({
      id: 'r1',
      corporationName: 'Test Corp',
      corporationTicker: 'TEST',
      state: 'open',
      requestedBy: { characterId: 1, name: 'Pilot 1' },
      characters: [
        { characterId: 50, name: 'Pilot 50', corporationName: 'Test Corp', missing: ['mail'] },
      ],
      openedBy: [
        { name: 'Pilot 3', at: T0 + 9 },
        { name: 'Pilot 2', at: T0 },
      ],
    });
    expect(JSON.stringify(status)).not.toContain('note 2');
    expect(status).not.toHaveProperty('signOffs');
    expect(status).not.toHaveProperty('assessment');
    expect(status).not.toHaveProperty('rejection');
  });

  const asking = settingsOf({
    contact: 'Ask Bob',
    questions: [{ id: 'q1', label: 'Why us?', required: true }],
    minimums: { ageDays: 365, skillPoints: 5_000_000, characters: 2 },
  });
  const young = {
    characterId: 50,
    name: 'Pilot 50',
    corporationId: 98000001,
    corporationName: 'Test Corp',
    missing: [],
    readAt: T0,
    birthday: new Date(T0 - 10 * DAY_MS).toISOString(),
    skillPoints: 6_000_000,
  };

  it('tells a draft application what the corp asks and what is not met, but not the contact', () => {
    const draft = review({ kind: 'application', state: 'draft', characters: [young] });
    delete draft.requestedBy;
    expect(pilotStatus('r1', draft, asking, T0)).toMatchObject({
      contact: '',
      questions: asking.questions,
      answers: [],
      unmet: ['ageDays', 'characters'],
    });
    // Met a year on, with a second character.
    const two = { ...draft, characters: [young, { ...young, characterId: 51 }] };
    expect(pilotStatus('r1', two, asking, T0 + 365 * DAY_MS).unmet).toEqual([]);
    // A character read before its birthday was kept on the review meets no age or SP minimum.
    const bare = { ...young, birthday: undefined, skillPoints: undefined };
    expect(pilotStatus('r1', { ...draft, characters: [bare] }, asking, T0).unmet).toEqual([
      'ageDays',
      'skillPoints',
      'characters',
    ]);
  });

  it('shows the contact and the stored answers once shared, and no unmet minimums', () => {
    const answers = [{ questionId: 'q1', label: 'Why us?', answer: 'Friends' }];
    const open = review({ kind: 'application', state: 'open', characters: [young], answers });
    expect(pilotStatus('r1', open, asking, T0)).toMatchObject({
      contact: 'Ask Bob',
      questions: asking.questions,
      answers,
      unmet: [],
    });
    expect(pilotStatus('r1', { ...open, state: 'accepted' }, asking, T0).contact).toBe('Ask Bob');
  });

  it('asks a promotion nothing: no questions, no minimums', () => {
    const asked = review({ state: 'requested', characters: [young] });
    expect(pilotStatus('r1', asked, asking, T0)).toMatchObject({
      contact: '',
      questions: [],
      answers: [],
      unmet: [],
    });
  });

  it("tells a rejected pilot the corp's wording, and its reasons only when it shows them", () => {
    const open = review({ signOffsNeeded: 3 });
    const no = (r: StoredVettingReview, by: number, note: string) => {
      const out = decideSignOff(r, actor(by), by === 3 ? 'yes' : 'no', note, T0);
      if (!out.ok) throw new Error(out.reason);
      return out.review;
    };
    const rejected = no(no(no(open, 2, 'Too new'), 3, 'Seems fine'), 4, '  ');
    expect(rejected.state).toBe('rejected');
    expect(pilotStatus('r1', rejected, settingsOf(), T0).rejection).toEqual({
      wording: 'rejected',
      reasons: [],
    });
    const shown = settingsOf({ rejection: { wording: 'notNow', showReason: true } });
    expect(pilotStatus('r1', rejected, shown, T0).rejection).toEqual({
      wording: 'notNow',
      reasons: ['Too new'],
    });
    expect(pilotStatus('r1', { ...rejected, state: 'accepted' }, shown, T0)).not.toHaveProperty(
      'rejection'
    );
  });
});

describe('the open log', () => {
  it('logs one open per reviewer per hour', () => {
    const log = [{ at: T0, characterId: 2, name: 'Pilot 2', action: 'opened' as const }];
    expect(shouldLogOpen(log, 2, T0 + HOUR_MS - 1)).toBe(false);
    expect(shouldLogOpen(log, 2, T0 + HOUR_MS)).toBe(true);
    expect(shouldLogOpen(log, 3, T0 + 1)).toBe(true);
  });

  it('keeps the newest 100 entries', () => {
    let log: ReturnType<typeof appendVettingLog> = [];
    for (let i = 0; i < 105; i++) {
      log = appendVettingLog(log, { at: i, characterId: 1, name: 'x', action: 'opened' });
    }
    expect(log).toHaveLength(100);
    expect(log[0].at).toBe(5);
    expect(log[99].at).toBe(104);
  });
});

describe('settings', () => {
  it('defaults to off, and repairs what is stored', () => {
    // A document written before the newer settings existed reads as their defaults.
    expect(readVettingSettings(undefined)).toEqual({ ...VETTING_DEFAULT_SETTINGS, invites: [] });
    expect(readVettingSettings({ on: true, signOffs: { application: 1, promotion: 2 } })).toEqual({
      ...VETTING_DEFAULT_SETTINGS,
      on: true,
      invites: [],
    });
    expect(
      readVettingSettings({
        on: true,
        signOffs: { application: 7 },
        watchlist: [{ id: 1, name: 'A', category: 'corporation' }, { id: 2 }],
        corporationName: 'Test Corp',
      })
    ).toEqual({
      ...VETTING_DEFAULT_SETTINGS,
      on: true,
      watchlist: [{ id: 1, name: 'A', category: 'corporation' }],
      signOffs: { application: 3, promotion: 2 },
      invites: [],
      corporationName: 'Test Corp',
    });
  });

  it('keeps well-formed invites and sends none of the server fields to a caller', () => {
    const held = readVettingSettings({
      invites: [invite('aaaaaaaaaaaa', { uses: 2 }), { code: 'bad' }, 'junk'],
      corporationName: 'Test Corp',
      corporationTicker: 'TEST',
    });
    expect(held.invites).toEqual([invite('aaaaaaaaaaaa', { uses: 2 })]);
    expect(wireSettings(held)).toEqual(VETTING_DEFAULT_SETTINGS);
  });

  it('applies the newer settings, clamps numbers, and leaves the invites alone', () => {
    const settings = settingsOf({
      invites: [invite('aaaaaaaaaaaa')],
      corporationName: 'Test Corp',
      questions: [
        { id: 'q1', label: 'Why us?', required: true },
        { id: 'q2', label: 'Timezone?', required: false },
      ],
    });
    let n = 0;
    const out = applyVettingSettingsPatch(
      settings,
      {
        removeWatch: [],
        addWatchNames: [],
        welcome: 'Hello',
        contact: 'Ask Bob',
        // Reordered; q1 reworded; one new without an id, one with an id nobody issued, and
        // q2 sent twice (the second is a new question).
        questions: [
          { id: 'q2', label: 'Timezone?', required: true },
          { label: 'New one', required: false },
          { id: 'q1', label: 'Why join?', required: true },
          { id: 'made-up', label: 'Forged id', required: false },
          { id: 'q2', label: 'Again', required: false },
        ],
        minimums: { ageDays: -5, skillPoints: 9e12, characters: 2.4 },
        rejection: { wording: 'notNow', showReason: true },
        inviteOnly: true,
        notifyReviewers: false,
        mailDecision: false,
      },
      [],
      () => `new${++n}`
    );
    expect(out).toEqual({
      ok: true,
      settings: {
        ...settings,
        welcome: 'Hello',
        contact: 'Ask Bob',
        questions: [
          { id: 'q2', label: 'Timezone?', required: true },
          { id: 'new1', label: 'New one', required: false },
          { id: 'q1', label: 'Why join?', required: true },
          { id: 'new2', label: 'Forged id', required: false },
          { id: 'new3', label: 'Again', required: false },
        ],
        minimums: { ageDays: 0, skillPoints: 500_000_000, characters: 2 },
        rejection: { wording: 'notNow', showReason: true },
        inviteOnly: true,
        notifyReviewers: false,
        mailDecision: false,
      },
    });
    // A patch that names none of them changes none of them.
    const same = applyVettingSettingsPatch(
      settings,
      { removeWatch: [], addWatchNames: [] },
      [],
      () => 'x'
    );
    expect(same).toEqual({ ok: true, settings });
  });

  it('removes and adds watchlist entries without duplicates', () => {
    const settings = readVettingSettings({
      watchlist: [
        { id: 1, name: 'A', category: 'corporation' },
        { id: 2, name: 'B', category: 'alliance' },
      ],
    });
    const out = applyVettingSettingsPatch(
      settings,
      { on: true, removeWatch: [1], addWatchNames: [] },
      [
        { id: 2, name: 'B', category: 'alliance' },
        { id: 3, name: 'C', category: 'character' },
      ],
      () => 'x'
    );
    expect(out).toMatchObject({
      ok: true,
      settings: {
        on: true,
        signOffs: { application: 1, promotion: 2 },
        watchlist: [
          { id: 2, name: 'B', category: 'alliance' },
          { id: 3, name: 'C', category: 'character' },
        ],
      },
    });
  });

  it('refuses a watchlist over its cap', () => {
    const added = Array.from({ length: 201 }, (_, i) => ({
      id: i + 1,
      name: `N${i}`,
      category: 'character' as const,
    }));
    expect(
      applyVettingSettingsPatch(
        readVettingSettings({}),
        { removeWatch: [], addWatchNames: [] },
        added,
        () => 'x'
      )
    ).toEqual({ ok: false, reason: 'watchlist-full' });
  });

  it('finds the name ESI did not resolve, ignoring case', () => {
    const resolved = [{ id: 1, name: 'Bad Corp', category: 'corporation' as const }];
    expect(unknownWatchName(['bad corp'], resolved)).toBeUndefined();
    expect(unknownWatchName(['bad corp', 'Nobody'], resolved)).toBe('Nobody');
  });
});

describe('invites', () => {
  it('is always ok for an open corp, and needs a live code for an invite-only one', () => {
    const open = settingsOf({ invites: [invite('aaaaaaaaaaaa')] });
    expect(vettingInviteOk(open, undefined)).toBe(true);
    expect(vettingInviteOk(open, 'nope')).toBe(true);
    const closed = { ...open, inviteOnly: true };
    expect(vettingInviteOk(closed, undefined)).toBe(false);
    expect(vettingInviteOk(closed, 'nope')).toBe(false);
    expect(vettingInviteOk(closed, 'aaaaaaaaaaaa')).toBe(true);
    expect(liveVettingInvite(open, 'aaaaaaaaaaaa')).toEqual(invite('aaaaaaaaaaaa'));
    expect(liveVettingInvite(open, undefined)).toBeUndefined();
  });

  it('adds up to the cap and removes by code', () => {
    const one = addVettingInvite(settingsOf(), invite('aaaaaaaaaaaa'));
    expect(one).toMatchObject({ ok: true, settings: { invites: [invite('aaaaaaaaaaaa')] } });
    const full = settingsOf({
      invites: Array.from({ length: VETTING_INVITES_MAX }, (_, i) => invite(`code${i}`)),
    });
    expect(addVettingInvite(full, invite('bbbbbbbbbbbb'))).toEqual({
      ok: false,
      reason: 'invites-full',
    });
    expect(withoutVettingInvite(full, 'code3').invites).toHaveLength(VETTING_INVITES_MAX - 1);
    expect(withoutVettingInvite(full, 'nope')).toEqual(full);
  });
});

describe('known reviewers', () => {
  const day = DAY_MS;
  it('records a reviewer, rewrites at most once a day, and prunes those not seen in 30 days', () => {
    const first = seenVettingReviewer(undefined, 'char:2', 2, T0);
    expect(first).toEqual({ reviewers: { 'char:2': { characterId: 2, lastSeenAt: T0 } } });
    expect(seenVettingReviewer(first, 'char:2', 2, T0 + day - 1)).toBeNull();
    const later = seenVettingReviewer(first, 'char:3', 3, T0 + VETTING_REVIEWER_DAYS * day);
    expect(later).toEqual({
      reviewers: { 'char:3': { characterId: 3, lastSeenAt: T0 + VETTING_REVIEWER_DAYS * day } },
    });
    expect(seenVettingReviewer({ reviewers: 'junk' }, 'char:2', 2, T0)).toEqual(first);
  });

  it('tells the reviewers seen in 30 days, never one the report is about', () => {
    const doc = {
      reviewers: {
        'char:2': { characterId: 2, lastSeenAt: T0 },
        'char:3': { characterId: 3, lastSeenAt: T0 - VETTING_REVIEWER_DAYS * day },
        'char:50': { characterId: 50, lastSeenAt: T0 },
        'char:4': { characterId: 4, lastSeenAt: T0 - 5 },
        'char:9': { characterId: 'x', lastSeenAt: T0 },
      },
    };
    expect(vettingSharedRecipients(doc, review(), T0)).toEqual([2, 4]);
    expect(vettingSharedRecipients(undefined, review(), T0)).toEqual([]);
  });
});

describe('the report', () => {
  it('keeps summary facts of a character and none of its dealings', () => {
    const out = reportCharacter(
      {
        characterId: 50,
        name: 'Pilot 50',
        corporationId: 98000001,
        birthday: '2015-01-01T00:00:00Z',
        skillPoints: 9,
        history: [
          { corporationId: 98000001, startDate: '2026-01-01T00:00:00Z' },
          { corporationId: 1000001, startDate: '2025-01-01T00:00:00Z' },
          { corporationId: 98000001, startDate: '2024-01-01T00:00:00Z' },
        ],
        dealings: [{ source: 'mail', at: 'x', partyId: 7, what: 'mail' }],
        skills: [{ id: 1, level: 5 }],
        missing: ['wallet'],
      },
      'Test Corp'
    );
    expect(out).toEqual({
      characterId: 50,
      name: 'Pilot 50',
      corporationId: 98000001,
      corporationName: 'Test Corp',
      birthday: '2015-01-01T00:00:00Z',
      skillPoints: 9,
      corporations: 2,
      missing: ['wallet'],
    });
  });

  it('collects the ids the flags name', () => {
    const assessment: VettingAssessment = {
      flags: [
        {
          check: 'watchlistIsk',
          severity: 'warning',
          characterIds: [50],
          facts: { partyId: 7, rows: 3, received: 100 },
          evidence: [{ characterId: 50, at: null, partyId: 8, what: 'x' }],
          evidenceTotal: 1,
        },
        {
          check: 'watchlistHistory',
          severity: 'warning',
          characterIds: [50],
          facts: { corporationId: 9, stays: 1 },
          evidence: [],
          evidenceTotal: 0,
        },
      ],
      checks: [],
    };
    expect(referencedPartyIds(assessment).sort()).toEqual([7, 8, 9]);
  });
});

describe('withoutCharacter', () => {
  const second = { ...review().characters[0], characterId: 51, name: 'Pilot 51' };

  it('moves an application’s pilot to the next character left', () => {
    const out = withoutCharacter(
      review({ kind: 'application', state: 'draft', characters: [review().characters[0], second] }),
      50
    );
    expect(out.characters.map((c) => c.characterId)).toEqual([51]);
    expect(out.pilot).toMatchObject({ characterId: 51, name: 'Pilot 51' });
  });

  it('keeps a promotion’s pilot, and gives an emptied request its full time back', () => {
    const out = withoutCharacter(review({ state: 'requested', expiresAt: T0 + HOUR_MS }), 50);
    expect(out.pilot.characterId).toBe(50);
    expect(out.characters).toEqual([]);
    expect(out.expiresAt).toBe(T0 + 30 * DAY_MS);
  });
});

describe('decideVettingSweep', () => {
  const at = (state: StoredVettingReview['state'], over: Partial<StoredVettingReview> = {}) =>
    review({ state, expiresAt: T0, ...over });

  it('keeps a review that has not expired or has no expiry', () => {
    expect(decideVettingSweep(at('draft'), T0 - 1)).toBe('keep');
    expect(decideVettingSweep(at('draft', { expiresAt: null }), T0)).toBe('keep');
    expect(decideVettingSweep(at('open'), T0 - 1)).toBe('keep');
    expect(decideVettingSweep(at('open', { expiresAt: null }), T0)).toBe('keep');
    expect(decideVettingSweep({}, T0)).toBe('keep');
  });

  it('deletes an expired draft, declined request, decided review and undecided open one', () => {
    expect(decideVettingSweep(at('open'), T0)).toBe('delete');
    expect(decideVettingSweep(at('draft'), T0)).toBe('delete');
    expect(decideVettingSweep(at('declined'), T0)).toBe('delete');
    expect(decideVettingSweep(at('accepted'), T0)).toBe('delete');
    expect(decideVettingSweep(at('rejected'), T0)).toBe('delete');
  });

  it('clears what a member read into a request after a day, and deletes it after 30', () => {
    const requested = at('requested', { createdAt: T0 - DAY_MS });
    expect(decideVettingSweep(requested, T0)).toBe('clear-inputs');
    expect(decideVettingSweep({ ...requested, characters: [] }, T0)).toBe('keep');
    expect(decideVettingSweep(at('requested', { createdAt: T0 - 30 * DAY_MS }), T0)).toBe('delete');
  });
});

describe('expiry on use', () => {
  it('counts a draft as gone once its time has passed, and no other state', () => {
    const draft = review({ state: 'draft', expiresAt: T0 });
    expect(isExpiredDraft(draft, T0 - 1)).toBe(false);
    expect(isExpiredDraft(draft, T0)).toBe(true);
    expect(isExpiredDraft(review({ state: 'draft', expiresAt: null }), T0)).toBe(false);
    expect(isExpiredDraft(review({ state: 'open', expiresAt: T0 }), T0)).toBe(false);
    expect(isExpiredDraft(review({ state: 'requested', expiresAt: T0 }), T0)).toBe(false);
  });

  it('finds what a member read into a request and left past its time, and drops it', () => {
    const requested = review({ state: 'requested', expiresAt: T0 });
    expect(hasExpiredInputs(requested, T0 - 1)).toBe(false);
    expect(hasExpiredInputs(requested, T0)).toBe(true);
    expect(hasExpiredInputs({ ...requested, characters: [] }, T0)).toBe(false);
    expect(hasExpiredInputs(review({ state: 'draft', expiresAt: T0 }), T0)).toBe(false);

    const dropped = withoutInputs(requested);
    expect(dropped).toMatchObject({
      state: 'requested',
      characters: [],
      expiresAt: T0 + 30 * DAY_MS,
    });
    expect(hasExpiredInputs(dropped, T0)).toBe(false);
  });

  it('gives an undecided shared review its own keep time', () => {
    expect(openExpiry(T0)).toBe(T0 + VETTING_OPEN_KEEP_DAYS * DAY_MS);
  });
});

describe('nextDraftSlot', () => {
  it('allows ten drafts a day, then refuses without extending the window', () => {
    let state = nextDraftSlot(undefined, T0);
    for (let i = 1; i < 10; i++) state = nextDraftSlot(state.state, T0 + i);
    expect(state).toEqual({ allowed: true, state: { windowStart: T0, count: 10 } });
    expect(nextDraftSlot(state.state, T0 + 11)).toEqual({ allowed: false, state: state.state });
    expect(nextDraftSlot(state.state, T0 + DAY_MS)).toEqual({
      allowed: true,
      state: { windowStart: T0 + DAY_MS, count: 1 },
    });
  });
});

describe('the timed cache', () => {
  it('recalls a value, null included, until it is an hour old', () => {
    const cache = new Map<number, { at: number; value: string | null }>();
    rememberTimed(cache, 1, 'a', T0, 500);
    rememberTimed(cache, 2, null, T0, 500);
    expect(recallTimed(cache, 1, T0 + HOUR_MS - 1, HOUR_MS)).toEqual({ at: T0, value: 'a' });
    expect(recallTimed(cache, 2, T0, HOUR_MS)).toEqual({ at: T0, value: null });
    expect(recallTimed(cache, 1, T0 + HOUR_MS, HOUR_MS)).toBeUndefined();
    expect(recallTimed(cache, 3, T0, HOUR_MS)).toBeUndefined();
  });

  it('holds at most its cap, dropping the oldest', () => {
    const cache = new Map<number, { at: number; value: number }>();
    for (let i = 0; i < 5; i++) rememberTimed(cache, i, i, T0 + i, 3);
    expect([...cache.keys()]).toEqual([2, 3, 4]);
    // Remembering a key again moves it to the newest place and adds no entry.
    rememberTimed(cache, 2, 9, T0 + 9, 3);
    expect([...cache.keys()]).toEqual([3, 4, 2]);
    expect(recallTimed(cache, 2, T0 + 9, HOUR_MS)?.value).toBe(9);
  });
});
