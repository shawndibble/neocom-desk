import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { TourVideoLink } from './TourVideo';
import { TOUR_VIDEOS, promoEmbedUrl, type TourVideoId } from './promoVideoConfig';

const IDS = Object.keys(TOUR_VIDEOS) as TourVideoId[];

describe('TourVideoLink', () => {
  it.each(IDS)('names the %s video and its length, and loads nothing before the press', (id) => {
    const { container } = render(<TourVideoLink video={id} />);
    const link = screen.getByRole('button', {
      name: new RegExp(`\\(${TOUR_VIDEOS[id].duration}\\)$`),
    });
    expect(link).toHaveAttribute('aria-haspopup', 'dialog');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it.each(IDS)('plays the %s video in a dialog and unloads it on close', async (id) => {
    const user = userEvent.setup();
    const { container } = render(<TourVideoLink video={id} />);
    await user.click(screen.getByRole('button'));

    const dialog = screen.getByRole('dialog', { name: en.login.tourVideos[id].title });
    const player = within(dialog).getByTitle(en.login.tourVideos[id].title);
    expect(player.tagName).toBe('IFRAME');
    expect(player).toHaveAttribute('src', promoEmbedUrl(TOUR_VIDEOS[id].youtubeId));

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
