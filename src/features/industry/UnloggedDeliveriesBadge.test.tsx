import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { IndustryJob } from '@/esi/endpoints';
import { UnloggedDeliveriesBadge } from './UnloggedDeliveriesBadge';

function delivered(job_id: number, blueprint_type_id = 100): IndustryJob {
  return {
    job_id,
    activity_id: 1,
    blueprint_type_id,
    product_type_id: 200,
    facility_id: 1,
    station_id: 1,
    runs: 1,
    start_date: '2026-09-01T00:00:00Z',
    end_date: '2026-09-01T02:00:00Z',
    status: 'delivered',
  };
}

beforeEach(async () => {
  await db.industryJobHistory.clear();
  await db.productionRuns.clear();
});

function renderBadge() {
  render(
    <MemoryRouter>
      <UnloggedDeliveriesBadge characterId={1} blueprintTypeId={100} />
    </MemoryRouter>
  );
}

describe('UnloggedDeliveriesBadge', () => {
  it('counts this blueprint’s unlogged deliveries and links to History', async () => {
    await db.industryJobHistory.put({
      characterId: 1,
      jobs: [delivered(1), delivered(2), delivered(3, 999)],
      fetchedAt: 1,
    });
    await db.productionRuns.add({
      id: 'r',
      characterId: 1,
      buildPlanId: 'p',
      productTypeID: 200,
      quantity: 1,
      materialCost: 0,
      jobFee: 0,
      totalCost: 0,
      loggedAt: Date.parse('2026-09-02T00:00:00Z'),
      updatedAt: 1,
      sourceJobId: 1,
    });
    renderBadge();

    const link = await screen.findByRole('link', { name: '1 delivered job not logged' });
    expect(link).toHaveAttribute('href', '/industry/plans?jobs.view=history');
  });

  it('renders nothing when every delivery is logged', async () => {
    await db.industryJobHistory.put({ characterId: 1, jobs: [], fetchedAt: 1 });
    renderBadge();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
