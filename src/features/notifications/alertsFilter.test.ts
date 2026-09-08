import { describe, it, expect } from 'vitest';
import type { NotificationFeedRecord } from '@/db';
import {
  EMPTY_ALERTS_FILTER,
  activeAlertsFilterCount,
  filterAlertGroups,
  type DisplayAlertGroup,
} from './alertsFilter';

function group(over: Partial<DisplayAlertGroup> = {}): DisplayAlertGroup {
  const entries: NotificationFeedRecord[] = over.entries ?? [
    {
      id: 'a',
      characterId: 1,
      eventId: 'newMail',
      title: 'New mail',
      body: 'From Sera Vantis',
      firedAt: 1,
    },
  ];
  return {
    key: 'event:newMail',
    target: { kind: 'event', eventId: 'newMail' },
    severity: 'watch',
    count: entries.length,
    newestFiredAt: 1,
    entries,
    characterIds: [1],
    label: 'New mail',
    muted: false,
    ...over,
  };
}

describe('filterAlertGroups', () => {
  it('passes everything through when nothing is set', () => {
    const groups = [group(), group({ key: 'event:newMail2', label: 'Other' })];
    expect(filterAlertGroups(groups, EMPTY_ALERTS_FILTER)).toHaveLength(2);
  });

  /*
   * Muted types are hidden by default and revealed by a chip, rather than
   * simply absent: `NotificationContextMenu` calls its own mute "one-way from
   * here", because the row it was set from is gone the moment it applies. This
   * page is where that becomes reversible, so the rows have to be reachable.
   */
  it('hides muted types until they are asked for', () => {
    const groups = [group(), group({ key: 'muted', label: 'Corp member joined', muted: true })];
    expect(filterAlertGroups(groups, EMPTY_ALERTS_FILTER)).toHaveLength(1);
    expect(filterAlertGroups(groups, { ...EMPTY_ALERTS_FILTER, showMuted: true })).toHaveLength(2);
  });

  it('matches a query against the type name', () => {
    const groups = [
      group({ label: 'Structure under attack' }),
      group({ key: 'b', label: 'New mail' }),
    ];
    const found = filterAlertGroups(groups, { ...EMPTY_ALERTS_FILTER, query: 'structure' });
    expect(found.map((g) => g.label)).toEqual(['Structure under attack']);
  });

  it('matches a query against what an individual alert actually said', () => {
    // The type name is "EVE notification"; what you remember is the structure.
    const groups = [
      group({
        label: 'Structure fuel low',
        entries: [
          {
            id: 'x',
            characterId: 1,
            eventId: 'eveNotification',
            eveType: 'StructureFuelAlert',
            title: 'Structure fuel low',
            body: 'Raitaru · Ahbazon III has 12 hours of fuel',
            firedAt: 5,
          },
        ],
      }),
      group({ key: 'b', label: 'New mail' }),
    ];
    const found = filterAlertGroups(groups, { ...EMPTY_ALERTS_FILTER, query: 'ahbazon' });
    expect(found.map((g) => g.label)).toEqual(['Structure fuel low']);
  });

  it('ignores case and surrounding space in a query', () => {
    const groups = [group({ label: 'Structure under attack' })];
    expect(
      filterAlertGroups(groups, { ...EMPTY_ALERTS_FILTER, query: '  STRUCTURE ' })
    ).toHaveLength(1);
  });

  it('keeps only the chosen severities, and an empty set means every severity', () => {
    const groups = [
      group({ key: 'c', severity: 'critical' }),
      group({ key: 'w', severity: 'clear' }),
    ];
    expect(filterAlertGroups(groups, EMPTY_ALERTS_FILTER)).toHaveLength(2);
    const critical = filterAlertGroups(groups, {
      ...EMPTY_ALERTS_FILTER,
      severities: new Set(['critical']),
    });
    expect(critical.map((g) => g.key)).toEqual(['c']);
  });

  it('applies a severity filter to muted rows too, once they are shown', () => {
    const groups = [group({ key: 'm', severity: 'critical', muted: true })];
    expect(
      filterAlertGroups(groups, {
        ...EMPTY_ALERTS_FILTER,
        showMuted: true,
        severities: new Set(['clear']),
      })
    ).toEqual([]);
  });
});

describe('activeAlertsFilterCount', () => {
  it('is zero for the default filter, so the trigger carries no badge', () => {
    expect(activeAlertsFilterCount(EMPTY_ALERTS_FILTER)).toBe(0);
  });

  /*
   * Each *chosen severity* counts, not the severity filter as a whole — the
   * convention `openOrdersFilter.ts` sets, where a multi-select contributes one
   * removable chip per member. The badge answers "how many constraints are on
   * this list", and two severities are two.
   */
  it('counts each chosen value, not each control', () => {
    expect(
      activeAlertsFilterCount({
        query: 'fuel',
        characterId: 42,
        severities: new Set(['critical', 'warning']),
        showMuted: true,
      })
    ).toBe(5);
  });
});
