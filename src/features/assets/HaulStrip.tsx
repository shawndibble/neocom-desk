/**
 * A Leg's systems as one cell each, coloured by security (the Route Safety
 * strip's idiom). Each cell's tooltip names its system, security and the last
 * hour's ship and pod kills; an unread feed reads "unknown", never zero.
 *
 * One `role="img"` with the same facts spoken, not a tab stop per cell
 * (DESIGN.md §7: colour is never the only signal): a 38-jump leg would be 38
 * stops, and Route Safety already holds the per-system table.
 */
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { summarizeRouteSafety, type RouteSafetyRow } from '@/engine/route/routeSafety';
import { securityStatusColor } from '@/engine/securityStatus';
import { fixed1 } from '@/lib/fixedFormat';

export function HaulStrip({ rows }: { rows: readonly RouteSafetyRow[] }) {
  const { t } = useTranslation();
  const summary = summarizeRouteSafety(rows);
  const unknown = t('assets.movePlan.haul.strip.unknown');
  const count = (value: number | null) => (value === null ? unknown : String(value));
  const lowest = summary.lowestSecurity === null ? '—' : fixed1(summary.lowestSecurity);
  return (
    <div
      role="img"
      aria-label={t('assets.movePlan.haul.strip.label', {
        count: rows.length,
        lowest,
        ships: count(summary.shipKills),
        pods: count(summary.podKills),
      })}
      className="flex h-3 gap-px"
    >
      {rows.map((row, index) => (
        <Tooltip
          key={index}
          openOnTap
          content={t('assets.movePlan.haul.strip.tip', {
            name: row.name ?? '—',
            security: row.security === null ? '—' : fixed1(row.security),
            ships: count(row.shipKills),
            pods: count(row.podKills),
          })}
        >
          <span
            data-testid="haul-strip-cell"
            className={`min-w-0 flex-1 rounded-[1px] ${row.security === null ? 'bg-line' : ''}`}
            style={
              row.security === null
                ? undefined
                : { backgroundColor: securityStatusColor(row.security) }
            }
          />
        </Tooltip>
      ))}
    </div>
  );
}
