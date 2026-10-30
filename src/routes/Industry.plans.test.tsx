import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { App } from '@/app/App';
import {
  CHAR_ID,
  emptySkillsPayload,
  installIndustryHarness,
  seedPlan,
  server,
} from '@/test/industryPage';

vi.mock('@/features/market/priceVsMedian', async () =>
  (await import('@/test/industryMocks')).priceVsMedianMock()
);
vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/industryMocks')).pwaRegisterMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/industryMocks')).loadSdeMock());

installIndustryHarness();

describe('Industry: a Build Plan seeded from a BPC listing (issue #637)', () => {
  const SEEDED = '/industry?product=587&me=10&te=20&runs=5';

  it("opens a plan at the listing's own ME, TE and runs, then clears the seed", async () => {
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    // Named for the copy it quotes: a pilot can hold a plain plan and several
    // seeded plans for one blueprint, and rows all reading "Rifter" would be
    // unusable.
    expect(created?.name).toBe('Rifter 10/20 ×5');
    expect(created?.me).toBe(10);
    expect(created?.te).toBe(20);
    expect(created?.runs).toBe(5);
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('beats an owned copy of the same blueprint at different research', async () => {
    // The pilot is judging a copy they might buy, not the one in the hangar.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json([
          {
            item_id: 1,
            type_id: 638,
            runs: -1,
            material_efficiency: 8,
            time_efficiency: 16,
            quantity: 1,
          },
        ])
      )
    );
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    expect(created?.me).toBe(10);
    expect(created?.te).toBe(20);
  });

  it('creates the seeded plan beside an existing plan at different research, not instead of it', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    // The plain plan is untouched, and exactly one plan was added — the create
    // effect must settle rather than re-fire once the seeded plan exists.
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    expect((await db.buildPlans.get('bp-1'))?.me).toBe(0);
  });

  it('reuses the plan the first click created when the same listing is opened again', async () => {
    await db.buildPlans.add(
      seedPlan({ id: 'bp-seeded', name: 'Rifter 10/20 ×5', me: 10, te: 20, runs: 5 })
    );
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-seeded'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('leaves the unseeded path alone when only some of the three numbers arrive', async () => {
    // A truncated or hand-edited URL is not a half-seeded intent: it falls all
    // the way back to the ordinary `?product=` behaviour.
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?product=587&me=10');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: a Build Plan seeded from an LP Store offer', () => {
  const LP_SEEDED = '/industry?product=587&bpPrice=1500000';

  it('opens a plan whose blueprint is the LP pick at that price, then clears the seed', async () => {
    window.history.pushState({}, '', LP_SEEDED);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(''));
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    expect(created?.name).toBe('Rifter (LP Store)');
    expect(created?.materialSourcing?.[638]).toEqual({
      acquisitionTierOverride: { me: 0, te: 0 },
      overridePrice: 1_500_000,
    });
  });

  it('creates the LP plan beside a plain plan for the same blueprint, not over it', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', LP_SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    expect((await db.buildPlans.get('bp-1'))?.materialSourcing?.[638]).toBeUndefined();
  });

  it('reuses an LP plan opened again and refreshes its price rather than adding a twin', async () => {
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-lp',
        materialSourcing: {
          638: { acquisitionTierOverride: { me: 0, te: 0 }, overridePrice: 1_000_000 },
        },
      })
    );
    window.history.pushState({}, '', LP_SEEDED);
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-lp'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
    expect((await db.buildPlans.get('bp-lp'))?.materialSourcing?.[638]?.overridePrice).toBe(
      1_500_000
    );
  });

  it('reuses a plan already carrying that exact pick', async () => {
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-lp',
        materialSourcing: {
          638: { acquisitionTierOverride: { me: 0, te: 0 }, overridePrice: 1_500_000 },
        },
      })
    );
    window.history.pushState({}, '', LP_SEEDED);
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-lp'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: "View in Industry as material" from Assets (issue #414)', () => {
  it("opens the character's existing plan whose blueprint consumes the material, then clears the query param", async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?material=34');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    // Never creates a plan — only opens among the character's existing ones.
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('opens the correct plan when it is not the only one seeded', async () => {
    // Material 35 (Pyerite) is a Rifter-only input — 9841 (Mechanical Parts)
    // doesn't consume it, unlike Tritanium (34), which both blueprints share.
    await db.buildPlans.add(seedPlan({ id: 'bp-0', name: 'Other plan', blueprintTypeID: 9841 }));
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run', blueprintTypeID: 638 }));
    window.history.pushState({}, '', '/industry?material=35');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
  });

  it('clears the query param without opening or creating anything when no plan consumes that material', async () => {
    await db.buildPlans.add(seedPlan({ blueprintTypeID: 9841 }));
    // 999: not a material of either fixture blueprint.
    window.history.pushState({}, '', '/industry?material=999');
    render(<App />);

    await screen.findByRole('button', { name: 'Rifter run' });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.location.pathname).toBe('/industry/plans');
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: owned-blueprint reauth', () => {
  it('shows a re-login prompt when the blueprints scope was revoked, without blocking the rest of the page', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);

    expect(await screen.findByText('Log in again to see owned blueprints')).toBeInTheDocument();
    // The Build Plan list and Active Jobs panel still render.
    expect(await screen.findByRole('searchbox', { name: 'Add Build Plan' })).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });
});

