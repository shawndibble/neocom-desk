import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { TurnInOffer } from '@/engine/market/turnIn';
import { groupTurnInPile } from '@/engine/market/turnInPile';
import {
  approxIsk,
  destinationBlock,
  filledPercent,
  lpBlockText,
  participateLine,
  pileParticipate,
  rewardSplitText,
  turnInGroupMultibuy,
} from './turnInContent';

const t = i18n.t.bind(i18n);

/** Shield Failover Report at an 800 ISK/LP LP Value. */
const report: TurnInOffer = {
  objectiveId: 'obj-report',
  campaignId: 'camp-caldari',
  typeId: 97545,
  iskPerItem: 28_000,
  iskPerInterval: 28_000,
  iskInterval: 1,
  lpPerItem: 40,
  lpPerBlock: 4_000,
  lpBlockSize: 100,
  lpCorporationId: 1000035,
  lpValue: 800,
  lpIskPerItem: 32_000,
  totalPerItem: 60_000,
  traderTypeId: 97622,
  traderName: 'Secure Strength Trader',
  systemId: 30045324,
  progress: 1_700_000,
  targetProgress: 10_000_000,
  filled: 0.17,
  remaining: 8_300_000,
  maxPerParticipant: null,
};

describe('reward text', () => {
  it('rounds the reward each, since its LP is only an estimate', () => {
    expect(approxIsk(60_000)).toBe('~60K');
    expect(approxIsk(19_100_000)).toBe('~19.1M');
  });

  it('splits one item into its ISK and its LP at the LP Value', () => {
    expect(rewardSplitText(report, t)).toBe('28,000 ISK + 40 LP (~32K)');
  });

  it('says the LP is unpriced rather than counting it free', () => {
    const unpriced = { ...report, lpValue: null, lpIskPerItem: null, totalPerItem: 28_000 };
    expect(rewardSplitText(unpriced, t)).toBe('28,000 ISK + 40 LP (LP unpriced)');
  });

  it('leaves out a half the objective does not pay', () => {
    expect(rewardSplitText({ ...report, iskPerItem: 0 }, t)).toBe('40 LP (~32K)');
    expect(rewardSplitText({ ...report, lpPerItem: 0, lpIskPerItem: 0 }, t)).toBe('28,000 ISK');
  });

  it('names the LP block, and only the tokens when no LP is paid', () => {
    expect(lpBlockText(report, t)).toBe('LP paid per full 100 items · + faction tokens');
    expect(lpBlockText({ ...report, lpBlockSize: 1 }, t)).toBe(
      'LP paid per item · + faction tokens'
    );
    expect(lpBlockText({ ...report, lpBlockSize: null, lpPerBlock: 0 }, t)).toBe(
      '+ faction tokens'
    );
  });

  it('never shows an open objective as 100% filled', () => {
    expect(filledPercent({ filled: 0.17 })).toBe(17);
    expect(filledPercent({ filled: 0.999 })).toBe(99);
  });
});

describe('participateLine', () => {
  it('says participating or not only once the Permission is granted and the read answered', () => {
    expect(
      participateLine({ characterId: 1, permission: 'granted', state: 'participating' })
    ).toEqual({ kind: 'participating' });
    expect(
      participateLine({ characterId: 1, permission: 'granted', state: 'notParticipating' })
    ).toEqual({ kind: 'notParticipating' });
    expect(participateLine({ characterId: 1, permission: 'granted', state: 'unknown' })).toEqual({
      kind: 'paysOnlyIf',
      mark: false,
    });
  });

  it('puts the mark by the caveat only while the Permission is missing and not dismissed', () => {
    expect(participateLine({ characterId: 1, permission: 'missing', state: 'unknown' })).toEqual({
      kind: 'paysOnlyIf',
      mark: true,
    });
    expect(participateLine({ characterId: 1, permission: 'dismissed', state: 'unknown' })).toEqual({
      kind: 'paysOnlyIf',
      mark: false,
    });
    expect(participateLine({ characterId: 1, permission: undefined, state: undefined })).toEqual({
      kind: 'paysOnlyIf',
      mark: false,
    });
  });

  it('shows the caveat without a mark when there is no Character', () => {
    expect(participateLine({ characterId: null, permission: undefined, state: undefined })).toEqual(
      { kind: 'paysOnlyIf', mark: false }
    );
  });
});

describe('destinationBlock', () => {
  const ready = {
    characterId: 1,
    lacksScope: false,
    offline: false,
    permission: 'granted' as const,
  };

  it('sends when the Character holds Autopilot waypoints and is online', () => {
    expect(destinationBlock(ready)).toEqual({ kind: 'ready' });
  });

  it('marks a missing Permission with no words, and names a dismissed one in the tooltip', () => {
    expect(destinationBlock({ ...ready, lacksScope: true, permission: 'missing' })).toEqual({
      kind: 'mark',
    });
    expect(destinationBlock({ ...ready, lacksScope: true, permission: 'dismissed' })).toEqual({
      kind: 'reason',
      reason: 'dismissed',
    });
  });

  it('gives the no-Character and offline reasons', () => {
    expect(destinationBlock({ ...ready, characterId: null })).toEqual({
      kind: 'reason',
      reason: 'noCharacter',
    });
    expect(destinationBlock({ ...ready, offline: true })).toEqual({
      kind: 'reason',
      reason: 'offline',
    });
  });
});

describe('turnInGroupMultibuy', () => {
  it("copies one trader's items as EVE multibuy lines of the counted quantities", () => {
    const capped = { ...report, maxPerParticipant: 250 };
    const intel = { ...report, objectiveId: 'obj-intel', typeId: 97549 };
    const [group] = groupTurnInPile([
      { name: 'Shield Failover Report', quantity: 300, offer: capped, contributed: 100 },
      { name: 'Federation Strategic Intel', quantity: 200, offer: intel },
    ]).groups;
    expect(turnInGroupMultibuy(group!)).toBe(
      'Federation Strategic Intel\t200\nShield Failover Report\t150'
    );
  });
});

describe('pileParticipate', () => {
  it('shows the per-item column only once the Permission is granted and the read answered', () => {
    expect(pileParticipate({ characterId: 1, permission: 'granted', answered: true })).toEqual({
      kind: 'perItem',
    });
    expect(pileParticipate({ characterId: 1, permission: 'granted', answered: false })).toEqual({
      kind: 'paysOnlyIf',
      mark: false,
    });
  });

  it('marks the caveat while the Permission is missing, not once dismissed or with no Character', () => {
    expect(pileParticipate({ characterId: 1, permission: 'missing', answered: false })).toEqual({
      kind: 'paysOnlyIf',
      mark: true,
    });
    expect(pileParticipate({ characterId: 1, permission: 'dismissed', answered: false })).toEqual({
      kind: 'paysOnlyIf',
      mark: false,
    });
    expect(pileParticipate({ characterId: null, permission: undefined, answered: false })).toEqual({
      kind: 'paysOnlyIf',
      mark: false,
    });
  });
});
