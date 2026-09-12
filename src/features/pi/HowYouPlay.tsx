/**
 * The inputs every figure on this tab is derived from, in one column beside
 * the answers they produce.
 *
 * These used to be a full-width "Advisor" panel above the page. That panel was
 * a row of form controls with no statement of what any of them changed, so it
 * read as configuration to skip past — while the two summary cards below it
 * printed figures that are meaningless without it. A pilot who hauls weekly
 * and a pilot who hauls daily get different worklists off the same colonies,
 * and a ranking reads as fact when the control that decides it is out of
 * sight. So the inputs sit *beside* the answers, in the same row, at the same
 * height: what you told us, next to what it bought you.
 *
 * Order is deliberate. The system scopes everything below it, so it leads. The
 * two cadences come next because they are the only two facts here that nothing
 * on ESI can answer — they are habits, so the Advisor has to ask. Below a
 * hairline sit the three that are merely assumptions the page has already made
 * for you and will keep if you say nothing: the customs rate, the hub, and how
 * many colonies are in the plan.
 *
 * Local state is the half-typed customs field only. Remounting on a system
 * change (the caller passes `key`) is what clears it, rather than an effect
 * that would have to know which edits are the pilot's and which are the
 * system's.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  buttonClassName,
} from '@/components/ui';
import { TRADE_HUBS } from '@/market/hubs';
import type { MarketSourcing } from './marketSourcingPref';
import { PI_CADENCE_DAYS, useCadence, type PiCadence, type PiCadenceDays } from './cadencePref';

/** A label and its control, on one line. The column's whole rhythm. */
function Assume({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-text-dim">{label}</span>
      {children}
    </div>
  );
}

/** Why the line above it matters, in the quietest type on the page. */
function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[0.625rem] leading-relaxed text-text-faint">{children}</p>;
}

/**
 * One cadence, as a sentence with a hole in it.
 *
 * Two controls, not one: restarting an extractor program does not empty the
 * Launchpad, and hauling does not reinstall a program — see `cadencePref.ts`.
 * The footnotes say what each one changes, because the difference is exactly
 * what a pilot has no reason to know from the labels alone.
 */
function CadenceRow({
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
  footnote: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <Assume
        label={
          <>
            {label}
            <InfoTooltip label={t('common.aboutLabel', { label })} content={hint} />
          </>
        }
      >
        <Select
          value={String(value)}
          onValueChange={(next) => onChange(Number(next) as PiCadenceDays)}
        >
          <SelectTrigger
            size="sm"
            aria-label={label}
            className="w-24 border-accent/70 bg-accent/10"
          >
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
      </Assume>
      <Footnote>{footnote}</Footnote>
    </div>
  );
}

export interface HowYouPlayProps {
  systems: readonly { systemId: number; name: string | null }[];
  activeSystemId: number;
  onSystemIdChange: (systemId: number) => void;
  /**
   * What the chosen restart cadence gives against the best on offer, on this
   * character's own ground. Null when no extractor reports a complete program
   * — an unmeasurable colony gets the refusal, never a default percentage.
   */
  restartYield: number | null;
  /** The rate in force, as a percentage, derived or overridden. */
  customsPercent: number;
  customsEdited: boolean;
  customsTooltip: string;
  onCustomsChange: (percent: number) => void;
  onCustomsReset: () => void;
  sourcing: MarketSourcing;
  onSourcingChange: (sourcing: MarketSourcing) => void;
  colonyCount: number;
  slots: { slots: number; assumed: boolean };
  /** Distinct characters with a colony in this system. */
  pilots: number;
  /** Only offered when there is something to plan with. */
  alts: { planned: number; withAlts: boolean; onToggle: () => void } | null;
}

