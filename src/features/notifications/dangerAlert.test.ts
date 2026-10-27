import { describe, expect, it } from 'vitest';
import type { NotificationFeedRecord } from '@/db';
import { groupAlertsByType } from './alertGroups';
import {
  ALERT_CHIPS,
  bellBadge,
  filterByChip,
  isDangerEntry,
  isSnoozable,
  markAllReadTargets,
  alertViewPath,
  selectDangerBanner,
  usefulChips,
  typeChipOfGroupKey,
} from './dangerAlert';

function entry(
  id: string,
  eventId: string,
  firedAt: number,
  extra: Partial<NotificationFeedRecord> = {}
): NotificationFeedRecord {
  return { id, characterId: 1, eventId, title: id, body: id, firedAt, ...extra };
}

const attack = (id: string, firedAt: number, extra: Partial<NotificationFeedRecord> = {}) =>
  entry(id, 'eveNotification', firedAt, { eveType: 'StructureUnderAttack', ...extra });
const mail = (id: string, firedAt: number) => entry(id, 'newMail', firedAt);

describe('isDangerEntry', () => {
  it('is true for a critical type and false for the rest', () => {
    expect(isDangerEntry(attack('a', 1))).toBe(true);
    expect(isDangerEntry(mail('m', 1))).toBe(false);
    expect(isDangerEntry(entry('f', 'structureFuelLow', 1))).toBe(false);
    // A reinforced den is the one critical personal event (issue #4782); its anarchy is a warning.
    expect(isDangerEntry(entry('d', 'mercenaryDenReinforced', 1))).toBe(true);
    expect(isDangerEntry(entry('a', 'mercenaryDenAnarchy', 1))).toBe(false);
  });

  it('reads a skyhook raid as danger only from its :danger Occurrence Key (issue #4784)', () => {
    const key = (phase: string) => `1:skyhookRaidable:5:1000:${phase}`;
    expect(isDangerEntry(entry(key('danger'), 'skyhookRaidable', 1))).toBe(true);
    expect(isDangerEntry(entry(key('open'), 'skyhookRaidable', 1))).toBe(false);
    expect(isDangerEntry(entry(key('soon'), 'skyhookRaidable', 1))).toBe(false);
  });

  it('shows the danger skyhook entry in the banner and the group wears its worst severity', () => {
    const rows = [
      entry('1:skyhookRaidable:5:1000:soon', 'skyhookRaidable', 1),
      entry('1:skyhookRaidable:5:1000:danger', 'skyhookRaidable', 2),
    ];
    expect(selectDangerBanner(rows)?.id).toBe('1:skyhookRaidable:5:1000:danger');
    expect(groupAlertsByType(rows)[0].severity).toBe('critical');
    expect(groupAlertsByType([rows[0]])[0].severity).toBe('warning');
    expect(markAllReadTargets(rows).map((row) => row.id)).toEqual([
      '1:skyhookRaidable:5:1000:soon',
    ]);
  });
});

describe('selectDangerBanner', () => {
  it('returns the newest undismissed danger entry', () => {
    const entries = [attack('old', 10), attack('new', 30), attack('mid', 20), mail('m', 99)];
    expect(selectDangerBanner(entries)?.id).toBe('new');
  });

  it('skips dismissed entries and returns null when none is left', () => {
    expect(selectDangerBanner([attack('a', 5, { dismissedAt: 6 })])).toBeNull();
    expect(selectDangerBanner([mail('m', 1)])).toBeNull();
    expect(selectDangerBanner([])).toBeNull();
    expect(selectDangerBanner([attack('a', 5, { dismissedAt: 6 }), attack('b', 4)])?.id).toBe('b');
  });
});

describe('bellBadge', () => {
  it('counts undismissed entries and flags danger', () => {
    expect(bellBadge([])).toEqual({ count: 0, danger: false });
    expect(bellBadge([mail('a', 1), mail('b', 2)])).toEqual({ count: 2, danger: false });
    expect(bellBadge([mail('a', 1), attack('b', 2), attack('c', 3, { dismissedAt: 4 })])).toEqual({
      count: 2,
      danger: true,
    });
  });
});

