import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { BuildResult, MaterialPriceBasis } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { ProductSellNow } from '@/engine/industry/productSellNow';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatCostIndex, formatPercent } from './format';
import { rigKindLabel } from './rigFitLabels';
import type { RigKind } from '@/engine/industry/types';

export interface BreakdownContext {
  hubName: string;
  materialPriceBasis: MaterialPriceBasis;
  productPriceOverridden?: boolean;
  me: number;
  isReaction: boolean;
  accountingLevel: number;
  brokerRelationsLevel: number;
  standing?: ResolvedStandings;
  systemCostIndex: number | null;
  costIndexSystemName: string;
  productName: string;
  productQuantity: number | null;
  productUnitPrice: number | null;
  planSeconds?: number;
  sellValue?: { forgone: number; breakEvenPrice: number | null } | null;
  sellNow?: ProductSellNow | null;
  nameOf?: (typeID: number) => string;
  depthRows?: readonly { typeID: number; name: string; walk: DepthPrice }[];
}

interface CalculationBreakdownProps {
  open: boolean;
  onClose: () => void;
  result: BuildResult;
  context: BreakdownContext;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className={eyebrowClassName}>{title}</h3>
      <div className="space-y-1.5 text-xs leading-relaxed text-text">{children}</div>
    </section>
  );
}

const FORMULA_BOX =
  'rounded-xs border border-line bg-panel-2 px-2 py-1 font-mono text-[0.6875rem] text-text-dim tabular-nums';

export function Formula({ children }: { children: ReactNode }) {
  return <p className={`overflow-x-auto whitespace-nowrap ${FORMULA_BOX}`}>{children}</p>;
}

