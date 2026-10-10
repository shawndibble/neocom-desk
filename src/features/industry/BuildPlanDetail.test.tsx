import { useState } from 'react';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { db, type BuildPlanRecord } from '@/db';
import type { BlueprintType, TypeMap } from '@/sde/types';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { CorpOwnedStockState } from './corpOwnedStock';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import { PRICING_INPUTS_FIXTURE } from './pricingInputsFixtures';
import { EMPTY_OWNED_STOCK_SNAPSHOT, type OwnedStockSnapshot } from './ownedStockDetection';
import { applySourcingPatch } from './sourcingEdits';
import type { SourcingPatchEntry } from './buildPlanStore';
import { BuildPlanDetail, type PlanPatch } from './BuildPlanDetail';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';
import { DEFAULT_FACILITY_DEFAULTS, useFacilityDefaults } from './facilityDefaults';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  REACTION_FACILITY_DEFAULTS_SETTING_KEY,
  useReactionFacilityDefaults,
} from './reactionFacilityDefaults';

/** The toast's status region: the sr-only LiveStatus regions are empty here. */
function toastStatus() {
  const live = screen.getAllByRole('status').filter((el) => el.textContent);
  expect(live).toHaveLength(1);
  return live[0];
}

// BuildPlanDetail fetches a market snapshot in an effect on mount; a real
// fetch would hit ESI/Fuzzwork and never resolve under MSW's default
// handlers here. The panel only needs *a* resolved snapshot to stop showing
// "loading" — its shape doesn't matter to the Runs/ME/TE fields under test.
const loadMarketSnapshot = vi.hoisted(() =>
  vi.fn(async () => ({
    hubPrices: {},
    hubBuyPrices: {},
    adjustedPrices: {},
    systemCostIndex: 0.05,
  }))
);
vi.mock('./marketData', () => ({ loadMarketSnapshot }));

// The build-system field resolves a typed name through ESI. Mocked here for the
// same reason as the snapshot: the panel under test needs an answer, not a network.
const resolveSolarSystem = vi.hoisted(() =>
  vi.fn(async (name: string) =>
    name.trim().toLowerCase() === 'badivefi'
      ? { id: 30003888, name: 'Badivefi', security: 'highsec' as const }
      : null
  )
);
vi.mock('@/features/character/systemLookup', () => ({ resolveSolarSystem }));

// The search's own maths is tested in `breakEvenRuns.test.ts`; here only the
// button's wiring is under test, so its answer is set per test.
const breakEvenRuns = vi.hoisted(() => vi.fn<(...args: unknown[]) => number | null>());
vi.mock('@/engine/industry/breakEvenRuns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/industry/breakEvenRuns')>()),
  breakEvenRuns,
}));

// The band is reconciled on load against `/universe/systems/{id}`.
const loadSystemSecurity = vi.hoisted(() =>
  // Badivefi 0.6587 (highsec), Tama 0.2825 (lowsec); anything else unresolvable.
  vi.fn(async (systemId: number) =>
    systemId === 30003888 ? 0.6587 : systemId === 30002813 ? 0.2825 : null
  )
);
vi.mock('@/features/character/systemSecurity', () => ({
  loadSystemSecurity,
  loadSystemName: vi.fn(async () => null),
}));

// The build location search only renders once the scope is known to be
// granted; without this the box under test is the re-auth offer instead.
const implantsGrant = vi.hoisted(() => ({ lacking: new Set<number>() }));
vi.mock('@/app/useGrantedScopes', () => ({
  useGrantedScopes: () => ['esi-search.search_structures.v1'],
  useCharacterLacksEndpoints: (id: number | null) => id !== null && implantsGrant.lacking.has(id),
}));

const BLUEPRINT: BlueprintType = {
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
const TRITANIUM_BLUEPRINT: BlueprintType = {
  name: 'Tritanium Blueprint',
  time: 600,
  materials: [{ typeID: 35, quantity: 5 }],
  products: [{ typeID: 34, quantity: 4 }],
  skills: [],
  activity: 'manufacturing',
};

/** Gives Pyerite a producer too, so an expanded row (Tritanium's own input) can carry its own make-or-buy advice. */
const PYERITE_BLUEPRINT: BlueprintType = {
  name: 'Pyerite Blueprint',
  time: 300,
  materials: [{ typeID: 36, quantity: 2 }],
  products: [{ typeID: 35, quantity: 1 }],
  skills: [],
  activity: 'manufacturing',
};

const TYPES: TypeMap = {
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

const ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 638,
  blueprint: BLUEPRINT,
  productTypeID: 587,
  productName: 'Rifter',
  productNameLower: 'rifter',
};

const TRITANIUM_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 639,
  blueprint: TRITANIUM_BLUEPRINT,
  productTypeID: 34,
  productName: 'Tritanium',
  productNameLower: 'tritanium',
};

const PYERITE_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 640,
  blueprint: PYERITE_BLUEPRINT,
  productTypeID: 35,
  productName: 'Pyerite',
  productNameLower: 'pyerite',
};

const CATALOG: BlueprintCatalog = {
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
const REACTION_FORMULA: BlueprintType = {
  name: 'Methanofullerene Reaction Formula',
  time: 10800,
  materials: [{ typeID: 16272, quantity: 3200 }],
  products: [{ typeID: 16667, quantity: 100 }],
  skills: [],
  activity: 'reaction',
};
const REACTION_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 46157,
  blueprint: REACTION_FORMULA,
  productTypeID: 16667,
  productName: 'Reinforced Carbon Fiber',
  productNameLower: 'reinforced carbon fiber',
};
const REACTION_TYPES: TypeMap = {
  ...TYPES,
  '16272': { name: 'Fullerides', groupID: 429, volume: 5 },
  '16667': { name: 'Reinforced Carbon Fiber', groupID: 428, volume: 5 },
};
const REACTION_CATALOG: BlueprintCatalog = {
  entries: [REACTION_ENTRY],
  byBlueprintTypeID: new Map([[46157, REACTION_ENTRY]]),
  byProductTypeID: new Map([[16667, REACTION_ENTRY]]),
  typesById: REACTION_TYPES,
};

