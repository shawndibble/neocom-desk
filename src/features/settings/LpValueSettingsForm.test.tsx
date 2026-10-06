import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { DEFAULT_LP_VALUE, useLpValue } from '@/features/loyalty/lpValue';
import { LpValueSettingsForm } from './LpValueSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useLpValue.setState({ value: DEFAULT_LP_VALUE, hydrated: false });
});

describe('LpValueSettingsForm', () => {
  it('writes a typed rate to the shared LP Value store', async () => {
    const user = userEvent.setup();
    render(<LpValueSettingsForm />);
    await user.type(await screen.findByRole('textbox', { name: /Your LP value/ }), '1500');
    expect(useLpValue.getState().value).toBe(1500);
  });

  it('opens on the stored rate and resets to market rates', async () => {
    const user = userEvent.setup();
    useLpValue.setState({ value: 2000, hydrated: true });
    render(<LpValueSettingsForm />);
    expect(await screen.findByRole('textbox', { name: /Your LP value/ })).toHaveValue('2000');
    await user.click(screen.getByRole('button', { name: 'Use market rates' }));
    expect(useLpValue.getState().value).toBe(0);
    expect(screen.queryByRole('button', { name: 'Use market rates' })).not.toBeInTheDocument();
  });
});
