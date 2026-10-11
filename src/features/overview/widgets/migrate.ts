/**
 * Turns the old board's two settings (hidden cards, card order) into an
 * Overview Layout for a pilot who had them before the widget grid shipped.
 *
 * Pure, and deliberately free of `hiddenCards.ts`/`cardOrder.ts` (those open
 * the settings store): the old key names are restated here as the migration's
 * own frozen contract.
 */
import { isAddable, type WidgetKindId } from './kinds';
import { newWidget, type MakeId, type OverviewLayout, type Widget } from './layout';

/** Old card key -> Widget Kind, in the old board's built-in order. */
const CARD_TO_KIND: readonly [string, WidgetKindId][] = [
  ['orders', 'orders'],
  ['mining', 'miningTax'],
  ['contracts', 'contracts'],
  ['planetary', 'planetary'],
  ['industry', 'industry'],
  ['structures', 'structures'],
  ['moonChunks', 'moonChunks'],
  ['comingUp', 'comingUp'],
  ['spExtraction', 'sp'],
  ['mail', 'mail'],
  ['priceAlerts', 'priceWatch'],
  ['incursions', 'incursions'],
  ['stock', 'stock'],
];

/** The migration also accepts the Widget Kind's own name for the mining card. */
const ALIASES: Record<string, string> = { miningTax: 'mining' };

/** Cards that started switched off; their "on" is a `show:<key>` marker. */
const DEFAULT_OFF = new Set(['incursions']);

const BUILTIN_ORDER = CARD_TO_KIND.map(([key]) => key);
const KIND_OF = new Map(CARD_TO_KIND);

function seqId(): MakeId {
  let n = 0;
  return () => `m${++n}`;
}

export function migrateFromCards(
  old: { hidden: readonly string[]; order: readonly string[] },
  makeId: MakeId = seqId()
): OverviewLayout {
  const hidden = new Set(old.hidden);
  const stored = old.order.map((key) => ALIASES[key] ?? key).filter((key) => KIND_OF.has(key));
  const placed = new Set(stored);
  const ordered = [...new Set(stored), ...BUILTIN_ORDER.filter((key) => !placed.has(key))];

  const kinds: WidgetKindId[] = ['wallet', 'training'];
  for (const key of ordered) {
    const shown = DEFAULT_OFF.has(key) ? hidden.has(`show:${key}`) : !hidden.has(key);
    const kind = KIND_OF.get(key);
    if (shown && kind && isAddable(kind) && !kinds.includes(kind)) kinds.push(kind);
  }

  const widgets: Widget[] = [];
  for (const kind of kinds) {
    const w = newWidget(kind, makeId());
    if (w) widgets.push(w);
  }
  return { version: 1, widgets };
}

/** Whether the old settings show this pilot used the board before the grid. */
export function isReturningPilot(hidden: readonly string[], order: readonly string[]): boolean {
  return hidden.length > 0 || order.length > 0;
}
