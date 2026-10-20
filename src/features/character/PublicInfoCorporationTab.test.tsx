import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import PublicInfoCorporationTab from './PublicInfoCorporationTab';
import type { PublicCorporationInfo } from './publicInfoData';

const loadStationName = vi.fn();
vi.mock('./stations', () => ({
  loadStationName: (id: number) => loadStationName(id),
}));
vi.mock('@/lib/zkillboard', () => ({
  fetchCorporationStats: vi.fn(async () => null),
  corporationZkillUrl: () => '',
}));
vi.mock('./publicInfoData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publicInfoData')>()),
  loadPublicAllianceHistory: vi.fn(async () => null),
}));

const HOME_STATION = 60003760;

const CORP = {
  corporation_id: 98000001,
  name: 'Test Corp',
  ticker: 'TEST',
  member_count: 5,
  tax_rate: 0.1,
  ceo_id: 1,
  creator_id: 1,
  ceoName: 'Boss',
  creatorName: 'Boss',
  date_founded: '2020-01-01T00:00:00Z',
  home_station_id: HOME_STATION,
} as unknown as PublicCorporationInfo;

function renderTab() {
  return render(
    <MemoryRouter>
      <PublicInfoCorporationTab data={CORP} allianceId={null} />
    </MemoryRouter>
  );
}

describe('PublicInfoCorporationTab home station', () => {
  it('links the resolved home station to its Place Info', async () => {
    loadStationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    renderTab();
    expect(
      await screen.findByRole('link', { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' })
    ).toHaveAttribute('href', expect.stringContaining(`info=place-${HOME_STATION}`));
  });

  it('keeps the #id fallback plain while the name is unresolved', async () => {
    loadStationName.mockResolvedValue(null);
    renderTab();
    expect(await screen.findByText(`#${HOME_STATION}`)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: `#${HOME_STATION}` })).toBeNull();
  });
});
