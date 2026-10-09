import { describe, expect, it } from 'vitest';
import { HISTORY_MAX, HISTORY_WINDOW_MS, parseSurveyHistory, recordSurvey } from './history';

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
});
