import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResolvedTypeName } from './useResolvedTypeName';

const loadTypeNames = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames }));

const catalogueName = (typeId: number) => (typeId === 1 ? 'Astero' : `#${typeId}`);

describe('useResolvedTypeName', () => {
  beforeEach(() => {
    loadTypeNames.mockReset();
    loadTypeNames.mockResolvedValue(new Map([[63810, 'AIR Agility Booster II']]));
  });

  it('keeps the catalogue name and resolves the ids the catalogue lacks', async () => {
    const ids = [1, 63810];
    const { result } = renderHook(() => useResolvedTypeName(catalogueName, ids));
    expect(result.current(1)).toBe('Astero');
    expect(result.current(63810)).toBe('#63810');
    await waitFor(() => expect(result.current(63810)).toBe('AIR Agility Booster II'));
    expect(loadTypeNames).toHaveBeenCalledWith([63810]);
  });

  it('looks the ids up once however often the caller passes a new typeName', async () => {
    const { result, rerender } = renderHook(() =>
      useResolvedTypeName((id) => catalogueName(id), [63810])
    );
    await waitFor(() => expect(result.current(63810)).toBe('AIR Agility Booster II'));
    rerender();
    rerender();
    expect(loadTypeNames).toHaveBeenCalledTimes(1);
  });

  it('keeps the catalogue spelling for an id ESI cannot name', async () => {
    loadTypeNames.mockResolvedValue(new Map([[63810, 'Type #63810']]));
    const { result } = renderHook(() => useResolvedTypeName(catalogueName, [63810]));
    await waitFor(() => expect(loadTypeNames).toHaveBeenCalled());
    expect(result.current(63810)).toBe('#63810');
  });

  it('looks nothing up when the catalogue names every id', () => {
    const ids = [1];
    renderHook(() => useResolvedTypeName(catalogueName, ids));
    expect(loadTypeNames).not.toHaveBeenCalled();
  });
});
