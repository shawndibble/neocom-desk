import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { EMPTY_ORE_ARRIVAL_LOG, recordLedgerFetch } from '@/engine/miningTax/oreArrival';
import { useOreArrivalLog } from './oreArrivalLog';
import { OreArrivalNotice } from './OreArrivalNotice';

const CHAR = 91;
const SYSTEM = 30000142;
const NOW = Date.parse('2026-10-04T12:22:00Z');
const today = { characterId: CHAR, date: '2026-10-04', solarSystemId: SYSTEM };
const otherToday = { characterId: CHAR, date: '2026-10-04', solarSystemId: 1 };
const lastWeek = { characterId: CHAR, date: '2026-09-27', solarSystemId: SYSTEM };

function seedLog(grows: boolean) {
  let log = recordLedgerFetch(
    EMPTY_ORE_ARRIVAL_LOG,
    CHAR,
    [{ date: '2026-10-04', solarSystemId: SYSTEM, quantity: 100 }],
    Date.parse('2026-10-04T12:00:00Z')
  );
  log = recordLedgerFetch(
    log,
    CHAR,
    [{ date: '2026-10-04', solarSystemId: SYSTEM, quantity: grows ? 150 : 100 }],
    Date.parse('2026-10-04T12:10:00Z')
  );
  useOreArrivalLog.setState({ value: log, hydrated: true });
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  await db.settings.clear();
  useOreArrivalLog.setState({ value: EMPTY_ORE_ARRIVAL_LOG, hydrated: true });
});
afterEach(() => vi.useRealTimers());

describe('OreArrivalNotice', () => {
  it('warns to wait while a ticked entry grew within the hour', () => {
    seedLog(true);
    render(<OreArrivalNotice entries={[today]} checking={false} pullStartedAt={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ore still arriving · wait ~48 min');
  });

  it('names how many when only some ticked entries are still growing', () => {
    seedLog(true);
    render(
      <OreArrivalNotice entries={[today, otherToday]} checking={false} pullStartedAt={null} />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 entry still receiving ore · wait ~48 min'
    );
  });

  it('keeps to small print once an entry that could still grow has gone quiet', () => {
    seedLog(false);
    render(<OreArrivalNotice entries={[today]} checking={false} pullStartedAt={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('ESI can lag up to 1 h');
  });

  it('says nothing about entries from a day that can no longer grow', () => {
    seedLog(true);
    const { container } = render(
      <OreArrivalNotice entries={[lastWeek]} checking={false} pullStartedAt={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the fresh pull in progress, then a failed one', () => {
    seedLog(false);
    const { rerender } = render(
      <OreArrivalNotice entries={[today]} checking pullStartedAt={NOW} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Checking ESI…');

    rerender(<OreArrivalNotice entries={[today]} checking={false} pullStartedAt={NOW} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't check ESI · it can lag up to 1 h"
    );
  });
});
