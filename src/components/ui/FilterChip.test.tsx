import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from './FilterChip';

describe('FilterChip', () => {
  it('reflects the selected state with aria-pressed', () => {
    const { rerender } = render(
      <FilterChip label="Ships" selected={false} onToggle={() => undefined} />
    );
    expect(screen.getByRole('button', { name: /Ships/ })).toHaveAttribute('aria-pressed', 'false');

    rerender(<FilterChip label="Ships" selected onToggle={() => undefined} />);
    expect(screen.getByRole('button', { name: /Ships/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn();
    render(<FilterChip label="Ships" selected={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /Ships/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the count alongside the label when given', () => {
    render(<FilterChip label="Ships" selected count={12} onToggle={() => undefined} />);
    expect(screen.getByRole('button', { name: /Ships/ })).toHaveTextContent('12');
  });

  it('renders inert and does not call onToggle when disabled', async () => {
    const onToggle = vi.fn();
    render(<FilterChip label="Corp Assets" selected={false} onToggle={onToggle} disabled />);
    const chip = screen.getByRole('button', { name: /Corp Assets/ });
    expect(chip).toBeDisabled();
    await userEvent.click(chip);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps a disabled chip reachable when it has a tooltip to explain itself', async () => {
    const onToggle = vi.fn();
    render(
      <FilterChip
        label="Wallet"
        selected={false}
        onToggle={onToggle}
        disabled
        tooltip="Unpick one first — the bar holds four."
      />
    );
    const chip = screen.getByRole('button', { name: /Wallet/ });
    // Not the native attribute: that one takes no hover and no focus, so the
    // explanation would be unreachable by either route.
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAttribute('aria-disabled', 'true');

    await userEvent.hover(chip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Unpick one first — the bar holds four.'
    );

    await userEvent.click(chip);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('reveals the disabled-and-explained tooltip on a plain tap, since the tap does nothing else', () => {
    render(
      <FilterChip
        label="Wallet"
        selected={false}
        onToggle={() => undefined}
        disabled
        tooltip="Unpick one first — the bar holds four."
      />
    );
    const chip = screen.getByRole('button', { name: /Wallet/ });

    fireEvent.touchStart(chip);
    fireEvent.touchEnd(chip);

    expect(screen.getByRole('tooltip')).toHaveTextContent('Unpick one first — the bar holds four.');
  });

  it('describes the chip with the tooltip on hover, leaving the label as its name', async () => {
    render(
      <FilterChip
        label="Hide risky routes"
        tooltip="Hides hauls that could strand the cargo."
        selected={false}
        onToggle={() => undefined}
      />
    );
    const chip = screen.getByRole('button', { name: 'Hide risky routes' });
    await userEvent.hover(chip);
    // Described, not renamed: the visible label has to survive in the
    // accessible name (WCAG 2.5.3), so the bubble arrives as a description.
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Hides hauls that could strand the cargo.'
    );
    expect(screen.getByRole('button', { name: 'Hide risky routes' })).toHaveAccessibleDescription(
      'Hides hauls that could strand the cargo.'
    );
  });

  it('still toggles when it carries a tooltip', async () => {
    const onToggle = vi.fn();
    render(
      <FilterChip label="Ships" tooltip="Only ship hulls." selected={false} onToggle={onToggle} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ships' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
