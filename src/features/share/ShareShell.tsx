import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { Button, buttonClassName, LogoMark, textActionClassName } from '@/components/ui';
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
  /** Header-right controls, e.g. a table's export menu. */
  actions?: ReactNode;
  /** Omitted while nothing is loaded yet, or the link is dead — the plain app root then. */
  openInApp?: OpenInApp;
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
export function ShareShell({ title, hideTitle, actions, openInApp, children }: ShareShellProps) {
  const { t } = useTranslation();
  const characterCount = useLiveQuery(() => db.characters.count());
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

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-bg p-6 text-text">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 text-xl font-semibold tracking-wide">
          <LogoMark className="size-9" />
          {t('share.brand')}
        </Link>
        {signedOut ? (
          <div className="flex flex-col items-end gap-1 max-sm:w-full max-sm:items-stretch">
            <Button variant="accent" size="sm" loading={loggingIn} onClick={logIn}>
              {t('share.logIn')}
            </Button>
            <button type="button" className={textActionClassName()} onClick={choosePermissions}>
              {t('share.choosePermissions')}
            </button>
            <CustomizePermissionsDialog open={customizing} onClose={() => setCustomizing(false)} />
          </div>
        ) : (
          <Link
            to={target.path}
            state={target.state}
            onClick={loading ? () => setLoginReturnTo(target.path) : undefined}
            className={buttonClassName({ variant: 'accent' })}
          >
            {t('share.openInApp')}
          </Link>
        )}
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
