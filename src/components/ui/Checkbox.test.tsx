import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders the 16px house recipe and merges a caller className', () => {
    render(<Checkbox aria-label="Pick" className="mt-0.5" />);
    const box = screen.getByRole('checkbox', { name: 'Pick' });
    expect(box).toHaveClass('size-4', 'shrink-0', 'cursor-pointer', 'accent-accent', 'mt-0.5');
  });

  it('forwards checked and onChange', async () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Pick" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pick' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards disabled and ref', async () => {
    const onChange = vi.fn();
    const ref = { current: null as HTMLInputElement | null };
    render(<Checkbox aria-label="Pick" disabled onChange={onChange} ref={ref} />);
    const box = screen.getByRole('checkbox', { name: 'Pick' });
    expect(box).toBeDisabled();
    expect(ref.current).toBe(box);
    await userEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });
});
