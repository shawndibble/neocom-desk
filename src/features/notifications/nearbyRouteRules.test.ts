import { describe, expect, it } from 'vitest';
import { routeRulesForServer } from './nearbyRouteRules';

const reg = (serverEvents: string[]) =>
  new Map([[1, { serverEvents: serverEvents as never[], serverInputs: {} }]]);

describe('routeRulesForServer', () => {
  it('reads nothing when no Character wants a nearby push', async () => {
    expect(await routeRulesForServer(reg(['shipLost']))).toBeNull();
  });
  it('sends the Travel Settings when one does', async () => {
    expect(await routeRulesForServer(reg(['incursionNearby']))).toMatchObject({
      preference: expect.any(String),
      securityPenalty: expect.any(Number),
      avoid: expect.any(Array),
    });
  });
});
