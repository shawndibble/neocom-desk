import { describe, expect, it } from 'vitest';
import type {
  VettingAssessment,
  VettingFlag,
  VettingParty,
  VettingReview,
  VettingReviewSummary,
} from '@/engine/vetting';
import {
  canSend,
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
    expect(evidenceWhatKey('some_new_ref_type')).toBeNull();
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
    ).toEqual([{ check: 'watchlistMail', source: 'mail', names: ['Mira Vell'] }]);
  });
});

const review = (over: Partial<VettingReview>): VettingReview => ({
  ...summary({}),
  corporationId: 98000001,
  note: '',
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
    expect(signOffRows(review({}))).toEqual([{ kind: 'yours' }]);
  });

  it('hides another reviewer’s decision until the caller has decided', () => {
    const other = { characterId: 5, name: 'Ilse Marrow', you: false, at: 100 };
    expect(signOffRows(review({ needed: 2, signed: 1, signOffs: [other] }))).toEqual([
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
      })
    );
    expect(rows).toEqual([
      { kind: 'decided', name: 'Ilse Marrow', you: false, at: 100, decision: 'no', note: 'No.' },
      { kind: 'decided', name: 'Kestrel Vane', you: true, at: 200, decision: 'yes', note: '' },
    ]);
  });

  it('bars whoever asked for the review, the caller or someone else', () => {
    const requestedBy = { characterId: 9, name: 'Bram Soto' };
    expect(signOffRows(review({ kind: 'promotion', requestedBy, barred: false }))).toEqual([
      { kind: 'yours' },
      { kind: 'barred', name: 'Bram Soto', you: false },
    ]);
    expect(
      signOffRows(review({ kind: 'promotion', requestedBy, barred: true, yours: false }))
    ).toEqual([{ kind: 'barred', name: 'Bram Soto', you: true }]);
  });

  it('adds no row for the caller once the review is decided', () => {
    expect(signOffRows(review({ state: 'accepted', yours: false }))).toEqual([]);
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

describe('vettingErrorKey', () => {
  it('maps a known refusal to its wording and anything else to the generic line', () => {
    expect(vettingErrorKey('vetting-off')).toBe('vetting.errors.vetting-off');
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
