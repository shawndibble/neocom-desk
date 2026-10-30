import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, type BuildPlanRecord } from '@/db';
import { DEFAULT_FACILITY_DEFAULTS, useFacilityDefaults } from './facilityDefaults';
import {
  REACTION_FACILITY_DEFAULTS_SETTING_KEY,
  useReactionFacilityDefaults,
} from './reactionFacilityDefaults';
import {
  costIndexSystem,
  REACTION_CATALOG,
  makePlan,
  Harness,
  runsInput,
  valueOf,
  openSetup,
  installBuildPlanDetailHarness,
} from './buildPlanDetailHarness.testutil';
import {
  loadMarketSnapshot,
  resolveSolarSystem,
  loadSystemSecurity,
} from './buildPlanDetailMocks.testutil';

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
    await user.click(await screen.findByRole('button', { name: /^total job cost/i }));

    expect(await costIndexSystem('Badivefi')).toBeInTheDocument();
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

  it('says it could not check, not "no such system", when the lookup is unavailable', async () => {
    resolveSolarSystem.mockResolvedValueOnce({ status: 'unavailable' });
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);
    await openOverride(user);

    await user.type(systemInput(), 'Badivefi');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't check that name");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(valueOf(systemInput())).toBe('Badivefi');
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
    await user.click(await screen.findByRole('button', { name: /^total job cost/i }));

    expect(await costIndexSystem('Jita')).toBeInTheDocument();
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

  it('says Auto Build includes reactions once Include Reactions is on', async () => {
    render(<Harness plan={{ runs: 10, includeReactions: true }} />);
    await screen.findByText('Tritanium');

    expect(screen.getByText('incl. reactions')).toBeInTheDocument();
  });

  it('says Auto Build leaves reactions out while Include Reactions is off', async () => {
    render(<Harness plan={{ runs: 10 }} />);
    await screen.findByText('Tritanium');

    expect(screen.getByText('no reactions')).toBeInTheDocument();
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

describe('BuildPlanDetail with an unreachable price source (offline)', () => {
  it('keeps the materials and says prices are unavailable offline, instead of pricing them as missing', async () => {
    const user = userEvent.setup();
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.05,
      hubPricesUnreachable: true,
    });
    render(<Harness />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect((await screen.findAllByText('Prices unavailable right now')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/have no price on the chosen side/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Try again shortly/)).not.toBeInTheDocument();
  });
});

describe('BuildPlanDetail profit if sold now (issue #5007)', () => {
  it('quotes the product into buy orders under Profit, and explains it in the breakdown', async () => {
    const user = userEvent.setup();
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: 100_000 },
      hubBuyPrices: { 34: 4, 587: 90_000 },
      adjustedPrices: { 34: 4.5 },
      systemCostIndex: 0.05,
    });
    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Show details' }));

    expect(await screen.findByText('Profit if sold now')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Calculations?' })[0]!);
    expect(
      await screen.findByText('Priced at the highest buy order; a large quantity may fill lower.')
    ).toBeInTheDocument();
  });

  it('says the hub has no buy orders when there are none for the product', async () => {
    const user = userEvent.setup();
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: 100_000 },
      hubBuyPrices: { 34: 4 },
      adjustedPrices: { 34: 4.5 },
      systemCostIndex: 0.05,
    });
    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Show details' }));

    expect(await screen.findByText('No buy orders at Jita')).toBeInTheDocument();
  });
});
