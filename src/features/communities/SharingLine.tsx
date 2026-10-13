import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui';
import type { ContentTab } from './communityTabs';
import type { SharingSummary } from './sharingSummary';

function blueprintsText(summary: SharingSummary, t: TFunction): string {
  if (summary.kind === 'all') return t('communities.sharing.blueprintsAll');
  if (summary.kind !== 'some') return t('communities.sharing.blueprintsNone');
  const picked = t('communities.sharing.blueprintCount', { count: summary.picked });
  const places = t('communities.sharing.placeCount', { count: summary.places });
  if (summary.picked > 0 && summary.places > 0) {
    return t('communities.sharing.blueprintsBoth', { picked, places });
  }
  return summary.picked > 0
    ? t('communities.sharing.blueprintsPicked', { picked })
    : t('communities.sharing.blueprintsPlaces', { places });
}

function itemsText(tab: 'fittings' | 'plans', summary: SharingSummary, t: TFunction): string {
  // Skill plans have no share-all; only Fittings reach 'all'.
  if (summary.kind === 'all') return t('communities.sharing.fittingsAll');
  if (summary.kind === 'count')
    return t(`communities.sharing.${tab}Count`, { count: summary.count });
  return t(`communities.sharing.${tab}None`);
}

/**
 * A content tab's line about what this Character shares there, with My
 * sharing, which opens the share controls for that tab. Until the summary is
 * known the line holds only the button, so it never says "nothing" too early.
 */
export function SharingLine({
  tab,
  summary,
  onOpen,
}: {
  tab: ContentTab;
  summary: SharingSummary | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const text =
    summary === null
      ? null
      : tab === 'blueprints'
        ? blueprintsText(summary, t)
        : itemsText(tab, summary, t);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-text-dim">{text}</p>
      <Button size="sm" aria-haspopup="dialog" onClick={onOpen}>
        {t('communities.sharing.open')}
      </Button>
    </div>
  );
}
