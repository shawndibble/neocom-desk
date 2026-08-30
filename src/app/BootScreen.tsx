import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';

/**
 * Full-page "still working out where you are" state. Shared by the index gate
 * (`Root`) and the auth gate (`RequireCharacter`) so an in-progress Dexie read
 * looks the same wherever the user landed — and, more importantly, so neither
 * gate is tempted to treat "not loaded yet" as "logged out".
 */
export function BootScreen() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-text">
      <h1 className="text-sm font-semibold tracking-widest uppercase">{t('app.name')}</h1>
      <Spinner label={t('common.loading')} />
      <p className="text-xs text-text-dim">{t('common.loadingEllipsis')}</p>
    </main>
  );
}
