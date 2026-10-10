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

describe('SegmentedControl selected cue', () => {
  const underline = 'shadow-[inset_0_-2px_0_var(--color-accent)]';

  it('draws an inset accent underline on the selected segment only', () => {
    render(<SegmentedControl label="Pick" options={options} value="b" onChange={noop} />);
    expect(screen.getByRole('button', { name: 'Beta', pressed: true }).className).toContain(
      underline
    );
    for (const name of ['Alpha', 'Gamma']) {
      expect(screen.getByRole('button', { name, pressed: false }).className).not.toContain(
        'shadow-'
      );
    }
  });
});

describe('SegmentedControl states', () => {
  it('fills an idle segment with panel-2 on hover and darkens it on press', () => {
    render(
      <SegmentedControl
        label="View"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={() => {}}
      />
    );
    const idle = screen.getByRole('button', { name: 'B' }).className;
    expect(idle).toContain('enabled:hover:bg-panel-2');
    expect(idle).toContain('enabled:active:bg-panel');
  });

  it('disables one segment without touching the others', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="View"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
        value="a"
        onChange={onChange}
      />
    );
    expect(screen.getByRole('button', { name: 'B' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains a disabled segment in a tooltip, stays focusable, and never shows it pressed', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="View"
        options={[
          { value: 'a', label: 'A', disabled: true, disabledReason: 'No data yet' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />
    );
    const a = screen.getByRole('button', { name: 'A' });
    expect(a).toHaveAttribute('aria-disabled', 'true');
    expect(a).not.toBeDisabled();
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.hover(a);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('No data yet');
    await userEvent.click(a);
    expect(onChange).not.toHaveBeenCalled();
  });
});
