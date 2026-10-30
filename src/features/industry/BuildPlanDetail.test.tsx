import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import {
  toastStatus,
  Harness,
  runsInput,
  valueOf,
  openSetup,
  installBuildPlanDetailHarness,
} from './buildPlanDetailHarness.testutil';

vi.mock('@/features/market/priceVsMedian', async () =>
  (await import('./buildPlanDetailMocks.testutil')).priceVsMedianMock()
);
vi.mock('./marketData', async () =>
  (await import('./buildPlanDetailMocks.testutil')).marketDataMock()
);
vi.mock('@/market/prices', async (importOriginal) =>
  (await import('./buildPlanDetailMocks.testutil')).pricesMock(
    await importOriginal<typeof import('@/market/prices')>()
  )
);
vi.mock('@/features/character/systemLookup', async () =>
  (await import('./buildPlanDetailMocks.testutil')).systemLookupMock()
);
vi.mock('@/engine/industry/breakEvenRuns', async (importOriginal) =>
  (await import('./buildPlanDetailMocks.testutil')).breakEvenRunsMock(
    await importOriginal<typeof import('@/engine/industry/breakEvenRuns')>()
  )
);
vi.mock('@/features/character/systemSecurity', async () =>
  (await import('./buildPlanDetailMocks.testutil')).systemSecurityMock()
);
vi.mock('@/app/useGrantedScopes', async () =>
  (await import('./buildPlanDetailMocks.testutil')).grantedScopesMock()
);

installBuildPlanDetailHarness();

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

  // One throwaway render-and-copy, so no test pays for the first one. The click
  // re-renders this very large component once the clipboard write resolves, and
  // under CI load that first re-render outlasted `findBy*`'s 1s default and
  // landed on whichever test ran first. Paid here under the hook's own budget.
  beforeAll(async () => {
    configureClipboard(vi.fn<ClipboardWriter>().mockResolvedValue(undefined));
    const { unmount } = render(<Harness />);
    await userEvent.click(copyButton());
    await screen.findByRole('button', { name: 'Shopping list copied' }, { timeout: 25_000 });
    unmount();
    configureClipboard(null);
  }, 30_000);

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
    const user = userEvent.setup();
    configureClipboard(vi.fn<ClipboardWriter>().mockResolvedValue(undefined));
    // Default fixture's "Rifter Blueprint" Blueprint Acquisition row (issue
    // #838) is what gets left out here.
    render(<Harness />);

    await user.click(copyButton());

    // findAll: Toast renders its message twice (visible span + live region), and
    // the live region fills in a beat later — `findByText` throws on the
    // two-match state and never recovers while the toast stays up.
    expect(
      (await screen.findAllByText('1 blueprint left out — buy it by contract')).length
    ).toBeGreaterThan(0);
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

describe('BuildPlanDetail hero runs field', () => {
  it('edits runs beside the product name, not in the setup form', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await screen.findByText('Tritanium');

    const runs = screen.getByRole('textbox', { name: 'Runs' });
    await user.clear(runs);
    await user.type(runs, '25');
    await user.tab();

    expect(onUpdate).toHaveBeenLastCalledWith({ runs: 25 });
    await user.click(screen.getByRole('button', { name: 'Edit setup' }));
    expect(screen.getAllByRole('textbox', { name: 'Runs' })).toHaveLength(1);
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

  it('says what a strategy change built and offers Undo back to the previous choices', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await screen.findByText('Tritanium');

    await applyBuildStrategy(user, 'Build');

    expect(toastStatus()).toHaveTextContent('Build strategy applied: 2 parts built here.');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUpdate).toHaveBeenLastCalledWith({ buildHere: [] });
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
