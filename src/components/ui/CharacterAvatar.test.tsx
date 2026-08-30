import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterAvatar } from './CharacterAvatar';

const CHARACTER_ID = 90000001;

/** Decorative avatars are hidden from the accessibility tree, so query the DOM. */
function portrait(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector('img');
  if (!img) throw new Error('no portrait rendered');
  return img;
}

describe('CharacterAvatar', () => {
  it('requests the portrait size the rendered box needs', () => {
    const { container } = render(<CharacterAvatar characterId={CHARACTER_ID} size="sm" />);
    expect(portrait(container).src).toContain(
      `https://images.evetech.net/characters/${CHARACTER_ID}/portrait?size=64`
    );

    const large = render(<CharacterAvatar characterId={CHARACTER_ID} size="lg" />);
    expect(portrait(large.container).src).toContain('portrait?size=128');
  });

  it('sets explicit width and height so the layout does not shift', () => {
    const { container } = render(<CharacterAvatar characterId={CHARACTER_ID} size="md" />);
    const img = portrait(container);
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
    expect(img).toHaveClass('size-8');
  });

  it('is decorative by default and named when alt text is given', () => {
    const { container } = render(<CharacterAvatar characterId={CHARACTER_ID} />);
    const img = portrait(container);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');

    render(<CharacterAvatar characterId={CHARACTER_ID} alt="Portrait of Jita Trader" />);
    const named = screen.getByRole('img', { name: 'Portrait of Jita Trader' });
    expect(named).not.toHaveAttribute('aria-hidden');
  });

  it('swaps the hairline ring for accent when selected', () => {
    const { container } = render(<CharacterAvatar characterId={CHARACTER_ID} />);
    expect(portrait(container)).toHaveClass('border-line');

    const selected = render(<CharacterAvatar characterId={CHARACTER_ID} selected />);
    expect(portrait(selected.container)).toHaveClass('border-accent');
  });
});
