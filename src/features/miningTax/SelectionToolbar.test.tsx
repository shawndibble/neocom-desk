import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar';

const SETTLE_REASON = 'Nothing outstanding in this selection to settle up.';

function bar(over: Record<string, unknown> = {}) {
  return (
    <SelectionToolbar
      selectedCount={2}
      canSelectAll
      onSelectAll={vi.fn()}
      onClear={vi.fn()}
      settleUpCount={1}
      onSettleUp={vi.fn()}
      combine={{ ok: true } as never}
      onCombine={vi.fn()}
      dismissCount={1}
      onDismiss={vi.fn()}
      {...over}
    />
  );
}

/** Reason lines the pilot can see: `<p>` text, as opposed to the sr-only descriptions. */
const visibleReasons = (c: HTMLElement) => c.querySelectorAll('p');

describe('SelectionToolbar', () => {
  it('sits on an opaque surface token so rows scrolling behind it stay hidden', () => {
    const { container } = render(
      <SelectionToolbar
        selectedCount={1}
        canSelectAll
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
        settleUpCount={1}
        onSettleUp={vi.fn()}
        combine={{ ok: false, reason: 'too-few' } as never}
        onCombine={vi.fn()}
        dismissCount={1}
        onDismiss={vi.fn()}
      />
    );
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toMatch(/\bbg-panel-2\b/);
    // A `/NN` alpha suffix on the background utility would make it see-through.
    expect(bar.className).not.toMatch(/\bbg-[\w-]+\/\d+/);
  });

  it('prints no visible line for a blocked Settle up / Link payment, but describes the buttons', () => {
    const { container } = render(
      bar({
        settleUpCount: 0,
        onLinkPayment: vi.fn(),
        linkPaymentBlockedReason: SETTLE_REASON,
      })
    );
    expect(visibleReasons(container)).toHaveLength(0);
    const settle = screen.getByRole('button', { name: /settle up/i });
    expect(settle).toBeDisabled();
    expect(settle).toHaveAccessibleDescription(SETTLE_REASON);
    expect(screen.getByRole('button', { name: /link payment/i })).toHaveAccessibleDescription(
      SETTLE_REASON
    );
  });

  it('shows exactly one reason line, Combine first, when several actions are blocked', () => {
    const { container, rerender } = render(
      bar({ combine: { ok: false, reason: 'too-few' } as never })
    );
    expect(visibleReasons(container)).toHaveLength(1);
    const combineReason = container.querySelector('p')?.textContent;
    rerender(bar({ combine: { ok: false, reason: 'too-few' } as never, dismissCount: 0 }));
    expect(visibleReasons(container)).toHaveLength(1);
    // Combine outranks Dismiss.
    expect(container.querySelector('p')?.textContent).toBe(combineReason);
    rerender(bar({ dismissCount: 0, canSelectAll: false }));
    expect(visibleReasons(container)).toHaveLength(1);
  });

  it('shows no reason line when nothing is blocked', () => {
    const { container } = render(bar());
    expect(visibleReasons(container)).toHaveLength(0);
  });
});
