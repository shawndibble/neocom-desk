/**
 * "N characters haven't granted Mail." with a link to Settings > Permissions,
 * which already asks for one Permission per Character. Shown on a row's face,
 * not behind its expander, so a row that looks normal still says some
 * Characters are missing out.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { PERMISSIONS, type ScopeGroup } from '@/esi/registry';
import { tabPath } from '@/lib/pageTabs';
import { SETTINGS_TABS } from '@/app/pageTabs';

export function PermissionNote({ permission, count }: { permission: ScopeGroup; count: number }) {
  const { t } = useTranslation();
  return (
    <p className="text-[0.6875rem] text-text-dim">
      {t('settings.notifications.permissionNote', {
        count,
        permission: t(PERMISSIONS[permission].labelKey),
      })}{' '}
      <Link to={tabPath(SETTINGS_TABS, 'permissions')} className={inlineLinkClassName}>
        {t('settings.notifications.permissionNoteLink')}
      </Link>
    </p>
  );
}
