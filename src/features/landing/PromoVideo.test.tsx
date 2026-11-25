import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromoVideo } from './PromoVideo';
import { PROMO_VIDEO, promoEmbedUrl } from './promoVideo';

function Harness() {
  const [playing, setPlaying] = useState(false);
  return <PromoVideo playing={playing} onPlay={() => setPlaying(true)} />;
}

describe('PromoVideo', () => {
  it('loads nothing from YouTube until play is pressed, then plays in place with focus', async () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('iframe')).toBeNull();
    const poster = container.querySelector('img');
    expect(poster).toHaveAttribute('loading', 'lazy');
    expect(poster?.getAttribute('src')).toMatch(/^\/promo\//);

    await userEvent.click(screen.getByRole('button', { name: 'login.video.play' }));

    const player = screen.getByTitle('login.video.playerTitle');
    expect(player.getAttribute('src')).toBe(promoEmbedUrl(PROMO_VIDEO.youtubeId));
    expect(player).toHaveFocus();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('starts at once when another control already asked to play', () => {
    render(<PromoVideo playing onPlay={() => {}} />);
    expect(screen.getByTitle('login.video.playerTitle')).toHaveFocus();
  });
});

describe('promoEmbedUrl', () => {
  it('uses the no-cookie host and autoplays, since the press was the play', () => {
    expect(promoEmbedUrl('abc123')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0&playsinline=1'
    );
  });
});
