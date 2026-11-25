import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

/** One lock bracket at a corner of the reticle. */
const BRACKET = 'absolute size-6 border-warning sm:size-10';

/**
 * The hero's targeting reticle: the Megathron render locked inside range
 * rings, with two HUD read-outs naming what the app does with it (lg up).
 * Decorative and hidden from assistive tech: the heading and tagline beside it
 * say the same in words. The ship is the page's largest paint, so it loads
 * eagerly at high priority (#3926) and decodes with the frame (#3950).
 */
export function HeroReticle({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden="true"
      className={cx(
        'relative mx-auto flex aspect-square w-60 items-center justify-center sm:w-80 lg:w-full lg:max-w-[36rem]',
        className
      )}
    >
      <div className="lp-ring inset-0 border border-accent/20" />
      <div className="lp-ring inset-[7%] border border-dashed border-accent/35" />
      <div className="lp-ring inset-[14%] border-2 border-accent/60 shadow-[0_0_60px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]" />
      <img
        src="/landing/megathron.webp"
        alt=""
        width={512}
        height={512}
        loading="eager"
        fetchPriority="high"
        className="lp-round relative w-[68%]"
      />
      <span className={cx(BRACKET, 'top-[12%] left-[12%] border-t-2 border-l-2')} />
      <span className={cx(BRACKET, 'top-[12%] right-[12%] border-t-2 border-r-2')} />
      <span className={cx(BRACKET, 'bottom-[12%] left-[12%] border-b-2 border-l-2')} />
      <span className={cx(BRACKET, 'right-[12%] bottom-[12%] border-r-2 border-b-2')} />
      <ReadOut
        className="top-[6%] -right-2 border-accent/40"
        titleClassName="text-accent"
        title={t('login.reticle.market.title')}
        lines={[t('login.reticle.market.line1'), t('login.reticle.market.line2')]}
      />
      <ReadOut
        className="bottom-[8%] -left-2 border-warning/45"
        titleClassName="text-warning"
        title={t('login.reticle.fit.title')}
        lines={[t('login.reticle.fit.line1'), t('login.reticle.fit.line2')]}
      />
      <p className="absolute top-1/2 -right-2 hidden font-mono text-[0.6875rem] tracking-[0.2em] text-accent/80 uppercase lg:block">
        {t('login.reticle.locked')}
      </p>
    </div>
  );
}

/** A HUD read-out box pinned beside the reticle; only from lg, where there is room. */
function ReadOut({
  className,
  titleClassName,
  title,
  lines,
}: {
  className: string;
  titleClassName: string;
  title: string;
  lines: string[];
}) {
  return (
    <div
      className={cx(
        'absolute hidden border bg-bg/85 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-text-dim lg:block',
        className
      )}
    >
      <p className={cx('tracking-[0.14em] uppercase', titleClassName)}>{title}</p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
