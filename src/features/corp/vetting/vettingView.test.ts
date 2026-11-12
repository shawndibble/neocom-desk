import { describe, expect, it } from 'vitest';
import {
  VETTING_CHECK_SOURCES,
  type VettingAssessment,
  type VettingFlag,
  type VettingParty,
  type VettingReview,
  type VettingReviewSummary,
} from '@/engine/vetting';
import {
  askedByReviewer,
  askedMinimums,
  canSend,
  sendBlock,
  unmetFromRefusal,
  evidenceWhatKey,
  flagFindingParams,
  isReviewGone,
  missingChecks,
  missingSourcesFor,
  needsYours,
  partyLabel,
  resultLine,
  reviewResult,
  signOffRows,
  vettingErrorKey,
} from './vettingView';

const summary = (over: Partial<VettingReviewSummary>): VettingReviewSummary => ({
  id: 'r-1',
  kind: 'application',
  state: 'open',
  pilot: { characterId: 1, name: 'Tamsin Vell', corporationName: 'Hollow Reach Mining' },
  characters: 3,
  flags: 0,
  missing: 0,
  signed: 0,
  needed: 1,
  yours: true,
  readAt: 1,
  createdAt: 1,
  decidedAt: null,
  ...over,
});

describe('reviewResult', () => {
  it('says flags, then incomplete, then nothing found, never "safe"', () => {
    expect(reviewResult(summary({ flags: 2, worst: 'critical', missing: 1 }))).toEqual({
      result: 'flags',
      tone: 'danger',
    });
    expect(reviewResult(summary({ flags: 1, worst: 'warning' }))).toEqual({
      result: 'flags',
      tone: 'warning',
    });
    expect(reviewResult(summary({ missing: 1 }))).toEqual({
      result: 'incomplete',
      tone: 'warning',
    });
    expect(reviewResult(summary({}))).toEqual({ result: 'nothing', tone: 'neutral' });
  });

  it('names a review the pilot has not answered, declined or withdrew', () => {
    expect(reviewResult(summary({ state: 'requested' })).result).toBe('waiting');
    expect(reviewResult(summary({ state: 'declined' }))).toEqual({
      result: 'declined',
      tone: 'warning',
    });
    expect(reviewResult(summary({ state: 'withdrawn', flags: 2 })).result).toBe('withdrawn');
  });
});

describe('needsYours', () => {
  it('holds only while the review is open and the caller may still decide', () => {
    expect(needsYours(summary({}))).toBe(true);
    expect(needsYours(summary({ yours: false }))).toBe(false);
    expect(needsYours(summary({ state: 'requested' }))).toBe(false);
    expect(needsYours(summary({ state: 'accepted' }))).toBe(false);
  });
});

const flag = (over: Partial<VettingFlag>): VettingFlag => ({
  check: 'watchlistIsk',
  severity: 'critical',
  characterIds: [1],
  facts: {},
  evidence: [],
  evidenceTotal: 0,
  ...over,
});

const assessment = (over: Partial<VettingAssessment>): VettingAssessment => ({
  flags: [],
  checks: [
    { check: 'watchlistIsk', state: 'clear', missingFor: [] },
    { check: 'watchlistMail', state: 'clear', missingFor: [] },
    { check: 'corpHopping', state: 'clear', missingFor: [] },
  ],
  ...over,
});

describe('resultLine', () => {
  it('counts flags, checks and the checks that could not run', () => {
    expect(
      resultLine(
        assessment({
          flags: [flag({ severity: 'warning' }), flag({ severity: 'critical' })],
          checks: [
            { check: 'watchlistIsk', state: 'flag', missingFor: [] },
            { check: 'watchlistMail', state: 'missing', missingFor: [2] },
            { check: 'corpHopping', state: 'clear', missingFor: [] },
          ],
        })
      )
    ).toEqual({ flags: 2, checks: 3, missing: 1, severity: 'critical' });
  });

  it('is neutral when nothing was found, and a warning when a check could not run', () => {
    expect(resultLine(assessment({})).severity).toBe('clear');
    expect(
      resultLine(
        assessment({ checks: [{ check: 'watchlistMail', state: 'missing', missingFor: [2] }] })
      ).severity
    ).toBe('warning');
  });
});

