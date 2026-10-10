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
 * The dialog is `wide` for every request: each tab is a full profile now.
 *
 * A link inside the modal that changes page (Open in Fittings) closes it.
 */
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { guarded } from '@/app/routeChunks';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import {
  CharacterAvatar,
  EmptyState,
  Modal,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import { isNpcCharacterId } from '@/esi/entityIds';
import { useEntityName } from '@/features/character/useEntityName';
import {
  loadPublicAllianceInfo,
  loadPublicCorporationInfo,
  type PublicAllianceInfo,
  type PublicCorporationInfo,
} from '@/features/character/publicInfoData';
import { loadPilotProfile, type PilotProfile } from '@/features/travel/pilotLookup';
import { usePublicInfoModalStore, type PublicInfoKind } from '@/stores/publicInfoModal';

const LazyEmploymentTab = lazy(() =>
  guarded(() => import('@/features/character/PublicInfoEmploymentTab'))
);
const LazyCorporationTab = lazy(() =>
  guarded(() => import('@/features/character/PublicInfoCorporationTab'))
);
const LazyAllianceTab = lazy(() =>
  guarded(() => import('@/features/character/PublicInfoAllianceTab'))
);
// Lazy: its killmail fits pull in Fittings, and this modal is mounted app-wide.
const LazyPilotProfileView = lazy(() =>
  guarded(() => import('@/features/travel/PilotProfileView'))
);

type TabState<T> =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** `unknown` is ESI having no such character, apart from `error`, ESI not answering. */
type CharacterState = TabState<PilotProfile> | { status: 'unknown' };

const IDLE: TabState<never> = { status: 'idle' };

export function PublicInfoModal() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const request = usePublicInfoModalStore((state) => state.request);
  const close = usePublicInfoModalStore((state) => state.close);
  const clear = usePublicInfoModalStore((state) => state.clear);
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
    clear();
  }, [pathname, clear]);

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
  // Only a character has a corporation history to show — and not one EVE has no record
  // of, nor an NPC agent, whose "history" is the one corporation CCP placed it in.
  const npcCharacter = request.kind === 'character' && isNpcCharacterId(request.id);
  if (
    request.kind === 'character' &&
    !npcCharacter &&
    character.status !== 'idle' &&
    character.status !== 'unknown'
  )
    tabs.push({ id: 'employment', label: t('publicInfo.employmentTab') });

  const activeData =
    activeTab === 'corporation' ? corporation : activeTab === 'alliance' ? alliance : character;
  const title = activeData.status === 'ready' ? activeData.data.name : t('publicInfo.title');

  return (
    <Modal open onClose={close} title={title} placement="wide" closeOnBack={false}>
      <div className="space-y-3">
        {tabs.length > 0 && (
          <Tabs
            tabsId={tabsId}
            tabs={tabs}
            value={activeTab}
            onChange={(id) => setActiveTab(id as PublicInfoKind | 'employment')}
            label={t('publicInfo.tabsLabel')}
          />
        )}

        <TabPanel tabsId={tabsId} tabId={activeTab}>
          {activeTab === 'character' && (
            <CharacterTab
              state={character}
              npc={npcCharacter}
              corporation={corporation}
              onOpenCorporation={() => setActiveTab('corporation')}
              onOpenAlliance={() => setActiveTab('alliance')}
            />
          )}
          {activeTab === 'corporation' && (
            <CorporationTab
              state={corporation}
              allianceId={character.status === 'ready' ? character.data.allianceId : undefined}
              allianceName={alliance.status === 'ready' ? alliance.data.name : undefined}
              onOpenAlliance={
                alliance.status !== 'idle' ? () => setActiveTab('alliance') : undefined
              }
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
        </TabPanel>
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
  npc,
  corporation,
  onOpenCorporation,
  onOpenAlliance,
}: {
  state: CharacterState;
  /** An NPC agent (CCP's id block): a slim card, no killboard. */
  npc: boolean;
  corporation: TabState<PublicCorporationInfo>;
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
  if (npc) {
    return (
      <NpcCharacterCard
        profile={state.data}
        factionId={corporation.status === 'ready' ? corporation.data.faction_id : undefined}
        onOpenCorporation={onOpenCorporation}
      />
    );
  }
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
  allianceId: liveAllianceId,
  allianceName,
  onOpenAlliance,
}: {
  state: TabState<PublicCorporationInfo>;
  /**
   * A character's live alliance (null: none), which wins over the cached corp
   * record's so this row and the Alliance tab agree. Undefined for a corp request.
   */
  allianceId?: number | null;
  /** Filled in once the alliance fetch resolves; a bare id shows until then. */
  allianceName?: string;
  onOpenAlliance?: () => void;
}) {
  if (state.status !== 'ready')
    return <TabStatus status={state.status === 'idle' ? 'loading' : state.status} />;
  const { data } = state;
  const allianceId = liveAllianceId === undefined ? (data.alliance_id ?? null) : liveAllianceId;
  return (
    <Suspense fallback={<TabStatus status="loading" />}>
      <LazyCorporationTab
        key={data.corporation_id}
        data={data}
        allianceId={allianceId}
        allianceName={allianceName}
        onOpenAlliance={onOpenAlliance}
      />
    </Suspense>
  );
}

function AllianceTab({ state }: { state: TabState<PublicAllianceInfo> }) {
  if (state.status !== 'ready')
    return <TabStatus status={state.status === 'idle' ? 'loading' : state.status} />;
  return (
    <Suspense fallback={<TabStatus status="loading" />}>
      <LazyAllianceTab key={state.data.alliance_id} data={state.data} />
    </Suspense>
  );
}

/**
 * An NPC agent's Character tab. Pilot Lookup's view would show an empty
 * killboard and a 2003 "character age" for someone CCP placed in a station,
 * so an agent gets who it is and who it works for, and nothing else.
 */
function NpcCharacterCard({
  profile,
  factionId,
  onOpenCorporation,
}: {
  profile: PilotProfile;
  factionId: number | undefined;
  onOpenCorporation: () => void;
}) {
  const { t } = useTranslation();
  const factionName = useEntityName(factionId);
  return (
    <div className="flex flex-wrap items-start gap-4 text-sm">
      <CharacterAvatar characterId={profile.characterId} size="lg" alt={profile.name} />
      <div className="min-w-0 flex-1 space-y-3">
        <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('publicInfo.npcAgent')}
        </span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-text-dim">{t('publicInfo.corporation')}</dt>
          <dd>
            <button type="button" className={inlineLinkClassName} onClick={onOpenCorporation}>
              {profile.corporationName ?? `#${profile.corporationId}`}
            </button>
          </dd>
          {factionId !== undefined && (
            <>
              <dt className="text-text-dim">{t('publicInfo.faction')}</dt>
              <dd>{factionName ?? `#${factionId}`}</dd>
            </>
          )}
        </dl>
        <p className="text-xs text-text-dim">{t('publicInfo.npcAgentHint')}</p>
      </div>
    </div>
  );
}
