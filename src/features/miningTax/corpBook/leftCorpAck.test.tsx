import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { useHiddenLeftCorps, useLeftCorpSetting } from './leftCorpAck';

describe('leftCorpAck', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useLeftCorpSetting.setState({ value: [], hydrated: false });
  });

  it('starts empty', async () => {
    const { result } = renderHook(() => useHiddenLeftCorps());
    await waitFor(() => expect(useLeftCorpSetting.getState().hydrated).toBe(true));
    expect(result.current.hidden.size).toBe(0);
  });

  it('holds hidden corporations and releases them again, losing none when they land together', async () => {
    const { result } = renderHook(() => useHiddenLeftCorps());
    act(() => {
      result.current.hide(20);
      result.current.hide(30);
      result.current.hide(20);
    });
    expect([...result.current.hidden].sort()).toEqual([20, 30]);
    act(() => result.current.show(20));
    expect([...result.current.hidden]).toEqual([30]);
    await waitFor(async () =>
      expect((await db.settings.get('corpLeftHidden'))?.value).toEqual([30])
    );
  });

  it('ignores a value another build wrote badly', async () => {
    await db.settings.put({ key: 'corpLeftHidden', value: [20, 'x', -1, 1.5] });
    const { result } = renderHook(() => useHiddenLeftCorps());
    await waitFor(() => expect([...result.current.hidden]).toEqual([20]));
  });
});
