/**
 * The Calendar page's event-type filter: an icon in the page toolbar that
 * opens a multi-select list of the eight clocks.
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
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui';
import { DropdownMenuTrigger } from '@/components/ui';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';
import { KIND_LABEL } from './calendarKindLabels';
import { KIND_TEXT } from '@/components/ui/kindTone';
import { KIND_ICON } from './calendarKindIcons';
import type { SkillPlanChoice } from './calendarSkillPlan';

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
  /** The Character's Skill Plans — one may be projected onto the board at a time. */
  skillPlanChoices: readonly SkillPlanChoice[];
  chosenSkillPlanId: string | null;
  /** Why the chosen plan could not be scheduled, or null. */
  skillPlanError: string | null;
  /** Picks a plan, or null to stop projecting one. */
  onChooseSkillPlan: (planId: string | null) => void;
}

function KindGlyph({ kind }: { kind: CharacterBoardItemKind }) {
  const Glyph = KIND_ICON[kind];
  return <Glyph aria-hidden="true" className={`size-4 shrink-0 ${KIND_TEXT[kind]}`} />;
}

export function CalendarKindFilterMenu({
  hidden,
  onToggle,
  onShowAll,
  counts,
  readableKinds,
  reauthKinds,
  skillPlanChoices,
  chosenSkillPlanId,
  skillPlanError,
  onChooseSkillPlan,
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
    if (kind === 'skillPlan' && !readable.has(kind)) {
      // Not an ESI read, so "unavailable" would blame the network. Say what is
      // actually missing: a choice, or a plan the scheduler could not cost.
      return t(skillPlanError === null ? 'calendar.skillPlan.choose' : 'calendar.skillPlan.error');
    }
    if (!readable.has(kind)) return t('calendar.filter.unavailable');
    return counts.get(kind) ?? 0;
  }

  /**
   * A kind with nothing coming up is not worth a row. Three cases stay: one
   * the pilot hid (the row is how they turn it back on — their choice is
   * remembered, so it must stay reachable), one that could not be read or
   * needs a scope (the row says why, and absence would hide that), and the
   * Skill plan row while no plan is chosen.
   */
  function hasRow(kind: CharacterBoardItemKind) {
    if (kind === 'moonChunk' && !readable.has(kind)) return false;
    if (hiddenSet.has(kind) || needsReauth.has(kind) || !readable.has(kind)) return true;
    return (counts.get(kind) ?? 0) > 0;
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
        <p className={cx(eyebrowClassName, 'px-2 py-1.5')}>{t('calendar.filter.title')}</p>
        {CHARACTER_BOARD_ITEM_KINDS.filter(
          // A moon-chunk source the Character was never allowed to ask about
          // gets no row, rather than an "Unavailable" hinting at corp access
          // they lack. Kinds with nothing due also drop out: see `hasRow`.
          hasRow
        ).map((kind) => (
          <DropdownMenuCheckboxItem
            key={kind}
            checked={!hiddenSet.has(kind)}
            // Without this the menu closes on the first toggle, which makes a
            // multi-select take one round trip per kind.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(kind)}
          >
            {/*
              The glyph in its hue makes this menu the legend for the icons and
              colours the rail, the map and the ticker draw — the one place a
              pilot learns that a mint planet means Planets. Decorative only:
              the label beside it already says the same thing (DESIGN.md §5, §7).
            */}
            <KindGlyph kind={kind} />
            <span className="flex-1">{t(KIND_LABEL[kind])}</span>
            <span className="ml-2 text-[0.6875rem] text-text-dim tabular-nums">
              {countLabel(kind)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        {/* One plan per Character, so a radio group in a submenu rather than a
            section of its own in the kinds list. Picking the chosen plan again
            stops projecting it (see `onValueChange`'s empty-string case). */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t('calendar.skillPlan.title')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {skillPlanChoices.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-text-dim">{t('calendar.skillPlan.none')}</p>
            ) : (
              <DropdownMenuRadioGroup
                value={chosenSkillPlanId ?? ''}
                onValueChange={(id) => onChooseSkillPlan(id === '' ? null : id)}
              >
                {skillPlanChoices.map((plan) => (
                  <DropdownMenuRadioItem
                    key={plan.id}
                    value={plan.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      if (plan.id === chosenSkillPlanId) onChooseSkillPlan(null);
                    }}
                  >
                    <span className="flex-1 truncate">{plan.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {skillPlanError !== null && (
          <p className="px-2 py-1.5 text-xs text-text-dim">
            {t('calendar.skillPlan.errorReason', { reason: skillPlanError })}
          </p>
        )}
        {/* A real menu item, not a raw button: Radix roving focus only visits
            registered items, so a plain button here is unreachable by keyboard
            (WCAG 2.1.1). `preventDefault` keeps the menu open, like the rows above. */}
        <DropdownMenuItem
          disabled={hidden.length === 0}
          onSelect={(event) => {
            event.preventDefault();
            onShowAll();
          }}
          className="mt-1 rounded-none border-t border-line touch:min-h-11"
        >
          {t('calendar.filter.showAll')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
