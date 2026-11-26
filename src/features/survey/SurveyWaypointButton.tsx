import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeNote } from '@/components/OutcomeNote';
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
      <OutcomeNote outcome={outcome} className="w-full" />
    </>
  );
}
