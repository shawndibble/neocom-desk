import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextArea } from './TextArea';
import { fieldBaseClassName } from './controlStyles';

describe('TextArea', () => {
  it('carries the field chrome, full width and padding', () => {
    render(<TextArea aria-label="notes" />);
    const el = screen.getByLabelText('notes');
    for (const cls of fieldBaseClassName.split(' ')) expect(el).toHaveClass(cls);
    expect(el).toHaveClass('w-full', 'p-2');
    expect(el).not.toHaveClass('font-mono');
  });

  it('adds the monospace face with mono and keeps the caller className', () => {
    render(<TextArea aria-label="fit" mono className="text-xs" rows={3} />);
    const el = screen.getByLabelText('fit');
    expect(el).toHaveClass('font-mono', 'text-xs');
    expect(el).toHaveAttribute('rows', '3');
  });
});
