import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { App } from '@/app/App';
import { CHAR_ID, installIndustryHarness, seedPlan, seedRun } from '@/test/industryPage';
import { SYNCED_BUILD_GROUPS_KEY, type BuildGroupsValue } from '@/features/industry/buildGroups';

vi.mock('@/features/market/priceVsMedian', async () =>
  (await import('@/test/industryMocks')).priceVsMedianMock()
);
vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/industryMocks')).pwaRegisterMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/industryMocks')).loadSdeMock());

installIndustryHarness(() => render(<App />));

describe('Industry routes in App', () => {
  it('opens bare /industry on the Build Plans tab, inside the shell', async () => {
    render(<App />);

    expect(await screen.findByRole('searchbox', { name: 'Add Build Plan' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/industry/plans');
    expect(screen.getByRole('tab', { name: 'Build Plans' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
  });

  it('sends the old /industry/records path to Logs', async () => {
    await seedRun();
    window.history.pushState({}, '', '/industry/records');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/logs'));
    expect(await screen.findByRole('tab', { name: 'Logs' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it("opens a Build Plan's own page at /industry/plans/:planId", async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry/plans/bp-1');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/industry/plans/bp-1');
  });

  it("opens a Build Group's rollup at /industry/groups/:groupId", async () => {
    const value: BuildGroupsValue = { [CHAR_ID]: [{ id: 'g1', name: 'Rifter fit', order: 0 }] };
    await db.settings.put({ key: SYNCED_BUILD_GROUPS_KEY, value });
    await db.buildPlans.add(seedPlan({ buildGroupId: 'g1' }));
    window.history.pushState({}, '', '/industry/groups/g1');
    render(<App />);

    expect(await screen.findByRole('link', { name: /Rifter run/ })).toBeInTheDocument();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
  });
});
