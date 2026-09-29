import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { iconButtonClassName } from '@/components/ui/iconButtonClassName';
import { AlphaCloneChip } from './AlphaCloneChip';

const skillName = (typeId: number) =>
  ({ 3332: 'Gallente Cruiser', 16591: 'Heavy Assault Cruisers' })[typeId] ?? `#${typeId}`;

describe('AlphaCloneChip', () => {
  it('says an Alpha can fly it, and that this is by skill caps', async () => {
    render(<AlphaCloneChip blockers={[]} skillName={skillName} />);
    const chip = screen.getByRole('button', { name: 'Alpha OK' });
    await userEvent.hover(chip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'By skill caps: an Alpha clone can train every skill this fit needs.'
    );
  });

  it('says it needs Omega, naming the skill levels an Alpha cannot reach', async () => {
    render(
      <AlphaCloneChip
        blockers={[
          { skillTypeID: 16591, level: 1, alphaMaxLevel: 0 },
          { skillTypeID: 3332, level: 5, alphaMaxLevel: 4 },
        ]}
        skillName={skillName}
      />
    );
    await userEvent.hover(screen.getByRole('button', { name: 'Omega only' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Heavy Assault Cruisers I (Alphas can’t train it)');
    expect(tooltip).toHaveTextContent('Gallente Cruiser V (Alpha max IV)');
  });

  it('is an α icon in the positive tone when Alpha can fly it, an Ω in the warning tone otherwise', () => {
    const { rerender } = render(<AlphaCloneChip blockers={[]} skillName={skillName} />);
    const ok = screen.getByRole('button', { name: 'Alpha OK' });
    expect(ok).toHaveTextContent('α');
    expect(ok).toHaveClass(...iconButtonClassName({ tone: 'positive' }).split(' '));
    rerender(
      <AlphaCloneChip
        blockers={[{ skillTypeID: 3332, level: 5, alphaMaxLevel: 4 }]}
        skillName={skillName}
      />
    );
    const omega = screen.getByRole('button', { name: 'Omega only' });
    expect(omega).toHaveTextContent('Ω');
    expect(omega).toHaveClass(...iconButtonClassName({ tone: 'warning' }).split(' '));
  });

  it('opens its tooltip on a plain tap, for touch', async () => {
    render(<AlphaCloneChip blockers={[]} skillName={skillName} />);
    fireEvent.touchStart(screen.getByRole('button', { name: 'Alpha OK' }), {
      touches: [{ clientX: 0, clientY: 0 }],
    });
    fireEvent.touchEnd(screen.getByRole('button', { name: 'Alpha OK' }), { touches: [] });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('By skill caps');
  });

  it("holds the badge's place, silently, while the requirements load", () => {
    // Issue #2255: an empty slot the badge's size, so the header's action
    // group doesn't jump rows when the verdict lands.
    const { container } = render(<AlphaCloneChip blockers={null} skillName={skillName} />);
    expect(screen.queryByRole('button')).toBeNull();
    const slot = container.firstElementChild!;
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot).not.toHaveAttribute('tabindex');
    expect(slot).toBeEmptyDOMElement();
    expect(slot).toHaveClass('size-11', 'md:size-9');
  });
});
