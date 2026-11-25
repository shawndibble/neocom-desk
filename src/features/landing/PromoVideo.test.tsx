import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromoVideo } from './PromoVideo';
import { PROMO_VIDEO, promoEmbedUrl } from './promoVideoConfig';

function Harness() {
  const [plays, setPlays] = useState(0);
  return <PromoVideo plays={plays} onPlay={() => setPlays((n) => n + 1)} />;
}

describe('PromoVideo', () => {
  it('loads nothing from YouTube until play is pressed, then plays in place with focus', async () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('iframe')).toBeNull();
    const poster = container.querySelector('img');
    expect(poster).toHaveAttribute('loading', 'lazy');
    expect(poster?.getAttribute('src')).toMatch(/^\/promo\//);

    await userEvent.click(screen.getByRole('button', { name: 'login.video.play' }));

    const player = screen.getByLabelText('login.video.playerTitle');
    expect(player.getAttribute('src')).toBe(promoEmbedUrl(PROMO_VIDEO.youtubeId));
    expect(player).toHaveFocus();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('starts at once when another control asked to play, and refocuses the same player on a later press', () => {
    const view = render(<PromoVideo plays={1} onPlay={() => {}} />);
    const player = screen.getByLabelText('login.video.playerTitle');
    expect(player).toHaveFocus();
    player.blur();
    view.rerender(<PromoVideo plays={2} onPlay={() => {}} />);
    expect(screen.getByLabelText('login.video.playerTitle')).toBe(player);
    expect(player).toHaveFocus();
  });
});

describe('promoEmbedUrl', () => {
  it('uses the no-cookie host and autoplays, since the press was the play', () => {
    expect(promoEmbedUrl('abc123')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0&playsinline=1'
    );
  });
});