function makePlan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
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

interface HarnessProps {
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

const CORP_OWNED_STOCK_UNAVAILABLE: CorpOwnedStockState = {
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
function Harness({
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

const runsInput = () => screen.getByRole('textbox', { name: 'Runs' });
const valueOf = (input: HTMLElement) => (input as HTMLInputElement).value;

/** Inputs live behind "Edit setup" now — open it before touching any of them. */
async function openSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit setup' }));
}

// A location edit on this page writes the remembered defaults, so every test
// starts from none — a value left by the last one would seed the next.
beforeEach(async () => {
  await db.settings.clear();
  useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
  useReactionFacilityDefaults.setState({
    value: DEFAULT_REACTION_FACILITY_DEFAULTS,
    hydrated: false,
  });
});

describe('BuildPlanDetail runs/me/te fields (issue #455)', () => {
  it('reflects exactly what is typed mid-edit, including an intermediate out-of-range value', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.type(runsInput(), '25000');

    // Still focused: the DOM shows the raw typed digits, not a clamp and not
    // the committed prop.
    expect(valueOf(runsInput())).toBe('25000');
  });

  it('keeps the field empty mid-edit when cleared, rather than snapping to 1', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);

    await user.clear(runsInput());

    expect(valueOf(runsInput())).toBe('');
  });

  it('commits exactly once, with the typed value, when blurred after a valid edit', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.type(runsInput(), '250');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ runs: 250 });
  });

  it('reverts to the last committed value on blur after clearing, without committing', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.tab();

    expect(valueOf(runsInput())).toBe('10');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('does not call the update callback when the Runs field is tabbed through untouched', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.tab();

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('BuildPlanDetail edits pending at unmount', () => {
  it('commits a typed Runs draft when the page unmounts mid-edit', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { unmount } = render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.type(runsInput(), '40');
    unmount();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ runs: 40 });
  });

  it('does not commit again at unmount after a blur already committed', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { unmount } = render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.type(runsInput(), '40');
    await user.tab();
    unmount();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('commits nothing at unmount for an unparseable or emptied draft', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { unmount } = render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.type(runsInput(), 'abc');
    unmount();

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('BuildPlanDetail facility tax fields', () => {
  const taxInput = () => screen.getByRole('textbox', { name: 'Facility tax %' });

  it('keeps every typed character and commits once on blur, not per keystroke', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ facility: 'raitaru', facilityTaxPct: 1 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(taxInput());
    await user.type(taxInput(), '12.75');

    expect(valueOf(taxInput())).toBe('12.75');
    expect(onUpdate).not.toHaveBeenCalled();

    await user.tab();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ facilityTaxPct: 12.75 });
  });

  it.each([
    ['2,5', 2.5],
    ['2,75', 2.75],
    ['150', 100],
  ])('reads %s as %s', async (typed, expected) => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ facility: 'raitaru', facilityTaxPct: 1 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(taxInput());
    await user.type(taxInput(), typed);
    await user.tab();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ facilityTaxPct: expected });
  });

  it('commits on Enter', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ facility: 'raitaru', facilityTaxPct: 1 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(taxInput());
    await user.type(taxInput(), '3{Enter}');

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ facilityTaxPct: 3 });
  });

  it('reverts a cleared field on blur without writing', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ facility: 'raitaru', facilityTaxPct: 2.5 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(taxInput());
    await user.tab();

    expect(valueOf(taxInput())).toBe('2.5');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows a change made elsewhere while the field is not being edited', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness plan={{ facility: 'raitaru', facilityTaxPct: 1 }} />);
    await openSetup(user);

    rerender(<Harness plan={{ facility: 'raitaru' }} externalPlan={{ facilityTaxPct: 7.5 }} />);

    expect(valueOf(taxInput())).toBe('7.5');
  });

  it('keeps a half-typed draft when a change arrives mid-edit', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness plan={{ facility: 'raitaru', facilityTaxPct: 1 }} />);
    await openSetup(user);

    await user.clear(taxInput());
    await user.type(taxInput(), '3.');
    rerender(<Harness plan={{ facility: 'raitaru' }} externalPlan={{ facilityTaxPct: 7.5 }} />);

    expect(valueOf(taxInput())).toBe('3.');
  });

  it('commits the reaction facility tax once on blur', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness
        plan={{ runs: 10, includeReactions: true, reactionFacility: 'tatara' }}
        onUpdate={onUpdate}
      />
    );
    await openSetup(user);

    const reactionTax = await screen.findByRole('textbox', { name: 'Facility tax %' });
    await user.clear(reactionTax);
    await user.type(reactionTax, '4.25');
    expect(onUpdate).not.toHaveBeenCalled();
    await user.tab();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ reactionFacilityTaxPct: 4.25 });
  });
});

