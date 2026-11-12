import { describe, expect, it } from 'vitest';
import {
  appendVettingLog,
  applyVettingSettingsPatch,
  decideSignOff,
  decideVettingSweep,
  nextDraftSlot,
  pilotStatus,
  readVettingSettings,
  referencedPartyIds,
  reportCharacter,
  reviewSummary,
  reviewView,
  shouldLogOpen,
  unknownWatchName,
  withoutCharacter,
} from './vettingDecide.js';
import { VETTING_KEEP_DAYS, type VettingAssessment } from './vettingEngine.js';
import { DAY_MS, HOUR_MS, type StoredVettingReview, type VettingActor } from './vettingTypes.js';

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

  it('accepts when the yes count reaches what the review needs', () => {
    const twice = decided(decided(review(), actor(2), 'yes'), actor(3), 'yes', T0 + 5);
    expect(twice).toMatchObject({
      state: 'accepted',
      decidedAt: T0 + 5,
      deleteAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
      expiresAt: T0 + 5 + VETTING_KEEP_DAYS * DAY_MS,
    });
    expect(twice.log.map((entry) => entry.action)).toEqual(['decided', 'decided']);
  });

  it('rejects at once on a no', () => {
    expect(decided(review(), actor(2), 'no')).toMatchObject({
      state: 'rejected',
      decidedAt: T0,
      deleteAt: T0 + VETTING_KEEP_DAYS * DAY_MS,
    });
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

  it('shows every decision once the review is decided', () => {
    const rejected = decided(review(), actor(2), 'no');
    expect(reviewView('r1', rejected, actor(4)).signOffs[0]).toMatchObject({
      decision: 'no',
      note: 'note 2',
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

describe('pilotStatus', () => {
  it('lists who opened the report, newest first, and nothing of the decision', () => {
    const log = [
      { at: T0, characterId: 2, name: 'Pilot 2', action: 'opened' as const },
      { at: T0 + 9, characterId: 3, name: 'Pilot 3', action: 'opened' as const },
      { at: T0 + 5, characterId: 2, name: 'Pilot 2', action: 'decided' as const },
    ];
    const status = pilotStatus('r1', decided(review({ log }), actor(2), 'yes'));
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
    expect(readVettingSettings(undefined)).toEqual({
      on: false,
      watchlist: [],
      signOffs: { application: 1, promotion: 2 },
    });
    expect(
      readVettingSettings({
        on: true,
        signOffs: { application: 7 },
        watchlist: [{ id: 1, name: 'A', category: 'corporation' }, { id: 2 }],
        corporationName: 'Test Corp',
      })
    ).toEqual({
      on: true,
      watchlist: [{ id: 1, name: 'A', category: 'corporation' }],
      signOffs: { application: 3, promotion: 2 },
      corporationName: 'Test Corp',
    });
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
      ]
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
        added
      )
    ).toEqual({ ok: false, reason: 'watchlist-full' });
  });

  it('finds the name ESI did not resolve, ignoring case', () => {
    const resolved = [{ id: 1, name: 'Bad Corp', category: 'corporation' as const }];
    expect(unknownWatchName(['bad corp'], resolved)).toBeUndefined();
    expect(unknownWatchName(['bad corp', 'Nobody'], resolved)).toBe('Nobody');
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

  it('keeps a review that has not expired, has no expiry, or is open', () => {
    expect(decideVettingSweep(at('draft'), T0 - 1)).toBe('keep');
    expect(decideVettingSweep(at('draft', { expiresAt: null }), T0)).toBe('keep');
    expect(decideVettingSweep(at('open'), T0)).toBe('keep');
    expect(decideVettingSweep({}, T0)).toBe('keep');
  });

  it('deletes an expired draft, declined request and decided review', () => {
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
