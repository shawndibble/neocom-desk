import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

const glyph = <svg data-testid="glyph" />;

describe('IconButton', () => {
  it('shortens only the tooltip when `tooltip` is given, keeping the full accessible name', async () => {
    render(<IconButton icon={glyph} label="Delete Rifter run" tooltip="Delete" />);
    const button = screen.getByRole('button', { name: 'Delete Rifter run' });

    fireEvent.pointerMove(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete');
  });

  it('names the button after its label, so it is never announced as just "button"', () => {
    render(<IconButton icon={glyph} label="Collapse all" />);
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
  });

  it('hides the glyph from assistive tech — the label is the accessible name', () => {
    render(<IconButton icon={glyph} label="Refresh" />);
    expect(screen.getByTestId('glyph').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the same text as a tooltip, so pointer users get the name too', () => {
    render(<IconButton icon={glyph} label="Export CSV" />);
    const button = screen.getByRole('button');
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Export CSV');
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  });

  it('is a toggle only when `pressed` is given', () => {
    const { rerender } = render(<IconButton icon={glyph} label="Select" />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');

    rerender(<IconButton icon={glyph} label="Select" pressed={false} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(<IconButton icon={glyph} label="Select" pressed />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={glyph} label="Refresh" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire while disabled', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={glyph} label="Refresh" onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('takes the touch-sized box on phones and the standard control size from md up', () => {
    render(<IconButton icon={glyph} label="Refresh" />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('size-11');
    expect(button).toHaveClass('md:size-9');
  });
});
