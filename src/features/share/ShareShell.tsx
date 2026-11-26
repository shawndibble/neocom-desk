import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { buttonClassName, EveSsoButton, LogoMark, plainTextActionClassName } from '@/components/ui';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';

export interface OpenInApp {
  path: string;
  state?: unknown;
}

interface ShareShellProps {
  title: string;
  actions?: ReactNode;
  openInApp?: OpenInApp;
  wide?: boolean;
  notice?: ReactNode;
  footer?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}

export function ShareShell({
  title,
  actions,
  openInApp,
  wide,
  notice,
  lead,
  footer,
  children,
}: ShareShellProps) {
  const { t } = useTranslation();
  const characterCount = useCharacterCountOrLoading();
  const signedOut = characterCount === 0;
  const loading = characterCount === undefined;
  const target = openInApp ?? { path: '/' };
  const [customizing, setCustomizing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  function logIn() {
    setLoggingIn(true);
    setLoginReturnTo(target.path);
    void beginAddCharacterLogin().catch(() => setLoggingIn(false));
  }

  function choosePermissions() {
    setLoginReturnTo(target.path);
    setCustomizing(true);
  }

  const loginControls = (
    <div className="flex flex-col items-end gap-1">
      <EveSsoButton size="small" pending={loggingIn} onClick={logIn} label={t('share.logIn')} />
      <button
        type="button"
        className={plainTextActionClassName('-my-1 py-1')}
        onClick={choosePermissions}
      >
        {t('share.choosePermissions')}
      </button>
      <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
    </div>
  );

  const openInAppLink = (
    <Link
      to={target.path}
      state={target.state}
      onClick={loading ? () => setLoginReturnTo(target.path) : undefined}
      className={buttonClassName()}
    >
      {t('share.openInApp')}
    </Link>
  );

  return (
    <div
      className={`safe-inset mx-auto flex min-h-dvh ${wide ? 'max-w-4xl' : 'max-w-3xl'} flex-col gap-4 bg-bg text-text [--safe-x:0.5rem] [--safe-y:0.5rem] sm:[--safe-x:1.5rem] sm:[--safe-y:1.5rem]`}
    >
      <header className="flex items-center gap-3 border-b border-line pb-3 sm:gap-4">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-wide sm:text-lg"
        >
          <LogoMark className="size-6 shrink-0 sm:size-7" />
          <span className="max-[369px]:sr-only">{t('share.brand')}</span>
        </Link>
        <h1 className="sr-only">{title}</h1>
        <span className="ml-auto shrink-0">{signedOut ? loginControls : openInAppLink}</span>
      </header>

      <main className="flex flex-1 flex-col gap-4">
        {(lead !== undefined || actions !== undefined || (signedOut && notice !== undefined)) && (
          <div className="flex flex-wrap items-center gap-4">
            {lead !== undefined && <div className="min-w-0 flex-1 basis-72">{lead}</div>}
            {signedOut && notice !== undefined ? (
              <div className="flex flex-1 basis-96 flex-wrap items-center justify-between gap-3 rounded-xs border border-warning bg-panel-2 py-2 pr-2 pl-3">
                <p className="min-w-48 flex-1 text-xs text-warning">{notice}</p>
                {actions && <span className="flex items-center gap-3">{actions}</span>}
              </div>
            ) : (
              actions && <span className="ml-auto flex items-center gap-3">{actions}</span>
            )}
          </div>
        )}

        {children}

        {footer !== undefined && <footer className="mt-auto pt-2">{footer}</footer>}
      </main>
    </div>
  );
}
