import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { reach, type ChargeChoice } from '@/engine/fittings/chargeChoice';

/** Solid optimal, dashed falloff, on one km scale shared down a list; a tick at the target distance. */
export function RangeBar({
  choice,
  maxReach,
  distance,
}: {
  choice: ChargeChoice;
  maxReach: number;
  distance: number | null;
}) {
  const pct = (metres: number) => `${Math.min(100, (metres / maxReach) * 100)}%`;
  return (
    <span
      aria-hidden="true"
      className="relative block h-1.5 min-w-0 flex-1 border border-line bg-bg"
    >
      <span
        className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,var(--color-line-bright)_0_2px,transparent_2px_4px)]"
        style={{ width: pct(reach(choice)) }}
      />
      <span
        className="absolute inset-y-0 left-0 bg-text-dim"
        style={{ width: pct(choice.optimal) }}
      />
      {distance !== null && (
        <span className="absolute -inset-y-1 w-px bg-text" style={{ left: pct(distance) }} />
      )}
    </span>
  );
}

export function DamageText({ choice }: { choice: ChargeChoice }) {
  const { t } = useTranslation();
  if (!choice.damage) return null;
  const parts = (['em', 'thermal', 'kinetic', 'explosive'] as const)
    .filter((key) => choice.damage![key] > 0.005)
    .map((key) => ({ key, share: Math.round(choice.damage![key] * 100) }));
  // Rounded shares can sum to 99 or 101: the largest takes up the difference.
  const largest = parts.reduce<(typeof parts)[number] | null>(
    (a, b) => (a === null || b.share > a.share ? b : a),
    null
  );
  if (largest) largest.share += 100 - parts.reduce((sum, p) => sum + p.share, 0);
  const swatch: Record<string, string> = {
    em: 'bg-dmg-em',
    thermal: 'bg-dmg-thermal',
    kinetic: 'bg-dmg-kinetic',
    explosive: 'bg-dmg-explosive',
  };
  return (
    <div className="flex flex-wrap gap-x-3 text-[0.6875rem] text-text-dim">
      {parts.map((p) => (
        <span key={p.key} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className={cx('inline-block size-[7px]', swatch[p.key])} />
          {t(`fittings.stats.damageType.${p.key}`)} {p.share}%
        </span>
      ))}
    </div>
  );
}
