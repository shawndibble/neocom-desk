import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar';

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
});
