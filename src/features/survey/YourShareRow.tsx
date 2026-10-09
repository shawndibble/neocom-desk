/**
 * The line under the Survey's stats that says how much of the field the
 * viewer mined themselves, from their personal mining ledger, and which
 * system it read. The ledger knows days and systems but not scans, so it is a
 * running total (the info tooltip says so), and a Survey doesn't record its
 * system, so the pilot names it here.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, TextInput, textActionClassName } from '@/components/ui';
import type { SurveySummary } from '@/engine/survey/series';
import { resolveSolarSystem } from '@/features/character/systemLookup';
import { formatCompactNumber } from '@/lib/compactNumber';
import { useSurveySystem } from './surveySystemPref';
import { useYourShare } from './useYourShare';

function SystemField({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const setSystem = useSurveySystem((s) => s.setValue);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'resolving' | 'notFound'>('idle');

  async function commit() {
    // Enter and the blur it causes both land here; only the first resolves.
    if (status === 'resolving') return;
    if (text.trim() === '') return onDone();
    setStatus('resolving');
    const system = await resolveSolarSystem(text);
    if (system === null) return setStatus('notFound');
    await setSystem({ id: system.id, name: system.name });
    setStatus('idle');
    onDone();
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor="survey-system" className="sr-only">
        {t('survey.systemLabel')}
      </label>
      <TextInput
        id="survey-system"
        size="sm"
        value={text}
        placeholder={t('survey.systemPlaceholder')}
        aria-invalid={status === 'notFound'}
        onChange={(event) => {
          setText(event.target.value);
          if (status === 'notFound') setStatus('idle');
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          }
          if (event.key === 'Escape') onDone();
        }}
      />
      {status === 'notFound' && (
        <span role="alert" className="text-xs text-danger">
          {t('survey.systemNotFound')}
        </span>
      )}
    </span>
  );
}

interface YourShareRowProps {
  characterId: number | null;
  summary: SurveySummary | null;
}

export function YourShareRow({ characterId, summary }: YourShareRowProps) {
  const { t } = useTranslation();
  const state = useYourShare(characterId, summary);
  const [changing, setChanging] = useState(false);

  if (state.status === 'loading' || state.status === 'unavailable') return null;

  const tooltip = (
    <InfoTooltip label={t('survey.yourShareTooltipLabel')} content={t('survey.yourShareTooltip')} />
  );

  if (state.status === 'needSystem') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
        <span>{t('survey.systemPrompt')}</span>
        <SystemField onDone={() => undefined} />
        {tooltip}
      </div>
    );
  }

  const { system, share } = state;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="tabular-nums">
        {t(share.percentOfMined === null ? 'survey.yourShare' : 'survey.yourShareWithPercent', {
          volume: formatCompactNumber(share.minedM3),
          system: system.name,
          percent: share.percentOfMined,
        })}
      </span>
      {tooltip}
      {changing ? (
        <SystemField onDone={() => setChanging(false)} />
      ) : (
        <button type="button" className={textActionClassName()} onClick={() => setChanging(true)}>
          {t('survey.changeSystem')}
        </button>
      )}
    </div>
  );
}
