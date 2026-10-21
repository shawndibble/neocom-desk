import { HintText } from '@/components/ui/HintText';
import { useTranslation } from 'react-i18next';
import { resistPct } from '@/engine/fittings/stats';
import type { Resonances } from '@/engine/fittings/types';
import {
  DMG_FILL_CLASS,
  DMG_TEXT_CLASS,
  RESIST_TYPES,
  RESONANCE_KEY,
  formatEhp,
  type DamageType,
} from './resistFormat';
import { STAT_EYEBROW, STAT_EYEBROW_TYPE } from '../statKit';
import { fmt0 } from './fixedFormat';

/** One resist, as the game draws it: the damage type's colour filling the share resisted. */
function ResistCell({
  resonance,
  tone,
  unheated,
}: {
  resonance: number;
  tone: DamageType;
  /** The unheated resist as shown, when heat changed it ("Overheat all"). */
  unheated?: string;
}) {
  const { t } = useTranslation();
  const pct = resistPct(resonance);
  return (
    <td className="px-0.5 py-0.5">
      <div className="relative h-5 overflow-hidden rounded-xs bg-panel-2 text-center text-[0.6875rem] leading-5 tabular-nums">
        <div
          className={`absolute inset-y-0 left-0 opacity-45 ${DMG_FILL_CLASS[tone]}`}
          style={{ width: `${pct}%` }}
        />
        {unheated === undefined ? (
          <span className="relative">{fmt0(pct)}%</span>
        ) : (
          <HintText
            content={t('fittings.stats.unheated', { value: unheated })}
            className="relative text-warning"
          >
            {fmt0(pct)}%
            <span className="sr-only"> ({t('fittings.stats.unheated', { value: unheated })})</span>
          </HintText>
        )}
      </div>
    </td>
  );
}

export interface ResistRow {
  key: string;
  label: string;
  sub?: string;
  resonances: Resonances;
  ehp?: number;
  /** Adapted rows read as a note on the row above. */
  tone?: 'note';
  /** Under "Overheat all", each cell heat changed: its unheated value as shown. */
  unheated?: Partial<Record<DamageType | 'ehp', string>>;
}

/**
 * The Defense table (mockup A): a row per layer — its raw HP beneath the
 * name, a cell per damage type, EHP last — and the Reactive Armor
 * Hardener's adapted resists.
 */
export function ResistTable({ rows }: { rows: ResistRow[] }) {
  const { t } = useTranslation();
  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          <th className="w-[26%]" />
          {RESIST_TYPES.map((type) => (
            <th
              key={type}
              scope="col"
              className={`pb-1 text-center ${STAT_EYEBROW_TYPE} ${DMG_TEXT_CLASS[type]}`}
            >
              {t(`fittings.stats.damageTypeShort.${type}`)}
            </th>
          ))}
          <th scope="col" className={`w-[18%] pb-1 text-right ${STAT_EYEBROW}`}>
            {t('fittings.stats.ehpColumn')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th
              scope="row"
              className={`pr-1 text-left align-middle text-xs font-normal ${row.tone ? 'text-warning' : ''}`}
            >
              <span className={row.tone ? '' : 'font-semibold'}>{row.label}</span>
              {row.sub && (
                <span className="block text-[0.6875rem] text-text-dim tabular-nums">{row.sub}</span>
              )}
            </th>
            {RESIST_TYPES.map((type) => (
              <ResistCell
                key={type}
                tone={type}
                resonance={row.resonances[RESONANCE_KEY[type]]}
                unheated={row.unheated?.[type]}
              />
            ))}
            <td className="text-right text-xs tabular-nums">
              {row.unheated?.ehp === undefined ? (
                row.ehp === undefined ? (
                  ''
                ) : (
                  formatEhp(row.ehp)
                )
              ) : (
                <HintText
                  content={t('fittings.stats.unheated', { value: row.unheated.ehp })}
                  className="text-warning"
                >
                  {row.ehp === undefined ? '' : formatEhp(row.ehp)}
                  <span className="sr-only">
                    {' '}
                    ({t('fittings.stats.unheated', { value: row.unheated.ehp })})
                  </span>
                </HintText>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
