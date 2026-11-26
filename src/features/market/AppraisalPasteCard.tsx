import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  StatChip,
  TextArea,
  TextInput,
  Tooltip,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { GrantNote } from '@/app/GrantNote';
import { formatAge } from '@/lib/age';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { countPasteLines, pasteBoxRows } from '@/engine/market/appraisalPaste';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { HubField } from './HubMenu';
import { ASSETS_ENDPOINTS, OWNED_EVERYWHERE, type AppraisalOwnedPref } from './appraisalOwnedPref';
import { recentLabel, type RecentAppraisal } from './appraisalRecent';
import { formatVolume } from './format';
import { MAX_PRICE_PERCENT, MIN_PRICE_PERCENT } from './pricePercent';
import type { AppraisalController } from './useAppraisal';

const CLEAR_RECENT = 'clear';

interface AppraisalPasteCardProps {
  shownHubId?: TradeHub['id'];
  onHubPicked?: (id: TradeHub['id']) => void;
  controller: AppraisalController;
  characterId: number | null;
  percentText: string;
  onPercentChange: (next: string) => void;
  minusOwned: boolean;
  lacksAssets: boolean;
  ownedPref: AppraisalOwnedPref;
  setOwnedPref: (next: AppraisalOwnedPref) => Promise<void>;
  ownedStationId: number;
  otherPlaces: readonly { id: number; label: string }[];
  recent: readonly RecentAppraisal[];
  setRecent: (next: readonly RecentAppraisal[]) => Promise<void>;
  openedAt: number;
  appraiseFromForm: (run: () => void) => void;
  unmatchedNote: ReactNode;
}

export function AppraisalPasteCard({
  controller,
  shownHubId,
  onHubPicked,
  characterId,
  percentText,
  onPercentChange,
  minusOwned,
  lacksAssets,
  ownedPref,
  setOwnedPref,
  ownedStationId,
  otherPlaces,
  recent,
  setRecent,
  openedAt,
  appraiseFromForm,
  unmatchedNote,
}: AppraisalPasteCardProps) {
  const { t } = useTranslation();
  const { text, setText, loading } = controller;
  const ownedReasonId = useId();
  const checkboxBlocked = lacksAssets || characterId === null;
  const needsCharacter = characterId === null && !lacksAssets;
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const recentPicker =
    recent.length > 0 ? (
      <Select
        value=""
        onValueChange={(value) => {
          if (value === CLEAR_RECENT) void setRecent([]);
          else appraiseFromForm(() => controller.appraiseText(recent[Number(value)]?.text ?? ''));
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label={t('market.appraisal.recentPlaceholder')}
          className="w-32 max-w-full min-w-0"
        >
          <SelectValue placeholder={t('market.appraisal.recentPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {recent.map((entry, index) => {
            const { names, more } = recentLabel(entry.text);
            return (
              <SelectItem key={entry.text} value={String(index)}>
                {t(more > 0 ? 'market.appraisal.recentLabelMore' : 'market.appraisal.recentLabel', {
                  names: names.join(', '),
                  count: more,
                  age: formatAge(openedAt - entry.savedAt, t),
                })}
              </SelectItem>
            );
          })}
          <SelectSeparator />
          <SelectItem value={CLEAR_RECENT} className="text-text-dim">
            {t('market.appraisal.clearRecent')}
          </SelectItem>
        </SelectContent>
      </Select>
    ) : null;
  return (
    <Panel
      title={t('market.appraisal.pasteTitle')}
      actions={isDesktop ? undefined : (recentPicker ?? undefined)}
      meta={
        controller.canAppraise ? (
          <StatChip
            label={t('market.appraisal.linesLabel')}
            value={formatVolume(countPasteLines(text))}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        {isDesktop && recentPicker}
        <label className="block text-xs text-text-dim" htmlFor="market-appraisal-text">
          {t('market.appraisal.pasteLabel')}
        </label>
        <TextArea
          id="market-appraisal-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onSubmitChord={() => {
            if (controller.canAppraise && !loading) appraiseFromForm(controller.appraise);
          }}
          rows={pasteBoxRows(text)}
          spellCheck={false}
          placeholder={t('market.appraisal.pastePlaceholder')}
          mono
          className="text-[0.6875rem]"
        />

        <div className="flex items-center gap-2">
          <label className={eyebrowClassName} htmlFor="market-appraisal-percent">
            {t('market.appraisal.pricePercentLabel')}
          </label>
          <TextInput
            id="market-appraisal-percent"
            size="sm"
            type="number"
            inputMode="decimal"
            min={MIN_PRICE_PERCENT}
            max={MAX_PRICE_PERCENT}
            value={percentText}
            onChange={(event) => onPercentChange(event.target.value)}
            className="field-no-spinner w-16 text-right"
          />
          <HubField
            area="appraisal"
            shownHubId={shownHubId}
            onPicked={onHubPicked}
            size="sm"
            label={t('market.tradeHub')}
            className="min-w-0 flex-1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2">
            <label className={`flex items-center gap-2 text-xs ${tappableRowClassName}`}>
              <Checkbox
                checked={minusOwned}
                aria-disabled={checkboxBlocked || undefined}
                aria-describedby={needsCharacter ? ownedReasonId : undefined}
                onChange={(event) => {
                  if (checkboxBlocked) return;
                  void setOwnedPref({ ...ownedPref, enabled: event.target.checked });
                }}
              />
              {t('market.appraisal.minusOwned')}
            </label>
            <Select
              disabled={!minusOwned}
              value={ownedPref.everywhere ? OWNED_EVERYWHERE : String(ownedStationId)}
              onValueChange={(value) =>
                void setOwnedPref(
                  value === OWNED_EVERYWHERE
                    ? { ...ownedPref, everywhere: true }
                    : { ...ownedPref, everywhere: false, stationId: Number(value) }
                )
              }
            >
              <SelectTrigger
                size="sm"
                className="w-auto"
                aria-label={t('market.appraisal.minusOwnedStation')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OWNED_EVERYWHERE}>
                  {t('market.appraisal.minusOwnedEverywhere')}
                </SelectItem>
                <SelectSeparator />
                {TRADE_HUBS.map((h) => (
                  <SelectItem key={h.id} value={String(h.stationId)}>
                    {h.systemName}
                  </SelectItem>
                ))}
                {otherPlaces.length > 0 && <SelectSeparator />}
                {otherPlaces.map((place) => (
                  <SelectItem key={place.id} value={String(place.id)}>
                    {place.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsCharacter && (
            <p id={ownedReasonId} className="text-[0.6875rem] text-text-dim">
              {t('market.appraisal.minusOwnedNeedsCharacter')}
            </p>
          )}
          {lacksAssets && (
            <GrantNote
              {...(characterId !== null ? { characterId } : {})}
              endpoints={ASSETS_ENDPOINTS}
              title={t('market.appraisal.minusOwnedGrantTitle')}
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="md"
            variant="primary"
            className="max-sm:w-full"
            onClick={() => appraiseFromForm(controller.appraise)}
            loading={loading}
            aria-disabled={!controller.canAppraise || undefined}
          >
            {t('market.appraisal.appraise')}
          </Button>
          <Tooltip content={text === '' ? t('market.appraisal.clearEmpty') : null}>
            <Button size="md" onClick={controller.clear} aria-disabled={text === '' || undefined}>
              {t('market.appraisal.clear')}
            </Button>
          </Tooltip>
        </div>

        {unmatchedNote}
      </div>
    </Panel>
  );
}
