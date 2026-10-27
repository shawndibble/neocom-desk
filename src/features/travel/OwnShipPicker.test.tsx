import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '24702': { name: 'Hurricane', groupID: 419 },
    '33153': { name: 'Hurricane Fleet Issue', groupID: 419 },
    '587': { name: 'Rifter', groupID: 25 },
  }),
  loadGroupCategories: async () => ({ '419': 6, '25': 6 }),
}));

import { OwnShipPicker } from './OwnShipPicker';

afterEach(cleanup);

/** Opens the field the way a pilot does: by pressing the ship's name. */
async function openField(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Your ship:/ }));
  return screen.getByRole('combobox', { name: 'Your ship' });
}

describe('OwnShipPicker', () => {
  it('reads as text first: the name, or "Not set" with what that means', async () => {
    render(<OwnShipPicker typeId={null} autoTypeId={null} onChange={vi.fn()} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Your ship: Not set, change' })).toBeVisible();
    expect(screen.getByText(/cruiser-size and larger/)).toBeVisible();
  });

  it('opens into a field on click, shows suggestions, and picks one with arrows and Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OwnShipPicker typeId={null} autoTypeId={null} onChange={onChange} />);
    const input = await openField(user);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('placeholder', 'Type your ship, e.g. Hurricane');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.type(input, 'hurr');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Hurricane', 'Hurricane Fleet Issue']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(33153);
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    // Focus returns to the name, so a keyboard pilot keeps their place.
    expect(screen.getByRole('button', { name: /^Your ship:/ })).toHaveFocus();
  });

  it('picks a suggestion with a click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OwnShipPicker typeId={null} autoTypeId={null} onChange={onChange} />);
    await user.type(await openField(user), 'rif');
    await user.click(await screen.findByRole('option', { name: 'Rifter' }));
    expect(onChange).toHaveBeenCalledWith(587);
  });

  it('closes on Escape without picking, back to the text', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OwnShipPicker typeId={null} autoTypeId={null} onChange={onChange} />);
    await user.type(await openField(user), 'hurr');
    await screen.findAllByRole('option');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Your ship:/ })).toHaveFocus();
  });

  it('shows the manual pick as text and Clear removes it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OwnShipPicker typeId={587} autoTypeId={null} onChange={onChange} />);
    expect(await screen.findByRole('button', { name: 'Your ship: Rifter, change' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers "Use my current ship" over a manual pick when the character has one', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OwnShipPicker typeId={587} autoTypeId={24702} onChange={onChange} />);
    await user.click(await screen.findByRole('button', { name: 'Use my current ship' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('shows the character ship, and says it comes from the character, when nothing is picked by hand', async () => {
    render(<OwnShipPicker typeId={null} autoTypeId={24702} onChange={vi.fn()} />);
    expect(
      await screen.findByRole('button', { name: 'Your ship: Hurricane, change' })
    ).toBeVisible();
    expect(screen.getByText('from your character')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});
