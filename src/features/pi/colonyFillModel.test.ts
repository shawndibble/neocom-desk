import { describe, expect, it } from 'vitest';
import { colonyCountUnknown, fillsBeforeHaul } from './colonyFillModel';

describe('fillsBeforeHaul', () => {
  it('flags a colony shorter than the haul window', () => {
    expect(fillsBeforeHaul(19, 24)).toBe(true);
  });

  it('does not flag a colony that outlasts the haul window', () => {
    expect(fillsBeforeHaul(200, 24)).toBe(false);
  });

  it('does not flag an equal window — strictly shorter, not shorter-or-equal', () => {
    expect(fillsBeforeHaul(24, 24)).toBe(false);
  });

  it('never flags an unreadable colony', () => {
    expect(fillsBeforeHaul(null, 24)).toBe(false);
  });

  it('does not flag a rare hauler whose long cadence still outruns the colony', () => {
    // A 200 h colony is not shorter than a 168 h (weekly) haul window.
    expect(fillsBeforeHaul(200, 168)).toBe(false);
  });
});

describe('colonyCountUnknown', () => {
  it('is unknown when a re-login is needed or ESI did not answer', () => {
    expect(colonyCountUnknown({ needsReauth: true, fetchFailed: false })).toBe(true);
    expect(colonyCountUnknown({ needsReauth: false, fetchFailed: true })).toBe(true);
  });

  it('is known otherwise, including a cached empty list', () => {
    expect(colonyCountUnknown({ needsReauth: false, fetchFailed: false })).toBe(false);
    expect(colonyCountUnknown(null)).toBe(false);
  });
});
