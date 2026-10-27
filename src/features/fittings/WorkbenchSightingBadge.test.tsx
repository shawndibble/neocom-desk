import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { WorkbenchSightingBadge } from './WorkbenchSightingBadge';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe('WorkbenchSightingBadge', () => {
  it('shows the matching loss count and when one was last seen', () => {
    render(<WorkbenchSightingBadge sighting={{ count: 3, lastSeen: daysAgo(2) }} />);
    expect(screen.getByText('Seen on zKillboard: 3 recent losses · last seen 2d ago')).toBeTruthy();
  });

  it('says "loss" for one, and leaves out last seen when no loss carried a time', () => {
    render(<WorkbenchSightingBadge sighting={{ count: 1, lastSeen: null }} />);
    expect(screen.getByText('Seen on zKillboard: 1 recent loss')).toBeTruthy();
  });

  it('shows nothing for a fit that was not seen', () => {
    const { container } = render(<WorkbenchSightingBadge sighting={undefined} />);
    expect(container.textContent).toBe('');
  });
});
