/**
 * "Set waypoint" for the Survey's location: sends it to the viewer's own EVE
 * client as their autopilot destination (`useSetDestination`, shared with the
 * order book). The button is the same one the Moon tax row's "Assign Taxes"
 * uses, on its right on a wide screen and wrapping under the location on a
 * phone. Without a Character, or without the waypoint scope, it is disabled
 * with the reason right under it, aligned to it, rather than a click that
 * fails; logged out, the reason is the same short "Log in to…" line Manage
 * Taxes shows ("Log in", as on EVE's own button). The status lines take the
 * whole row, so the caller's row wraps them under the button.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useSetDestination } from '@/features/travel/useSetDestination';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { blockedButtonClassName, blockedReasonClassName } from './blockedActionStyles';

export function SurveyWaypointButton({ location }: { location: { id: number; name: string } }) {
  const { t } = useTranslation();
  const hintId = useId();
  const loggedOut = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null)) === null;
  const destination = useSetDestination(location.id, location.name);
  const { sending, outcome, send } = destination;
  const blockedReason = loggedOut ? t('survey.info.needLogin') : destination.blockedReason;
  return (
    <>
      <div className={blockedButtonClassName}>
        <Button
          size="sm"
          className="touch:min-h-11"
          // Stays focusable with its reason linked, rather than the native attribute (DESIGN §6c Disabled).
          aria-disabled={blockedReason !== null || undefined}
          aria-describedby={blockedReason !== null ? hintId : undefined}
          loading={sending}
          aria-label={t('survey.info.setWaypointTo', { placeName: location.name })}
          onClick={send}
        >
          {t('survey.info.setWaypoint')}
        </Button>
        {blockedReason !== null && (
          <span id={hintId} className={blockedReasonClassName}>
            {blockedReason}
          </span>
        )}
      </div>
      {outcome && (
        <span
          role={outcome.tone}
          className={
            outcome.tone === 'alert' ? 'w-full text-xs text-danger' : 'w-full text-xs text-success'
          }
        >
          {outcome.text}
        </span>
      )}
    </>
  );
}
