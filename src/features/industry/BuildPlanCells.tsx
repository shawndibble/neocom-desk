import { useTranslation } from 'react-i18next';
import { IskAmount, Tooltip } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import type { PlanVerdictTag } from './BuildPlanList';

// Same tone convention `PlanVerdictHero.tsx`'s `VerdictPill` already
// established for this exact build/buy/unknown concept — not the ISK-amount
// tokens (`isk-pos`/`isk-neg`), which DESIGN.md §1 reserves for money
// figures, and not a fourth ad-hoc palette for what is still a two-outcome
// status, which already has one (`success`/`warning`/muted).
const VERDICT_TAG_CLASS: Record<PlanVerdictTag, string> = {
  build: 'text-success border-success/50',
  buy: 'text-warning border-warning/50',
  unknown: 'text-text-dim border-line',
  // Reactions planned in highsec (issue #2908): the call is the pilot's to fix.
  fixLocation: 'text-warning border-warning/50',
};

export function VerdictTag({
  verdict,
  buildCost,
  buyCost,
}: {
  verdict: PlanVerdictTag;
  buildCost?: number | null;
  buyCost?: number | null;
}) {
  const { t } = useTranslation();
  const label =
    verdict === 'build'
      ? t('industry.verdictTagBuild')
      : verdict === 'buy'
        ? t('industry.verdictTagBuy')
        : verdict === 'fixLocation'
          ? t('industry.reactionBlocked.fixLocationTag')
          : t('industry.verdictTagUnknown');
  const hasCosts =
    verdict !== 'unknown' && verdict !== 'fixLocation' && buildCost != null && buyCost != null;
  // The tooltip below is hover/tap only and the list shows these costs nowhere
  // else, so the tag carries them as its accessible name (no extra tab stop).
  const tag = (
    <span
      role={hasCosts ? 'img' : undefined}
      aria-label={
        hasCosts
          ? t('industry.verdictTagSummary', {
              verdict: label,
              buildCost: t('industry.verdictTagAmount', { amount: formatIsk(buildCost) }),
              buyCost: t('industry.verdictTagAmount', { amount: formatIsk(buyCost) }),
            })
          : undefined
      }
      className={`rounded-xs border px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-widest ${VERDICT_TAG_CLASS[verdict]}`}
    >
      {label}
    </span>
  );
  if (!hasCosts) return tag;
  return (
    <Tooltip
      content={
        // Labels left, figures right, so the two totals compare by eye.
        <table className="w-full border-separate border-spacing-x-3 border-spacing-y-0.5 tabular-nums">
          <tbody>
            <tr>
              <th scope="row" className="text-left font-semibold">
                {t('industry.verdictTagBuild')}
              </th>
              <td className="text-right">
                {t('industry.verdictTagAmount', { amount: formatIsk(buildCost) })}
              </td>
            </tr>
            <tr>
              <th scope="row" className="text-left font-semibold">
                {t('industry.verdictTagBuy')}
              </th>
              <td className="text-right">
                {t('industry.verdictTagAmount', { amount: formatIsk(buyCost) })}
              </td>
            </tr>
          </tbody>
        </table>
      }
      openOnTap
    >
      {tag}
    </Tooltip>
  );
}

/** `runs === 0` reads as "—", not "0" — an unraised plan is not the same statement as a plan with zero runs recorded. */
export function RunsCell({ runs }: { runs: number }) {
  return <span className="tabular-nums text-text-dim">{runs > 0 ? runs : '—'}</span>;
}

/** Sign kept alongside the color, not instead of it (DESIGN.md §7) — a viewer who can't tell green from red still reads "+"/"-". */
export function ProfitCell({ profit, muted = false }: { profit: number | null; muted?: boolean }) {
  if (profit === null) return <span className="tabular-nums text-text-dim">—</span>;
  return (
    <span className={`tabular-nums ${muted ? 'text-text-dim' : iskToneClass(profit)}`}>
      {profit > 0 ? '+' : ''}
      {/* Tap: the row is tappable, so the tap opens the plan; the exact figure
          is on hover/focus. */}
      <IskAmount value={profit} decimals={0} />
    </span>
  );
}
