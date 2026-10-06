import { beforeEach, vi, describe, expect, it } from 'vitest';
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
    await user.type(await screen.findByRole('textbox', { name: /Your LP value/ }), '1500{Enter}');
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

  it('writes once, on blur, not per keystroke', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(useLpValue.getState(), 'setValue');
    render(<LpValueSettingsForm />);
    const input = await screen.findByRole('textbox', { name: /Your LP value/ });
    await user.type(input, '1500');
    expect(spy).not.toHaveBeenCalled();
    await user.tab();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(useLpValue.getState().value).toBe(1500);
  });

  it('keeps typed text intact ("0.5") and commits on Enter', async () => {
    const user = userEvent.setup();
    render(<LpValueSettingsForm />);
    const input = await screen.findByRole('textbox', { name: /Your LP value/ });
    await user.type(input, '0.5');
    expect(input).toHaveValue('0.5');
    await user.type(input, '{Enter}');
    expect(useLpValue.getState().value).toBe(0.5);
  });

  it('typing 0 then blur leaves market rate; blank also means 0', async () => {
    const user = userEvent.setup();
    useLpValue.setState({ value: 900, hydrated: true });
    render(<LpValueSettingsForm />);
    const input = await screen.findByRole('textbox', { name: /Your LP value/ });
    await user.clear(input);
    await user.type(input, '0');
    expect(input).toHaveValue('0');
    await user.tab();
    expect(useLpValue.getState().value).toBe(0);
  });

  it('Escape and invalid text revert to the stored rate', async () => {
    const user = userEvent.setup();
    useLpValue.setState({ value: 900, hydrated: true });
    render(<LpValueSettingsForm />);
    let input = await screen.findByRole('textbox', { name: /Your LP value/ });
    await user.type(input, '7{Escape}');
    input = screen.getByRole('textbox', { name: /Your LP value/ });
    expect(input).toHaveValue('900');
    await user.type(input, 'x');
    await user.tab();
    expect(screen.getByRole('textbox', { name: /Your LP value/ })).toHaveValue('900');
    expect(useLpValue.getState().value).toBe(900);
  });
});
