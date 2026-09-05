import { useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintType, TypeMap } from '@/sde/types';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { EMPTY_OWNED_STOCK_SNAPSHOT } from './ownedStockDetection';
import { BuildPlanDetail, type PlanPatch } from './BuildPlanDetail';

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
}

/**
 * Stands in for Industry.tsx: holds the plan in local state and applies
 * `onUpdate` patches to it, so a committed edit is visible in the next
 * render the way it would be against the real store.
 */
function Harness({ plan: planOverrides, catalog = CATALOG, onUpdate, onDerivedFix }: HarnessProps) {
  const [plan, setPlan] = useState<BuildPlanRecord>(makePlan(planOverrides));
  return (
    <MemoryRouter>
      <BuildPlanDetail
        plan={plan}
        catalog={catalog}
        pi={null}
        ownedBlueprints={[]}
        skills={{}}
        ownedStockSnapshot={EMPTY_OWNED_STOCK_SNAPSHOT}
        onUpdate={(patch) => {
          onUpdate?.(patch);
          setPlan((p) => ({ ...p, ...patch }));
        }}
        onDerivedFix={(patch) => {
          onDerivedFix?.(patch);
          setPlan((p) => ({ ...p, ...patch }));
        }}
        onSourcingChange={vi.fn()}
        onSourcingChangeMany={vi.fn()}
        onAddToQuickbar={vi.fn()}
        quickbarAvailable
        onShowInfo={vi.fn()}
      />
    </MemoryRouter>
  );
}

const runsInput = () => screen.getByRole('textbox', { name: 'Runs' });
const meInput = () => screen.getByLabelText('ME %');
const teInput = () => screen.getByLabelText('TE %');
const valueOf = (input: HTMLElement) => (input as HTMLInputElement).value;

describe('BuildPlanDetail runs/me/te fields (issue #455)', () => {
  it('reflects exactly what is typed mid-edit, including an intermediate out-of-range value', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.clear(runsInput());
    await user.type(runsInput(), '25000');

    // Still focused: the DOM shows the raw typed digits, not a clamp and not
    // the committed prop.
    expect(valueOf(runsInput())).toBe('25000');
  });

  it('keeps the field empty mid-edit when cleared, rather than snapping to 1', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.clear(runsInput());

    expect(valueOf(runsInput())).toBe('');
  });

  it('commits exactly once, with the typed value, when blurred after a valid edit', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);

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

    await user.clear(runsInput());
    await user.tab();

    expect(valueOf(runsInput())).toBe('10');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('does not call the update callback when a field is tabbed through untouched', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10, me: 5, te: 8 }} onUpdate={onUpdate} />);

    // Runs, then ME, then TE, then out — none of them touched.
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('ME: shows the raw typed value while editing and clamps only on blur', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ me: 0 }} onUpdate={onUpdate} />);

    await user.clear(meInput());
    await user.type(meInput(), '15');
    expect(valueOf(meInput())).toBe('15');

    await user.tab();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ me: 10 });
  });

  it('TE: shows the raw typed value while editing and clamps only on blur', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ te: 0 }} onUpdate={onUpdate} />);

    await user.clear(teInput());
    await user.type(teInput(), '25');
    expect(valueOf(teInput())).toBe('25');

    await user.tab();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ te: 20 });
  });

  it('ME: reverts to the last committed value on blur after clearing, without committing', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ me: 5 }} onUpdate={onUpdate} />);

    await user.clear(meInput());
    expect(valueOf(meInput())).toBe('');
    await user.tab();

    expect(valueOf(meInput())).toBe('5');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('TE: reverts to the last committed value on blur after clearing, without committing', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ te: 8 }} onUpdate={onUpdate} />);

    await user.clear(teInput());
    expect(valueOf(teInput())).toBe('');
    await user.tab();

    expect(valueOf(teInput())).toBe('8');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('clicking the ME label focuses its input, proving the htmlFor/id pairing (not just aria-label) works', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('ME %'));

    expect(document.activeElement).toBe(meInput());
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

    expect(writeText).toHaveBeenCalledWith('Tritanium\t960');
  });

  it('confirms on the button itself — a clipboard write leaves nothing else to look at', async () => {
    const user = userEvent.setup();
    configureClipboard(vi.fn<ClipboardWriter>().mockResolvedValue(undefined));
    render(<Harness />);

    await user.click(copyButton());

    expect(await screen.findByRole('button', { name: 'Shopping list copied' })).toBeInTheDocument();
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
  const buildButton = () =>
    screen.getByRole('button', { name: 'Build Tritanium here instead of buying it' });

  afterEach(() => configureClipboard(null));

  it('offers to build a material a blueprint produces, even with no prices to quote it', async () => {
    // `loadMarketSnapshot` is mocked to an empty price map, so no make-or-buy
    // verdict can be reached. The run count and input quantities need no
    // prices, so the offer must survive that.
    render(<Harness />);

    expect(await screen.findByRole('button', { name: /Build Tritanium here/ })).toBeInTheDocument();
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
    expect(within(pyerite as HTMLElement).getByText('1,250')).toBeInTheDocument();
  });

  it('marks an expanded input with its own make-or-buy verdict, but offers no control for it', async () => {
    // Pyerite has its own producer (`PYERITE_ENTRY`) and, unlike every other
    // test here, a real hub price to judge it against — so once Tritanium's
    // job pulls it onto the table, it should carry the same advisory glyph a
    // plan's own material gets, without a second level of "build here".
    loadMarketSnapshot.mockResolvedValueOnce({
      hubPrices: { 35: 20, 36: 5 },
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.05,
    });
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    const pyerite = (await screen.findByText('Pyerite')).closest('tr') as HTMLElement;

    expect(within(pyerite).getByRole('img')).toHaveAccessibleName(/^Cheaper to (build|buy):/);
    expect(within(pyerite).queryByRole('button', { name: /Build|Buy/ })).not.toBeInTheDocument();
  });

  it('puts the recipe inputs on the shopping list in place of what they make', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(writeText);
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(screen.getByRole('button', { name: 'Copy shopping list for multibuy' }));

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

    expect(writeText).toHaveBeenCalledWith('Pyerite\t1000');
  });

  it('puts the material back on the list when the choice is undone', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(writeText);
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());
    await user.click(screen.getByRole('button', { name: 'Buy Tritanium instead of building it' }));
    await user.click(screen.getByRole('button', { name: 'Copy shopping list for multibuy' }));

    expect(writeText).toHaveBeenCalledWith('Tritanium\t1000');
  });

  it('never offers to expand an input a sub-build introduced — the feature is one level deep', async () => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(buildButton());

    // Pyerite has no producer in the catalog, but the guard that matters is
    // that indented rows are never offered the control at all.
    await screen.findByText('Pyerite');
    expect(screen.queryByRole('button', { name: /Build Pyerite here/ })).toBeNull();
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

    expect(await screen.findByText(/Azbel · Badivefi · Lowsec/)).toBeInTheDocument();
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
    render(<Harness plan={{ buildSystemId: 30003888, buildSystemName: 'Badivefi' }} />);

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
    render(<Harness plan={{ buildSystemId: 30003888 }} />);

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

  it('has no ME/TE fields — reaction formulas carry no research activity', () => {
    render(<Harness plan={reactionPlan()} catalog={REACTION_CATALOG} />);
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
    render(<Harness plan={reactionPlan()} catalog={REACTION_CATALOG} />);

    expect(await screen.findByText('Fullerides')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });
});
