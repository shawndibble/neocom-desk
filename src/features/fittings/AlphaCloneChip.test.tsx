import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
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

  it('shows nothing while the requirements load', () => {
    const { container } = render(<AlphaCloneChip blockers={null} skillName={skillName} />);
    expect(container).toBeEmptyDOMElement();
  });
});
