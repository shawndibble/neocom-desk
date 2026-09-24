import { useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useTranslation } from 'react-i18next';
import { Button, Modal, PageHeader } from '@/components/ui';
import { FittingLoadCard } from '@/features/fittings/FittingLoadCard';
import { FittingRackList } from '@/features/fittings/FittingRackList';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { FittingViewToggle } from '@/features/fittings/FittingViewToggle';
import {
  resolveFittingView,
  useFittingViewPreference,
} from '@/features/fittings/fittingViewPreference';
import { MissingSkillsChip } from '@/features/fittings/MissingSkillsChip';
import { useFittingSkillGaps } from '@/features/fittings/useFittingSkillGaps';
import { useFittingWorkspace } from '@/features/fittings/useFittingWorkspace';
import { useIsPhone } from '@/lib/useIsPhone';

/**
 * The Fittings section: paste EFT to Load a Fitting, then a Ring or List view
 * of what's fitted beside the game's own collapsible stat sections. The
 * Ring | List choice is device-local (default Ring, List on a phone); on a
 * phone the Ring's stats live in a bottom sheet. Editing (#1533), implants
 * (#1535) and everything else the scope decision lists land in their own
 * tickets.
 */
export function Fittings() {
  const { t } = useTranslation();
  const workspace = useFittingWorkspace();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const gaps = useFittingSkillGaps(workspace.fitting, activeCharacterId);

  const isPhone = useIsPhone();
  const storedView = useFittingViewPreference((state) => state.value);
  const viewHydrated = useFittingViewPreference((state) => state.hydrated);
  const hydrateView = useFittingViewPreference((state) => state.hydrate);
  const setView = useFittingViewPreference((state) => state.setValue);
  useEffect(() => {
    void hydrateView();
  }, [hydrateView]);
  const view = resolveFittingView(storedView, isPhone);
  const [statsOpen, setStatsOpen] = useState(false);

  const statsSections = workspace.fitting && (
    <FittingStatsSections
      stats={workspace.stats}
      statsProgress={workspace.statsProgress}
      statsError={workspace.statsError}
      price={workspace.price}
    />
  );
  const statsInSheet = view === 'ring' && isPhone;

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('nav.fittings')}
        actions={
          workspace.fitting && viewHydrated ? (
            <FittingViewToggle value={view} onChange={(next) => void setView(next)} />
          ) : undefined
        }
      />
      <FittingLoadCard
        onLoad={workspace.loadFromEftText}
        unresolved={workspace.unresolved}
        shareError={workspace.shareError}
        tooLargeToShare={workspace.tooLargeToShare}
      />
      {workspace.fitting && viewHydrated && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            {gaps && gaps.missing.length > 0 && activeCharacterId !== null && (
              <MissingSkillsChip
                entries={gaps.missing}
                characterId={activeCharacterId}
                fittingName={workspace.fitting.name}
              />
            )}
            {view === 'ring' ? (
              <FittingRing
                fitting={workspace.fitting}
                stats={workspace.stats}
                unusableModuleKeys={gaps?.unusableModuleKeys}
              />
            ) : (
              <FittingRackList
                fitting={workspace.fitting}
                stats={workspace.stats}
                unusableModuleKeys={gaps?.unusableModuleKeys}
              />
            )}
            {statsInSheet && (
              <Button className="min-h-11 w-full" onClick={() => setStatsOpen(true)}>
                {t('fittings.ring.openStats')}
              </Button>
            )}
          </div>
          {!statsInSheet && statsSections}
        </div>
      )}
      {statsInSheet && (
        <Modal
          open={statsOpen}
          onClose={() => setStatsOpen(false)}
          title={t('fittings.ring.openStats')}
          placement="sheet"
        >
          {statsSections}
        </Modal>
      )}
    </div>
  );
}
