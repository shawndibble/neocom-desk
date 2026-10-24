/**
 * Sets a Haul's stops as autopilot waypoints in a Character's EVE client
 * (issue #4985): one leg's stop, or every stop of a Character's route. The
 * sending, the failure wording and the grant check are Route Safety's own
 * (`features/travel/sendWaypoints.ts`, `travel.waypoints.*`).
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button, Tooltip } from '@/components/ui';
import { permissionsForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { setWaypointsInGame } from '@/features/travel/sendWaypoints';
import { useOnline } from '@/stores/network';

const ENDPOINTS: readonly EsiEndpointId[] = ['postAutopilotWaypoint'];

export function HaulWaypointButton({
  characterId,
  ids,
  label,
  doneLabel,
  ariaLabel,
  variant = 'ghost',
}: {
  characterId: number;
  /** Stop ids in flying order: the first clears the client's own waypoints. */
  ids: readonly number[];
  label: string;
  doneLabel: string;
  ariaLabel?: string;
  variant?: 'ghost' | 'primary';
}) {
  const { t } = useTranslation();
  const lacksScope = useCharacterLacksEndpoints(characterId, ENDPOINTS);
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [alert, setAlert] = useState<ReactNode>(null);

  const blockedReason =
    ids.length === 0
      ? t('travel.waypoints.nothingToSet')
      : lacksScope
        ? t('permissions.grantMissing')
        : !online
          ? t('common.needsConnection')
          : null;

  async function send() {
    setSending(true);
    setAlert(null);
    try {
      const result = await setWaypointsInGame(characterId, ids);
      setDone(result.ok);
      if (result.ok) return;
      if (result.offline) {
        setAlert(
          result.unconfirmed
            ? result.set === 0
              ? t('travel.waypoints.unconfirmed')
              : t('travel.waypoints.unconfirmedPartway', { set: result.set, total: ids.length })
            : result.set === 0
              ? t('travel.waypoints.offline')
              : t('travel.waypoints.offlinePartway', { set: result.set, total: ids.length })
        );
        return;
      }
      const message = result.message ?? t('travel.waypoints.unknownError');
      setAlert(
        result.needsPermission ? (
          <GrantMissingLink groups={permissionsForEndpoints(ENDPOINTS)} />
        ) : result.set === 0 ? (
          t('travel.waypoints.failed', { message })
        ) : (
          t('travel.waypoints.failedPartway', { set: result.set, total: ids.length, message })
        )
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {/* `aria-disabled`, not `disabled`: the reason stays reachable in the tooltip. */}
      <Tooltip content={blockedReason}>
        <Button
          size="sm"
          variant={variant}
          aria-label={ariaLabel}
          aria-disabled={blockedReason !== null || undefined}
          loading={sending}
          onClick={() => {
            if (blockedReason === null) void send();
          }}
        >
          {sending ? t('assets.movePlan.haul.waypointSending') : done ? doneLabel : label}
        </Button>
      </Tooltip>
      {alert && (
        <p role="alert" className="m-0 text-xs text-danger">
          {alert}
        </p>
      )}
    </div>
  );
}
