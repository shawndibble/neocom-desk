import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FitOption } from '@/engine/fittings/makeItFit';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import type { FittingStats } from '@/engine/fittings/types';

const DRONES_RIGGING = 26255;
const GYPSY_CPU = 27070;
import { MakeItFitDialog } from './MakeItFitDialog';
import type { FittingCatalogue } from './useFittingCatalogue';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  skillFixes: { fixes: null, failed: false } as Record<string, unknown>,
  finder: { status: 'loading', updating: false, fixes: [], catalog: null } as Record<
    string,
    unknown
  >,
  addEntries: vi.fn(async (entries: unknown[]) => ({
    planId: 'p',
    planName: 'Orca',
    added: entries,
  })),
}));
vi.mock('./useMakeItFit', () => ({ useMakeItFit: () => mocks.state }));
vi.mock('./useSkillFixes', () => ({ useSkillFixes: () => mocks.skillFixes }));
vi.mock('./useTrainingSchedule', () => ({
  useTrainingSchedule: () => ({
    catalog: { engineSkills: new Map([[DRONES_RIGGING, { name: 'Drones Rigging' }]]) },
    trainedSkills: new Map(),
    trainedSkillsKnown: true,
    scheduleEntriesFor: () => [{ skillTypeID: DRONES_RIGGING, level: 4, seconds: 3600 }],
  }),
  usePlannedLevels: () => new Map(),
}));
vi.mock('@/features/skills/useTargetPlan', () => ({
  useTargetPlan: () => ({
    plans: [],
    targetPlanId: null,
    addEntries: mocks.addEntries,
    removeEntries: vi.fn(),
  }),
}));
vi.mock('@/features/entities', () => ({
  SkillLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./useImplantFinder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useImplantFinder')>()),
  useImplantFinder: () => mocks.finder,
}));
vi.mock('./targetProfiles', () => ({ useTargetProfiles: () => ({ selected: {} }) }));
vi.mock('./useFittingCatalogue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useFittingCatalogue')>()),
  catalogueTypeName: (_catalogue: unknown, typeId: number) =>
    ({ 1: 'Gyrostabilizer I', 2: 'Gyrostabilizer II', 3: 'Power Diagnostic' })[typeId] ?? '?',
}));

const stats = (ehp: number, shieldEm: number): FittingStats =>
  ({ ehp, shield: { emResonance: 1 - shieldEm / 100 } }) as unknown as FittingStats;

vi.mock('@/engine/fittings/variationDelta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/fittings/variationDelta')>()),
  diffFittingStats: (_before: FittingStats, after: FittingStats & { delta: unknown[] }) => ({
    changes: after.delta,
    count: after.delta.length,
  }),
}));
function option(
  slotIndex: number,
  iskDelta: number | null,
  delta: { key: string; before: number; after: number }[]
): FitOption {
  return {
    swaps: [{ slot: 'medium', slotIndex, fromTypeId: 1, toTypeId: 2 }],
    after: { ...stats(0, 0), delta } as never,
    iskDelta,
  } as unknown as FitOption;
}

function renderDialog(
  options: FitOption[],
  props: {
    nothingFits?: boolean;
    onOpenList?: () => void;
    characterId?: number;
    onImplantSet?: (set: unknown) => void;
    onImplantsApplied?: (names: string) => void;
  } = {}
) {
  mocks.state = {
    failed: false,
    before: stats(0, 0),
    result: { options, nothingFits: props.nothingFits ?? false },
  };
  const onApply = vi.fn();
  render(
    <MakeItFitDialog
      open
      resource="cpu"
      onClose={vi.fn()}
      variants={null}
      skillGains={null}
      characterId={props.characterId ?? null}
      fittingName="Orca"
      implants={
        props.onImplantSet
          ? {
              fitting: { implantSet: { implants: [], boosters: [] } } as unknown as Fitting,
              profile: { implantTypeIds: [] } as unknown as PilotProfile,
              basis: 'fitting',
              onChange: props.onImplantSet,
            }
          : null
      }
      onImplantsApplied={props.onImplantsApplied ?? vi.fn()}
      catalogue={{} as FittingCatalogue}
      onApply={onApply}
      onOpenList={props.onOpenList}
      placement="center"
    />
  );
  return onApply;
}

const ehpDown = { key: 'ehp', before: 1000, after: 707 };
const emResist = { key: 'shieldEmResonance', before: 50, after: 42 };
const thermalResist = { key: 'shieldThermalResonance', before: 40, after: 34 };

const inBudget = { cpuUsed: 90, cpuTotal: 100, powergridUsed: 0, powergridTotal: 100 };

