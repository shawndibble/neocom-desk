import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const infoMock = vi.hoisted(() => vi.fn());
const resolveMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postOpenWindowInformation: infoMock }));
vi.mock('./payeeEntitySearch', () => ({ resolvePayeeName: resolveMock }));

import { PayeeOpenInEveButton } from './PayeeOpenInEveButton';

const ONE = 91;

beforeEach(async () => {
  vi.clearAllMocks();
  infoMock.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  await db.payees.clear();
  await db.characters.put({ characterId: ONE, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: ONE,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-ui.open_window.v1'],
  });
  useActiveCharacter.setState({ activeCharacterId: ONE, hydrated: true });
});

describe('PayeeOpenInEveButton', () => {
  it('opens a verified Payee by its stored id without a lookup', async () => {
    render(<PayeeOpenInEveButton name="Moon Corp" entityId={98_000_001} />);
    await userEvent.click(screen.getByRole('button', { name: /Open in EVE/ }));
    await waitFor(() => expect(infoMock).toHaveBeenCalledWith(ONE, 98_000_001));
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('looks an unverified Payee up by name, opens it and remembers what it is', async () => {
    await db.payees.put({
      id: 'p1',
      characterId: ONE,
      name: 'Moon Corp',
      defaultTaxPct: 10,
      updatedAt: 1,
    });
    resolveMock.mockResolvedValue([{ id: 98_000_002, name: 'Moon Corp', kind: 'corporation' }]);

    render(<PayeeOpenInEveButton name="Moon Corp" payeeId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /Open in EVE/ }));

    await waitFor(() => expect(infoMock).toHaveBeenCalledWith(ONE, 98_000_002));
    await waitFor(async () =>
      expect(await db.payees.get('p1')).toMatchObject({
        entityId: 98_000_002,
        entityKind: 'corporation',
      })
    );
  });

  it('says so, and sends nothing, when the name matches nothing or several', async () => {
    resolveMock.mockResolvedValue([]);
    render(<PayeeOpenInEveButton name="Moon 1 Planet 2" />);
    await userEvent.click(screen.getByRole('button', { name: /Open in EVE/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing to open');
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the name matches several', async () => {
    resolveMock.mockResolvedValue([
      { id: 1, name: 'Twin', kind: 'corporation' },
      { id: 2, name: 'Twin', kind: 'character' },
    ]);
    render(<PayeeOpenInEveButton name="Twin" />);
    await userEvent.click(screen.getByRole('button', { name: /Open in EVE/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing to open');
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('reports a failed lookup as a failure, not as "no match"', async () => {
    resolveMock.mockRejectedValue(new Error('ESI down'));
    render(<PayeeOpenInEveButton name="Moon Corp" />);
    await userEvent.click(screen.getByRole('button', { name: /Open in EVE/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open it in EVE");
    expect(infoMock).not.toHaveBeenCalled();
  });
});
