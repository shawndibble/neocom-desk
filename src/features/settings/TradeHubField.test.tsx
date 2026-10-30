import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter } from '@/test/seed';
import { useHubByCharacter, type HubId } from '@/features/market/characterHubs';
import { useDefaultMarketHub } from '@/features/market/hub';
import { TradeHubField } from './TradeHubField';

async function setup(map: Record<number, HubId>, ids: number[]) {
  await db.settings.clear();
  await db.characters.clear();
  for (const id of ids) await seedCharacter(id, `Pilot ${id}`);
  useDefaultMarketHub.setState({ value: 'jita', hydrated: true });
  useHubByCharacter.setState({ value: map, hydrated: true });
  render(<TradeHubField />);
}

describe('TradeHubField', () => {
  it('shows only a plain Trade Hub select for one character', async () => {
    await setup({}, [1]);
    expect(await screen.findByRole('combobox', { name: 'Trade Hub' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set per character' })).toBeNull();
  });

  it('summarises the hubs and keeps the per-character rows closed', async () => {
    await setup({ 2: 'hek', 3: 'hek' }, [1, 2, 3]);
    expect(await screen.findByText(/1 on Jita, 2 on Hek|2 on Hek, 1 on Jita/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set per character' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('combobox', { name: 'Trade Hub for Pilot 1' })).toBeNull();
  });

  it('opens the rows in place and applies the default to all', async () => {
    const user = userEvent.setup();
    await setup({ 2: 'hek' }, [1, 2]);
    await user.click(await screen.findByRole('button', { name: 'Set per character' }));
    expect(
      await screen.findByRole('combobox', { name: 'Trade Hub for Pilot 2' })
    ).toHaveTextContent(/Hek/);
    await user.click(screen.getByRole('button', { name: 'Apply default to all' }));
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'jita', 2: 'jita' });
  });
});
