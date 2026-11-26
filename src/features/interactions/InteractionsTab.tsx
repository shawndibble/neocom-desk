import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  FilterChip,
  LoadFailedState,
  Spinner,
  StatChip,
  StatChips,
} from '@/components/ui';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import type { CharacterScopeChoice } from '@/features/character/CharacterFilterControl';
import { useCharacters } from '@/features/character/useCharacters';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  kindCounts,
  type InteractionKind,
  type Interaction,
} from '@/engine/interactions/interactions';
import { formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { iskTone } from '@/lib/signedIsk';
import { cx } from '@/lib/cx';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadCorpSummary } from './corpSources';
import type { CorpQuery } from './sourceTypes';
import { InteractionsList } from './InteractionsList';
import { useInteractions, type InteractionScope } from './useInteractions';

const KINDS: readonly InteractionKind[] = ['wallet', 'contract', 'mail', 'kill', 'book'];

function PersonalChips({ rows }: { rows: readonly Interaction[] }) {
  const { t, i18n } = useTranslation();
  const net = rows.reduce((sum, r) => sum + (r.isk ?? 0), 0);
  const count = (kind: InteractionKind) => rows.filter((r) => r.kind === kind).length;
  const killed = rows.filter((r) => r.type === 'interactions.type.youKilled').length;
  const killedBy = rows.filter((r) => r.type === 'interactions.type.theyKilledYou').length;
  const first = rows.length === 0 ? null : Math.min(...rows.map((r) => r.at));
  return (
    <StatChips>
      {net !== 0 && (
        <StatChip
          label={t('interactions.chip.net')}
          emphasis
          value={<span className={cx(iskTone(net, 0))}>{formatIskCompactSigned(net)} ISK</span>}
        />
      )}
      {count('contract') > 0 && (
        <StatChip label={t('interactions.chip.contracts')} value={count('contract')} />
      )}
      {count('mail') > 0 && <StatChip label={t('interactions.chip.mails')} value={count('mail')} />}
      {killed > 0 && (
        <StatChip label={t('interactions.chip.youKilled')} value={killed} tone="warning" />
      )}
      {killedBy > 0 && (
        <StatChip label={t('interactions.chip.theyKilledYou')} value={killedBy} tone="danger" />
      )}
      {first !== null && (
        <StatChip
          label={t('interactions.chip.firstContact')}
          value={new Intl.DateTimeFormat(i18n.language, {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(first)}
        />
      )}
    </StatChips>
  );
}

function CorpChips({ query }: { query: CorpQuery }) {
  const { t, i18n } = useTranslation();
  const { corporationId, otherId, otherName, characterIds, t: translate } = query;
  const key = `${corporationId}:${otherId}:${characterIds.join(',')}`;
  const loader = useCallback(
    () => loadCorpSummary({ corporationId, otherId, otherName, characterIds, t: translate }),
    [corporationId, otherId, otherName, characterIds, translate]
  );
  const { data } = useKeyedLoad(key, loader);
  if (!data) return null;
  const date = (ms: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(ms);
  const isk = (value: number) => `${formatIskCompactSigned(value)} ISK`;
  const { member, outsider } = data;
  return (
    <StatChips>
      {member?.owedNow != null && (
        <StatChip
          label={t('interactions.chip.owed')}
          emphasis
          value={<span className="text-isk-neg">{isk(-member.owedNow)}</span>}
        />
      )}
      {member?.taxPaid != null && (
        <StatChip
          label={t('interactions.chip.taxPaid')}
          value={`${formatIskCompact(member.taxPaid)} ISK`}
        />
      )}
      {member?.lateNotices != null && (
        <StatChip
          label={t('interactions.chip.lateNotices')}
          value={member.lateNotices}
          tone="warning"
        />
      )}
      {member?.memberSince != null && (
        <StatChip label={t('interactions.chip.memberSince')} value={date(member.memberSince)} />
      )}
      {outsider?.hostile && (
        <StatChip
          label={t('interactions.chip.standing')}
          value={t('interactions.chip.hostile')}
          tone="danger"
          emphasis
        />
      )}
      {outsider?.ourLosses != null && (
        <StatChip
          label={t('interactions.chip.ourLosses')}
          tone="danger"
          value={`${outsider.ourLosses.count} · ${formatIskCompact(outsider.ourLosses.isk) + ' ISK'}`}
        />
      )}
      {outsider?.theirLosses != null && (
        <StatChip
          label={t('interactions.chip.theirLosses')}
          value={`${outsider.theirLosses.count} · ${formatIskCompact(outsider.theirLosses.isk) + ' ISK'}`}
        />
      )}
      {outsider?.lastHostile != null && (
        <StatChip label={t('interactions.chip.lastHostile')} value={date(outsider.lastHostile)} />
      )}
    </StatChips>
  );
}

export default function InteractionsTab({
  otherId,
  otherName,
}: {
  otherId: number;
  otherName: string;
}) {
  const { t } = useTranslation();
  const characters = useCharacters();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const access = useCorpAccess();
  const corpOffered = access.state === 'ready' && corporationId !== null;
  const [choice, setChoice] = useState<CharacterScopeChoice | null>(null);
  const scope: InteractionScope =
    choice ?? (corpOffered ? 'corporation' : characters.length > 1 ? 'all' : 'current');
  const effective: InteractionScope = scope === 'corporation' && !corpOffered ? 'all' : scope;
  const [kind, setKind] = useState<InteractionKind | 'all'>('all');

  const characterIds = useMemo(() => {
    if (effective === 'all' || effective === 'corporation')
      return characters.map((c) => c.characterId);
    return activeCharacterId === null ? [] : [activeCharacterId];
  }, [effective, characters, activeCharacterId]);
  const input = useMemo(
    () =>
      characterIds.length === 0
        ? null
        : { scope: effective, otherId, otherName, characterIds, corporationId, t },
    [effective, otherId, otherName, characterIds, corporationId, t]
  );
  const load = useInteractions(input);

  const corporation = effective === 'corporation';
  const activeName = characters.find((c) => c.characterId === activeCharacterId)?.name ?? '';
  const heading = corporation
    ? t('interactions.title.corp', {
        name: otherName,
        corporation: t('character.filter.corporation'),
      })
    : effective === 'current' && characters.length > 1
      ? t('interactions.title.personalCharacter', { character: activeName, name: otherName })
      : t('interactions.title.personal', { name: otherName });

  const all = load.data?.rows ?? [];
  const rows = all.filter((r) => kind === 'all' || r.kind === kind);
  const counts = kindCounts(all);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 text-sm font-semibold">{heading}</div>
        <CharacterFilterControl
          activeCharacterId={activeCharacterId}
          value={effective}
          corporation={corpOffered}
          characterCount={characters.length}
          onChange={(next) => {
            setChoice(next);
            setKind('all');
          }}
        />
      </div>

      {load.status === 'loading' || load.status === 'idle' ? (
        <Spinner block="panel" label={t('common.loading')} />
      ) : load.status === 'failed' || !load.data ? (
        <LoadFailedState
          title={t('common.loadFailed.interactions')}
          onRetry={load.retry}
          className="py-8"
        />
      ) : all.length === 0 ? (
        <EmptyState
          title={t('interactions.emptyTitle', { name: otherName })}
          hint={t('interactions.emptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {load.data.incomplete && (
            <p className="text-xs text-text-dim">{t('interactions.loadFailedHint')}</p>
          )}
          {corporation ? (
            corporationId !== null && (
              <CorpChips query={{ otherId, otherName, corporationId, characterIds, t }} />
            )
          ) : (
            <PersonalChips rows={all} />
          )}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('interactions.filterLabel')}
          >
            <FilterChip
              label={t('interactions.filterAll')}
              count={all.length}
              selected={kind === 'all'}
              onToggle={() => setKind('all')}
            />
            {KINDS.filter((k) => counts[k]).map((k) => (
              <FilterChip
                key={k}
                label={t(`interactions.kind.${k}`)}
                count={counts[k]}
                selected={kind === k}
                onToggle={() => setKind(k)}
              />
            ))}
          </div>
          <InteractionsList rows={rows} showNet={!corporation} />
        </>
      )}
    </div>
  );
}
