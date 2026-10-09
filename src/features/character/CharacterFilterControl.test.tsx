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
  it('field variant shows the value as visible text with a caret, at any width', () => {
    const { container } = render(
      <CharacterFilterControl
        variant="field"
        triggerLabel="Default characters shown"
        activeCharacterId={1}
        value="current"
        onChange={() => {}}
      />
    );
    const trigger = screen.getByRole('button', {
      name: 'Default characters shown: This character',
    });
    expect(trigger.querySelector('span')).toHaveTextContent('This character');
    expect(trigger.querySelector('span')?.className).not.toMatch(/hidden/);
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger.className).toMatch(/\bh-11\b/);
    expect(container.querySelector('img')).toBeNull();
  });

  it('field variant opens the same two-option menu', async () => {
    const onChange = vi.fn();
    render(
      <CharacterFilterControl
        variant="field"
        activeCharacterId={1}
        value="current"
        onChange={onChange}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('menuitemradio', { name: 'All characters' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('labels the trigger "This character" for the literal \'current\'', () => {
    render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('adds the Character count to the "All" label (issue #2846)', () => {
    render(
      <CharacterFilterControl
        activeCharacterId={1}
        value="all"
        onChange={() => {}}
        characterCount={4}
      />
    );
    expect(screen.getByRole('button', { name: 'All characters · 4' })).toBeInTheDocument();
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

  describe('the icon-only phone trigger', () => {
    it('renders both an icon (hidden at md) and the text label (hidden below md)', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      const trigger = screen.getByRole('button', { name: 'This character' });
      const [iconSlot, textSlot] = trigger.children;
      expect(iconSlot).toHaveClass('md:hidden');
      expect(textSlot).toHaveClass('hidden', 'md:inline');
    });

    it("shows the AllCharacters glyph for 'all' and the active Character's own portrait for 'current'", () => {
      const { rerender } = render(
        <CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />
      );
      // The phone icon slot only: the md+ text pill carries its own CaretDown.
      const slot = () => screen.getByRole('button').children[0];
      expect(slot().querySelector('img')).toBeInTheDocument();
      expect(slot().querySelector('svg')).not.toBeInTheDocument();

      rerender(<CharacterFilterControl activeCharacterId={1} value="all" onChange={() => {}} />);
      expect(slot().querySelector('svg')).toBeInTheDocument();
      expect(slot().querySelector('img')).not.toBeInTheDocument();
    });

    it("defaults to the sm touch tier (a panel meta row's own IconButton size)", () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      expect(screen.getByRole('button')).toHaveClass('h-9', 'w-9');
    });

    it("matches the larger md tier when a PageHeader's own actions cluster needs it", () => {
      render(
        <CharacterFilterControl
          activeCharacterId={1}
          value="current"
          onChange={() => {}}
          size="md"
        />
      );
      expect(screen.getByRole('button')).toHaveClass('h-11', 'w-11');
    });
  });
});
