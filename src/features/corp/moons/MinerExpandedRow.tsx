import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { daysByPhase, minerMoons } from '@/engine/corpTaxBook/bookSections';
import { minerDetail, type MinerRow } from '@/engine/corpTaxBook/bookView';
import { useBook } from './useBook';
import { isk, shortDate } from './moonsFormat';
import { extractionPath, minerPath } from './moonsPaths';

const SHOWN = 3;

/**
 * A Miner's row opened in place (#5247): the next Statement's days, what is still accruing,
 * the last payments and the moons they mined, with "Open page" as the one default action.
 */
export function MinerExpandedRow({ miner }: { miner: MinerRow }) {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const detail = minerDetail(view, miner.id);
  const next = daysByPhase(detail?.days ?? []).nextStatement;
  const payments = (detail?.payments ?? []).slice(0, 2);
  const moons = minerMoons(view, miner.id);
  const moonName = (m: (typeof moons)[number]) =>
    m.moonId === undefined ? names.refinery(m.structureId) : names.moon(m.moonId);
  return (
    <div className="space-y-3 p-3">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className={eyebrowClassName}>
            {t('corpTaxBook.moons.sections.nextStatement')} · {next.length}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {next.slice(0, SHOWN).map((d) => (
              <li key={d.key} className="flex justify-between gap-3 tabular-nums">
                <span className="min-w-0 truncate">
                  {shortDate(d.date)} · {d.oreLines.map((l) => names.ore(l.typeId)).join(', ')}
                </span>
                <span>{isk(d.tax)}</span>
              </li>
            ))}
            {next.length > SHOWN && (
              <li className="text-xs text-text-dim">
                {t('corpTaxBook.moons.miners.moreDays', { count: next.length - SHOWN })}
              </li>
            )}
            {next.length === 0 && <li className="text-text-dim">—</li>}
            {miner.pending > 0 && (
              <li className="text-text-dim tabular-nums">
                {t('corpTaxBook.moons.miners.accruing', { amount: isk(miner.pending) })}
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className={eyebrowClassName}>{t('corpTaxBook.moons.miners.lastPayments')}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 tabular-nums">
                <span className="min-w-0 truncate">
                  {shortDate(p.at)} · {names.character(p.characterId)}
                </span>
                <span className="text-isk-pos">+{isk(p.amount)}</span>
              </li>
            ))}
            {payments.length === 0 && <li className="text-text-dim">—</li>}
          </ul>
        </div>
        <div>
          <p className={eyebrowClassName}>
            {t('corpTaxBook.moons.miner.moons')} · {moons.length}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {moons.slice(0, SHOWN).map((m) => (
              <li key={m.key} className="flex justify-between gap-3 tabular-nums">
                {m.extractionId === undefined ? (
                  <span className="min-w-0 truncate">{moonName(m)}</span>
                ) : (
                  <Link
                    to={extractionPath(m.extractionId)}
                    className={entityLinkClassName('min-w-0 truncate')}
                  >
                    {moonName(m)}
                  </Link>
                )}
                <span>{isk(m.tax)}</span>
              </li>
            ))}
            {moons.length > SHOWN && (
              <li className="text-xs text-text-dim">
                {t('corpTaxBook.moons.miners.moreMoons', { count: moons.length - SHOWN })}
              </li>
            )}
            {moons.length === 0 && <li className="text-text-dim">—</li>}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <span className="text-xs text-text-dim tabular-nums">
          {t('corpTaxBook.moons.miners.owedLine', {
            owed: isk(miner.owed),
            next: isk(miner.unbilled),
          })}
        </span>
        <Link
          to={minerPath(miner.id)}
          className={entityLinkClassName('shrink-0 whitespace-nowrap')}
        >
          {t('corpTaxBook.moons.miners.openPage')}
        </Link>
      </div>
    </div>
  );
}
