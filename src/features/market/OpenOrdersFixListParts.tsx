/**
 * The Open Orders fix list's own pieces around its table: the headline
 * summary, the healthy fold with the badges legend under the list, and the
 * notices folded into one quiet line at its foot.
 */
import { Fragment, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, IskAmount, NeedsConnection, textActionClassName } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { beginGrant } from '@/app/grantAction';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import type { EsiEndpointId } from '@/esi/registry';
import { InfoTooltip } from '@/components/ui';
import { STAT_CHIP_TONE_TEXT_CLASS } from '@/components/ui/statChipTone';
import { orderSlotTone, type OrderSlotBreakdown } from '@/engine/market/orderSlots';
import { WorkThroughSummaryTail } from './WorkThroughControls';

/** As `AssumesBaseStandingsNote`'s. */
const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];

/** The viewed Character's open orders against their ceiling; `breakdown` null when skills are missing. */
export interface OrderSlotsFigure {
  used: number;
  breakdown: OrderSlotBreakdown | null;
}

function OrderSlotsMeter({ used, breakdown }: OrderSlotsFigure) {
  const { t } = useTranslation();
  if (!breakdown) return null;
  const { total, base, skills } = breakdown;
  // The breakdown is a list, so it sits in the tooltip text as one sentence (touch opens it on tap)
  // and the used / max figure itself is always visible.
  const detail = [
    t('market.orders.slots.base', { count: base }),
    ...skills
      .filter((s) => s.level > 0)
      .map((s) =>
        t('market.orders.slots.skill', {
          name: t(`market.orders.slots.skillName.${s.typeID}`),
          level: s.level,
          count: s.slots,
        })
      ),
  ].join(', ');
  const tone = orderSlotTone(used, total);
  const label = t('market.orders.slots.label');
  return (
    <span className="inline-flex items-center gap-1">
      <span className={tone === 'default' ? '' : `font-medium ${STAT_CHIP_TONE_TEXT_CLASS[tone]}`}>
        {t('market.orders.slots.value', { label, used, max: total })}
      </span>
      <InfoTooltip
        label={t('common.aboutLabel', { label })}
        content={t('market.orders.slots.tooltip', { detail })}
        glyph="info"
      />
    </span>
  );
}

/** "5 orders need you", then "600.8M ISK tied up in them · 3 to watch · 9 fine" and the work-through. */
export function FixListSummary({
  actCount,
  actIskTiedUp,
  watchCount,
  fineCount,
  orderSlots,
}: {
  actCount: number;
  actIskTiedUp: number;
  watchCount: number;
  fineCount: number;
  orderSlots?: OrderSlotsFigure;
}) {
  const { t } = useTranslation();
  const parts: ReactNode[] = [
    t('market.orders.fixList.toWatch', { count: watchCount }),
    t('market.orders.fixList.fine', { count: fineCount }),
  ];
  if (actCount > 0) {
    parts.unshift(
      <Trans
        key="isk"
        i18nKey="market.orders.fixList.tiedUp"
        components={{ isk: <IskAmount value={actIskTiedUp} /> }}
      />
    );
  }
  if (orderSlots?.breakdown) parts.push(<OrderSlotsMeter key="slots" {...orderSlots} />);
  return (
    <div>
      <h2 className="text-xl font-semibold text-text">
        {t('market.orders.fixList.headline', { count: actCount })}
      </h2>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-text-dim">
        <span>
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && ' \u00b7 '}
              {part}
            </Fragment>
          ))}
        </span>
        <WorkThroughSummaryTail />
      </p>
      {orderSlots && !orderSlots.breakdown && (
        <p className="mt-0.5 text-xs text-text-dim">{t('market.orders.slots.unavailable')}</p>
      )}
    </div>
  );
}

/** "9 healthy orders · Show" while a segment hides them, then the badges legend. */
export function HealthyFold({
  fineCount,
  folded,
  onShow,
  onLegend,
}: {
  fineCount: number;
  /** Whether the segment on screen leaves the healthy orders out. */
  folded: boolean;
  onShow: () => void;
  onLegend: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {folded && fineCount > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-dim">
          <span>{t('market.orders.fixList.healthy', { count: fineCount })}</span>
          <span aria-hidden="true">·</span>
          <button type="button" className={textActionClassName()} onClick={onShow}>
            {t('market.orders.fixList.showHealthy')}
          </button>
        </p>
      )}
      <Button size="sm" onClick={onLegend}>
        {t('market.orders.legendOpen')}
      </Button>
    </div>
  );
}

/**
 * One Character's "fees assume base standings" note, only once its grant is
 * known to lack standings (`GrantNote`'s rule), with its Grant.
 */
function StandingsAssumed({ characterId, name }: { characterId: number; name: string }) {
  const { t } = useTranslation();
  const lacks = useCharacterLacksEndpoints(characterId, STANDINGS_ENDPOINTS);
  if (!lacks) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <HintText content={t('market.orders.assumesBaseStandingsHint')}>
        {t('market.orders.fixList.standingsAssumed', { name })}
      </HintText>
      <NeedsConnection>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void beginGrant(characterId, STANDINGS_ENDPOINTS)}
        >
          {t('reauth.standingsAssumedAction')}
        </Button>
      </NeedsConnection>
    </span>
  );
}

/**
 * The notices that qualify the list, as one quiet line at its foot: fees
 * priced at base standings, and Characters that have not shared their orders.
 * Empty, it takes no room.
 */
export function ListNotes({
  floorCharacters,
  notShared,
}: {
  /** Characters with a floor on any matched order: each floor prices with their standings. */
  floorCharacters: readonly { characterId: number; name: string }[];
  notShared: readonly { characterId: number; name: string }[];
}) {
  const { t } = useTranslation();
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim empty:hidden [&>*+*]:before:mr-1.5 [&>*+*]:before:content-['·']">
      {floorCharacters.map((c) => (
        <StandingsAssumed key={c.characterId} characterId={c.characterId} name={c.name} />
      ))}
      {notShared.map((c) => (
        <span key={c.characterId}>{t('market.orders.fixList.notShared', { name: c.name })}</span>
      ))}
    </p>
  );
}
