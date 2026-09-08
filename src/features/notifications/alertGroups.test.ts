import { describe, it, expect } from 'vitest';
import type { NotificationFeedRecord } from '@/db';
import { alertSeverity, groupAlertsByType, alertGroupKey } from './alertGroups';

function entry(over: Partial<NotificationFeedRecord> = {}): NotificationFeedRecord {
  return {
    id: Math.random().toString(36).slice(2),
    characterId: 1,
    eventId: 'marketOrderFilled',
    title: 'Market order filled',
    body: 'Tritanium x1',
    firedAt: 1_000,
    ...over,
  };
}

describe('alertGroupKey', () => {
  it('keys an EVE notification off its type, not its parent event', () => {
    // Every EVE notification shares the `eveNotification` eventId; grouping on
    // that alone would collapse "structure under attack" into "corp bill due".
    const attack = entry({ eventId: 'eveNotification', eveType: 'StructureUnderAttack' });
    const bill = entry({ eventId: 'eveNotification', eveType: 'CorpAllBillMsg' });
    expect(alertGroupKey(attack)).not.toBe(alertGroupKey(bill));
  });

  it('keys an app event off its eventId', () => {
    expect(alertGroupKey(entry({ eventId: 'newMail' }))).toBe(
      alertGroupKey(entry({ eventId: 'newMail', title: 'different copy' }))
    );
  });
});

describe('groupAlertsByType', () => {
  it('collapses a type to one row carrying its count', () => {
    const groups = groupAlertsByType([
      entry({ eventId: 'marketOrderFilled' }),
      entry({ eventId: 'marketOrderFilled' }),
      entry({ eventId: 'newMail' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.count).sort()).toEqual([1, 2]);
  });

  it('sorts worst severity first', () => {
    const groups = groupAlertsByType([
      entry({ eventId: 'marketOrderFilled' }),
      entry({ eventId: 'eveNotification', eveType: 'StructureUnderAttack' }),
      entry({ eventId: 'skillLevelComplete' }),
    ]);
    expect(groups[0].severity).toBe('critical');
    expect(groups[0].target).toEqual({ kind: 'eveType', type: 'StructureUnderAttack' });
  });

  it('breaks a severity tie on the newest fire, so the liveliest type leads', () => {
    // Both `watch`, so severity decides nothing and the clock has to.
    const groups = groupAlertsByType([
      entry({ eventId: 'newMail', firedAt: 500 }),
      entry({ eventId: 'contractAccepted', firedAt: 900 }),
    ]);
    expect(groups[0].target).toEqual({ kind: 'event', eventId: 'contractAccepted' });
    expect(groups[0].newestFiredAt).toBe(900);
  });

  it('reports the newest fire in a group, whatever order the entries arrive in', () => {
    const groups = groupAlertsByType([
      entry({ eventId: 'newMail', firedAt: 100 }),
      entry({ eventId: 'newMail', firedAt: 700 }),
      entry({ eventId: 'newMail', firedAt: 300 }),
    ]);
    expect(groups[0].newestFiredAt).toBe(700);
  });

  it('keeps a group’s own entries newest-first, so expanding one reads like the feed', () => {
    const groups = groupAlertsByType([
      entry({ eventId: 'newMail', firedAt: 100 }),
      entry({ eventId: 'newMail', firedAt: 700 }),
      entry({ eventId: 'newMail', firedAt: 300 }),
    ]);
    expect(groups[0].entries.map((e) => e.firedAt)).toEqual([700, 300, 100]);
  });

  it('counts the characters a type fired for — the page is device-wide', () => {
    const groups = groupAlertsByType([
      entry({ eventId: 'newMail', characterId: 1 }),
      entry({ eventId: 'newMail', characterId: 2 }),
      entry({ eventId: 'newMail', characterId: 1 }),
    ]);
    expect(groups[0].characterIds).toEqual([1, 2]);
  });

  it('is empty for an empty feed', () => {
    expect(groupAlertsByType([])).toEqual([]);
  });
});

describe('alertSeverity', () => {
  it('ranks losing a structure above being billed for one', () => {
    expect(alertSeverity({ kind: 'eveType', type: 'StructureDestroyed' })).toBe('critical');
    expect(alertSeverity({ kind: 'eveType', type: 'CorpAllBillMsg' })).toBe('warning');
  });

  it('treats a filled order as news, not a problem', () => {
    expect(alertSeverity({ kind: 'event', eventId: 'marketOrderFilled' })).toBe('clear');
  });

  it('puts something that stopped happening above something that finished', () => {
    // Nothing training is a standing fault; a level completing is an FYI.
    expect(alertSeverity({ kind: 'event', eventId: 'characterNotTraining' })).toBe('warning');
    expect(alertSeverity({ kind: 'event', eventId: 'skillLevelComplete' })).toBe('watch');
  });

  it('falls back to watch for a type it has no opinion about', () => {
    // An entry written by a newer build, or an eveType outside the allow-list.
    expect(alertSeverity({ kind: 'eveType', type: 'SomethingUnheardOf' })).toBe('watch');
  });
});
