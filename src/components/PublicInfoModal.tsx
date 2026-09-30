/**
 * Shared, read-only public-info lookup (CONTEXT.md rounds 49-50): a tabbed
 * Character / Corporation / Alliance view any feature can open by id + kind,
 * via `openPublicInfoModal`/`usePublicInfoModal` (`stores/publicInfoModal.ts`).
 * Mounted once in `App.tsx`, needed here because unlike a per-route detail
 * modal (`ContractDetailModal`, `ItemDetailModal`), this one is opened from
 * several unrelated features rather than one route that already owns local
 * `selected` state.
 *
 * Opening with a character id resolves the whole chain (character -> its
 * corp -> its alliance) in one shot, per the issue; opening directly with a
 * corp or alliance id skips straight to that tab. A tab is only shown once
 * its kind has actually entered the chain — an alliance-less character (or
 * corp) never puts the Alliance tab into `loading`, so it never appears,
 * which is what keeps that case tab-hidden rather than tab-with-an-error.
 *
 * The Character tab is Pilot Lookup's result (`PilotProfileView`): identity,
 * zKillboard stats and recent kills and losses, so a character reads the same
 * wherever it's opened. Its corporation and alliance come from the live
 * affiliation `loadPilotProfile` resolves, and the Corporation and Alliance
 * tabs follow those ids, not the cached public record's, so the two agree.
 * The dialog is `wide` for a character, since that view needs the room.
 *
 * A link inside the modal that changes page (Open in Fittings) closes it.
 */
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { EmptyState, Modal, Spinner, Tabs, type TabItem } from '@/components/ui';
import {
  loadPublicAllianceInfo,
  loadPublicCorporationInfo,
  type PublicAllianceInfo,
  type PublicCorporationInfo,
} from '@/features/character/publicInfoData';
import { loadPilotProfile, type PilotProfile } from '@/features/travel/pilotLookup';
import { allianceLogoUrl, corporationLogoUrl } from '@/lib/eveImages';
import { allianceZkillUrl, corporationZkillUrl } from '@/lib/zkillboard';
import { usePublicInfoModalStore, type PublicInfoKind } from '@/stores/publicInfoModal';

const LazyEmploymentTab = lazy(() => import('@/features/character/PublicInfoEmploymentTab'));
// Lazy: its killmail fits pull in Fittings, and this modal is mounted app-wide.
const LazyPilotProfileView = lazy(() => import('@/features/travel/PilotProfileView'));

type TabState<T> =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** `unknown` is ESI having no such character, apart from `error`, ESI not answering. */
type CharacterState = TabState<PilotProfile> | { status: 'unknown' };

const IDLE: TabState<never> = { status: 'idle' };

