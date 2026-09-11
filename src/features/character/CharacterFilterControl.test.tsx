import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CharacterFilterControl } from './CharacterFilterControl';

const CHARACTERS = [
  { characterId: 1, characterName: 'Alice' },
  { characterId: 2, characterName: 'Bob' },
  { characterId: 3, characterName: 'Carol' },
];

async function openMenu() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button');
  await user.click(trigger);
  return user;
}

describe('CharacterFilterControl', () => {
  it('labels the trigger "This character" for the literal \'current\'', () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value="current"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('also labels the trigger "This character" when a concrete subset happens to resolve to just the active character', () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value={new Set([1])}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('labels the trigger "All characters" when the value is \'all\'', () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value="all"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'All characters' })).toBeInTheDocument();
  });

  it('labels the trigger with a count for any other subset', () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value={new Set([1, 2])}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '2 characters' })).toBeInTheDocument();
  });

  it('lists every character as an option, selected per the current value', async () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value={new Set([1, 2])}
        onChange={() => {}}
      />
    );
    await openMenu();
    expect(screen.getByRole('option', { name: 'Alice' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Carol' })).toHaveAttribute('aria-selected', 'false');
  });

  it('toggling a character calls onChange with the flipped set', async () => {
    const onChange = vi.fn();
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value={new Set([1])}
        onChange={onChange}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('option', { name: 'Bob' }));
    expect(onChange).toHaveBeenCalledWith(new Set([1, 2]));
  });

  it("toggling a character while pinned to 'current' resolves it first, then flips", async () => {
    const onChange = vi.fn();
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value="current"
        onChange={onChange}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('option', { name: 'Bob' }));
    expect(onChange).toHaveBeenCalledWith(new Set([1, 2]));
  });

  it('"This Character" sets the value to the literal \'current\', not a frozen id', async () => {
    const onChange = vi.fn();
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={2}
        value="all"
        onChange={onChange}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('button', { name: 'This character' }));
    expect(onChange).toHaveBeenCalledWith('current');
    expect(screen.queryByPlaceholderText('Search characters')).not.toBeInTheDocument();
  });

  it('"All Characters" sets the value to \'all\'', async () => {
    const onChange = vi.fn();
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value={new Set([1])}
        onChange={onChange}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('button', { name: 'All characters' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('omits the "This character" quick-select with no active character', async () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={null}
        value="all"
        onChange={() => {}}
      />
    );
    await openMenu();
    expect(screen.queryByRole('button', { name: 'This character' })).not.toBeInTheDocument();
  });

  it('typing in the search box narrows the visible character options by name', async () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value="all"
        onChange={() => {}}
      />
    );
    const user = await openMenu();
    await user.type(screen.getByPlaceholderText('Search characters'), 'ali');
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bob' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Carol' })).not.toBeInTheDocument();
  });

  it('clearing the search box restores the full character list', async () => {
    render(
      <CharacterFilterControl
        characters={CHARACTERS}
        activeCharacterId={1}
        value="all"
        onChange={() => {}}
      />
    );
    const user = await openMenu();
    const search = screen.getByPlaceholderText('Search characters');
    await user.type(search, 'ali');
    await user.clear(search);
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Carol' })).toBeInTheDocument();
  });
});
