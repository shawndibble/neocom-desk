/**
 * Which implants the Fitting's numbers assume, as one chip that names them
 * — "My clone", or the Fitting's own custom set — and opens the set's editor.
 * A Fitting that carries a set is stated on it (`defaultImplantBasis`, as
 * the workspace resolves `basis`); the editor's "Use my clone" drops the
 * set, which is the only way back. The editor itself is `ImplantsEditorHost`,
 * mounted by the page and opened by the URL, so it opens wherever this chip is
 * (a closed panel, a phone's other tab) and Back from a link out of it returns.
 */
import { useTranslation } from 'react-i18next';
import { Descend } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { useImplantsModalUrl } from './useImplantsModalUrl';
import { fieldBaseClassName, fieldSizeClassName } from '@/components/ui/controlStyles';

interface ImplantSetControlProps {
  /** What the stats are on, as the workspace resolved it. */
  basis: ImplantBasis;
  implantSet: FittingImplantSet | undefined;
}

export function ImplantSetControl({ basis, implantSet }: ImplantSetControlProps) {
  const { t } = useTranslation();
  const { openModal } = useImplantsModalUrl('implants');

  const implants = implantSet?.implants.length ?? 0;
  const boosters = implantSet?.boosters.length ?? 0;
  const summary =
    basis === 'clone'
      ? t('fittings.implants.basis.clone')
      : implants + boosters === 0
        ? t('fittings.implants.none')
        : t('fittings.implants.custom', {
            implants: t('fittings.implants.implantCount', { count: implants }),
            boosters: t('fittings.implants.boosterCount', { count: boosters }),
          });

  const label = t('fittings.implants.label');
  // Bordered like the Skills select beside it, but with a right caret (§6c): it opens a dialog, not a list.
  return (
    <button
      type="button"
      aria-label={`${label}: ${summary}`}
      aria-haspopup="dialog"
      onClick={openModal}
      className={cx(
        'flex min-w-0 flex-1 items-center justify-between gap-1',
        fieldBaseClassName,
        fieldSizeClassName.sm
      )}
    >
      <span className="min-w-0 truncate">
        <span className="text-text-dim">{label}: </span>
        {summary}
      </span>
      <Descend aria-hidden className="shrink-0 text-text-dim" />
    </button>
  );
}
