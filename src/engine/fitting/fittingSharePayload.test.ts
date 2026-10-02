import { describe, expect, it } from 'vitest';
import {
  fittingSharePayload,
  MAX_FITTING_SHARE_CODE_LENGTH,
  parseFittingSharePayload,
} from './fittingSharePayload';

describe('fittingSharePayload', () => {
  it('wraps the Fitting Share Code verbatim', () => {
    expect(fittingSharePayload('2.abc_DEF-123')).toEqual({ v: 1, code: '2.abc_DEF-123' });
  });
});

describe('parseFittingSharePayload', () => {
  it('round-trips a built payload', () => {
    const payload = fittingSharePayload('2.abc');
    expect(parseFittingSharePayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  it('rejects anything that is not a version-1 payload holding a plausible code', () => {
    expect(parseFittingSharePayload(null)).toBeNull();
    expect(parseFittingSharePayload('2.abc')).toBeNull();
    expect(parseFittingSharePayload({ v: 2, code: '2.abc' })).toBeNull();
    expect(parseFittingSharePayload({ v: 1, code: 7 })).toBeNull();
    expect(parseFittingSharePayload({ v: 1, code: '' })).toBeNull();
    expect(
      parseFittingSharePayload({ v: 1, code: 'x'.repeat(MAX_FITTING_SHARE_CODE_LENGTH + 1) })
    ).toBeNull();
  });
});
