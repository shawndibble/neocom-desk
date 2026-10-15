import { useEffect, useState, type ReactNode, type RefObject } from 'react';
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
  'rounded-xs px-2 py-1 text-sm text-text-dim hover:text-text',
  interactiveClassName,
  focusRingClassName
);

/**
 * The landing page's sticky banner: brand, section anchors (md up), Discord and
 * GitHub, and, once no large login button is in view, a small
 * one in its place. Phones get the logo, Discord and that conditional button.
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
    <header
      data-cta-open={ctaOut}
      className="group sticky top-0 z-30 border-b border-line bg-bg/95"
    >
      <div className="mx-auto flex max-w-[96rem] items-center gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          {/* On a phone the login button needs the room: the name goes visually hidden while it shows. */}
          <span className="text-sm font-bold tracking-wide whitespace-nowrap max-sm:group-data-[cta-open=true]:sr-only">
            {t('app.name')}
          </span>
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
          {/*
            Always laid out, collapsed to zero width until no large login
            button is in view: opening the track (not mounting the button) is
            what slides the icons beside it over instead of making them jump.
            Collapsed it is `inert` and hidden from assistive tech, so it can
            neither be tabbed to nor announced. Without motion the width just
            changes at once.
          */}
          <div
            data-open={ctaOut}
            inert={!ctaOut}
            aria-hidden={!ctaOut}
            className="grid grid-cols-[0fr] data-[open=true]:grid-cols-[1fr] motion-safe:transition-[grid-template-columns] motion-safe:duration-300 motion-safe:ease-out"
          >
            <div className="min-w-0 overflow-hidden">
              <div
                className={cx(
                  'pl-2 opacity-0 data-[open=true]:opacity-100',
                  'motion-safe:transition-[opacity,translate] motion-safe:duration-300 motion-safe:ease-out',
                  'translate-x-3 data-[open=true]:translate-x-0'
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
