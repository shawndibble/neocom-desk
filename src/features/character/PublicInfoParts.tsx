/**
 * Components shared by the Show Info Corporation and Alliance tabs: a pilot
 * and a corporation, each with their picture, as a link that opens them in
 * the modal.
 */
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { corporationLogoUrl } from '@/lib/eveImages';

export function PersonLink({
  id,
  name,
  onOpen,
}: {
  id: number;
  name: string | null;
  onOpen: (characterId: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2">
      <CharacterAvatar characterId={id} size="sm" loading="lazy" />
      <button type="button" className={inlineLinkClassName} onClick={() => onOpen(id)}>
        {name ?? t('common.unknown')}
      </button>
    </span>
  );
}

export function CorporationLink({
  id,
  name,
  onOpen,
}: {
  id: number;
  name: string | null;
  onOpen: (corporationId: number) => void;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        src={corporationLogoUrl(id, 32)}
        crossOrigin="anonymous"
        alt=""
        width={24}
        height={24}
        loading="lazy"
        className="size-6 max-w-none shrink-0 rounded-xs border border-line"
      />
      <button
        type="button"
        className={`${inlineLinkClassName} min-w-0 truncate text-left`}
        onClick={() => onOpen(id)}
      >
        {name ?? `#${id}`}
      </button>
    </span>
  );
}
