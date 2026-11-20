import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, SearchInput, SegmentedControl, Spinner } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { planRegroup, type MinerChoice } from '@/engine/corpTaxBook/grouping';
import {
  MIN_PAYEE_SEARCH_LENGTH,
  searchPayeeEntities,
} from '@/features/miningTax/payeeEntitySearch';
import { DialogShell, Effect, Label } from './BookDialogs';
import { useBook } from './useBook';
import { useMinerChoices } from './useMinerChoices';

/** Everything the group dialog needs, so it runs on the Miner page (the book) and on the roster (no book). */
export interface GroupSource {
  status: 'loading' | 'ready' | 'failed';
  /** Every stored group, and every ungrouped character mining since the start date. */
  choices: readonly MinerChoice[];
  /** The stored groups, which `planRegroup` needs whole. */
  stored: readonly Miner[];
  name: (characterId: number) => string;
  edit: (action: { action: string } & Record<string, unknown>) => Promise<unknown>;
  /** The officer's Character, who runs the name search. */
  searchAs: number;
}

type Target = Pick<MinerRow, 'id' | 'mainCharacterId' | 'characterIds'>;

/**
 * Group other Miners' characters, and characters found by name, into this one (D18, issue #4194):
 * an officer picks the Miners to fold in and which character gets the mail. A character added by
 * name, inside or outside the corporation, is an Officer claim: billed with the group, no
 * confirmation, and it reads nothing of it until its owner signs in as it.
 */
