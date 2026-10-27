import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { FitGoalModal } from './FitGoalModal';
import type { FitGoalOption } from './fitGoalOptions';

const options: FitGoalOption[] = [
  { id: 'a', name: 'Now fit', state: 'flyable-now' },
  { id: 'b', name: 'Soon fit', state: 'on-date', date: new Date('2026-12-01T12:00:00Z') },
  {
    id: 'c',
    name: 'Far fit',
    state: 'missing',
    missingLevels: 3,
    toAdd: [{ skillTypeID: 1, targetLevel: 4 }],
  },
];

describe('FitGoalModal', () => {
  it('shows each Fitting with its state', () => {
    render(<FitGoalModal open options={options} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByText('Flyable now')).toBeInTheDocument();
    expect(screen.getByText(/Flyable on/)).toBeInTheDocument();
    expect(screen.getByText(/3 skill levels missing/)).toBeInTheDocument();
  });

  it('picks a planned Fitting straight away', async () => {
    const onPick = vi.fn();
    render(<FitGoalModal open options={options} onClose={vi.fn()} onPick={onPick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Soon fit/ }));
    expect(onPick).toHaveBeenCalledWith(options[1]);
  });

  it('asks before adding the skills a Fitting is missing', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<FitGoalModal open options={options} onClose={vi.fn()} onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: /Far fit/ }));
    expect(onPick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add and set goal' }));
    expect(onPick).toHaveBeenCalledWith(options[2]);
  });

  it('does not offer a Fitting that is already flyable', () => {
    render(<FitGoalModal open options={options} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Now fit/ })).toBeDisabled();
  });
});
