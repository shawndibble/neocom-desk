import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  keptDayKey,
  keptNoticeKey,
  notPayingDayKey,
  noticeKey,
  parseNotPayingKey,
  uncreditedKey,
  useNotPaying,
  useNotPayingSetting,
} from './notPaying';

describe('not paying, on this device', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useNotPayingSetting.setState({ value: [], hydrated: false });
  });

  it('hides and shows again by key, and keeps it on this device', async () => {
    const { result } = renderHook(() => useNotPaying());
    const key = notPayingDayKey(1, 7, '2026-11-06');
    await act(() => result.current.hide(key));
    expect(result.current.hidden).toEqual(new Set(['day:1:7:2026-11-06']));
    expect((await db.settings.get('miningTaxNotPaying'))?.value).toEqual([key]);
    await act(() => result.current.show(key));
    expect(result.current.hidden).toEqual(new Set());
  });

  it('loses no hide when two land together', async () => {
    const { result } = renderHook(() => useNotPaying());
    await act(async () => {
      await Promise.all([result.current.hide('a'), result.current.hide('b')]);
    });
    expect(result.current.hidden).toEqual(new Set(['a', 'b']));
    expect((await db.settings.get('miningTaxNotPaying'))?.value).toEqual(['a', 'b']);
  });

  it('keys uncredited donations by when they were sent, in any order', () => {
    expect(uncreditedKey(1, ['b', 'a'])).toBe(uncreditedKey(1, ['a', 'b']));
    expect(uncreditedKey(1, ['a'])).not.toBe(uncreditedKey(1, ['a', 'b']));
  });

  it('reads a key back, and nothing from one it did not write', () => {
    expect(parseNotPayingKey(notPayingDayKey(1, 7, '2026-11-06'))).toEqual({
      kind: 'day',
      corporationId: 1,
      date: '2026-11-06',
    });
    expect(parseNotPayingKey(uncreditedKey(2, ['x']))).toEqual({
      kind: 'uncredited',
      corporationId: 2,
    });
    expect(parseNotPayingKey(noticeKey(3, 's1'))).toEqual({
      kind: 'notice',
      corporationId: 3,
    });
    expect(parseNotPayingKey(keptDayKey(1, 7, '2026-11-06', '2026-11-10T00:00:00Z'))).toEqual({
      kind: 'day',
      corporationId: 1,
      date: '2026-11-06',
    });
    expect(parseNotPayingKey(keptNoticeKey(3, 's1', '2026-11-10T00:00:00Z'))).toEqual({
      kind: 'notice',
      corporationId: 3,
    });
    expect(parseNotPayingKey('nope')).toBeUndefined();
  });

  it('reads nothing rather than failing on a malformed store', async () => {
    await db.settings.put({ key: 'miningTaxNotPaying', value: 'nope' });
    const { result } = renderHook(() => useNotPaying());
    await waitFor(() => expect(useNotPayingSetting.getState().hydrated).toBe(true));
    expect(result.current.hidden).toEqual(new Set());
  });
});