const parties: VettingParty[] = [
  { id: 10, name: 'Corvin Hale', category: 'character', corporationId: 20 },
  { id: 20, name: 'Black Kite Syndicate', category: 'corporation' },
  { id: 30, name: 'Orrin Dask', category: 'character', corporationId: 99 },
];

describe('partyLabel', () => {
  it('names a character with its corporation when the report knows it', () => {
    expect(partyLabel(parties, 10)).toBe('Corvin Hale, Black Kite Syndicate');
    expect(partyLabel(parties, 30)).toBe('Orrin Dask');
    expect(partyLabel(parties, 20)).toBe('Black Kite Syndicate');
    expect(partyLabel(parties, 404)).toBeNull();
  });
});

describe('flagFindingParams', () => {
  const format = {
    isk: (value: number) => `${value} ISK`,
    compact: (value: number) => `${value / 1_000_000}M`,
    party: (id: number) => partyLabel(parties, id) ?? `#${id}`,
  };

  it('turns ISK with the watchlist into totals, a row count and the lead party', () => {
    expect(
      flagFindingParams(
        flag({ facts: { received: 1_200_000_000, sent: 50, rows: 3, partyId: 10 } }),
        format
      )
    ).toEqual({
      total: '1200000050 ISK',
      received: '1200000000 ISK',
      sent: '50 ISK',
      count: 3,
      party: 'Corvin Hale, Black Kite Syndicate',
    });
  });

  it('names the watchlist corporation and counts the stays', () => {
    expect(
      flagFindingParams(
        flag({ check: 'watchlistHistory', facts: { corporationId: 20, stays: 2 } }),
        format
      )
    ).toEqual({ count: 2, party: 'Black Kite Syndicate' });
  });

  it('counts rows with the lead party for contacts, mail, contracts and an undeclared character', () => {
    for (const check of [
      'watchlistContacts',
      'watchlistMail',
      'watchlistContracts',
      'undeclaredCharacter',
    ] as const) {
      expect(flagFindingParams(flag({ check, facts: { rows: 9, partyId: 30 } }), format)).toEqual({
        count: 9,
        party: 'Orrin Dask',
      });
    }
  });

  it('gives the skill checks their own figures', () => {
    expect(flagFindingParams(flag({ check: 'corpHopping', facts: { joined: 5 } }), format)).toEqual(
      { count: 5 }
    );
    expect(
      flagFindingParams(flag({ check: 'cynoNoCapital', facts: { level: 5 } }), format)
    ).toEqual({ level: 'V' });
    expect(
      flagFindingParams(
        flag({ check: 'thinCharacter', facts: { skillPoints: 3_000_000, ageDays: 1500 } }),
        format
      )
    ).toEqual({ skillPoints: '3M', count: 4 });
  });
});

describe('evidenceWhatKey', () => {
  it('knows the rows the checks produce and nothing else', () => {
    expect(evidenceWhatKey('player_donation')).toBe('vetting.what.player_donation');
    expect(evidenceWhatKey('member')).toBe('vetting.what.member');
    // A word ESI adds later is never shown raw.
    expect(evidenceWhatKey('some_new_ref_type')).toBe('vetting.what.other');
  });
});

