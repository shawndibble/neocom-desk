import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AwaySection } from './AwaySection';

describe('AwaySection', () => {
  it('shows six sample alerts under the type filters, and links nowhere', () => {
    render(<AwaySection />);
    const feed = within(screen.getByRole('list', { name: 'Example alerts' }));
    expect(feed.getAllByRole('listitem')).toHaveLength(6);
    expect(feed.getByText('Market Order Undercut')).toBeInTheDocument();
    expect(feed.getByText('Planetary Extractor Expiring')).toBeInTheDocument();
    const filters = within(screen.getByRole('list', { name: 'Alert types' }));
    expect(filters.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'All',
      'Market',
      'Industry',
      'Mail',
      'Skills',
    ]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('offers the alerts walkthrough', () => {
    render(<AwaySection />);
    expect(screen.getByRole('button', { name: 'Watch how alerts work' })).toBeInTheDocument();
  });

  it('shows the three phone captures, lazily, and enlarges one in a dialog', async () => {
    render(<AwaySection />);
    const user = userEvent.setup();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image.getAttribute('src')).toMatch(/^\/screenshots\/phone-[a-z-]+\.webp$/);
    }
    await user.click(screen.getByRole('button', { name: /enlarge: route safety on a phone/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
