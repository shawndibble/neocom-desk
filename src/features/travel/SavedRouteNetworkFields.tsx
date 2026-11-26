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
import { useAnsiblexGates } from '@/features/route/ansiblexGates';
import { RouteHoleFields } from './RouteRulesPanel';

export function SavedRouteNetworkFields() {
  const holeQuery = useRouteHoleQuery(NO_HOLE_OVERRIDES);
  const bridgeQuery = useRouteBridgeQuery(null);
  const gateRecords = useAnsiblexGates();
  const systems = useSolarSystemIndex();
  const [dialog, setDialog] = useState<AnsiblexDialogMode | null>(null);

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
