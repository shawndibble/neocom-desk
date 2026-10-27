import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { controlHeightClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { PRIORITY_ORDER } from '@/engine/skills/planPriority';
import type { PlanPriority } from '@/engine/types';
import type { AttributePair } from '../attributePairBands';
import { TIME_CELL, attributePairLabel, priorityLabelKey } from './rowChrome';

type AttributePairBadgeProps = AttributePair;

/** A skill's primary/secondary attribute pair, toggleable via the "Columns" control (#114). */
export function AttributePairBadge({ primary, secondary }: AttributePairBadgeProps) {
  const { t } = useTranslation();
  const label = attributePairLabel(primary, secondary);
  return (
    <span className="px-1 text-[0.6875rem] tracking-widest text-text-dim uppercase">
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">
        {t('plans.attributePairFull', {
          primary: t(`skills.attr.${primary}`),
          secondary: t(`skills.attr.${secondary}`),
        })}
      </span>
    </span>
  );
}

interface TimeCellProps {
  /** Already-formatted duration or date — this cell only places it. */
  value: string;
  /** PrereqRow's dimmed/italic `<li>` already colors its text; EntryRow's doesn't, so its cell dims itself. */
  dim?: boolean;
  /** Desktop columns are fixed-width so they line up under their headers; the narrow meta line packs its values inline instead. */
  fixedWidth?: boolean;
  /** "Takes" or "Done by" — the desktop column header is visual only, so `sr-only` (`CorpBoardRow`'s pattern) gives the cell its own accessible name without changing what's on screen. */
  label?: string;
}

/** One training-time value: a duration ("Takes") or a finish date ("Done by"). */
export function TimeCell({ value, dim = false, fixedWidth = true, label }: TimeCellProps) {
  return (
    <span
      className={`${fixedWidth ? TIME_CELL : 'shrink-0 whitespace-nowrap'} tabular-nums ${
        dim ? 'text-text-dim' : ''
      }`}
    >
      {label && <span className="sr-only">{label}: </span>}
      {value}
    </span>
  );
}

/**
 * A labelled value on the narrow layout's meta line. Below `md` the desktop
 * column headers are gone, so each number carries its own label rather than
 * hiding behind a tooltip the user has to discover (#114 shipped cumulative
 * time that way, and it read as an unexplained second duration).
 */
export function MetaValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-text-dim">{label}</span> {value}
    </span>
  );
}

/**
 * Priority pill tones — hierarchy by text weight/style, not color alone;
 * status colors carry meaning here (docs/DESIGN.md §6). `low` is italic
 * rather than `text-faint`, which is below AA (issue #1491) and would also
 * have made `low` and `normal` identical, since both use `border-line`.
 */
const PRIORITY_TONE: Record<PlanPriority, string> = {
  high: 'border-line-bright text-text',
  normal: 'border-line text-text-dim',
  low: 'border-line text-text-dim italic',
};

interface PriorityPillProps {
  skillTypeID: number;
  /** The row's full label (name and level), so two levels of one skill get distinct names. */
  name: string;
  priority: PlanPriority;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  /**
   * Pad the trigger out to the `sm` touch tier without resizing the chip
   * (#1106). Set only from the mobile meta line; the desktop row leaves it
   * off so the pill keeps sitting flush with the `sm` controls beside it.
   */
  touchTarget?: boolean;
}

/**
 * An entry's priority (#27) as a menu behind a pill the size of the attribute
 * badge beside it. Was a `NativeSelect`, whose native chrome made it the widest
 * thing in the row by a distance and pushed every column after it out of line.
 *
 * The chip lives in a span inside the trigger rather than on the trigger
 * itself, so `touchTarget` can grow the *button* to the `sm` touch tier on a
 * phone (#1106) while the chip stays the width and height of the attribute
 * badge next to it. Hover and focus are driven off the button through `group`
 * so both still draw on the chip, not on the padded box around it.
 */
export function PriorityPill({
  skillTypeID,
  name,
  priority,
  onSetPriority,
  touchTarget = false,
}: PriorityPillProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('plans.priorityLabel', { priority: t(priorityLabelKey(priority)), name })}
          className={`group inline-flex items-center lg:scroll-mt-40 ${touchTarget ? controlHeightClassName.sm : ''}`}
        >
          <span
            className={`${interactiveClassName} rounded-xs border px-1 text-[0.6875rem] tracking-widest uppercase group-hover:border-line-bright group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-accent ${PRIORITY_TONE[priority]}`}
          >
            {t(priorityLabelKey(priority))}
            <Icon.Expanded
              size="0.75rem"
              aria-hidden="true"
              className="ml-0.5 inline-block align-[-0.125em]"
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PRIORITY_ORDER.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onSetPriority(skillTypeID, option)}>
            {t(priorityLabelKey(option))}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
