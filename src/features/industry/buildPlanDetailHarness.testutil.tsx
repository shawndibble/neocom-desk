import { useState } from 'react';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { beforeEach, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db, type BuildPlanRecord } from '@/db';
import type { BlueprintType, TypeMap } from '@/sde/types';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { CorpOwnedStockState } from './corpOwnedStock';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import { PRICING_INPUTS_FIXTURE } from './pricingInputsFixtures.testutil';
import { EMPTY_OWNED_STOCK_SNAPSHOT, type OwnedStockSnapshot } from './ownedStockDetection';
import { applySourcingPatch } from '@/engine/industry/sourcingEdits';
import type { SourcingPatchEntry } from './buildPlanStore';
import { BuildPlanDetail, type PlanPatch } from './BuildPlanDetail';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';
import { DEFAULT_FACILITY_DEFAULTS, useFacilityDefaults } from './facilityDefaults';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  useReactionFacilityDefaults,
} from './reactionFacilityDefaults';

/** The toast's status region: the sr-only LiveStatus regions are empty here. */

// Shared fixtures and the Harness component for BuildPlanDetail*.test.tsx, one file per
// concern so CI runs them in parallel. The `vi.mock` calls stay in each test file; their
// factories and spies live in buildPlanDetailMocks.testutil.ts.

export const costIndexSystem = (name: string) =>
  screen.findByText(
    (_, el) =>
      el?.tagName === 'SPAN' &&
      el.textContent === name &&
      el.closest('div')?.textContent?.includes('Cost index') === true
  );

/** The toast's status region: the sr-only LiveStatus regions are empty here. */
export function toastStatus() {
  const live = screen.getAllByRole('status').filter((el) => el.textContent);
  expect(live).toHaveLength(1);
  return live[0];
}

// BuildPlanDetail fetches a market snapshot in an effect on mount; a real
// fetch would hit ESI/Fuzzwork and never resolve under MSW's default
export const BLUEPRINT: BlueprintType = {
  name: 'Rifter Blueprint',
  time: 1200,
  materials: [{ typeID: 34, quantity: 100 }],
  products: [{ typeID: 587, quantity: 1 }],
  skills: [],
  activity: 'manufacturing',
};

/**
 * Gives Tritanium a producer, so the plan has one material the panel can offer
 * to build. Four a run, so the sub-job's run count is visibly not its unit
 * count — the whole point of sizing a sub-build in runs.
 */
export const TRITANIUM_BLUEPRINT: BlueprintType = {
  name: 'Tritanium Blueprint',
  time: 600,
  materials: [{ typeID: 35, quantity: 5 }],
  products: [{ typeID: 34, quantity: 4 }],
  skills: [],
  activity: 'manufacturing',
};

/** Gives Pyerite a producer too, so an expanded row (Tritanium's own input) can carry its own make-or-buy advice. */
export const PYERITE_BLUEPRINT: BlueprintType = {
  name: 'Pyerite Blueprint',
  time: 300,
  materials: [{ typeID: 36, quantity: 2 }],
  products: [{ typeID: 35, quantity: 1 }],
  skills: [],
  activity: 'manufacturing',
};

export const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  '36': { name: 'Mexallon', groupID: 18, volume: 0.01 },
  // A blueprint is itself a real, named SDE type — production's `types.json`
  // (`loadSde.ts`) carries these alongside every other item, so a Blueprint
  // Acquisition row (issue #838) never actually falls back to `#<typeID>`.
  // Named here so this fixture doesn't misrepresent that as a real gap.
  '638': { name: 'Rifter Blueprint', groupID: 429, volume: 0.01 },
  '639': { name: 'Tritanium Blueprint', groupID: 429, volume: 0.01 },
  '640': { name: 'Pyerite Blueprint', groupID: 429, volume: 0.01 },
};

export const ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 638,
  blueprint: BLUEPRINT,
  productTypeID: 587,
  productName: 'Rifter',
  productNameLower: 'rifter',
};

export const TRITANIUM_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 639,
  blueprint: TRITANIUM_BLUEPRINT,
  productTypeID: 34,
  productName: 'Tritanium',
  productNameLower: 'tritanium',
};

export const PYERITE_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 640,
  blueprint: PYERITE_BLUEPRINT,
  productTypeID: 35,
  productName: 'Pyerite',
  productNameLower: 'pyerite',
};

export const CATALOG: BlueprintCatalog = {
  entries: [ENTRY, TRITANIUM_ENTRY, PYERITE_ENTRY],
  byBlueprintTypeID: new Map([
    [638, ENTRY],
    [639, TRITANIUM_ENTRY],
    [640, PYERITE_ENTRY],
  ]),
  byProductTypeID: new Map([
    [587, ENTRY],
    [34, TRITANIUM_ENTRY],
    [35, PYERITE_ENTRY],
  ]),
  typesById: TYPES,
};

