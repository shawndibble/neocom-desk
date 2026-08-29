import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { rejectBadEsiHeaders } from '@/esi/test-helpers';
import { fetchSystemCostIndices } from './cost-index';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchSystemCostIndices', () => {
  it('sends the mandatory ESI headers and maps solar_system_id to the manufacturing index', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/industry/systems`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        return HttpResponse.json([
          {
            solar_system_id: 30000142,
            cost_indices: [
              { activity: 'manufacturing', cost_index: 0.0464 },
              { activity: 'invention', cost_index: 0.0202 },
            ],
          },
          {
            solar_system_id: 30002187,
            cost_indices: [{ activity: 'manufacturing', cost_index: 0.0021 }],
          },
        ]);
      })
    );

    const result = await fetchSystemCostIndices();

    expect(result.get(30000142)).toBe(0.0464);
    expect(result.get(30002187)).toBe(0.0021);
    expect(result.size).toBe(2);
  });

  it('omits a system with no manufacturing entry', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/industry/systems`, () =>
        HttpResponse.json([
          {
            solar_system_id: 30000142,
            cost_indices: [{ activity: 'invention', cost_index: 0.02 }],
          },
        ])
      )
    );

    const result = await fetchSystemCostIndices();

    expect(result.has(30000142)).toBe(false);
  });
});
