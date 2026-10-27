import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { InjectorFactsPanel } from './InjectorFactsPanel';

const pricesMock = vi.hoisted(() => ({ getHubPricesWithStatus: vi.fn() }));
vi.mock('@/market/prices', () => pricesMock);

function renderPanel() {
  return render(
    <MemoryRouter>
      <InjectorFactsPanel
        scheduled={[{ sp: 500_000 }]}
        totalSp={5_000_000}
        unallocatedSp={0}
        cloneState="omega"
      />
    </MemoryRouter>
  );
}

describe('InjectorFactsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says "No sell orders" when the hub answered with none', async () => {
    pricesMock.getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: false });
    renderPanel();
    expect((await screen.findAllByText(/No sell orders at/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Prices unavailable right now')).not.toBeInTheDocument();
  });

  it('says prices are unavailable right now, not "No sell orders", when the source was unreachable', async () => {
    pricesMock.getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: true });
    renderPanel();
    expect((await screen.findAllByText('Prices unavailable right now')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No sell orders at/)).not.toBeInTheDocument();
  });
});
