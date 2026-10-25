import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { db } from '@/db';
import '@/i18n';
import { NearbyPushBadge } from './ScheduledPushBadge';

beforeEach(async () => {
  await db.settings.clear();
});

describe('NearbyPushBadge', () => {
  it('shows nothing while no Character’s grant carries the location', async () => {
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [] } });
    const { container } = render(<NearbyPushBadge />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the row as arriving with the app closed once one does', async () => {
    await db.settings.put({ key: 'alertsNearby', value: { supported: true, characterIds: [1] } });
    render(<NearbyPushBadge />);
    expect(
      await screen.findByRole('img', {
        name: /Arrives even with the app closed, within about 15 minutes/,
      })
    ).toBeInTheDocument();
  });
});
