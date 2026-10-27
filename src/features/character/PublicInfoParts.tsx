/**
 * Components shared by the Show Info Corporation and Alliance tabs: a pilot
 * and a corporation, each with their picture, as a link that opens them in
 * the modal.
 */
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui';
import { CharacterLink, CorporationLink } from '@/features/entities';
import { corporationLogoUrl } from '@/lib/eveImages';

export function PersonLink({ id, name }: { id: number; name: string | null }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2">
      <CharacterAvatar characterId={id} size="sm" loading="lazy" />
      <CharacterLink id={id}>{name ?? t('common.unknown')}</CharacterLink>
    </span>
  );
}

/** A corporation with its logo; the name is the `CorporationLink` entity link. */
export function CorporationEntry({ id, name }: { id: number; name: string | null }) {
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
      <CorporationLink id={id} className="min-w-0 truncate text-left">
        {name ?? `#${id}`}
      </CorporationLink>
    </span>
  );
}
