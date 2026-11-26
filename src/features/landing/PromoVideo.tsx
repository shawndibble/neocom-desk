import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { focusRingInsetClassName } from '@/components/ui/controlStyles';
import { ICON_SIZE, PlayVideo } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { PROMO_VIDEO, promoEmbedUrl, EMBED_IFRAME_PROPS } from './promoVideoConfig';

const POSTER = '/promo/promo-poster-1280.webp';
const POSTER_SRCSET = '/promo/promo-poster-640.webp 640w, /promo/promo-poster-1280.webp 1280w';

export function PromoVideo({ plays, onPlay }: { plays: number; onPlay: () => void }) {
  const { t } = useTranslation();
  const { youtubeId, duration } = PROMO_VIDEO;
  const player = useRef<HTMLIFrameElement>(null);

  useLayoutEffect(() => {
    if (plays === 0) return;
    player.current?.scrollIntoView({ block: 'nearest' });
    player.current?.focus({ preventScroll: true });
  }, [plays]);

  return (
    <div className="lp-hud relative mt-6 aspect-video w-full border border-accent/30 bg-bg">
      {plays > 0 ? (
        <iframe
          ref={player}
          src={promoEmbedUrl(youtubeId)}
          aria-label={t('login.video.playerTitle')}
          {...EMBED_IFRAME_PROPS}
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={onPlay}
          aria-label={t('login.video.play', { duration })}
          className={cx(
            'group absolute inset-0 block size-full cursor-pointer',
            focusRingInsetClassName
          )}
        >
          <img
            src={POSTER}
            srcSet={POSTER_SRCSET}
            sizes="(min-width: 72rem) 69rem, calc(100vw - 3rem)"
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/45 motion-safe:transition-[background-color] group-hover:bg-bg/25"
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-accent text-bg shadow-lg motion-safe:transition-transform group-hover:scale-105 sm:size-20">
              <PlayVideo size={ICON_SIZE.lg} aria-hidden="true" />
            </span>
            <span className="rounded-xs bg-bg/80 px-2 py-0.5 font-mono text-xs text-text">
              {duration}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
