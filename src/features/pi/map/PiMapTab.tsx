import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { PricesUnavailable } from '../PricesUnavailable';
import { PlanMap } from './PlanMap';
import { useMapAdvice } from './useMapAdvice';

/** The Map tab: loads what the recommendation model needs, then draws the explorer. */
export function PiMapTab({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const planetLabel = useCallback((id: number) => t('pi.planetLabel', { id }), [t]);
  const state = useMapAdvice(characterId, planetLabel);

  if (state.status === 'failed') {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }
  if (state.status === 'prices-failed') return <PricesUnavailable />;
  if (state.status === 'reauth') {
    return (
      <GrantBanner
        characterId={characterId}
        endpoints={['getCharacterPlanets']}
        title={t('pi.reauthTitle')}
        hint={t('pi.reauthHint')}
        actionLabel={t('pi.reauthAction')}
      />
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  return (
    <PlanMap
      graph={state.graph}
      advice={state.advice}
      adviceWithWhatIf={state.adviceWithWhatIf}
      colonies={state.colonies}
      finder={state.finder}
    />
  );
}
