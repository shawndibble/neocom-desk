import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { GroupOwnedDiffersHint } from './GroupOwnedDiffersHint';

const GROUP = { id: 'g1', name: 'Rifter run' };
const DIFF = { typeID: 34, name: 'Tritanium', group: 1200, plan: 800 };

function renderHint(difference: typeof DIFF | null, group: typeof GROUP | null) {
  return render(
    <MemoryRouter>
      <GroupOwnedDiffersHint difference={difference} group={group} />
    </MemoryRouter>
  );
}

describe('GroupOwnedDiffersHint', () => {
  it('says how the totals differ and links to the group', () => {
    renderHint(DIFF, GROUP);
    expect(
      screen.getByText(
        'Group total differs: Rifter run counts 1,200 Tritanium owned, this plan 800.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the group' })).toHaveAttribute(
      'href',
      '/industry/groups/g1'
    );
  });

  it('renders nothing when the counts agree or the plan has no group', () => {
    const { container, rerender } = renderHint(null, GROUP);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <MemoryRouter>
        <GroupOwnedDiffersHint difference={DIFF} group={null} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