describe('BuildPlanDetail shopping list', () => {
  const copyButton = () => screen.getByRole('button', { name: 'Copy shopping list for multibuy' });

  afterEach(() => configureClipboard(null));

  it('copies one tab-separated line per material, netted against what is owned', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(writeText);
    // 100 Tritanium a run x 10 runs = 1000, less the 40 already held.
    render(<Harness plan={{ runs: 10, materialSourcing: { 34: { ownedQuantity: 40 } } }} />);

    await user.click(copyButton());

    // "Rifter Blueprint" is the blueprint's own Blueprint Acquisition row
    // (issue #838): bought by contract, not market order, so multibuy can't
    // buy it — excluded from the copied text (issue #1778).
    expect(writeText).toHaveBeenCalledWith('Tritanium\t960');
  });

  it('confirms on the button itself — a clipboard write leaves nothing else to look at', async () => {
    const user = userEvent.setup();
    configureClipboard(vi.fn<ClipboardWriter>().mockResolvedValue(undefined));
    render(<Harness />);

    await user.click(copyButton());

    expect(await screen.findByRole('button', { name: 'Shopping list copied' })).toBeInTheDocument();
  });

  it('announces a successful copy in a status region', async () => {
    const user = userEvent.setup();
    configureClipboard(vi.fn<ClipboardWriter>().mockResolvedValue(undefined));
    render(<Harness />);
    await user.click(copyButton());
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((el) => /^Shopping list copied$/.test(el.textContent ?? ''))
      ).toBe(true)
    );
  });

  it('announces a clipboard failure in a status region', async () => {
    const user = userEvent.setup();
    configureClipboard(vi.fn<ClipboardWriter>().mockRejectedValue(new Error('denied')));
    render(<Harness />);
    await user.click(copyButton());
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((el) => /clipboard/i.test(el.textContent ?? ''))
      ).toBe(true)
    );
  });

  it('names the Blueprint Acquisition row left out of the copied text (issue #1778)', async () => {
    configureClipboard(vi.fn<ClipboardWriter>().mockResolvedValue(undefined));
    // Default fixture's "Rifter Blueprint" Blueprint Acquisition row (issue
    // #838) is what gets left out here.
    render(<Harness />);

    // fireEvent, not userEvent: the pointer-event simulation was what ran past findBy's 1s under CI load.
    fireEvent.click(copyButton());

    expect(
      await screen.findByText('1 blueprint left out — buy it by contract')
    ).toBeInTheDocument();
  });

  it('surfaces a denied clipboard instead of failing silently', async () => {
    const user = userEvent.setup();
    configureClipboard(vi.fn<ClipboardWriter>().mockRejectedValue(new Error('denied')));
    render(<Harness />);

    await user.click(copyButton());

    expect(
      await screen.findByRole('button', { name: /Couldn't reach the clipboard/ })
    ).toBeInTheDocument();
  });

  it('is unavailable when every material is already owned — nothing left to order', () => {
    render(<Harness plan={{ runs: 10, materialSourcing: { 34: { ownedQuantity: 1000 } } }} />);

    expect(copyButton()).toBeDisabled();
  });
});

describe('BuildPlanDetail sub-builds', () => {
  const buildButton = () => screen.getByRole('button', { name: 'Build instead: Tritanium' });

  afterEach(() => configureClipboard(null));

  it('offers to build a material a blueprint produces, even with no prices to quote it', async () => {
    // `loadMarketSnapshot` is mocked to an empty price map, so no make-or-buy
    // verdict can be reached. The run count and input quantities need no
    // prices, so the offer must survive that.
    render(<Harness />);

    expect(
      await screen.findByRole('button', { name: 'Build instead: Tritanium' })
    ).toBeInTheDocument();
  });

  it('records the choice on the plan', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);

    await user.click(buildButton());

    expect(onUpdate).toHaveBeenCalledWith({ buildHere: [34] });
  });

  it('swaps the material for what its job consumes, sized in runs', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());

    // 1000 Tritanium at 4 a run is 250 runs, each eating 5 Pyerite.
    expect(await screen.findByText('250 runs')).toBeInTheDocument();
    const pyerite = screen.getByText('Pyerite').closest('tr');
    expect(pyerite?.querySelector('[data-label="Need"]')).toHaveTextContent('1,250');
  });

  it('offers the build control on an expanded input too, not just an advisory marker', async () => {
    // Pyerite has its own producer (`PYERITE_ENTRY`): once Tritanium's job
    // pulls it onto the table, it is exactly as buildable as anything else on
    // the plan (docs/context/decisions, since the one-level cap was lifted).
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());

    expect(
      await screen.findByRole('button', { name: 'Build instead: Pyerite' })
    ).toBeInTheDocument();
  });

  it('keeps drilling down as many levels as the recipe tree actually has', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(await screen.findByRole('button', { name: 'Build instead: Pyerite' }));

    // 1250 Pyerite needed at 1 a run is 1250 runs, each eating 2 Mexallon.
    const mexallon = (await screen.findByText('Mexallon')).closest('tr') as HTMLElement;
    expect(mexallon.querySelector('[data-label="Need"]')).toHaveTextContent('2,500');
    // Mexallon has no producer in this catalog, so the tree bottoms out here
    // on its own rather than at an artificial depth limit.
    expect(within(mexallon).queryByRole('button', { name: /Build|Buy/ })).not.toBeInTheDocument();

    // Counted over the plan's own materials — only Tritanium is one of those.
    // Pyerite's job is deeper down, and its cost is inside that same total.
    expect(
      screen.getByText(/Building 1 of this plan's own material\(s\) here/)
    ).toBeInTheDocument();
  });

  it('lists a material once, wherever the build tree reached it', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(await screen.findByRole('button', { name: 'Build instead: Pyerite' }));

    // One row per material, whatever depth introduced it — the flat shopping
    // list this table now is, rather than a branch of the resolved tree.
    await screen.findByText('Mexallon');
    for (const name of ['Tritanium', 'Pyerite', 'Mexallon']) {
      expect(screen.getAllByText(name)).toHaveLength(1);
    }
  });

  it('shows how to make a built material behind its own "Build it"', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(await screen.findByRole('button', { name: 'Recipe: Tritanium' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/250 runs x 4 per run makes 1,000/)).toBeInTheDocument();
    // The job's own ingredient quantity, which the flat row no longer nests.
    expect(within(dialog).getByText('1,250')).toBeInTheDocument();
  });

  it('puts the recipe inputs on the shopping list in place of what they make', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(writeText);
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(screen.getByRole('button', { name: 'Copy shopping list for multibuy' }));

    // "Rifter Blueprint" (unbuilt) and "Tritanium Blueprint" (Tritanium is
    // now built here — its own Blueprint Acquisition row, issue #838) are both
    // excluded from the multibuy text (issue #1778): a blueprint is bought by
    // contract, not market order. Pyerite is what the build actually needs.
    expect(writeText).toHaveBeenCalledWith('Pyerite\t1250');
  });

  it('sizes the job against what is still needed, never rebuilding owned stock', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(writeText);
    // 1000 needed, 200 in hand: the job covers 800, which is 200 runs.
    render(<Harness plan={{ runs: 10, materialSourcing: { 34: { ownedQuantity: 200 } } }} />);

    await user.click(buildButton());
    await user.click(screen.getByRole('button', { name: 'Copy shopping list for multibuy' }));

    // Both Blueprint Acquisition rows are excluded from the multibuy text
    // (issue #1778) — only Pyerite, the real material, remains.
    expect(writeText).toHaveBeenCalledWith('Pyerite\t1000');
  });

  it('puts the material back on the list when the choice is undone', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(writeText);
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(screen.getByRole('button', { name: 'Buy instead: Tritanium' }));
    await user.click(screen.getByRole('button', { name: 'Copy shopping list for multibuy' }));

    // Undone: Tritanium is bought again, not built, so its own "Tritanium
    // Blueprint" Blueprint Acquisition row is gone too. "Rifter Blueprint"
    // (the plan's own blueprint) is still excluded from the multibuy text
    // (issue #1778) — only Tritanium, the real material, remains.
    expect(writeText).toHaveBeenCalledWith('Tritanium\t1000');
  });
});

