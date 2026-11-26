import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const status = vi.hoisted(() => vi.fn());
vi.mock('./srpMemberBackend', () => ({ srpMemberBackend: () => ({ status }) }));
vi.mock('../owner', () => ({ useActiveCorporationId: () => 98000001 }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { hydrated: boolean; activeCharacterId: number }) => unknown) =>
    select({ hydrated: true, activeCharacterId: 7 }),
}));

vi.mock('./srpNavProbe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./srpNavProbe')>();
  return { ...actual, probeSrp: vi.fn(actual.probeSrp) };
});

import { probeSrp, recordSrpProbe } from './srpNavProbe';
import { useSrpNavVisible } from './useSrpNavVisible';

beforeEach(() => {
  localStorage.clear();
  status.mockReset();
  vi.mocked(probeSrp).mockClear();
});

describe('useSrpNavVisible', () => {
  it('follows an answer recorded elsewhere (a Director turning SRP on or off) at once', () => {
    recordSrpProbe(7, 98000001, false);
    const { result } = renderHook(() => useSrpNavVisible());
    expect(result.current).toBe(false);
    act(() => recordSrpProbe(7, 98000001, true));
    expect(result.current).toBe(true);
    act(() => recordSrpProbe(7, 98000001, false));
    expect(result.current).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });

  it('does not re-probe on every mount after a failure', async () => {
    status.mockRejectedValue(new Error('offline'));
    renderHook(() => useSrpNavVisible());
    await vi.waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    renderHook(() => useSrpNavVisible());
    renderHook(() => useSrpNavVisible());
    await vi.waitFor(() => expect(probeSrp).toHaveResolvedTimes(3));
    expect(status).toHaveBeenCalledTimes(1);
  });
});