describe('markAllReadTargets', () => {
  it('returns undismissed non-danger entries only', () => {
    const entries = [
      mail('a', 1),
      attack('b', 2),
      mail('c', 3),
      { ...mail('d', 4), dismissedAt: 5 },
    ];
    expect(markAllReadTargets(entries).map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('chips', () => {
  it('lists the chips in order', () => {
    expect(ALERT_CHIPS).toEqual([
      'all',
      'danger',
      'market',
      'industry',
      'mail',
      'structures',
      'skills',
    ]);
  });

  it('maps group keys to a chip', () => {
    expect(typeChipOfGroupKey('event:marketOrderFilled')).toBe('market');
    expect(typeChipOfGroupKey('event:priceAlertTriggered')).toBe('market');
    expect(typeChipOfGroupKey('event:industryJobComplete')).toBe('industry');
    expect(typeChipOfGroupKey('event:newMail')).toBe('mail');
    expect(typeChipOfGroupKey('event:skillQueueEnding')).toBe('skills');
    expect(typeChipOfGroupKey('event:structureFuelLow')).toBe('structures');
    expect(typeChipOfGroupKey('eveType:StructureUnderAttack')).toBe('structures');
    expect(typeChipOfGroupKey('eveType:CorpAllBillMsg')).toBeNull();
    expect(typeChipOfGroupKey('event:somethingNew')).toBeNull();
  });

  it('filters groups by chip', () => {
    const groups = groupAlertsByType([
      attack('a', 1),
      mail('m', 2),
      entry('p', 'priceAlertTriggered', 3),
      entry('o', 'eveNotification', 4, { eveType: 'CorpAllBillMsg' }),
    ]);
    const keys = (chip: (typeof ALERT_CHIPS)[number]) =>
      filterByChip(groups, chip).map((g) => g.key);
    expect(keys('all')).toHaveLength(4);
    expect(keys('danger')).toEqual(['eveType:StructureUnderAttack']);
    expect(keys('structures')).toEqual(['eveType:StructureUnderAttack']);
    expect(keys('mail')).toEqual(['event:newMail']);
    expect(keys('market')).toEqual(['event:priceAlertTriggered']);
    expect(keys('industry')).toEqual([]);
  });
});

describe('usefulChips', () => {
  const chips = (...entries: NotificationFeedRecord[]) => usefulChips(groupAlertsByType(entries));

  it('is empty with no alerts or a single type', () => {
    expect(chips()).toEqual([]);
    expect(chips(mail('a', 1), mail('b', 2))).toEqual([]);
    expect(chips(attack('a', 1))).toEqual([]);
  });

  it('is empty when every type files under the same chip', () => {
    expect(chips(entry('p', 'priceAlertTriggered', 1), entry('f', 'marketOrderFilled', 2))).toEqual(
      []
    );
  });

  it('lists All plus only the chips that narrow the list', () => {
    expect(chips(mail('m', 1), entry('p', 'priceAlertTriggered', 2), attack('a', 3))).toEqual([
      'all',
      'danger',
      'market',
      'mail',
      'structures',
    ]);
  });

  it('keeps a chip that matches some but not all types', () => {
    expect(
      chips(mail('m', 1), entry('o', 'eveNotification', 2, { eveType: 'CorpAllBillMsg' }))
    ).toEqual(['all', 'mail']);
  });
});

describe('isSnoozable', () => {
  it('is true for price alerts only', () => {
    const groups = groupAlertsByType([entry('p', 'priceAlertTriggered', 1), mail('m', 2)]);
    const byKey = new Map(groups.map((g) => [g.key, g]));
    expect(isSnoozable(byKey.get('event:priceAlertTriggered')!)).toBe(true);
    expect(isSnoozable(byKey.get('event:newMail')!)).toBe(false);
  });
});

describe('alertViewPath', () => {
  it('sends an event to its own page', () => {
    expect(alertViewPath('event:newMail')).toBe('/mail');
    expect(alertViewPath('event:industryJobComplete')).toBe('/industry');
  });

  it('sends structure notifications to the corp page and the rest to the Overview', () => {
    expect(alertViewPath('eveType:StructureUnderAttack')).toBe('/corp');
    expect(alertViewPath('eveType:CorpAllBillMsg')).toBe('/overview');
  });

  it('never points back at the retired Alerts page', () => {
    expect(alertViewPath('event:eveNotification')).toBe('/overview');
  });
});
