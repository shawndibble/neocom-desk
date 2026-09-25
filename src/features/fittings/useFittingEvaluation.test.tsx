import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { addModule } from '@/engine/fittings/fittingEdit';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';

type EngineCall = [
  Fitting,
  PilotProfile,
  unknown,
  DamageProfile | undefined,
  { overheated?: boolean; weatherTypeId?: number }?,
];

const engine = vi.hoisted(() => ({
  computeFittingStats: vi.fn(),
  loadFittingPrice: vi.fn(),
}));
vi.mock('./dogmaFittingEngine', () => ({
  isDogmaEngineReady: () => false,
  computeFittingStats: (...args: EngineCall) => engine.computeFittingStats(...args),
}));
vi.mock('./fittingPrice', () => ({
  loadFittingPrice: (fitting: Fitting) => engine.loadFittingPrice(fitting),
}));

const GURISTAS: DamageProfile = { em: 0, thermal: 0.2, kinetic: 0.8, explosive: 0 };
const damage = vi.hoisted(() => ({ hydrated: true, selected: null as unknown }));
vi.mock('./damageProfiles', () => ({
  useDamageProfiles: () => ({ hydrated: damage.hydrated, selected: damage.selected }),
}));

const { useFittingEvaluation, evaluateFitting } = await import('./useFittingEvaluation');
const { useAbyssalWeather } = await import('./abyssalWeatherSelection');

const RIFTER: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' }],
  drones: [],
  cargo: [],
  implantSet: { implants: [19540], boosters: [] },
};
const SLASHER: Fitting = { ...RIFTER, name: 'Slasher', shipTypeId: 585 };
const CLONE: PilotProfile = {
  skillLevels: new Map([[3300, 5]]),
  implantTypeIds: [10000],
  boosterTypeIds: [],
};

function statsFor(fitting: Fitting): FittingStats {
  return { tag: fitting.name, modules: [] } as unknown as FittingStats;
}

function calls(): EngineCall[] {
  return engine.computeFittingStats.mock.calls as EngineCall[];
}

function render(initial: { fitting: Fitting | null; implantBasis?: ImplantBasis }) {
  return renderHook(
    ({ fitting, implantBasis }: { fitting: Fitting | null; implantBasis: ImplantBasis }) =>
      useFittingEvaluation({ fitting, profile: CLONE, implantBasis }),
    { initialProps: { implantBasis: 'fitting' as ImplantBasis, ...initial } }
  );
}

beforeEach(() => {
  engine.computeFittingStats.mockReset();
  engine.computeFittingStats.mockImplementation(async (fitting: Fitting) => statsFor(fitting));
  engine.loadFittingPrice.mockReset();
  engine.loadFittingPrice.mockImplementation(
    async (fitting: Fitting) => ({ tag: fitting.name }) as unknown as Appraisal
  );
  damage.hydrated = true;
  damage.selected = GURISTAS;
});

