import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting } from '@/engine/fittings/types';

const REQUIREMENTS: Record<number, { skillTypeID: number; level: number }[]> = {
  12005: [{ skillTypeID: 3332, level: 5 }], // an Ishtar: Gallente Cruiser V
  587: [{ skillTypeID: 3329, level: 1 }], // a Rifter: Minmatar Frigate I
};
// 99 stands for a type ESI couldn't supply.
vi.mock('./skillRequirements', () => ({
  loadKnownRequirements: async (typeId: number) =>
    typeId === 99 ? null : (REQUIREMENTS[typeId] ?? []),
}));
vi.mock('@/features/skills/skillMap', () => ({
  loadSkillCatalog: async () => ({
    engineSkills: new Map([
      [3332, { typeID: 3332, name: 'Gallente Cruiser', prereqs: [], alphaMaxLevel: 4 }],
      [3329, { typeID: 3329, name: 'Minmatar Frigate', prereqs: [], alphaMaxLevel: 4 }],
    ]),
    bySkillTypeID: new Map([
      [3332, { name: 'Gallente Cruiser' }],
      [3329, { name: 'Minmatar Frigate' }],
    ]),
  }),
}));

const { useFittingAlpha } = await import('./useFittingAlpha');

const hull = (shipTypeId: number): Fitting => ({
  name: 'x',
  shipTypeId,
  modules: [],
  drones: [],
  cargo: [],
});

const ISHTAR = hull(12005);
const UNKNOWN_MODULE: Fitting = {
  ...hull(587),
  modules: [{ slot: 'high', slotIndex: 0, typeId: 99, state: 'active' }],
};
const RIFTER = hull(587);

describe('useFittingAlpha', () => {
  it('reports the skill levels an Alpha cannot reach, and names them', async () => {
    const { result } = renderHook(() => useFittingAlpha(ISHTAR));
    await waitFor(() => expect(result.current.blockers).not.toBeNull());
    expect(result.current.blockers).toEqual([{ skillTypeID: 3332, level: 5, alphaMaxLevel: 4 }]);
    expect(result.current.skillName(3332)).toBe('Gallente Cruiser');
  });

  it('gives no verdict while a fitted type’s requirements are unknown, rather than a false Alpha OK', async () => {
    const { result } = renderHook(() => useFittingAlpha(UNKNOWN_MODULE));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.blockers).toBeNull();
  });

  it('reports none for a fit an Alpha can fly', async () => {
    const { result } = renderHook(() => useFittingAlpha(RIFTER));
    await waitFor(() => expect(result.current.blockers).toEqual([]));
  });

  it("never shows the previous Fitting's answer for a new one", async () => {
    const first = ISHTAR;
    const second = RIFTER;
    const { result, rerender } = renderHook(({ fitting }) => useFittingAlpha(fitting), {
      initialProps: { fitting: first },
    });
    await waitFor(() => expect(result.current.blockers).toHaveLength(1));
    rerender({ fitting: second });
    expect(result.current.blockers).toBeNull();
    await waitFor(() => expect(result.current.blockers).toEqual([]));
  });
});
