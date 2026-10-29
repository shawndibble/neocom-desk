/**
 * Shared, read-only public-info lookup (GLOSSARY.md rounds 49-50): a tabbed
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
 * The dialog is `wide`: each tab is a full profile now. The NPC views below are the
 * exception: `medium` (a full-height sheet on a phone).
 *
 * A link inside the modal that changes page (Open in Fittings) closes it: `info`
 * leaves the URL, which `EntityInfoRoute` turns into a cleared request. Back from
 * that page returns to this one with `info` still in the URL, so the modal reopens.
 *
 * NPC entities get the standings view instead (`features/standings/modal`): an
 * NPC corporation's Corporation tab, an NPC agent's card with the standings
 * cards below it, and a `faction` request, which has no tabs and is its own
 * modal. Pilots and player corporations are unchanged.
 */
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
// Lazy: the NPC views read the standings, agent and station data only an NPC id needs.
const LazyNpcCorporationView = lazy(() =>
  guarded(() => import('@/features/standings/modal/NpcCorporationView'))
);
const LazyNpcInfoView = lazy(() => guarded(() => import('@/features/standings/modal/NpcInfoView')));
const LazyFactionModal = lazy(() =>
  guarded(() => import('@/features/standings/modal/FactionModal'))
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
  const isPhone = useIsPhone();
  const request = usePublicInfoModalStore((state) => state.request);
  const close = usePublicInfoModalStore((state) => state.close);

  const [activeTab, setActiveTab] = useState<PublicInfoKind | 'employment'>('character');
  const focusAfterCommit = useFocusAfterCommit();
  // The pressed button lives in the tab we leave, so it unmounts: land on the tab we switched to.
  const openTab = (id: PublicInfoKind) => {
    setActiveTab(id);
    focusAfterCommit(() => document.getElementById(tabDomId(tabsId, id)));
  };
  const [character, setCharacter] = useState<CharacterState>(IDLE);
  const [corporation, setCorporation] = useState<TabState<PublicCorporationInfo>>(IDLE);
  const [alliance, setAlliance] = useState<TabState<PublicAllianceInfo>>(IDLE);
  // Bumped by Try again on a failed tab, to run the lookups again in place.
  const [attempt, setAttempt] = useState(0);
  const activeState =
    activeTab === 'character' ? character : activeTab === 'corporation' ? corporation : alliance;
  // Try again unmounts while the lookups re-run, so the always-mounted wrapper holds focus.
  const [resultRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    activeTab === 'employment' || activeState.status === 'ready' || activeState.status === 'unknown'
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

  /** The request whose tab was last chosen, so a retry re-runs the lookups without jumping tabs. */
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
      // A faction is one view with nothing to look up here: it loads its own facts.
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
  // Only a character has a corporation history to show — and not one EVE has no record
  // of, nor an NPC agent, whose "history" is the one corporation CCP placed it in.
  const npcCharacter = request.kind === 'character' && isNpcCharacterId(request.id);
  // An NPC's view is the standings cards, which want a narrower dialog than a pilot's killboard.
  const npcView =
    npcCharacter || (request.kind === 'corporation' && isNpcCorporationId(request.id));
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
  // The id the active tab shows (Employment is the character's): the one "Open in EVE" opens.
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
            onChange={(id) => setActiveTab(id as PublicInfoKind | 'employment')}
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

function TabStatus({
  status,
  onRetry,
}: {
  status: 'loading' | 'error';
  /** Offered when the lookup failed. */
  onRetry?: () => void;
}) {
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
