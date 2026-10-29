import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { deriveEmploymentHistoryRows } from './employmentHistory';
import { EmploymentTimeline } from './EmploymentTimeline';
import { renderInRouter } from '@/test/render';

const NOW = new Date('2026-06-01T00:00:00Z').getTime();
const rows = deriveEmploymentHistoryRows(
  [
    { record_id: 1, corporation_id: 100, start_date: '2024-01-15T00:00:00Z' },
    { record_id: 2, corporation_id: 200, start_date: '2025-02-10T00:00:00Z' },
    { record_id: 3, corporation_id: 100, start_date: '2025-02-12T00:00:00Z' },
  ],
  NOW
);
const names = new Map([
  [100, 'Alpha'],
  [200, 'Beta'],
]);

describe('EmploymentTimeline', () => {
  it('tags a returned corp and a short stay in words, and the current stint when it matches', () => {
    renderInRouter(
      <EmploymentTimeline rows={rows} names={names} label="History" currentCorporationId={100} />
    );

    const [current, short, first] = within(
      screen.getByRole('list', { name: 'History' })
    ).getAllByRole('listitem');
    expect(current).toHaveTextContent('Alpha');
    expect(current).toHaveTextContent('employmentHistory.current');
    expect(current).toHaveTextContent('employmentHistory.returned');
    expect(short).toHaveTextContent('employmentHistory.shortStay');
    expect(first).not.toHaveTextContent('employmentHistory.returned');
  });

  it('draws an NPC stint as a slim tagged line with no bar', () => {
    const npcRows = deriveEmploymentHistoryRows(
      [
        { record_id: 1, corporation_id: 100, start_date: '2024-01-15T00:00:00Z' },
        { record_id: 2, corporation_id: 1_000_125, start_date: '2025-02-10T00:00:00Z' },
        { record_id: 3, corporation_id: 200, start_date: '2025-02-12T00:00:00Z' },
      ],
      NOW
    );
    const { container } = renderInRouter(
      <EmploymentTimeline
        rows={npcRows}
        names={new Map([...names, [1_000_125, 'Perkone']])}
        label="History"
      />
    );

    const [, npc] = within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
    expect(npc).toHaveTextContent('Perkone');
    expect(npc).toHaveTextContent('employmentHistory.npc');
    expect(npc).not.toHaveTextContent('employmentHistory.shortStay');
    expect(npc.querySelector('img')).toBeNull();
    expect(within(npc).getByText(/ – /)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-tenure-bar]')).toHaveLength(2);
  });

  it('keeps the ongoing row plain when the character record names another corp', () => {
    renderInRouter(
      <EmploymentTimeline rows={rows} names={names} label="History" currentCorporationId={999} />
    );

    expect(screen.queryByText('employmentHistory.current')).toBeNull();
  });

  it('keeps the ongoing row plain on the page when the character has no corporation id yet', () => {
    renderInRouter(<EmploymentTimeline rows={rows} names={names} label="History" />);

    expect(screen.queryByText('employmentHistory.current')).toBeNull();
  });

  it('modal variant draws no date gutter, so the range under the name is never hidden', () => {
    const { container } = renderInRouter(
      <EmploymentTimeline variant="modal" rows={rows} names={names} label="History" />
    );

    expect(screen.getByText('employmentHistory.current')).toBeInTheDocument();
    expect(container.querySelector('.md\\:block')).toBeNull();
    expect(container.querySelector('.md\\:hidden')).toBeNull();
    expect(screen.getAllByText(/ – /)).toHaveLength(rows.length);
  });
});
