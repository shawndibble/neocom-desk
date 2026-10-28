import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { RowActionsMenu } from '@/components/ui';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const infoMock = vi.hoisted(() => vi.fn());
const marketMock = vi.hoisted(() => vi.fn());
const contractMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({
  postOpenWindowInformation: infoMock,
  postOpenWindowMarketDetails: marketMock,
  postOpenWindowContract: contractMock,
}));

import { OpenInEveMenuItem } from './OpenInEveMenuItem';
import { OUTCOME_VISIBLE_MS } from './useOpenInEve';

const ONE = 91;
const SCOPE = 'esi-ui.open_window.v1';

async function seed(scopes: string[]) {
  await db.characters.put({ characterId: ONE, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: ONE,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function openMenu(
  kind: 'information' | 'marketDetails' | 'contract',
  id: number,
  specific = false
) {
  render(
    <MemoryRouter>
      <RowActionsMenu
        name="row"
        items={<OpenInEveMenuItem kind={kind} id={id} specific={specific} />}
      >
        <div>row</div>
      </RowActionsMenu>
      <Where />
    </MemoryRouter>
  );
  fireEvent.contextMenu(screen.getByText('row'));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

beforeEach(async () => {
  vi.clearAllMocks();
  infoMock.mockResolvedValue({ data: null });
  marketMock.mockResolvedValue({ data: null });
  contractMock.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: ONE, hydrated: true });
});

describe('OpenInEveMenuItem', () => {
  it('opens the information window for the target and says so in the open menu', async () => {
    await seed([SCOPE]);
    openMenu('information', 587);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open in EVE' }));
    await waitFor(() => expect(infoMock).toHaveBeenCalledWith(ONE, 587));
    expect(await screen.findByRole('status')).toHaveTextContent('Opened in your EVE client.');
  });

  it('clears the result by itself after 10 seconds', async () => {
    await seed([SCOPE]);
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    try {
      openMenu('information', 587);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Open in EVE' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Opened in your EVE client.');
      const call = timeout.mock.calls.find(([, ms]) => ms === OUTCOME_VISIBLE_MS);
      expect(OUTCOME_VISIBLE_MS).toBe(10_000);
      expect(call).toBeDefined();
      act(() => (call![0] as () => void)());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      timeout.mockRestore();
    }
  });

  it.each([
    ['marketDetails', marketMock],
    ['contract', contractMock],
  ] as const)('%s reads "Open in EVE" and calls its own endpoint', async (kind, mock) => {
    await seed([SCOPE]);
    openMenu(kind, 42);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open in EVE' }));
    await waitFor(() => expect(mock).toHaveBeenCalledWith(ONE, 42));
  });

  it.each([
    ['marketDetails', 'Open market in EVE'],
    ['contract', 'Open contract in EVE'],
  ] as const)('%s shows its long form when specific', async (kind, label) => {
    await seed([SCOPE]);
    openMenu(kind, 42, true);
    expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
  });

  it('keeps two distinguishable labels when a menu carries a market window and a place window', async () => {
    await seed([SCOPE]);
    render(
      <MemoryRouter>
        <RowActionsMenu
          name="row"
          items={
            <>
              <OpenInEveMenuItem kind="marketDetails" id={34} specific />
              <OpenInEveMenuItem kind="information" id={60003760} />
            </>
          }
        >
          <div>row</div>
        </RowActionsMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByText('row'));
    expect(await screen.findByRole('menuitem', { name: 'Open market in EVE' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Open in EVE' })).toBeInTheDocument();
  });

  it('shows ESI’s refusal in the menu rather than failing silently', async () => {
    await seed([SCOPE]);
    infoMock.mockRejectedValue(new Error('boom'));
    openMenu('information', 1);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open in EVE' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open it in EVE");
  });

  it('says it is offline in the menu, not that the character is logged out of the game', async () => {
    await seed([SCOPE]);
    infoMock.mockRejectedValue(new TypeError('Failed to fetch'));
    openMenu('information', 1);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open in EVE' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You're offline");
    expect(alert).not.toHaveTextContent('logged in to the game');
  });

  it('still shows the result when the connection drops mid-send', async () => {
    await seed([SCOPE]);
    let fail!: (err: unknown) => void;
    infoMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      })
    );
    openMenu('information', 1);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open in EVE' }));
    expect(await screen.findByText('Opening in EVE…')).toBeInTheDocument();

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Opening in EVE…')).toBeInTheDocument();
    await act(async () => fail(new TypeError('Failed to fetch')));

    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline");
  });

  it('is inert while offline and sends nothing', async () => {
    await seed([SCOPE]);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    openMenu('information', 1);
    const item = await screen.findByRole('menuitem', { name: /Open in EVE/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(item);
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('is inert with the reason when the character lacks the permission', async () => {
    await seed(['esi-skills.read_skills.v1']);
    openMenu('information', 1);
    const item = await screen.findByRole('menuitem', { name: /Open in EVE/ });
    await userEvent.click(item);
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('offers Switch to a character that has the permission', async () => {
    await seed(['esi-skills.read_skills.v1']);
    await db.characters.put({ characterId: 92, name: 'Alt Pilot', ownerHash: 'o2', addedAt: 2 });
    await db.tokens.put({
      characterId: 92,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      scopes: [SCOPE],
    });
    openMenu('information', 1);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Switch to Alt Pilot' }));
    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(92));
  });

  it('lists Grant missing Permissions, which opens Settings with the Permission flagged', async () => {
    await seed(['esi-skills.read_skills.v1']);
    openMenu('information', 1);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Grant missing Permissions' })
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/permissions?grant=openWindow');
  });
});
