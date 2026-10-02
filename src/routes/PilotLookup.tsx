import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PilotLookupPanel } from '@/features/travel/PilotLookupPanel';

/**
 * Pilot Lookup (issue #2331), a page of its own in the Intel group rather than
 * a Travel tab nobody would look for there (scope decision
 * `20261002-145653-lp-store-under-market-pilot-lookup-its-own`). The picked
 * pilot still lives in `?pilot=<id>`, so a shared lookup opens on that pilot.
 */
export function PilotLookup() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PilotLookupPanel />
    </div>
  );
}
