import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { Fitting } from '@/engine/fittings/types';
import { STAT_EYEBROW_TYPE } from '../statKit';
import { useSectionPreviewed } from '../statPreviewContext';
import type { Section } from './sectionIds';
import { FittingYourCharactersPanel } from '../FittingYourCharactersPanel';
import { useCharacterGaps, type GapCharacter } from '../useCharacterGaps';

export function StatSection({
  title,
  meta,
  warning,
  id,
  expanded,
  onToggle,
  level: Heading,
  children,
}: {
  title: string;
  meta: ReactNode;
  warning?: string;
  id: Section;
  expanded: boolean;
  onToggle: () => void;
  level: 'h3' | 'h4';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const previewed = useSectionPreviewed(id);
  return (
    <section className="border-b border-line last:border-b-0">
      <div className={cx('flex items-center gap-2 pr-3', rowInteractiveClassName)}>
        <Heading className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className={cx(
              'flex min-h-9 w-full items-center gap-2 pl-3 text-left text-xs font-semibold tracking-widest uppercase',
              focusRingInsetClassName
            )}
          >
            <Caret expanded={expanded} />
            {title}
            {previewed && (
              <>
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="sr-only">{`, ${t('fittings.stats.previewedChange')}`}</span>
              </>
            )}
          </button>
        </Heading>
        {warning && <span className={`shrink-0 text-warning ${STAT_EYEBROW_TYPE}`}>{warning}</span>}
        {meta && <span className="shrink-0 text-sm font-semibold tabular-nums">{meta}</span>}
      </div>
      {expanded && <div className="space-y-3 p-3 text-xs">{children}</div>}
    </section>
  );
}

export function PanelSection({
  title,
  meta,
  id,
  children,
}: {
  title: string;
  meta?: ReactNode;
  id: Section;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const previewed = useSectionPreviewed(id);
  return (
    <section className="border-b border-line last:border-b-0">
      <div className="flex min-h-9 items-center gap-2 px-3">
        <h3 className={cx('min-w-0 flex-1', STAT_EYEBROW_TYPE, 'font-semibold uppercase')}>
          {title}
          {previewed && (
            <>
              <span
                aria-hidden="true"
                className="ml-2 inline-block size-1.5 rounded-full bg-accent align-middle"
              />
              <span className="sr-only">{`, ${t('fittings.stats.previewedChange')}`}</span>
            </>
          )}
        </h3>
        {meta && <span className="shrink-0 text-sm font-semibold tabular-nums">{meta}</span>}
      </div>
      <div className="space-y-3 px-3 pt-1 pb-3 text-xs">{children}</div>
    </section>
  );
}

export function YourCharactersSection({
  fitting,
  characters,
  render,
}: {
  fitting: Fitting;
  characters: readonly GapCharacter[];
  render: (meta: ReactNode, body: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const { rows, headline } = useCharacterGaps(fitting, characters, true);
  return render(
    headline ? t('fittings.yourCharacters.headline', headline) : undefined,
    <FittingYourCharactersPanel rows={rows} />
  );
}
