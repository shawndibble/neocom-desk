/**
 * The Advisor's scan pattern: one instruction per row, always the same shape.
 *
 * ## Why a shared primitive rather than prose per card
 *
 * The tab used to state every instruction as a sentence — "Remove 4x idle
 * Basic Industry Facility — they draw 48,000/hr of Microorganisms against the
 * 21,201/hr this colony extracts. Frees 800 tf and 3,200 MW." Every clause was
 * true and load-bearing, and the card was still unreadable: six planets of
 * that is a page of prose a pilot has to *read* to find the two things they
 * should actually go and do.
 *
 * So an instruction is now three fixed slots — a VERB, what it applies to, and
 * the number it is worth, right-aligned and tabular. The eye runs down the
 * verb column to find the work and down the number column to rank it, without
 * parsing a sentence. The reasoning is not deleted: it moves to the colony's
 * detail modal, which is what `AdvisorPanel`'s Details button opens.
 *
 * ## The verbs are a closed set, and the colour is the meaning
 *
 * `remove` is amber because something is running that nothing feeds — it is a
 * fault, and it is the one a pilot should act on first. `add` and `swap` are
 * accent: an opportunity the plan placed here. `rebuild` is quiet and
 * outlined, because it is worth more but only by tearing the colony down, and
 * it must never compete with the two above for attention.
 *
 * `asIs` is the fourth, and it exists because "keep selling this raw" means
 * *change nothing*. Rendered as a verb tag like the others it read as an
 * instruction to rebuild a colony that was already right — see the
 * `stopTierSellRaw` / `stopTierSwitchRaw` split in `en.json`, which the old
 * card kept apart in words and this layout has to keep apart in colour.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';

/** What an instruction does. The set is closed; the colour carries the meaning. */
export type DirectiveVerb = 'add' | 'remove' | 'swap' | 'rebuild' | 'asIs' | 'build';

const VERB_CLASS: Record<DirectiveVerb, string> = {
  add: 'border-accent/45 bg-accent/10 text-accent',
  build: 'border-accent/45 bg-accent/10 text-accent',
  swap: 'border-accent/45 bg-accent/10 text-accent',
  remove: 'border-warning/45 bg-warning/10 text-warning',
  // Outlined: a course of action the pilot could take, and a real one.
  rebuild: 'border-line-bright text-text-dim',
  // Flat and borderless, because it is not an action at all. It shared
  // `rebuild`'s outline once, which left the two rows differing only in their
  // wording — the exact collapse this verb exists to prevent.
  asIs: 'border-transparent bg-panel-2 text-text-faint',
};

/** How the right-hand number reads: ISK earned, budget freed, or a quiet projection. */
export type DirectiveTone = 'gain' | 'freed' | 'quiet' | 'muted';

const TONE_CLASS: Record<DirectiveTone, string> = {
  gain: 'text-isk-pos',
  freed: 'text-warning',
  quiet: 'text-text-dim',
  /** For a row that asks for nothing: the figure is a comparison, not a prize. */
  muted: 'text-text-faint',
};

export function VerbTag({ verb }: { verb: DirectiveVerb }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border px-1.5 text-[0.625rem] font-bold tracking-widest uppercase ${VERB_CLASS[verb]}`}
    >
      {t(`piAdvisor.verb.${verb}`)}
    </span>
  );
}

export interface DirectiveRowProps {
  verb: DirectiveVerb;
  /** What the instruction applies to. Keep it to one line where it can be. */
  children: ReactNode;
  /** The number this is worth, already formatted. Omit when there isn't one. */
  value?: ReactNode;
  /** A unit shown small after the value, e.g. "/hr". */
  unit?: string;
  valueTone?: DirectiveTone;
  /** Input chips, rendered beneath and spanning both columns. */
  chips?: ReactNode;
}

/**
 * One instruction. Two columns — the sentence fragment and its number — with
 * the chips spanning underneath, so the number column stays a straight edge
 * however long the left side runs.
 */
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

/** Where an input comes from — a link, a customs boundary, or a shopping trip. */
export type InputSource = 'local' | 'routed' | 'bought';

/**
 * One glyph per source, from the shared set — never hand-rolled paths.
 * `icons.tsx` is what pins the weight and the rem-based sizing (DESIGN.md §5),
 * and three inline SVGs at three different stroke widths is exactly the drift
 * that rule exists to stop.
 */
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

/**
 * One input, as a chip rather than a clause.
 *
 * The icon carries the source — made here, routed in, or bought — which is the
 * distinction a pilot asked to see, and it survives being scanned at a glance
 * in a way "already made here, just link it" at the end of a sentence does not.
 */
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

/**
 * A colony's load on one axis, as a percentage.
 *
 * The card's version of `AdvisorPanel`'s `BudgetBar`: the same reading with
 * the raw figures dropped, because "8,017 / 25,415 tf" is four numbers to
 * compare across six cards and "32%" is one. The exact figures are in the
 * detail modal, where a pilot checking the arithmetic will be.
 */
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
      <span className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
        {label}
      </span>
      <div
        role="progressbar"
        aria-label={t('piAdvisor.budgetBarLabel', { axis: label })}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 flex-1 overflow-hidden rounded-full bg-panel-2"
      >
        <div
          className={`h-full ${tight ? 'bg-warning' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="min-w-[1.75rem] text-right text-[0.625rem] text-text-dim tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

/** A card or modal section's micro-heading. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
      {children}
    </span>
  );
}

/**
 * "Est." — the badge every projected figure carries.
 *
 * Kept as a badge rather than a sentence for the same reason the instructions
 * were: the caveat has to survive a glance. The sentence it replaces is still
 * available, in the tooltip and in the detail modal.
 */
export function EstimateBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded-xs border border-warning/60 px-1 text-[0.625rem] font-semibold tracking-widest text-warning uppercase">
      {t('piAdvisor.estimateBadge')}
    </span>
  );
}
