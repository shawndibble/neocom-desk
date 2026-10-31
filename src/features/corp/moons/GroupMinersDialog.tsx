import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, SearchInput, SegmentedControl } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { planRegroup } from '@/engine/corpTaxBook/grouping';
import { DialogShell, Effect, Label } from './BookDialogs';
import { useBook } from './useBook';
import { useMinerChoices } from './useMinerChoices';

/**
 * Group other Miners' characters into this one (D18, issue #4194): an officer
 * picks the Miners to fold in and which character gets the mail. A guest's
 * character waits for their confirmation (D26b); the page shows it as pending.
 * The list is every Miner in the book, even on a one-Miner page (#5704).
 */
export function GroupMinersDialog({
  open,
  onClose,
  miner,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
}) {
  const { t } = useTranslation();
  const { names, edit } = useBook();
  const { choices, stored, name } = useMinerChoices();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [main, setMain] = useState(String(miner.mainCharacterId));

  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return choices.filter(
      (m) =>
        m.id !== miner.id &&
        (q === '' || m.characterIds.some((c) => name(c).toLowerCase().includes(q)))
    );
  }, [choices, miner.id, query, name]);
  const absorb = choices.filter((m) => picked.has(m.id));
  const characterIds = [...miner.characterIds, ...absorb.flatMap((m) => m.characterIds)];
  const outsiders = absorb.filter((m) => m.standing === 'guest').length;
  const mainValid = characterIds.includes(Number(main));

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.grouping.dialogTitle', {
        name: names.character(miner.mainCharacterId),
      })}
      confirmLabel={t('corpTaxBook.moons.grouping.confirm', { count: absorb.length })}
      canConfirm={absorb.length > 0 && mainValid}
      run={async () => {
        const plan = planRegroup({
          miners: stored,
          targetId: miner.id,
          targetCharacterIds: miner.characterIds,
          absorb,
          mainCharacterId: Number(main),
        });
        await edit(plan);
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.grouping.dialogIntro')}</p>
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('corpTaxBook.moons.miners.search')}
        aria-label={t('corpTaxBook.moons.miners.searchLabel')}
      />
      <ul className="max-h-56 space-y-1 overflow-auto">
        {others.map((m) => (
          <li key={m.id}>
            <label className={touchCheckboxLabelClassName}>
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
                {m.standing === 'guest' && (
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
      {absorb.length > 0 && (
        <Label text={t('corpTaxBook.moons.grouping.mailMain')}>
          <SegmentedControl
            label={t('corpTaxBook.moons.grouping.mailMain')}
            value={main}
            onChange={setMain}
            options={characterIds.map((c) => ({ value: String(c), label: name(c) }))}
            uppercase={false}
          />
        </Label>
      )}
      <Effect>
        {t('corpTaxBook.moons.grouping.effect')}
        {outsiders > 0 && ` ${t('corpTaxBook.moons.grouping.pendingEffect')}`}
      </Effect>
    </DialogShell>
  );
}