describe('BuildPlanDetail Auto Build (issue #695)', () => {
  const strategySelect = () => screen.getByRole('combobox', { name: 'Build Strategy' });
  const tritaniumBuildButton = () =>
    screen.getByRole('button', { name: 'Build instead: Tritanium' });

  // Selecting a Build Strategy applies immediately — no separate Apply press.
  async function applyBuildStrategy(
    user: ReturnType<typeof userEvent.setup>,
    strategyLabel: string
  ) {
    await user.click(strategySelect());
    await user.click(await screen.findByRole('option', { name: strategyLabel }));
  }

  it('has no depth control — the single-plan Auto Build pass always walks the whole tree', async () => {
    render(<Harness plan={{ runs: 10 }} />);
    await screen.findByText('Tritanium');

    expect(screen.queryByRole('combobox', { name: 'Depth' })).not.toBeInTheDocument();
  });

  it('overwrites buildHere to match the chosen Build Strategy, applied immediately with no confirmation, reflected right away in the materials table', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    // `Harness` always passes `groupSnapshot={null}` — every test in this
    // file, including this one, already covers a plan with no Build Group
    // (AC #6): there is nothing special-cased for the grouped case here.
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await screen.findByText('Tritanium');

    await applyBuildStrategy(user, 'Build');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Depth is always "All levels": Tritanium (1) <- Pyerite (2).
    expect(onUpdate).toHaveBeenLastCalledWith({ buildHere: [34, 35] });
    // Pyerite's own consumption (Mexallon) only appears once its job is
    // actually pulled onto the table by buildHere containing it.
    expect(await screen.findByText('Mexallon')).toBeInTheDocument();
  });

  it('re-running Auto Build overwrites a hand-picked build/buy choice — expected, not a bug', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await screen.findByText('Tritanium');

    await user.click(tritaniumBuildButton());
    expect(onUpdate).toHaveBeenLastCalledWith({ buildHere: [34] });

    await applyBuildStrategy(user, 'Buy');

    expect(onUpdate).toHaveBeenLastCalledWith({ buildHere: [] });
    expect(
      await screen.findByRole('button', { name: 'Build instead: Tritanium' })
    ).toBeInTheDocument();
  });
});

/**
 * The job fee is charged by the system the job runs in, not the system the
 * plan sells in — the two are routinely different, and pricing the fee at the
 * hub overstated it threefold for a hub-selling, nullsec-building pilot. See
 * `docs/context/decisions/20260905-000835-*.md`.
 */
