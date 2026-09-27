import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CharacterFilterControl } from './CharacterFilterControl';

async function openMenu() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button');
  await user.click(trigger);
  return user;
}

describe('CharacterFilterControl', () => {
  it('labels the trigger "This character" for the literal \'current\'', () => {
    render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('labels the trigger "All characters" when the value is \'all\'', () => {
    render(<CharacterFilterControl activeCharacterId={1} value="all" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'All characters' })).toBeInTheDocument();
  });

  it('reads "All characters" for \'current\' with no active Character, since it resolves that way', () => {
    render(<CharacterFilterControl activeCharacterId={null} value="current" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'All characters' })).toBeInTheDocument();
  });

  it('lists both options, the current one checked', async () => {
    render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
    await openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'This character' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('menuitemradio', { name: 'All characters' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('picking "All Characters" calls onChange with \'all\'', async () => {
    const onChange = vi.fn();
    render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={onChange} />);
    const user = await openMenu();
    await user.click(screen.getByRole('menuitemradio', { name: 'All characters' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('picking "This Character" sets the value to the literal \'current\', not a frozen id', async () => {
    const onChange = vi.fn();
    render(<CharacterFilterControl activeCharacterId={2} value="all" onChange={onChange} />);
    const user = await openMenu();
    await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));
    expect(onChange).toHaveBeenCalledWith('current');
  });

  it('omits the "This character" option with no active character', async () => {
    render(<CharacterFilterControl activeCharacterId={null} value="all" onChange={() => {}} />);
    await openMenu();
    expect(screen.queryByRole('menuitemradio', { name: 'This character' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'All characters' })).toBeInTheDocument();
  });
});
