import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { GroupOwnedDifference } from './planMaterialsView';

/**
 * One line under a member plan's Owned Material Source row when its owned
 * counts and the Build Group's ledger disagree: the group page counts only the
 * group's own ledger, so the two totals can differ by design (the Group Owned
 * Overlay decision). Renders nothing when they agree or the plan has no group.
 */
export function GroupOwnedDiffersHint({
  difference,
  group,
}: {
  difference: GroupOwnedDifference | null;
  group: { id: string; name: string } | null;
}) {
  const { t, i18n } = useTranslation();
  if (!difference || !group) return null;
  const fmt = new Intl.NumberFormat(i18n.language);
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-dim">
      <Icon.Warn size={Icon.ICON_SIZE.sm} className="text-warning" aria-hidden />
      <span>
        {t('industry.groupOwnedDiffers', {
          group: group.name,
          groupQty: fmt.format(difference.group),
          material: difference.name,
          planQty: fmt.format(difference.plan),
        })}
      </span>
      <Link to={`/industry/groups/${group.id}`} className={inlineLinkClassName}>
        {t('industry.openTheGroup')}
      </Link>
    </p>
  );
}