describe('BuildPlanDetail build system', () => {
  const systemInput = () => screen.getByLabelText('Build system');

  /**
   * Facility and build system sit behind "Override" — the line under the
   * search box states them, and the fields are one click away. Every test
   * below reads or edits one of them, so each opens it first.
   */
  async function openOverride(user: ReturnType<typeof userEvent.setup>) {
    await openSetup(user);
    await user.click(screen.getByRole('button', { name: /Override/ }));
  }

  afterEach(() => {
    loadMarketSnapshot.mockClear();
    resolveSolarSystem.mockClear();
    loadSystemSecurity.mockClear();
  });

  it('corrects a stored band that disagrees with the build system', async () => {
    // A plan saved before the Security select was removed can carry any band,
    // and it still drives the 1x/1.9x/2.1x rig multiplier. Nothing on screen
    // could fix it, so the panel reconciles it on load.
    const onDerivedFix = vi.fn();
    render(
      <Harness
        plan={{ security: 'nullsec', buildSystemId: 30003888, buildSystemName: 'Badivefi' }}
        onDerivedFix={onDerivedFix}
      />
    );

    await waitFor(() => expect(onDerivedFix).toHaveBeenCalledWith({ security: 'highsec' }));
  });

  it('falls a plan with no build system back to its hub band', async () => {
    const onDerivedFix = vi.fn();
    render(<Harness plan={{ security: 'lowsec', hubId: 'jita' }} onDerivedFix={onDerivedFix} />);

    // No request for this one — a hub's band is a constant on the hub record.
    await waitFor(() => expect(onDerivedFix).toHaveBeenCalledWith({ security: 'highsec' }));
    expect(loadSystemSecurity).not.toHaveBeenCalled();
  });

  it('leaves the stored band alone when the lookup cannot be reached', async () => {
    const onDerivedFix = vi.fn();
    loadSystemSecurity.mockResolvedValueOnce(null);
    render(
      <Harness
        plan={{ security: 'nullsec', buildSystemId: 30003888, buildSystemName: 'Badivefi' }}
        onDerivedFix={onDerivedFix}
      />
    );

    await waitFor(() => expect(loadSystemSecurity).toHaveBeenCalled());
    expect(onDerivedFix).not.toHaveBeenCalled();
  });

  it('states the security band under the field rather than offering it as a choice', async () => {
    // The band follows the system, so a select beside it could only ever
    // disagree with it.
    const user = userEvent.setup();
    render(
      <Harness plan={{ security: 'lowsec', buildSystemId: 30002813, buildSystemName: 'Tama' }} />
    );
    await openOverride(user);

    expect(await screen.findByText('Lowsec')).toBeInTheDocument();
    expect(screen.queryByLabelText('Security')).toBeNull();
  });

  it("summarises the plan's own location values under the search box", async () => {
    render(
      <Harness
        plan={{
          facility: 'azbel',
          security: 'lowsec',
          buildSystemId: 30003888,
          buildSystemName: 'Badivefi',
        }}
      />
    );
    // A synchronous click, not `openSetup`'s userEvent one: this plan's stored
    // band disagrees with Badivefi's real one, so `useDerivedSecurityBand`
    // corrects it moments after mount. `userEvent.click` awaits enough of the
    // event loop for that correction to land first, which would flip the text
    // this asserts before the assertion even runs.
    fireEvent.click(screen.getByRole('button', { name: 'Edit setup' }));

    expect(await screen.findByText(/Azbel · Badivefi · Lowsec/)).toBeInTheDocument();
  });

  it("names the plan's own picked location in the search box", async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ buildLocationId: 1035, buildLocationName: 'K2-18 R&D' }} />);
    await openSetup(user);

    expect(valueOf(await screen.findByLabelText('Build location'))).toBe('K2-18 R&D');
  });

  it('composes a stand-in name for a picked structure ESI would not name', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        plan={{
          facility: 'azbel',
          buildLocationId: 1035,
          buildSystemId: 30003888,
          buildSystemName: 'Badivefi',
        }}
      />
    );
    await openSetup(user);

    expect(valueOf(await screen.findByLabelText('Build location'))).toBe('Azbel in Badivefi');
  });

  it('forgets the picked location when the facility is changed by hand', async () => {
    // The stored name is a label, never a number — but a label naming a
    // Raitaru over a plan that now says NPC station is a label that lies.
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness
        plan={{ facility: 'raitaru', buildLocationId: 1035, buildLocationName: 'K2-18 R&D' }}
        onUpdate={onUpdate}
      />
    );
    await openOverride(user);

    await user.click(screen.getByLabelText('Facility'));
    await user.click(await screen.findByRole('option', { name: 'Azbel' }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        facility: 'azbel',
        buildLocationId: undefined,
        buildLocationName: undefined,
      })
    );
  });

  it('forgets the picked location when the build system is typed by hand', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness
        plan={{ buildLocationId: 1035, buildLocationName: 'K2-18 R&D' }}
        onUpdate={onUpdate}
      />
    );
    await openOverride(user);

    await user.type(systemInput(), 'badivefi');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        buildSystemId: 30003888,
        buildLocationId: undefined,
        buildLocationName: undefined,
      })
    );
  });

  it('takes the band from the system it just resolved', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ security: 'nullsec' }} onUpdate={onUpdate} />);
    await openOverride(user);

    await user.type(systemInput(), 'badivefi');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith({
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
      security: 'highsec',
    });
  });

  it('shows the hub system as the placeholder when no build system is set', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ hubId: 'jita' }} />);
    await openOverride(user);

    expect(valueOf(systemInput())).toBe('');
    expect(systemInput()).toHaveAttribute('placeholder', 'Jita');
  });

  it('resolves a typed system on commit and stores its id and ESI casing', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);
    await openOverride(user);

    await user.type(systemInput(), 'badivefi');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith({
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
      security: 'highsec',
    });
    expect(valueOf(systemInput())).toBe('Badivefi');
  });

  it('fetches the cost index for the build system, not the hub', async () => {
    render(<Harness plan={{ buildSystemId: 30003888, buildSystemName: 'Badivefi' }} />);

    await screen.findByText('Badivefi', { exact: false });
    expect(loadMarketSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jita' }),
      expect.anything(),
      30003888,
      'manufacturing'
    );
  });

  it('labels the cost index with the build system', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ buildSystemId: 30003888, buildSystemName: 'Badivefi' }} />);
    await user.click(await screen.findByRole('button', { name: 'Show details' }));

    expect(await screen.findByText('Cost index (Badivefi)')).toBeInTheDocument();
  });

  it('keeps the typed text and says so when ESI knows no such system', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);
    await openOverride(user);

    await user.type(systemInput(), 'Notasystem');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('No solar system by that name.');
    // The plan is untouched, and the near-miss is still there to correct.
    expect(onUpdate).not.toHaveBeenCalled();
    expect(valueOf(systemInput())).toBe('Notasystem');
  });

  it('clears back to the hub system when the field is emptied', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness
        plan={{ buildSystemId: 30003888, buildSystemName: 'Badivefi' }}
        onUpdate={onUpdate}
      />
    );
    await openOverride(user);

    await user.clear(systemInput());
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith({
      buildSystemId: undefined,
      buildSystemName: undefined,
      security: 'highsec',
    });
  });

  it('builds at the hub when the plan holds only half the id/name pair', async () => {
    // A half-pair is what a partial sync or a hand-edited record can leave
    // behind. Charging the fee at one system while labelling it another is
    // worse than not having a build system at all.
    const user = userEvent.setup();
    render(<Harness plan={{ buildSystemId: 30003888 }} />);
    await user.click(await screen.findByRole('button', { name: 'Show details' }));

    expect(await screen.findByText('Cost index (Jita)')).toBeInTheDocument();
    expect(loadMarketSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jita' }),
      expect.anything(),
      undefined,
      'manufacturing'
    );
  });

  it('does not call ESI when the field is committed unchanged', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ buildSystemId: 30003888, buildSystemName: 'Badivefi' }} />);
    await openOverride(user);

    await user.click(systemInput());
    await user.tab();

    expect(resolveSolarSystem).not.toHaveBeenCalled();
  });
});

