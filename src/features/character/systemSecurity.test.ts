import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadSystemName, loadSystemNameAndSecurity, loadSystemSecurity } from './systemSecurity';

// The bundled solar-system table: by default it cannot be read, so the ESI
// path is what the cases below exercise; the local-table cases set it.
const lookupSolarSystem = vi.hoisted(() => vi.fn());
vi.mock('@/sde/solarSystems', () => ({ lookupSolarSystem }));

const server = mswServer();

beforeEach(async () => {
  lookupSolarSystem.mockReset();
  lookupSolarSystem.mockResolvedValue(undefined);
  await db.esiCache.clear();
});

describe('loadSystemSecurity', () => {
  it('fetches and caches the security status under the global sentinel', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/systems/30000142`, () =>
        HttpResponse.json({
          system_id: 30000142,
          name: 'Jita',
          security_status: 0.9459,
        })
      )
    );

    const security = await loadSystemSecurity(30000142);

    expect(security).toBeCloseTo(0.9459);
    expect((await db.esiCache.get([0, 'system:30000142']))?.value).toMatchObject({
      security_status: expect.closeTo(0.9459),
    });
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/systems/30000001`, () => HttpResponse.error()));

    const security = await loadSystemSecurity(30000001);

    expect(security).toBeNull();
  });
});

describe('the bundled solar-system table', () => {
  const JITA = { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 };

  it('answers name and security with no ESI request (the shared server errors on any)', async () => {
    lookupSolarSystem.mockResolvedValue(JITA);

    expect(await loadSystemSecurity(30000142)).toBeCloseTo(0.9459);
    expect(await loadSystemName(30000142)).toBe('Jita');
    expect(await loadSystemNameAndSecurity(30000142)).toEqual({ name: 'Jita', security: 0.9459 });
  });

  it('falls back to ESI for an id the table does not hold', async () => {
    lookupSolarSystem.mockResolvedValue(null);
    server.use(
      http.get(`${ESI_BASE_URL}/universe/systems/31000007`, () =>
        HttpResponse.json({ system_id: 31000007, name: 'J105443', security_status: -0.99 })
      )
    );

    expect(await loadSystemNameAndSecurity(31000007)).toEqual({
      name: 'J105443',
      security: -0.99,
    });
  });
});