describe('MakeItFitDialog', () => {
  it('is titled after the budget whose Fix link opened it', () => {
    renderDialog([option(0, 10, [ehpDown])]);
    expect(screen.getByRole('dialog', { name: 'Fix CPU' })).toBeTruthy();
  });

  it('offers the training that makes it fit, and adds it to the plan', async () => {
    mocks.skillFixes = {
      fixes: [{ entries: [{ skillTypeID: DRONES_RIGGING, targetLevel: 4 }], after: inBudget }],
      failed: false,
    };
    renderDialog([option(0, 10, [ehpDown])], { characterId: 1 });
    expect(screen.getByRole('heading', { name: 'Train' })).toBeTruthy();
    expect(screen.getByText('Drones Rigging')).toBeTruthy();
    expect(screen.getByText('1h 0m')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add to plan: Drones Rigging IV' }));
    expect(mocks.addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: DRONES_RIGGING, targetLevel: 4 }],
      'Orca'
    );
    mocks.skillFixes = { fixes: null, failed: false };
  });

  it('offers no training without a Character', () => {
    mocks.skillFixes = {
      fixes: [{ entries: [{ skillTypeID: DRONES_RIGGING, targetLevel: 4 }], after: inBudget }],
      failed: false,
    };
    renderDialog([option(0, 10, [ehpDown])]);
    expect(screen.queryByRole('heading', { name: 'Train' })).toBeNull();
    mocks.skillFixes = { fixes: null, failed: false };
  });

  it('offers only implants that bring the whole fit under, and puts one in the set', async () => {
    mocks.finder = {
      status: 'ready',
      updating: false,
      progress: { done: 1, total: 1 },
      catalog: {
        families: [
          {
            key: 'gypsy',
            name: "Zainou 'Gypsy' CPU Management",
            kind: 'implant',
            slot: 6,
            grades: [
              { typeId: GYPSY_CPU, code: 'EE-603', grade: 3 },
              { typeId: GYPSY_CPU + 1, code: 'EE-605', grade: 5 },
            ],
          },
        ],
        slotOf: () => ({ kind: 'implant', slot: 6 }),
      },
      fixes: [
        { typeIds: [GYPSY_CPU], cost: 5_000_000, stats: inBudget },
        // Under CPU, but now over powergrid: not a fix.
        { typeIds: [GYPSY_CPU + 1], cost: 1, stats: { ...inBudget, powergridUsed: 120 } },
      ],
    };
    const onImplantSet = vi.fn();
    const onImplantsApplied = vi.fn();
    renderDialog([option(0, 10, [ehpDown])], { onImplantSet, onImplantsApplied });
    expect(screen.queryByText(/EE-605/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /EE-603/ }));
    expect(onImplantSet).toHaveBeenCalledWith({ implants: [GYPSY_CPU], boosters: [] });
    expect(onImplantsApplied).toHaveBeenCalledWith("Zainou 'Gypsy' CPU Management EE-603");
    mocks.finder = { status: 'loading', updating: false, fixes: [], catalog: null };
  });

  it('summarises each trade-off in a line, with every number in an expander', async () => {
    renderDialog([option(0, 1000, [ehpDown, emResist, thermalResist])]);
    expect(screen.getByText('EHP -293, resists lower')).toBeTruthy();
    // The per-resist numbers are one click away, not gone.
    expect(screen.queryByText('Shield EM resist 50 to 42%, worse')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All changes' }));
    expect(screen.getByText('Shield EM resist 50 to 42%, worse')).toBeTruthy();
    expect(screen.getByText('Shield thermal resist 40 to 34%, worse')).toBeTruthy();
  });

  it('says "no price" once for the list, not on every row', () => {
    renderDialog([option(0, null, [ehpDown]), option(1, null, [ehpDown])]);
    expect(screen.getAllByText('Options without a price show no cost.')).toHaveLength(1);
  });

  it('tells identical-looking rows apart by their slot', () => {
    renderDialog([option(0, 10, [ehpDown]), option(1, 10, [ehpDown])]);
    expect(screen.getByText(/Mid slot 1/)).toBeTruthy();
    expect(screen.getByText(/Mid slot 2/)).toBeTruthy();
  });

  it('leaves a lone row without a slot suffix', () => {
    renderDialog([option(0, 10, [ehpDown])]);
    expect(screen.queryByText(/Mid slot/)).toBeNull();
  });

  it('applies the option when its row is clicked', () => {
    const onApply = renderDialog([option(0, 10, [ehpDown])]);
    fireEvent.click(screen.getByRole('button', { name: /Gyrostabilizer I → Gyrostabilizer II/ }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('points an empty result at the module List', async () => {
    const onOpenList = vi.fn();
    renderDialog([], { nothingFits: true, onOpenList });
    await userEvent.click(screen.getByRole('button', { name: 'Open the module List' }));
    expect(onOpenList).toHaveBeenCalledOnce();
  });

  it('offers no List pointer when the List is already showing', () => {
    renderDialog([], { nothingFits: true });
    expect(screen.queryByRole('button', { name: 'Open the module List' })).toBeNull();
  });
});
