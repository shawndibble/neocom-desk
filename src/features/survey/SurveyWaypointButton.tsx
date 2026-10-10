/**
 * "Set waypoint" for the Survey's location: sends it to the viewer's own EVE
 * client as their autopilot destination (`useSetDestination`, shared with the
 * order book). The button is the same one the Moon tax row's "Manage Taxes"
 * uses, on its right on a wide screen and wrapping under the location on a
 * phone. Without a Character, or without the waypoint scope, it is disabled
 * with the reason under it rather than a click that fails. The status lines
 * take the whole row, so the caller's row wraps them under the button.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useSetDestination } from '@/features/travel/useSetDestination';

export function SurveyWaypointButton({ location }: { location: { id: number; name: string } }) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useSetDestination(location.id, location.name);
  return (
    <>
      <Button
        size="sm"
        className="touch:min-h-11 sm:ml-auto"
        disabled={blockedReason !== null}
        loading={sending}
        aria-label={t('survey.info.setWaypointTo', { placeName: location.name })}
        onClick={send}
      >
        {t('survey.info.setWaypoint')}
      </Button>
      {blockedReason !== null && (
        <span className="w-full text-xs text-text-dim">{blockedReason}</span>
      )}
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
