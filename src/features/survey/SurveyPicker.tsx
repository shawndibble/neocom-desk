/**
 * Switches between the latest 8 Surveys this pilot created or opened in the last 7 days
 * (`surveyHistory`). The list is only ids and the pilot's own names; each label
 * (the name, or main ore and percent mined, then when) is read from the survey's
 * Share Link (the one in view right away, the rest the first time the dropdown
 * opens), one at a time, and a link found gone drops out of the history.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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

/** What a survey's link says about it, kept so a rename relabels it without a reload. */
type LoadedSurvey = { at: number; mined: { ore: string; percent: number } | null };

interface SurveyPickerProps {
  currentId: string | null;
  onPick: (id: string) => void;
}

export function SurveyPicker({ currentId, onPick }: SurveyPickerProps) {
  const { t, i18n } = useTranslation();
  const history = useSurveyHistory((state) => state.value);
  useHydratedStore(useSurveyHistory);
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, LoadedSurvey>>({});
  const requested = useRef(new Set<string>());
  const time = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }),
    [i18n.language]
  );

  useEffect(() => {
    if (history.length < 2) return;
    let cancelled = false;
    void (async () => {
      // The closed trigger shows the survey in view, so its label loads up front;
      // the rest wait for the dropdown to open.
      const wanted = history.filter((entry) => open || entry.id === currentId);
      for (const entry of wanted) {
        if (requested.current.has(entry.id)) continue;
        requested.current.add(entry.id);
        // Cache first: a label needs no fresh read, and the survey in view is loaded by the page.
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

  /** The pilot's name leads when there is one; it shows on its own until the link has loaded. */
  function labelFor(entry: SurveyHistoryEntry): string {
    const survey = loaded[entry.id];
    if (survey === undefined) return entry.name ?? t('common.loading');
    const when = t('survey.eveTime', { time: time.format(survey.at) });
    if (entry.name !== undefined) return t('survey.historyNamed', { name: entry.name, time: when });
    return survey.mined === null
      ? t('survey.historyEmpty', { time: when })
      : t('survey.historyEntry', { ...survey.mined, time: when });
  }
  const current = history.find((entry) => entry.id === currentId);

  // One survey is the one in view: nothing to switch to.
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
          {/* The item's remove button lives in its children, which Radix would copy up here. */}
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
                // Radix Select traps Tab, so the nested remove button is out of keyboard reach.
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
                {/* Radix picks the item on pointer-up / click / key: keep the remove button's own. */}
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
