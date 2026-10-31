import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeToHref } from './routeSafetyLink';

const navigate = vi.fn();
const resolvePlaceSystemId = vi.fn();

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('./placeSystem', () => ({
  resolvePlaceSystemId: (...a: unknown[]) => resolvePlaceSystemId(...a),
}));

import { useViewRoute } from './useViewRoute';

describe('useViewRoute', () => {
  beforeEach(() => {
    navigate.mockReset();
    resolvePlaceSystemId.mockReset();
  });

  it('opens Route Safety ending at the station, not just its system', async () => {
    resolvePlaceSystemId.mockResolvedValue(30000142);
    const { result } = renderHook(() => useViewRoute(60003760, 'prefer-highsec'));
    await act(async () => {
      result.current.view();
    });
    expect(navigate).toHaveBeenCalledWith(routeToHref(30000142, null, 'prefer-highsec', 60003760));
  });
});