export function GroupMinersView({
  open,
  onClose,
  miner,
  source,
  wording = 'miner',
  rosterIds,
}: {
  open: boolean;
  onClose: () => void;
  miner: Target;
  source: GroupSource;
  /** `'player'` is the Members page's words (a Player's characters); `'miner'` the Moons page's. */
  wording?: 'miner' | 'player';
  /**
   * The corporation roster's character ids. When given, a character is labelled "not in the
   * corporation" only if the roster lacks it; without it the label follows the choice's standing.
   */
  rosterIds?: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const { status, choices, stored, name, edit, searchAs } = source;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [main, setMain] = useState(String(miner.mainCharacterId));
  const [find, setFind] = useState('');
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [added, setAdded] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    const q = find.trim();
    if (q.length < MIN_PAYEE_SEARCH_LENGTH) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      searchPayeeEntities(searchAs, q, ctl.signal)
        .then((hits) =>
          setFound(
            hits.filter((h) => h.kind === 'character').map(({ id, name: n }) => ({ id, name: n }))
          )
        )
        .catch(() => setFound([]));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [find, searchAs]);

  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return choices.filter(
      (m) =>
        m.id !== miner.id &&
        (q === '' || m.characterIds.some((c) => name(c).toLowerCase().includes(q)))
    );
  }, [choices, miner.id, query, name]);
  const absorb = choices.filter((m) => picked.has(m.id));
  const claimed = added.filter(
    (a) => !miner.characterIds.includes(a.id) && !absorb.some((m) => m.characterIds.includes(a.id))
  );
  const mainOptions = [...miner.characterIds, ...absorb.flatMap((m) => m.characterIds)];
  const characterIds = [...mainOptions, ...claimed.map((c) => c.id)];
  const mainValid = mainOptions.includes(Number(main));
  const changed = absorb.length > 0 || claimed.length > 0;
  const shown = found.filter(
    (f) => !characterIds.includes(f.id) && !stored.some((m) => m.characterIds.includes(f.id))
  );
  const nameOf = (id: number) => added.find((a) => a.id === id)?.name ?? name(id);
  const player = wording === 'player';
  const k = (miner_: string, player_: string) =>
    player ? `corp.members.players.group.${player_}` : `corpTaxBook.moons.${miner_}`;
  const outsideCorp = (m: MinerChoice) =>
    rosterIds ? !m.characterIds.some((c) => rosterIds.has(c)) : m.standing === 'guest';

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t(k('grouping.dialogTitle', 'title'), { name: name(miner.mainCharacterId) })}
      confirmLabel={t(k('grouping.confirm', 'confirm'), {
        count: absorb.length + claimed.length,
      })}
      canConfirm={changed && mainValid}
      run={async () => {
        await edit(
          planRegroup({
            miners: stored,
            targetId: miner.id,
            targetCharacterIds: [...miner.characterIds, ...claimed.map((c) => c.id)],
            absorb,
            mainCharacterId: Number(main),
          })
        );
      }}
    >
      <p className="text-text-dim">{t(k('grouping.dialogIntro', 'intro'))}</p>
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t(k('miners.search', 'search'))}
        aria-label={t(k('miners.searchLabel', 'searchLabel'))}
      />
      {status === 'loading' && <Spinner block="panel" delayMs={200} label={t('common.loading')} />}
      {status === 'failed' && (
        <InlineError>{t('corpTaxBook.moons.grouping.listFailed')}</InlineError>
      )}
      <ul className="max-h-56 space-y-1 overflow-auto">
        {others.map((m) => (
          <li key={m.id}>
            <label className={cx('flex cursor-pointer items-center gap-3', tappableRowClassName)}>
              <Checkbox
                checked={picked.has(m.id)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(m.id)) next.add(m.id);
                    return next;
                  })
                }
              />
              <span>
                {name(m.mainCharacterId)}
                {m.characterIds.length > 1 &&
                  ` ${t('corpTaxBook.moons.moreCharacters', { count: m.characterIds.length - 1 })}`}
                {outsideCorp(m) && (
                  <span className="text-xs text-text-dim">
                    {' '}
                    · {t('corpTaxBook.moons.grouping.outsideCorp')}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Label text={t('corpTaxBook.moons.grouping.findLabel')}>
        <SearchInput
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={t('corpTaxBook.moons.grouping.findPlaceholder')}
          aria-label={t('corpTaxBook.moons.grouping.findLabel')}
        />
      </Label>
      {find.trim().length >= MIN_PAYEE_SEARCH_LENGTH && shown.length === 0 && (
        <p className="text-xs text-text-dim">{t('corpTaxBook.moons.grouping.findNone')}</p>
      )}
      <ul className="space-y-1">
        {shown.map((f) => (
          <li key={f.id}>
            <label className={cx('flex cursor-pointer items-center gap-3', tappableRowClassName)}>
              <Checkbox
                checked={false}
                aria-label={f.name}
                onChange={() => setAdded((prev) => [...prev, f])}
              />
              <span>{f.name}</span>
            </label>
          </li>
        ))}
        {claimed.map((c) => (
          <li key={`added-${c.id}`}>
            <label className={cx('flex cursor-pointer items-center gap-3', tappableRowClassName)}>
              <Checkbox
                checked
                aria-label={t('corpTaxBook.moons.grouping.findRemove', { name: c.name })}
                onChange={() => setAdded((prev) => prev.filter((a) => a.id !== c.id))}
              />
              <span>
                {c.name}
                <span className="text-xs text-text-dim">
                  {' '}
                  · {t('corpTaxBook.moons.grouping.findAdded')}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {changed && (
        <Label text={t('corpTaxBook.moons.grouping.mailMain')}>
          <SegmentedControl
            label={t('corpTaxBook.moons.grouping.mailMain')}
            value={main}
            onChange={setMain}
            options={mainOptions.map((c) => ({ value: String(c), label: nameOf(c) }))}
            uppercase={false}
          />
        </Label>
      )}
      <Effect>
        {t(k('grouping.effect', 'effect'))}
        {claimed.length > 0 && ` ${t(k('grouping.claimEffect', 'claimEffect'))}`}
      </Effect>
    </DialogShell>
  );
}

/** The group dialog on a Miner's page, fed by the open book. */
export function GroupMinersDialog({
  open,
  onClose,
  miner,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
}) {
  const { names, edit, characterId } = useBook();
  const { status, choices, stored, name } = useMinerChoices();
  return (
    <GroupMinersView
      open={open}
      onClose={onClose}
      miner={miner}
      source={{
        status,
        choices,
        stored,
        name: name ?? names.character,
        edit,
        searchAs: characterId,
      }}
    />
  );
}
