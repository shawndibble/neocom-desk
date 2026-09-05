import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { ContractDetailModal, type ContractDetailModalProps } from './ContractDetailModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import type { Contract } from '@/esi/endpoints';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({
    '34': { name: 'Tritanium' },
    '35': { name: 'Pyerite' },
  })),
}));

const CHAR_ID = 91;

const ITEM_EXCHANGE: Contract = {
  contract_id: 12345,
  issuer_id: 500001,
  issuer_corporation_id: 2,
  assignee_id: 3,
  acceptor_id: 0,
  type: 'item_exchange',
  status: 'finished_contractor',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-08-25T23:05:00Z',
  date_expired: '2026-09-01T23:05:00Z',
  date_completed: '2026-08-26T01:46:00Z',
  price: 18_205_203,
  start_location_id: 60003760,
};

const COURIER: Contract = {
  contract_id: 999,
  issuer_id: 500001,
  issuer_corporation_id: 2,
  assignee_id: 3,
  acceptor_id: 0,
  type: 'courier',
  status: 'outstanding',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-08-01T00:00:00Z',
  date_expired: '2026-08-10T00:00:00Z',
  reward: 500_000,
  collateral: 1_000_000,
  volume: 4400,
  days_to_complete: 3,
};

/** `MarketItemLink` needs a router context — same wrapper `ImplantChip.test.tsx` uses. */
function renderModal(props: ContractDetailModalProps) {
  return render(
    <MemoryRouter>
      <ContractDetailModal {...props} />
    </MemoryRouter>
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  usePublicInfoModalStore.setState({ request: null });
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('ContractDetailModal', () => {
  it('renders the summary fields immediately from the contract prop, no fetch needed', () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () => new Promise(() => {})),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.getByRole('dialog', { name: 'Item Exchange' })).toBeInTheDocument();
    expect(screen.getByText('Finished (Contractor)')).toBeInTheDocument();
    expect(screen.getByText('Mero Otichoda')).toBeInTheDocument();
    expect(screen.getByText('18,205,203.00')).toBeInTheDocument();
  });

  it('resolves the location name once the station lookup returns', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({
          station_id: 60003760,
          name: 'Tycho Brahe 18 HQ',
          type_id: 1,
          system_id: 2,
        })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByText('Tycho Brahe 18 HQ')).toBeInTheDocument();
  });

  it('splits item lines into Included and Requested tables', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({ station_id: 60003760, name: 'Jita', type_id: 1, system_id: 2 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
          { record_id: 2, type_id: 35, quantity: 1, is_included: false, is_singleton: false },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    const included = await screen.findByRole('table', { name: 'Included' });
    expect(within(included).getByText('744')).toBeInTheDocument();
    const requested = screen.getByRole('table', { name: 'Requested' });
    expect(within(requested).getByText('1')).toBeInTheDocument();
  });

  /*
   * Two short columns (icon + name, quantity) fit a 390px screen unaided, so
   * the stacked card layout would only add a "QUANTITY" gutter label to a
   * one-word value. `.dt-stack` is CSS, so the class is what there is to
   * assert — same check as `DataTable.test.tsx`'s responsive suite.
   */
  it('keeps the item tables as real tables on mobile', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({ station_id: 60003760, name: 'Jita', type_id: 1, system_id: 2 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
          { record_id: 2, type_id: 35, quantity: 1, is_included: false, is_singleton: false },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByRole('table', { name: 'Included' })).not.toHaveClass('dt-stack');
    expect(screen.getByRole('table', { name: 'Requested' })).not.toHaveClass('dt-stack');
  });

  it('never fetches items for a courier contract, and shows its own fields', () => {
    renderModal({
      characterId: CHAR_ID,
      contract: COURIER,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.getByText('500,000.00')).toBeInTheDocument();
    expect(screen.getByText('1,000,000.00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('links an item-exchange line item through to Market (issue #417)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () => new Promise(() => {})),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    const link = await screen.findByRole('link', { name: /Tritanium/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/market?'));
  });

  it('issuer name opens the shared Public Info Modal (issue #417)', () => {
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mero Otichoda' }));
    expect(usePublicInfoModalStore.getState().request).toEqual({
      kind: 'character',
      id: ITEM_EXCHANGE.issuer_id,
    });
  });
});
