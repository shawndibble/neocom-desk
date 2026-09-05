import { useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
vi.mock('./marketData', () => ({
  loadMarketSnapshot: vi.fn(async () => ({
    hubPrices: {},
    hubBuyPrices: {},
    adjustedPrices: {},
    systemCostIndex: 0.05,
  })),
}));

const BLUEPRINT: BlueprintType = {
  name: 'Rifter Blueprint',
  time: 1200,
  materials: [{ typeID: 34, quantity: 100 }],
  products: [{ typeID: 587, quantity: 1 }],
  skills: [],
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
};

const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
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

const CATALOG: BlueprintCatalog = {
  entries: [ENTRY, TRITANIUM_ENTRY],
  byBlueprintTypeID: new Map([
    [638, ENTRY],
    [639, TRITANIUM_ENTRY],
  ]),
  byProductTypeID: new Map([
    [587, ENTRY],
    [34, TRITANIUM_ENTRY],
  ]),
  typesById: TYPES,
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
  onUpdate?: (patch: PlanPatch) => void;
}

/**
 * Stands in for Industry.tsx: holds the plan in local state and applies
 * `onUpdate` patches to it, so a committed edit is visible in the next
 * render the way it would be against the real store.
 */
function Harness({ plan: planOverrides, onUpdate }: HarnessProps) {
  const [plan, setPlan] = useState<BuildPlanRecord>(makePlan(planOverrides));
  return (
    <MemoryRouter>
      <BuildPlanDetail
        plan={plan}
        catalog={CATALOG}
        pi={null}
        ownedBlueprints={[]}
        skills={{}}
        ownedStockSnapshot={EMPTY_OWNED_STOCK_SNAPSHOT}
        onUpdate={(patch) => {
          onUpdate?.(patch);
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
