import { useTranslation } from 'react-i18next';
import { StatChange } from '@/components/ui';
import type { AddPreview } from './useModuleAddPreview';
import { fixed1 } from '@/lib/fixedFormat';

/** Most changed stats listed; the rest collapse into "and N more". */
const MAX_LISTED = 6;

interface AddPreviewReadoutProps {
  preview: AddPreview;
  name: string;
}

/**
 * What adding the hovered or focused module would change on the whole
 * Fitting: each changed stat before → after (at the stats panel's
 * rounding), then whether it fits and the pilot can fly it. Sticks to the
 * bottom of the browser so showing it never moves the rows under the pointer.
 */
export function AddPreviewReadout({ preview, name }: AddPreviewReadoutProps) {
  const { t } = useTranslation();
  const { delta, fits, overage, canFly } = preview;
  const listed = delta.changes.slice(0, MAX_LISTED);
  const hidden = delta.count - listed.length;
  return (
    <div
      role="status"
      className="sticky bottom-0 z-10 space-y-1 rounded-xs border border-border bg-panel-2 px-2 py-1.5 text-xs"
    >
      <p className="font-semibold">{t('fittings.add.preview.title', { name })}</p>
      {listed.length === 0 ? (
        <p className="text-text-dim">{t('fittings.variations.noChanges')}</p>
      ) : (
        <ul className="space-y-0.5">
          {listed.map((change) => (
            <li key={change.key}>
              <StatChange change={change} />
            </li>
          ))}
          {hidden > 0 && (
            <li className="text-text-dim">{t('fittings.add.preview.more', { count: hidden })}</li>
          )}
        </ul>
      )}
      <p className={fits && canFly ? 'text-text-dim' : 'text-warning'}>
        {[
          fits
            ? t('fittings.variations.fitsYes')
            : overage
              ? t('fittings.variations.stillOverBy', {
                  amount: fixed1(overage.amount),
                  resource: t(`fittings.list.${overage.resource}`),
                })
              : t('fittings.variations.fitsNo'),
          canFly ? t('fittings.variations.canFlyYes') : t('fittings.variations.canFlyNo'),
        ].join(' · ')}
      </p>
    </div>
  );
}
