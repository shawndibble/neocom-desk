import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';

/**
 * Device-local preferences. Deliberately empty for now: the controls that will
 * live here (release-notes state, UI scale, table density) each ship with their
 * own feature, and inventing a placeholder setting would be worse than a page
 * that says so. Unlisted in `Layout`'s nav until it has a real control.
 */
export function Settings() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold tracking-widest uppercase">{t('settings.title')}</h1>
      <EmptyState title={t('settings.emptyTitle')} hint={t('settings.emptyHint')} />
    </div>
  );
}
