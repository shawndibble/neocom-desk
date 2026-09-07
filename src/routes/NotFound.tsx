import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogoMark, buttonClassName } from '@/components/ui';

/**
 * The `*` route. Replaces a silent `<Navigate to="/" replace />`, which sent a
 * mistyped or dead URL to the app's front door with no indication that the
 * address had been wrong at all.
 *
 * Shares `ErrorScreen`'s full-screen shape (src/app/ErrorBoundary.tsx) because
 * they are the same kind of moment — the app has nothing to show and is
 * offering one way out. Links rather than redirects: the point is to say what
 * happened first.
 */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center text-text">
      <LogoMark className="size-7" />
      <h1 className="text-sm font-semibold tracking-widest uppercase">{t('notFound.title')}</h1>
      <p className="max-w-prose text-xs text-text-dim">{t('notFound.hint')}</p>
      <Link to="/" className={buttonClassName({ size: 'sm' })}>
        {t('notFound.home')}
      </Link>
    </main>
  );
}
