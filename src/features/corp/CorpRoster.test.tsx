import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpRosterTable, type RosterRow } from './CorpRoster';

const row = (characterId: number, isDark: boolean): RosterRow => ({
  characterId,
  name: `Member ${characterId}`,
  standing: {
    characterId,
    lastSeenMs: 0,
    neverSeen: false,
    darkForMs: isDark ? 90 * 86_400_000 : 86_400_000,
    isDark,
  },
  shipName: null,
  shipTypeId: null,
  locationName: null,
  locationId: null,
  startMs: null,
  roles: null,
  isSelf: false,
});

describe('CorpRosterTable', () => {
  it('says "dark" in the Last seen cell of a dark member only', () => {
    render(
      <MemoryRouter>
        <CorpRosterTable rows={[row(1, true), row(2, false)]} />
      </MemoryRouter>
    );
    const cells = document.querySelectorAll('td[data-label="Last seen"]');
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent(/dark/i);
    expect(cells[1]).not.toHaveTextContent(/dark/i);
  });
});
