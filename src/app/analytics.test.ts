import { describe, it, expect } from 'vitest';
import { isAnalyticsConfigured } from './analytics';

describe('isAnalyticsConfigured', () => {
  it('is true when a measurement ID is present and not under the test runner', () => {
    expect(
      isAnalyticsConfigured({ MODE: 'production', VITE_FIREBASE_MEASUREMENT_ID: 'G-ABC123' })
    ).toBe(true);
  });

  it('is false when the measurement ID is missing', () => {
    expect(isAnalyticsConfigured({ MODE: 'production', VITE_FIREBASE_MEASUREMENT_ID: '' })).toBe(
      false
    );
    expect(isAnalyticsConfigured({ MODE: 'production' })).toBe(false);
  });

  it('is false under the test runner even with a measurement ID present', () => {
    expect(isAnalyticsConfigured({ MODE: 'test', VITE_FIREBASE_MEASUREMENT_ID: 'G-ABC123' })).toBe(
      false
    );
  });

  it('defaults to reading import.meta.env (which is "test" mode in this suite)', () => {
    expect(isAnalyticsConfigured()).toBe(false);
  });
});
