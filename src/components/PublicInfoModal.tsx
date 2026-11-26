import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { tabDomId } from '@/components/ui/tabPanel';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useIsPhone } from '@/lib/useIsPhone';
import { guarded } from '@/app/routeChunks';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CharacterAvatar,
  EmptyState,
  Modal,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import { isNpcCharacterId, isNpcCorporationId } from '@/esi/entityIds';
import { useCharacters } from '@/features/character/useCharacters';
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
const LazyInteractionsTab = lazy(() =>
  guarded(() => import('@/features/interactions/InteractionsTab'))
);
const LazyAllianceTab = lazy(() =>
  guarded(() => import('@/features/character/PublicInfoAllianceTab'))
);
const LazyNpcCorporationView = lazy(() =>
  guarded(() => import('@/features/standings/modal/NpcCorporationView'))
);
const LazyNpcInfoView = lazy(() => guarded(() => import('@/features/standings/modal/NpcInfoView')));
const LazyFactionModal = lazy(() =>
  guarded(() => import('@/features/standings/modal/FactionModal'))
);
const LazyPilotProfileView = lazy(() =>
  guarded(() => import('@/features/travel/PilotProfileView'))
);

type TabState<T> =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

type CharacterState = TabState<PilotProfile> | { status: 'unknown' };

const IDLE: TabState<never> = { status: 'idle' };

export function PublicInfoModal() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const isPhone = useIsPhone();
  const request = usePublicInfoModalStore((state) => state.request);
  const close = usePublicInfoModalStore((state) => state.close);
  const urlTab = usePublicInfoModalStore((state) => state.tab);
  const setUrlTab = usePublicInfoModalStore((state) => state.setTab);
  const characters = useCharacters();

  const [chosenTab, setActiveTab] = useState<PublicInfoKind | 'employment' | 'interactions'>(
    'character'
  );
  const focusAfterCommit = useFocusAfterCommit();
  const openTab = (id: PublicInfoKind) => {
    setActiveTab(id);
    if (urlTab !== null) setUrlTab(null);
    focusAfterCommit(() => document.getElementById(tabDomId(tabsId, id)));
  };
  const [character, setCharacter] = useState<CharacterState>(IDLE);
  const [corporation, setCorporation] = useState<TabState<PublicCorporationInfo>>(IDLE);
  const [alliance, setAlliance] = useState<TabState<PublicAllianceInfo>>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const interactionsOffered =
    request?.kind === 'character' &&
    !isNpcCharacterId(request.id) &&
    character.status === 'ready' &&
    characters.length > 0 &&
    !characters.some((c) => c.characterId === request.id);
  const activeTab = urlTab === 'interactions' && interactionsOffered ? 'interactions' : chosenTab;
  const activeState =
    activeTab === 'character' ? character : activeTab === 'corporation' ? corporation : alliance;
  const [resultRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    activeTab === 'employment' ||
      activeTab === 'interactions' ||
      activeState.status === 'ready' ||
      activeState.status === 'unknown'
      ? 'ok'
      : activeState.status === 'error'
        ? 'failed'
        : 'busy',
    request
  );
  const retry = () => {
    holdFocus();
    setAttempt((n) => n + 1);
  };

  const tabChosenFor = useRef<typeof request>(null);
  useEffect(() => {
    if (!request) {
      tabChosenFor.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      if (tabChosenFor.current !== request) {
        tabChosenFor.current = request;
        setActiveTab(request.kind);
      }
      setCharacter(request.kind === 'character' ? { status: 'loading' } : IDLE);
      setCorporation(request.kind === 'corporation' ? { status: 'loading' } : IDLE);
      setAlliance(request.kind === 'alliance' ? { status: 'loading' } : IDLE);
      if (request.kind === 'faction') return;

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
  }, [request, attempt]);

  if (!request) return null;
  if (request.kind === 'faction') {
    return (
      <Suspense fallback={null}>
        <LazyFactionModal id={request.id} onClose={close} />
      </Suspense>
    );
  }

  const tabs: TabItem[] = [];
  if (character.status !== 'idle')
    tabs.push({ id: 'character', label: t('publicInfo.characterTab') });
  if (corporation.status !== 'idle')
    tabs.push({ id: 'corporation', label: t('publicInfo.corporationTab') });
  if (alliance.status !== 'idle') tabs.push({ id: 'alliance', label: t('publicInfo.allianceTab') });
  const npcCharacter = request.kind === 'character' && isNpcCharacterId(request.id);
  const npcView =
    npcCharacter || (request.kind === 'corporation' && isNpcCorporationId(request.id));
  if (
    request.kind === 'character' &&
    !npcCharacter &&
    character.status !== 'idle' &&
    character.status !== 'unknown'
  )
    tabs.push({ id: 'employment', label: t('publicInfo.employmentTab') });
  if (interactionsOffered) tabs.push({ id: 'interactions', label: t('interactions.tab') });

  const activeData =
    activeTab === 'corporation' ? corporation : activeTab === 'alliance' ? alliance : character;
  const title = activeData.status === 'ready' ? activeData.data.name : t('publicInfo.title');
  const characterProfile = character.status === 'ready' ? character.data : undefined;
  const activeEntityId =
    activeTab === 'corporation'
      ? request.kind === 'corporation'
        ? request.id
        : characterProfile?.corporationId
      : activeTab === 'alliance'
        ? request.kind === 'alliance'
          ? request.id
          : (characterProfile?.allianceId ??
            (corporation.status === 'ready' ? corporation.data.alliance_id : undefined))
        : request.id;

  return (
    <Modal
      open
      onClose={close}
      title={title}
      placement={npcView ? (isPhone ? 'sheet-full' : 'medium') : 'wide'}
      closeOnBack={false}
      titleActions={
        activeEntityId === undefined || activeEntityId === null ? undefined : (
          <OpenInEveButton kind="information" id={activeEntityId} name={title} />
        )
      }
    >
      <div className="space-y-3">
        {tabs.length > 0 && (
          <Tabs
            tabsId={tabsId}
            tabs={tabs}
            value={activeTab}
            onChange={(id) => {
              setActiveTab(id as PublicInfoKind | 'employment' | 'interactions');
              if (id === 'interactions' || urlTab !== null)
                setUrlTab(id === 'interactions' ? id : null);
            }}
            label={t('publicInfo.tabsLabel')}
          />
        )}

        <TabPanel tabsId={tabsId} tabId={activeTab}>
          <div ref={resultRef} tabIndex={-1} className="focus:outline-none">
            {activeTab === 'character' && (
              <CharacterTab
                state={character}
                npc={npcCharacter}
                corporation={corporation}
                onOpenCorporation={() => openTab('corporation')}
                onOpenAlliance={() => openTab('alliance')}
                onRetry={retry}
              />
            )}
            {activeTab === 'corporation' && (
              <CorporationTab
                state={corporation}
                allianceId={character.status === 'ready' ? character.data.allianceId : undefined}
                allianceName={alliance.status === 'ready' ? alliance.data.name : undefined}
                onOpenAlliance={alliance.status !== 'idle' ? () => openTab('alliance') : undefined}
                onRetry={retry}
              />
            )}
            {activeTab === 'alliance' && <AllianceTab state={alliance} onRetry={retry} />}
            {activeTab === 'interactions' && character.status === 'ready' && (
              <Suspense fallback={<Spinner block="panel" label={t('common.loading')} />}>
                <LazyInteractionsTab
                  key={request.id}
                  otherId={request.id}
                  otherName={character.data.name}
                />
              </Suspense>
            )}
            {activeTab === 'employment' && (
              <Suspense fallback={<Spinner block="panel" label={t('common.loading')} />}>
                <LazyEmploymentTab characterId={request.id} />
              </Suspense>
            )}
          </div>
        </TabPanel>
      </div>
    </Modal>
  );
}

