import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ChecklistPanel, RebuildPanel } from './MakeMoreSections';
import { buildPlanView } from './planView';
import { colony, fixtureAdvice, fixturePi } from './planViewFixture';

function renderRebuilds(reason: string) {
  const view = buildPlanView(
    {
      ...fixtureAdvice,
      colonies: [
        colony({
          planetId: 5,
          afterQuickWinsPerDay: 1_200_000,
          rebuild: { status: 'refused', planetId: 5, reason },
        }),
      ],
    },
    fixturePi,
    (id) => `Planet ${id}`
  );
  render(
    <MemoryRouter>
      <RebuildPanel view={view} />
    </MemoryRouter>
  );
}

describe('RebuildPanel, a colony with no rebuild advice', () => {
  it('says a missing planet size is why, and still shows what it earns today', () => {
    renderRebuilds('needs-link-cost');
    expect(screen.getByText(/we don't have this planet's size/)).toBeInTheDocument();
    expect(screen.queryByText(/we can't measure this colony/)).toBeNull();
    expect(screen.getByText('1.2M')).toBeInTheDocument();
    expect(screen.getByText('As-is')).toBeInTheDocument();
  });

  it('keeps "can\'t measure", with no figure, when the colony itself is unmeasured', () => {
    renderRebuilds('needs-measured-extraction');
    expect(screen.getByText(/we can't measure this colony/)).toBeInTheDocument();
    expect(screen.queryByText('As-is')).toBeNull();
  });
});

describe('ChecklistPanel', () => {
  it('says how many factories each SET covers, as PLACE does', () => {
    const view = buildPlanView(fixtureAdvice, fixturePi, (id) => `Planet ${id}`);
    render(
      <MemoryRouter>
        <ChecklistPanel view={view} ticks={{ has: () => false, toggle: () => {} }} />
      </MemoryRouter>
    );
    expect(screen.getByText(/^1 × Advanced factory →/)).toBeInTheDocument();
  });
});
