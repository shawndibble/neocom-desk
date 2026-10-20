/** "Your set" strip of the implant finder: every implant and booster slot, and the helpers that read a slot. */
import { useState, type CSSProperties, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, IconButton, Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { ImplantKind, SlotOf } from '@/engine/fittings/implantFinder';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { SectionHeading } from './implantFinderBits';
import { occupantOf, slotName } from './implantSlots';
import { slotKey } from './useImplantFinder';

const IMPLANT_SLOTS = Array.from({ length: 10 }, (_, i) => i + 1);
/** Booster slots the strip shows at least; more when the set already fills a higher one. */
const MIN_BOOSTER_SLOTS = 3;

/**
 * "Your set": slots 1–10 and the booster slots, marking the ones that can help
 * the chosen goal. Each slot is a button: picking one narrows the goals and
 * results to what goes in it.
 */
export function SetStrip({
  set,
  slotOf,
  names,
  helpfulSlots,
  goalLabel,
  selected,
  onSelect,
  onRemove,
}: {
  set: FittingImplantSet;
  slotOf: SlotOf;
  names: Map<number, { full: string; short: string }>;
  helpfulSlots: Set<string>;
  goalLabel: string | null;
  selected: string | null;
  onSelect: (key: string) => void;
  onRemove: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const boosterSlots = Array.from(
    { length: Math.max(MIN_BOOSTER_SLOTS, ...set.boosters.map((id) => slotOf(id)?.slot ?? 0)) },
    (_, i) => i + 1
  );
  const cells = [
    ...IMPLANT_SLOTS.map((slot) => ({ kind: 'implant' as const, slot })),
    ...boosterSlots.map((slot) => ({ kind: 'booster' as const, slot })),
  ];
  const filled = cells.filter((c) => occupantOf(set, slotOf, c.kind, c.slot) !== undefined).length;

  const cell = ({ kind, slot }: { kind: ImplantKind; slot: number }) => {
    const key = slotKey(kind, slot);
    const id = occupantOf(set, slotOf, kind, slot);
    const helps = helpfulSlots.has(key);
    const picked = selected === key;
    const name = id === undefined ? undefined : names.get(id);
    const label = slotName(t, kind, slot);
    // The short name truncates; the full one is a tooltip (hold on touch).
    const withLabel = (button: ReactElement<{ className?: string }>) =>
      name === undefined ? button : <Tooltip content={name.full}>{button}</Tooltip>;
    return (
      <li key={key} className="relative min-w-0">
        {withLabel(
          <button
            type="button"
            aria-pressed={picked}
            aria-label={t('fittings.implantFinder.pickSlot', {
              slot: label,
              item: name?.full ?? (id === undefined ? t('fittings.implantFinder.empty') : `#${id}`),
            })}
            onClick={() => onSelect(key)}
            className={cx(
              'flex min-h-11 w-full min-w-0 flex-col justify-between rounded-xs border px-1.5 py-1 text-left md:min-h-0',
              interactiveClassName,
              focusRingClassName,
              picked
                ? 'border-accent bg-panel-2 ring-1 ring-accent'
                : helps
                  ? 'border-dashed border-accent bg-accent/10 hover:bg-accent/20 active:bg-accent/28'
                  : 'border-line bg-panel-2 hover:border-line-bright active:bg-panel'
            )}
          >
            <span
              className={cx(
                'text-[0.625rem] tracking-wider uppercase',
                picked ? 'text-accent' : 'text-text-dim',
                id !== undefined && 'pr-5'
              )}
            >
              {label}
            </span>
            {id === undefined ? (
              <span className="text-xs text-text-dim">{t('fittings.implantFinder.empty')}</span>
            ) : (
              <span className="truncate text-xs font-semibold">{name?.short ?? `#${id}`}</span>
            )}
          </button>
        )}
        {id !== undefined && (
          <span className="absolute top-0.5 right-0.5">
            <IconButton
              variant="plain"
              size="row"
              icon={<Icon.Close />}
              label={t('fittings.implantFinder.removeItem', { name: name?.full ?? id })}
              onClick={() => onRemove(id)}
            />
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 rounded-xs text-left md:hidden',
          interactiveClassName,
          focusRingClassName
        )}
      >
        <Caret expanded={expanded} />
        <SectionHeading>{t('fittings.implantFinder.yourSet')}</SectionHeading>
        <span className="flex flex-1 gap-0.5" aria-hidden>
          {cells.map((c) => (
            <span
              key={slotKey(c.kind, c.slot)}
              className={cx(
                'size-2',
                occupantOf(set, slotOf, c.kind, c.slot) !== undefined
                  ? 'bg-accent'
                  : 'border border-line-bright'
              )}
            />
          ))}
        </span>
        <span className="text-xs text-text-dim tabular-nums">
          {t('fittings.implantFinder.setCount', { filled, total: cells.length })}
        </span>
      </button>
      <div className={cx('space-y-1', !expanded && 'hidden md:block')}>
        <div className="hidden items-baseline gap-2 md:flex">
          <SectionHeading>{t('fittings.implantFinder.yourSet')}</SectionHeading>
          <span className="text-xs text-text-dim">
            {goalLabel && helpfulSlots.size > 0
              ? t('fittings.implantFinder.helpfulSlots', { goal: goalLabel })
              : t('fittings.implantFinder.slotHint')}
          </span>
        </div>
        <ul
          style={{ '--booster-slots': boosterSlots.length } as CSSProperties}
          className="grid grid-cols-5 gap-1 md:grid-cols-[repeat(10,minmax(0,1fr))_0.5rem_repeat(var(--booster-slots),minmax(0,1fr))]"
        >
          {cells.slice(0, 10).map(cell)}
          <li aria-hidden className="hidden md:block" />
          {cells.slice(10).map(cell)}
        </ul>
      </div>
    </div>
  );
}
