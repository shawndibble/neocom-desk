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
import { websiteUrl } from '@/features/character/publicInfoStyles';
import type { PublicCorporationInfo } from '@/features/character/publicInfoData';
import { corporationLogoUrl } from '@/lib/eveImages';
import NpcInfoView from './NpcInfoView';
import { useCorporationFaction } from './useNpcInfo';

export default function NpcCorporationView({ data }: { data: PublicCorporationInfo }) {
  const { t } = useTranslation();
  const faction = useCorporationFaction(data.corporation_id).data;
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
          {faction && <FactionLink id={faction.id}>{faction.name}</FactionLink>}
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
