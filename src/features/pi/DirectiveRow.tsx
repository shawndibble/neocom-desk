import { Pill, type PillTone } from '@/components/ui/Pill';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ProgressBar } from '@/components/ui';
import * as Icon from '@/components/ui/icons';

export type DirectiveVerb =
  'add' | 'remove' | 'swap' | 'rebuild' | 'asIs' | 'build' | 'start' | 'stop';

const VERB_TONE: Record<Exclude<DirectiveVerb, 'asIs'>, PillTone> = {
  add: 'accent',
  build: 'accent',
  swap: 'accent',
  remove: 'warning',
  start: 'accent',
  stop: 'warning',
  rebuild: 'neutral',
};

const AS_IS_CLASS =
  'inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border border-transparent bg-panel-2 px-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

export type DirectiveTone = 'gain' | 'freed' | 'quiet' | 'muted';

const TONE_CLASS: Record<DirectiveTone, string> = {
  gain: 'text-isk-pos',
  freed: 'text-warning',
  quiet: 'text-text-dim',
  muted: 'text-text-dim italic',
};

export function VerbTag({ verb, label }: { verb: DirectiveVerb; label?: string }) {
  const { t } = useTranslation();
  const text = label ?? t(`piShared.verb.${verb}`);
  if (verb === 'asIs') return <span className={AS_IS_CLASS}>{text}</span>;
  return (
    <Pill outlined tone={VERB_TONE[verb]}>
      {text}
    </Pill>
  );
}

export interface DirectiveRowProps {
  verb: DirectiveVerb;
  children: ReactNode;
  value?: ReactNode;
  unit?: string;
  valueTone?: DirectiveTone;
  chips?: ReactNode;
}

export function DirectiveRow({
  verb,
  children,
  value,
  unit,
  valueTone = 'gain',
  chips,
}: DirectiveRowProps) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <VerbTag verb={verb} />
        <span className="text-xs text-text">{children}</span>
      </div>
      {value !== undefined && (
        <span
          className={`text-right text-xs font-semibold whitespace-nowrap tabular-nums ${TONE_CLASS[valueTone]}`}
        >
          {value}
          {unit && <span className="ml-px text-[0.6875rem] font-normal text-text-dim">{unit}</span>}
        </span>
      )}
      {chips && <div className="col-span-full flex flex-wrap gap-1">{chips}</div>}
    </div>
  );
}

export type InputSource = 'local' | 'routed' | 'bought';

const SOURCE_ICON: Record<InputSource, typeof Icon.Done> = {
  local: Icon.Done,
  routed: Icon.Route,
  bought: Icon.Buy,
};

const SOURCE_ICON_CLASS: Record<InputSource, string> = {
  local: 'text-success',
  routed: 'text-accent',
  bought: 'text-warning',
};

export function InputChip({ source, children }: { source: InputSource; children: ReactNode }) {
  const Glyph = SOURCE_ICON[source];
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-1.5 text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
      <Glyph
        aria-hidden="true"
        size={Icon.ICON_SIZE.sm}
        className={`shrink-0 ${SOURCE_ICON_CLASS[source]}`}
      />
      {children}
    </span>
  );
}

export function LoadMeter({
  label,
  used,
  budget,
}: {
  label: string;
  used: number;
  budget: number;
}) {
  const { t } = useTranslation();
  const percent = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const tight = percent >= 90;
  return (
    <div className="flex items-center gap-1.5">
      <span className={eyebrowClassName}>{label}</span>
      <ProgressBar
        label={t('piShared.budgetBarLabel', { axis: label })}
        value={percent}
        tone={tight ? 'warning' : 'accent'}
        className="flex-1"
      />
      <span className="min-w-[1.75rem] text-right text-[0.6875rem] text-text-dim tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className={eyebrowClassName}>{children}</span>;
}

export function EstimateBadge() {
  const { t } = useTranslation();
  return (
    <Pill outlined tone="warning">
      {t('piShared.estimateBadge')}
    </Pill>
  );
}

export function TierChip({ tier }: { tier: number }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        eyebrowClassName,
        'inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border border-line bg-panel-2 px-1.5'
      )}
    >
      {t('piPlan.tierChip', { tier })}
    </span>
  );
}
