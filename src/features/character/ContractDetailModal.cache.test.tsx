/**
 * Reopening one contract must not re-hit ESI: the location name and the item
 * lines are both game constants once a contract is issued, and both loaders
 * already claim a 24h Dexie window.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { ContractDetailModal } from './ContractDetailModal';
import type { Contract } from '@/esi/endpoints';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '34': { name: 'Tritanium' } })),
}));

const CHAR_ID = 91;
const STATION_ID = 60003760;
const STRUCTURE_ID = 1_030_049_082_711;

function contractAt(locationId: number): Contract {
  return {
    contract_id: 12345,
    issuer_id: 500001,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: '2026-08-25T23:05:00Z',
    date_expired: '2026-09-01T23:05:00Z',
    price: 1,
    start_location_id: locationId,
  };
}

const calls = { station: 0, structure: 0, items: 0 };

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  calls.station = 0;
  calls.structure = 0;
  calls.items = 0;
  server.use(
    http.get(`${ESI_BASE_URL}/universe/stations/${STATION_ID}`, () => {
      calls.station += 1;
      return HttpResponse.json({
        station_id: STATION_ID,
        name: 'Jita IV - Moon 4',
        system_id: 30000142,
        type_id: 52678,
      });
    }),
    http.get(`${ESI_BASE_URL}/universe/structures/${STRUCTURE_ID}`, () => {
      calls.structure += 1;
      return HttpResponse.json({ name: 'Some Citadel', solar_system_id: 30000142, type_id: 35832 });
    }),
    http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () => {
      calls.items += 1;
      return HttpResponse.json([
        { record_id: 1, type_id: 34, quantity: 100, is_included: true, is_singleton: false },
      ]);
    })
  );
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

/**
 * Waits for BOTH loaders to settle before unmounting: the item lines land
 * first once they are cached, and closing on that alone would leave the
 * location chain still in flight and the request counts short.
 */
async function openAndClose(contract: Contract, locationText: string) {
  const view = render(
    <MemoryRouter>
      <ContractDetailModal
        characterId={CHAR_ID}
        contract={contract}
        issuerName="Someone"
        onClose={() => {}}
      />
    </MemoryRouter>
  );
  await screen.findByText('Tritanium');
  await screen.findByText(locationText);
  view.unmount();
}

describe('reopening a contract', () => {
  it('does not refetch an NPC station location or the item lines', async () => {
    await openAndClose(contractAt(STATION_ID), 'Jita IV - Moon 4');
    expect(calls).toEqual({ station: 1, structure: 0, items: 1 });

    await openAndClose(contractAt(STATION_ID), 'Jita IV - Moon 4');
    expect(calls).toEqual({ station: 1, structure: 0, items: 1 });
  });

  it('does not refetch a player-structure location', async () => {
    // Station first, structure as the fallback: `contractLocationName.ts`.
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/${STRUCTURE_ID}`, () => {
        calls.station += 1;
        return new HttpResponse(null, { status: 404 });
      })
    );

    await openAndClose(contractAt(STRUCTURE_ID), 'Some Citadel');
    expect(calls).toEqual({ station: 1, structure: 1, items: 1 });

    // The station probe is the one nothing used to cache: it 404s by design
    // for a structure id, so every reopen used to re-learn that.
    await openAndClose(contractAt(STRUCTURE_ID), 'Some Citadel');
    expect(calls).toEqual({ station: 1, structure: 1, items: 1 });
  });

  it('retries a location it could not resolve, rather than caching "unknown"', async () => {
    // Neither endpoint answers — offline, or a structure off this character's
    // ACL. `null` means "don't know", so the next open must try again.
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/${STRUCTURE_ID}`, () => {
        calls.station += 1;
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(`${ESI_BASE_URL}/universe/structures/${STRUCTURE_ID}`, () => {
        calls.structure += 1;
        return new HttpResponse(null, { status: 403 });
      })
    );

    const unresolved = `#${STRUCTURE_ID}`;
    await openAndClose(contractAt(STRUCTURE_ID), unresolved);
    expect(calls.structure).toBe(1);

    await openAndClose(contractAt(STRUCTURE_ID), unresolved);
    expect(calls.structure).toBe(2);
  });
});
