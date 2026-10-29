import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { buttonClassName, EveSsoButton, LogoMark, plainTextActionClassName } from '@/components/ui';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';

/** Where "Open Neocom Desk" lands: the page the share came from, with its content filled in. */
export interface OpenInApp {
  /** Path plus query — survives a login round trip, so it is all a signed-out visitor keeps. */
  path: string;
  /** Router state for a visitor already signed in; lost across a login. */
  state?: unknown;
}

interface ShareShellProps {
  title: string;
  /** Keep the title for screen readers only, when the page body already says what it is. */
  hideTitle?: boolean;
  /** The page's own primary controls, e.g. a table's export menu. On a `wide` page they sit at the right of the row under the header. */
  actions?: ReactNode;
  /** Omitted while nothing is loaded yet, or the link is dead — the plain app root then. */
  openInApp?: OpenInApp;
  /** Widens the frame for a page that lays out two columns, and puts the title in the header row beside the brand; the other share pages stay a single narrow one. */
  wide?: boolean;
  /** A note for a signed-out visitor. On a `wide` page it fills the strip beside the page's `actions`. */
  notice?: ReactNode;
  /** Quiet header facts after the title, on `wide` pages (a link's expiry). */
  meta?: ReactNode;
  /** Beside the notice strip, on `wide` pages (the shared Fitting's ship and name). */
  lead?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every Share Link page renders in: no navigation chrome (it sits
 * outside `RequireCharacter` and `ScopeGate`), the brand and one way
 * into the live app in a header, then the page's title. A visitor with no Character gets "Log in" instead,
 * which starts the EVE login right here with `setLoginReturnTo` carrying them
 * on to the same page after, and a small "Choose permissions" link under it
 * that opens the Customize permissions dialog first (#3075).
 */
export function ShareShell({
  title,
  hideTitle,
  actions,
  openInApp,
  wide,
  notice,
  lead,
  meta,
  children,
}: ShareShellProps) {
  const { t } = useTranslation();
  const characterCount = useCharacterCountOrLoading();
  const signedOut = characterCount === 0;
  // Until the count loads, the link goes straight to the target but still
  // stashes it: a visitor who turns out to have no Character is bounced to
  // login by `RequireCharacter`, and lands back on the target after.
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
    // Stashed before the dialog opens: its submit leaves the page for EVE's.
    setLoginReturnTo(target.path);
    setCustomizing(true);
  }

  const loginControls = (
    <div className="flex flex-col items-end gap-1">
      <EveSsoButton size="small" pending={loggingIn} onClick={logIn} label={t('share.logIn')} />
      <button type="button" className={plainTextActionClassName()} onClick={choosePermissions}>
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

  if (wide) {
    // The login stays in the header; the page's own action rides in the notice strip.
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 bg-bg p-2 text-text sm:p-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-3 sm:gap-x-4">
          <Link
            to="/"
            className="order-1 flex min-w-0 items-center gap-2 text-base font-semibold tracking-wide sm:text-lg"
          >
            <LogoMark className="size-6 shrink-0 sm:size-7" />
            {/* The icon alone on the narrowest phones, so the login keeps its row. */}
            <span className="max-[369px]:sr-only">{t('share.brand')}</span>
          </Link>
          {/* Phone: its own row under brand and login. From sm: between them. */}
          <div className="order-3 flex w-full items-center gap-4 sm:order-2 sm:w-auto sm:border-l sm:border-line sm:pl-4">
            <h1 className={hideTitle ? 'sr-only' : 'text-xs tracking-widest uppercase'}>{title}</h1>
            {meta !== undefined && (
              <span className={hideTitle ? 'sm:border-l-0' : 'border-l border-line pl-4'}>
                {meta}
              </span>
            )}
          </div>
          <span className="order-2 ml-auto shrink-0 sm:order-3">
            {signedOut ? loginControls : openInAppLink}
          </span>
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
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-bg p-2 text-text sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 text-xl font-semibold tracking-wide">
          <LogoMark className="size-9" />
          {t('share.brand')}
        </Link>
        {signedOut ? loginControls : openInAppLink}
      </header>

      <main className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-2">
          <h1 className={hideTitle ? 'sr-only' : 'text-sm font-semibold tracking-widest uppercase'}>
            {title}
          </h1>
          {actions && <span className="ml-auto">{actions}</span>}
        </div>

        {children}
      </main>
    </div>
  );
}
