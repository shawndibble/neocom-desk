/**
 * What the detail panel says: a product (how it is made, chain written out in
 * words, what to find) or an "add a planet" (what it unlocks, the best
 * one-planet recipe, free slots, nearby planets). The same content fills the
 * docked panel, the right-hand drawer and the phone's bottom sheet.
 *
 * The product panel is the PI product detail every product name on the PI tabs
 * opens (DESIGN.md §6c "Entities", Overrides), so its own name is plain text
 * and it carries the two destinations that link displaced: View in Market and
 * Show info.
 */
import { interactiveClassName, focusRingClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { Link } from 'react-router-dom';
import { onPlanLinkClick } from '@/features/industry/planLinkClick';
import { useTranslation } from 'react-i18next';
import { Button, IskAmount, TypeIcon } from '@/components/ui';
import { buttonClassName } from '@/components/ui/buttonClassName';
import * as Icon from '@/components/ui/icons';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeRank } from '@/engine/pi/planRecipes';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useOptionalItemActions } from '@/features/market/itemActions';
import { CcLevelTag } from '../CcLevelTag';
import { chainAssumptions } from '../chainEstimateText';
import { EstimateBadge } from '../DirectiveRow';
import { PiProductLink } from '../PiProductLink';
import { Sentence } from '../sentence';
import type { SlotNudge } from '@/engine/pi/planAdvice';
import { withArticle } from '../article';
import { PlanetFinder } from './PlanetFinder';
import { PlanetImage } from '../PlanetImage';
import { comparisonSentence, planetName, tierWithCode } from './mapText';
import { groupByTier, type MapGraph, type ProductFigure, type Trace } from './mapModel';
import type { ProductDetailView } from './productDetailModel';

export interface FinderOrigin {
  systemId: number | null;
  name: string | null;
  /** Home system security, to seed the finder's "Highsec only"; null when unknown. */
  security: number | null;
}

export interface ProductDetailProps {
  graph: MapGraph;
  typeId: number;
  figure: ProductFigure;
  trace: Trace;
  rank: number | null;
  /** Gain against today for a rebuild pick, or the per-planet figure for a recipe pick. */
  pickPerDay: number | null;
  pickKind: 'rebuild' | 'recipes' | 'none';
  owned: ReadonlySet<PlanetType>;
  colonyNames: ReadonlyMap<PlanetType, string[]>;
  finder: FinderOrigin;
  view: ProductDetailView;
  onClearTrace: () => void;
}

const names = (graph: MapGraph, ids: readonly number[]) =>
  ids.map((id) => graph.byId.get(id)!.name);

/**
 * A chain of product names, each a link to its own PI detail but the one
 * already open. Names in a group are parallel, joined with commas; an arrow
 * marks the step to the next group.
 */
