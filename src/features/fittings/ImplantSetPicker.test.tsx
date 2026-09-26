import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';

vi.mock('@/features/skills/typeCatalog', () => ({ loadItemNameMap: async () => new Map() }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[9950, 'Standard Blue Pill Booster']]),
}));

const { ImplantSetPicker } = await import('./ImplantSetPicker');

describe('ImplantSetPicker — booster side effects', () => {
  it('switches a carried booster’s side effect on, and off again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950] }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: 'Shield capacity −20%' }));
    expect(onChange).toHaveBeenLastCalledWith({
      implants: [],
      boosters: [9950],
      boosterSideEffects: [2737],
    });

    rerender(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950], boosterSideEffects: [2737] }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Shield capacity −20%' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Shield capacity −20%' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [9950] });
  });

  it('drops a removed booster’s side effects with it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950], boosterSideEffects: [2737] }}
        onChange={onChange}
      />
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove Standard Blue Pill Booster' })
    );
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [] });
  });
});
