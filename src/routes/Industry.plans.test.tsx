import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { useAssumedMe } from '@/features/industry/assumedMe';
import {
  CHAR_ID,
  emptySkillsPayload,
  installIndustryHarness,
  seedPlan,
  server,
} from '@/test/industryPage';
import { holdHydration } from '@/test/holdHydration';
import { renderIndustryRoutes } from '@/test/industryRoutes';

vi.mock('@/features/market/priceVsMedian', async () =>
  (await import('@/test/industryMocks')).priceVsMedianMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/industryMocks')).loadSdeMock());

installIndustryHarness();

describe('Industry: a Build Plan seeded from a BPC listing (issue #637)', () => {
  const SEEDED = '/industry?product=587&me=10&te=20&runs=5';

  it("opens a plan at the listing's own ME, TE and runs, then clears the seed", async () => {
    window.history.pushState({}, '', SEEDED);
    await renderIndustryRoutes();

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    expect(created?.name).toBe('Rifter 10/20 ×5');
    expect(created?.me).toBe(10);
    expect(created?.te).toBe(20);
    expect(created?.runs).toBe(5);
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('beats an owned copy of the same blueprint at different research', async () => {
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
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    expect(created?.me).toBe(10);
    expect(created?.te).toBe(20);
  });

  it('creates the seeded plan beside an existing plan at different research, not instead of it', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', SEEDED);
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    expect((await db.buildPlans.get('bp-1'))?.me).toBe(0);
  });

  it('reuses the plan the first click created when the same listing is opened again', async () => {
    await db.buildPlans.add(
      seedPlan({ id: 'bp-seeded', name: 'Rifter 10/20 ×5', me: 10, te: 20, runs: 5 })
    );
    window.history.pushState({}, '', SEEDED);
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-seeded'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('leaves the unseeded path alone when only some of the three numbers arrive', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?product=587&me=10');
    await renderIndustryRoutes();

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: a Build Plan seeded from an LP Store offer', () => {
  const LP_SEEDED = '/industry?product=587&bpPrice=1500000';

  it('opens a plan whose blueprint is the LP pick at that price, then clears the seed', async () => {
    window.history.pushState({}, '', LP_SEEDED);
    await renderIndustryRoutes();

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
    await renderIndustryRoutes();

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
    await renderIndustryRoutes();

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
    await renderIndustryRoutes();

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-lp'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: "View in Industry as material" from Assets (issue #414)', () => {
  it("opens the character's existing plan whose blueprint consumes the material, then clears the query param", async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?material=34');
    await renderIndustryRoutes();

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('opens the correct plan when it is not the only one seeded', async () => {
    await db.buildPlans.add(seedPlan({ id: 'bp-0', name: 'Other plan', blueprintTypeID: 9841 }));
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run', blueprintTypeID: 638 }));
    window.history.pushState({}, '', '/industry?material=35');
    await renderIndustryRoutes();

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
  });

  it('clears the query param without opening or creating anything when no plan consumes that material', async () => {
    await db.buildPlans.add(seedPlan({ blueprintTypeID: 9841 }));
    window.history.pushState({}, '', '/industry?material=999');
    await renderIndustryRoutes();

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
    await renderIndustryRoutes();

    expect(await screen.findByText(/: grant Industry$/)).toBeInTheDocument();
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
      http.get('https://esi.evetech.net/characters/:id/implants', () => HttpResponse.json([])),
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
    await renderIndustryRoutes();
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Build Opportunities' });
    const pageHeader = screen
      .getByRole('heading', { level: 1, name: 'Industry' })
      .closest('header')!;
    await user.click(await within(pageHeader).findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));
    expect(new URLSearchParams(window.location.search).get('industry.chars')).toBe('all');

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Rifter to compare plans' })
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Mechanical Parts to compare plans' })
    );
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
    const assumedMe = holdHydration(useAssumedMe, 0);
    window.history.pushState({}, '', '/industry/opportunities');
    try {
      await renderIndustryRoutes();

      expect((await screen.findAllByRole('status', { name: 'Loading' })).length).toBeGreaterThan(0);
      expect(
        screen.queryByRole('heading', { name: 'Build Opportunities' })
      ).not.toBeInTheDocument();
      assumedMe.release();
    } finally {
      assumedMe.restore();
    }

    expect(await screen.findByRole('heading', { name: 'Build Opportunities' })).toBeInTheDocument();
    const profitable = screen.getByRole('heading', { name: "What's profitable" });
    expect(profitable).toBeInTheDocument();
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
    await renderIndustryRoutes();

    const ranked = await screen.findByRole('heading', { name: 'Build Opportunities' });
    const profitable = await screen.findByRole('heading', { name: "What's profitable" });
    expect(
      profitable.compareDocumentPosition(ranked) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const section = profitable.closest('section')!;
    expect(within(section).queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument();
  });
});
