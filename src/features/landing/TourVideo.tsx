import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { ICON_SIZE, PlayVideo } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { TOUR_VIDEOS, promoEmbedUrl, type TourVideoId } from './promoVideoConfig';

export function TourVideoLink({ video, className }: { video: TourVideoId; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { youtubeId, duration } = TOUR_VIDEOS[video];
  const title = t(`login.tourVideos.${video}.title`);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(inlineLinkClassName, 'inline-flex items-center gap-1.5 text-sm', className)}
      >
        <PlayVideo size={ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        {t(`login.tourVideos.${video}.link`, { duration })}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} placement="wide">
        <div className="mx-auto aspect-video w-full max-w-[calc((85dvh-5rem)*16/9)] bg-bg">
          <iframe
            src={promoEmbedUrl(youtubeId)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="block size-full"
          />
        </div>
      </Modal>
    </>
  );
}
