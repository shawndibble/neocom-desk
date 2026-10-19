import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CorpBookView } from './corpBookView';
import { useBookSystems } from './useBookSystems';

const load = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/systemSecurity', () => ({ loadSystemNameAndSecurity: load }));

const view = (ids: number[]) =>
  ({
    overlay: { rows: ids.map((solarSystemId) => ({ solarSystemId })) },
  }) as unknown as CorpBookView;

describe('useBookSystems', () => {
  it('resolves only the book rows systems the ledger has not, and keeps the ledger names', async () => {
    load.mockReset();
    load.mockResolvedValue({ name: 'Efa', security: 0.3 });
    const known = { names: new Map([[1, 'Jita']]), security: new Map([[1, 0.9]]) };
    const { result } = renderHook(() => useBookSystems(view([1, 30002187, 0]), known));
    await waitFor(() => expect(result.current.names.get(30002187)).toBe('Efa'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(30002187);
    expect(result.current.names.get(1)).toBe('Jita');
    expect(result.current.security.get(30002187)).toBe(0.3);
  });

  it('leaves an unknown system out so the row falls back to its id', async () => {
    load.mockReset();
    load.mockResolvedValue({ name: null, security: null });
    const known = { names: new Map<number, string>(), security: new Map<number, number>() };
    const { result } = renderHook(() => useBookSystems(view([42]), known));
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(result.current.names.has(42)).toBe(false);
  });
});
