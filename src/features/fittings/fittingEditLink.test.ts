import { describe, expect, it, vi } from 'vitest';
import type { Fitting } from '@/engine/fittings/types';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingEditLocationFor } from './fittingEditLink';

vi.mock('@/engine/fittings/shareMapper', () => ({ fittingToShareInput: vi.fn(() => ({})) }));
vi.mock('@/engine/fittings/fittingShare', () => ({ encodeFittingShare: vi.fn() }));

const fitting = {} as Fitting;

describe('fittingEditLocationFor', () => {
  it("opens the editor with the Fitting's share code", async () => {
    vi.mocked(encodeFittingShare).mockResolvedValue({ ok: true, payload: 'CODE' } as never);
    expect(await fittingEditLocationFor(fitting)).toEqual({
      pathname: '/ships/fittings/edit',
      search: '?f=CODE',
    });
  });

  it('is null when the Fitting is too large to share', async () => {
    vi.mocked(encodeFittingShare).mockResolvedValue({ ok: false, reason: 'too-large' } as never);
    expect(await fittingEditLocationFor(fitting)).toBeNull();
  });

  it('is null when the encode fails', async () => {
    vi.mocked(encodeFittingShare).mockRejectedValue(new Error('no CompressionStream'));
    expect(await fittingEditLocationFor(fitting)).toBeNull();
  });
});