describe('useFittingEvaluation', () => {
  it("runs the main stats and every variant under the Fitting's own set on that basis", async () => {
    const { result } = render({ fitting: RIFTER, implantBasis: 'fitting' });
    await waitFor(() => expect(result.current.variants).not.toBeNull());

    await result.current.variants!.compare(addModule(RIFTER, 'medium', 0, 438));
    // Main stats, the variant's baseline, and the variant itself.
    expect(calls()).toHaveLength(3);
    for (const [, pilot] of calls()) {
      expect(pilot.implantTypeIds).toEqual([19540]);
      expect(pilot.skillLevels).toBe(CLONE.skillLevels);
    }
  });

  it("runs on the pilot's own clone on the clone basis", async () => {
    const { result } = render({ fitting: RIFTER, implantBasis: 'clone' });
    await waitFor(() => expect(result.current.variants).not.toBeNull());
    await result.current.variants!.compare(addModule(RIFTER, 'medium', 0, 438));
    for (const [, pilot] of calls()) expect(pilot).toBe(CLONE);
  });

  it('waits for the stored Damage Profile, then measures every evaluation against it', async () => {
    damage.hydrated = false;
    const { result, rerender } = render({ fitting: RIFTER });
    await act(async () => {});
    expect(engine.computeFittingStats).not.toHaveBeenCalled();
    expect(result.current.variants).toBeNull();

    damage.hydrated = true;
    rerender({ fitting: RIFTER, implantBasis: 'fitting' });
    await waitFor(() => expect(result.current.variants).not.toBeNull());
    await result.current.variants!.compare(addModule(RIFTER, 'medium', 0, 438));

    expect(calls().map((call) => call[3])).toEqual([GURISTAS, GURISTAS, GURISTAS]);
    // Variations compare without overheat; the main stats keep it.
    expect(calls().map((call) => call[4]?.overheated)).toEqual([undefined, false, false]);
  });

  it("works out the open Fitting's own baseline once, however many variants are compared", async () => {
    const { result, rerender } = render({ fitting: RIFTER, implantBasis: 'fitting' });
    await waitFor(() => expect(result.current.variants).not.toBeNull());
    const variants = result.current.variants!;
    // A re-render (another module's Variations opened) keeps the same evaluator.
    rerender({ fitting: RIFTER, implantBasis: 'fitting' });
    expect(result.current.variants).toBe(variants);

    await variants.compare(addModule(RIFTER, 'medium', 0, 438));
    await variants.compare(addModule(RIFTER, 'medium', 0, 439));
    const baselines = calls().filter(
      ([f, , , , options]) => f === RIFTER && options?.overheated === false
    );
    expect(baselines).toHaveLength(1);
  });

  it('works everything out inside the picked Abyssal weather, and in normal space without one', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47390 });
    const { result } = render({ fitting: RIFTER });
    await waitFor(() => expect(result.current.variants).not.toBeNull());
    await result.current.variants!.compare(addModule(RIFTER, 'medium', 0, 438));
    await evaluateFitting(SLASHER, CLONE, GURISTAS, 47390);
    // Main stats, the variant's baseline, the variant, and another Fitting.
    expect(calls().map((call) => call[4]?.weatherTypeId)).toEqual([47390, 47390, 47390, 47390]);

    useAbyssalWeather.setState({ weatherTypeId: null });
    engine.computeFittingStats.mockClear();
    await evaluateFitting(SLASHER, CLONE, GURISTAS, null);
    expect(calls()[0][4]?.weatherTypeId).toBeUndefined();
  });

  it('reports a failed calculation as an error rather than loading forever', async () => {
    engine.computeFittingStats.mockRejectedValueOnce(new Error('engine failed'));
    const { result } = render({ fitting: RIFTER });
    await waitFor(() => expect(result.current.statsError).toBe(true));
    expect(result.current.stats).toBeNull();
  });

  it('calculates again on retry after a failure', async () => {
    engine.computeFittingStats.mockRejectedValueOnce(new Error('engine failed'));
    const { result } = render({ fitting: RIFTER });
    await waitFor(() => expect(result.current.statsError).toBe(true));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.stats).not.toBeNull());
    expect(result.current.statsError).toBe(false);
  });

  it('keeps the stats and price through a same-hull edit, and drops them at once for a new hull', async () => {
    const { result, rerender } = render({ fitting: RIFTER });
    await waitFor(() => expect(result.current.stats).not.toBeNull());
    await waitFor(() => expect(result.current.price).not.toBeNull());

    let release: () => void = () => {};
    engine.computeFittingStats.mockImplementationOnce(
      (fitting: Fitting) => new Promise((resolve) => (release = () => resolve(statsFor(fitting))))
    );
    const edited = addModule(RIFTER, 'medium', 0, 438);
    rerender({ fitting: edited, implantBasis: 'fitting' });
    expect(result.current.stats).not.toBeNull();
    expect(result.current.statsFitting).toBe(RIFTER);
    expect(result.current.price).not.toBeNull();
    act(() => release());
    await waitFor(() => expect(result.current.statsFitting).toBe(edited));

    rerender({ fitting: SLASHER, implantBasis: 'fitting' });
    expect(result.current.stats).toBeNull();
    expect(result.current.price).toBeNull();
    await waitFor(() => expect(result.current.statsFitting).toBe(SLASHER));
  });
});

describe('evaluateFitting', () => {
  it('works out another Fitting on the set it carries, under the given Damage Profile', async () => {
    await evaluateFitting(RIFTER, CLONE, GURISTAS, null);
    const [[fitting, pilot, , damageProfile]] = calls();
    expect(fitting).toBe(RIFTER);
    expect(pilot.implantTypeIds).toEqual([19540]);
    expect(damageProfile).toBe(GURISTAS);
  });

  it("uses the pilot's own clone for a Fitting that carries no set", async () => {
    await evaluateFitting({ ...RIFTER, implantSet: undefined }, CLONE, undefined, null);
    expect(calls()[0]![1]).toBe(CLONE);
  });
});
