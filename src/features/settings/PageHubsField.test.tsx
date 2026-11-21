import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { useDefaultMarketHub, useMarketHub } from '@/features/market/hub';
import { usePageHubs } from '@/features/market/pageHubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PageHubsField } from './PageHubsField';

beforeEach(async () => {
  await db.settings.clear();
  await db.settings.bulkPut([
    { key: 'sync.marketHub', value: 'amarr' },
    { key: 'sync.pageHubs', value: { contracts: 'hek' } },
  ]);
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useHubByCharacter.setState({ value: {}, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
  await Promise.all([usePageHubs.getState().hydrate(), useMarketHub.getState().hydrate()]);
});

describe('PageHubsField', () => {
  it('lists each page with its own hub', () => {
    render(<PageHubsField />);
    expect(screen.getByRole('combobox', { name: 'Trade Hub for Contracts' })).toHaveTextContent(
      'Hek'
    );
  });

  it('adds a page from the ones without a hub, starting at the Global hub', async () => {
    await usePageHubs.getState().setValue({});
    render(<PageHubsField />);
    // One page left to add: a plain button names it, no one-item menu.
    await userEvent.click(screen.getByRole('button', { name: 'Add Contracts hub' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ contracts: 'amarr' }));
    // Every page has one now, so there is nothing left to add.
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
  });

  it('removes a page back to the Global hub, and Undo restores it', async () => {
    render(<PageHubsField />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Contracts hub' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({}));
    expect(screen.getAllByText('Contracts uses your Trade Hub again').length).toBeGreaterThan(0);
    // Focus moves off the removed row, to the Add control that replaces it.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Contracts hub' })).toHaveFocus()
    );
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(usePageHubs.getState().value).toEqual({ contracts: 'hek' }));
    // Undo closes its own toast.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
