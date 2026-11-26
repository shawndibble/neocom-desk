import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db';
import { FACILITY_DEFAULTS_SETTING_KEY } from '@/features/industry/facilityDefaults';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadBlueprints, loadMarketWideTrees } from '@/sde/loadSde';
import { BLUEPRINTS } from '@/test/industryMocks';
import { CHAR_ID, installIndustryHarness, seedPlan, seedRun } from '@/test/industryPage';
import { renderIndustryRoutes } from '@/test/industryRoutes';

vi.mock('@/features/market/priceVsMedian', async () =>
  (await import('@/test/industryMocks')).priceVsMedianMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/industryMocks')).loadSdeMock());

installIndustryHarness();

describe('Industry: data that fails to load', () => {
  it('says the blueprint data could not load instead of spinning, and loads it on Try again', async () => {
    vi.mocked(loadBlueprints).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    await renderIndustryRoutes();

    expect((await screen.findAllByText("Blueprint data couldn't load")).length).toBeGreaterThan(0);
    vi.mocked(loadBlueprints).mockImplementation(async () => BLUEPRINTS);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('searchbox', { name: 'Add Build Plan' })).toBeInTheDocument();
  });

  it('keeps BPC Sourcing usable while the blueprint data is missing', async () => {
    vi.mocked(loadBlueprints).mockRejectedValue(new Error('offline'));
    window.history.pushState({}, '', '/industry/sourcing');
    try {
      await renderIndustryRoutes();
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /sourcing|BPC/i })).toHaveAttribute(
          'aria-selected',
          'true'
        )
      );
      expect(screen.queryByText("Blueprint data couldn't load")).not.toBeInTheDocument();
    } finally {
      vi.mocked(loadBlueprints).mockImplementation(async () => BLUEPRINTS);
    }
  });

  it('notes that the market-wide build data is not downloaded, rather than rejecting unhandled', async () => {
    vi.mocked(loadMarketWideTrees).mockRejectedValueOnce(new Error('offline'));
    window.history.pushState({}, '', '/industry/opportunities');
    await renderIndustryRoutes();

    expect(
      (await screen.findAllByText("Market-wide build data hasn't been downloaded yet")).length
    ).toBeGreaterThan(0);
  });
});

