import { afterEach, describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CorpRosterTable, type RosterRow } from './CorpRoster';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';

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

  describe('Joined date follows the Time format setting', () => {
    const JOINED = Date.UTC(2026, 2, 10, 23, 30);
    const zone = process.env.TZ;
    afterEach(() => {
      process.env.TZ = zone;
      useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
    });

    it.each(['local', 'eve'] as const)('shows the %s day', (format) => {
      process.env.TZ = 'Pacific/Auckland';
      useTimeFormat.setState({ value: format, hydrated: true });
      render(
        <MemoryRouter>
          <CorpRosterTable rows={[{ ...row(1, false), startMs: JOINED }]} />
        </MemoryRouter>
      );
      const cell = document.querySelector('td[data-label="Joined"]');
      expect(cell).toHaveTextContent(
        formatDateOnly(new Date(JOINED), format === 'eve' ? 'UTC' : undefined)
      );
      expect(formatDateOnly(new Date(JOINED), 'UTC')).not.toBe(formatDateOnly(new Date(JOINED)));
    });
  });
});
