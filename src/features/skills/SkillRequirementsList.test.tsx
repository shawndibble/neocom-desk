import type { ReactElement, ReactNode } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntityInfoRoute } from '@/features/entities';
import '@/i18n';
import { SkillRequirementsList } from './SkillRequirementsList';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';
import type { ItemUnlockRow } from './skillUnlockLevels';

/** Skill names are links that open the modal through the URL, so every render sits in a router with its `EntityInfoRoute`. */
function RoutedWithInfo({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <EntityInfoRoute />
      {children}
    </MemoryRouter>
  );
}

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: RoutedWithInfo });

beforeEach(() => {
  useSkillDetailModalStore.setState({ request: null });
  useItemInfoModalStore.setState({ request: null });
});

describe('SkillRequirementsList', () => {
  it('opens the shared Skill Detail popover for a prereq name (#405)', () => {
    render(
      <SkillRequirementsList
        prereqs={[
          { typeID: 3300, name: 'Spaceship Command', level: 1, trained: true, planned: false },
        ]}
        unlocks={[]}
      />
    );

    fireEvent.click(screen.getByText('Spaceship Command'));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3300 });
  });

  it('opens the shared Skill Detail popover for an unlock name (#405)', () => {
    render(
      <SkillRequirementsList prereqs={[]} unlocks={[{ typeID: 3301, name: 'Frigate', level: 3 }]} />
    );

    fireEvent.click(screen.getByText('Frigate'));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3301 });
  });
  it('renders its section headings and level badge at the shared 0.6875rem chip rung (#882)', () => {
    const { container } = render(
      <SkillRequirementsList
        prereqs={[
          { typeID: 3300, name: 'Spaceship Command', level: 1, trained: true, planned: false },
        ]}
        unlocks={[]}
      />
    );

    for (const heading of container.querySelectorAll('h3')) {
      expect(heading).toHaveClass('text-[0.6875rem]');
    }
    expect(container.querySelector('[data-trained]')).toHaveClass('text-[0.6875rem]');
  });

  it('shows Planned rather than Level needed for an untrained prereq an open plan already targets', () => {
    render(
      <SkillRequirementsList
        prereqs={[
          { typeID: 3300, name: 'Spaceship Command', level: 2, trained: false, planned: true },
        ]}
        unlocks={[]}
      />
    );

    expect(screen.getByText('Planned · Level 2')).toBeInTheDocument();
    expect(screen.queryByText('Level 2')).not.toBeInTheDocument();
  });

  it('carries planEntries into a nested skill-detail open, so drilling into a prereq keeps its own prereqs Planned-aware', () => {
    const planEntries = [{ skillTypeID: 1, targetLevel: 5 }];
    render(
      <SkillRequirementsList
        prereqs={[
          { typeID: 3300, name: 'Spaceship Command', level: 1, trained: true, planned: false },
        ]}
        unlocks={[]}
        planEntries={planEntries}
      />
    );

    fireEvent.click(screen.getByText('Spaceship Command'));

    expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3300, planEntries });
  });

  it('groups skills and items under the level each needs, an item name opening its Item Detail', () => {
    render(
      <SkillRequirementsList
        prereqs={[]}
        unlocks={[{ typeID: 3301, name: 'Destroyer', level: 4 }]}
        itemUnlocks={[
          { typeID: 587, name: 'Rifter', level: 1, kind: 'ship' },
          { typeID: 3074, name: '150mm Railgun I', level: 1, kind: 'module' },
        ]}
        trainedLevel={1}
      />
    );

    expect(screen.getByRole('button', { name: /Level 1 · Trained/ })).toHaveAccessibleName(
      /1 ship · 1 module/
    );
    expect(screen.getByRole('button', { name: /Level 4/ })).toHaveAccessibleName(/1 skill/);

    fireEvent.click(screen.getByText('Rifter'));
    expect(useItemInfoModalStore.getState().request).toMatchObject({ typeId: 587 });
  });

  it('starts a long unlock list collapsed to a per-level summary, opening a level on click', () => {
    const itemUnlocks: ItemUnlockRow[] = Array.from({ length: 20 }, (_, i) => ({
      typeID: 1000 + i,
      name: `Module ${i}`,
      level: i < 10 ? 1 : 3,
      kind: 'module',
    }));
    render(<SkillRequirementsList prereqs={[]} unlocks={[]} itemUnlocks={itemUnlocks} />);

    const level1 = screen.getByRole('button', { name: /Level 1/ });
    expect(level1).toHaveAttribute('aria-expanded', 'false');
    expect(level1).toHaveAccessibleName(/10 modules/);
    expect(screen.queryByText('Module 0')).not.toBeInTheDocument();

    fireEvent.click(level1);
    expect(screen.getByText('Module 0')).toBeInTheDocument();
    expect(screen.queryByText('Module 10')).not.toBeInTheDocument();
  });
});
