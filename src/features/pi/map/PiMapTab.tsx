import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { EsiDidntAnswer } from '../EsiDidntAnswer';
import { PricesUnavailable } from '../PricesUnavailable';
import { PlanMap } from './PlanMap';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useMapAdvice } from './useMapAdvice';

/** The Map tab: loads what the recommendation model needs, then draws the explorer. */
export function PiMapTab({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const planetLabel = useCallback((id: number) => t('pi.planetLabel', { id }), [t]);
  const state = useMapAdvice(characterId, planetLabel);
  const esi = state.status === 'ready' ? state.esiFailed : null;
  const [resultRef, armRetryFocus] = useRetryFocus(
    state.status !== 'ready' ? 'busy' : esi ? (esi.retrying ? 'busy' : 'failed') : 'ok',
    characterId
  );

  if (state.status === 'failed') {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }
  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {state.pricesFailed && <PricesUnavailable />}
      {esi && (
        <EsiDidntAnswer
          retrying={esi.retrying}
          onRetry={() => {
            armRetryFocus();
            esi.retry();
          }}
        />
      )}
      <div ref={resultRef} tabIndex={-1} className="outline-none">
        <PlanMap
          graph={state.graph}
          advice={state.advice}
          adviceWithWhatIf={state.adviceWithWhatIf}
          colonies={state.colonies}
          finder={state.finder}
          coloniesUnknown={state.coloniesUnknown}
          pricesFailed={state.pricesFailed}
          chainOf={state.chainOf}
          pi={state.pi}
        />
      </div>
    </div>
  );
}
