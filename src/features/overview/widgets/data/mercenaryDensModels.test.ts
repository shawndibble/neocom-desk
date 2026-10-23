import { describe, expect, it } from 'vitest';
import type { MercenaryDenRow, MercenaryDensWidgetData } from '@/features/character/mercenaryDens';
import { mercenaryDens } from './mercenaryDensModels';
import type { BuildContext, Feeds, TableCell } from './types';

const HOUR = 3_600_000;
const NOW = 1_000 * HOUR;
const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const ctx: BuildContext = {
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
};
const W = 'overview.widgets.mercenaryDens';

const den = (over: Partial<MercenaryDenRow> = {}): MercenaryDenRow => ({
  key: '1:10',
  id: 10,
  characterId: 1,
  characterName: 'Kira',
  planetId: 40000001,
  planetName: 'Efa VII',
  systemId: 30000142,
  state: 'running',
  reinforcedUntilMs: null,
  anarchyLevel: 0,
  developmentLevel: 1,
  infomorphs: 184,
  operations: [],
  operationsRead: true,
  ...over,
});

const feeds = (over: Partial<MercenaryDensWidgetData> = {}): Feeds => ({
  mercenaryDens: {
    loading: false,
    error: false,
    data: {
      rows: [den()],
      granted: [1],
      failed: [],
      jumps: new Map([[30000142, 4]]),
      fetchedAt: new Date(0),
      ...over,
    },
  },
});

const text = (cell: TableCell | undefined) => (typeof cell === 'string' ? cell : cell?.text);

describe('mercenaryDens', () => {
  it('leads with reinforced dens and names the soonest one out', () => {
    const view = mercenaryDens(
      feeds({
        rows: [
          den({ state: 'reinforced', reinforcedUntilMs: NOW + 14 * HOUR }),
          den({
            key: '1:11',
            id: 11,
            planetName: 'X-7OMU IV',
            operations: [{ state: 'available', expiresMs: NOW + 9 * HOUR }],
          }),
        ],
      }),
      ctx
    );
    expect(view.number.value).toBe('1');
    expect(view.number.tone).toBe('critical');
    expect(view.number.secondary?.text).toContain(`${W}.reinforcedNext`);
    expect(view.number.secondary?.text).toContain('Efa VII');
    expect(view.number.notes?.[0]).toContain(`${W}.readyNote`);
  });

  it('falls back to ready operations, then to the den count', () => {
    const ready = mercenaryDens(
      feeds({ rows: [den({ operations: [{ state: 'available', expiresMs: NOW + 9 * HOUR }] })] }),
      ctx
    );
    expect(ready.number.unit).toContain(`${W}.operationsUnit`);
    expect(mercenaryDens(feeds(), ctx).number.unit).toContain(`${W}.unit`);
  });

  it('opts into width fit and lists dens worst first, linking each to Route Safety', () => {
    const view = mercenaryDens(
      feeds({
        rows: [den(), den({ key: '1:11', id: 11, planetName: 'X-7OMU IV', anarchyLevel: 2 })],
      }),
      ctx
    );
    expect(view.table?.fitWidth).toBe(true);
    expect(view.table?.rows.map((row) => text(row.cells[0]))).toEqual(['X-7OMU IV', 'Efa VII']);
    expect(view.table?.rows[0].cells[3]).toEqual({
      text: `${W}.level{"level":2}`,
      tone: 'bad',
    });
    expect(view.table?.rows[0].to).toContain('/travel');
    expect(text(view.table?.rows[1].cells[5])).toBe('4');
  });

  it('says Under 1h for a reinforcement ending inside the hour-old read', () => {
    const view = mercenaryDens(
      feeds({ rows: [den({ state: 'reinforced', reinforcedUntilMs: NOW + 20 * 60_000 })] }),
      ctx
    );
    expect(text(view.table?.rows[0].cells[1])).toContain(
      'overview.widgets.mercenaryDens.underHour'
    );
  });

  it('shows unknown operations, not None, when they were not read', () => {
    const view = mercenaryDens(feeds({ rows: [den({ operationsRead: false })] }), ctx);
    expect(text(view.table?.rows[0].cells[2])).toBe('—');
  });

  it('narrows to the header Character unless the widget reads All characters', () => {
    const data = {
      rows: [den(), den({ key: '2:20', id: 20, characterId: 2, characterName: 'Toma' })],
      granted: [1, 2],
    };
    const one = mercenaryDens(feeds(data), ctx);
    expect(one.table?.rows).toHaveLength(1);
    expect(one.table?.columns.map((c) => c.key)).not.toContain('character');
    const all = mercenaryDens(feeds(data), { ...ctx, scopeAll: true });
    expect(all.table?.rows).toHaveLength(2);
    expect(all.table?.columns.map((c) => c.key)).toContain('character');
  });

  it('asks for the permission when the header Character lacks the den scope', () => {
    const view = mercenaryDens(feeds({ granted: [2] }), ctx);
    expect(view.status.needsPermission).toBe(true);
  });

  it('shows Retry, not Grant access, when the header Character holds the scope but its read failed', () => {
    const view = mercenaryDens(feeds({ rows: [], granted: [1, 2], failed: [1] }), ctx);
    expect(view.status.needsPermission).toBe(false);
    expect(view.status.error).toBe(true);
  });

  it('names an unreadable alt under the table on All characters', () => {
    const view = mercenaryDens(feeds({ granted: [1, 2], failed: [2] }), { ...ctx, scopeAll: true });
    expect(view.table?.footer).toContain(`${W}.unread`);
  });

  it('reads a lapsed reinforcement as paused, and gives the Next chip no past clock', () => {
    const view = mercenaryDens(
      feeds({ rows: [den({ state: 'reinforced', reinforcedUntilMs: NOW - HOUR })] }),
      ctx
    );
    expect(text(view.table?.rows[0].cells[1])).toBe(`${W}.state.paused`);
    expect(view.deadlines).toEqual([]);
  });

  it('counts operation minutes exactly, unlike the hour-old den read', () => {
    const view = mercenaryDens(
      feeds({
        rows: [den({ operations: [{ state: 'available', expiresMs: NOW + 40 * 60_000 }] })],
      }),
      ctx
    );
    expect(text(view.table?.rows[0].cells[2])).not.toContain('underHour');
  });

  it('is empty, not missing permission, for a granted Character with no dens', () => {
    const view = mercenaryDens(feeds({ rows: [] }), ctx);
    expect(view.status.needsPermission).toBe(false);
    expect(view.status.isEmpty).toBe(true);
  });

  it('sends reinforcement ends and ready-operation expiries to the header Next chip', () => {
    const view = mercenaryDens(
      feeds({
        rows: [
          den({
            state: 'reinforced',
            reinforcedUntilMs: NOW + 14 * HOUR,
            operations: [{ state: 'available', expiresMs: NOW + 9 * HOUR }],
          }),
        ],
      }),
      ctx
    );
    expect(view.deadlines.map((d) => d.at).sort()).toEqual([NOW + 9 * HOUR, NOW + 14 * HOUR]);
    expect(view.deadlines.find((d) => d.at === NOW + 14 * HOUR)?.severity).toBe('critical');
  });
});