describe('BuildPlanDetail reaction plans (issue #460)', () => {
  async function openOverride(user: ReturnType<typeof userEvent.setup>) {
    await openSetup(user);
    await user.click(screen.getByRole('button', { name: /Override/ }));
  }

  function reactionPlan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
    return {
      ...makePlan(overrides),
      blueprintTypeID: 46157,
      facility: 'athanor',
      ...overrides,
    };
  }

  it('has no ME/TE fields — reaction formulas carry no research activity', async () => {
    const user = userEvent.setup();
    render(<Harness plan={reactionPlan()} catalog={REACTION_CATALOG} />);
    await openSetup(user);

    expect(screen.queryByLabelText('ME %')).toBeNull();
    expect(screen.queryByLabelText('TE %')).toBeNull();
    // Runs is unaffected — only ME/TE are activity-specific.
    expect(runsInput()).toBeInTheDocument();
  });

  it('offers only Athanor/Tatara in the facility picker, never a manufacturing facility or NPC station', async () => {
    const user = userEvent.setup();
    render(<Harness plan={reactionPlan()} catalog={REACTION_CATALOG} />);
    await openOverride(user);

    await user.click(screen.getByRole('combobox', { name: 'Facility' }));
    const options = await screen.findAllByRole('option');
    // The selected option's own checkmark indicator rides along in
    // textContent (e.g. "✓Athanor"), so strip leading non-word characters
    // rather than comparing raw text.
    expect(options.map((o) => o.textContent?.replace(/^\W+/, '')).sort()).toEqual([
      'Athanor',
      'Tatara',
    ]);
  });

  it('produces a materials table and results for the reaction formula', async () => {
    const user = userEvent.setup();
    render(<Harness plan={reactionPlan()} catalog={REACTION_CATALOG} />);

    expect(await screen.findByText('Fullerides')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('Costs & revenue')).toBeInTheDocument();
  });

  it('never shows the Include Reactions toggle — it reuses its own facility for a nested reaction sub-build', async () => {
    const user = userEvent.setup();
    render(<Harness plan={reactionPlan()} catalog={REACTION_CATALOG} />);
    await openSetup(user);

    expect(screen.queryByRole('checkbox', { name: 'Include Reactions' })).toBeNull();
  });
});

describe('BuildPlanDetail Include Reactions (issue #698)', () => {
  it('shows an off Include Reactions toggle for a manufacturing-activity plan, with no Reaction Location fields', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);

    const toggle = screen.getByRole('checkbox', { name: 'Include Reactions' });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText('Reaction location')).toBeNull();
  });

  it('turning it on pre-fills the Reaction Location from the remembered default and reveals its controls', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.click(screen.getByRole('checkbox', { name: 'Include Reactions' }));

    expect(onUpdate).toHaveBeenLastCalledWith({
      includeReactions: true,
      reactionFacility: 'athanor',
      reactionRigFit: ['none', 'none', 'none'],
      reactionFacilityTaxPct: undefined,
    });
    expect(await screen.findByLabelText('Reaction location')).toBeInTheDocument();
  });

  it('turning it off again only clears the flag — the Reaction Location itself is left alone', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness
        plan={{ runs: 10, includeReactions: true, reactionFacility: 'tatara' }}
        onUpdate={onUpdate}
      />
    );
    await openSetup(user);

    await user.click(screen.getByRole('checkbox', { name: 'Include Reactions' }));

    expect(onUpdate).toHaveBeenLastCalledWith({ includeReactions: false });
  });

  it("lights up Auto Build's Reactions chip once Include Reactions is on", async () => {
    render(<Harness plan={{ runs: 10, includeReactions: true }} />);
    await screen.findByText('Tritanium');

    expect(screen.getByText('Reactions')).not.toHaveClass('text-text-dim');
  });

  it("leaves Auto Build's Reactions chip disabled while Include Reactions is off", async () => {
    render(<Harness plan={{ runs: 10 }} />);
    await screen.findByText('Tritanium');

    expect(screen.getByText('Reactions')).toHaveClass('text-text-dim');
  });
});

