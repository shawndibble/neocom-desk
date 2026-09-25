import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedFitting } from '@/engine/fittings/load';
import type { Fitting } from '@/engine/fittings/types';
import { useFittingPicker } from './useFittingPicker';

const { encode, load } = vi.hoisted(() => ({ encode: vi.fn(), load: vi.fn() }));
vi.mock('@/engine/fitting/fittingShare', () => ({ encodeFittingShare: encode }));
vi.mock('@/engine/fittings/shareMapper', () => ({ fittingToShareInput: (f: Fitting) => f }));
vi.mock('./loadFittingFromText', () => ({ loadFittingFromText: load }));

const fitting = { hullTypeId: 1 } as unknown as Fitting;
const loaded: LoadedFitting = { kind: 'fitting', source: 'in-game', fitting, unresolved: [] };

describe('useFittingPicker', () => {
  beforeEach(() => {
    encode.mockReset();
    load.mockReset();
  });

  it('hands a saved Fitting back by its own Share Link code', () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => useFittingPicker(onPick));
    act(() => result.current.openSaved({ id: 'a', name: 'A', code: 'abc' }));
    expect(onPick).toHaveBeenCalledWith('abc');
    expect(encode).not.toHaveBeenCalled();
  });

  it('encodes an In-game Fitting into a code', async () => {
    encode.mockResolvedValue({ ok: true, payload: 'enc' });
    const onPick = vi.fn();
    const { result } = renderHook(() => useFittingPicker(onPick));
    await act(() => result.current.openLoaded(loaded));
    expect(onPick).toHaveBeenCalledWith('enc');
  });

  it('flags a Fitting too large for a Share Link and picks nothing', async () => {
    encode.mockResolvedValue({ ok: false });
    const onPick = vi.fn();
    const { result } = renderHook(() => useFittingPicker(onPick));
    await act(() => result.current.openLoaded(loaded));
    expect(onPick).not.toHaveBeenCalled();
    expect(result.current.tooLargeToShare).toBe(true);
  });

  it('passes a pasted Share Link through unchanged and reports Load errors', async () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => useFittingPicker(onPick));
    load.mockResolvedValueOnce({ kind: 'share', code: 'code' });
    await act(() => result.current.loadFromInput('x'));
    expect(onPick).toHaveBeenCalledWith('code');
    const failed = { kind: 'failed', source: 'text', error: 'unrecognised', unresolved: [] };
    load.mockResolvedValueOnce(failed);
    await act(() => result.current.loadFromInput('y'));
    expect(result.current.lastLoad).toEqual(failed);
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
