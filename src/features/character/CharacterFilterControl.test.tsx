import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter } from '@/test/seed';
import { IconButton, PageHeader } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterFilterControl, type CharacterScopeChoice } from './CharacterFilterControl';

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
    it('renders the glyph at every width (leading the md+ pill) and the text label from md up', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      const trigger = screen.getByRole('button', { name: 'This character' });
      const [iconSlot, textSlot] = trigger.children;
      expect(iconSlot).not.toHaveClass('md:hidden');
      expect(iconSlot).toHaveClass('md:size-5');
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

    // The text pill at `md` and up keeps its tier's height too, so it sits
    // level with the PageHeader actions it shares a line with (Mining Overview).
    it('keeps the tier height for the text pill at md and up', () => {
      const { rerender } = render(
        <CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />
      );
      expect(screen.getByRole('button')).toHaveClass('md:h-7', 'touch:h-9');
      rerender(
        <CharacterFilterControl
          activeCharacterId={1}
          value="current"
          onChange={() => {}}
          size="md"
        />
      );
      expect(screen.getByRole('button')).toHaveClass('md:h-9', 'touch:h-11');
      expect(screen.getByRole('button')).not.toHaveClass('md:h-7');
    });
  });

  it("adds a Corporation option that emits 'corporation', for one Character too", async () => {
    const onChange = vi.fn();
    render(
      <CharacterFilterControl<CharacterScopeChoice>
        activeCharacterId={1}
        value="current"
        corporation
        hideAll
        onChange={onChange}
      />
    );
    const user = await openMenu();
    expect(screen.queryByRole('menuitemradio', { name: 'All characters' })).toBeNull();
    await user.click(screen.getByRole('menuitemradio', { name: 'Corporation' }));
    expect(onChange).toHaveBeenCalledWith('corporation');
  });

  it('labels the trigger and swaps the phone glyph for Corporation', () => {
    const { container } = render(
      <CharacterFilterControl<CharacterScopeChoice>
        activeCharacterId={1}
        value="corporation"
        corporation
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Corporation' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('md trigger carries the same height classes as a default-size IconButton', () => {
    render(
      <>
        <CharacterFilterControl<CharacterScopeChoice>
          size="md"
          activeCharacterId={1}
          value="current"
          corporation
          onChange={() => {}}
        />
        <IconButton icon={<span />} label="Sibling" />
      </>
    );
    const trigger = screen.getByRole('button', { name: 'This character' }).className.split(/\s+/);
    const sibling = screen.getByRole('button', { name: 'Sibling' }).className.split(/\s+/);
    // IconButton's md box is size-N; the trigger's height is the same N at every tier.
    for (const tier of ['', 'md:', 'touch:']) {
      const size = sibling.find((c) => c.startsWith(`${tier}size-`));
      const height = trigger.find((c) => c.startsWith(`${tier}h-`));
      expect(size && height).toBeTruthy();
      expect(height!.slice(tier.length + 2)).toBe(size!.slice(tier.length + 5));
    }
  });

  describe('option rules', () => {
    const options = async (props: { count: number; corporation?: boolean; hideAll?: boolean }) => {
      render(
        <CharacterFilterControl<CharacterScopeChoice>
          activeCharacterId={1}
          value="current"
          characterCount={props.count}
          corporation={props.corporation}
          hideAll={props.hideAll}
          onChange={() => {}}
        />
      );
      if (!screen.queryByRole('button')) return null;
      await openMenu();
      return screen.getAllByRole('menuitemradio').map((el) => el.textContent?.replace(/^✓/, ''));
    };

    it('one Character, no corp: no picker', async () => {
      expect(await options({ count: 1 })).toBeNull();
    });
    it('one Character + corp: This character / Corporation', async () => {
      expect(await options({ count: 1, corporation: true })).toEqual([
        'This character',
        'Corporation',
      ]);
    });
    it('several, no corp: This / All', async () => {
      expect(await options({ count: 3 })).toEqual(['This character', 'All characters · 3']);
    });
    it('several + corp: This / All / Corporation', async () => {
      expect(await options({ count: 3, corporation: true })).toEqual([
        'This character',
        'All characters · 3',
        'Corporation',
      ]);
    });
    it('a page that cannot sum Characters never shows All', async () => {
      expect(await options({ count: 3, corporation: true, hideAll: true })).toEqual([
        'This character',
        'Corporation',
      ]);
    });
  });

  describe('partial coverage and loading, carried in the trigger', () => {
    const partial = {
      activeCharacterId: 1,
      onChange: () => {},
      characterCount: 4,
      missingNames: ['Bob Vale'],
    } as const;

    it('keeps the label as "All characters" and adds who is missing to the accessible name', () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const trigger = screen.getByRole('button', {
        name: 'All characters · 4. Not included: Bob Vale',
      });
      expect(trigger.children[1]).toHaveTextContent(/^All characters · 4$/);
    });

    it('draws a warning dot on the trigger itself, at every width', () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const dot = screen.getByRole('button').querySelector('[data-partial-dot]');
      expect(dot).toBeInTheDocument();
      expect(dot?.parentElement).toBe(screen.getByRole('button'));
      expect(dot?.className).not.toMatch(/hidden/);
    });

    it('names who is missing in a non-interactive note in the open menu', async () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      await openMenu();
      const note = screen.getByText('Not included: Bob Vale');
      expect(note.closest('[role="menuitem"],[role="menuitemradio"]')).toBeNull();
    });

    it('keeps the plain label and no dot for "This character"', () => {
      render(<CharacterFilterControl {...partial} value="current" />);
      const trigger = screen.getByRole('button', { name: 'This character' });
      expect(trigger.querySelector('[data-partial-dot]')).toBeNull();
    });

    it('full coverage (no missing names) reads the plain count', () => {
      render(<CharacterFilterControl {...partial} missingNames={[]} value="all" />);
      expect(screen.getByRole('button', { name: 'All characters · 4' })).toBeInTheDocument();
      expect(screen.getByRole('button').querySelector('[data-partial-dot]')).toBeNull();
    });

    it('shows a spinner inside the trigger while loading, keeping the box size', () => {
      render(
        <CharacterFilterControl
          activeCharacterId={1}
          value="current"
          onChange={() => {}}
          size="md"
          loading
        />
      );
      const trigger = screen.getByRole('button', { name: 'This character' });
      expect(trigger).toHaveClass('h-11', 'w-11');
      expect(trigger.querySelector('[role="status"]')).toBeInTheDocument();
    });

    it('draws no spinner when not loading', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      expect(screen.getByRole('button').querySelector('[role="status"]')).toBeNull();
    });
  });

  it("takes the PageHeader's tier in its scope slot: the same height as the IconButtons beside it", () => {
    render(
      <PageHeader
        title="Wallet"
        scope={
          <CharacterFilterControl
            activeCharacterId={1}
            value="current"
            onChange={() => {}}
            size="sm"
          />
        }
        actions={<IconButton icon={<Icon.Refresh />} label="Refresh" />}
      />
    );
    const picker = screen.getByRole('button', { name: 'This character' });
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    // 44px square below md, 36px tall from md up, 44px on a touch pointer.
    expect(picker).toHaveClass('h-11', 'w-11', 'md:h-9', 'touch:h-11');
    expect(refresh).toHaveClass('size-11', 'md:size-9', 'touch:size-11');
    expect(picker).not.toHaveClass('h-9', 'md:h-7');
  });

  describe("the Corporation glyph is the active Character's corp logo", () => {
    const LOGO = 'corporations/98000001/logo';
    beforeEach(async () => {
      await db.characters.clear();
    });

    function renderCorp(size: 'sm' | 'md' = 'md') {
      return render(
        <CharacterFilterControl<CharacterScopeChoice>
          activeCharacterId={1}
          value="corporation"
          corporation
          onChange={() => {}}
          size={size}
        />
      );
    }

    it('shows the logo once it loads, in the same box sizes', async () => {
      await seedCharacter(1, 'Aria', { corporationId: 98000001 });
      renderCorp();
      const trigger = screen.getByRole('button', { name: 'Corporation' });
      const img = await waitFor(() => {
        const found = trigger.querySelector(`img[src*="${LOGO}"]`);
        expect(found).not.toBeNull();
        return found as HTMLImageElement;
      });
      // The Buildings glyph holds the box until the logo has loaded.
      expect(trigger.querySelector('svg[data-corp-fallback]')).toBeInTheDocument();
      fireEvent.load(img);
      expect(trigger.querySelector('svg[data-corp-fallback]')).toBeNull();
      expect(trigger).toHaveClass('h-11', 'w-11', 'md:h-9');
      expect(trigger.children[0]).toHaveClass('md:size-5');
      expect(img.parentElement).toHaveClass('size-8', 'md:size-5');
    });

    it('keeps the phone box the portrait uses for the sm tier', async () => {
      await seedCharacter(1, 'Aria', { corporationId: 98000001 });
      renderCorp('sm');
      const trigger = screen.getByRole('button', { name: 'Corporation' });
      const img = await waitFor(() => {
        const found = trigger.querySelector(`img[src*="${LOGO}"]`);
        expect(found).not.toBeNull();
        return found as HTMLImageElement;
      });
      expect(trigger).toHaveClass('h-9', 'w-9');
      expect(img.parentElement).toHaveClass('size-7', 'md:size-5');
    });

    it('falls back to the Buildings glyph when the logo fails', async () => {
      await seedCharacter(1, 'Aria', { corporationId: 98000001 });
      renderCorp();
      const trigger = screen.getByRole('button', { name: 'Corporation' });
      const img = await waitFor(() => {
        const found = trigger.querySelector(`img[src*="${LOGO}"]`);
        expect(found).not.toBeNull();
        return found as HTMLImageElement;
      });
      fireEvent.error(img);
      expect(trigger.querySelector('img')).toBeNull();
      expect(trigger.querySelector('svg[data-corp-fallback]')).toBeInTheDocument();
    });

    it('shows the Buildings glyph when no corporation is known', async () => {
      await seedCharacter(1, 'Aria');
      renderCorp();
      const trigger = screen.getByRole('button', { name: 'Corporation' });
      // Let the Dexie read settle; still no logo.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(trigger.querySelector('img')).toBeNull();
      expect(trigger.querySelector('svg[data-corp-fallback]')).toBeInTheDocument();
    });
  });
});
