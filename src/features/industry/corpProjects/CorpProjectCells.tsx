import { useTranslation } from 'react-i18next';
import { IskDelta, ProgressBar, Tooltip } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { formatDuration } from '@/lib/duration';
import { formatIskCompact } from '@/lib/isk';
import type { CorpProjectRow } from './corpProjectRows';

/** Under two days left a project is about to close, so its time turns amber. */
export const ENDING_SOON_HOURS = 48;

export function EndsIn({ hours }: { hours: number | null }) {
  const { t } = useTranslation();
  if (hours === null)
    return <span className="text-text-dim">{t('industry.corpProjects.noEnd')}</span>;
  const text = formatDuration(hours * 3600);
  return hours < ENDING_SOON_HOURS ? <span className="text-warning">{text}</span> : <>{text}</>;
}

/** Where the blueprint comes from: Owned, a Community offer, the cheapest copy, or the amber assumption. */
export function BlueprintSourceCell({ row }: { row: CorpProjectRow }) {
  const { t } = useTranslation();
  const source = row.source;
  if (row.loading)
    return <span className="text-xs text-text-dim">{t('industry.corpProjects.pricing')}</span>;
  if (source === null)
    return <span className="text-xs text-text-dim">{t('industry.corpProjects.unpriced')}</span>;
  switch (source.kind) {
    case 'owned':
      return (
        <span className="flex flex-col items-start">
          <Pill tone="success">{t('industry.corpProjects.owned')}</Pill>
          <span className="mt-0.5 text-xs text-text-dim">
            {t(
              source.detail.original
                ? 'industry.corpProjects.ownedOriginal'
                : 'industry.corpProjects.ownedCopy',
              { me: source.detail.me, te: source.detail.te }
            )}
          </span>
        </span>
      );
    case 'community':
      return (
        <span className="flex flex-col items-start">
          <Pill>{t('industry.corpProjects.community')}</Pill>
          <span className="mt-0.5 text-xs text-text-dim">
            {t('industry.corpProjects.communityDetail', { member: source.memberName })}
          </span>
        </span>
      );
    case 'copy':
      return (
        <span className="flex flex-col items-start">
          <Pill>{t('industry.corpProjects.copy', { price: formatIskCompact(source.price) })}</Pill>
          <span className="mt-0.5 text-xs text-text-dim">
            {t('industry.corpProjects.copyDetail')}
          </span>
        </span>
      );
    case 'assumed':
      return (
        <span className="flex flex-col items-start">
          <Tooltip content={t('industry.corpProjects.assumedHint')}>
            <span className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-warning">
              <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
              {t('industry.corpProjects.assumed')}
            </span>
          </Tooltip>
          <span className="mt-0.5 text-xs text-text-dim">
            {t('industry.corpProjects.assumedDetail')}
          </span>
        </span>
      );
  }
}

/** Profit at the cap, or a plain word while the plan is still being priced. */
export function ProfitCell({ row }: { row: CorpProjectRow }) {
  const { t } = useTranslation();
  if (row.profit === null) {
    return (
      <span className="text-text-dim">
        {row.loading ? t('industry.corpProjects.pricing') : t('industry.corpProjects.unpriced')}
      </span>
    );
  }
  return <IskDelta amount={row.profit} decimals={0} />;
}

/** The working behind a row: the sum, the Character's share of the cap, and the pool. */
export function ProjectWorking({ row }: { row: CorpProjectRow }) {
  const { t } = useTranslation();
  const { project, remaining } = row;
  const copyPrice = row.source?.kind === 'copy' ? row.source.price : 0;
  return (
    <div className="grid gap-4 p-3 sm:grid-cols-3">
      <dl className="space-y-1 text-sm tabular-nums">
        <div className="flex justify-between gap-4">
          <dt className="text-text-dim">
            {t('industry.corpProjects.workingReward', { count: remaining })}
          </dt>
          <dd>{formatIskCompact(project.rewardEach * remaining)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-dim">
            {t('industry.corpProjects.workingCost', { count: remaining })}
          </dt>
          <dd>{row.unitCost === null ? '—' : `− ${formatIskCompact(row.unitCost * remaining)}`}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-dim">{t('industry.corpProjects.workingCopy')}</dt>
          <dd>{`− ${formatIskCompact(copyPrice)}`}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold">
          <dt>{t('industry.corpProjects.workingProfit')}</dt>
          <dd>
            <ProfitCell row={row} />
          </dd>
        </div>
      </dl>
      <div className="space-y-1 text-sm">
        <div className="text-text-dim">{t('industry.corpProjects.shareOfCap')}</div>
        <ProgressBar
          label={t('industry.corpProjects.shareOfCap')}
          value={remaining}
          max={Math.max(project.cap, 1)}
          size="sm"
          className="w-full"
        />
        <div className="text-xs text-text-dim">
          {t('industry.corpProjects.unitsLeft', { left: remaining, cap: project.cap })}
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <div className="text-text-dim">{t('industry.corpProjects.poolLeft')}</div>
        <ProgressBar
          label={t('industry.corpProjects.poolLeft')}
          value={project.poolRemaining}
          max={Math.max(project.poolInitial, 1)}
          size="sm"
          className="w-full"
        />
        <div className="text-xs text-text-dim">
          {t('industry.corpProjects.poolOf', {
            left: formatIskCompact(project.poolRemaining),
            total: formatIskCompact(project.poolInitial),
          })}
          {' · '}
          {project.name}
        </div>
      </div>
    </div>
  );
}
