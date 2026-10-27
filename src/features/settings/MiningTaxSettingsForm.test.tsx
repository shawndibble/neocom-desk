import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useAutoContinueSessions } from '@/features/miningTax/continueSessionPref';
import { useMiningTaxOreValueMode } from '@/features/miningTax/oreValueMode';
import {
  MINING_TAX_COMPRESSED_ORE_KEY,
  useMiningTaxCompressedOre,
} from '@/features/miningTax/oreForm';
import { MiningTaxSettingsForm } from './MiningTaxSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useAutoContinueSessions.setState({ value: false, hydrated: false });
  useMiningTaxOreValueMode.setState({ value: false, hydrated: false });
  useMiningTaxCompressedOre.setState({ value: true, hydrated: false });
});

describe('MiningTaxSettingsForm', () => {
  it('shows the compressed-ore checkbox on by default and saves it when cleared', async () => {
    const user = userEvent.setup();
    render(<MiningTaxSettingsForm />);

    const box = await screen.findByRole('checkbox', { name: 'Value and show ore as compressed' });
    expect(box).toBeChecked();
    await user.click(box);

    expect((await db.settings.get(MINING_TAX_COMPRESSED_ORE_KEY))?.value).toBe(false);
  });

  it('opens on the stored values of both settings', async () => {
    await db.settings.put({ key: 'miningTaxAutoContinue', value: true });
    render(<MiningTaxSettingsForm />);

    expect(
      await screen.findByRole('checkbox', {
        name: 'Continue sessions across midnight UTC automatically',
      })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Edit ore values individually' })
    ).not.toBeChecked();
  });

  it('writes auto-continue straight to the store when the page has no handler of its own', async () => {
    const user = userEvent.setup();
    render(<MiningTaxSettingsForm />);

    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Continue sessions across midnight UTC automatically',
      })
    );

    expect(useAutoContinueSessions.getState().value).toBe(true);
  });

  it("hands auto-continue to the Tax tab's handler instead, when given one", async () => {
    const user = userEvent.setup();
    const onAutoContinueChange = vi.fn();
    render(<MiningTaxSettingsForm onAutoContinueChange={onAutoContinueChange} />);

    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Continue sessions across midnight UTC automatically',
      })
    );

    expect(onAutoContinueChange).toHaveBeenCalledWith(true);
    expect(useAutoContinueSessions.getState().value).toBe(false);
  });
});