describe('missingChecks', () => {
  it('lists each check that could not run with who did not share what', () => {
    expect(
      missingChecks(
        assessment({
          checks: [
            { check: 'watchlistIsk', state: 'flag', missingFor: [2] },
            { check: 'watchlistMail', state: 'missing', missingFor: [2, 7] },
            { check: 'corpHopping', state: 'clear', missingFor: [] },
          ],
        }),
        [
          { characterId: 1, name: 'Tamsin Vell' },
          { characterId: 2, name: 'Mira Vell' },
        ]
      )
    ).toEqual([{ check: 'watchlistMail', sources: ['mail'], names: ['Mira Vell'] }]);
  });

  it('takes what a check needs from the engine, narrowed to what was left out', () => {
    const checks = assessment({
      checks: [{ check: 'undeclaredCharacter', state: 'missing', missingFor: [2] }],
    });
    // Nothing says which of the check's sources is missing: every one the engine lists.
    expect(missingChecks(checks, [{ characterId: 2, name: 'Mira Vell' }])).toEqual([
      {
        check: 'undeclaredCharacter',
        sources: [...VETTING_CHECK_SOURCES.undeclaredCharacter],
        names: ['Mira Vell'],
      },
    ]);
    expect(
      missingChecks(checks, [{ characterId: 2, name: 'Mira Vell', missing: ['contract', 'mail'] }])
    ).toEqual([{ check: 'undeclaredCharacter', sources: ['contract'], names: ['Mira Vell'] }]);
  });

  it('never lists a check the engine says reads nothing private', () => {
    expect(VETTING_CHECK_SOURCES.corpHopping).toEqual([]);
    expect(
      missingChecks(
        assessment({ checks: [{ check: 'corpHopping', state: 'missing', missingFor: [2] }] }),
        [{ characterId: 2, name: 'Mira Vell' }]
      )
    ).toEqual([]);
  });
});

const review = (over: Partial<VettingReview>): VettingReview => ({
  ...summary({}),
  corporationId: 98000001,
  note: '',
  answers: [],
  barred: false,
  reportCharacters: [],
  parties: [],
  assessment: null,
  signOffs: [],
  log: [],
  deleteAt: null,
  ...over,
});

describe('signOffRows', () => {
  it('lists the caller as still to decide on an open review', () => {
    expect(signOffRows(review({}), 6)).toEqual([{ kind: 'yours' }]);
  });

  it('hides another reviewer’s decision until the caller has decided', () => {
    const other = { characterId: 5, name: 'Ilse Marrow', you: false, at: 100 };
    expect(signOffRows(review({ needed: 2, signed: 1, signOffs: [other] }), 6)).toEqual([
      { kind: 'hidden', name: 'Ilse Marrow', at: 100 },
      { kind: 'yours' },
    ]);
  });

  it('shows every decision once the caller has decided, with no row left to fill', () => {
    const rows = signOffRows(
      review({
        yours: false,
        needed: 2,
        signed: 2,
        signOffs: [
          { characterId: 5, name: 'Ilse Marrow', you: false, at: 100, decision: 'no', note: 'No.' },
          { characterId: 6, name: 'Kestrel Vane', you: true, at: 200, decision: 'yes', note: '' },
        ],
      }),
      6
    );
    expect(rows).toEqual([
      { kind: 'decided', name: 'Ilse Marrow', you: false, at: 100, decision: 'no', note: 'No.' },
      { kind: 'decided', name: 'Kestrel Vane', you: true, at: 200, decision: 'yes', note: '' },
    ]);
  });

  it('bars whoever asked for the review, the caller or someone else', () => {
    const requestedBy = { characterId: 9, name: 'Bram Soto' };
    expect(signOffRows(review({ kind: 'promotion', requestedBy }), 6)).toEqual([
      { kind: 'yours' },
      { kind: 'barred', name: 'Bram Soto', you: false },
    ]);
    expect(
      signOffRows(review({ kind: 'promotion', requestedBy, barred: true, yours: false }), 9)
    ).toEqual([{ kind: 'barred', name: 'Bram Soto', you: true }]);
  });

  it('does not call the caller the asker when they are barred for another reason', () => {
    const requestedBy = { characterId: 9, name: 'Bram Soto' };
    const about = review({ kind: 'promotion', requestedBy, barred: true, yours: false });
    expect(signOffRows(about, 6)).toEqual([{ kind: 'barred', name: 'Bram Soto', you: false }]);
    expect(askedByReviewer(about, 6)).toBe(false);
    expect(askedByReviewer(about, 9)).toBe(true);
    expect(askedByReviewer(review({}), 9)).toBe(false);
  });

  it('adds no row for the caller once the review is decided', () => {
    expect(signOffRows(review({ state: 'accepted', yours: false }), 6)).toEqual([]);
  });
});