// A reaction formula (issue #460): same catalog shape as a manufacturing
// blueprint, just tagged with the other activity.
export const REACTION_FORMULA: BlueprintType = {
  name: 'Methanofullerene Reaction Formula',
  time: 10800,
  materials: [{ typeID: 16272, quantity: 3200 }],
  products: [{ typeID: 16667, quantity: 100 }],
  skills: [],
  activity: 'reaction',
};
export const REACTION_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 46157,
  blueprint: REACTION_FORMULA,
  productTypeID: 16667,
  productName: 'Reinforced Carbon Fiber',
  productNameLower: 'reinforced carbon fiber',
};
export const REACTION_TYPES: TypeMap = {
  ...TYPES,
  '16272': { name: 'Fullerides', groupID: 429, volume: 5 },
  '16667': { name: 'Reinforced Carbon Fiber', groupID: 428, volume: 5 },
};
export const REACTION_CATALOG: BlueprintCatalog = {
  entries: [REACTION_ENTRY],
  byBlueprintTypeID: new Map([[46157, REACTION_ENTRY]]),
  byProductTypeID: new Map([[16667, REACTION_ENTRY]]),
  typesById: REACTION_TYPES,
};

export function makePlan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'bp-1',
    characterId: 91,
    name: 'Rifter run',
    blueprintTypeID: 638,
    runs: 10,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
    ...overrides,
  };
}

export interface HarnessProps {
  plan?: Partial<BuildPlanRecord>;
  catalog?: BlueprintCatalog;
  onUpdate?: (patch: PlanPatch) => void;
  onDerivedFix?: (patch: PlanPatch) => void;
  corpOwnedStock?: Partial<CorpOwnedStockState>;
  corpOwnedBlueprints?: Partial<CorpOwnedBlueprintsState>;
  /** Fields layered over the held plan on every render — stands in for a change arriving from elsewhere (another device's sync). */
  externalPlan?: Partial<BuildPlanRecord>;
  /** Detected owned stock; empty by default. */
  ownedStockSnapshot?: OwnedStockSnapshot;
  /** Sourcing edits (owned quantity, price) — applied to the held plan as well as reported. */
  onSourcing?: (edits: readonly SourcingPatchEntry[]) => void;
}

export const CORP_OWNED_STOCK_UNAVAILABLE: CorpOwnedStockState = {
  source: null,
  corporationId: null,
  corporationName: null,
  available: false,
  incomplete: false,
};

/**
 * Stands in for Industry.tsx: holds the plan in local state and applies
 * `onUpdate` patches to it, so a committed edit is visible in the next
 * render the way it would be against the real store.
 */
export function Harness({
  plan: planOverrides,
  catalog = CATALOG,
  onUpdate,
  onDerivedFix,
  corpOwnedStock,
  corpOwnedBlueprints,
  externalPlan,
  ownedStockSnapshot = EMPTY_OWNED_STOCK_SNAPSHOT,
  onSourcing,
}: HarnessProps) {
  const [heldPlan, setPlan] = useState<BuildPlanRecord>(makePlan(planOverrides));
  const plan = externalPlan ? { ...heldPlan, ...externalPlan } : heldPlan;
  return (
    <MemoryRouter>
      <FakeItemActions>
        <BuildPlanDetail
          plan={plan}
          catalog={catalog}
          pi={null}
          ownedBlueprints={[]}
          modifiers={NO_CHARACTER_MODIFIERS}
          ownedStockSnapshot={ownedStockSnapshot}
          corpOwnedStock={{ ...CORP_OWNED_STOCK_UNAVAILABLE, ...corpOwnedStock }}
          pricingInputs={
            corpOwnedBlueprints
              ? {
                  ...PRICING_INPUTS_FIXTURE,
                  corpBlueprints: {
                    ...PRICING_INPUTS_FIXTURE.corpBlueprints,
                    ...corpOwnedBlueprints,
                  },
                }
              : PRICING_INPUTS_FIXTURE
          }
          onChange={(change) => {
            if (change.kind === 'sourcing') {
              onSourcing?.(change.edits);
              setPlan((p) => {
                let materialSourcing = p.materialSourcing;
                for (const { typeID, patch } of change.edits) {
                  materialSourcing = applySourcingPatch(materialSourcing, typeID, patch);
                }
                return { ...p, materialSourcing };
              });
              return;
            }
            (change.kind === 'edit' ? onUpdate : onDerivedFix)?.(change.patch);
            setPlan((p) => ({ ...p, ...change.patch }));
          }}
          groupSnapshot={null}
          onSearchBpcSourcing={vi.fn()}
        />
      </FakeItemActions>
    </MemoryRouter>
  );
}

export const runsInput = () => screen.getByRole('textbox', { name: 'Runs' });
export const valueOf = (input: HTMLElement) => (input as HTMLInputElement).value;

/** Inputs live behind "Edit setup" now — open it before touching any of them. */
export async function openSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit setup' }));
}

/**
 * A location edit on this page writes the remembered defaults, so every test
 * starts from none — a value left by the last one would seed the next.
 * Call once at module scope.
 */
export function installBuildPlanDetailHarness(): void {
  beforeEach(async () => {
    await db.settings.clear();
    useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
    useReactionFacilityDefaults.setState({
      value: DEFAULT_REACTION_FACILITY_DEFAULTS,
      hydrated: false,
    });
  });
}