function NameChain({
  graph,
  groups,
  open,
}: {
  graph: MapGraph;
  groups: readonly (readonly number[])[];
  open: number;
}) {
  return (
    <>
      {groups.map((group, g) => (
        <span key={group[0]}>
          {g > 0 && ' → '}
          {group.map((id, i) => {
            const name = graph.byId.get(id)!.name;
            return (
              <span key={id}>
                {i > 0 && ', '}
                {id === open ? name : <PiProductLink typeId={id}>{name}</PiProductLink>}
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-1.5 text-[11px] font-semibold tracking-widest text-text-dim uppercase">
      {children}
    </h3>
  );
}

export function ProductDetail(props: ProductDetailProps) {
  const { graph, typeId, figure, trace, owned, view } = props;
  const { t } = useTranslation();
  const itemActions = useOptionalItemActions();
  const product = graph.byId.get(typeId)!;
  // Every type can host it: say only the facility, and leave the planets to "You need".
  const anyHost = view.hosts.length === graph.planetTypes.length;
  const hostTypes = anyHost
    ? t('piMap.detail.anyPlanet')
    : view.hosts.map((type) => planetName(t, type)).join(', ');
  const colonyItems = (items: ProductDetailView['ownInputs']) =>
    items.map((item, i) => (
      <span key={item.typeId}>
        {i > 0 && '; '}
        <PiProductLink typeId={item.typeId}>{item.name}</PiProductLink> ({item.colonies.join(', ')})
      </span>
    ));

  const oneHost = trace.alternatives.length > 0;
  const haveHere = oneHost
    ? trace.alternatives.filter((type) => owned.has(type))
    : trace.planets.filter((p) => p.have).map((p) => p.type);
  const missing: PlanetType[] = oneHost
    ? haveHere.length === 0
      ? trace.alternatives
      : []
    : trace.planets.filter((p) => !p.have).map((p) => p.type);

  return (
    <div>
      <div className="flex items-center gap-3">
        <TypeIcon typeId={typeId} size={64} width={48} height={48} />
        <div className="min-w-0">
          <div className="text-base leading-tight font-semibold">{product.name}</div>
          <div className="text-xs text-text-dim">{tierWithCode(t, product.tier)}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <MarketItemLink typeId={typeId} className={buttonClassName({ size: 'sm' })}>
          {t('market.contextMenu.viewInMarket')}
        </MarketItemLink>
        {itemActions && (
          <Button size="sm" onClick={() => itemActions.showInfo(typeId, product.name)}>
            {t('market.contextMenu.showInfo')}
          </Button>
        )}
      </div>

      <p className="mt-3 text-xs text-text">
        {t(`piMap.detail.facility.${view.facility}`, {
          types: hostTypes,
          context: anyHost ? 'any' : undefined,
        })}
      </p>
      {view.inputs.length > 0 && (
        <p className="mt-1 text-xs text-text-dim">
          {t('piMap.detail.madeFrom')}{' '}
          {view.inputs.map((input, i) => (
            <span key={input.typeId}>
              {i > 0 && ', '}
              <PiProductLink typeId={input.typeId}>{input.name}</PiProductLink>
            </span>
          ))}
        </p>
      )}

      {figure.kind === 'ranked' ? (
        <div className="mt-3">
          <div className="text-[1.875rem] leading-[1.1] font-semibold text-isk-pos tabular-nums">
            ≈ <IskAmount value={figure.iskPerDay} decimals={0} />
          </div>
          <div className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
            {t('piMap.detail.perPlanet', { type: planetName(t, figure.useType) })}
          </div>
          {figure.needsCcLevel && (
            <div className="mt-1.5">
              <CcLevelTag level={figure.needsCcLevel} />
            </div>
          )}
        </div>
      ) : null}
      {view.money.kind !== 'multi-planet' && (
        <p className="mt-2 text-xs text-text">
          {/* The compared product links to its own detail, as the chain's names do. */}
          <Sentence
            text={comparisonSentence(t, figure, '{name}')}
            slots={{
              name: figure.kind === 'ranked' && figure.versus !== null && (
                <PiProductLink typeId={figure.versus.typeId}>{figure.versus.name}</PiProductLink>
              ),
            }}
          />
        </p>
      )}
      {view.money.kind === 'one-planet' && (
        <p className="mt-1 text-xs text-text-dim">
          {t('piMap.detail.haul', {
            m3: Math.round(view.money.m3PerWeek).toLocaleString('en'),
          })}
          {view.money.ccLevel !== null &&
            ` ${t('piMap.detail.ccAssumed', { level: view.money.ccLevel })}`}
        </p>
      )}
      {view.money.kind === 'multi-planet' && view.money.estimate ? (
        <div className="mt-3">
          <div
            className={cx(
              'text-[1.875rem] leading-[1.1] font-semibold tabular-nums',
              view.money.estimate.iskPerDay < 0 ? 'text-isk-neg' : 'text-isk-pos'
            )}
          >
            ≈ <IskAmount value={view.money.estimate.iskPerDay} decimals={0} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('piShared.chain.perDayAcross', { count: view.money.estimate.planets.length })}
            <EstimateBadge />
          </div>
          <p className="mt-2 text-xs font-semibold text-warning">{t('piShared.chain.label')}</p>
          <p className="mt-1 text-xs text-text-dim">{chainAssumptions(t, view.money.estimate)}</p>
        </div>
      ) : view.money.kind === 'multi-planet' ? (
        <p className="mt-2 text-xs font-semibold text-warning">
          {view.money.planets > 1
            ? t('piMap.detail.multiPlanet', { count: view.money.planets })
            : t('piMap.detail.notRanked')}
        </p>
      ) : null}

      <Heading>{t('piMap.detail.needHeading')}</Heading>
      <p className="text-xs text-text-dim">
        {oneHost
          ? t('piMap.detail.needOne', {
              types: trace.alternatives.map((type) => planetName(t, type)).join(', '),
              count: trace.alternatives.length,
            })
          : t('piMap.detail.needMany', {
              count: trace.planets.length,
              types: trace.planets.map((p) => planetName(t, p.type)).join(', '),
            })}{' '}
        {haveHere.length > 0
          ? t('piMap.detail.youHave', {
              types: haveHere.map((type) => planetName(t, type)).join(', '),
            })
          : t('piMap.detail.youHaveNone')}
      </p>

      <Heading>{t('piMap.detail.chainHeading')}</Heading>
      <ol
        className="space-y-2 text-xs"
        aria-label={t('piMap.detail.chainLabel', { name: product.name })}
      >
        {trace.planets.map((planet) => {
          const colonyList = props.colonyNames.get(planet.type) ?? [];
          return (
            <li key={planet.type} className="flex gap-2">
              <PlanetImage type={planet.type} size={28} />
              <div className="min-w-0">
                <div>
                  <span className="font-semibold">{planetName(t, planet.type)}</span>{' '}
                  {planet.have && (
                    <span className="text-success">
                      <Icon.Done
                        size={Icon.ICON_SIZE.sm}
                        aria-hidden="true"
                        className="mr-0.5 inline align-text-bottom"
                      />
                      {t('piMap.detail.have', {
                        colonies: colonyList.length > 0 ? ` (${colonyList.join(', ')})` : '',
                      })}
                    </span>
                  )}
                </div>
                <div className="text-text-dim">
                  <NameChain graph={graph} groups={groupByTier(graph, planet.made)} open={typeId} />
                </div>
              </div>
            </li>
          );
        })}
        {trace.rest.length > 0 && (
          <li className="flex gap-2 border-t border-line pt-2">
            <span
              className="grid size-7 shrink-0 place-items-center text-text-dim"
              aria-hidden="true"
            >
              →
            </span>
            <div className="min-w-0">
              <div className="text-text-dim">
                {trace.planets.length > 1 ? t('piMap.detail.shipTo') : t('piMap.detail.samePlanet')}
              </div>
              <div>
                <NameChain graph={graph} groups={groupByTier(graph, trace.rest)} open={typeId} />
              </div>
            </div>
          </li>
        )}
      </ol>
      <p className="mt-2 text-xs text-text-dim">
        <Sentence
          text={t('piMap.detail.chainText', {
            planets: trace.planets.map((p) => planetName(t, p.type)).join(' + '),
            steps: '{steps}',
          })}
          slots={{
            steps: (
              <NameChain
                graph={graph}
                // Direct inputs as one group: a P4 can take a P1 beside its P3s.
                groups={[view.inputs.map((input) => input.typeId), [typeId]].filter(
                  (group) => group.length > 0
                )}
                open={typeId}
              />
            ),
          }}
        />
      </p>

      {props.colonyNames.size > 0 && (
        <>
          <Heading>{t('piMap.detail.coloniesHeading')}</Heading>
          {view.makingIt.length > 0 && (
            <p className="text-xs text-success">
              {t('piMap.detail.makingIt', { colonies: view.makingIt.join(', ') })}
            </p>
          )}
          {view.ownInputs.length > 0 ? (
            <p className="text-xs text-text-dim">
              {t('piMap.detail.ownInputs')} {colonyItems(view.ownInputs)}
            </p>
          ) : (
            view.makingIt.length === 0 && (
              <p className="text-xs text-text-dim">{t('piMap.detail.ownNone')}</p>
            )
          )}
        </>
      )}

      {props.rank !== null && props.pickPerDay !== null && (
        <p className="mt-3 text-xs text-warning">
          {props.pickKind === 'rebuild'
            ? t('piMap.detail.pickRebuild', { rank: props.rank })
            : t('piMap.detail.pickRecipe', { rank: props.rank })}
        </p>
      )}

      {missing.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <PlanetFinder
            types={missing}
            homeSystemId={props.finder.systemId}
            homeName={props.finder.name}
            homeSecurity={props.finder.security}
          />
        </div>
      )}

      {/* A chain estimate states its own basis above; this note is about one-planet figures. */}
      {!(view.money.kind === 'multi-planet' && view.money.estimate) && (
        <p className="mt-4 text-[11px] leading-snug text-text-dim">{t('piMap.estimateNote')}</p>
      )}
      <Button size="sm" className="mt-3" onClick={props.onClearTrace}>
        {t('piMap.clearTrace')}
      </Button>
    </div>
  );
}

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

export interface AddPlanetDetailProps {
  graph: MapGraph;
  /** The planet types being tried, together, sorted. */
  types: readonly PlanetType[];
  /** Products these planet types unlock together (P1 up). */
  unlockedIds: readonly number[];
  /** The best one-planet recipe only these types add, priced for them. */
  recipe: RecipeRank | null;
  /** Recipes that only these types host. */
  oneHostCount: number;
  slots: SlotNudge;
  /** The pilot's weakest colony today, for "replace one". */
  weakest: { name: string; perDay: number } | null;
  finder: FinderOrigin;
  onTraceRecipe: (typeId: number) => void;
  /** The recipe's PI detail URL. */
  productHref: (typeId: number) => string;
  onClose: () => void;
  /** The Bigger chains this type makes possible, when the pilot hauls between planets; left out otherwise. */
  chains?: React.ReactNode;
}

export function AddPlanetDetail(props: AddPlanetDetailProps) {
  const { t } = useTranslation();
  const { slots, recipe } = props;
  const { types } = props;
  const typeNames = types.map((type) => planetName(t, type));
  const full = slots.free === 0 && !slots.assumed;
  const short = !slots.assumed && slots.free < types.length;
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 gap-1">
          {types.map((type) => (
            <PlanetImage
              key={type}
              type={type}
              size={types.length > 1 ? 36 : 44}
              className="outline-2 outline-offset-1 outline-map-whatif"
            />
          ))}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {types.length === 1
              ? t('piMap.add.title', { aType: withArticle(typeNames[0]) })
              : t('piMap.add.titleMany', { types: listFormat.format(typeNames) })}
          </div>
          {props.unlockedIds.length > 0 && (
            <p className="text-xs text-text-dim">
              <span className="font-semibold text-map-whatif">
                {t('piMap.add.unlocks', { count: props.unlockedIds.length })}
              </span>
              {props.oneHostCount > 0 &&
                `, ${t('piMap.add.asOnePlanet', { count: props.oneHostCount })}`}
            </p>
          )}
          {props.unlockedIds.length > 0 && (
            <p className="sr-only">
              {t('piMap.add.unlockList', {
                names: names(props.graph, props.unlockedIds).join(', '),
              })}
            </p>
          )}
        </div>
      </div>

      {recipe ? (
        <div className="mt-3">
          <Link
            to={props.productHref(recipe.typeId)}
            onClick={onPlanLinkClick(() => props.onTraceRecipe(recipe.typeId))}
            className={cx(
              'flex min-h-11 w-full items-center gap-2 rounded-xs border border-line px-2 py-1.5 text-left [@media(hover:hover)]:hover:bg-panel-2',
              interactiveClassName,
              focusRingClassName
            )}
          >
            <TypeIcon typeId={recipe.typeId} size={64} width={28} height={28} />
            <span className="min-w-0 text-left text-xs">
              {t('piMap.add.bestRecipe')} <b>{recipe.name}</b>
            </span>
            <Icon.Descend aria-hidden="true" className="ml-auto shrink-0 text-text-dim" />
          </Link>
          <p className="mt-1 text-xs text-isk-pos">
            +<IskAmount value={recipe.iskPerDay} decimals={0} />
            {t('piMap.add.perDaySuffix')}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-text-dim">{t('piMap.add.nothingAlone')}</p>
      )}

      {props.chains && (
        <>
          <Heading>{t('piMap.add.chainsHeading')}</Heading>
          {props.chains}
        </>
      )}

      <Heading>{t('piMap.add.slotsHeading')}</Heading>
      <p className="text-xs text-text-dim">
        {slots.assumed
          ? t('piMap.slots.unknown')
          : slots.free > 0
            ? t('piMap.slots.room', { used: slots.used, allowed: slots.allowed, count: slots.free })
            : slots.canTrainMore
              ? t('piMap.slots.trainOrReplace', { used: slots.used, allowed: slots.allowed })
              : t('piMap.slots.replace', { used: slots.used, allowed: slots.allowed })}
      </p>
      {short && types.length > 1 && (
        <p className="mt-1 text-xs text-text-dim">
          {t('piMap.add.slotsShort', { count: types.length, free: slots.free })}
        </p>
      )}
      {full && props.weakest && recipe && (
        <p className="mt-1 text-xs text-text-dim">
          {t('piMap.slots.weakest', { name: props.weakest.name })}{' '}
          <IskAmount value={props.weakest.perDay} decimals={0} />
          {t('piMap.add.perDaySuffix')}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <PlanetFinder
          types={types}
          homeSystemId={props.finder.systemId}
          homeName={props.finder.name}
          homeSecurity={props.finder.security}
        />
      </div>
      <p className="mt-4 text-[11px] leading-snug text-text-dim">{t('piMap.estimateNote')}</p>
      <Button size="sm" className="mt-3" onClick={props.onClose}>
        {t('piMap.add.close')}
      </Button>
    </div>
  );
}