export function PublicInfoModal() {
  const { t } = useTranslation();
  const request = usePublicInfoModalStore((state) => state.request);
  const close = usePublicInfoModalStore((state) => state.close);
  const { pathname } = useLocation();
  const shownPathname = useRef(pathname);

  const [activeTab, setActiveTab] = useState<PublicInfoKind | 'employment'>('character');
  const [character, setCharacter] = useState<CharacterState>(IDLE);
  const [corporation, setCorporation] = useState<TabState<PublicCorporationInfo>>(IDLE);
  const [alliance, setAlliance] = useState<TabState<PublicAllianceInfo>>(IDLE);

  // Runs after render, so a caller must not navigate and open in one handler — the
  // open would be closed straight away. None does: every opener stays on its page.
  useEffect(() => {
    if (shownPathname.current === pathname) return;
    shownPathname.current = pathname;
    close();
  }, [pathname, close]);

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
        let profile: PilotProfile | null;
        try {
          profile = await loadPilotProfile(request.id);
        } catch {
          if (!cancelled) setCharacter({ status: 'error' });
          return;
        }
        if (cancelled) return;
        if (profile === null) {
          setCharacter({ status: 'unknown' });
          return;
        }
        setCharacter({ status: 'ready', data: profile });
        corporationId = profile.corporationId;
        allianceId = profile.allianceId ?? undefined;
        // Known up front, so its tab shows now rather than after the corporation loads.
        if (allianceId !== undefined) setAlliance({ status: 'loading' });
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
        // A character's alliance is its live affiliation's; the cached corp record can lag.
        if (request.kind === 'corporation') allianceId = info?.alliance_id;
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
  // Only a character has a corporation history to show — and not one EVE has no record of.
  if (request.kind === 'character' && character.status !== 'idle' && character.status !== 'unknown')
    tabs.push({ id: 'employment', label: t('publicInfo.employmentTab') });

  const activeData =
    activeTab === 'corporation' ? corporation : activeTab === 'alliance' ? alliance : character;
  const title = activeData.status === 'ready' ? activeData.data.name : t('publicInfo.title');

  return (
    <Modal
      open
      onClose={close}
      title={title}
      placement={request.kind === 'character' ? 'wide' : 'center'}
    >
      <div className="space-y-3">
        {tabs.length > 0 && (
          <Tabs
            tabs={tabs}
            value={activeTab}
            onChange={(id) => setActiveTab(id as PublicInfoKind | 'employment')}
            label={t('publicInfo.tabsLabel')}
          />
        )}

        {activeTab === 'character' && (
          <CharacterTab
            state={character}
            onOpenCorporation={() => setActiveTab('corporation')}
            onOpenAlliance={() => setActiveTab('alliance')}
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
        {activeTab === 'employment' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <Spinner label={t('common.loading')} />
              </div>
            }
          >
            <LazyEmploymentTab characterId={request.id} />
          </Suspense>
        )}
      </div>
    </Modal>
  );
}

/**
 * A corporation's or alliance's kills and losses aren't shown inline (only a
 * character's are, in its tab), so those tabs link out to zKillboard instead.
 */
function ZkillRow({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <>
      <dt className="text-text-dim uppercase">{t('publicInfo.killboard')}</dt>
      <dd>
        <a href={href} target="_blank" rel="noopener noreferrer" className={inlineLinkClassName}>
          {t('publicInfo.zkillboard')}
        </a>
      </dd>
    </>
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
  onOpenCorporation,
  onOpenAlliance,
}: {
  state: CharacterState;
  onOpenCorporation: () => void;
  onOpenAlliance: () => void;
}) {
  const { t } = useTranslation();
  if (state.status === 'unknown') {
    return (
      <EmptyState
        title={t('publicInfo.characterUnknownTitle')}
        hint={t('publicInfo.characterUnknownHint')}
        className="py-8"
      />
    );
  }
  if (state.status !== 'ready')
    return <TabStatus status={state.status === 'idle' ? 'loading' : state.status} />;
  return (
    <Suspense fallback={<TabStatus status="loading" />}>
      <LazyPilotProfileView
        key={state.data.characterId}
        profile={state.data}
        hideName
        onOpenCorporation={onOpenCorporation}
        onOpenAlliance={onOpenAlliance}
      />
    </Suspense>
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
        crossOrigin="anonymous"
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
                <button type="button" onClick={onOpenAlliance} className={inlineLinkClassName}>
                  {allianceName ?? `#${data.alliance_id}`}
                </button>
              ) : (
                (allianceName ?? `#${data.alliance_id}`)
              )}
            </dd>
          </>
        )}

        <ZkillRow href={corporationZkillUrl(data.corporation_id)} />
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
        crossOrigin="anonymous"
        alt=""
        width={64}
        height={64}
        className="shrink-0 rounded-xs border border-line"
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim uppercase">{t('publicInfo.ticker')}</dt>
        <dd>{data.ticker}</dd>

        <ZkillRow href={allianceZkillUrl(data.alliance_id)} />
      </dl>
    </div>
  );
}
