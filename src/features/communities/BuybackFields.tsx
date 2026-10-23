import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  FieldError,
  NativeSelect,
  SearchInput,
  TextInput,
  Button,
} from '@/components/ui';
import {
  BUYBACK_GROUP_KEYS,
  parseRate,
  type BuybackHubId,
  type RateBasis,
} from '@/engine/communities/buyback';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { TRADE_HUBS } from '@/market/hubs';
import { addType, removeType, toggleGroup, type BuybackDraft } from './buybackDraft';
import { namedLike, needleOf } from './shareLists';

const SEARCH_RESULTS = 8;
const MIN_SEARCH_CHARS = 2;

/** A Character of the requester that may take the contracts: it is a Member of this Community. */
export interface BuyerOption {
  characterId: number;
  name: string;
}

/**
 * The buyback half of the compose form (issue #4780): the rate and what it is
 * a percent of, the Trade Hub, who the contracts go to, and what the corp
 * buys, as ticked groups ("All ore") and single items.
 */
export function BuybackFields({
  draft,
  onChange,
  catalogue,
  buyers,
  ownCharacterId,
}: {
  draft: BuybackDraft;
  onChange: (next: BuybackDraft) => void;
  catalogue: AppraisalCatalogue | null;
  buyers: readonly BuyerOption[];
  /** The Character posting: what "contracts go to" means when none is named. */
  ownCharacterId: number;
}) {
  const { t } = useTranslation();
  const rateErrorId = useId();
  const [search, setSearch] = useState('');
  const rateValid = parseRate(draft.rate) !== null;

  const results = useMemo(() => {
    const needle = needleOf(search);
    if (!catalogue || needle.length < MIN_SEARCH_CHARS) return [];
    return namedLike([...catalogue.values()], needle).slice(0, SEARCH_RESULTS);
  }, [catalogue, search]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">{t('communities.board.buyback.rate')}</span>
          <TextInput
            className="w-full tabular-nums"
            inputMode="decimal"
            aria-invalid={!rateValid || undefined}
            aria-describedby={rateValid ? undefined : rateErrorId}
            value={draft.rate}
            onChange={(e) => onChange({ ...draft, rate: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">
            {t('communities.board.buyback.basis')}
          </span>
          <NativeSelect
            className="w-full"
            value={draft.rateBasis}
            onChange={(e) => onChange({ ...draft, rateBasis: e.target.value as RateBasis })}
          >
            <option value="buy">{t('communities.board.buyback.basisBuy')}</option>
            <option value="sell">{t('communities.board.buyback.basisSell')}</option>
          </NativeSelect>
        </label>
        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">{t('communities.board.buyback.hub')}</span>
          <NativeSelect
            className="w-full"
            value={draft.hubId}
            onChange={(e) => onChange({ ...draft, hubId: e.target.value as BuybackHubId })}
          >
            {TRADE_HUBS.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.systemName}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {!rateValid && (
        <FieldError id={rateErrorId}>{t('communities.board.buyback.rateInvalid')}</FieldError>
      )}
      {buyers.length > 1 && (
        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">
            {t('communities.board.buyback.buyer')}
          </span>
          <NativeSelect
            className="w-full sm:w-1/2"
            value={String(draft.buyerCharacterId ?? ownCharacterId)}
            onChange={(e) => {
              const id = Number(e.target.value);
              onChange({ ...draft, buyerCharacterId: id === ownCharacterId ? null : id });
            }}
          >
            {buyers.map((b) => (
              <option key={b.characterId} value={b.characterId}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
          <span className="block text-xs text-text-dim">
            {t('communities.board.buyback.buyerHint')}
          </span>
        </label>
      )}
      <fieldset className="space-y-2">
        <legend className="text-xs text-text-dim">{t('communities.board.buyback.buys')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {BUYBACK_GROUP_KEYS.map((group) => (
            <label key={group} className="flex items-center gap-2">
              <Checkbox
                checked={draft.groups.includes(group)}
                onChange={() => onChange(toggleGroup(draft, group))}
              />
              {t(`communities.board.buyback.group.${group}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <SearchInput
          aria-label={t('communities.board.buyback.addLabel')}
          placeholder={t('communities.board.buyback.addPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <ul
            aria-label={t('communities.board.compose.results')}
            className="divide-y divide-line rounded-xs border border-line"
          >
            {results.map((item) => (
              <li key={item.typeId}>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-panel-2 focus-visible:bg-panel-2"
                  onClick={() => {
                    onChange(addType(draft, item));
                    setSearch('');
                  }}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {draft.types.length > 0 && (
        <ul
          aria-label={t('communities.board.buyback.typesLabel')}
          className="divide-y divide-line rounded-xs border border-line"
        >
          {draft.types.map((type) => (
            <li key={type.typeId} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">{type.name}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('communities.board.compose.removeLine', { name: type.name })}
                onClick={() => onChange(removeType(draft, type.typeId))}
              >
                {t('communities.board.compose.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
