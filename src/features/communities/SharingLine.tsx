import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { BlueprintSharing, TabSharing } from './sharingSummary';
import { NeedsConnection, Button } from '@/components/ui';

function blueprintsText(summary: BlueprintSharing, t: TFunction): string {
  if (summary.kind === 'all') return t('communities.sharing.blueprintsAll');
  if (summary.kind === 'none') return t('communities.sharing.blueprintsNone');
  const picked = t('communities.sharing.blueprintCount', { count: summary.picked });
  const places = t('communities.sharing.placeCount', { count: summary.places });
  if (summary.picked > 0 && summary.places > 0) {
    return t('communities.sharing.blueprintsBoth', { picked, places });
  }
  return summary.picked > 0
    ? t('communities.sharing.blueprintsPicked', { picked })
    : t('communities.sharing.blueprintsPlaces', { places });
}

function sharingText(sharing: TabSharing, t: TFunction): string {
  if (sharing.tab === 'blueprints') return blueprintsText(sharing.summary, t);
  const { tab, summary } = sharing;
  if (summary.kind === 'all') return t('communities.sharing.fittingsAll');
  if (summary.kind === 'count') {
    return t(`communities.sharing.${tab}Count`, { count: summary.count });
  }
  return t(`communities.sharing.${tab}None`);
}

/**
 * A content tab's line about what this Character shares there, with My
 * sharing, which opens the share controls for that tab. Until the summary is
 * known the line holds only the button, so it never says "nothing" too early.
 */
export function SharingLine({
  sharing,
  open,
  onOpen,
}: {
  sharing: TabSharing | null;
  /** My sharing is showing (a non-modal panel, so the button says so). */
  open: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-text-dim">
        {sharing === null ? null : sharingText(sharing, t)}
      </p>
      <NeedsConnection>
        <Button size="sm" aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}>
          {t('communities.sharing.open')}
        </Button>
      </NeedsConnection>
    </div>
  );
}
