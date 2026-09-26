import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';
import { controlHeightClassName } from './controlStyles';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const;

const noop = () => undefined;

describe('SegmentedControl', () => {
  it('is a labelled group of aria-pressed buttons with exactly one selected', () => {
    render(<SegmentedControl label="Pick" options={options} value="b" onChange={noop} />);
    const group = screen.getByRole('group', { name: 'Pick' });
    const buttons = screen.getAllByRole('button');
    expect(group).toContainElement(buttons[0]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('reports the picked value on click', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Pick" options={options} value="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('sizes every segment from the control scale', () => {
    const { rerender } = render(
      <SegmentedControl label="Pick" options={options} value="a" onChange={noop} />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain(controlHeightClassName.md);
    }
    rerender(
      <SegmentedControl label="Pick" options={options} value="a" onChange={noop} size="sm" />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain(controlHeightClassName.sm);
    }
  });

  it('stretches segments equally when filling', () => {
    render(<SegmentedControl label="Pick" options={options} value="a" onChange={noop} fill />);
    expect(screen.getByRole('group')).toHaveClass('w-full');
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('flex-1');
  });
});
