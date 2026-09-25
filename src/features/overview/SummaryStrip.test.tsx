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
