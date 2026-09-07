/**
 * The Calendar page's event-type filter: an icon in the page toolbar that
 * opens a multi-select list of the six clocks.
 *
 * **In `PageHeader` `actions`, not in a `FilterBar` row.** The mobile-filter
 * decision puts a page's filters behind a funnel *beside its search box* below
 * `md`, and lists Calendar as unconverted. This page has no search box and no
 * filter row at all — its two panes spend the whole width — so a `FilterBar`
 * would put a lone funnel in an otherwise empty strip above them. The header's
 * action cluster is where this page's controls already live (export, refresh),
 * and Market's own selects set the precedent for a page toolbar carrying
 * controls rather than a filter row.
 *
 * **A `DropdownMenu` at every width.** Six checkbox rows are a menu, not a
 * form: there is no draft to apply and nothing to cancel, so the sheet's
 * Apply/Cancel semantics would be ceremony over a control whose every toggle is
 * already reversible in one tap. `MoonMiningTax` does the same thing with the
 * same primitive.
 *
 * The trigger states how many types are hidden **as a number**, not as an
 * accent tint — "this list is filtered" may not be carried by colour alone.
 *
 * Each row carries its kind's swatch, which makes this menu double as the
 * legend for the colour the rest of the page paints (`components/ui/kindTone.ts`).
 * That is deliberate: the hues are picked *here*, so the place they are picked
 * is the place to learn them.
 */
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent } from '@/components/ui';
import { DropdownMenuTrigger } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { controlHeightClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';
import { KIND_LABEL } from './calendarKindLabels';
import { KIND_FILL } from '@/components/ui/kindTone';

export interface CalendarKindFilterMenuProps {
  hidden: readonly CharacterBoardItemKind[];
  onToggle: (kind: CharacterBoardItemKind) => void;
  onShowAll: () => void;
  /** How many of each kind the board holds. A kind that read fine with none due is absent. */
  counts: Map<CharacterBoardItemKind, number>;
  /**
   * Kinds whose source was read at all. A kind that is readable and absent
   * from `counts` genuinely has nothing due; one that is not readable has no
   * answer to give, and must not borrow a zero from the first case.
   */
  readableKinds: readonly CharacterBoardItemKind[];
  /** Kinds whose read came back 401/403 — named as such rather than shown as a zero. */
  reauthKinds: readonly CharacterBoardItemKind[];
}

export function CalendarKindFilterMenu({
  hidden,
  onToggle,
  onShowAll,
  counts,
  readableKinds,
  reauthKinds,
}: CalendarKindFilterMenuProps) {
  const { t } = useTranslation();
  const hiddenSet = new Set(hidden);
  const readable = new Set(readableKinds);
  const needsReauth = new Set(reauthKinds);

  /**
   * Three answers, in order of how much they explain: a scope to grant, a read
   * that did not land, or a real count. "Not granted" and "none due" must never
   * look alike — a confident 0 next to an endpoint the Character was never
   * allowed to ask about is a lie about their data.
   */
  function countLabel(kind: CharacterBoardItemKind) {
    if (needsReauth.has(kind)) return t('calendar.filter.notGranted');
    if (!readable.has(kind)) return t('calendar.filter.unavailable');
    return counts.get(kind) ?? 0;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.Filter />}
          label={
            hidden.length === 0
              ? t('calendar.filter.open')
              : t('calendar.filter.openWithCount', { count: hidden.length })
          }
          pressed={hidden.length > 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <p className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('calendar.filter.title')}
        </p>
        {CHARACTER_BOARD_ITEM_KINDS.map((kind) => (
          <DropdownMenuCheckboxItem
            key={kind}
            checked={!hiddenSet.has(kind)}
            // Without this the menu closes on the first toggle, which makes a
            // multi-select take one round trip per kind.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(kind)}
          >
            {/*
              The swatch makes this menu the legend for the six hues the rail,
              the map and the ticker paint — the one place a pilot can learn
              that mint means Planets. Decorative only: the label it sits
              beside already says the same thing (DESIGN.md §5, §7).
            */}
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${KIND_FILL[kind]}`}
            />
            <span className="flex-1">{t(KIND_LABEL[kind])}</span>
            <span className="ml-2 text-[0.6875rem] text-text-dim tabular-nums">
              {countLabel(kind)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {/* `controlHeightClassName.md` rather than ad-hoc padding: a touch
            viewport gets 44px here like every other control (DESIGN.md §3). */}
        <button
          type="button"
          onClick={onShowAll}
          disabled={hidden.length === 0}
          className={`mt-1 flex w-full items-center border-t border-line px-2 text-left text-[0.6875rem] font-semibold tracking-widest text-accent uppercase disabled:text-text-faint ${controlHeightClassName.md}`}
        >
          {t('calendar.filter.showAll')}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
