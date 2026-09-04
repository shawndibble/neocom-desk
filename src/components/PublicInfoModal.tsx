/**
 * Shared, read-only public-info lookup (CONTEXT.md rounds 49-50): a tabbed
 * Character / Corporation / Alliance view any feature can open by id + kind,
 * via `openPublicInfoModal`/`usePublicInfoModal` (`stores/publicInfoModal.ts`).
 * Mounted once in `App.tsx` — same "always mounted, driven by a global
 * signal" shape as `WhatsNewPanel`, needed here because unlike every other
 * detail modal in this repo (`ContractDetailModal`, `ItemDetailModal`), this
 * one is opened from several unrelated features rather than one route that
 * already owns local `selected` state.
 *
 * Opening with a character id resolves the whole chain (character -> its
 * corp -> its alliance) in one shot, per the issue; opening directly with a
 * corp or alliance id skips straight to that tab. A tab is only shown once
 * its kind has actually entered the chain — an alliance-less character (or
 * corp) never puts the Alliance tab into `loading`, so it never appears,
 * which is what keeps that case tab-hidden rather than tab-with-an-error.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner, Tabs, type TabItem } from '@/components/ui';
import {
  loadPublicAllianceInfo,
  loadPublicCharacterInfo,
  loadPublicCorporationInfo,
  type PublicAllianceInfo,
  type PublicCharacterInfo,
  type PublicCorporationInfo,
} from '@/features/character/publicInfoData';
import { allianceLogoUrl, characterPortraitUrl, corporationLogoUrl } from '@/lib/eveImages';
import { usePublicInfoModalStore, type PublicInfoKind } from '@/stores/publicInfoModal';

type TabState<T> =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const IDLE: TabState<never> = { status: 'idle' };

export function PublicInfoModal() {
  const { t } = useTranslation();
  const request = usePublicInfoModalStore((state) => state.request);
  const close = usePublicInfoModalStore((state) => state.close);

  const [activeTab, setActiveTab] = useState<PublicInfoKind>('character');
  const [character, setCharacter] = useState<TabState<PublicCharacterInfo>>(IDLE);
  const [corporation, setCorporation] = useState<TabState<PublicCorporationInfo>>(IDLE);
  const [alliance, setAlliance] = useState<TabState<PublicAllianceInfo>>(IDLE);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    void (async () => {
      setActiveTab(request.kind);
      setCharacter(request.kind === 'character' ? { status: 'loading' } : IDLE);
      setCorporation(request.kind === 'corporation' ? { status: 'loading' } : IDLE);
      setAlliance(request.kind === 'alliance' ? { status: 'loading' } : IDLE);

      let corporationId: number | undefined;
      let allianceId: number | undefined;

      if (request.kind === 'character') {
        const info = await loadPublicCharacterInfo(request.id);
        if (cancelled) return;
        setCharacter(info ? { status: 'ready', data: info } : { status: 'error' });
        corporationId = info?.corporation_id;
        allianceId = info?.alliance_id;
      } else if (request.kind === 'corporation') {
        corporationId = request.id;
      } else {
        allianceId = request.id;
      }

      if (corporationId !== undefined) {
        setCorporation({ status: 'loading' });
        const info = await loadPublicCorporationInfo(corporationId);
        if (cancelled) return;
        setCorporation(info ? { status: 'ready', data: info } : { status: 'error' });
        allianceId = allianceId ?? info?.alliance_id;
      }

      if (allianceId !== undefined) {
        setAlliance({ status: 'loading' });
        const info = await loadPublicAllianceInfo(allianceId);
        if (cancelled) return;
        setAlliance(info ? { status: 'ready', data: info } : { status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request]);

  if (!request) return null;

  const tabs: TabItem[] = [];
  if (character.status !== 'idle')
    tabs.push({ id: 'character', label: t('publicInfo.characterTab') });
  if (corporation.status !== 'idle')
    tabs.push({ id: 'corporation', label: t('publicInfo.corporationTab') });
  if (alliance.status !== 'idle') tabs.push({ id: 'alliance', label: t('publicInfo.allianceTab') });

  const activeData =
    activeTab === 'character' ? character : activeTab === 'corporation' ? corporation : alliance;
  const title = activeData.status === 'ready' ? activeData.data.name : t('publicInfo.title');

  return (
    <Modal open onClose={close} title={title}>
      <div className="space-y-3">
        {tabs.length > 0 && (
          <Tabs
            tabs={tabs}
            value={activeTab}
            onChange={(id) => setActiveTab(id as PublicInfoKind)}
            label={t('publicInfo.tabsLabel')}
          />
        )}

        {activeTab === 'character' && (
          <CharacterTab
            state={character}
            corporationName={corporation.status === 'ready' ? corporation.data.name : undefined}
            allianceName={alliance.status === 'ready' ? alliance.data.name : undefined}
            onOpenCorporation={
              corporation.status !== 'idle' ? () => setActiveTab('corporation') : undefined
            }
            onOpenAlliance={alliance.status !== 'idle' ? () => setActiveTab('alliance') : undefined}
          />
        )}
        {activeTab === 'corporation' && (
          <CorporationTab
            state={corporation}
            allianceName={alliance.status === 'ready' ? alliance.data.name : undefined}
            onOpenAlliance={alliance.status !== 'idle' ? () => setActiveTab('alliance') : undefined}
          />
        )}
        {activeTab === 'alliance' && <AllianceTab state={alliance} />}
      </div>
    </Modal>
  );
}

function TabStatus({ status }: { status: 'loading' | 'error' }) {
  const { t } = useTranslation();
  if (status === 'loading') {
    return (
      <div className="flex justify-center py-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  return (
    <EmptyState
      title={t('common.loadFailedTitle')}
      hint={t('common.loadFailedHint')}
      className="py-8"
    />
  );
}

function CharacterTab({
  state,
  corporationName,
  allianceName,
  onOpenCorporation,
  onOpenAlliance,
}: {
  state: TabState<PublicCharacterInfo>;
  /** Filled in once the corp/alliance chain resolves; a bare id shows until then. */
  corporationName?: string;
  allianceName?: string;
  onOpenCorporation?: () => void;
  onOpenAlliance?: () => void;
}) {
  const { t } = useTranslation();
  if (state.status !== 'ready')
    return <TabStatus status={state.status === 'idle' ? 'loading' : state.status} />;
  const { data } = state;
  return (
    <div className="flex items-start gap-3 text-xs">
      <img
        src={characterPortraitUrl(data.character_id, 128)}
        alt=""
        width={64}
        height={64}
        className="shrink-0 rounded-xs border border-line"
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim uppercase">{t('publicInfo.securityStatus')}</dt>
        <dd>{data.security_status?.toFixed(1) ?? t('common.unknown')}</dd>

        <dt className="text-text-dim uppercase">{t('publicInfo.corporation')}</dt>
        <dd>
          {onOpenCorporation ? (
            <button type="button" onClick={onOpenCorporation} className="text-accent underline">
              {corporationName ?? `#${data.corporation_id}`}
            </button>
          ) : (
            (corporationName ?? `#${data.corporation_id}`)
          )}
        </dd>

        {data.alliance_id !== undefined && (
          <>
            <dt className="text-text-dim uppercase">{t('publicInfo.alliance')}</dt>
            <dd>
              {onOpenAlliance ? (
                <button type="button" onClick={onOpenAlliance} className="text-accent underline">
                  {allianceName ?? `#${data.alliance_id}`}
                </button>
              ) : (
                (allianceName ?? `#${data.alliance_id}`)
              )}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function CorporationTab({
  state,
  allianceName,
  onOpenAlliance,
}: {
  state: TabState<PublicCorporationInfo>;
  /** Filled in once the alliance fetch resolves; a bare id shows until then. */
  allianceName?: string;
  onOpenAlliance?: () => void;
}) {
  const { t } = useTranslation();
  if (state.status !== 'ready')
    return <TabStatus status={state.status === 'idle' ? 'loading' : state.status} />;
  const { data } = state;
  return (
    <div className="flex items-start gap-3 text-xs">
      <img
        src={corporationLogoUrl(data.corporation_id, 128)}
        alt=""
        width={64}
        height={64}
        className="shrink-0 rounded-xs border border-line"
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim uppercase">{t('publicInfo.ticker')}</dt>
        <dd>{data.ticker}</dd>

        <dt className="text-text-dim uppercase">{t('publicInfo.memberCount')}</dt>
        <dd>{data.member_count.toLocaleString()}</dd>

        <dt className="text-text-dim uppercase">{t('publicInfo.ceo')}</dt>
        <dd>{data.ceoName ?? t('common.unknown')}</dd>

        {data.alliance_id !== undefined && (
          <>
            <dt className="text-text-dim uppercase">{t('publicInfo.alliance')}</dt>
            <dd>
              {onOpenAlliance ? (
                <button type="button" onClick={onOpenAlliance} className="text-accent underline">
                  {allianceName ?? `#${data.alliance_id}`}
                </button>
              ) : (
                (allianceName ?? `#${data.alliance_id}`)
              )}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function AllianceTab({ state }: { state: TabState<PublicAllianceInfo> }) {
  const { t } = useTranslation();
  if (state.status !== 'ready')
    return <TabStatus status={state.status === 'idle' ? 'loading' : state.status} />;
  const { data } = state;
  return (
    <div className="flex items-start gap-3 text-xs">
      <img
        src={allianceLogoUrl(data.alliance_id, 128)}
        alt=""
        width={64}
        height={64}
        className="shrink-0 rounded-xs border border-line"
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim uppercase">{t('publicInfo.ticker')}</dt>
        <dd>{data.ticker}</dd>
      </dl>
    </div>
  );
}
