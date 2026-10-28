import { describe, expect, it } from 'vitest';
import type { CorporationCustomsOffice } from '@/esi/endpoints';
import type { CorpCustomsFeed } from './corpFeeds';
import { corpCustomsOffices } from './corpCustomsModels';
import type { BuildContext, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const ctx: BuildContext = {
  t,
  now: 0,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
};

const office = (over: Partial<CorporationCustomsOffice> = {}): CorporationCustomsOffice => ({
  office_id: 1,
  system_id: 30002813,
  type_id: 2233,
  reinforce_exit_start: 18,
  reinforce_exit_end: 20,
  allow_alliance_access: false,
  allow_access_with_standings: false,
  corporation_tax_rate: 0.05,
  ...over,
});

function feeds(over: Partial<CorpCustomsFeed> = {}, loading = false): Feeds {
  return {
    corpCustoms: {
      loading,
      error: false,
      data: {
        readable: true,
        needsReauth: false,
        fetchedAt: new Date(0),
        fromCache: false,
        offices: [office()],
        typeNames: new Map([[2233, 'Customs Office']]),
        systemNames: new Map([
          [30002813, 'Tama'],
          [30000142, 'Jita'],
        ]),
        ...over,
      },
    },
  };
}

describe('corpCustomsOffices', () => {
  it('counts offices and the systems they sit in', () => {
    const view = corpCustomsOffices(
      feeds({
        offices: [
          office(),
          office({ office_id: 2 }),
          office({ office_id: 3, system_id: 30000142 }),
        ],
      }),
      ctx
    );
    expect(view.number.value).toBe('3');
    expect(view.number.unit).toBe('overview.widgets.corpCustomsOffices.unit{"count":3}');
    expect(view.number.secondary?.text).toContain('"count":2');
    expect(view.status.isEmpty).toBe(false);
  });

  it('tables office, system, rates and the reinforce window, systems alphabetical', () => {
    const view = corpCustomsOffices(
      feeds({
        offices: [
          office({ office_id: 2 }),
          office({
            office_id: 3,
            system_id: 30000142,
            reinforce_exit_start: 2,
            reinforce_exit_end: 4,
            allow_alliance_access: true,
            alliance_tax_rate: 0.075,
            allow_access_with_standings: true,
            standing_level: 'good',
            good_standing_tax_rate: 0.1,
            excellent_standing_tax_rate: 0.08,
          }),
        ],
      }),
      ctx
    );
    const rows = view.table!.rows;
    expect(rows.map((r) => r.key)).toEqual(['3', '2']);
    expect(rows[0]!.cells).toEqual([
      'Customs Office',
      'Jita',
      [
        'overview.widgets.corpCustomsOffices.rate.corporation 5%',
        'overview.widgets.corpCustomsOffices.rate.alliance 7.5%',
        'overview.widgets.corpCustomsOffices.rate.excellent 8%',
        'overview.widgets.corpCustomsOffices.rate.good 10%',
      ].join(' · '),
      'overview.widgets.corpCustomsOffices.window{"start":"02","end":"04"}',
    ]);
    // A level ESI did not send is left out, never shown as 0%.
    expect(rows[1]!.cells[2]).toBe('overview.widgets.corpCustomsOffices.rate.corporation 5%');
  });

  it('falls back when a name is not known', () => {
    const view = corpCustomsOffices(feeds({ typeNames: new Map(), systemNames: new Map() }), ctx);
    expect(view.table!.rows[0]!.cells.slice(0, 2)).toEqual([
      'overview.widgets.corpCustomsOffices.unknownType',
      '—',
    ]);
  });

  it('is empty, not an error, with no offices', () => {
    const view = corpCustomsOffices(feeds({ offices: [] }), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.number.value).toBe('0');
  });

  it('says the roles do not cover it, or asks for access when the grant lapsed', () => {
    const none = corpCustomsOffices(feeds({ readable: false }), ctx);
    expect(none.status.isEmpty).toBe(true);
    expect(none.emptyMessage).toBe('overview.board.corpUnreadable');
    const lapsed = corpCustomsOffices(feeds({ readable: false, needsReauth: true }), ctx);
    expect(lapsed.status.needsPermission).toBe(true);
  });

  it('is blank while the first read loads', () => {
    const view = corpCustomsOffices(
      { corpCustoms: { data: null, error: false, loading: true } },
      ctx
    );
    expect(view.status.loading).toBe(true);
    expect(view.status.hasData).toBe(false);
  });
});

describe('corpCustomsOffices row detail', () => {
  it('lists the system, the window and each rate ESI sent', () => {
    const view = corpCustomsOffices(
      feeds({ offices: [office({ good_standing_tax_rate: 0.08 })] }),
      ctx
    );
    const detail = view.table!.rows[0]!.detail!;
    const K = 'overview.widgets.corpCustomsOffices';
    expect(detail.title).toBe('Customs Office');
    expect(detail.facts).toEqual([
      { label: `${K}.col.system`, value: 'Tama' },
      { label: `${K}.col.window`, value: `${K}.window{"start":"18","end":"20"}` },
      { label: `${K}.rate.corporation`, value: '5%' },
      { label: `${K}.rate.good`, value: '8%' },
    ]);
    expect(detail.place).toEqual({ systemId: 30002813, name: 'Tama' });
  });
});
