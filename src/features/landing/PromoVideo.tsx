import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { ICON_SIZE, PlayVideo } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { promoEmbedUrl } from './promoVideo';

const POSTER = '/promo/promo-poster-1280.webp';
const POSTER_SRCSET = '/promo/promo-poster-640.webp 640w, /promo/promo-poster-1280.webp 1280w';

/**
 * The promo video as a click-to-load facade: a local poster with a play
 * button, swapped for the YouTube player only when pressed. Nothing from
 * YouTube loads before that, so the landing page's paint and privacy are
 * unchanged for a visitor who never plays it. Never autoplays on arrival:
 * the video is narrated, and muted autoplay would lose the point.
 */
export function PromoVideo({ youtubeId, length }: { youtubeId: string; length: string }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative mt-6 aspect-video w-full overflow-hidden border border-line bg-bg">
      {playing ? (
        <iframe
          src={promoEmbedUrl(youtubeId)}
          title={t('login.video.playerTitle')}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t('login.video.play', { length })}
          className={cx(
            'group absolute inset-0 block size-full cursor-pointer',
            focusRingClassName
          )}
        >
          <img
            src={POSTER}
            srcSet={POSTER_SRCSET}
            sizes="(min-width: 72rem) 72rem, 100vw"
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/45 motion-safe:transition-colors group-hover:bg-bg/25"
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-accent text-bg shadow-lg motion-safe:transition-transform group-hover:scale-105 sm:size-20">
              <PlayVideo size={ICON_SIZE.lg} />
            </span>
            <span className="rounded-xs bg-bg/80 px-2 py-0.5 font-mono text-xs text-text">
              {length}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