function TabStatus({ status, onRetry }: { status: 'loading' | 'error'; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (status === 'loading') {
    return <Spinner block="panel" label={t('common.loading')} />;
  }
  return (
    <EmptyState
      title={t('common.loadFailedTitle')}
      hint={onRetry ? t('publicInfo.loadFailedHint') : t('common.loadFailedHint')}
      className="py-8"
      action={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )
      }
    />
  );
}

function CharacterTab({
  state,
  npc,
  corporation,
  onOpenCorporation,
  onOpenAlliance,
  onRetry,
}: {
  onRetry: () => void;
  state: CharacterState;
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
    return (
      <TabStatus status={state.status === 'idle' ? 'loading' : state.status} onRetry={onRetry} />
    );
  if (npc) {
    return (
      <div className="space-y-4">
        <NpcCharacterCard
          profile={state.data}
          factionId={corporation.status === 'ready' ? corporation.data.faction_id : undefined}
          onOpenCorporation={onOpenCorporation}
        />
        <Suspense fallback={null}>
          <LazyNpcInfoView kind="agent" id={state.data.characterId} />
        </Suspense>
      </div>
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
  onRetry,
}: {
  onRetry: () => void;
  state: TabState<PublicCorporationInfo>;
  allianceId?: number | null;
  allianceName?: string;
  onOpenAlliance?: () => void;
}) {
  if (state.status !== 'ready')
    return (
      <TabStatus status={state.status === 'idle' ? 'loading' : state.status} onRetry={onRetry} />
    );
  const { data } = state;
  if (isNpcCorporationId(data.corporation_id)) {
    return (
      <Suspense fallback={<TabStatus status="loading" />}>
        <LazyNpcCorporationView key={data.corporation_id} data={data} />
      </Suspense>
    );
  }
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

function AllianceTab({
  state,
  onRetry,
}: {
  state: TabState<PublicAllianceInfo>;
  onRetry: () => void;
}) {
  if (state.status !== 'ready')
    return (
      <TabStatus status={state.status === 'idle' ? 'loading' : state.status} onRetry={onRetry} />
    );
  return (
    <Suspense fallback={<TabStatus status="loading" />}>
      <LazyAllianceTab key={state.data.alliance_id} data={state.data} />
    </Suspense>
  );
}

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
        <span className={cx(eyebrowClassName, 'block')}>{t('publicInfo.npcAgent')}</span>
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
