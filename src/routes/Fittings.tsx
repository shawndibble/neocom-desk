import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { FittingLoadCard } from '@/features/fittings/FittingLoadCard';
import { FittingRackList } from '@/features/fittings/FittingRackList';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';

/**
 * The Fittings section's tracer slice (issue #1532): paste EFT to Load a
 * Fitting, a List view of what's fitted, and the game's own collapsible stat
 * sections. Editing (#1533), the Ring view (#1536), implants (#1535) and
 * everything else the scope decision lists land in their own tickets.
 */
export function Fittings() {
  const { t } = useTranslation();
  const workspace = useFittingWorkspace();

  return (
    <div className="space-y-3">
      <PageHeader title={t('nav.fittings')} />
      <FittingLoadCard
        onLoad={workspace.loadFromEftText}
        unresolved={workspace.unresolved}
        shareError={workspace.shareError}
        tooLargeToShare={workspace.tooLargeToShare}
      />
      {workspace.fitting && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FittingRackList fitting={workspace.fitting} stats={workspace.stats} />
          <FittingStatsSections
            stats={workspace.stats}
            statsProgress={workspace.statsProgress}
            statsError={workspace.statsError}
            price={workspace.price}
          />
        </div>
      )}
    </div>
  );
}
