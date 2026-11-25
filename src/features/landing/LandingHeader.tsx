import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { hudLabelClassName } from './hudLabel';
import { useTranslation } from 'react-i18next';
import { EveSsoButton, LogoMark, Tooltip, iconButtonClassName } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { Discord, Github } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { LANDING_ANCHORS } from './landingAnchors';
import { DISCORD_URL, REPO_URL } from '@/lib/links';

/**
 * Whether every large login button on the page is scrolled out of view. `targets`
 * must be a stable array. Starts
 * as "visible" and stays that way until each target has reported, and without
 * `IntersectionObserver` (jsdom, very old browsers), so the header never shows
 * a second login button by default.
 */
function useAllOutOfView(targets: RefObject<HTMLElement | null>[]): boolean {
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = targets.map((target) => target.current).filter((el) => el !== null);
    if (elements.length === 0) return;
    const visible = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target, entry.isIntersecting);
      setOut(
        visible.size === elements.length && [...visible.values()].every((isShown) => !isShown)
      );
    });
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [targets]);
  return out;
}

const ANCHOR_CLASS = cx(
  hudLabelClassName,
  'rounded-xs px-2 py-1 text-xs text-text-dim hover:text-text',
  interactiveClassName,
  focusRingClassName
);

/**
 * The landing page's sticky banner: brand, section anchors (lg up), Discord and
 * GitHub, and, once no large login button is in view, a small one in its place.
 * Phones get the logo and Discord, and that conditional button in a bar fixed
 * to the bottom of the screen.
 */
export function LandingHeader({
  ctaRefs,
  pending,
  onLogin,
}: {
  /** Wrap each of the page's large login buttons; the header's own appears only when none is in the viewport. */
  ctaRefs: RefObject<HTMLElement | null>[];
  pending: boolean;
  onLogin: () => void;
}) {
  const { t } = useTranslation();
  const ctaOut = useAllOutOfView(ctaRefs);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95">
      <div className="mx-auto flex max-w-[96rem] items-center gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-hud text-base font-bold tracking-wider whitespace-nowrap uppercase">
            {t('app.name')}
          </span>
        </div>
        {/* Left-aligned after the name, so the header's login button opening on the right never moves it. */}
        <nav aria-label={t('login.header.nav')} className="ml-6 hidden lg:flex">
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
        <div className="ml-auto flex items-center gap-1">
          <HeaderIconLink href={DISCORD_URL} label={t('login.header.discord')}>
            <Discord aria-hidden="true" />
          </HeaderIconLink>
          <span className="hidden sm:inline-flex">
            <HeaderIconLink href={REPO_URL} label={t('login.header.github')}>
              <Github aria-hidden="true" />
            </HeaderIconLink>
          </span>
          {/*
            From md: always laid out, collapsed to zero width until no large
            login button is in view. Opening the track (not mounting the
            button) is what slides the icons beside it over instead of making
            them jump. Below md the same button rides in a bar fixed to the
            bottom of the screen, under the thumb, sliding up into view.
            Collapsed it is `inert` and hidden from assistive tech, so it can
            neither be tabbed to nor announced. Without motion it just appears.
          */}
          <div
            data-open={ctaOut}
            inert={!ctaOut}
            aria-hidden={!ctaOut}
            className={cx(
              'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:flex max-md:justify-center max-md:border-t max-md:border-accent/30 max-md:bg-bg/95 max-md:px-4 max-md:pt-2.5 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
              'max-md:translate-y-full max-md:data-[open=true]:translate-y-0 max-md:motion-safe:transition-transform max-md:motion-safe:duration-300',
              'md:grid md:grid-cols-[0fr] md:data-[open=true]:grid-cols-[1fr] md:motion-safe:transition-[grid-template-columns] md:motion-safe:duration-300 md:motion-safe:ease-out'
            )}
          >
            <div className="min-w-0 md:overflow-hidden">
              <div
                className={cx(
                  'md:pl-2 md:opacity-0 md:data-[open=true]:opacity-100',
                  'md:motion-safe:transition-[opacity,translate] md:motion-safe:duration-300 md:motion-safe:ease-out',
                  'md:translate-x-3 md:data-[open=true]:translate-x-0'
                )}
                data-open={ctaOut}
              >
                <EveSsoButton
                  size="small"
                  pending={pending}
                  onClick={onLogin}
                  label={t('login.button')}
                />
              </div>
            </div>
          </div>
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
      <ExternalLink
        href={href}
        variant="bare"
        mark="text"
        aria-label={label}
        className={iconButtonClassName({ variant: 'plain' })}
      >
        {children}
      </ExternalLink>
    </Tooltip>
  );
}
