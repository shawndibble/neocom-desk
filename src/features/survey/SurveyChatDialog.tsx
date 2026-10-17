/**
 * "Configure chat message…": which rows the Survey's chat message has and how
 * its box is drawn, with the message as it would be copied shown above the
 * choices. The heading and the link row are fixed; everything between is the
 * pilot's call, kept in the browser (`useSurveyChatOptions`).
 */
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Modal, SegmentedControl } from '@/components/ui';
import {
  DEFAULT_SURVEY_CHAT_OPTIONS,
  surveyChatMessage,
  type SurveyChatBorder,
  type SurveyChatOptions,
  type SurveyChatOres,
  type SurveyMessageLabels,
} from '@/engine/survey/chatMessage';
import type { SurveySummary } from '@/engine/survey/series';
import { useSurveyChatOptions } from './surveyPref';

interface SurveyChatDialogProps {
  summary: SurveySummary;
  url: string;
  labels: SurveyMessageLabels;
  now: number;
  /** The survey's location, for the row that names it; null when none is set. */
  location: string | null;
  onClose: () => void;
}

type FlagKey = 'location' | 'pace' | 'iskLeft' | 'volumeLeft' | 'elapsed';
const FLAGS: readonly FlagKey[] = ['location', 'pace', 'iskLeft', 'volumeLeft', 'elapsed'];
const BORDERS: readonly SurveyChatBorder[] = ['single', 'double', 'none'];
const ORES: readonly SurveyChatOres[] = ['off', 'top2', 'top3', 'all'];

export function SurveyChatDialog({
  summary,
  url,
  labels,
  now,
  location,
  onClose,
}: SurveyChatDialogProps) {
  const { t } = useTranslation();
  const options = useSurveyChatOptions((state) => state.value);
  const setOptions = useSurveyChatOptions((state) => state.setValue);
  const change = (changes: Partial<SurveyChatOptions>) => setOptions({ ...options, ...changes });
  const oneScan = summary.points.length <= 1;
  const unavailable = (key: FlagKey): boolean => key === 'location' && location === null;

  return (
    <Modal open onClose={onClose} title={t('survey.chatConfig.title')}>
      <div className="space-y-4 text-sm">
        <section aria-label={t('survey.chatConfig.preview')} className="space-y-1">
          <h3 className="text-xs text-text-dim">{t('survey.chatConfig.preview')}</h3>
          <pre
            data-testid="chat-preview"
            className="overflow-x-auto rounded-md border border-line bg-panel-2 p-3 font-mono text-xs leading-relaxed"
          >
            {surveyChatMessage(summary, url, labels, now, options, location)}
          </pre>
          <p className="text-xs text-text-dim">{t('survey.chatConfig.previewHint')}</p>
        </section>

        <SegmentedControl
          label={t('survey.chatConfig.border')}
          value={options.border}
          onChange={(border) => change({ border })}
          options={BORDERS.map((value) => ({
            value,
            label: t(`survey.chatConfig.borders.${value}`),
          }))}
          uppercase={false}
        />
        <SegmentedControl
          label={t('survey.chatConfig.ores')}
          value={options.ores}
          onChange={(ores) => change({ ores })}
          options={ORES.map((value) => ({
            value,
            label: t(`survey.chatConfig.oreModes.${value}`),
          }))}
          uppercase={false}
        />

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-text-dim">{t('survey.chatConfig.rows')}</legend>
          <Toggle
            label={t('survey.chatConfig.eta')}
            checked={options.eta}
            onChange={(eta) => change({ eta })}
          />
          <Toggle
            label={t('survey.chatConfig.bar')}
            hint={oneScan ? t('survey.chatConfig.barOneScan') : undefined}
            checked={options.bar}
            disabled={oneScan}
            onChange={(bar) => change({ bar })}
          />
          <Toggle
            label={t('survey.chatConfig.rockCounts')}
            checked={options.rockCounts}
            disabled={options.ores === 'off'}
            onChange={(rockCounts) => change({ rockCounts })}
          />
          {FLAGS.map((key) => (
            <Toggle
              key={key}
              label={t(`survey.chatConfig.flags.${key}`)}
              hint={unavailable(key) ? t('survey.chatConfig.noLocation') : undefined}
              checked={options[key]}
              disabled={unavailable(key)}
              onChange={(value) => change({ [key]: value })}
            />
          ))}
        </fieldset>

        <p className="text-xs text-text-dim">{t('survey.chatConfig.fixed')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button size="sm" onClick={() => setOptions(DEFAULT_SURVEY_CHAT_OPTIONS)}>
            {t('survey.chatConfig.reset')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 touch:min-h-11">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
      {hint !== undefined && <span className="ml-auto text-xs text-text-dim">{hint}</span>}
    </label>
  );
}
