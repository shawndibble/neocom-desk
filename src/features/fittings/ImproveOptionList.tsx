/**
 * A section's swap rows: one row per fitted module with its best option, the
 * module's other options folded behind "N more options". Each row is a tick
 * box; hovering or focusing one previews it.
 */
import { Fragment, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, Checkbox, TypeIcon } from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { ImproveOption } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improveKeys';
import { groupByModule, type ImproveSort } from '@/engine/fittings/improveRows';
import type { FittingStats } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import {
  changeLine,
  iskLine,
  lostLine,
  shownChangeKeys,
  unshownLosses,
} from './improveChangeLines';
import { leadLine, type LeadContext } from './improveLeadLine';
import { m3sFormat } from './improveLineText';
import type { ImproveLabels } from './useImproveLabels';
import type { ImproveSelection } from './useImproveSelection';

interface Props {
  options: ImproveOption[];
  /** The fit as it is, which each row's figures are measured against. */
  own: FittingStats;
  /** Keeps the ids of two lists' rows apart. */
  section: string;
  sort: ImproveSort;
  labels: ImproveLabels;
  selection: ImproveSelection;
  lead: LeadContext;
  /** A quiet line for a row whose target group most community fits carry (#5581); null: none. */
  hintOf?: (candidate: ImproveOption['candidate']) => string | null;
}

export function ImproveOptionList({
  options,
  own,
  section,
  sort,
  labels,
  selection,
  lead,
  hintOf,
}: Props) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const { ticked, expanded, flip } = selection;

  return (
    <ul className="space-y-1">
      {groupByModule(options, sort).map((group, index) => {
        const all = [group.best, ...group.others];
        // A ticked alternative takes the row's place; the rest stay behind it.
        const shown = all.find((option) => ticked.has(optionKey(option))) ?? group.best;
        const rest = all.filter((option) => option !== shown);
        const groupKey = `${section}:${group.key}`;
        const isOpen = expanded.has(groupKey);
        const listId = `${idPrefix}-${section}-${index}`;
        return (
          <Fragment key={group.key}>
            <ImproveOptionRow
              key={optionKey(shown)}
              option={shown}
              own={own}
              section={section}
              labels={labels}
              selection={selection}
              lead={lead}
              hintOf={hintOf}
            />
            {rest.length > 0 && (
              <li className="pl-2">
                <button
                  type="button"
                  className={textActionClassName()}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  onClick={() => flip(groupKey)}
                >
                  {t('fittings.improve.moreOptions', { count: rest.length })}
                  <Caret expanded={isOpen} />
                </button>
                <Collapse open={isOpen} id={listId} className="pt-1">
                  <ul className="space-y-1">
                    {rest.map((option) => (
                      <ImproveOptionRow
                        key={optionKey(option)}
                        option={option}
                        own={own}
                        section={section}
                        labels={labels}
                        selection={selection}
                        lead={lead}
                        hintOf={hintOf}
                      />
                    ))}
                  </ul>
                </Collapse>
              </li>
            )}
          </Fragment>
        );
      })}
    </ul>
  );
}

interface RowProps {
  option: ImproveOption;
  own: FittingStats;
  section: string;
  labels: ImproveLabels;
  selection: ImproveSelection;
  lead: LeadContext;
  hintOf?: Props['hintOf'];
}

function ImproveOptionRow({
  option,
  own,
  section,
  labels,
  selection,
  lead: leadContext,
  hintOf,
}: RowProps) {
  const { t } = useTranslation();
  const { ticked, replaced, expanded, flip, toggle, setHover } = selection;
  const key = optionKey(option);
  const id = `improve-${section}-${key}`;
  const statsKey = `stats:${id}`;
  const lead = leadLine(t, leadContext, option, own);
  // The stats the row already prints, so Gives up names only the losses it does not.
  const shown = [
    ...(lead?.keys ?? []),
    ...shownChangeKeys(option, own, expanded.has(statsKey), lead?.keys),
  ];
  const hint =
    option.candidate.fixesUnflyable || option.candidate.conversion
      ? null
      : (hintOf?.(option.candidate) ?? null);
  return (
    <li
      className="border-line rounded-xs border p-2 text-sm"
      // A mouse hover or a keyboard focus previews it; touch has no hover, so only its tick does (§6c).
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(option)}
      // Leaving with the pointer keeps a keyboard-focused row previewed; moving focus between the row's own parts keeps it too.
      onPointerLeave={(event) =>
        !event.currentTarget.contains(
          document.activeElement?.matches(':focus-visible') ? document.activeElement : null
        ) && setHover(null)
      }
      onFocus={(event) => event.target.matches(':focus-visible') && setHover(option)}
      onBlur={(event) =>
        !event.currentTarget.contains(event.relatedTarget as Node | null) && setHover(null)
      }
    >
      <label
        htmlFor={id}
        className={cx('flex cursor-pointer items-start gap-2', tappableRowClassName)}
      >
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={ticked.has(key)}
          onChange={() => toggle(option)}
        />
        <TypeIcon typeId={option.candidate.toTypeId} size={32} width={24} height={24} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{labels.swapLabel(option)}</span>
            {leadContext.goal !== 'cheaper' && !option.candidate.fixesUnflyable && (
              <span className="text-success shrink-0 text-xs font-medium">
                {t('fittings.improve.gain', { percent: m3sFormat(option.score * 100) })}
              </span>
            )}
          </span>
          {option.candidate.fixesUnflyable && (
            <span className="text-warning block text-xs">{t('fittings.improve.unflyable')}</span>
          )}
          {option.candidate.fixesUnflyable && option.candidate.pairedWith && (
            <span className="block text-xs">
              {t(
                option.candidate.covers === 'capacitor'
                  ? 'fittings.improve.flyableWithCapacitor'
                  : 'fittings.improve.flyableWith',
                { swaps: labels.flyableSwaps(option.candidate).join('; ') }
              )}
            </span>
          )}
          {option.candidate.conversion && (
            <span className="text-text-dim block text-xs">
              {labels.conversionLine(option.candidate)}
            </span>
          )}
          {lead?.worded && <span className="block text-xs">{lead.worded}</span>}
          {hint && <span className="text-text-dim block text-xs">{hint}</span>}
          <span className="text-text-dim block text-xs">
            {changeLine(
              t,
              option,
              own,
              expanded.has(statsKey),
              () => flip(statsKey),
              lead?.keys,
              lead?.rows
            )}
          </span>
          {unshownLosses(option, shown).length > 0 && (
            <span className="text-warning block text-xs">
              <span className="block">{t('fittings.improve.givesUp')}</span>
              {lostLine(t, option, shown)}
            </span>
          )}
          <span className="block text-xs">{iskLine(t, option)}</span>
          {replaced.has(key) && ticked.has(key) && (
            <span className="text-text-dim block text-xs">
              {t('fittings.improve.replacesPick', { swap: replaced.get(key) })}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
