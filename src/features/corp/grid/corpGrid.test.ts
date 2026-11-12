import { describe, expect, it } from 'vitest';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { getKind } from '@/features/overview/widgets/kinds';
import { readScope } from '@/features/overview/widgets/board';
import { seedKind } from '@/features/overview/widgets/layout';
import { CORP_DEFAULT_SEEDS, corpDefaultLayout, corpWidgetBoard } from './corpGrid';

const DEFAULT_KINDS = CORP_DEFAULT_SEEDS.map(seedKind);

const ALL: CorpCapabilities = {
  canReadWallet: true,
  canReadStructures: true,
  canReadMoonExtractions: true,
  canReadMiningLedger: true,
  canReadMembers: true,
  canReadIndustry: true,
  canReadAssets: true,
  canReadBlueprints: true,
  canReadStarbases: true,
  canReadCustomsOffices: true,
  canReadRoleAudit: true,
  canReadContracts: true,
  canReadOrders: true,
  canReadDivisions: true,
  canReadSkyhooks: true,
  canManageSrp: true,
  canConfigureSrp: true,
};

/** What a Character with `caps` sees of the default layout. */
const drawnFor = (caps: CorpCapabilities) => {
  const board = corpWidgetBoard(caps);
  return corpDefaultLayout()
    .widgets.filter((w) => board.canDraw(getKind(w.kind)!))
    .map((w) => w.kind);
};

describe('the Corp Board default layout', () => {
  it('opens with the clocks first, then money, then people, like the board it replaces', () => {
    expect(corpDefaultLayout().widgets.map((w) => w.kind)).toEqual(DEFAULT_KINDS);
    expect(DEFAULT_KINDS.slice(0, 2)).toEqual(['corpDeadlines', 'structures']);
  });

  it('opens Due soon and Structures on every corporation, the rest on the header Character', () => {
    const scopes = corpDefaultLayout().widgets.map((w) => [w.kind, w.scope]);
    expect(scopes.slice(0, 3)).toEqual([
      ['corpDeadlines', 'all'],
      ['structures', 'all'],
      ['moonChunks', 'header'],
    ]);
  });

  it('holds every default kind whatever the Character reads, so a saved edit keeps the rest', () => {
    expect(corpDefaultLayout().widgets.map((w) => w.kind)).toContain('corpWallet');
    expect(drawnFor(NO_CORP_CAPABILITIES)).toEqual([]);
  });

  it('draws a Station Manager the clocks and no money or people widgets', () => {
    expect(
      drawnFor({ ...NO_CORP_CAPABILITIES, canReadStructures: true, canReadMoonExtractions: true })
    ).toEqual(['corpDeadlines', 'structures', 'moonChunks']);
  });

  it('draws an Accountant the money widgets and no clocks', () => {
    expect(drawnFor({ ...NO_CORP_CAPABILITIES, canReadWallet: true })).toEqual([
      'corpWallet',
      'corpWallet',
      'corpWallet',
    ]);
    // Divisions, then Flow and Sources, opened as Cash flow and Income by source were.
    const money = corpDefaultLayout().widgets.filter((w) => w.kind === 'corpWallet');
    expect(money.map((w) => [w.show, w.view])).toEqual([
      [undefined, 'table'],
      ['flow', 'chart'],
      ['sources', 'table'],
    ]);
  });

  it('draws a Director every default widget', () => {
    expect(drawnFor(ALL)).toEqual(DEFAULT_KINDS);
  });

  it('opens every widget at its kind’s own size and view, with unique ids', () => {
    const { widgets } = corpDefaultLayout();
    for (const w of widgets.filter((x) => x.show === undefined)) {
      expect(w.size, w.kind).toBe(getKind(w.kind)!.defaultSize);
      expect(w.view, w.kind).toBe(getKind(w.kind)!.defaultView);
    }
    expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
  });

  it('never puts a coming-soon kind in the default', () => {
    for (const kind of DEFAULT_KINDS) expect(getKind(kind)?.availability, kind).toBe('available');
  });
});

describe('the Corp Board board', () => {
  it('offers only corp kinds, hides what the Character cannot read, and has no Character scope', () => {
    const board = corpWidgetBoard({ ...NO_CORP_CAPABILITIES, canReadWallet: true });
    expect(board.id).toBe('corp');
    expect(board.characterScope).toBe('summable');
    expect(board.kinds.every((k) => k.boards.corp !== undefined)).toBe(true);
    expect(board.canDraw(getKind('corpWallet')!)).toBe(true);
    expect(board.canDraw(getKind('structures')!)).toBe(false);
    // Coming-soon kinds carry no gate, so the Gallery lists them for everyone.
    expect(board.canDraw(getKind('corpKills')!)).toBe(true);
  });

  it('offers All only while two or more corporations can be read for the kind', () => {
    const counted = (n: number) => corpWidgetBoard(ALL, () => n);
    expect(counted(2).allScopeOffered('corpDeadlines')).toBe(true);
    expect(counted(1).allScopeOffered('corpDeadlines')).toBe(false);
    expect(readScope(counted(1), { kind: 'structures', scope: 'all' })).toBe('header');
    expect(readScope(counted(2), { kind: 'structures', scope: 'all' })).toBe('all');
    // Counted over the kind's own capabilities.
    const asked: (readonly string[])[] = [];
    corpWidgetBoard(ALL, (caps) => (asked.push(caps), 2)).allScopeOffered('structures');
    expect(asked).toEqual([['canReadStructures']]);
    // Not yet known: the saved choice stands.
    expect(corpWidgetBoard(ALL).allScopeOffered('structures')).toBe(true);
    expect(corpWidgetBoard(ALL).opensOnAll).toEqual(new Set(['corpDeadlines', 'structures']));
  });

  it('resets to the full default', () => {
    let n = 0;
    const caps = { ...NO_CORP_CAPABILITIES, canReadMembers: true };
    expect(
      corpWidgetBoard(caps)
        .defaultLayout(() => `x${++n}`)
        .widgets.map((w) => w.kind)
    ).toEqual(DEFAULT_KINDS);
  });
});
