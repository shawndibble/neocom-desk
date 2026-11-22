import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { minersOnMoon } from '@/engine/corpTaxBook/bookSections';
import { extractionDetail } from '@/engine/corpTaxBook/bookView';
import { moonLoss } from '@/engine/corpTaxBook/moonLoss';
import { formatCount } from '@/lib/formatCount';
import { dateTimeAt } from './moonsFormat';
import { editErrorMessage, useBook } from './useBook';

/**
 * A moon's ore loss, under the page's header facts (issue #5257). Flagged Fully Mined it is the
 * Residue per ore; unflagged it is residue plus ore never mined, labelled so. No chunk source:
 * no figure and no button. Marking and clearing are one click each, both audited server-side.
 */
export function FullyMinedPanel({ id }: { id: string }) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const row = extractionDetail(view, id)?.row;
  if (!row) return null;
  const mined = minersOnMoon(view, id).flatMap((m) => m.lines);
  // A chunk rebuilt from what was mined has nothing to lose: its loss is unknowable, not 0%.
  const loss =
    row.oreSource === 'mined' ? null : moonLoss(row.oreLines, mined, row.fullyMined !== undefined);
  const setMark = async (fullyMined: boolean) => {
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
  if (!loss)
    return (
      <p className="text-sm text-text-dim">
        {t(
          row.oreSource === 'mined'
            ? 'corpTaxBook.moons.fullyMined.unknownLoss'
            : 'corpTaxBook.moons.fullyMined.noSource'
        )}
        {row.fullyMined && canEdit && (
          <>
            {' '}
            <button
              type="button"
              className={entityLinkClassName(
                'aria-disabled:cursor-not-allowed aria-disabled:opacity-40'
              )}
              aria-disabled={busy || undefined}
              onClick={busy ? undefined : () => void setMark(false)}
            >
              {t('corpTaxBook.moons.fullyMined.clear')}
            </button>
          </>
        )}
      </p>
    );

  const flagged = loss.kind === 'residue';
  const head = 'py-1 font-normal ' + eyebrowClassName;
  return (
    // A panel like the page's other sections, so it reads as one of them (not loose text).
    <Panel
      title={t(
        flagged ? 'corpTaxBook.moons.fullyMined.residue' : 'corpTaxBook.moons.fullyMined.lost'
      )}
      meta={t(
        flagged
          ? 'corpTaxBook.moons.fullyMined.summaryResidue'
          : 'corpTaxBook.moons.fullyMined.summaryCombined',
        { pct: loss.totalPct }
      )}
      wrapMeta
      actions={
        canEdit &&
        !flagged &&
        row.state !== 'extracting' && (
          <Button size="sm" aria-disabled={busy || undefined} onClick={() => void setMark(true)}>
            {t('corpTaxBook.moons.fullyMined.mark')}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-text-dim">
          {row.fullyMined ? (
            <>
              {t('corpTaxBook.moons.fullyMined.markedBy', {
                name: row.fullyMined.byName,
                at: dateTimeAt(row.fullyMined.at, zone),
              })}
              {canEdit && (
                <>
                  {' '}
                  <button
                    type="button"
                    className={entityLinkClassName(
                      'aria-disabled:cursor-not-allowed aria-disabled:opacity-40'
                    )}
                    aria-disabled={busy || undefined}
                    onClick={busy ? undefined : () => void setMark(false)}
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
        {error !== undefined && <InlineError>{error}</InlineError>}
        <table
          className="w-full text-sm tabular-nums"
          aria-label={t('corpTaxBook.moons.fullyMined.tableLabel')}
        >
          <thead>
            <tr className="text-left">
              <th className={head}>{t('corpTaxBook.moons.fullyMined.cols.ore')}</th>
              <th className={head + ' text-right'}>
                {t('corpTaxBook.moons.fullyMined.cols.chunk')}
              </th>
              <th className={head + ' text-right'}>
                {t('corpTaxBook.moons.fullyMined.cols.mined')}
              </th>
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
      </div>
    </Panel>
  );
}
