import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { minersOnMoon } from '@/engine/corpTaxBook/bookSections';
import { extractionDetail } from '@/engine/corpTaxBook/bookView';
import { moonLoss } from '@/engine/corpTaxBook/moonLoss';
import { formatCount } from '@/lib/formatCount';
import { dateTimeUtc } from './moonsFormat';
import { editErrorMessage, useBook } from './useBook';

/**
 * A moon's ore loss, under the page's header facts (issue #5257). Flagged Fully Mined it is the
 * Residue per ore; unflagged it is residue plus ore never mined, labelled so. No chunk source:
 * no figure and no button. Marking and clearing are one click each, both audited server-side.
 */
export function FullyMinedPanel({ id }: { id: string }) {
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const row = extractionDetail(view, id)?.row;
  if (!row) return null;
  const mined = minersOnMoon(view, id).flatMap((m) => m.lines);
  const loss = moonLoss(row.oreLines, mined, row.fullyMined !== undefined);
  if (!loss)
    return <p className="text-sm text-text-dim">{t('corpTaxBook.moons.fullyMined.noSource')}</p>;

  const flagged = loss.kind === 'residue';
  const set = async (fullyMined: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await edit({ action: 'setFullyMined', extractionId: id, fullyMined });
    } catch (e) {
      setError(editErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const head = 'py-1 font-normal ' + eyebrowClassName;
  return (
    <section className="space-y-3" aria-labelledby={`fully-mined-${id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={`fully-mined-${id}`} className="text-base font-semibold">
            {t(
              flagged ? 'corpTaxBook.moons.fullyMined.residue' : 'corpTaxBook.moons.fullyMined.lost'
            )}
          </h2>
          <p className="text-xs text-text-dim">
            {t(
              flagged
                ? 'corpTaxBook.moons.fullyMined.summaryResidue'
                : 'corpTaxBook.moons.fullyMined.summaryCombined',
              { pct: loss.totalPct }
            )}
          </p>
        </div>
        {canEdit && !flagged && (
          <Button size="sm" disabled={busy} onClick={() => void set(true)}>
            {t('corpTaxBook.moons.fullyMined.mark')}
          </Button>
        )}
      </div>
      <p className="text-xs text-text-dim">
        {row.fullyMined ? (
          <>
            {t('corpTaxBook.moons.fullyMined.markedBy', {
              name: row.fullyMined.byName,
              at: dateTimeUtc(row.fullyMined.at),
            })}
            {canEdit && (
              <>
                {' '}
                <button
                  type="button"
                  className={entityLinkClassName()}
                  disabled={busy}
                  onClick={() => void set(false)}
                >
                  {t('corpTaxBook.moons.fullyMined.clear')}
                </button>
              </>
            )}
          </>
        ) : (
          t('corpTaxBook.moons.fullyMined.why')
        )}
      </p>
      {error !== undefined && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <table
        className="w-full text-sm tabular-nums"
        aria-label={t('corpTaxBook.moons.fullyMined.tableLabel')}
      >
        <thead>
          <tr className="text-left">
            <th className={head}>{t('corpTaxBook.moons.fullyMined.cols.ore')}</th>
            <th className={head + ' text-right'}>{t('corpTaxBook.moons.fullyMined.cols.chunk')}</th>
            <th className={head + ' text-right'}>{t('corpTaxBook.moons.fullyMined.cols.mined')}</th>
            <th className={head + ' text-right'}>
              {t(
                flagged
                  ? 'corpTaxBook.moons.fullyMined.cols.residue'
                  : 'corpTaxBook.moons.fullyMined.cols.lost'
              )}
            </th>
            <th className={head + ' text-right'}>%</th>
          </tr>
        </thead>
        <tbody>
          {loss.rows.map((r) => (
            <tr key={r.typeId} className="border-t border-line">
              <td className="py-1 pr-2 font-sans">{names.ore(r.typeId)}</td>
              <td className="py-1 text-right">{formatCount(r.chunk)}</td>
              <td className="py-1 text-right">{formatCount(r.mined)}</td>
              <td className="py-1 text-right">{formatCount(r.lost)}</td>
              <td className="py-1 text-right">{r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