describe('Industry: Opportunities "Add to Compare" for an alt-owned row (issue #1061)', () => {
  const ALT_ID = 92;

  beforeEach(async () => {
    await db.characters.put({
      characterId: ALT_ID,
      name: 'Alt Pilot',
      ownerHash: 'oh-alt',
      addedAt: 1,
    });
    await db.tokens.put({
      characterId: ALT_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-skills.read_skillqueue.v1'],
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${ALT_ID}/skills`, () =>
        HttpResponse.json(emptySkillsPayload)
      ),
      http.get(`https://esi.evetech.net/characters/${ALT_ID}/skillqueue`, () =>
        HttpResponse.json([])
      ),
      // Both Characters' industry modifiers read implants. Left unhandled,
      // those reads error and the modifiers settle late — after the rows are
      // on screen — so the recompute swaps the rows out under the second
      // click. (Masked until the Foreground Poller stopped warming the same
      // reads at mount.)
      http.get('https://esi.evetech.net/characters/:id/implants', () => HttpResponse.json([])),
      // The sidebar's character switcher now has two characters to show and
      // fetches public/corp info for each — not exercised by any single-
      // character test in this suite.
      http.get('https://esi.evetech.net/characters/:id', ({ params }) =>
        HttpResponse.json({
          name: params.id === String(ALT_ID) ? 'Alt Pilot' : 'Pilot One',
          corporation_id: 1000001,
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
        })
      ),
      http.get('https://esi.evetech.net/characters/:id/corporationhistory', () =>
        HttpResponse.json([])
      ),
      http.get('https://esi.evetech.net/corporations/:id', () =>
        HttpResponse.json({ name: 'Corp', ticker: 'CORP' })
      ),
      http.get(`https://esi.evetech.net/characters/${ALT_ID}/blueprints`, () =>
        HttpResponse.json([
          {
            item_id: 501,
            type_id: 638,
            runs: -1,
            material_efficiency: 10,
            time_efficiency: 20,
            quantity: 1,
            location_id: 60003760,
            location_flag: 'Hangar',
          },
          {
            item_id: 502,
            type_id: 9841,
            runs: -1,
            material_efficiency: 10,
            time_efficiency: 20,
            quantity: 1,
            location_id: 60003760,
            location_flag: 'Hangar',
          },
        ])
      )
    );
  });

  it('seeds both rows onto the active character and shows a real comparison, not the empty state', async () => {
    window.history.pushState({}, '', '/industry/opportunities');
    render(<App />);
    const user = userEvent.setup();

    // The page defaults to "This character" (91, no blueprints); switch to
    // "All characters" to see the alt's two Rifter/Mechanical Parts BPOs.
    // Industry's one picker, in the page header, drives Opportunities and
    // Active Jobs alike.
    await screen.findByRole('heading', { name: 'Build Opportunities' });
    const pageHeader = screen
      .getByRole('heading', { level: 1, name: 'Industry' })
      .closest('header')!;
    await user.click(await within(pageHeader).findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));
    // The filter lives in the URL, so a reload keeps it.
    expect(new URLSearchParams(window.location.search).get('industry.chars')).toBe('all');

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Rifter to compare plans' })
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Mechanical Parts to compare plans' })
    );
    // Below `lg` (jsdom matches no media query) Compare lives in the phone
    // list's bar pinned above the tab bar, not the panel header.
    const compareBar = screen.getByRole('region', { name: 'Compare selected blueprints' });
    await user.click(within(compareBar).getByRole('button', { name: 'Compare' }));

    expect(await screen.findByRole('table', { name: 'Build Plan comparison' })).toBeInTheDocument();
    expect(screen.queryByText('Select at least 2 plans')).not.toBeInTheDocument();

    const seeded = await db.buildPlans.toArray();
    expect(seeded).toHaveLength(2);
    for (const plan of seeded) expect(plan.characterId).toBe(CHAR_ID);
  });
});

describe('Industry: Build Opportunities waits for the pricing-settings hydration gate (#2054)', () => {
  it('shows a spinner in place of the panel, and never mounts it, until Assumed ME hydrates', async () => {
    // Same reset shape `Settings.test.tsx`/`IndustryPlanPage.test.tsx` use to
    // force a store back to its pre-hydration state — the workspace's own
    // mount effect (`buildPlanPricingInputs.ts`) re-hydrates it once this
    // page renders.
    useAssumedMe.setState({ value: 0, hydrated: false });
    window.history.pushState({}, '', '/industry/opportunities');
    render(<App />);

    // One `waitFor` so the find and the assert run in the same tick: the boot
    // screen's own spinner is also "Loading" and unmounts as the route lands.
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('heading', { name: 'Build Opportunities' })).not.toBeInTheDocument();

    // Resolves on its own once the (real, Dexie-backed) hydrate() call
    // settles — nothing in the test drives it forward by hand. Market-Wide
    // Build Opportunities reads no pricing input, so it's unaffected and
    // renders alongside the now-mounted panel.
    expect(await screen.findByRole('heading', { name: 'Build Opportunities' })).toBeInTheDocument();
    const profitable = screen.getByRole('heading', { name: "What's profitable" });
    expect(profitable).toBeInTheDocument();
    // Owning no blueprints leaves the order alone: the market-wide scan leads.
    expect(
      profitable.compareDocumentPosition(
        screen.getByRole('heading', { name: 'Build Opportunities' })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('Industry: Opportunities page order with owned blueprints (#3071)', () => {
  it("leads with What's profitable, open, ahead of Build Opportunities", async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json([
          {
            item_id: 601,
            type_id: 638,
            runs: -1,
            material_efficiency: 10,
            time_efficiency: 20,
            quantity: 1,
            location_id: 60003760,
            location_flag: 'Hangar',
          },
        ])
      )
    );
    window.history.pushState({}, '', '/industry/opportunities');
    render(<App />);

    const ranked = await screen.findByRole('heading', { name: 'Build Opportunities' });
    const profitable = await screen.findByRole('heading', { name: "What's profitable" });
    expect(
      profitable.compareDocumentPosition(ranked) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const section = profitable.closest('section')!;
    expect(within(section).queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument();
  });
});
