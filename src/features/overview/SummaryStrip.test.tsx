import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { SummaryStrip, type SummaryStripProps } from './SummaryStrip';

const BASE_PROPS: SummaryStripProps = {
  deadline: null,
  training: null,
  wallet: null,
  trainingUnavailable: false,
  notTrainingAlertEnabled: true,
  walletUnavailable: false,
  failed: false,
  fetchedAt: null,
  now: Date.now(),
  onRefresh: () => {},
  refreshing: false,
};

function renderStrip(props: Partial<SummaryStripProps> = {}) {
  return render(
    <MemoryRouter>
      <SummaryStrip {...BASE_PROPS} {...props} />
    </MemoryRouter>
  );
}

describe('SummaryStrip idle training', () => {
  it('warns and links to plans when the queue is idle and the not-training alert is enabled', () => {
    renderStrip({ notTrainingAlertEnabled: true });

    const link = screen.getByRole('link', { name: 'Nothing in training' });
    expect(link).toHaveAttribute('href', '/skills/plans');
    expect(link).toHaveClass('text-warning');
  });

  it('stays neutral, with no link, when the pilot has opted this Character out of the alert', () => {
    renderStrip({ notTrainingAlertEnabled: false });

    expect(screen.queryByRole('link', { name: 'Nothing in training' })).not.toBeInTheDocument();
    expect(screen.getByText('Nothing in training')).not.toHaveClass('text-warning');
  });
});

describe('SummaryStrip cached-data line', () => {
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 86_400_000);

  it('says the data is cached, with its age, when a read came from cache', () => {
    renderStrip({ fetchedAt: daysAgo(2), fromCache: true, now });
    expect(screen.getByText(/Showing cached data · 2d ago/)).toBeInTheDocument();
  });

  it('shows it for data older than an hour even when not from cache', () => {
    renderStrip({ fetchedAt: daysAgo(1), now });
    expect(screen.getByText(/Showing cached data/)).toBeInTheDocument();
  });

  it('renders nothing when the data is fresh', () => {
    renderStrip({ fetchedAt: new Date(now), now });
    expect(screen.queryByText(/Showing cached data/)).not.toBeInTheDocument();
  });
});
