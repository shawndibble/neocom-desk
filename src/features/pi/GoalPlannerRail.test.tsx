import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ColoniesSection } from './GoalPlannerRail';
import type { PlannerColonyRow } from './goalPlannerModel';

const row = (planetId: number, over: Partial<PlannerColonyRow> = {}): PlannerColonyRow => ({
  planetId,
  systemId: 7,
  upgradeLevel: 4,
  planetType: 'lava',
  enabled: true,
  colony: null,
  excluded: null,
  advice: null,
  taxRate: 0.1,
  taxSource: { kind: 'player-poco', space: 'nullsec' },
  taxOverridden: false,
  rateUnknown: true,
  taxAssumed: true,
  headsAssumed: false,
  linkCostBorrowed: false,
  ...over,
});

function renderSection(focusCustoms: boolean, rows: PlannerColonyRow[]) {
  return render(
    <MemoryRouter>
      <ColoniesSection
        rows={rows}
        planetName={(id) => `Planet ${id}`}
        systemName={() => 'Home'}
        size="sm"
        focusCustoms={focusCustoms}
        expanded
        onToggleExpanded={() => {}}
        onToggle={() => {}}
        onCustomsChange={() => {}}
      />
    </MemoryRouter>
  );
}

describe('ColoniesSection customs rate editor', () => {
  it('renders a rate field per colony and focuses the first when deep-linked', () => {
    renderSection(true, [row(1, { excluded: 'no-detail' }), row(2), row(3)]);
    const fields = screen.getAllByRole('textbox', { name: /Customs tax/ });
    expect(fields).toHaveLength(2);
    expect(fields[0]).toHaveFocus();
    expect(fields[1]).not.toHaveFocus();
  });

  it('takes no focus without the deep link', () => {
    renderSection(false, [row(2)]);
    expect(screen.getByRole('textbox', { name: /Customs tax/ })).not.toHaveFocus();
  });
});
