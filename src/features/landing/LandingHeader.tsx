import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { EveSsoButton, LogoMark, Tooltip, iconButtonClassName } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { Discord, Github } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { LANDING_ANCHORS } from './landingAnchors';
import { DISCORD_URL, REPO_URL } from '@/lib/links';

/**
 * Whether the hero's large login button is scrolled out of view. Starts as
 * "visible" and stays that way without `IntersectionObserver` (jsdom, very old
 * browsers), so the header never shows a second login button by default.
 */
function useHeroOutOfView(target: RefObject<HTMLElement | null>): boolean {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setOut(!last.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  return out;
}

const ANCHOR_CLASS = cx(
  'rounded-xs px-2 py-1 text-sm text-text-dim hover:text-text',
  interactiveClassName,
  focusRingClassName
);

/**
 * The landing page's sticky banner: brand, section anchors (md up), Discord and
 * GitHub, and, once the hero's large login button has scrolled away, a small
 * one in its place. Phones get the logo, Discord and that conditional button.
 */
export function LandingHeader({
  heroCtaRef,
  pending,
  onLogin,
}: {
  /** Wraps the hero's large login button; the header's own appears only when this leaves the viewport. */
  heroCtaRef: RefObject<HTMLElement | null>;
  pending: boolean;
  onLogin: () => void;
}) {
  const { t } = useTranslation();
  const heroOut = useHeroOutOfView(heroCtaRef);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="text-sm font-bold tracking-wide">{t('app.name')}</span>
        </div>
        <nav aria-label={t('login.header.nav')} className="hidden flex-1 justify-center md:flex">
          <ul className="flex gap-1">
            {LANDING_ANCHORS.map(({ id, key }) => (
              <li key={id}>
                <a href={`#${id}`} className={ANCHOR_CLASS}>
                  {t(`login.header.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <HeaderIconLink href={DISCORD_URL} label={t('login.header.discord')}>
            <Discord aria-hidden="true" />
          </HeaderIconLink>
          <span className="hidden sm:inline-flex">
            <HeaderIconLink href={REPO_URL} label={t('login.header.github')}>
              <Github aria-hidden="true" />
            </HeaderIconLink>
          </span>
          {heroOut && (
            <div className="landing-header-cta-in ml-2">
              <EveSsoButton
                size="small"
                pending={pending}
                onClick={onLogin}
                label={t('login.button')}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** An icon-only link to another site: IconButton's look, an anchor's semantics, opened in a new tab like `ExternalLink`. */
function HeaderIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={iconButtonClassName({ variant: 'plain' })}
      >
        {children}
      </a>
    </Tooltip>
  );
}
