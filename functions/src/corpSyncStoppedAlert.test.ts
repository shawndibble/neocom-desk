import { describe, expect, it } from 'vitest';
import {
  SYNC_STOPPED_EDITOR_DAYS,
  SYNC_STOPPED_NOTIFY_MAX,
  isAlertedStop,
  syncStoppedFires,
  syncStoppedRecipients,
} from './corpSyncStoppedAlert.js';
import { SCHEDULED_STOP_REASONS } from './corpTaxBookSyncEngine.js';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const HOLDER = 90000001;

const officer = (characterId: number, canEdit: boolean, ageDays: number) => ({
  characterId,
  characterName: `Pilot ${characterId}`,
  canEdit,
  canView: true,
  checkedAt: NOW - ageDays * DAY,
  expiresAt: NOW - ageDays * DAY + 600_000,
});

describe('isAlertedStop', () => {
  it('tells every stop but a book turned off on purpose', () => {
    expect(SCHEDULED_STOP_REASONS.filter((reason) => !isAlertedStop(reason))).toEqual(['book-off']);
  });
});

describe('syncStoppedRecipients', () => {
  const officers = [
    officer(2, true, 3),
    officer(3, false, 1),
    officer(4, true, 1),
    officer(5, true, SYNC_STOPPED_EDITOR_DAYS),
    officer(6, true, SYNC_STOPPED_EDITOR_DAYS - 1),
  ];

  it('tells the holder and the editors checked in the last 30 days, the latest first', () => {
    expect(syncStoppedRecipients(officers, HOLDER, 'token-revoked', NOW)).toEqual([
      HOLDER,
      4,
      2,
      6,
    ]);
  });

  it('leaves out a holder who lost the role or left, even with a fresh officer doc', () => {
    const withHolder = [...officers, officer(HOLDER, true, 0)];
    for (const reason of ['role-lost', 'left-corp'] as const) {
      expect(syncStoppedRecipients(withHolder, HOLDER, reason, NOW)).toEqual([4, 2, 6]);
    }
  });

  it('tells a holder who is also an editor once', () => {
    expect(
      syncStoppedRecipients(
        [officer(HOLDER, true, 0), officer(2, true, 1)],
        HOLDER,
        'esi-refused',
        NOW
      )
    ).toEqual([HOLDER, 2]);
  });

  it('skips docs it cannot read and caps the list', () => {
    const many = Array.from({ length: SYNC_STOPPED_NOTIFY_MAX + 5 }, (_, i) =>
      officer(100 + i, true, 1)
    );
    const told = syncStoppedRecipients(
      [null, 'x', { canEdit: true }, { canEdit: true, characterId: 7 }, ...many],
      HOLDER,
      'grant-unreadable',
      NOW
    );
    expect(told).toHaveLength(SYNC_STOPPED_NOTIFY_MAX);
    expect(told[0]).toBe(HOLDER);
    expect(told).not.toContain(7);
  });
});

describe('syncStoppedFires', () => {
  it('builds one fire per recipient with the stop’s own time', () => {
    expect(
      syncStoppedFires([HOLDER, 2], {
        corporationId: 98000001,
        reason: 'token-revoked',
        characterName: 'Holder',
        stoppedAt: NOW,
      })
    ).toEqual([
      {
        eventId: 'corpTaxBookSyncStopped',
        characterId: HOLDER,
        corporationId: 98000001,
        reason: 'token-revoked',
        characterName: 'Holder',
        stoppedAt: NOW,
      },
      {
        eventId: 'corpTaxBookSyncStopped',
        characterId: 2,
        corporationId: 98000001,
        reason: 'token-revoked',
        characterName: 'Holder',
        stoppedAt: NOW,
      },
    ]);
  });
});
