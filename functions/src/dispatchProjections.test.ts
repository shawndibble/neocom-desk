import { describe, expect, it } from 'vitest';
import {
  isDue,
  isStaleUnsent,
  isPastRetention,
  shouldDeleteDeviceToken,
  buildPushData,
  STALE_UNSENT_MS,
  FIRED_RETENTION_MS,
  type StoredProjectionRow,
} from './dispatchProjections.js';

const ROW: StoredProjectionRow = {
  occurrenceKey: '1:industryJobComplete:987',
  characterId: 1,
  eventId: 'industryJobComplete',
  fireAt: 1_700_000_000_000,
  title: 'Industry job complete',
  body: "Aurelia's industry job for Tritanium is complete.",
};

describe('isDue', () => {
  it('is due once fireAt has passed', () => {
    expect(isDue(ROW, ROW.fireAt + 1)).toBe(true);
  });

  it('is due exactly at fireAt', () => {
    expect(isDue(ROW, ROW.fireAt)).toBe(true);
  });

  it('is not due before fireAt', () => {
    expect(isDue(ROW, ROW.fireAt - 1)).toBe(false);
  });
});

describe('isStaleUnsent', () => {
  it('is stale once more than 7 days past fireAt', () => {
    expect(isStaleUnsent(ROW, ROW.fireAt + STALE_UNSENT_MS + 1)).toBe(true);
  });

  it('is not stale exactly at the 7-day boundary', () => {
    expect(isStaleUnsent(ROW, ROW.fireAt + STALE_UNSENT_MS)).toBe(false);
  });

  it('is not stale for a row that just became due', () => {
    expect(isStaleUnsent(ROW, ROW.fireAt)).toBe(false);
  });
});

describe('isPastRetention', () => {
  const firedAt = 1_700_000_000_000;

  it('is past retention once more than 30 days after firedAt', () => {
    expect(isPastRetention(firedAt, firedAt + FIRED_RETENTION_MS + 1)).toBe(true);
  });

  it('is not past retention exactly at the 30-day boundary', () => {
    expect(isPastRetention(firedAt, firedAt + FIRED_RETENTION_MS)).toBe(false);
  });
});

describe('shouldDeleteDeviceToken', () => {
  it('deletes on UNREGISTERED', () => {
    expect(shouldDeleteDeviceToken('messaging/registration-token-not-registered')).toBe(true);
  });

  it('deletes on INVALID_ARGUMENT', () => {
    expect(shouldDeleteDeviceToken('messaging/invalid-argument')).toBe(true);
  });

  it('leaves the token alone on any other error', () => {
    expect(shouldDeleteDeviceToken('messaging/internal-error')).toBe(false);
    expect(shouldDeleteDeviceToken('messaging/server-unavailable')).toBe(false);
    expect(shouldDeleteDeviceToken('unknown')).toBe(false);
  });
});

describe('buildPushData', () => {
  it('builds the FCM data payload matching PushPayload, every value a string', () => {
    expect(buildPushData(ROW)).toEqual({
      characterId: '1',
      eventId: 'industryJobComplete',
      occurrenceKey: '1:industryJobComplete:987',
      title: 'Industry job complete',
      body: "Aurelia's industry job for Tritanium is complete.",
    });
  });
});
