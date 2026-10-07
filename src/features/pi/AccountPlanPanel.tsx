/**
 * Find best's whole-account plan: what all of the pilot's planets should do
 * together. Draws `accountView`, computes no figure. A row is a change: a chain
 * across planets, or one planet making a product from bought inputs. The rest
 * stay on their own best pick, in one line.
 *
 * Cues follow DESIGN.md §6c: the product name opens its PI detail; the rows
 * carry no controls of their own.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, Panel, Spinner, StatChip, StatChips, TypeIcon } from '@/components/ui';
import { piTier } from '@/engine/pi/chain';
import type { AccountGroup } from '@/engine/pi/accountPlan';
import type { PiData } from '@/sde/types';
import { EstimateBadge, TierChip } from './DirectiveRow';
import { PiProductLink } from './PiProductLink';
import type { PlanAdvice } from './planAdviceModel';
import type { AccountView } from './accountPlanModel';

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
const m3 = (value: number) => Math.round(value).toLocaleString('en');

function Row({
  group,
  nameOf,
  pi,
}: {
  group: AccountGroup;
  nameOf: (planetId: number) => string;
  pi: PiData;
}) {
  const { t } = useTranslation();
  const typeId = group.typeId!;
  const planets = listFormat.format(group.planetIds.map(nameOf));
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
      <TypeIcon typeId={typeId} size={32} width={24} height={24} />
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <span className="flex flex-wrap items-center gap-x-2">
          <PiProductLink typeId={typeId}>
            <b className="font-semibold">{pi.schematics[String(typeId)]?.name ?? `#${typeId}`}</b>
          </PiProductLink>
          <TierChip tier={piTier(typeId, pi)} />
        </span>
        <p className="text-xs text-text-dim">
          {t(group.planetIds.length === 1 ? 'piPlan.account.onOne' : 'piPlan.account.onMany', {
            planets,
            host: group.hostId === null ? '' : nameOf(group.hostId),
            count: group.planetIds.length,
          })}
          {group.buys && ` ${t('piPlan.account.buysInputs')}`}
          {group.m3PerWeek > 0 && ` ${t('piPlan.account.hauls', { value: m3(group.m3PerWeek) })}`}
        </p>
      </div>
      <span className="text-xs text-text-dim">
        {t('piPlan.account.apart')} <IskAmount value={group.apartPerDay} decimals={0} />
      </span>
      <b className="text-base font-semibold tabular-nums">
        <IskAmount value={group.iskPerDay} decimals={0} />
        <span className="text-[0.6875rem] font-normal text-text-dim">
          {t('piPlan.make.perDay')}
        </span>
      </b>
    </li>
  );
}

export function AccountPlanPanel({
  view,
  pending,
  advice,
  pi,
  haul,
  buying,
}: {
  view: AccountView | null;
  pending: boolean;
  advice: PlanAdvice;
  pi: PiData;
  haul: boolean;
  buying: boolean;
}) {
  const { t } = useTranslation();
  const names = new Map(advice.colonies.map((colony) => [colony.planetId, colony.name]));
  const nameOf = (id: number) => names.get(id) ?? t('pi.planetLabel', { id });
  return (
    <Panel
      title={t('piPlan.account.title')}
      wrapMeta
      meta={
        <span className="text-[0.6875rem] text-text-dim max-md:basis-full">
          {t('piPlan.account.meta')}
        </span>
      }
      actions={<EstimateBadge />}
      padded={false}
    >
      {view === null ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-text-dim">
          {pending && <Spinner label={t('piPlan.account.pending')} />}
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-line px-3 py-3">
            <p className="text-sm">
              {t('piPlan.account.total')}{' '}
              <b className="font-semibold tabular-nums">
                <IskAmount value={view.totalPerDay} decimals={0} />
                {t('piPlan.make.perDay')}
              </b>
            </p>
            <StatChips>
              <StatChip
                label={t('piPlan.account.apartTotal')}
                value={
                  <>
                    <IskAmount value={view.apartTotalPerDay} decimals={0} />
                    {t('piPlan.make.perDay')}
                  </>
                }
              />
              {buying && (
                <StatChip
                  label={t('piPlan.account.buyGain')}
                  value={
                    <>
                      +<IskAmount value={view.buyGainPerDay} decimals={0} />
                      {t('piPlan.make.perDay')}
                    </>
                  }
                />
              )}
              {haul && (
                <StatChip
                  label={t('piPlan.account.haulGain')}
                  value={
                    <>
                      +<IskAmount value={view.haulGainPerDay} decimals={0} />
                      {t('piPlan.make.perDay')}
                    </>
                  }
                />
              )}
            </StatChips>
          </div>
          {view.changes.length > 0 ? (
            <ul className="divide-y divide-line">
              {view.changes.map((group) => (
                <Row key={group.planetIds.join('-')} group={group} nameOf={nameOf} pi={pi} />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-xs text-text-dim">
              {t(haul || buying ? 'piPlan.account.noChange' : 'piPlan.account.noChangeOptIn')}
            </p>
          )}
          {view.stays.length > 0 && view.changes.length > 0 && (
            <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
              {t('piPlan.account.stays', { count: view.stays.length })}
            </p>
          )}
          {pending && (
            <p
              role="status"
              className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim"
            >
              {t('piPlan.account.pending')}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
