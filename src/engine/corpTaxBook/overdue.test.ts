import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OVERDUE_DAYS,
  DECLARATION_PAUSE_DAYS,
  overdueStatus,
  type Declaration,
} from './overdue';

const ISSUED = '2026-08-01T00:00:00Z';

function declaration(at: string, extra: Partial<Declaration> = {}): Declaration {
  return { id: 'dc1', statementId: 's1', kind: 'contract', at, ...extra };
}

describe('overdueStatus', () => {
  it('goes Overdue 14 days after issue by default, never earlier', () => {
    expect(DEFAULT_OVERDUE_DAYS).toBe(14);
    expect(
      overdueStatus({
        issuedAt: ISSUED,
        settled: false,
        now: '2026-08-14T23:59:00Z',
        declarations: [],
      })
    ).toMatchObject({
      state: 'open',
      overdueAt: '2026-08-15T00:00:00.000Z',
    });
    expect(
      overdueStatus({
        issuedAt: ISSUED,
        settled: false,
        now: '2026-08-15T00:00:00Z',
        declarations: [],
      }).state
    ).toBe('overdue');
  });

  it('honours a configured number of days', () => {
    expect(
      overdueStatus({
        issuedAt: ISSUED,
        settled: false,
        now: '2026-08-08T00:00:00Z',
        declarations: [],
        overdueDays: 7,
      }).state
    ).toBe('overdue');
  });

  it('a settled Statement is never Overdue', () => {
    expect(
      overdueStatus({
        issuedAt: ISSUED,
        settled: true,
        now: '2026-12-01T00:00:00Z',
        declarations: [],
      }).state
    ).toBe('settled');
  });

  it('a declaration pauses Overdue', () => {
    const status = overdueStatus({
      issuedAt: ISSUED,
      settled: false,
      now: '2026-08-20T00:00:00Z',
      declarations: [declaration('2026-08-10T00:00:00Z')],
    });
    expect(status.state).toBe('paused');
    expect(status.pausedUntil).toBe('2026-08-24T00:00:00.000Z');
  });

  it('the pause lasts at most 14 days, then the clock resumes on its own with a note', () => {
    expect(DECLARATION_PAUSE_DAYS).toBe(14);
    const status = overdueStatus({
      issuedAt: ISSUED,
      settled: false,
      now: '2026-08-29T00:00:00Z',
      declarations: [declaration('2026-08-10T00:00:00Z')],
    });
    // Paused 14 of the 14 days: Overdue moves from 15 Aug to 29 Aug.
    expect(status).toMatchObject({
      state: 'overdue',
      overdueAt: '2026-08-29T00:00:00.000Z',
      resumedAfterPause: true,
    });
  });

  it('a declaration made after it went Overdue pauses it, and it is Overdue again once the pause ends', () => {
    const declarations = [declaration('2026-08-20T00:00:00Z')];
    expect(
      overdueStatus({ issuedAt: ISSUED, settled: false, now: '2026-08-25T00:00:00Z', declarations })
        .state
    ).toBe('paused');
    expect(
      overdueStatus({ issuedAt: ISSUED, settled: false, now: '2026-09-03T00:00:00Z', declarations })
        .state
    ).toBe('overdue');
  });

  it('caps the unanswered pause at 14 days per Statement — filing again does not extend it', () => {
    const status = overdueStatus({
      issuedAt: ISSUED,
      settled: false,
      now: '2026-09-01T00:00:00Z',
      declarations: [
        declaration('2026-08-10T00:00:00Z'),
        declaration('2026-08-24T00:00:00Z', { id: 'dc2' }),
      ],
    });
    expect(status).toMatchObject({ state: 'overdue', overdueAt: '2026-08-29T00:00:00.000Z' });
  });

  it('a confirmed declaration ends the pause where it was confirmed', () => {
    const status = overdueStatus({
      issuedAt: ISSUED,
      settled: false,
      now: '2026-08-20T00:00:00Z',
      declarations: [
        declaration('2026-08-10T00:00:00Z', {
          resolution: { kind: 'confirmed', at: '2026-08-12T00:00:00Z' },
        }),
      ],
    });
    expect(status).toMatchObject({ state: 'overdue', overdueAt: '2026-08-17T00:00:00.000Z' });
  });

  it('a rejected declaration gives a fresh 14 days from the rejection', () => {
    const status = overdueStatus({
      issuedAt: ISSUED,
      settled: false,
      now: '2026-09-01T00:00:00Z',
      declarations: [
        declaration('2026-08-20T00:00:00Z', {
          resolution: { kind: 'rejected', at: '2026-08-22T00:00:00Z', reason: 'No contract found' },
        }),
      ],
    });
    expect(status).toMatchObject({ state: 'open', overdueAt: '2026-09-05T00:00:00.000Z' });
  });
});