export function CalculationBreakdown({
  open,
  onClose,
  result,
  context,
}: CalculationBreakdownProps) {
  const { t, i18n } = useTranslation();
  const rigRows = result.materials.flatMap((material) =>
    material.subBuild?.rigs ? [{ typeID: material.typeID, rigs: material.subBuild.rigs }] : []
  );
  const taxPct = salesTaxPct(context.accountingLevel, context.standing?.feeDiscountFactor);
  const brokerPct = brokerFeePct(
    context.brokerRelationsLevel,
    context.standing?.factionStanding,
    context.standing?.corpStanding,
    context.standing?.safetyTaxPct,
    context.standing?.feeDiscountFactor
  );
  const feePct = formatPercent(taxPct + brokerPct);

  return (
    <Modal open={open} onClose={onClose} title={t('industry.breakdown.title')}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-text-dim">
          {t('industry.breakdown.intro', { hub: context.hubName })}
        </p>

        <Section title={t('industry.breakdown.pricesTitle')}>
          <p>
            {context.materialPriceBasis === 'buy'
              ? t('industry.breakdown.pricesMaterialsBuy', { hub: context.hubName })
              : t('industry.breakdown.pricesMaterialsSell', { hub: context.hubName })}
          </p>
          {context.materialPriceBasis === 'buy' && (
            <p>
              {t(
                (context.standing?.safetyTaxPct ?? 0) > 0
                  ? 'industry.breakdown.pricesMaterialsBuyBrokerSafety'
                  : 'industry.breakdown.pricesMaterialsBuyBroker',
                { pct: formatPercent(brokerPct) }
              )}
            </p>
          )}
          <p>{t('industry.breakdown.pricesOre')}</p>
          <p>{t('industry.breakdown.pricesOwned')}</p>
          <p>{t('industry.breakdown.pricesBuilt')}</p>
          <p>
            {t(
              context.productPriceOverridden
                ? 'industry.breakdown.pricesProductOverride'
                : 'industry.breakdown.pricesProduct',
              { product: context.productName, hub: context.hubName }
            )}
          </p>
        </Section>

        <Section title={t('industry.breakdown.materialsTitle')}>
          <p>
            {context.isReaction
              ? t('industry.breakdown.materialsReaction')
              : t('industry.breakdown.materials', { me: context.me })}
          </p>
          <Formula>
            {t('industry.breakdown.materialsFormula', {
              value: formatIsk(result.materialCost),
            })}
          </Formula>
        </Section>

        {rigRows.length > 0 && (
          <Section title={t('industry.breakdown.rigsTitle')}>
            <p>{t('industry.breakdown.rigsIntro')}</p>
            <ul className={FORMULA_BOX}>
              {rigRows.map(({ typeID, rigs }) => (
                <li key={typeID}>
                  {t('industry.breakdown.rigsRow', {
                    material: context.nameOf?.(typeID) ?? String(typeID),
                    rigs:
                      rigs.length > 0
                        ? rigs.map((kind) => rigKindLabel(kind as RigKind, t)).join(', ')
                        : t('industry.breakdown.rigsNone'),
                  })}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {context.depthRows && context.depthRows.length > 0 && (
          <Section title={t('industry.breakdown.depthTitle')}>
            <p>
              {t('industry.breakdown.depthIntro', {
                materials: new Intl.ListFormat(i18n.language, {
                  style: 'long',
                  type: 'conjunction',
                }).format(context.depthRows.map((row) => row.name)),
                count: context.depthRows.length,
                hub: context.hubName,
              })}{' '}
              {t('industry.breakdown.depthProduct', { product: context.productName })}
            </p>
            {context.depthRows.map(({ typeID, name, walk }) => (
              <div key={typeID} className="space-y-1">
                <p className="font-semibold">
                  {t('industry.breakdown.depthRow', {
                    material: name,
                    need: formatCompactNumber(walk.need),
                    avg: formatIsk(walk.avg, 2),
                  })}
                </p>
                <ul className={FORMULA_BOX}>
                  {walk.levels.map((level) => (
                    <li key={level.price}>
                      {t(
                        level.units < level.listed
                          ? 'industry.breakdown.depthLevelPartial'
                          : 'industry.breakdown.depthLevel',
                        {
                          price: formatIsk(level.price, 2),
                          units: formatCount(level.units),
                          listed: formatCount(level.listed),
                        }
                      )}
                    </li>
                  ))}
                </ul>
                {!walk.covered && (
                  <p className="text-warning">
                    {t('industry.breakdown.depthShort', {
                      listed: formatCount(walk.listed),
                      need: formatCount(walk.need),
                    })}
                  </p>
                )}
              </div>
            ))}
          </Section>
        )}

        <Section title={t('industry.breakdown.jobFeeTitle')}>
          <p>
            {t('industry.breakdown.jobFee', {
              system: context.costIndexSystemName,
              index:
                context.systemCostIndex === null
                  ? t('common.unknown')
                  : formatCostIndex(context.systemCostIndex),
            })}
          </p>
          <Formula>
            {t(
              (result.jobFee.regionalTax ?? 0) > 0
                ? 'industry.breakdown.jobFeeFormulaExordium'
                : 'industry.breakdown.jobFeeFormula',
              {
                eiv: formatIsk(result.jobFee.eiv),
                costIndexFee: formatIsk(result.jobFee.grossCost),
                scc: formatIsk(result.jobFee.sccSurcharge),
                facilityTax: formatIsk(result.jobFee.facilityTax),
                regional: formatIsk(result.jobFee.regionalTax ?? 0),
                total: formatIsk(result.jobFee.total),
              }
            )}
          </Formula>
          <Formula>
            {t('industry.breakdown.totalCostFormula', {
              materials: formatIsk(result.materialCost),
              fee: formatIsk(result.jobFee.total),
              total: formatIsk(result.totalCost),
            })}
          </Formula>
        </Section>

        {result.revenue !== null &&
          result.salesTax !== null &&
          result.brokerFee !== null &&
          context.productQuantity !== null &&
          context.productUnitPrice !== null && (
            <Section title={t('industry.breakdown.revenueTitle')}>
              <p>
                {t(
                  context.productPriceOverridden
                    ? 'industry.breakdown.revenueOverride'
                    : 'industry.breakdown.revenue',
                  { hub: context.hubName }
                )}
              </p>
              <Formula>
                {t('industry.breakdown.revenueFormula', {
                  quantity: formatCount(context.productQuantity),
                  unitPrice: formatIsk(context.productUnitPrice),
                  revenue: formatIsk(result.revenue),
                })}
              </Formula>
              <p>{t('industry.breakdown.revenueAssumption')}</p>
              <p>
                {t('industry.breakdown.fees', {
                  accounting: context.accountingLevel,
                  broker: context.brokerRelationsLevel,
                  factionStanding: context.standing?.factionStanding ?? 0,
                  corpStanding: context.standing?.corpStanding ?? 0,
                })}
              </p>
              {context.standing?.feeDiscountFactor !== undefined && (
                <p>
                  {t('industry.breakdown.feeDiscount', {
                    hub: context.hubName,
                    pct: formatPercent((1 - context.standing.feeDiscountFactor) * 100),
                  })}
                </p>
              )}
              <Formula>
                {t('industry.breakdown.feesFormula', {
                  taxPct: formatPercent(taxPct),
                  tax: formatIsk(result.salesTax),
                  brokerPct: formatPercent(brokerPct),
                  broker: formatIsk(result.brokerFee),
                })}
              </Formula>
              {context.sellNow === null && (
                <p>
                  {t('industry.breakdown.sellNowNone', {
                    hub: context.hubName,
                    product: context.productName,
                  })}
                </p>
              )}
              {context.sellNow && (
                <>
                  <p>{t('industry.breakdown.sellNow', { hub: context.hubName })}</p>
                  <Formula>
                    {t(
                      context.sellNow.forgone > 0
                        ? 'industry.breakdown.sellNowFormulaSellValue'
                        : 'industry.breakdown.sellNowFormula',
                      {
                        quantity: formatCount(context.sellNow.quantity),
                        unitPrice: formatIsk(context.sellNow.unitPrice),
                        gross: formatIsk(context.sellNow.gross),
                        tax: formatIsk(context.sellNow.salesTax),
                        total: formatIsk(result.totalCost),
                        forgone: formatIsk(context.sellNow.forgone),
                        profit: formatIsk(context.sellNow.profit),
                      }
                    )}
                  </Formula>
                  <p>{t('industry.breakdown.sellNowDepth')}</p>
                </>
              )}
            </Section>
          )}

        <Section title={t('industry.breakdown.profitTitle')}>
          <p>{t('industry.breakdown.profitNet')}</p>
          <p>
            {t('industry.breakdown.profitIskPerHour', {
              time: formatDuration(result.seconds),
            })}
          </p>
          {context.planSeconds !== undefined && (
            <p>
              {t('industry.breakdown.profitPlanTime', {
                time: formatDuration(context.planSeconds),
              })}
            </p>
          )}
        </Section>

        {result.breakEvenPrice !== null && context.productQuantity !== null && (
          <Section title={t('industry.breakdown.breakEvenTitle')}>
            <p>{t('industry.breakdown.breakEven')}</p>
            <Formula>
              {t('industry.breakdown.breakEvenFormula', {
                total: formatIsk(result.totalCost),
                quantity: formatCount(context.productQuantity),
                feePct,
                breakEven: formatIsk(result.breakEvenPrice),
              })}
            </Formula>
            <p>{t('industry.breakdown.breakEvenFloor')}</p>
            {context.sellValue && context.sellValue.breakEvenPrice !== null && (
              <p>
                {t('industry.breakdown.breakEvenSellValue', {
                  forgone: formatIsk(context.sellValue.forgone),
                  breakEven: formatIsk(context.sellValue.breakEvenPrice),
                })}
              </p>
            )}
          </Section>
        )}

        <Section title={t('industry.breakdown.useOrSellTitle')}>
          <p>{t('industry.breakdown.useOrSellBody')}</p>
          <p>{t('industry.breakdown.useOrSellBases')}</p>
          <p>{t('industry.breakdown.useOrSellScope')}</p>
          <p>{t('industry.breakdown.useOrSellUnpriced')}</p>
        </Section>

        <Section title={t('industry.breakdown.verdictsTitle')}>
          <p>{t('industry.breakdown.verdictAcquisition', { product: context.productName })}</p>
          <p>{t('industry.breakdown.verdictSale')}</p>
        </Section>
      </div>
    </Modal>
  );
}