describe('BuildPlanDetail remembers the location it sets', () => {
  async function openOverride(user: ReturnType<typeof userEvent.setup>) {
    await openSetup(user);
    await user.click(screen.getByRole('button', { name: /Override/ }));
  }

  it('remembers a facility picked here as where the next manufacturing plan starts', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        plan={{
          facility: 'raitaru',
          security: 'highsec',
          buildSystemId: 30003888,
          buildSystemName: 'Badivefi',
          buildLocationId: 1035,
          buildLocationName: 'K2-18 R&D',
        }}
      />
    );
    await openOverride(user);

    await user.click(screen.getByLabelText('Facility'));
    await user.click(await screen.findByRole('option', { name: 'Azbel' }));

    await waitFor(() => expect(useFacilityDefaults.getState().value.facility).toBe('azbel'));
    // The plan's whole resulting location — its system stays, the picked
    // place the facility change forgot is forgotten here too.
    const remembered = useFacilityDefaults.getState().value;
    expect(remembered).toMatchObject({
      security: 'highsec',
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
    });
    expect('buildLocationId' in remembered).toBe(false);
  });

  it('remembers a typed build system', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openOverride(user);

    await user.type(screen.getByLabelText('Build system'), 'badivefi');
    await user.tab();

    await waitFor(() =>
      expect(useFacilityDefaults.getState().value.buildSystemName).toBe('Badivefi')
    );
  });

  it('remembers nothing for an edit that does not move the job', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.clear(runsInput());
    await user.type(runsInput(), '25');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith({ runs: 25 });
    expect(await db.settings.count()).toBe(0);
    expect(useFacilityDefaults.getState().value).toEqual(DEFAULT_FACILITY_DEFAULTS);
  });

  it('pre-fills the whole Reaction Location from the remembered one, without re-remembering it', async () => {
    useReactionFacilityDefaults.setState({
      value: {
        facility: 'tatara',
        rigFit: ['meT2', 'none', 'none'],
        facilityTaxPct: 1,
        security: 'lowsec',
        buildSystemId: 30002053,
        buildSystemName: 'Hek',
        buildLocationId: 1022734985679,
        buildLocationName: 'Hek - Refinery',
      },
      hydrated: true,
    });
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.click(screen.getByRole('checkbox', { name: 'Include Reactions' }));

    expect(onUpdate).toHaveBeenLastCalledWith({
      includeReactions: true,
      reactionFacility: 'tatara',
      reactionRigFit: ['meT2', 'none', 'none'],
      reactionFacilityTaxPct: 1,
      reactionSecurity: 'lowsec',
      reactionBuildSystemId: 30002053,
      reactionBuildSystemName: 'Hek',
      reactionBuildLocationId: 1022734985679,
      reactionBuildLocationName: 'Hek - Refinery',
    });
    expect(await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY)).toBeUndefined();
  });
});

describe('BuildPlanDetail material price basis', () => {
  /** Tritanium at 5 sell / 4 buy, so the two bases are told apart by the price cell. */
  function pricedSnapshot() {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: 100_000 },
      hubBuyPrices: { 34: 4, 587: 90_000 },
      adjustedPrices: { 34: 4.5 },
      systemCostIndex: 0.05,
    });
  }

  const basisSelect = () => screen.getByRole('combobox', { name: 'Material prices' });
  const tritaniumPrice = () => screen.getByLabelText('Price for Tritanium') as HTMLInputElement;

  it('opens on sell orders and offers both sides of the book', async () => {
    const user = userEvent.setup();
    pricedSnapshot();
    render(<Harness />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(basisSelect()).toHaveTextContent('Sell orders');

    await user.click(basisSelect());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      'Sell orders',
      'Buy orders',
    ]);
  });

  it('stores the picked basis on the plan', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    pricedSnapshot();
    render(<Harness onUpdate={onUpdate} />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    await user.click(basisSelect());
    await user.click(await screen.findByRole('option', { name: /Buy orders/ }));

    expect(onUpdate).toHaveBeenCalledWith({ materialPriceBasis: 'buy' });
  });

  it('re-prices the materials off the buy side once picked', async () => {
    const user = userEvent.setup();
    pricedSnapshot();
    render(<Harness />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(tritaniumPrice().value).toBe('5');
    const fetchesBefore = loadMarketSnapshot.mock.calls.length;

    await user.click(basisSelect());
    await user.click(await screen.findByRole('option', { name: /Buy orders/ }));

    await waitFor(() => expect(tritaniumPrice().value).toBe('4'));
    // One snapshot, both sides: switching basis must never spend a request.
    expect(loadMarketSnapshot.mock.calls.length).toBe(fetchesBefore);
  });

  it('prices a stored buy-basis plan off the buy side on first render', async () => {
    const user = userEvent.setup();
    pricedSnapshot();
    render(<Harness plan={{ materialPriceBasis: 'buy' }} />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(tritaniumPrice().value).toBe('4');
    expect(basisSelect()).toHaveTextContent('Buy orders');
  });
});

describe('BuildPlanDetail Corp Assets (issue #798)', () => {
  const corpAssetsToggle = () => screen.getByRole('button', { name: 'Corp Assets' });

  it("renders as a toggle button, not a checkbox — matches the app's other toggles", async () => {
    render(<Harness plan={{ runs: 10 }} corpOwnedStock={{ available: true }} />);
    await screen.findByText('Tritanium');

    expect(corpAssetsToggle()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Corp Assets' })).not.toBeInTheDocument();
  });

  it('is disabled when the active character lacks the corp Director role', async () => {
    render(<Harness plan={{ runs: 10 }} corpOwnedStock={{ available: false }} />);
    await screen.findByText('Tritanium');

    expect(corpAssetsToggle()).toBeDisabled();
  });

  it('toggles on and writes includeCorpAssets when the Director role is held', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness plan={{ runs: 10 }} corpOwnedStock={{ available: true }} onUpdate={onUpdate} />
    );
    await screen.findByText('Tritanium');

    await user.click(corpAssetsToggle());

    expect(onUpdate).toHaveBeenCalledWith({ includeCorpAssets: true });
  });
});

