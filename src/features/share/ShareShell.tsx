import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { buttonClassName, LogoMark } from '@/components/ui';

/** Where "Open Neocom Desk" lands: the page the share came from, with its content filled in. */
export interface OpenInApp {
  /** Path plus query — survives a login round trip, so it is all a signed-out visitor keeps. */
  path: string;
  /** Router state for a visitor already signed in; lost across a login. */
  state?: unknown;
}

interface ShareShellProps {
  title: string;
  /** Header-right controls, e.g. a table's export menu. */
  actions?: ReactNode;
  /** Omitted while nothing is loaded yet, or the link is dead — the plain app root then. */
  openInApp?: OpenInApp;
  children: ReactNode;
}

/**
 * The frame every Share Link page renders in: no navigation chrome (it sits
 * outside `RequireCharacter` and `ScopeGate`), the brand, a title, and one way
 * back into the live app. A visitor with no Character goes through login
 * first, with `setLoginReturnTo` carrying them on to the same page after —
 * the path the Fitting share view (#1544) set up.
 */
export function ShareShell({ title, actions, openInApp, children }: ShareShellProps) {
  const { t } = useTranslation();
  const characterCount = useLiveQuery(() => db.characters.count());
  const signedOut = characterCount === 0;
  // Until the count loads, the link goes straight to the target but still
  // stashes it: a visitor who turns out to have no Character is bounced to
  // login by `RequireCharacter`, and lands back on the target after.
  const loading = characterCount === undefined;
  const target = openInApp ?? { path: '/' };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-bg p-6 text-text">
      <div className="flex items-center gap-2">
        <LogoMark className="size-6" />
        <h1 className="text-sm font-semibold tracking-widest uppercase">{title}</h1>
        {actions && <span className="ml-auto">{actions}</span>}
      </div>

      {children}

      <Link
        to={signedOut ? '/login' : target.path}
        state={signedOut ? undefined : target.state}
        onClick={signedOut || loading ? () => setLoginReturnTo(target.path) : undefined}
        className={buttonClassName({ size: 'sm' })}
      >
        {t('share.openInApp')}
      </Link>
    </main>
  );
}
