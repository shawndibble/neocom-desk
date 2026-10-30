import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter } from '@/test/seed';
import { IconButton, PageHeader } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { stubViewport } from '@/test/viewport';
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
    expect(trigger.className).toMatch(/\bh-9\b/);
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

  describe('the avatar trigger, the same at every width', () => {
    beforeEach(async () => {
      await db.characters.clear();
    });

    const faceIds = (trigger: HTMLElement) =>
      Array.from(trigger.querySelectorAll('img')).map(
        (img) => /characters\/(\d+)\//.exec(img.getAttribute('src') ?? '')?.[1]
      );

    it('carries no words, at any width: faces and a caret only', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      const trigger = screen.getByRole('button', { name: 'This character' });
      expect(trigger).toHaveTextContent(/^$/);
      expect(trigger.innerHTML).not.toMatch(/\b(md|lg):(hidden|inline|block)\b/);
      expect(trigger.querySelector(':scope > svg')).toBeInTheDocument();
    });

    it("shows the active Character's own portrait for 'current'", () => {
      render(<CharacterFilterControl activeCharacterId={7} value="current" onChange={() => {}} />);
      expect(faceIds(screen.getByRole('button'))).toEqual(['7']);
    });

    it("stacks the active Character first, then the roster, for 'all'", async () => {
      await seedCharacter(1, 'Alpha', { addedAt: 1 });
      await seedCharacter(2, 'Bravo', { addedAt: 2 });
      await seedCharacter(3, 'Charlie', { addedAt: 3 });
      render(
        <CharacterFilterControl
          activeCharacterId={2}
          value="all"
          characterCount={3}
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole('button', { name: 'All characters · 3' });
      await waitFor(() => expect(faceIds(trigger)).toEqual(['2', '1', '3']));
      expect(trigger.querySelector('[data-stack-extra]')).toBeNull();
    });

    it('draws three faces and a "+N" chip for the rest, leaving out the missing', async () => {
      for (let id = 1; id <= 6; id += 1) await seedCharacter(id, `Pilot ${id}`, { addedAt: id });
      render(
        <CharacterFilterControl
          activeCharacterId={1}
          value="all"
          characterCount={6}
          missingNames={['Pilot 2']}
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole('button');
      await waitFor(() => expect(faceIds(trigger)).toEqual(['1', '3', '4']));
      expect(trigger.querySelector('[data-stack-extra]')).toHaveTextContent('+2');
    });

    it('draws two faces and a larger "+N" below md', async () => {
      stubViewport((media) => media.includes('max-width: 47.999rem'));
      for (let id = 1; id <= 5; id += 1) await seedCharacter(id, `Pilot ${id}`, { addedAt: id });
      render(
        <CharacterFilterControl
          activeCharacterId={4}
          value="all"
          characterCount={5}
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole('button');
      await waitFor(() => expect(faceIds(trigger)).toEqual(['4', '1']));
      expect(trigger.querySelector('[data-stack-extra]')).toHaveTextContent('+3');
    });

    it('holds the stack width with empty circles until the roster loads, then shows the faces', async () => {
      render(
        <CharacterFilterControl
          activeCharacterId={1}
          value="all"
          characterCount={5}
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole('button');
      expect(trigger.querySelectorAll('[data-stack-placeholder]')).toHaveLength(3);
      expect(trigger.querySelector('[data-stack-extra]')).toHaveTextContent('+2');
      for (let id = 1; id <= 5; id += 1) await seedCharacter(id, `Pilot ${id}`, { addedAt: id });
      // Seeding is one write per Character, so the first three faces can render
      // before the last two exist; the "+2" is only true once all five have.
      await waitFor(() => {
        expect(faceIds(trigger)).toEqual(['1', '2', '3']);
        expect(trigger.querySelector('[data-stack-extra]')).toHaveTextContent('+2');
      });
      expect(trigger.querySelector('[data-stack-placeholder]')).toBeNull();
    });

    it("builds the stack from the page's own Characters when it passes them", async () => {
      for (let id = 1; id <= 5; id += 1) await seedCharacter(id, `Pilot ${id}`, { addedAt: id });
      render(
        <CharacterFilterControl
          activeCharacterId={4}
          value="all"
          characterCount={2}
          allCharacterIds={[2, 4]}
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole('button', { name: 'All characters · 2' });
      await waitFor(() => expect(faceIds(trigger)).toEqual(['4', '2']));
      expect(trigger.querySelector('[data-stack-extra]')).toBeNull();
    });

    it("falls back to the Character's initial when a stacked portrait fails", async () => {
      await seedCharacter(1, 'Aria', { addedAt: 1 });
      await seedCharacter(2, 'Bex', { addedAt: 2 });
      render(
        <CharacterFilterControl
          activeCharacterId={1}
          value="all"
          characterCount={2}
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole('button');
      await waitFor(() => expect(faceIds(trigger)).toEqual(['1', '2']));
      fireEvent.error(trigger.querySelectorAll('img')[1]);
      expect(faceIds(trigger)).toEqual(['1']);
      expect(trigger).toHaveTextContent('B');
    });

    it("falls back to the AllCharacters glyph when 'This character's portrait fails", () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      const trigger = screen.getByRole('button');
      fireEvent.error(trigger.querySelector('img')!);
      expect(trigger.querySelector('img')).toBeNull();
      expect(trigger.querySelector('[data-face-fallback]')).toBeInTheDocument();
    });

    it('loads its portraits eagerly, as header chrome', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      expect(screen.getByRole('button').querySelector('img')).not.toHaveAttribute('loading');
    });

    it('shows the AllCharacters glyph with neither a roster nor a count to reserve', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="all" onChange={() => {}} />);
      const trigger = screen.getByRole('button');
      expect(trigger.querySelector('img')).toBeNull();
      expect(trigger.querySelectorAll('svg').length).toBe(2);
    });

    it('shows its accessible name in a tooltip on focus', async () => {
      render(
        <CharacterFilterControl
          activeCharacterId={1}
          value="all"
          characterCount={4}
          onChange={() => {}}
        />
      );
      const user = userEvent.setup();
      await user.tab();
      expect(await screen.findByRole('tooltip')).toHaveTextContent('All characters · 4');
    });

    it("defaults to the sm touch tier (a panel meta row's own IconButton height)", () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      expect(screen.getByRole('button')).toHaveClass('h-9', 'md:h-7', 'touch:h-9');
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
      expect(screen.getByRole('button')).toHaveClass('h-9');
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
    for (const tier of ['']) {
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
      missingNames: ['Bob Vale', 'Cy Rho'],
    } as const;

    it('keeps the label as "All characters" and adds who is missing to the accessible name', () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const trigger = screen.getByRole('button', {
        name: 'All characters · 4. Not included: Bob Vale and Cy Rho',
      });
      expect(trigger).not.toHaveTextContent(/All characters/);
    });

    it('draws a warning dot on the trigger itself, at every width', () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const dot = screen.getByRole('button').querySelector('[data-partial-dot]');
      expect(dot).toBeInTheDocument();
      expect(dot?.parentElement).toBe(screen.getByRole('button'));
      expect(dot?.className).not.toMatch(/hidden/);
    });

    it('keeps the dot inside the trigger box, so it never spills past the header edge', () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const dot = screen.getByRole('button').querySelector('[data-partial-dot]');
      // A negative inset (`-top-1`, `-right-1`) pushed it 4px outside the trigger;
      // as the last control on a phone header that ran into the page gutter.
      expect(dot?.className).toMatch(/\babsolute\b/);
      expect(dot?.className).not.toMatch(/(^|\s)-(top|right|bottom|left|inset)-/);
    });

    it('names who is missing in a non-interactive note in the open menu', async () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      await openMenu();
      const note = within(screen.getByRole('menu')).getByText('Not included: Bob Vale and Cy Rho');
      expect(note.closest('[role="menuitem"],[role="menuitemradio"]')).toBeNull();
    });

    it('announces who is missing in a polite live region beside the trigger, not inside it', async () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const status = await screen.findByRole('status');
      await waitFor(() => expect(status).toHaveTextContent('Not included: Bob Vale and Cy Rho'));
      expect(screen.getByRole('button').contains(status)).toBe(false);
    });

    it('announces nothing with full coverage or on "This character"', async () => {
      const { rerender } = render(
        <CharacterFilterControl {...partial} missingNames={[]} value="all" />
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(screen.getByRole('status')).toHaveTextContent('');
      rerender(<CharacterFilterControl {...partial} value="current" />);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('shows no "Not included" note in the menu on "This character"', async () => {
      render(<CharacterFilterControl {...partial} value="current" />);
      await openMenu();
      expect(screen.queryByText(/Not included/)).not.toBeInTheDocument();
    });

    it("rings the dot in the trigger's fill when pressed as well as at rest", () => {
      render(<CharacterFilterControl {...partial} value="all" />);
      const trigger = screen.getByRole('button');
      const dot = trigger.querySelector('[data-partial-dot]');
      expect(trigger).toHaveClass('group', 'bg-panel-2', 'active:bg-panel');
      expect(dot).toHaveClass('ring-panel-2', 'group-active:ring-panel');
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

    it('shows a hidden spinner inside the trigger while loading, the box unchanged', () => {
      const props = {
        activeCharacterId: 1,
        value: 'current',
        onChange: () => {},
        size: 'md',
      } as const;
      const { rerender } = render(<CharacterFilterControl {...props} />);
      const idle = screen.getByRole('button', { name: 'This character' }).className;
      rerender(<CharacterFilterControl {...props} loading />);
      const trigger = screen.getByRole('button', { name: 'This character' });
      expect(trigger.className).toBe(idle);
      expect(trigger).toHaveAttribute('aria-busy', 'true');
      const spinner = trigger.querySelector('[role="status"]');
      expect(spinner).toBeInTheDocument();
      expect(spinner?.closest('[aria-hidden="true"]')).not.toBeNull();
      // The faces stay, invisible, under the spinner: the width does not jump.
      expect(trigger.querySelector('img')?.closest('.invisible')).not.toBeNull();
    });

    it('draws no spinner when not loading', () => {
      render(<CharacterFilterControl activeCharacterId={1} value="current" onChange={() => {}} />);
      expect(screen.getByRole('button').querySelector('[role="status"]')).toBeNull();
      expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
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
    // 36px at every width, like Refresh.
    expect(picker).toHaveClass('h-9');
    expect(refresh).toHaveClass('size-9');
    expect(picker).not.toHaveClass('md:h-7');
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
      expect(trigger).toHaveClass('h-9');
      expect(img.parentElement).toHaveClass('size-6', 'md:size-5', 'touch:size-6');
    });

    it('keeps the face box for the sm tier', async () => {
      await seedCharacter(1, 'Aria', { corporationId: 98000001 });
      renderCorp('sm');
      const trigger = screen.getByRole('button', { name: 'Corporation' });
      const img = await waitFor(() => {
        const found = trigger.querySelector(`img[src*="${LOGO}"]`);
        expect(found).not.toBeNull();
        return found as HTMLImageElement;
      });
      expect(trigger).toHaveClass('h-9');
      expect(img.parentElement).toHaveClass('size-6', 'md:size-5');
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
