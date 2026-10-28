/**
 * The Corporation tab of the shared info modal for an NPC corporation (CCP's
 * id block): who it is, then the standings view (`NpcInfoView`). A corporation
 * no player runs has no CEO worth showing, no killboard and no alliance, so
 * this replaces the player-corporation tab. Lazy-loaded by the modal.
 */
import { useTranslation } from 'react-i18next';
import { EveMarkupText } from '@/components/EveMarkupText';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Eyebrow } from '@/components/ui';
import { FactionLink } from '@/features/entities';
import { useEntityName } from '@/features/character/useEntityName';
import { statusWordClassName, websiteUrl } from '@/features/character/publicInfoStyles';
import type { PublicCorporationInfo } from '@/features/character/publicInfoData';
import { corporationLogoUrl } from '@/lib/eveImages';
import NpcInfoView from './NpcInfoView';

export default function NpcCorporationView({ data }: { data: PublicCorporationInfo }) {
  const { t } = useTranslation();
  const factionName = useEntityName(data.faction_id);
  const website = websiteUrl(data.url);
  const description = data.description?.trim() ?? '';
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <img
          src={corporationLogoUrl(data.corporation_id, 128)}
          crossOrigin="anonymous"
          alt=""
          width={64}
          height={64}
          className="size-12 shrink-0 rounded-xs border border-line sm:size-16"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-text-dim">[{data.ticker}]</p>
          <p className={`${statusWordClassName} text-text-dim`}>{t('publicInfo.npcCorporation')}</p>
          {data.faction_id !== undefined && (
            <FactionLink id={data.faction_id}>{factionName ?? `#${data.faction_id}`}</FactionLink>
          )}
        </div>
        {website && <ExternalLink href={website}>{t('publicInfo.website')}</ExternalLink>}
      </div>
      <NpcInfoView kind="corporation" id={data.corporation_id} />
      {description !== '' && (
        <section className="space-y-1.5" aria-label={t('publicInfo.description')}>
          <Eyebrow as="h3">{t('publicInfo.description')}</Eyebrow>
          <div className="max-h-48 overflow-y-auto rounded-xs border border-line bg-bg p-3">
            <EveMarkupText markup={description} className="text-text" />
          </div>
        </section>
      )}
    </div>
  );
}
