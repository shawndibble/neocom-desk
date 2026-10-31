import { describe, it, expect } from 'vitest';
import type { CharacterBoardItem } from '@/engine/character/board';
import { calendarCsvColumns } from './calendarCsv';

const t = (k: string) => k;

function item(overrides: Partial<CharacterBoardItem> = {}): CharacterBoardItem {
  return {
    id: 'calendarEvent:1',
    sourceId: '1',
    kind: 'calendarEvent',
    subject: 'Fleet op',
    detail: '',
    deadlineMs: Date.parse('2026-08-29T18:00:00Z'),
    remainingMs: 1000,
    response: 'accepted',
    important: true,
    ...overrides,
  };
}

function valuesOf(row: CharacterBoardItem) {
  return Object.fromEntries(calendarCsvColumns(t).map((c) => [c.header, c.value(row)]));
}

describe('calendarCsvColumns', () => {
  it('orders columns kind, date, title, detail, response, important, id', () => {
    expect(calendarCsvColumns(t).map((c) => c.header)).toEqual([
      'calendar.csvKind',
      'calendar.csvDate',
      'calendar.csvTitle',
      'calendar.csvDetail',
      'calendar.csvResponse',
      'calendar.csvImportant',
      'calendar.csvProjected',
      'calendar.csvId',
    ]);
  });

  it('exports a calendar event with its response, importance and event id', () => {
    expect(valuesOf(item({ sourceId: '9001', response: 'declined' }))).toEqual({
      'calendar.csvKind': 'calendar.kind.calendarEvent',
      'calendar.csvDate': '2026-08-29T18:00:00.000Z',
      'calendar.csvTitle': 'Fleet op',
      'calendar.csvDetail': undefined,
      'calendar.csvResponse': 'calendar.responseDeclined',
      'calendar.csvImportant': 'calendar.csvYes',
      'calendar.csvProjected': 'calendar.csvNo',
      'calendar.csvId': 9001,
    });
  });

  it('exports every other rail kind with its detail and no RSVP fields', () => {
    expect(
      valuesOf(
        item({
          kind: 'industryJob',
          sourceId: '42',
          subject: 'Rifter',
          detail: 'Jita IV',
          response: null,
          important: false,
        })
      )
    ).toMatchObject({
      'calendar.csvKind': 'calendar.kind.industryJob',
      'calendar.csvDetail': 'calendar.detail.industryJob.Jita IV',
      'calendar.csvResponse': undefined,
      'calendar.csvImportant': undefined,
      'calendar.csvId': 42,
    });
  });
});
