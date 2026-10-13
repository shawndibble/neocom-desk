import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { RebuildPanel } from './MakeMoreSections';
import { buildPlanView } from './planView';
import { colony, fixtureAdvice, fixturePi } from './planViewFixture';

const NO_TICKS = { has: () => false, toggle: () => {} };

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
      <RebuildPanel view={view} ticks={NO_TICKS} />
    </MemoryRouter>
  );
  // A colony with nothing to change folds under "stays as it is".
  fireEvent.click(screen.getByRole('button', { name: /stays as it is/ }));
}

describe('RebuildPanel, a colony with no rebuild advice', () => {
  it('says a missing planet size is why, and still shows what it earns today', () => {
    renderRebuilds('needs-link-cost');
    expect(screen.getByText(/we don't have this planet's size/)).toBeInTheDocument();
    expect(screen.queryByText(/we can't measure this colony/)).toBeNull();
    expect(screen.getByText('1.2M')).toBeInTheDocument();
  });

  it('keeps "can\'t measure", with no figure, when the colony itself is unmeasured', () => {
    renderRebuilds('needs-measured-extraction');
    expect(screen.getByText(/we can't measure this colony/)).toBeInTheDocument();
    expect(screen.queryByText('1.2M')).toBeNull();
  });
});

describe('RebuildPanel, colonies that keep their setup', () => {
  it('folds them under one closed disclosure and says nothing changes', () => {
    const view = buildPlanView(
      {
        ...fixtureAdvice,
        colonies: [
          colony({
            planetId: 5,
            afterQuickWinsPerDay: 1_200_000,
            rebuild: { status: 'refused', planetId: 5, reason: 'needs-link-cost' },
          }),
        ],
      },
      fixturePi,
      (id) => `Planet ${id}`
    );
    render(
      <MemoryRouter>
        <RebuildPanel view={view} ticks={NO_TICKS} />
      </MemoryRouter>
    );
    expect(screen.getByText('No rebuild is worth the trouble at your prices.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 planet stays as it is/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText(/we don't have this planet's size/)).toBeNull();
  });

  it('opens the fold when a link points at a folded colony', () => {
    const view = buildPlanView(
      {
        ...fixtureAdvice,
        colonies: [
          colony({
            planetId: 5,
            afterQuickWinsPerDay: 1_200_000,
            rebuild: { status: 'refused', planetId: 5, reason: 'needs-link-cost' },
          }),
        ],
      },
      fixturePi,
      (id) => `Planet ${id}`
    );
    const anchor = view.rebuilds[0].anchor;
    render(
      <MemoryRouter initialEntries={[`/#${anchor}`]}>
        <RebuildPanel view={view} ticks={NO_TICKS} />
      </MemoryRouter>
    );
    expect(document.getElementById(anchor)).not.toBeNull();
  });
});

describe('RebuildPanel in-game steps', () => {
  it('says how many factories each SET covers, as PLACE does', () => {
    const view = buildPlanView(fixtureAdvice, fixturePi, (id) => `Planet ${id}`);
    render(
      <MemoryRouter>
        <RebuildPanel view={view} ticks={NO_TICKS} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /^In-game steps for / }));
    expect(screen.getByText(/^1 × Advanced factory →/)).toBeInTheDocument();
  });
});
