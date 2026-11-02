import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CORPS } from './addCorpsFixtures';
import { PickCorpsDialog } from './PickCorpsDialog';

const props = {
  corps: CORPS.slice(0, 4),
  hiddenCount: 2,
  onDontAsk: vi.fn(),
  onOpenHidden: vi.fn(),
  onContinue: vi.fn(),
  onClose: vi.fn(),
};

describe('PickCorpsDialog', () => {
  it('starts with nothing ticked and Continue off', () => {
    render(<PickCorpsDialog {...props} />);
    expect(screen.getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(
      true
    );
    expect(screen.getByRole('button', { name: 'Continue with 0 corps' })).toBeDisabled();
  });

  it('ticks, ticks all, clears and continues with the chosen corps', async () => {
    const onContinue = vi.fn();
    render(<PickCorpsDialog {...props} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Connect Ironvale Reach' }));
    expect(screen.getByRole('button', { name: 'Continue with 1 corp' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tick all' }));
    expect(screen.getByRole('button', { name: 'Continue with 4 corps' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Connect Tallow Station Co' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with 1 corp' }));
    expect(onContinue).toHaveBeenCalledWith([CORPS[3]]);
  });

  it('ticks the corp the banner named', () => {
    render(<PickCorpsDialog {...props} initialSelected={[CORPS[1]!.corporationId]} />);
    expect(screen.getByRole('checkbox', { name: 'Connect Ashen Harbor Mining' })).toBeChecked();
  });

  it("hides a corp with Don't ask again and opens Hidden corps from the footer", async () => {
    const onDontAsk = vi.fn();
    const onOpenHidden = vi.fn();
    render(<PickCorpsDialog {...props} onDontAsk={onDontAsk} onOpenHidden={onOpenHidden} />);
    await userEvent.click(
      screen.getByRole('button', { name: "Don't ask again about Ironvale Reach" })
    );
    expect(onDontAsk).toHaveBeenCalledWith(CORPS[0]!.corporationId);
    await userEvent.click(screen.getByRole('button', { name: 'Hidden corps (2)' }));
    expect(onOpenHidden).toHaveBeenCalled();
  });

  it('has no Hidden corps button when none are hidden', () => {
    render(<PickCorpsDialog {...props} hiddenCount={0} />);
    expect(screen.queryByRole('button', { name: /Hidden corps/ })).toBeNull();
  });
});
