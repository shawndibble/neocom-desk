import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';

/**
 * Filing is blocked: the corp's Hull Rule says Not covered. `hull` is named when the page knows
 * it (a pick from the lost-ships list); a pasted link's refusal comes without a hull name.
 */
export function NotCoveredNote({ hull }: { hull?: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex items-start gap-2 text-sm">
      <Icon.Warn className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <p>
        <strong className="font-semibold text-danger">
          {hull
            ? t('srpMember.notCovered.withHull', { hull })
            : t('srpMember.notCovered.withoutHull')}
        </strong>{' '}
        {t('srpMember.notCovered.body')}
      </p>
    </div>
  );
}
