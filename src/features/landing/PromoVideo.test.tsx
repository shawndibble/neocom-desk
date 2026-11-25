import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromoVideo } from './PromoVideo';
import { promoEmbedUrl } from './promoVideo';

describe('PromoVideo', () => {
  it('loads nothing from YouTube until play is pressed, then plays in place', async () => {
    const { container } = render(<PromoVideo youtubeId="abc123" length="1:38" />);
    expect(container.querySelector('iframe')).toBeNull();
    const poster = container.querySelector('img');
    expect(poster).toHaveAttribute('loading', 'lazy');
    expect(poster?.getAttribute('src')).toMatch(/^\/promo\//);

    await userEvent.click(screen.getByRole('button', { name: 'login.video.play' }));

    const player = screen.getByTitle('login.video.playerTitle');
    expect(player.getAttribute('src')).toBe(promoEmbedUrl('abc123'));
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('promoEmbedUrl', () => {
  it('uses the no-cookie host and autoplays, since the press was the play', () => {
    expect(promoEmbedUrl('abc123')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0&playsinline=1'
    );
  });
});
