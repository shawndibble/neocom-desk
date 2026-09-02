import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('renders the label and trailing value, hiding children while collapsed', () => {
    render(
      <Disclosure label="Job fee" trailing="65" expanded={false} onToggle={vi.fn()}>
        <div>EIV detail</div>
      </Disclosure>
    );

    expect(screen.getByRole('button', { name: /job fee/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.queryByText('EIV detail')).not.toBeInTheDocument();
  });

  it('reveals children and flips aria-expanded when expanded', () => {
    render(
      <Disclosure label="Job fee" expanded={true} onToggle={vi.fn()}>
        <div>EIV detail</div>
      </Disclosure>
    );

    expect(screen.getByRole('button', { name: /job fee/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('EIV detail')).toBeInTheDocument();
  });

  it('calls onToggle on click and on keyboard activation', async () => {
    const onToggle = vi.fn();
    render(
      <Disclosure label="Job fee" expanded={false} onToggle={onToggle}>
        <div>EIV detail</div>
      </Disclosure>
    );

    const button = screen.getByRole('button', { name: /job fee/i });
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(2);

    await userEvent.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(3);
  });
});
