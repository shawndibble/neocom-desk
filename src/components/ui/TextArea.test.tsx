import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

describe('TextArea onSubmitChord', () => {
  it('runs on Ctrl+Enter and does not add a newline', async () => {
    const onSubmitChord = vi.fn();
    const user = userEvent.setup();
    render(<TextArea aria-label="paste" onSubmitChord={onSubmitChord} />);
    await user.type(screen.getByLabelText('paste'), 'abc{Control>}{Enter}{/Control}');
    expect(onSubmitChord).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('paste')).toHaveValue('abc');
  });

  it('leaves a plain Enter as a newline', async () => {
    const onSubmitChord = vi.fn();
    const user = userEvent.setup();
    render(<TextArea aria-label="paste" onSubmitChord={onSubmitChord} />);
    await user.type(screen.getByLabelText('paste'), 'a{Enter}b');
    expect(onSubmitChord).not.toHaveBeenCalled();
    expect(screen.getByLabelText('paste')).toHaveValue('a\nb');
  });

  it('still calls the caller’s own onKeyDown', async () => {
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    render(<TextArea aria-label="paste" onKeyDown={onKeyDown} />);
    await user.type(screen.getByLabelText('paste'), 'a');
    expect(onKeyDown).toHaveBeenCalled();
  });
});