describe('Industry: tabs are paths (issue #1300)', () => {
  it('sends bare /industry to the Build Plans tab, and a tab click pushes its own path', async () => {
    await seedRun();
    const user = userEvent.setup();
    await renderIndustryRoutes();

    await screen.findByRole('searchbox', { name: 'Add Build Plan' });
    expect(window.location.pathname).toBe('/industry/plans');

    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    await waitFor(() => expect(window.location.pathname).toBe('/industry/logs'));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
    );
  });

  it("shows the plan's own runs in the Runs column", async () => {
    await db.buildPlans.add(seedPlan({ runs: 7 }));
    window.history.pushState({}, '', '/industry/plans');
    await renderIndustryRoutes();

    const row = (await screen.findByText('Rifter run')).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('7')).toBeInTheDocument();
  });

  it('gives each tab the gear for its own settings, and none to a tab that has none', async () => {
    await seedRun();
    const user = userEvent.setup();
    await renderIndustryRoutes();

    await screen.findByRole('searchbox', { name: 'Add Build Plan' });
    await user.click(screen.getByRole('button', { name: 'Industry settings' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Industry settings' })).getByRole('spinbutton', {
        name: /Assumed ME/,
      })
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    await waitFor(() => expect(window.location.pathname).toBe('/industry/logs'));
    expect(screen.queryByRole('button', { name: /settings$/ })).not.toBeInTheDocument();
  });

  it('hides the Logs tab until a Production Run is logged', async () => {
    await renderIndustryRoutes();

    await screen.findByRole('searchbox', { name: 'Add Build Plan' });
    expect(screen.queryByRole('tab', { name: 'Logs' })).not.toBeInTheDocument();
    await seedRun();
    expect(await screen.findByRole('tab', { name: 'Logs' })).toBeInTheDocument();
  });

  it('opens the tab its path names', async () => {
    window.history.pushState({}, '', '/industry/logs');
    await renderIndustryRoutes();

    const tab = await screen.findByRole('tab', { name: 'Logs' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Industry: Build Plan CRUD', () => {
  it('creates via blueprint search (by product name), renames, duplicates, and deletes, persisted in Dexie', async () => {
    const user = userEvent.setup();
    await renderIndustryRoutes();

    const search = await screen.findByRole('searchbox', { name: 'Add Build Plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    expect(await screen.findByRole('button', { name: 'Rifter' })).toBeInTheDocument();
    const stored = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].blueprintTypeID).toBe(638);
    expect(stored[0].name).toBe('Rifter');
    expect(stored[0].facility).toBe('npcStation');
    expect(stored[0].rigFit).toEqual(['none', 'none', 'none']);
    expect(stored[0].security).toBe('highsec');
    expect(stored[0].hubId).toBe(DEFAULT_TRADE_HUB.id);
    expect(stored[0].facilityTaxPct).toBeUndefined();
    expect(window.location.pathname).toBe('/industry/plans');

    const rifterRow = screen.getByRole('button', { name: 'Rifter' }).closest('li')!;
    await user.click(within(rifterRow).getByRole('button', { name: 'More actions for Rifter' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const renameInput = await screen.findByRole('textbox', { name: 'Rename' });
    await user.clear(renameInput);
    await user.type(renameInput, 'Rifter run{Enter}');
    expect(await screen.findByRole('button', { name: 'Rifter run' })).toBeInTheDocument();

    const row = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    expect(within(row).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();

    fireEvent.contextMenu(within(row).getByRole('button', { name: 'Rifter run' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(await screen.findByRole('button', { name: 'Rifter run (copy)' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    expect(window.location.pathname).toBe('/industry/plans');

    const originalRow = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    await user.click(
      within(originalRow).getByRole('button', { name: 'More actions for Rifter run' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(screen.queryByRole('dialog', { name: 'Delete Build Plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rifter run' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeVisible();
    expect(screen.getAllByText('Deleted "Rifter run"').length).toBeGreaterThan(0);
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Rifter run' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();

    const againRow = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    await user.click(within(againRow).getByRole('button', { name: 'More actions for Rifter run' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Rifter run' })).not.toBeInTheDocument()
    );
    await waitFor(async () =>
      expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1)
    );
    const remaining = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Rifter run (copy)');
  });

  it('starts a new plan at the remembered location, with the hub from the most-recently-updated plan', async () => {
    await db.settings.put({
      key: FACILITY_DEFAULTS_SETTING_KEY,
      value: {
        facility: 'raitaru',
        rigFit: ['meT2', 'teT2', 'none'],
        facilityTaxPct: 0.25,
        security: 'lowsec',
        buildSystemId: 30002813,
        buildSystemName: 'Tama',
        buildLocationId: 1035466617946,
        buildLocationName: 'Tama - Sosala Raitaru',
        setOnPlanPage: true,
      },
    });
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-old',
        name: 'Old run',
        blueprintTypeID: 9841,
        hubId: 'rens',
        updatedAt: 3,
      })
    );
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-parts',
        name: 'Parts run',
        blueprintTypeID: 9841,
        facility: 'azbel',
        rigLevel: 't1',
        security: 'nullsec',
        hubId: 'amarr',
        facilityTaxPct: 0.1,
        buildSystemId: 30002510,
        buildSystemName: 'Rens',
        buildLocationId: 60004588,
        buildLocationName: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
        updatedAt: 5,
      })
    );
    const user = userEvent.setup();
    await renderIndustryRoutes();

    await screen.findByRole('button', { name: 'Parts run' });
    const search = await screen.findByRole('searchbox', { name: 'Add Build Plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    await screen.findByRole('button', { name: 'Rifter' });
    const created = await db.buildPlans
      .where('characterId')
      .equals(CHAR_ID)
      .and((p) => p.blueprintTypeID === 638)
      .first();
    expect(created?.facility).toBe('raitaru');
    expect(created?.rigFit).toEqual(['meT2', 'teT2', 'none']);
    expect(created?.security).toBe('lowsec');
    expect(created?.hubId).toBe('amarr');
    expect(created?.facilityTaxPct).toBe(0.25);
    expect(created?.buildSystemId).toBe(30002813);
    expect(created?.buildSystemName).toBe('Tama');
    expect(created?.buildLocationId).toBe(1035466617946);
    expect(created?.buildLocationName).toBe('Tama - Sosala Raitaru');
  });
});

describe('Industry: "jump to a Build Plan" from the Market Browser (issue #6)', () => {
  it('creates a plan for a product typeID with no existing plan, opens it, then clears the query param', async () => {
    window.history.pushState({}, '', '/industry?product=587');
    await renderIndustryRoutes();

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/industry\/plans\//));
    expect(window.location.search).toBe('');
  });

  it('opens an existing plan for that blueprint rather than creating a duplicate', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?product=587');
    await renderIndustryRoutes();

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('opens the matching plan even when it is not the first plan for the character', async () => {
    await db.buildPlans.add(seedPlan({ id: 'bp-0', name: 'Other plan', blueprintTypeID: 9841 }));
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run' }));
    window.history.pushState({}, '', '/industry?product=587');
    await renderIndustryRoutes();

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
  });
});
