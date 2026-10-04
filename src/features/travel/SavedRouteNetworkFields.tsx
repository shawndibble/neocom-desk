/**
 * The wormhole and jump-bridge rules as Settings → Travel shows them: the very
 * controls Route Safety's sidebar uses (`RouteHoleFields`), bound straight to
 * the saved defaults every jump count follows — there is no link to override
 * here, so a change is just the new setting.
 */
import { useState } from 'react';
import { Spinner } from '@/components/ui';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { useRouteBridgeQuery, useRouteBridgesEnabled } from '@/features/route/routeBridgeSettings';
import {
  NO_HOLE_OVERRIDES,
  saveRouteHoleDefault,
  useRouteHoleQuery,
} from '@/features/route/routeHoleSettings';
import { AnsiblexGatesDialog, type AnsiblexDialogMode } from './AnsiblexGatesDialog';
import { useAnsiblexGates } from './ansiblexGates';
import { RouteHoleFields } from './RouteRulesPanel';

export function SavedRouteNetworkFields() {
  const holeQuery = useRouteHoleQuery(NO_HOLE_OVERRIDES);
  const bridgeQuery = useRouteBridgeQuery(null);
  const gateRecords = useAnsiblexGates();
  const systems = useSolarSystemIndex();
  const [dialog, setDialog] = useState<AnsiblexDialogMode | null>(null);

  // Held until every setting is read, so a click cannot write a default over a stored value.
  if (!holeQuery.hydrated || !bridgeQuery.hydrated) return <Spinner />;
  return (
    <>
      <RouteHoleFields
        bare
        query={holeQuery}
        onChange={saveRouteHoleDefault}
        bridges={{
          bridgeQuery,
          onBridgesChange: (enabled) => void useRouteBridgesEnabled.getState().setValue(enabled),
          bridgeCount: gateRecords?.length ?? 0,
          onManageBridges: () => setDialog('search'),
        }}
      />
      {dialog !== null && (
        <AnsiblexGatesDialog mode={dialog} systems={systems} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
