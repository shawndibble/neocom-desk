import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { BpcSourcingSettingsForm } from './BpcSourcingSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useBpcHideAuctionsDefault.setState({ value: false, hydrated: false });
  useBpcHidePlexDefault.setState({ value: false, hydrated: false });
});

describe('BpcSourcingSettingsForm', () => {
  it('sets where BPC Sourcing starts', async () => {
    const user = userEvent.setup();
    render(<BpcSourcingSettingsForm />);

    await user.click(await screen.findByRole('checkbox', { name: 'Hide auctions' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hide PLEX contracts' }));

    expect(useBpcHideAuctionsDefault.getState().value).toBe(true);
    expect(useBpcHidePlexDefault.getState().value).toBe(true);
  });
});