describe('BuildPlanDetail item context menu', () => {
  const viewInMarket = () => screen.findByRole('menuitem', { name: 'View in Market' });

  it("opens the standard item menu on the plan's own product heading", async () => {
    render(<Harness />);

    fireEvent.contextMenu(await screen.findByRole('heading', { name: 'Rifter', level: 2 }));

    expect(await viewInMarket()).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it.each([
    ['an input row', 'Pyerite'],
    ['the title', 'How to build Tritanium'],
  ])('opens it in the recipe modal, on %s', async (_where, text) => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(screen.getByRole('button', { name: 'Build instead: Tritanium' }));
    await user.click(await screen.findByRole('button', { name: 'Recipe: Tritanium' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.contextMenu(within(dialog).getByText(text));

    expect(await viewInMarket()).toBeInTheDocument();
  });
});

describe('BuildPlanDetail Character details implant note (issue #1588)', () => {
  const NOTE = 'Assumes no implants';

  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: 5, hydrated: true });
  });

  afterEach(() => {
    implantsGrant.lacking.clear();
  });

  it('notes that job time assumes no implants when the grant is missing', async () => {
    implantsGrant.lacking.add(5);
    render(<Harness />);

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it('hides the note once Character details is granted', async () => {
    render(<Harness />);

    await screen.findByRole('button', { name: 'Edit setup' });
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

/**
 * "Use all" is every row's own "Use assets" at once. It used to skip any row
 * with a number in it — a 0 from "Use none" included — and said nothing, so
 * after "Use none" it looked like a dead button while rows still offered stock.
 */
describe('BuildPlanDetail Use all / Use none', () => {
  const TRITANIUM_IN_JITA: OwnedStockSnapshot = {
    sources: [
      {
        characterId: 1,
        assets: [
          {
            item_id: 1,
            type_id: 34,
            location_id: 60003760,
            location_flag: 'Hangar',
            location_type: 'station',
            quantity: 5000,
            is_singleton: false,
          },
        ],
      },
    ],
    characterNames: new Map([[1, 'Pilot']]),
    incompleteCharacters: [],
  };

  it('fills a row Use none zeroed, says so, and Undo puts the 0 back', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    render(
      <Harness
        plan={{ runs: 1, materialSourcing: { 34: { ownedQuantity: 0 } } }}
        ownedStockSnapshot={TRITANIUM_IN_JITA}
        onSourcing={onSourcing}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Use all' }));

    expect(onSourcing).toHaveBeenLastCalledWith([{ typeID: 34, patch: { ownedQuantity: 100 } }]);
    expect(toastStatus()).toHaveTextContent('Filled Have on 1 material from your assets');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onSourcing).toHaveBeenLastCalledWith([{ typeID: 34, patch: { ownedQuantity: 0 } }]);
  });

  it('leaves a Blueprint Acquisition row alone even with a packaged blueprint in a hangar', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    const [source] = TRITANIUM_IN_JITA.sources;
    const packagedBlueprint = {
      ...source!.assets[0]!,
      item_id: 2,
      type_id: ENTRY.blueprintTypeID,
      quantity: 1,
    };
    const withPackagedBlueprint: OwnedStockSnapshot = {
      ...TRITANIUM_IN_JITA,
      sources: [{ ...source!, assets: [...source!.assets, packagedBlueprint] }],
    };
    render(
      <Harness
        plan={{ runs: 1 }}
        ownedStockSnapshot={withPackagedBlueprint}
        onSourcing={onSourcing}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Use all' }));

    expect(onSourcing).toHaveBeenLastCalledWith([{ typeID: 34, patch: { ownedQuantity: 100 } }]);
  });

  it('Use none still clears a Have a Blueprint Acquisition row was given', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    render(
      <Harness
        plan={{ runs: 1, materialSourcing: { [ENTRY.blueprintTypeID]: { ownedQuantity: 1 } } }}
        onSourcing={onSourcing}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Use none' }));

    expect(onSourcing).toHaveBeenLastCalledWith([
      { typeID: ENTRY.blueprintTypeID, patch: { ownedQuantity: 0 } },
    ]);
  });

  it('says there is nothing to fill instead of doing nothing silently', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    render(<Harness plan={{ runs: 1 }} onSourcing={onSourcing} />);

    await user.click(await screen.findByRole('button', { name: 'Use all' }));

    expect(onSourcing).not.toHaveBeenCalled();
    expect(toastStatus()).toHaveTextContent(/^Nothing to fill/);
  });
});

describe('BuildPlanDetail Break Even button', () => {
  // Rifter at 100 ISK is a loss; the plan also carries the fixture's 150M blueprint cost.
  function priceRifter(rifterPrice: number) {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: rifterPrice },
      hubBuyPrices: { 34: 4, 587: rifterPrice },
      adjustedPrices: { 34: 4.5, 587: rifterPrice },
      systemCostIndex: 0.05,
    });
  }
  const breakEvenButton = () => screen.findByRole('button', { name: 'Break Even' });

  afterEach(() => {
    breakEvenRuns.mockReset();
    loadMarketSnapshot.mockReset();
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.05,
    });
  });

  it('sets runs to the break-even count when the plan loses ISK', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    priceRifter(100);
    breakEvenRuns.mockReturnValue(250);
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.click(await breakEvenButton());

    expect(onUpdate).toHaveBeenCalledWith({ runs: 250 });
    expect(valueOf(runsInput())).toBe('250');
  });

  it('is absent when the plan already makes a profit', async () => {
    const user = userEvent.setup();
    priceRifter(100_000_000); // clears the fixture's 150M blueprint cost over 10 runs
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);

    await screen.findByLabelText('Price for Tritanium');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Break Even' })).not.toBeInTheDocument()
    );
  });

  it('says so, and leaves runs alone, when no break-even count exists', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    priceRifter(100);
    breakEvenRuns.mockReturnValue(null);
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.click(await breakEvenButton());

    expect(await screen.findByText(/No break even found up to/)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(valueOf(runsInput())).toBe('10');
  });

  it('drops the "none found" note once the plan changes', async () => {
    const user = userEvent.setup();
    priceRifter(100);
    breakEvenRuns.mockReturnValue(null);
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);
    await user.click(await breakEvenButton());
    expect(await screen.findByText(/No break even found up to/)).toBeInTheDocument();

    await user.clear(runsInput());
    await user.type(runsInput(), '20');
    await user.tab();

    expect(screen.queryByText(/No break even found up to/)).not.toBeInTheDocument();
  });
});
