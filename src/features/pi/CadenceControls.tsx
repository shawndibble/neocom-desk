/**
 * The two habits every figure on the Advisor tab is derived from.
 *
 * They sit in the controls panel beside the customs rate and the hub rather
 * than on a card, for the same reason those do: they are facts about the
 * pilot, not about a planet, and the ranking below them is only meaningful
 * relative to them. A pilot who hauls weekly and a pilot who hauls daily get
 * different worklists off the same colonies, so burying the control that
 * decides which one they are looking at would make the order read as fact.
 *
 * Two controls, not one. Restarting an extractor program does not empty the
 * Launchpad, and hauling does not reinstall a program — see `cadencePref.ts`.
 * The hints say what each one changes, because the difference is exactly what
 * a pilot has no reason to know from the labels alone.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { PI_CADENCE_DAYS, useCadence, type PiCadence, type PiCadenceDays } from './cadencePref';

/** One labelled day-count select. The two axes differ only in which field they write. */
function CadenceSelect({
  label,
  hint,
  value,
  onChange,
  footnote,
}: {
  label: string;
  hint: string;
  value: PiCadenceDays;
  onChange: (days: PiCadenceDays) => void;
  footnote?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="space-y-1">
      <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
        <InfoTooltip label={t('common.aboutLabel', { label })} content={hint} />
      </span>
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next) as PiCadenceDays)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PI_CADENCE_DAYS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t('piAdvisor.cadenceDays', { count: days })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {footnote && (
        <span className="block max-w-56 text-[0.6875rem] text-text-dim">{footnote}</span>
      )}
    </label>
  );
}

export interface CadenceControlsProps {
  /**
   * What the pilot's own extraction curve gives at the chosen restart cadence,
   * as a fraction of the best cadence on offer. Null when no extractor of
   * theirs reports a complete program — an unmeasurable colony gets the
   * refusal, never a default percentage.
   */
  restartYield: number | null;
}

export function CadenceControls({ restartYield }: CadenceControlsProps) {
  const { t } = useTranslation();
  const cadence = useCadence((state) => state.value);
  const hydrate = useCadence((state) => state.hydrate);
  const setCadence = useCadence((state) => state.setValue);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const write = (patch: Partial<PiCadence>) => void setCadence({ ...cadence, ...patch });

  // A cadence that is already the best on offer gets a different sentence
  // rather than "you pull 100% of the best": the percentage is there to price
  // a trade-off, and there is no trade-off being made at the top of the curve.
  const restartFootnote =
    restartYield === null
      ? t('piAdvisor.cadenceRestartYieldUnknown')
      : restartYield >= 1
        ? t('piAdvisor.cadenceRestartYieldBest')
        : t('piAdvisor.cadenceRestartYield', { percent: Math.round(restartYield * 100) });

  return (
    <>
      <CadenceSelect
        label={t('piAdvisor.cadenceRestartLabel')}
        hint={t('piAdvisor.cadenceRestartHint')}
        value={cadence.restartDays}
        onChange={(restartDays) => write({ restartDays })}
        footnote={restartFootnote}
      />
      <CadenceSelect
        label={t('piAdvisor.cadenceHaulLabel')}
        hint={t('piAdvisor.cadenceHaulHint')}
        value={cadence.haulDays}
        onChange={(haulDays) => write({ haulDays })}
      />
    </>
  );
}
