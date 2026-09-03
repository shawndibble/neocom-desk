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
      </>
    );
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('bg-accent');
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-danger');
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
