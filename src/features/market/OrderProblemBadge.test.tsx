import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import i18n from '@/i18n';
import { OrderProblemBadge, type OrderBadgeKind } from './OrderProblemBadge';

const ALL_KINDS: OrderBadgeKind[] = [
  'belowFloor',
  'undercutStation',
  'undercutSystem',
  'undercutRegion',
  'expiring',
  'stale',
  'offHub',
  'outbid',
  'best',
  'noCostBasis',
];

describe('OrderProblemBadge', () => {
  it.each(ALL_KINDS)('renders the %s label from i18n', (kind) => {
    render(<OrderProblemBadge kind={kind} />);
    const label = i18n.t(`market.orders.badge.${kind}`);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the detail text when given', () => {
    render(<OrderProblemBadge kind="undercutRegion" detail="7 jumps" />);
    expect(screen.getByText('7 jumps')).toBeInTheDocument();
  });

  it('still shows the label when no detail is given', () => {
    render(<OrderProblemBadge kind="best" />);
    expect(screen.getByText(i18n.t('market.orders.badge.best'))).toBeInTheDocument();
  });

  it('gives every badge an accessible explanation via the InfoTooltip trigger', () => {
    render(<OrderProblemBadge kind="belowFloor" />);
    const label = i18n.t('market.orders.badge.belowFloor');
    expect(
      screen.getByRole('button', { name: i18n.t('common.aboutLabel', { label }) })
    ).toBeInTheDocument();
  });
});
