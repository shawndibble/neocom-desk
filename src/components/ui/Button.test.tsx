import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders label and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Refresh</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" and ghost variant', () => {
    render(<Button>Ghost</Button>);
    const button = screen.getByRole('button', { name: 'Ghost' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('border-line');
  });

  it('centres content by default and left-aligns it on request, for a full-width row in a stack', () => {
    render(
      <>
        <Button>Centred</Button>
        <Button align="start">Row</Button>
      </>
    );
    expect(screen.getByRole('button', { name: 'Centred' }).className).toContain('justify-center');
    const row = screen.getByRole('button', { name: 'Row' }).className;
    expect(row).toContain('justify-start');
    expect(row).not.toContain('justify-center');
  });

  it('applies variant styles', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="accent">Payees</Button>
      </>
    );
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('bg-accent');
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-danger');
    const accent = screen.getByRole('button', { name: 'Payees' }).className;
    expect(accent).toContain('border-accent');
    expect(accent.split(' ')).not.toContain('bg-accent');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Nope' });
    expect(button).toBeDisabled();
    await userEvent.click(button).catch(() => undefined);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button disabled and loading', () => {
  it('ignores a click while aria-disabled, but stays focusable so a tooltip can open', async () => {
    const onClick = vi.fn();
    render(
      <Button aria-disabled="true" onClick={onClick}>
        Save
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
    expect(button.className).toContain('aria-disabled:opacity-40');
    expect(button.className).not.toContain('pointer-events-none');
  });

  it('while loading shows a spinner, reports aria-disabled and busy, and ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Refresh
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the label laid out while loading, so the width does not shift', () => {
    const { rerender } = render(<Button>Refresh</Button>);
    expect(screen.getByRole('button').querySelector('svg')).toBeNull();
    rerender(<Button loading>Refresh</Button>);
    const label = screen.getByText('Refresh');
    expect(label.className).toContain('opacity-0');
    expect(label.className).not.toContain('hidden');
  });

  it('is not busy and fires clicks when not loading', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Refresh</Button>);
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('gives every variant a pressed step darker than hover', () => {
    for (const variant of ['primary', 'ghost', 'accent', 'danger', 'success', 'warning'] as const) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button').className).toContain('active:bg-');
      unmount();
    }
  });
});
