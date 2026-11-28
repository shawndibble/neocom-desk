import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { SurveyHistoryEntry } from '@/engine/survey/history';
import { countedScans, summarizeSurvey } from '@/engine/survey/series';
import { forgetSurvey, useSurveyHistory } from './surveyHistory';
import { loadSurveyCached } from './surveyStore';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { formatCalendarTimestamp } from '@/lib/timestamp';

type LoadedSurvey = { at: number; mined: { ore: string; percent: number } | null };

interface SurveyPickerProps {
  currentId: string | null;
  onPick: (id: string) => void;
}

export function SurveyPicker({ currentId, onPick }: SurveyPickerProps) {
  const { t } = useTranslation();
  const history = useSurveyHistory((state) => state.value);
  useHydratedStore(useSurveyHistory);
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, LoadedSurvey>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (history.length < 2) return;
    let cancelled = false;
    void (async () => {
      const wanted = history.filter((entry) => open || entry.id === currentId);
      for (const entry of wanted) {
        if (requested.current.has(entry.id)) continue;
        requested.current.add(entry.id);
        const result = await loadSurveyCached(entry.id);
        if (cancelled) {
          requested.current.delete(entry.id);
          return;
        }
        if (!result.ok) {
          if (result.reason === 'not-found') void forgetSurvey(entry.id);
          else requested.current.delete(entry.id);
          continue;
        }
        const summary = summarizeSurvey(countedScans(result.scans, result.ignored));
        const survey: LoadedSurvey =
          summary === null
            ? { at: entry.addedAt, mined: null }
            : {
                at: summary.lastAt,
                mined: { ore: summary.ores[0]?.ore ?? '', percent: summary.percent },
              };
        setLoaded((prev) => ({ ...prev, [entry.id]: survey }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentId, history]);

  function labelFor(entry: SurveyHistoryEntry): string {
    const survey = loaded[entry.id];
    if (survey === undefined) return entry.name ?? t('common.loading');
    const when = t('survey.eveTime', {
      time: formatCalendarTimestamp(new Date(survey.at), 'UTC'),
    });
    if (entry.name !== undefined) return t('survey.historyNamed', { name: entry.name, time: when });
    return survey.mined === null
      ? t('survey.historyEmpty', { time: when })
      : t('survey.historyEntry', { ...survey.mined, time: when });
  }
  const current = history.find((entry) => entry.id === currentId);

  if (history.length < 2) return null;

  return (
    <Select
      value={currentId ?? undefined}
      onValueChange={onPick}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectTrigger size="md" aria-label={t('survey.historyLabel')} className="w-56 max-w-full">
        <SelectValue placeholder={t('survey.historyPlaceholder')}>
          {current !== undefined
            ? labelFor(current)
            : currentId !== null
              ? t('common.loading')
              : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className="max-md:max-w-[var(--radix-select-content-available-width)]"
        collisionPadding={8}
      >
        {history.map((entry) => {
          const label = labelFor(entry);
          return (
            <SelectItem
              key={entry.id}
              value={entry.id}
              aria-keyshortcuts="Delete"
              aria-describedby={`${hintId}-${entry.id}`}
              onKeyDown={(event) => {
                if (event.key !== 'Delete' && event.key !== 'Backspace') return;
                event.preventDefault();
                event.stopPropagation();
                void forgetSurvey(entry.id);
              }}
            >
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 flex-1 max-md:[overflow-wrap:anywhere] md:truncate">
                  {label}
                </span>
                <span
                  aria-hidden
                  className="shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconButton
                    icon={<Icon.Close />}
                    label={t('survey.historyRemove', {
                      name: label,
                    })}
                    tooltip={t('survey.historyRemoveShort')}
                    variant="plain"
                    size="row"
                    tabIndex={-1}
                    onClick={() => void forgetSurvey(entry.id)}
                  />
                </span>
              </span>
              <span id={`${hintId}-${entry.id}`} aria-hidden className="sr-only">
                {t('survey.historyRemoveKeyHint')}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