describe('missingSourcesFor', () => {
  it('names what a device grant leaves out of a report', () => {
    expect(
      missingSourcesFor([
        'esi-wallet.read_character_wallet.v1',
        'esi-skills.read_skills.v1',
        'esi-assets.read_assets.v1',
      ])
    ).toEqual(['contact', 'mail', 'contract']);
    expect(missingSourcesFor([])).toHaveLength(5);
  });
});

describe('canSend', () => {
  it('needs a character, the statement, and nothing still being read', () => {
    expect(canSend({ characters: 1, allMine: true, reading: false })).toBe(true);
    expect(canSend({ characters: 1, allMine: false, reading: false })).toBe(false);
    expect(canSend({ characters: 0, allMine: true, reading: false })).toBe(false);
    expect(canSend({ characters: 2, allMine: true, reading: true })).toBe(false);
  });
});

describe('sendBlock', () => {
  const ready = { characters: 2, allMine: true, reading: false };

  it('names what stands in the way, the corp’s own asks before the statement', () => {
    expect(sendBlock(ready)).toBeNull();
    expect(sendBlock({ ...ready, unmet: 1, unanswered: 2, allMine: false })).toBe('minimums');
    expect(sendBlock({ ...ready, unanswered: 1, allMine: false })).toBe('answers');
    expect(sendBlock({ ...ready, allMine: false })).toBe('tick');
    expect(sendBlock({ ...ready, characters: 0, unmet: 1 })).toBe('characters');
    expect(sendBlock({ ...ready, reading: true })).toBe('reading');
    expect(canSend({ ...ready, unanswered: 1 })).toBe(false);
  });
});

describe('askedMinimums', () => {
  it('lists only what a corp set above none, in the page’s order', () => {
    expect(askedMinimums({ ageDays: 0, skillPoints: 0, characters: 1 })).toEqual([]);
    expect(askedMinimums({ ageDays: 365, skillPoints: 50_000_000, characters: 2 })).toEqual([
      { id: 'ageDays', value: 365 },
      { id: 'skillPoints', value: 50_000_000 },
      { id: 'characters', value: 2 },
    ]);
    expect(askedMinimums({ ageDays: 0, skillPoints: 0, characters: 3 })).toEqual([
      { id: 'characters', value: 3 },
    ]);
  });
});

describe('unmetFromRefusal', () => {
  it('reads the unmet ids a below-minimum refusal lists, and nothing else', () => {
    expect(unmetFromRefusal(new Error('skillPoints,ageDays'))).toEqual(['ageDays', 'skillPoints']);
    expect(unmetFromRefusal(new Error('characters, bogus'))).toEqual(['characters']);
    expect(unmetFromRefusal(new Error('below-minimum'))).toEqual([]);
    expect(unmetFromRefusal(null)).toEqual([]);
  });
});

describe('vettingErrorKey', () => {
  it('words the refusals the corp’s settings add', () => {
    for (const reason of ['invite-required', 'invites-full', 'answers-required', 'below-minimum']) {
      expect(vettingErrorKey(reason)).toBe(`vetting.errors.${reason}`);
    }
  });

  it('maps a known refusal to its wording and anything else to the generic line', () => {
    expect(vettingErrorKey('vetting-off')).toBe('vetting.errors.vetting-off');
    expect(vettingErrorKey('own-review')).toBe('vetting.errors.own-review');
    expect(vettingErrorKey('who-knows')).toBe('vetting.errors.generic');
    expect(vettingErrorKey(null)).toBe('vetting.errors.generic');
  });

  it('reads a missing review and a wrong key as the same thing: gone', () => {
    expect(isReviewGone('bad-key')).toBe(true);
    expect(isReviewGone('not-found')).toBe(true);
    expect(isReviewGone('vetting-off')).toBe(false);
    expect(isReviewGone(null)).toBe(false);
  });
});
