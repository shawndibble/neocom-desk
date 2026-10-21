import { describe, expect, it } from 'vitest';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { getKind } from '@/features/overview/widgets/kinds';
import { CORP_DEFAULT_KINDS, corpDefaultLayout, corpWidgetBoard } from './corpGrid';

const ALL: CorpCapabilities = {
  canReadWallet: true,
  canReadStructures: true,
  canReadMoonExtractions: true,
  canReadMiningLedger: true,
  canReadMembers: true,
  canReadIndustry: true,
  canReadAssets: true,
  canReadBlueprints: true,
};

const kindsOf = (caps: CorpCapabilities) => corpDefaultLayout(caps).widgets.map((w) => w.kind);

describe('the Corp overview default layout', () => {
  it('opens with the clocks first, then money, then people, like the board it replaces', () => {
    expect(kindsOf(ALL)).toEqual([...CORP_DEFAULT_KINDS]);
    expect(kindsOf(ALL).slice(0, 2)).toEqual(['corpDeadlines', 'structures']);
  });

  it('gives a Station Manager the clocks and no money or people widgets', () => {
    const kinds = kindsOf({
      ...NO_CORP_CAPABILITIES,
      canReadStructures: true,
      canReadMoonExtractions: true,
    });
    expect(kinds).toEqual(['corpDeadlines', 'structures', 'moonChunks', 'corpServices']);
  });

  it('gives an Accountant the money widgets and no clocks', () => {
    expect(kindsOf({ ...NO_CORP_CAPABILITIES, canReadWallet: true })).toEqual([
      'corpWallet',
      'corpCashFlow',
      'corpIncome',
    ]);
  });

  it('builds nothing for a Character with no corp capability', () => {
    expect(kindsOf(NO_CORP_CAPABILITIES)).toEqual([]);
  });

  it('opens every widget at its kind’s own size and view, with unique ids', () => {
    const { widgets } = corpDefaultLayout(ALL);
    for (const w of widgets) {
      expect(w.size, w.kind).toBe(getKind(w.kind)!.defaultSize);
      expect(w.view, w.kind).toBe(getKind(w.kind)!.defaultView);
    }
    expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
  });

  it('never puts a coming-soon kind in the default', () => {
    for (const kind of CORP_DEFAULT_KINDS)
      expect(getKind(kind)?.availability, kind).toBe('available');
  });
});

describe('the Corp overview board', () => {
  it('offers only corp kinds, hides what the Character cannot read, and has no Character scope', () => {
    const board = corpWidgetBoard({ ...NO_CORP_CAPABILITIES, canReadWallet: true });
    expect(board.id).toBe('corp');
    expect(board.characterScope).toBe(false);
    expect(board.kinds.every((k) => k.boards.corp !== undefined)).toBe(true);
    expect(board.canDraw(getKind('corpWallet')!)).toBe(true);
    expect(board.canDraw(getKind('structures')!)).toBe(false);
    // Coming-soon kinds carry no gate, so the Gallery lists them for everyone.
    expect(board.canDraw(getKind('corpKills')!)).toBe(true);
  });

  it('resets to the default for the same capabilities', () => {
    const caps = { ...NO_CORP_CAPABILITIES, canReadMembers: true };
    expect(
      corpWidgetBoard(caps)
        .defaultLayout(() => 'x')
        .widgets.map((w) => w.kind)
    ).toEqual(['corpMembers', 'corpInactive']);
  });
});
