/**
 * The Kind Cards: one card per kind of clock, each showing its most urgent few
 * (issue #566).
 *
 * The old overview merged every clock into one ordered list, which answered
 * "what is next" perfectly and "what is my fuel situation" not at all — you had
 * to read past the moon drills to find out. These cards answer the second
 * question, and the Deadline Strip above them answers the first.
 *
 * **The ranking is still `board.ts`'s and only `board.ts`'s.** Cards are fed by
 * `groupBoardByKind`, which filters and never re-sorts, and each row is
 * `CorpBoardRow` itself rather than a second rendering of a countdown. Nothing
 * in here decides urgency.
 *
 * **A card is gated on the capability that opens its own source.** "Read fine,
 * nothing due" earns an empty state; "cannot read" earns no card. Collapsing
 * the two would put "No moon chunks" in front of a Character who was never
 * allowed to ask (AC3).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel } from '@/components/ui';
import {
  disabledClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import { cx } from '@/lib/cx';
import type { CorpBoardItem, CorpBoardItemKind } from '@/engine/corp/board';
import type { CorpCapabilities, CorpCapability } from '@/engine/corpRoles';
import { CorpBoardRow } from './CorpBoardRow';

/**
 * How many rows a card shows before it starts counting instead.
 *
 * Three, because the card's job is "is this kind healthy", and the fourth row
 * has never changed that answer. The footer button expands the card to every row, so the card
 * never implies it is showing everything.
 */
const ROWS_PER_CARD = 3;

/**
 * The four timed kinds, in the order they read across the row.
 *
 * `serviceOffline` is deliberately absent: it is `timing: 'untimed'`, so it has
 * no clock to take a "most urgent three" from and no day to land on in the
 * strip. It gets its own surface (`CorpOfflineServices`) rather than a card
 * whose ordering would be meaningless.
 */
const CARD_KINDS = [
  'structureFuel',
  'structureTimer',
  'moonExtraction',
  'jobDelivery',
] as const satisfies readonly CorpBoardItemKind[];

/**
 * The kinds that get a card, as a type.
 *
 * The three maps below are keyed on this rather than on the whole
 * `CorpBoardItemKind` union, so `serviceOffline` cannot carry a card title or a
 * card empty state it will never render — and a *new* card kind is still a
 * compile error in all three.
 */
type CorpCardKind = (typeof CARD_KINDS)[number];

/** Which capability opens each kind's own ESI read (`engine/corpRoles.ts`). */
const CAPABILITY_FOR_KIND: Readonly<Record<CorpCardKind, CorpCapability>> = {
  structureFuel: 'canReadStructures',
  structureTimer: 'canReadStructures',
  moonExtraction: 'canReadMoonExtractions',
  jobDelivery: 'canReadIndustry',
};

const TITLE_FOR_KIND: Readonly<Record<CorpCardKind, string>> = {
  structureFuel: 'corp.cards.fuel',
  structureTimer: 'corp.cards.timers',
  moonExtraction: 'corp.cards.moons',
  jobDelivery: 'corp.cards.jobs',
};

const EMPTY_FOR_KIND: Readonly<Record<CorpCardKind, string>> = {
  structureFuel: 'corp.cards.fuelEmpty',
  structureTimer: 'corp.cards.timersEmpty',
  moonExtraction: 'corp.cards.moonsEmpty',
  jobDelivery: 'corp.cards.jobsEmpty',
};

interface CorpKindCardsProps {
  grouped: ReadonlyMap<CorpBoardItemKind, CorpBoardItem[]>;
  capabilities: CorpCapabilities;
}

function KindCard({ kind, items }: { kind: CorpCardKind; items: readonly CorpBoardItem[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, ROWS_PER_CARD);
  const hidden = items.length - ROWS_PER_CARD;
  const critical = items.filter((item) => item.severity === 'critical').length;

  return (
    <Panel
      title={t(TITLE_FOR_KIND[kind])}
      padded={false}
      // `min-w-0`: a grid item's default `min-width` is its content's intrinsic
      // width, so without this an unbroken structure name inside the row's
      // `truncate` widens the whole track instead of being clipped (issue #419).
      className="min-w-0"
      meta={
        critical > 0 || hidden > 0 ? (
          <span className="flex items-center gap-2 text-[0.6875rem] tabular-nums">
            {critical > 0 && (
              <span className="font-semibold tracking-widest text-danger uppercase">
                {t('corp.cards.criticalCount', { count: critical })}
              </span>
            )}
            {/* The total, only when rows are hidden: "there are more" without scrolling to the footer. */}
            {hidden > 0 && <span className="text-text-dim">{items.length}</span>}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState title={t(EMPTY_FOR_KIND[kind])} />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {shown.map((item) => (
              <CorpBoardRow key={item.id} item={item} />
            ))}
          </ul>
          {/*
            Only when the card is over the cap. The rows are already in
            severity order, so expanding in place shows the rest in the same
            order with the same row component (issue #2857).
          */}
          {hidden > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              // `textActionClassName`'s recipe, minus its 11px caps: normal-case
              // `text-xs` so it reads as an action under `text-sm` rows.
              className={cx(
                'flex min-h-11 w-full items-center gap-1.5 rounded-xs border-t border-line px-3 py-2 text-left text-xs font-semibold text-accent tabular-nums hover:underline active:text-accent/75 md:min-h-0',
                interactiveClassName,
                focusRingClassName,
                disabledClassName
              )}
            >
              <Caret expanded={expanded} />
              {expanded ? t('corp.cards.showFewer') : t('corp.cards.showMore', { count: hidden })}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

export function CorpKindCards({ grouped, capabilities }: CorpKindCardsProps) {
  const readable = CARD_KINDS.filter((kind) => capabilities[CAPABILITY_FOR_KIND[kind]]);
  if (readable.length === 0) return null;

  return (
    // One column on a phone, two on a tablet, all four across from `xl`. Four
    // cards in the 1776px content width of a 2000px viewport is ~432px each,
    // which is where the row's `truncate` stops being reached by the structure
    // names this corp actually has.
    //
    // `items-start` so each card is its own height. Stretched to match its
    // tallest neighbour, a card holding one job would carry ~180px of air —
    // which is the thing this rework exists to remove (DESIGN.md: density over
    // whitespace).
    <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {readable.map((kind) => (
        <KindCard key={kind} kind={kind} items={grouped.get(kind) ?? []} />
      ))}
    </div>
  );
}
