import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import i18n from '@/i18n';
import { OrderBadgeLegend } from './OrderBadgeLegend';
import type { OrderBadgeKind } from './OrderProblemBadge';

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

describe('OrderBadgeLegend', () => {
  it('renders every badge kind label when open', () => {
    render(<OrderBadgeLegend open onClose={vi.fn()} />);
    for (const kind of ALL_KINDS) {
      const label = i18n.t(`market.orders.badge.${kind}`);
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('renders the colour rule footer when open', () => {
    render(<OrderBadgeLegend open onClose={vi.fn()} />);
    expect(screen.getByText(i18n.t('market.orders.legendColourRule'))).toBeInTheDocument();
  });

  it('calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrderBadgeLegend open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: i18n.t('common.close') }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when open is false', () => {
    render(<OrderBadgeLegend open={false} onClose={vi.fn()} />);
    expect(screen.queryByText(i18n.t('market.orders.legendColourRule'))).toBeNull();
    expect(screen.queryByText(i18n.t('market.orders.badge.belowFloor'))).toBeNull();
  });
});
