import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { hudLabelClassName } from './hudLabel';
import { landingAnchor } from './landingAnchors';
import { cx } from '@/lib/cx';
import { Reveal } from './Reveal';

export type LandingTone = 'plain' | 'panel' | 'space';

export type LandingShip = 'hulk' | 'orca' | 'venture' | 'megathron';

export type LandingShipPlacement = { ship: LandingShip; side: 'left' | 'right' };

const SHIP_CLASS: Record<LandingShipPlacement['side'], string> = {
  left: 'lp-ship-left',
  right: 'lp-ship-right',
};

export function LandingBackdrop({
  tone,
  ship,
  eager = false,
}: {
  tone: LandingTone;
  ship?: LandingShipPlacement;
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
          fetchPriority={eager ? 'high' : undefined}
          decoding={eager ? undefined : 'async'}
          className={cx('lp-ship', SHIP_CLASS[ship.side])}
        />
      )}
    </>
  );
}

function LandingHeading({ id, heading, lead }: { id: string; heading: string; lead?: string }) {
  const { t } = useTranslation();
  const { index, key } = landingAnchor(id);
  return (
    <>
      <p className={cx(hudLabelClassName, 'text-xs text-accent')}>
        {index} · {t(`login.header.${key}`)}
      </p>
      <h2
        id={`${id}-heading`}
        className="mt-2 font-hud text-3xl leading-tight font-bold text-balance uppercase sm:text-4xl"
      >
        {heading}
      </h2>
      {lead && <p className="mt-3 max-w-2xl text-text-dim">{lead}</p>}
    </>
  );
}

export function LandingSection({
  id,
  heading,
  lead,
  tone = 'plain',
  ship,
  children,
}: {
  id: string;
  heading: string;
  lead?: string;
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
      <Reveal className="relative mx-auto max-w-page px-4 py-16 sm:px-6">
        <LandingHeading id={id} heading={heading} lead={lead} />
        {children}
      </Reveal>
    </section>
  );
}

export interface LandingColumn {
  id: string;
  heading: string;
  lead?: string;
  children: ReactNode;
}

export function LandingSplitSection({
  tone = 'plain',
  columns,
}: {
  tone?: LandingTone;
  columns: readonly [LandingColumn, LandingColumn];
}) {
  return (
    <div className="relative isolate overflow-hidden">
      <LandingBackdrop tone={tone} />
      <Reveal className="relative mx-auto grid max-w-page gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        {columns.map(({ id, heading, lead, children }) => (
          <section key={id} id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-16">
            <LandingHeading id={id} heading={heading} lead={lead} />
            {children}
          </section>
        ))}
      </Reveal>
    </div>
  );
}
