import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, FieldError, NativeSelect, TextInput, Button } from '@/components/ui';
import {
  BUYBACK_GROUP_KEYS,
  parseRate,
  type BuybackHubId,
  type RateBasis,
} from '@/engine/communities/buyback';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { COMPARED_HUBS } from '@/market/hubs';
import { addType, removeType, toggleGroup, type BuybackDraft } from './buybackDraft';
import { ItemSearchPicker } from './ItemSearchPicker';

export interface BuyerOption {
  characterId: number;
  name: string;
}

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
  ownCharacterId: number;
}) {
  const { t } = useTranslation();
  const rateErrorId = useId();
  const rateValid = parseRate(draft.rate) !== null;

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
            {COMPARED_HUBS.map((hub) => (
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
            <label key={group} className={cx('flex items-center gap-2', tappableRowClassName)}>
              <Checkbox
                checked={draft.groups.includes(group)}
                onChange={() => onChange(toggleGroup(draft, group))}
              />
              {t(`communities.board.buyback.group.${group}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <ItemSearchPicker
        catalogue={catalogue}
        label={t('communities.board.buyback.addLabel')}
        placeholder={t('communities.board.buyback.addPlaceholder')}
        resultsLabel={t('communities.board.compose.results')}
        onPick={(item) => onChange(addType(draft, item))}
      />
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
