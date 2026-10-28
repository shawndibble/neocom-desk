import { describe, expect, it } from 'vitest';
import {
  HISTORY_MAX,
  HISTORY_WINDOW_MS,
  nameSurvey,
  parseSurveyHistory,
  recordSurvey,
  SURVEY_NAME_MAX,
} from './history';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 24 * 60 * 60 * 1000;

describe('parseSurveyHistory', () => {
  it('keeps well-formed entries, newest first', () => {
    const raw = [
      { id: 'abc123XYZ', addedAt: NOW - 2 * DAY },
      { id: 'def456UVW', addedAt: NOW - DAY },
    ];
    expect(parseSurveyHistory(raw, NOW)).toEqual([raw[1], raw[0]]);
  });

  it('drops malformed entries, bad ids and entries past the 7-day window', () => {
    const raw = [
      { id: 'abc123XYZ', addedAt: NOW - HISTORY_WINDOW_MS - 1 },
      { id: 'short', addedAt: NOW },
      { id: 'def456UVW', addedAt: 'yesterday' },
      { id: 'ghi789RST' },
      null,
      7,
      { id: 'jkl012OPQ', addedAt: NOW - DAY },
    ];
    expect(parseSurveyHistory(raw, NOW)).toEqual([{ id: 'jkl012OPQ', addedAt: NOW - DAY }]);
  });

  it('is empty for anything that is not a list', () => {
    expect(parseSurveyHistory('nope', NOW)).toEqual([]);
    expect(parseSurveyHistory(undefined, NOW)).toEqual([]);
  });

  it('keeps one entry per id, the latest', () => {
    const raw = [
      { id: 'abc123XYZ', addedAt: NOW - 2 * DAY },
      { id: 'abc123XYZ', addedAt: NOW - DAY },
    ];
    expect(parseSurveyHistory(raw, NOW)).toEqual([{ id: 'abc123XYZ', addedAt: NOW - DAY }]);
  });
});

describe('recordSurvey', () => {
  const list = [{ id: 'abc123XYZ', addedAt: NOW - DAY }];

  it('puts a new survey first', () => {
    expect(recordSurvey(list, 'def456UVW', NOW)).toEqual([
      { id: 'def456UVW', addedAt: NOW },
      { id: 'abc123XYZ', addedAt: NOW - DAY },
    ]);
  });

  it('keeps the first-seen time for a survey already listed, so a reopen does not renew it', () => {
    expect(recordSurvey(list, 'abc123XYZ', NOW)).toEqual(list);
  });

  it('prunes entries past the window and caps the list', () => {
    const old = { id: 'old000000', addedAt: NOW - HISTORY_WINDOW_MS - 1 };
    expect(recordSurvey([old, ...list], 'def456UVW', NOW).map((e) => e.id)).toEqual([
      'def456UVW',
      'abc123XYZ',
    ]);
    const many = Array.from({ length: HISTORY_MAX }, (_, i) => ({
      id: `id${String(i).padStart(7, '0')}`,
      addedAt: NOW - i,
    }));
    expect(recordSurvey(many, 'def456UVW', NOW)).toHaveLength(HISTORY_MAX);
  });

  it('keeps at most 8: a ninth drops the oldest and the new one is first', () => {
    expect(HISTORY_MAX).toBe(8);
    const full = Array.from({ length: 8 }, (_, i) => ({
      id: `id${String(i).padStart(7, '0')}`,
      addedAt: NOW - (i + 1) * 1000,
    }));
    const next = recordSurvey(full, 'def456UVW', NOW);
    expect(next).toHaveLength(8);
    expect(next[0]!.id).toBe('def456UVW');
    expect(next.map((e) => e.id)).not.toContain('id0000007');
  });

  it('trims a stored list of 12 to the newest 8', () => {
    const raw = Array.from({ length: 12 }, (_, i) => ({
      id: `id${String(i).padStart(7, '0')}`,
      addedAt: NOW - (i + 1) * 1000,
    }));
    const parsed = parseSurveyHistory(raw, NOW);
    expect(parsed.map((e) => e.id)).toEqual(raw.slice(0, 8).map((e) => e.id));
  });

  it('a repeat open of the oldest listed survey keeps it and its time', () => {
    const full = Array.from({ length: 8 }, (_, i) => ({
      id: `id${String(i).padStart(7, '0')}`,
      addedAt: NOW - (i + 1) * 1000,
    }));
    const next = recordSurvey(full, 'id0000007', NOW);
    expect(next).toEqual(full);
  });
});

describe('survey names', () => {
  const list = [
    { id: 'abc123XYZ', addedAt: NOW - DAY },
    { id: 'def456UVW', addedAt: NOW - 2 * DAY },
  ];

  it('keeps a stored name, trimmed and capped, and drops a blank or non-string one', () => {
    const raw = [
      { id: 'abc123XYZ', addedAt: NOW - DAY, name: '  Belt 3  ' },
      { id: 'def456UVW', addedAt: NOW - 2 * DAY, name: '   ' },
      { id: 'ghi789RST', addedAt: NOW - 3 * DAY, name: 42 },
      { id: 'jkl012OPQ', addedAt: NOW - 4 * DAY, name: 'x'.repeat(SURVEY_NAME_MAX + 5) },
    ];
    const parsed = parseSurveyHistory(raw, NOW);
    expect(parsed[0]).toEqual({ id: 'abc123XYZ', addedAt: NOW - DAY, name: 'Belt 3' });
    expect(parsed[1]).toEqual({ id: 'def456UVW', addedAt: NOW - 2 * DAY });
    expect('name' in parsed[1]!).toBe(false);
    expect(parsed[2]).toEqual({ id: 'ghi789RST', addedAt: NOW - 3 * DAY });
    expect(parsed[3]!.name).toHaveLength(SURVEY_NAME_MAX);
  });

  it('names one survey, trimmed and capped, leaving the order and the rest alone', () => {
    expect(nameSurvey(list, 'def456UVW', '  Moon ore  ')).toEqual([
      list[0],
      { id: 'def456UVW', addedAt: NOW - 2 * DAY, name: 'Moon ore' },
    ]);
    expect(nameSurvey(list, 'abc123XYZ', 'y'.repeat(SURVEY_NAME_MAX + 1))[0]!.name).toHaveLength(
      SURVEY_NAME_MAX
    );
  });

  it('removes the name when it is cleared', () => {
    const named = nameSurvey(list, 'abc123XYZ', 'Belt 3');
    const cleared = nameSurvey(named, 'abc123XYZ', '  ');
    expect(cleared[0]).toEqual(list[0]);
    expect('name' in cleared[0]!).toBe(false);
  });

  it('returns the list as it was for a survey not in it', () => {
    expect(nameSurvey(list, 'zzz999ZZZ', 'Belt 3')).toBe(list);
  });

  it('keeps the name when the survey is opened again', () => {
    const named = nameSurvey(list, 'abc123XYZ', 'Belt 3');
    expect(recordSurvey(named, 'abc123XYZ', NOW)[0]).toEqual({
      id: 'abc123XYZ',
      addedAt: NOW - DAY,
      name: 'Belt 3',
    });
  });
});
