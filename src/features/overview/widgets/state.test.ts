import { describe, expect, it } from 'vitest';
import { resolveWidget, resolveWidgetState, type WidgetStateInput } from './state';

const base: WidgetStateInput = {
  loading: false,
  needsPermission: false,
  error: false,
  hasData: true,
  isEmpty: false,
};
const s = (over: Partial<WidgetStateInput>) => resolveWidgetState({ ...base, ...over });

describe('resolveWidgetState', () => {
  it('is ok with data and nothing wrong', () => {
    expect(s({})).toBe('ok');
  });

  it('is loading while nothing has arrived yet', () => {
    expect(s({ loading: true, hasData: false })).toBe('loading');
  });

  it('is loading when idle with no data, no error and not empty (not read yet)', () => {
    expect(s({ hasData: false })).toBe('loading');
  });

  it('keeps showing data while a refresh is in flight', () => {
    expect(s({ loading: true, hasData: true })).toBe('ok');
  });

  it('is empty when the read worked and found nothing', () => {
    expect(s({ isEmpty: true })).toBe('empty');
  });

  it('is failed on an error', () => {
    expect(s({ error: true, hasData: false })).toBe('failed');
    expect(s({ error: true, hasData: true })).toBe('failed');
  });

  it('a retry in flight after a failure with nothing to show is loading', () => {
    expect(s({ error: true, loading: true, hasData: false })).toBe('loading');
  });

  it('needs permission outranks everything', () => {
    expect(s({ needsPermission: true, loading: true, hasData: false })).toBe('needsPermission');
    expect(s({ needsPermission: true, error: true })).toBe('needsPermission');
    expect(s({ needsPermission: true, isEmpty: true })).toBe('needsPermission');
  });

  it('failed outranks empty', () => {
    expect(s({ error: true, isEmpty: true })).toBe('failed');
  });
});

describe('resolveWidgetState with a lapsed grant over cached data', () => {
  it('keeps showing the cached data when the grant lapsed but a saved copy exists', () => {
    expect(s({ needsPermission: true, hasStaleData: true })).toBe('ok');
  });

  it('still shows the empty and failed states a saved copy would otherwise get', () => {
    expect(s({ needsPermission: true, hasStaleData: true, isEmpty: true })).toBe('empty');
    expect(s({ needsPermission: true, hasStaleData: true, error: true })).toBe('failed');
  });

  it('shows the full prompt when there is no saved copy', () => {
    expect(s({ needsPermission: true, hasStaleData: false })).toBe('needsPermission');
    expect(s({ needsPermission: true })).toBe('needsPermission');
  });

  it('ignores a saved copy when the grant is fine', () => {
    expect(s({ needsPermission: false, hasStaleData: true })).toBe('ok');
  });
});

describe('resolveWidget', () => {
  it('asks for the small sign-in note only when the lapsed grant sits over cached data', () => {
    expect(resolveWidget({ ...base, needsPermission: true, hasStaleData: true })).toEqual({
      state: 'ok',
      showLastGood: false,
      reauthNote: true,
    });
    expect(resolveWidget({ ...base, needsPermission: true })).toEqual({
      state: 'needsPermission',
      showLastGood: false,
      reauthNote: false,
    });
  });

  it('shows the last good value only on failed with data', () => {
    expect(resolveWidget({ ...base, error: true })).toEqual({
      state: 'failed',
      showLastGood: true,
      reauthNote: false,
    });
    expect(resolveWidget({ ...base, error: true, hasData: false })).toEqual({
      state: 'failed',
      showLastGood: false,
      reauthNote: false,
    });
    expect(resolveWidget(base)).toEqual({ state: 'ok', showLastGood: false, reauthNote: false });
  });
});
