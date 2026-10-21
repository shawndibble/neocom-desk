import { AllianceLink, CorporationLink } from '@/features/entities';
import { allianceLogoUrl, corporationLogoUrl } from '@/lib/eveImages';
import type { WarParty as WarPartyData } from '@/engine/wars';
import { partyEntity } from './partyEntity';
import { usePartyName } from './usePartyName';

/** A war party's logo and name, the name opening its Show Info (§6c "Entities"). */
export function WarParty({ party }: { party: Pick<WarPartyData, 'corporationId' | 'allianceId'> }) {
  const entity = partyEntity(party);
  const name = usePartyName(party);
  if (entity === null) return <span>{name}</span>;
  const Link = entity.kind === 'alliance' ? AllianceLink : CorporationLink;
  const src =
    entity.kind === 'alliance' ? allianceLogoUrl(entity.id, 64) : corporationLogoUrl(entity.id, 64);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        src={src}
        crossOrigin="anonymous"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-xs border border-line bg-panel-2"
      />
      <Link id={entity.id} className="min-w-0 truncate font-semibold">
        {name}
      </Link>
    </span>
  );
}
