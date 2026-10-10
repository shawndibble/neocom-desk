/**
 * Switches between the Surveys this pilot created or opened in the last 7 days
 * (`surveyHistory`). The list is only ids; each label (main ore, percent mined,
 * when) is read from the survey's Share Link (the one in view right away, the rest the
 * first time the dropdown opens), one at a time, and a link found gone drops out of the history.
 */
import { useEffect, useRef, useState } from 'react';
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
import { summarizeSurvey } from '@/engine/survey/series';
import { forgetSurvey, useSurveyHistory } from './surveyHistory';
import { loadSurvey } from './surveyStore';

interface SurveyPickerProps {
  currentId: string | null;
  onPick: (id: string) => void;
}

export function SurveyPicker({ currentId, onPick }: SurveyPickerProps) {
  const { t, i18n } = useTranslation();
  const history = useSurveyHistory((state) => state.value);
  const hydrate = useSurveyHistory((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (history.length < 2) return;
    let cancelled = false;
    const time = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    void (async () => {
      // The closed trigger shows the survey in view, so its label loads up front;
      // the rest wait for the dropdown to open.
      const wanted = history.filter((entry) => open || entry.id === currentId);
      for (const entry of wanted) {
        if (requested.current.has(entry.id)) continue;
        requested.current.add(entry.id);
        const result = await loadSurvey(entry.id);
        if (cancelled) {
          requested.current.delete(entry.id);
          return;
        }
        if (!result.ok) {
          if (result.reason === 'not-found') void forgetSurvey(entry.id);
          else requested.current.delete(entry.id);
          continue;
        }
        const summary = summarizeSurvey(result.scans);
        const label =
          summary === null
            ? t('survey.historyEmpty', {
                time: t('survey.eveTime', { time: time.format(entry.addedAt) }),
              })
            : t('survey.historyEntry', {
                ore: summary.ores[0]?.ore ?? '',
                percent: summary.percent,
                time: t('survey.eveTime', { time: time.format(summary.lastAt) }),
              });
        setLabels((prev) => ({ ...prev, [entry.id]: label }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentId, history, i18n.language, t]);

  // One survey is the one in view: nothing to switch to.
  if (history.length < 2) return null;

  return (
    <Select
      value={currentId ?? undefined}
      onValueChange={onPick}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectTrigger size="sm" aria-label={t('survey.historyLabel')} className="w-56 max-w-full">
        <SelectValue placeholder={t('survey.historyPlaceholder')}>
          {/* The item's remove button lives in its children, which Radix would copy up here. */}
          {currentId !== null ? (labels[currentId] ?? t('common.loading')) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {history.map((entry) => {
          const label = labels[entry.id] ?? t('common.loading');
          return (
            <SelectItem key={entry.id} value={entry.id}>
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {/* Radix picks the item on pointer-up / click / key: keep the remove button's own. */}
                <span
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
                    onClick={() => void forgetSurvey(entry.id)}
                  />
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
