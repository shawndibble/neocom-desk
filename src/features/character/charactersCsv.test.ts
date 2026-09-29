import { describe, it, expect } from 'vitest';
import { charactersCsvColumns, type CharacterCsvRow } from './charactersCsv';

const t = (k: string) => k;
const NOW = Date.parse('2026-09-29T12:00:00Z');

function row(overrides: Partial<CharacterCsvRow> = {}): CharacterCsvRow {
  return {
    character: { name: 'Rixx Javix' },
    info: { corporationName: 'Brave Newbies', allianceName: null },
    groupId: 'g1',
    stats: { name: 'Rixx Javix', skillPoints: 52_000_000, wallet: 1_234_567.89 },
    queue: {
      state: 'training',
      fetchedAt: null,
      trainingFinishMs: Date.parse('2026-10-01T08:30:00Z'),
    },
    attention: {
      characterId: 1,
      jobCounts: { manufacturing: 2, science: 1, reaction: 0 },
      jobCountsFetchedAt: null,
      piAttention: 'expiring-soon',
      piSoonestExpiryMs: Date.parse('2026-09-30T00:00:00Z'),
      piFetchedAt: null,
    },
    // 11 manufacturing, 11 science, 11 reaction slots.
    jobSlotSkills: {
      massProduction: 5,
      advancedMassProduction: 5,
      laboratoryOperation: 5,
      advancedLaboratoryOperation: 5,
      massReactions: 5,
      advancedMassReactions: 5,
    },
    totalSp: 52_000_000,
    alertCount: 3,
    starred: true,
    ...overrides,
  } as CharacterCsvRow;
}

function build(options: Partial<Parameters<typeof charactersCsvColumns>[1]> = {}) {
  return charactersCsvColumns(t, {
    groupNameById: new Map([['g1', 'Mains']]),
    spExtractionEnabled: true,
    spExtractionThresholdSp: 5_500_000,
    lastSynced: () => new Date('2026-09-29T11:00:00Z'),
    now: () => NOW,
    ...options,
  });
}

function valuesOf(r: CharacterCsvRow, options: Parameters<typeof build>[0] = {}) {
  return Object.fromEntries(build(options).map((c) => [c.header, c.value(r)]));
}

describe('charactersCsvColumns', () => {
  it('orders columns like the table, with the timestamps behind countdowns as their own columns', () => {
    expect(build().map((c) => c.header)).toEqual([
      'characters.column.name',
      'characters.column.corp',
      'characters.column.group',
      'characters.column.spTotal',
      'characters.column.wallet',
      'characters.column.lastSynced',
      'characters.column.training',
      'characters.csvTrainingFinishes',
      'characters.jobSlotCategory.manufacturing',
      'characters.jobSlotCategory.science',
      'characters.jobSlotCategory.reaction',
      'characters.column.pi',
      'characters.csvPiExpires',
      'characters.column.spReady',
      'characters.column.alerts',
      'characters.column.starred',
    ]);
  });

  it('leaves out SP ready while SP-extraction monitoring is off, as the table does', () => {
    expect(build({ spExtractionEnabled: false }).map((c) => c.header)).not.toContain(
      'characters.column.spReady'
    );
  });

  it('emits names as text and SP, wallet, alerts as raw numbers', () => {
    expect(valuesOf(row())).toMatchObject({
      'characters.column.name': 'Rixx Javix',
      'characters.column.corp': 'Brave Newbies',
      'characters.column.group': 'Mains',
      'characters.column.spTotal': 52_000_000,
      'characters.column.wallet': 1_234_567.89,
      'characters.column.alerts': 3,
      'characters.column.starred': 'characters.column.starred',
    });
  });

  it('emits timestamps as ISO UTC strings, never a countdown', () => {
    expect(valuesOf(row())).toMatchObject({
      'characters.column.lastSynced': '2026-09-29T11:00:00.000Z',
      'characters.csvTrainingFinishes': '2026-10-01T08:30:00.000Z',
      'characters.csvPiExpires': '2026-09-30T00:00:00.000Z',
      'characters.column.training': 'characters.queueStates.training',
      'characters.column.pi': 'pi.attention.expiring-soon',
    });
  });

  it('counts open (free) job slots per category as numbers', () => {
    const values = valuesOf(row());
    expect(typeof values['characters.jobSlotCategory.manufacturing']).toBe('number');
    expect(
      (values['characters.jobSlotCategory.science'] as number) -
        (values['characters.jobSlotCategory.manufacturing'] as number)
    ).toBe(1);
  });

  it('leaves unknown values blank rather than guessing', () => {
    const values = valuesOf(
      row({
        info: undefined,
        groupId: null,
        stats: undefined,
        queue: undefined,
        attention: undefined,
        jobSlotSkills: undefined,
        totalSp: undefined,
        starred: false,
      }),
      { lastSynced: () => undefined }
    );
    expect(values).toMatchObject({
      'characters.column.corp': undefined,
      'characters.column.group': undefined,
      'characters.column.spTotal': undefined,
      'characters.column.wallet': undefined,
      'characters.column.lastSynced': undefined,
      'characters.column.training': undefined,
      'characters.csvTrainingFinishes': undefined,
      'characters.jobSlotCategory.manufacturing': undefined,
      'characters.column.pi': undefined,
      'characters.csvPiExpires': undefined,
      'characters.column.spReady': undefined,
      'characters.column.starred': undefined,
    });
  });

  it('reads a PI program whose extractors already expired as stopped, as the table does', () => {
    const values = valuesOf(
      row({
        attention: {
          ...row().attention!,
          piAttention: 'expiring-soon',
          piSoonestExpiryMs: NOW - 1000,
        },
      })
    );
    expect(values['characters.column.pi']).toBe('pi.attention.idle');
  });

  it('marks SP ready only past the extraction threshold', () => {
    expect(valuesOf(row())['characters.column.spReady']).toBe('characters.spReadyYes');
    expect(valuesOf(row({ totalSp: 1_000_000 }))['characters.column.spReady']).toBeUndefined();
  });
});
