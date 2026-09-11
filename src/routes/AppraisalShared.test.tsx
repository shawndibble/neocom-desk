import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { clearMarketPriceCache } from '@/market/prices';
import { encodeAppraisalShare } from '@/engine/market/appraisalShare';
import { AppraisalShared } from './AppraisalShared';

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: vi.fn(async () => [{ typeId: 34, name: 'Tritanium', marketGroupId: 18 }]),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
});
afterAll(() => server.close());

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/share/appraisal" element={<AppraisalShared />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AppraisalShared', () => {
  it('shows an invalid-link message when the link has no payload', async () => {
    renderAt('/share/appraisal');
    expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
  });

  it('shows an invalid-link message when the payload does not decode', async () => {
    renderAt('/share/appraisal?d=garbage');
    expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
  });

  it('re-prices a valid payload and renders the read-only table with the disclaimer banner', async () => {
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () =>
        HttpResponse.json({
          34: {
            buy: { min: '5.0', max: '5.41', volume: '100', orderCount: '4' },
            sell: { min: '5.62', max: '6.0', volume: '200', orderCount: '9' },
          },
        })
      )
    );
    const encoded = encodeAppraisalShare({
      hub: 'jita',
      pricePercent: 100,
      generatedAt: 1,
      items: [{ typeId: 34, quantity: 10 }],
    });
    if (!encoded.ok) throw new Error('encode failed');

    renderAt(`/share/appraisal?d=${encodeURIComponent(encoded.payload)}`);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(
      screen.getByText('Unverified, user-generated link — not an official quote.')
    ).toBeInTheDocument();
  });
});
