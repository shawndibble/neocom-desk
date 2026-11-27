import { ExternalLink } from '@/components/ui/ExternalLink';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogoMark, buttonClassName } from '@/components/ui';
import { DISCORD_URL } from '@/lib/links';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';

function NotFoundBody() {
  const { t } = useTranslation();
  return (
    <>
      <LogoMark className="size-7" />
      <h1 className="text-sm font-semibold tracking-widest uppercase">{t('notFound.title')}</h1>
      <p className="max-w-prose text-xs text-text-dim">{t('notFound.hint')}</p>
      <Link to="/" className={buttonClassName({ size: 'sm' })}>
        {t('notFound.home')}
      </Link>
      <ExternalLink href={DISCORD_URL} className="text-xs">
        {t('notFound.discordHint')}
      </ExternalLink>
    </>
  );
}

export function NotFound() {
  useMarkPublicRouteRendered();
  return (
    <main className="safe-inset flex min-h-dvh [--safe-x:1.5rem] [--safe-y:1.5rem] flex-col items-center justify-center gap-3 bg-bg text-center text-text">
      <NotFoundBody />
    </main>
  );
}

export function ShellNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-text">
      <NotFoundBody />
    </div>
  );
}
