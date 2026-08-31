import { render, screen } from '@testing-library/react';
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
});
