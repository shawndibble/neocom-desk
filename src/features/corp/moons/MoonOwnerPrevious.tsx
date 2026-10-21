import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { dismissFeederHistory } from '../taxBook/feederViewClient';
import { isDismissed, pageState } from '../taxBook/feederViewModel';
import { HandledByCard } from './HandledByCard';
import { MoonOwnerView } from './MoonOwnerView';
import { useFeederView } from './useFeederView';

/**
 * After leaving: "Previously handled by <accounting corporation>" above the
 * `children` (the own-book / paste-an-invite choice), the history below. When
 * there is nothing to show (never handled, dismissed, or the view cannot be
 * read) it renders only the `children`. `collectorCorporationId` names one accounting
 * corporation it left (#4621); absent, the last one.
 */
export function MoonOwnerPrevious({
  characterId,
  corporationId,
  collectorCorporationId,
  children,
}: {
  characterId: number;
  corporationId: number;
  collectorCorporationId?: number;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { load, reload } = useFeederView(characterId, corporationId, collectorCorporationId);
  if (load.state !== 'ready' || load.view === null) return <>{children}</>;
  const { view, access } = load;
  if (pageState(view.summary) !== 'ended' || isDismissed(view.summary)) return <>{children}</>;
  const name = view.summary.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  return (
    <MoonOwnerView
      view={view}
      names={load.names}
      canEdit={false}
      onRequestRate={async () => undefined}
      card={
        <HandledByCard
          summary={view.summary}
          name={name}
          canDismiss={access.canEdit}
          onDismiss={async () => {
            await dismissFeederHistory(characterId, corporationId, collectorCorporationId);
            reload();
          }}
        />
      }
      afterCard={children}
    />
  );
}