export function HowYouPlay(props: HowYouPlayProps) {
  const { t } = useTranslation();
  const cadence = useCadence((state) => state.value);
  const hydrate = useCadence((state) => state.hydrate);
  const setCadence = useCadence((state) => state.setValue);
  const [customsText, setCustomsText] = useState<string | null>(null);
  const [editingCustoms, setEditingCustoms] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const write = (patch: Partial<PiCadence>) => void setCadence({ ...cadence, ...patch });

  // A cadence already at the top of the curve gets a different sentence rather
  // than "you pull 100% of the best": the percentage prices a trade-off, and
  // no trade-off is being made there.
  const restartFootnote =
    props.restartYield === null
      ? t('piAdvisor.cadenceRestartYieldUnknown')
      : props.restartYield >= 1
        ? t('piAdvisor.cadenceRestartYieldBest')
        : t('piAdvisor.cadenceRestartYield', { percent: Math.round(props.restartYield * 100) });

  const slotsValue = t('piAdvisor.slotsValue', {
    used: props.colonyCount,
    total: props.slots.slots,
  });

  return (
    <div className="flex flex-col rounded-xs border border-line bg-panel">
      <div className="flex items-center border-b border-line bg-panel-2 px-3.5 py-2">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piAdvisor.howYouPlayTitle')}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
        <Assume label={t('piAdvisor.system')}>
          <Select
            value={String(props.activeSystemId)}
            onValueChange={(value) => props.onSystemIdChange(Number(value))}
          >
            <SelectTrigger size="sm" aria-label={t('piAdvisor.system')} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.systems.map((system) => (
                <SelectItem key={system.systemId} value={String(system.systemId)}>
                  {system.name ?? t('piAdvisor.systemLabel', { id: system.systemId })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Assume>

        {/*
          The two habits every figure below is derived from, and the only two
          facts on this tab that no API can answer.
        */}
        <CadenceRow
          label={t('piAdvisor.cadenceRestartLabel')}
          hint={t('piAdvisor.cadenceRestartHint')}
          value={cadence.restartDays}
          onChange={(restartDays) => write({ restartDays })}
          footnote={restartFootnote}
        />
        <CadenceRow
          label={t('piAdvisor.cadenceHaulLabel')}
          hint={t('piAdvisor.cadenceHaulHint')}
          value={cadence.haulDays}
          onChange={(haulDays) => write({ haulDays })}
          footnote={t('piAdvisor.cadenceHaulFootnote')}
        />

        <div className="h-px bg-line" />

        {/*
          Editable, and that is the point. The derived figure is exact in
          highsec — the NPC base less the character's Customs Code Expertise —
          but outside it the office is player-owned, its tax is in no ESI
          field, and `defaultCustomsRate` returns 0. Every margin on a lowsec,
          nullsec or wormhole colony was overstated by whatever the POCO owner
          charges, with nothing on screen to say otherwise.
        */}
        <Assume
          label={
            <>
              {t('piAdvisor.customsRate')}
              <InfoTooltip
                label={t('common.aboutLabel', { label: t('piAdvisor.customsRate') })}
                content={props.customsTooltip}
              />
            </>
          }
        >
          {editingCustoms ? (
            <span className="flex items-center gap-1.5">
              <TextInput
                size="sm"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                autoFocus
                aria-label={t('piAdvisor.customsRate')}
                className="w-16"
                value={customsText ?? String(props.customsPercent)}
                onChange={(event) => {
                  const { value } = event.target;
                  setCustomsText(value);
                  const percent = Number(value);
                  // An empty or half-typed field is shown but not stored — a
                  // NaN would declare the system tax-free until the pilot
                  // noticed.
                  if (value === '' || !Number.isFinite(percent)) return;
                  props.onCustomsChange(percent);
                }}
              />
              <span className="text-[0.6875rem] text-text-dim">%</span>
              <button
                type="button"
                className={buttonClassName({ size: 'sm', variant: 'ghost' })}
                onClick={() => {
                  if (props.customsEdited) {
                    // The typed text has to go too, or the box would keep
                    // showing the override the pilot just cleared.
                    props.onCustomsReset();
                  }
                  setCustomsText(null);
                  setEditingCustoms(false);
                }}
              >
                {props.customsEdited
                  ? t('piAdvisor.customsRateReset')
                  : t('piAdvisor.customsRateDone')}
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="text-[0.8125rem] tabular-nums">
                {t('piAdvisor.customsRatePercent', { percent: props.customsPercent })}
              </span>
              <button
                type="button"
                className={buttonClassName({ size: 'sm', variant: 'ghost' })}
                onClick={() => setEditingCustoms(true)}
              >
                {t('piAdvisor.customsRateEdit')}
              </button>
            </span>
          )}
        </Assume>

        <Assume
          label={
            <>
              {t('piAdvisor.buyInputsLabel')}
              <InfoTooltip
                label={t('common.aboutLabel', { label: t('piAdvisor.buyInputsLabel') })}
                content={t('piAdvisor.buyInputsHint')}
              />
            </>
          }
        >
          <Select
            value={props.sourcing}
            onValueChange={(value) => props.onSourcingChange(value as MarketSourcing)}
          >
            <SelectTrigger size="sm" aria-label={t('piAdvisor.buyInputsLabel')} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('piAdvisor.buyInputsNone')}</SelectItem>
              {TRADE_HUBS.map((hub) => (
                <SelectItem key={hub.id} value={hub.id}>
                  {hub.systemName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Assume>

        {/*
          Derived, so it says so: an untrained Command Center skill is an
          assumption, and only a trained level may be shown bare.
        */}
        <Assume label={t('piAdvisor.coloniesInPlan')}>
          <span className="text-[0.8125rem] tabular-nums">
            {props.slots.assumed ? t('piAdvisor.slotsAssumed', { value: slotsValue }) : slotsValue}
            {props.pilots > 1 && (
              <span className="text-text-dim">
                {' · '}
                {t('piAdvisor.pilotsCount', { count: props.pilots })}
              </span>
            )}
          </span>
        </Assume>

        {/*
          Its own switch, under its own key, rather than the Colonies panel's:
          that one sits on another tab and answers "show me", where this
          answers "plan with" (see `altColoniesPref.ts`). Only offered when
          there is something to plan with.
        */}
        {props.alts && (
          <label className="mt-auto flex items-start gap-2 pt-1 text-xs text-text">
            <input
              type="checkbox"
              checked={props.alts.withAlts}
              onChange={props.alts.onToggle}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
            />
            <span>
              <span className="font-medium">{t('piAdvisor.altColoniesLabel')}</span>
              <Footnote>
                {props.alts.withAlts && props.alts.planned > 0
                  ? t('piAdvisor.altColoniesCount', { count: props.alts.planned })
                  : t('piAdvisor.altColoniesHint')}
              </Footnote>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
