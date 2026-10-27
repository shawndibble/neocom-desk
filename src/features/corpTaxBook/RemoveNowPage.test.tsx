import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';

const api = vi.hoisted(() => ({
  link: vi.fn(),
  force: vi.fn(),
  login: vi.fn(),
  characters: [] as { characterId: number; addedAt: number }[],
}));
vi.mock('@/features/corp/taxBook/feederClient', () => ({
  getRemovalLink: api.link,
  forceRemoval: api.force,
}));
vi.mock('@/app/loginFlow', () => ({ beginAddCharacterLogin: api.login }));
vi.mock('@/db', () => ({ db: { characters: { toArray: () => Promise.resolve(api.characters) } } }));
vi.mock('dexie-react-hooks', async () => {
  const react = await import('react');
  return {
    useLiveQuery: (query: () => Promise<unknown>) => {
      const [value, setValue] = react.useState<unknown>(undefined);
      react.useEffect(() => {
        void query().then(setValue);
      }, []);
      return value;
    },
  };
});
vi.mock('@/features/character/useEntityName', () => ({
  useEntityName: (id: number | undefined) =>
    id === 1 ? 'Brass Meridian Logistics' : id === 2 ? 'Ostrava Salvage' : null,
}));

import { RemoveNowPage } from './RemoveNowPage';

const AT = Date.UTC(2026, 9, 18, 14, 22);
const available = {
  available: true,
  collectorCorporationId: 1,
  feederCorporationId: 2,
  effectiveAt: AT,
};

beforeEach(() => {
  api.link.mockReset();
  api.force.mockReset();
  api.login.mockReset().mockResolvedValue(undefined);
  api.characters = [{ characterId: 5, addedAt: 1 }];
});

describe('RemoveNowPage', () => {
  it('asks a signed-out visitor to log in', async () => {
    api.characters = [];
    render(<RemoveNowPage code="c" />);
    expect(await screen.findByText(/Log in with the character/)).toBeInTheDocument();
    expect(api.link).not.toHaveBeenCalled();
  });

  it('offers Remove now to the payee and ends the removal', async () => {
    api.link.mockResolvedValue(available);
    api.force.mockResolvedValue({ ended: true, effectiveAt: AT });
    render(<RemoveNowPage code="c" />);
    expect(
      await screen.findByText(/Brass Meridian Logistics started removing/)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove now' }));
    expect(
      await screen.findByText(/Ostrava Salvage is no longer a moon owner/)
    ).toBeInTheDocument();
    expect(api.force).toHaveBeenCalledWith(5, 'c');
  });

  it('tries each Character on the device and uses the one the server accepts', async () => {
    api.characters = [
      { characterId: 5, addedAt: 1 },
      { characterId: 6, addedAt: 2 },
    ];
    api.link
      .mockResolvedValueOnce({ available: false, effectiveAt: AT })
      .mockResolvedValueOnce(available);
    api.force.mockResolvedValue({ ended: true, effectiveAt: AT });
    render(<RemoveNowPage code="c" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove now' }));
    expect(api.force).toHaveBeenCalledWith(6, 'c');
  });

  // The server answers a guarded payee exactly as it answers an expired link; the page must
  // not add a difference of its own.
  it('renders an expired, a guarded and an unknown link identically', async () => {
    api.link.mockResolvedValue({ available: false, effectiveAt: AT });
    const first = render(<RemoveNowPage code="expired" />);
    await screen.findByText(/This can't be done right now/);
    const expiredHtml = first.container.innerHTML;
    first.unmount();

    api.link.mockResolvedValue({ available: false, effectiveAt: AT });
    const second = render(<RemoveNowPage code="guarded" />);
    await screen.findByText(/This can't be done right now/);
    expect(second.container.innerHTML).toBe(expiredHtml);
    second.unmount();

    // An unknown or garbled code has no removal to date: it reads the same, with no time.
    api.link.mockResolvedValue({ available: false, effectiveAt: null });
    const third = render(<RemoveNowPage code="garbled" />);
    await screen.findByText(/This can't be done right now/);
    expect(third.container.innerHTML).toBe(expiredHtml);
    expect(document.body.textContent).not.toMatch(/EVE time/);
  });

  it('shows the same neutral message when forcing is refused at the last moment', async () => {
    api.link.mockResolvedValue(available);
    api.force.mockResolvedValue({ ended: false, effectiveAt: AT });
    render(<RemoveNowPage code="c" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove now' }));
    expect(await screen.findByText("This can't be done right now.")).toBeInTheDocument();
  });

  it('never explains why, whatever the page says', async () => {
    api.link.mockResolvedValue({ available: false, effectiveAt: null });
    render(<RemoveNowPage code="c" />);
    await waitFor(() =>
      expect(screen.getByText("This can't be done right now.")).toBeInTheDocument()
    );
    expect(document.body.textContent).not.toMatch(/payee|48|hour|changed|because/i);
  });
});
