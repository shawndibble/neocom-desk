import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ImproveJobChoice } from './ImproveJobChoice';

describe('ImproveJobChoice', () => {
  it('shows a hint for the job and no space choice outside Explore', () => {
    render(<ImproveJobChoice job="pve" onJobChange={vi.fn()} onSpaceChange={vi.fn()} />);
    expect(screen.getByText(/Missions, anomalies, Abyss/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers the no-propulsion opt-out under PvE only, off until ticked', async () => {
    const onNoPropulsionChange = vi.fn();
    const { rerender } = render(
      <ImproveJobChoice
        job="pve"
        onJobChange={vi.fn()}
        onSpaceChange={vi.fn()}
        onNoPropulsionChange={onNoPropulsionChange}
      />
    );
    const box = screen.getByRole('checkbox', { name: /No propulsion needed/ });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(onNoPropulsionChange).toHaveBeenCalledWith(true);
    rerender(
      <ImproveJobChoice
        job="pvp"
        onJobChange={vi.fn()}
        onSpaceChange={vi.fn()}
        onNoPropulsionChange={onNoPropulsionChange}
      />
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('defaults Explore to Dangerous, listed first', () => {
    render(<ImproveJobChoice job="explore" onJobChange={vi.fn()} onSpaceChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBe(screen.getByRole('radio', { name: /Dangerous \(wormholes/ }));
    expect(radios[0]).toBeChecked();
    expect(screen.getByRole('radio', { name: /Safe space/ })).not.toBeChecked();
  });

  it('reports the space and job picked', async () => {
    const onJobChange = vi.fn();
    const onSpaceChange = vi.fn();
    render(
      <ImproveJobChoice job="explore" onJobChange={onJobChange} onSpaceChange={onSpaceChange} />
    );
    await userEvent.click(screen.getByRole('radio', { name: /Safe space/ }));
    expect(onSpaceChange).toHaveBeenCalledWith('safe');
    await userEvent.click(screen.getByRole('button', { name: 'PvP' }));
    expect(onJobChange).toHaveBeenCalledWith('pvp');
  });
});
