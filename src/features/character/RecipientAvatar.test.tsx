import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecipientAvatar } from './RecipientAvatar';

function renderAvatar(type: 'character' | 'corporation' | 'alliance' | 'mailing_list', id = 42) {
  return render(<RecipientAvatar recipient={{ recipient_id: id, recipient_type: type }} />);
}

describe('RecipientAvatar', () => {
  it('shows a character portrait, lazy and decorative', () => {
    const { container } = renderAvatar('character', 90000001);
    const img = container.querySelector('img');
    expect(img?.src).toBe('https://images.evetech.net/characters/90000001/portrait?size=64');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveClass('size-7');
  });

  it('shows a corporation logo', () => {
    const { container } = renderAvatar('corporation', 98000001);
    expect(container.querySelector('img')?.src).toBe(
      'https://images.evetech.net/corporations/98000001/logo?size=64'
    );
  });

  it('shows an alliance logo', () => {
    const { container } = renderAvatar('alliance', 99000001);
    expect(container.querySelector('img')?.src).toBe(
      'https://images.evetech.net/alliances/99000001/logo?size=64'
    );
  });

  it('shows a glyph for a mailing list, in the same box', () => {
    const { container } = renderAvatar('mailing_list', 145000001);
    expect(container.querySelector('img')).toBeNull();
    const box = container.querySelector('span');
    expect(box).toHaveClass('size-7');
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box?.querySelector('svg')).not.toBeNull();
  });

  it('falls back to a glyph in the same box when the image fails', () => {
    const { container } = renderAvatar('corporation');
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    const box = container.querySelector('span');
    expect(box).toHaveClass('size-7');
    expect(box?.querySelector('svg')).not.toBeNull();
  });
});
