import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { Fitting } from '@/engine/fittings/types';
import { STAT_EYEBROW_TYPE } from '../statKit';
import { useSectionPreviewed } from '../statPreviewChanges';
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
  /** The headline figure, on the row itself. */
  meta: ReactNode;
  /** Shown on the row itself, so a warning inside a collapsed section isn't missed. */
  warning?: string;
  /** Which section: a previewed change inside it puts a dot on the row, so a shut section doesn't hide it. */
  id: Section;
  expanded: boolean;
  onToggle: () => void;
  /** `h4` under a column group label; `h3` in a side panel, under its title. */
  level: 'h3' | 'h4';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const previewed = useSectionPreviewed(id);
  return (
    <section className="border-b border-line last:border-b-0">
      {/* Every section's row looks alike, open or shut: its small-caps title, the headline figure beside. Hover fills it `panel-2`, so it rests unfilled. */}
      <div className={cx('flex items-center gap-2 pr-3', rowInteractiveClassName)}>
        <Heading className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className={cx(
              'flex min-h-11 w-full items-center gap-2 pl-3 text-left text-xs font-semibold tracking-widest uppercase md:min-h-9',
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
        {/* Status text, never boxed: a box would read as a control (DESIGN.md §6). */}
        {warning && <span className={`shrink-0 text-warning ${STAT_EYEBROW_TYPE}`}>{warning}</span>}
        {meta && <span className="shrink-0 text-sm font-semibold tabular-nums">{meta}</span>}
      </div>
      {expanded && <div className="space-y-3 p-3 text-xs">{children}</div>}
    </section>
  );
}

/** The "Your Characters" row: the headline shows closed too; gaps are only worked out while open. */
export function YourCharactersSection({
  fitting,
  characters,
  expanded,
  render,
}: {
  fitting: Fitting;
  characters: readonly GapCharacter[];
  expanded: boolean;
  render: (meta: ReactNode, body: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const { rows, headline } = useCharacterGaps(fitting, characters, expanded);
  return render(
    headline ? t('fittings.yourCharacters.headline', headline) : undefined,
    <FittingYourCharactersPanel rows={rows} />
  );
}
