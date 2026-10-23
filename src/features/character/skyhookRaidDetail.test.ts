import { describe, expect, it } from 'vitest';
import { skyhookRaidDetail } from './skyhookRaidDetail';
import type { SkyhookRaid } from './calendarBoardSources';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-23T12:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

const raid = (over: Partial<SkyhookRaid> = {}): SkyhookRaid => ({
  id: 5,
  subject: 'X-7OMU IV',
  systemId: 30000001,
  systemName: 'X-7OMU',
  windowStartMs: NOW + 2 * HOUR,
  windowEndMs: NOW + 4 * HOUR,
  unsecuredUnits: 400,
  securedUnits: 800,
  ...over,
});

describe('skyhookRaidDetail', () => {
  it('shows system, stock, both window ends and the system for Set destination', () => {
    const detail = skyhookRaidDetail(raid(), NOW, t, 'UTC');
    expect(detail.title).toBe('X-7OMU IV');
    expect(detail.facts.map((f) => f.label)).toEqual([
      'calendar.skyhookRaid.system',
      'calendar.skyhookRaid.unsecured',
      'calendar.skyhookRaid.secured',
      'calendar.skyhookRaid.windowOpens',
      'calendar.skyhookRaid.windowCloses',
    ]);
    expect(detail.facts[0]!.value).toBe('X-7OMU');
    expect(detail.facts[1]!.value).toBe('calendar.skyhookRaid.units{"count":400}');
    expect(detail.place).toEqual({ systemId: 30000001, name: 'X-7OMU' });
    expect(detail.status).toMatchObject({ badge: 'calendar.skyhookRaid.state.upcoming' });
  });

  it('badges an open window as danger', () => {
    const detail = skyhookRaidDetail(raid(), NOW + 3 * HOUR, t, 'UTC');
    expect(detail.status).toMatchObject({
      badge: 'calendar.skyhookRaid.state.open',
      tone: 'danger',
    });
  });

  it('says unknown, never zero, for stock it could not read, and offers no destination without a system', () => {
    const detail = skyhookRaidDetail(
      raid({ unsecuredUnits: null, securedUnits: null, systemId: null, systemName: null }),
      NOW,
      t,
      'UTC'
    );
    expect(detail.facts[1]!.value).toBe('calendar.skyhookRaid.unknown');
    expect(detail.place).toBeUndefined();
  });
});
