import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectionCheckbox } from './SelectionCheckbox';

describe('SelectionCheckbox', () => {
  it('shows a visible focus ring (issue #415) — every other focusable control in these virtualized rows already has one', () => {
    render(<SelectionCheckbox state="unchecked" onToggle={vi.fn()} label="Select item" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Select item' });
    expect(checkbox.className).toMatch(/focus-visible:outline-2/);
    expect(checkbox.className).toMatch(/focus-visible:outline-accent/);
  });

  it('reflects checked state', () => {
    render(<SelectionCheckbox state="checked" onToggle={vi.fn()} label="Select item" />);
    expect(screen.getByRole('checkbox', { name: 'Select item' })).toBeChecked();
  });
});
