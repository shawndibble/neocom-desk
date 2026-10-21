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
  canReadStarbases: true,
  canReadCustomsOffices: true,
  canReadRoleAudit: true,
  canReadContracts: true,
};

/** What a Character with `caps` sees of the default layout. */
const drawnFor = (caps: CorpCapabilities) => {
  const board = corpWidgetBoard(caps);
  return corpDefaultLayout()
    .widgets.filter((w) => board.canDraw(getKind(w.kind)!))
    .map((w) => w.kind);
};

describe('the Corp overview default layout', () => {
  it('opens with the clocks first, then money, then people, like the board it replaces', () => {
    expect(corpDefaultLayout().widgets.map((w) => w.kind)).toEqual([...CORP_DEFAULT_KINDS]);
    expect(CORP_DEFAULT_KINDS.slice(0, 2)).toEqual(['corpDeadlines', 'structures']);
  });

  it('holds every default kind whatever the Character reads, so a saved edit keeps the rest', () => {
    expect(corpDefaultLayout().widgets.map((w) => w.kind)).toContain('corpWallet');
    expect(drawnFor(NO_CORP_CAPABILITIES)).toEqual([]);
  });

  it('draws a Station Manager the clocks and no money or people widgets', () => {
    expect(
      drawnFor({ ...NO_CORP_CAPABILITIES, canReadStructures: true, canReadMoonExtractions: true })
    ).toEqual(['corpDeadlines', 'structures', 'moonChunks', 'corpServices']);
  });

  it('draws an Accountant the money widgets and no clocks', () => {
    expect(drawnFor({ ...NO_CORP_CAPABILITIES, canReadWallet: true })).toEqual([
      'corpWallet',
      'corpCashFlow',
      'corpIncome',
    ]);
  });

  it('draws a Director every default widget', () => {
    expect(drawnFor(ALL)).toEqual([...CORP_DEFAULT_KINDS]);
  });

  it('opens every widget at its kind’s own size and view, with unique ids', () => {
    const { widgets } = corpDefaultLayout();
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

  it('resets to the full default', () => {
    let n = 0;
    const caps = { ...NO_CORP_CAPABILITIES, canReadMembers: true };
    expect(
      corpWidgetBoard(caps)
        .defaultLayout(() => `x${++n}`)
        .widgets.map((w) => w.kind)
    ).toEqual([...CORP_DEFAULT_KINDS]);
  });
});
