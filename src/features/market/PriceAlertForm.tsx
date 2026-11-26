import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FieldError,
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
import { useHubFor } from './hub';
import type { QuickbarTarget } from './quickbar';
import { useAsyncLoad } from '@/lib/useAsyncLoad';

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
  const [error, setError] = useState(false);
  const errorId = useId();
  const hasTarget = targetPrice !== undefined && targetDirection !== undefined;

  const { hubId } = useHubFor('market');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const loadSellMin = useCallback(
    () => getHubPrices(hub, [typeId]).then((prices) => prices.get(typeId)?.sellMin ?? null),
    [hub, typeId]
  );
  const sellMin = useAsyncLoad(loadSellMin).data ?? null;

  function handleSave() {
    const amount = parseIskAmount(text);
    if (amount === null || amount <= 0) {
      setError(true);
      return;
    }
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
          aria-invalid={error}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
        />
      </label>
      {error && <FieldError id={errorId}>{t('market.priceAlert.invalidPrice')}</FieldError>}
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
