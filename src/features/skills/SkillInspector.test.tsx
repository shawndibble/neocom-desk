import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { SkillInspector } from './SkillInspector';

describe('SkillInspector', () => {
  it('shows prerequisites, marking already-trained ones distinct from those still needed', () => {
    render(
      <SkillInspector
        skillName="Frigate"
        prereqs={[
          { typeID: 1, name: 'Spaceship Command', level: 3, trained: true },
          { typeID: 2, name: 'Gunnery', level: 5, trained: false },
        ]}
        unlocks={[]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Spaceship Command')).toBeInTheDocument();
    expect(screen.getByText('Gunnery')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    const trainedRow = rows.find((r) => r.textContent?.includes('Spaceship Command'));
    const untrainedRow = rows.find((r) => r.textContent?.includes('Gunnery'));
    expect(trainedRow?.textContent).not.toBe(untrainedRow?.textContent);
    // Distinct visual treatment: the trained row's badge does not read as still-needed.
    expect(trainedRow?.querySelector('[data-trained="true"]')).not.toBeNull();
    expect(untrainedRow?.querySelector('[data-trained="false"]')).not.toBeNull();
  });

  it('shows an empty state when the skill has no prerequisites', () => {
    render(<SkillInspector skillName="Frigate" prereqs={[]} unlocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText(/no prerequisites/i)).toBeInTheDocument();
  });

  it('shows what the skill unlocks, with the level required', () => {
    render(
      <SkillInspector
        skillName="Spaceship Command"
        prereqs={[]}
        unlocks={[{ typeID: 3, name: 'Frigate', level: 3 }]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Frigate')).toBeInTheDocument();
  });

  it('shows an empty state when the skill unlocks nothing', () => {
    render(<SkillInspector skillName="Frigate" prereqs={[]} unlocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText(/doesn.t unlock anything yet/i)).toBeInTheDocument();
  });

  it('calls onClose when the close control is used', async () => {
    const onClose = vi.fn();
    render(<SkillInspector skillName="Frigate" prereqs={[]} unlocks={[]} onClose={onClose} />);

    screen.getByRole('button', { name: /close/i }).click();
    expect(onClose).toHaveBeenCalled();
  });
});
