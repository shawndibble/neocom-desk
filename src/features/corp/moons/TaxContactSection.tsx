import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, NativeSelect, Radio } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import * as Icon from '@/components/ui/icons';
import { TAX_CONTACT_MAX_CHARACTERS } from '@/engine/corpTaxBook/bookDocs';
import type { TaxContactDraft } from './taxContactDraft';
import { loadMailingLists } from '@/features/character/mail';
import { resolveNames } from '@/features/character/names';
import { loadCorporationCeoId } from '@/features/corp/members';
import { PayeeNameField } from '@/features/miningTax/PayeeNameField';

const k = (key: string) => `corpTaxBook.moons.settings.taxContact.${key}`;

export function TaxContactSection({
  characterId,
  corporationId,
  draft,
  onChange,
  disabled,
}: {
  characterId: number;
  corporationId: number;
  draft: TaxContactDraft;
  onChange: (draft: TaxContactDraft) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  const [ceoName, setCeoName] = useState<string | null>(null);
  const [lists, setLists] = useState<{ id: number; name: string }[]>([]);
  const [names, setNames] = useState(() => new Map<number, string>());
  const [query, setQuery] = useState('');
  const officerKey = draft.officerIds.join(',');

  useEffect(() => {
    let cancelled = false;
    void loadCorporationCeoId(corporationId)
      .then((id) => (id === null ? null : resolveNames([id]).then((m) => m.get(id) ?? null)))
      .then((n) => !cancelled && setCeoName(n))
      .catch(() => undefined);
    void loadMailingLists(characterId)
      .then((r) => {
        if (cancelled) return;
        setLists((r.cached?.data ?? []).map((l) => ({ id: l.mailing_list_id, name: l.name })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId]);

  useEffect(() => {
    const ids = officerKey === '' ? [] : officerKey.split(',').map(Number);
    if (ids.length === 0) return;
    let cancelled = false;
    void resolveNames(ids)
      .then((m) => !cancelled && setNames((prev) => new Map([...prev, ...m])))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [officerKey]);

  const listOptions =
    draft.listId !== null && !lists.some((l) => l.id === draft.listId)
      ? [{ id: draft.listId, name: draft.listName }, ...lists]
      : lists;
  const full = draft.officerIds.length >= TAX_CONTACT_MAX_CHARACTERS;
  const set = (patch: Partial<TaxContactDraft>) => onChange({ ...draft, ...patch });

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold">{t(k('title'))}</legend>
      <p className="text-xs text-text-dim">{t(k('hint'))}</p>

      <label className={cx('flex items-start gap-2 text-sm', tappableRowClassName)}>
        <Radio
          name={name}
          checked={draft.mode === 'ceo'}
          onChange={() => set({ mode: 'ceo' })}
          className="mt-0.5"
        />
        <span>
          {ceoName ? t(k('ceoNamed'), { name: ceoName }) : t(k('ceo'))}
          <span className="block text-xs text-text-dim">{t(k('ceoDefault'))}</span>
        </span>
      </label>

      <div className="text-sm">
        <span className="block min-w-0 space-y-1">
          <label className={cx('flex items-start gap-2', tappableRowClassName)}>
            <Radio
              name={name}
              checked={draft.mode === 'list'}
              onChange={() => set({ mode: 'list' })}
              className="mt-0.5"
            />
            <span>{t(k('list'))}</span>
          </label>
          <span className="block space-y-1 pl-6">
            <NativeSelect
              size="sm"
              className="max-w-xs"
              aria-label={t(k('listPick'))}
              value={draft.listId === null ? '' : String(draft.listId)}
              onChange={(e) => {
                const picked = listOptions.find((l) => String(l.id) === e.target.value);
                set({
                  mode: 'list',
                  listId: picked?.id ?? null,
                  listName: picked?.name ?? '',
                });
              }}
            >
              <option value="">{t(k('listNone'))}</option>
              {listOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
            <span className="block text-xs text-text-dim">{t(k('listHint'))}</span>
          </span>
        </span>
      </div>

      <div className="text-sm">
        <span className="block min-w-0 space-y-1">
          <label className={cx('flex items-start gap-2', tappableRowClassName)}>
            <Radio
              name={name}
              checked={draft.mode === 'officers'}
              onChange={() => set({ mode: 'officers' })}
              className="mt-0.5"
            />
            <span>{t(k('officers'))}</span>
          </label>
          <span className="block space-y-1 pl-6">
            <span className="block text-xs text-text-dim">
              {t(k('officersHint'), { max: TAX_CONTACT_MAX_CHARACTERS })}
            </span>
            {draft.mode === 'officers' && (
              <>
                <ul className="space-y-1">
                  {draft.officerIds.map((id) => {
                    const who = names.get(id) ?? t(k('unnamedOfficer'), { id });
                    return (
                      <li key={id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{who}</span>
                        <IconButton
                          icon={<Icon.Close />}
                          size="row"
                          label={t(k('removeOfficer'), { name: who })}
                          onClick={() =>
                            set({ officerIds: draft.officerIds.filter((x) => x !== id) })
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
                {!full && (
                  <PayeeNameField
                    id={`${name}-search`}
                    characterId={characterId}
                    value={query}
                    onChange={setQuery}
                    ariaLabel={t(k('officerSearch'))}
                    placeholder={t(k('officerSearch'))}
                    size="sm"
                    className="max-w-xs"
                    onPick={(match) => {
                      setQuery('');
                      if (match.kind !== 'character' || draft.officerIds.includes(match.id)) return;
                      setNames((prev) => new Map(prev).set(match.id, match.name));
                      set({ officerIds: [...draft.officerIds, match.id] });
                    }}
                  />
                )}
              </>
            )}
          </span>
        </span>
      </div>
    </fieldset>
  );
}
