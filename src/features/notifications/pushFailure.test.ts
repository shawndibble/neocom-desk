import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyPushError,
  clearPushFailure,
  parsePushFailure,
  recordPushFailure,
  usePushFailure,
} from './pushFailure';

beforeEach(() => {
  usePushFailure.setState({ value: null, hydrated: true });
});

describe('classifyPushError', () => {
  it('maps browser push-service errors to browser-refused', () => {
    expect(classifyPushError({ code: 'messaging/permission-blocked' })).toBe('browser-refused');
    expect(classifyPushError({ code: 'messaging/token-subscribe-failed' })).toBe('browser-refused');
    expect(classifyPushError(new DOMException('no', 'NotAllowedError'))).toBe('browser-refused');
  });

  it('maps connectivity failures to network', () => {
    expect(classifyPushError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyPushError({ code: 'functions/unavailable' })).toBe('network');
  });

  it('maps other backend errors to server-rejected', () => {
    expect(classifyPushError({ code: 'functions/permission-denied' })).toBe('server-rejected');
  });

  it('falls back to unknown', () => {
    expect(classifyPushError(new Error('boom'))).toBe('unknown');
    expect(classifyPushError('x')).toBe('unknown');
  });
});

describe('recording', () => {
  it('stores reason and time only, never the message', async () => {
    await recordPushFailure(new Error('endpoint https://fcm.example/secret'), 1234);
    const value = usePushFailure.getState().value;
    expect(value).toEqual({ reason: 'unknown', at: 1234 });
    expect(JSON.stringify(value)).not.toContain('secret');
  });

  it('a later failure replaces the record; clearing removes it', async () => {
    await recordPushFailure({ code: 'functions/unavailable' }, 1);
    await recordPushFailure('x', 2);
    expect(usePushFailure.getState().value).toEqual({ reason: 'unknown', at: 2 });
    await clearPushFailure();
    expect(usePushFailure.getState().value).toBeNull();
  });
});

describe('parsePushFailure', () => {
  it('accepts a well-formed record and drops extra fields', () => {
    expect(parsePushFailure({ reason: 'network', at: 5, message: 'leak' })).toEqual({
      reason: 'network',
      at: 5,
    });
  });

  it('rejects junk', () => {
    expect(parsePushFailure(null)).toBeNull();
    expect(parsePushFailure({ reason: 'bogus', at: 1 })).toBeNull();
    expect(parsePushFailure({ reason: 'network', at: 'x' })).toBeNull();
  });
});
