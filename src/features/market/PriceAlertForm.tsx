/**
 * The price alert form (issue #680, extracted for #1427): shared by the
 * Quickbar row's popover, the Market Browser header bell's popover and the
 * item context menu's dialog. Takes just the item's name and current target
 * rather than a `QuickbarItem`, so an item that isn't pinned yet can use it.
 *
 * Edits a copy of the target, committed only on Save. A host that unmounts it
 * on close (Radix popovers and `Modal`'s children do) gets a fresh read of the
 * saved target each time it opens, with no sync effect.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { formatIsk, parseIskAmount } from '@/lib/isk';
import { getHubPrices } from '@/market/prices';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { useMarketHub } from './hub';
import type { QuickbarTarget } from './quickbar';

export interface PriceAlertFormProps {
  typeId: number;
  targetPrice?: number;
  targetDirection?: 'above' | 'below';
  onSave: (target: NonNullable<QuickbarTarget>) => void;
  onClear: () => void;
  onClose: () => void;
}

export function PriceAlertForm({
  typeId,
  targetPrice,
  targetDirection,
  onSave,
  onClear,
  onClose,
}: PriceAlertFormProps) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<'above' | 'below'>(targetDirection ?? 'above');
  const [text, setText] = useState(targetPrice !== undefined ? formatIsk(targetPrice) : '');
  const hasTarget = targetPrice !== undefined && targetDirection !== undefined;

  // The hub the alert polls (`priceAlertDomain` → the synced Settings default),
  // not necessarily the one the Market Browser is showing.
  const hubId = useMarketHub((state) => state.value);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const [sellMin, setSellMin] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getHubPrices(hub, [typeId]).then((prices) => {
      if (!cancelled) setSellMin(prices.get(typeId)?.sellMin ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [hub, typeId]);

  function handleSave() {
    const amount = parseIskAmount(text);
    if (amount === null || amount <= 0) return;
    onSave({ price: Math.round(amount), direction });
    onClose();
  }

  return (
    <div className="flex w-56 flex-col gap-2 p-2 text-xs">
      <p className="text-text-dim">
        {t('market.priceAlert.hubLine', { hub: hub.systemName })}
        {sellMin !== null && (
          <>
            {' '}
            <span className="text-text">
              {t('market.priceAlert.currentPrice', { price: formatIsk(sellMin) })}
            </span>
          </>
        )}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-text-dim">{t('market.priceAlert.priceLabel')}</span>
        <TextInput
          size="sm"
          type="text"
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Select value={direction} onValueChange={(value) => setDirection(value as typeof direction)}>
        <SelectTrigger size="sm" aria-label={t('market.priceAlert.directionLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="above">{t('market.priceAlert.directionAbove')}</SelectItem>
          <SelectItem value="below">{t('market.priceAlert.directionBelow')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex justify-end gap-2">
        {hasTarget && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            {t('market.priceAlert.clear')}
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={handleSave}>
          {t('market.priceAlert.save')}
        </Button>
      </div>
    </div>
  );
}
