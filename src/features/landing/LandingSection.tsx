import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Reveal } from './Reveal';

/** Background tone of a landing band: the page tone, a lighter panel wash, or deep space (stars and a nebula). */
export type LandingTone = 'plain' | 'panel' | 'space';

/** The CCP ship renders kept under public/landing (credited on /data-credit.html). */
export type LandingShip = 'hulk' | 'orca' | 'venture' | 'megathron';

export type LandingShipPlacement = { ship: LandingShip; side: 'left' | 'right' };

const SHIP_CLASS: Record<LandingShipPlacement['side'], string> = {
  left: 'lp-ship-left',
  right: 'lp-ship-right',
};

/**
 * Full-bleed backdrop of a landing band: a tone layer (soft-faded at the top
 * and bottom edge rather than cut by a rule) and an optional ship render
 * bleeding off one edge. All of it is decorative and sits behind the content.
 */
export function LandingBackdrop({
  tone,
  ship,
  eager = false,
}: {
  tone: LandingTone;
  ship?: LandingShipPlacement;
  /** Above the fold: skip lazy loading. */
  eager?: boolean;
}) {
  return (
    <>
      {tone !== 'plain' && (
        <div aria-hidden="true" className={cx('lp-layer', `lp-layer-${tone}`)} />
      )}
      {ship && (
        <img
          src={`/landing/${ship.ship}.webp`}
          alt=""
          aria-hidden="true"
          width={512}
          height={512}
          loading={eager ? 'eager' : 'lazy'}
          // The hero's ship is the landing page's largest paint (#3926).
          fetchPriority={eager ? 'high' : undefined}
          // The eager ship is the largest paint: decode it with the frame, not after (#3950).
          decoding={eager ? undefined : 'async'}
          className={cx('lp-ship', SHIP_CLASS[ship.side])}
        />
      )}
    </>
  );
}

/**
 * One titled band of the landing page, on a full-bleed backdrop with its
 * content held in the page's single `max-w-6xl` column. Named as a landmark
 * rather than left an anonymous `<section>`: on a page this long, "skip to what
 * it does" and "skip to what it asks for" are real navigation, and the name
 * doubles as the handle a test grabs a section by — several labels here
 * (Clones, Market) also appear in the hero's preview panel, so an unscoped
 * query would be ambiguous.
 */
export function LandingSection({
  id,
  heading,
  tone = 'plain',
  ship,
  children,
}: {
  id: string;
  heading: string;
  tone?: LandingTone;
  ship?: LandingShipPlacement;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="relative isolate scroll-mt-16 overflow-hidden"
    >
      <LandingBackdrop tone={tone} ship={ship} />
      <Reveal className="relative mx-auto max-w-6xl px-6 py-16">
        <h2 id={`${id}-heading`} className="text-xl font-semibold">
          {heading}
        </h2>
        {children}
      </Reveal>
    </section>
  );
}
