import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { AppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import { loadShare } from '@/features/share/shareStore';
import { SharedLink } from './SharedLink';

vi.mock('@/features/share/shareStore', () => ({ loadShare: vi.fn() }));

const SNAPSHOT: AppraisalSnapshot = {
  v: 1,
  hub: 'amarr',
  pricePercent: 90,
  generatedAt: 1_790_000_000,
  items: [
    {
      typeId: 34,
      name: 'Tritanium',
      quantity: 1_000_000_000,
      buy: 5,
      sell: 6,
      unitVolume: 0.01,
    },
  ],
};

/** Where a redirect landed. */
function Landed() {
  const location = useLocation();
  return <p data-testid="landed">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/share/:shareId" element={<SharedLink />} />
        <Route path="*" element={<Landed />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.characters.clear();
});

afterEach(() => {
  vi.mocked(loadShare).mockReset();
});

describe('SharedLink', () => {
  it('shows a Shared Appraisal at the prices it was shared with, and when it expires', async () => {
    const expiresAt = Date.UTC(2026, 9, 9, 14, 2);
    vi.mocked(loadShare).mockResolvedValue({
      ok: true,
      share: { type: 'appraisal', payload: SNAPSHOT, expiresAt },
    });
    renderAt('/share/abc123XYZ');

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(loadShare).toHaveBeenCalledWith('abc123XYZ');
    expect(screen.getByText('Amarr')).toBeInTheDocument();
    // 1e9 × 6 × 90%: the full figure, its shorthand right after.
    expect(screen.getByText('5,400,000,000 ISK (5.4B)')).toBeInTheDocument();
    expect(screen.getByText('4,500,000,000 ISK (4.5B)')).toBeInTheDocument();
    expect(screen.queryByText(/Unverified/)).not.toBeInTheDocument();
    expect(screen.getByText(new Date(expiresAt).toLocaleString())).toBeInTheDocument();
  });

  it('never redirects a signed-in visitor away from a Shared Appraisal', async () => {
    await db.characters.put({ characterId: 1, name: 'Pilot' } as never);
    vi.mocked(loadShare).mockResolvedValue({
      ok: true,
      share: { type: 'appraisal', payload: SNAPSHOT, expiresAt: Date.now() + 1000 },
    });
    renderAt('/share/abc123XYZ');

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByTestId('landed')).not.toBeInTheDocument();
  });

  it('opens the live Appraisal tab at the share’s hub and percent, re-reading it by id', async () => {
    await db.characters.put({ characterId: 1, name: 'Pilot' } as never);
    vi.mocked(loadShare).mockResolvedValue({
      ok: true,
      share: { type: 'appraisal', payload: SNAPSHOT, expiresAt: Date.now() + 1000 },
    });
    renderAt('/share/abc123XYZ');

    await screen.findByText('Tritanium');
    expect(await screen.findByRole('link', { name: 'Open Neocom Desk' })).toHaveAttribute(
      'href',
      '/market/appraisal?hub=amarr&percent=90&share=abc123XYZ'
    );
  });

  it('offers a visitor with no Character a login here, and a way to choose permissions first', async () => {
    vi.mocked(loadShare).mockResolvedValue({
      ok: true,
      share: { type: 'appraisal', payload: SNAPSHOT, expiresAt: Date.now() + 1000 },
    });
    renderAt('/share/abc123XYZ');

    await screen.findByText('Tritanium');
    expect(await screen.findByRole('button', { name: 'Log in with EVE Online' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose permissions' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open Neocom Desk' })).toBeNull();
  });

  it('says an expired or unknown link has expired', async () => {
    vi.mocked(loadShare).mockResolvedValue({ ok: false, reason: 'not-found' });
    renderAt('/share/abc123XYZ');
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
  });

  it('reads a malformed stored appraisal as an invalid link, not a crash', async () => {
    vi.mocked(loadShare).mockResolvedValue({
      ok: true,
      share: { type: 'appraisal', payload: { v: 1 }, expiresAt: Date.now() + 1000 },
    });
    renderAt('/share/abc123XYZ');
    expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
  });

  describe('a Fitting', () => {
    it('sends a signed-in visitor straight to the editor on its Fitting Share Code', async () => {
      await db.characters.put({ characterId: 1, name: 'Pilot' } as never);
      vi.mocked(loadShare).mockResolvedValue({
        ok: true,
        share: { type: 'fitting', payload: { v: 1, code: '2.abc' }, expiresAt: Date.now() + 1000 },
      });
      renderAt('/share/abc123XYZ');

      expect(await screen.findByTestId('landed')).toHaveTextContent('/ships/fittings/edit?f=2.abc');
    });

    it('reads a malformed payload as an invalid link for a signed-out visitor', async () => {
      vi.mocked(loadShare).mockResolvedValue({
        ok: true,
        share: { type: 'fitting', payload: { v: 1 }, expiresAt: Date.now() + 1000 },
      });
      renderAt('/share/abc123XYZ');

      expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
      expect(screen.getByText(/This link expires/)).toBeInTheDocument();
    });
  });
});
