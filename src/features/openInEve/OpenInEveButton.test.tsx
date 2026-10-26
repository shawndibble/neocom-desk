import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const info = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({
  postOpenWindowInformation: info,
  postOpenWindowMarketDetails: vi.fn(),
  postOpenWindowContract: vi.fn(),
}));

import { OpenInEveButton } from './OpenInEveButton';

const ONE = 91;

beforeEach(async () => {
  vi.clearAllMocks();
  info.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  await db.characters.put({ characterId: ONE, name: 'Pilot', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: ONE,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-ui.open_window.v1'],
  });
  useActiveCharacter.setState({ activeCharacterId: ONE, hydrated: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('OpenInEveButton', () => {
  it('is aria-disabled (not native disabled) with a visible reason while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={1} />
      </MemoryRouter>
    );
    const button = await screen.findByRole('button', { name: 'Open in EVE' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription('Needs a connection');
    await userEvent.click(button);
    expect(info).not.toHaveBeenCalled();
  });

  it('renders nothing when the character lacks the permission', async () => {
    await db.tokens.update(ONE, { scopes: [] });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={1} />
      </MemoryRouter>
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Open in EVE' })).not.toBeInTheDocument()
    );
  });

  it('stays, disabled with a Switch link, when another character has the permission', async () => {
    await db.tokens.update(ONE, { scopes: [] });
    await db.characters.put({ characterId: 92, name: 'Alt Pilot', ownerHash: 'o2', addedAt: 2 });
    await db.tokens.put({
      characterId: 92,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-ui.open_window.v1'],
    });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={1} />
      </MemoryRouter>
    );
    // The button renders before the stored grants load, enabled until they say otherwise:
    // wait for the disabled state, not just the button (it flaked on a busy CI runner).
    const button = await screen.findByRole('button', { name: 'Open in EVE' });
    await vi.waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveAccessibleDescription(/Pilot hasn't granted Open in EVE\./);
    await userEvent.click(button);
    expect(info).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Alt Pilot' }));
    await vi.waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(92));
  });

  it('renders nothing without a character', () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={1} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says it is offline on a network failure', async () => {
    info.mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={1} />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open in EVE' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline");
  });
});

describe('OpenInEveButton from a fixed Character', () => {
  const PAYER = 92;

  beforeEach(async () => {
    await db.characters.put({ characterId: PAYER, name: 'Payer', ownerHash: 'oh2', addedAt: 2 });
    await db.tokens.put({
      characterId: PAYER,
      accessToken: 'a2',
      refreshToken: 'r2',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-ui.open_window.v1'],
    });
  });

  it('sends from that Character, not the active one, under its own label', async () => {
    render(
      <MemoryRouter>
        <OpenInEveButton
          kind="information"
          id={7}
          characterId={PAYER}
          label="Open in EVE as Payer"
        />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open in EVE as Payer' }));
    expect(info).toHaveBeenCalledWith(PAYER, 7);
  });

  it('stays blocked with a grant link when that Character lacks the permission — no switching', async () => {
    await db.tokens.update(PAYER, { scopes: [] });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={7} characterId={PAYER} />
      </MemoryRouter>
    );
    const button = await screen.findByRole('button', { name: 'Open in EVE' });
    // Enabled until the stored grants load, as above.
    await vi.waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(await screen.findByText(/Payer hasn't granted Open in EVE/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(info).not.toHaveBeenCalled();
  });

  it('renders nothing until some Character holds the permission', async () => {
    await db.tokens.update(PAYER, { scopes: [] });
    await db.tokens.update(ONE, { scopes: [] });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={7} characterId={PAYER} />
      </MemoryRouter>
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: 'Open in EVE' })).not.toBeInTheDocument();
    // The same render shows it, still blocked for the payer, once another Character grants it.
    await db.tokens.update(ONE, { scopes: ['esi-ui.open_window.v1'] });
    expect(await screen.findByRole('button', { name: 'Open in EVE' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it("the payer's grant link switches to the payer before opening Permissions", async () => {
    await db.tokens.update(PAYER, { scopes: [] });
    render(
      <MemoryRouter>
        <OpenInEveButton kind="information" id={7} characterId={PAYER} />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('link', { name: /Grant/ }));
    await vi.waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(PAYER));
  });
});
