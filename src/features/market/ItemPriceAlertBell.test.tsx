import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { ItemPriceAlertBell } from './ItemPriceAlertBell';

const TRITANIUM = 34;

describe('ItemPriceAlertBell', () => {
  it('opens the price alert popover on click when enabled', () => {
    render(
      <ItemPriceAlertBell
        typeId={TRITANIUM}
        name="Tritanium"
        item={undefined}
        disabled={false}
        onPin={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set price alert for Tritanium' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Issue #2162: a `title=` explanation is unreachable on a touch device,
  // which has no hover — the reason must be reachable by a tap instead.
  it('reveals the disabled reason on a tap instead of opening the popover', () => {
    render(
      <ItemPriceAlertBell
        typeId={TRITANIUM}
        name="Tritanium"
        item={undefined}
        disabled
        onPin={() => {}}
      />
    );
    const button = screen.getByRole('button', { name: 'Set price alert for Tritanium' });
    expect(button).toHaveAttribute('aria-disabled', 'true');

    fireEvent.touchStart(button, {
      touches: [{ clientX: 0, clientY: 0 }],
      changedTouches: [{ clientX: 0, clientY: 0 }],
    });
    fireEvent.touchEnd(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Select a character to use the Quickbar');

    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
