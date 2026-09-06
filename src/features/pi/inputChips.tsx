/**
 * An opportunity's inputs, as chips — the one place the `local`/`routed`/
 * `bought` distinction is turned into UI.
 *
 * The colony cards and the "Together" panel both render the same three-way
 * source of the same `NetworkOpportunity['inputs']`, and each had grown its
 * own copy of the cascade and its own set of `chip*` keys. Two copies of a
 * three-branch switch over one union is exactly how a fourth source, or a
 * changed sentence, ends up half-applied.
 *
 * The only thing that genuinely differs is how a *local* input reads. On a
 * planet's own card "made here" is unambiguous; in a panel listing several
 * planets it has to name which one, so the host is passed there and omitted
 * here.
 */
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { NetworkOpportunity } from '@/engine/pi/network';
import type { TradeHub } from '@/market/hubs';
import { InputChip } from './DirectiveRow';

const round = (value: number) => Math.round(value).toLocaleString();

export interface InputChipOptions {
  planetNames: ReadonlyMap<number, string>;
  /** Who owns a planet, when it is not the reader's own — by planetId. */
  owners: ReadonlyMap<number, string>;
  /** The hub a bought input would come from, and every price's basis. */
  hub: TradeHub;
  /**
   * The planet the factory sits on. Given, a local input reads "made on Efa V";
   * omitted, it reads "made here" — which is only true on that planet's own
   * card.
   */
  hostPlanetId?: number;
  t: TFunction;
}

/**
 * One input as a chip. The icon carries the source, so the text can be just
 * the material and where it comes from.
 *
 * Naming the owner matters once alts are in the plan: "route in from Ashab IV"
 * is not an instruction the reader can act on if Ashab IV belongs to a
 * character they would have to log in as first.
 */
export function inputChip(
  input: NetworkOpportunity['inputs'][number],
  options: InputChipOptions
): ReactNode {
  const { planetNames, owners, hub, hostPlanetId, t } = options;
  const units = round(input.unitsPerHour);
  const key = `${input.typeId}-${input.fromPlanetId ?? 'hub'}`;
  const nameOfPlanet = (planetId: number) =>
    planetNames.get(planetId) ?? t('piAdvisor.planetLabel', { id: planetId });

  if (input.source === 'local') {
    return (
      <InputChip key={key} source="local">
        {hostPlanetId === undefined
          ? t('piAdvisor.chipLocal', { name: input.name })
          : t('piAdvisor.chipLocalOn', { name: input.name, host: nameOfPlanet(hostPlanetId) })}
      </InputChip>
    );
  }

  if (input.source === 'bought') {
    return (
      <InputChip key={key} source="bought">
        {t('piAdvisor.chipBuy', { units, name: input.name, hub: hub.systemName })}
      </InputChip>
    );
  }

  const planetId = input.fromPlanetId ?? -1;
  const from = planetNames.get(planetId) ?? String(input.fromPlanetId ?? '');
  const owner = owners.get(planetId);
  return (
    <InputChip key={key} source="routed">
      {owner
        ? t('piAdvisor.chipRouteAlt', { units, name: input.name, from, owner })
        : t('piAdvisor.chipRoute', { units, name: input.name, from })}
    </InputChip>
  );
}

/** Every input of one opportunity, in the order the plan lists them. */
export function inputChips(line: NetworkOpportunity, options: InputChipOptions): ReactNode {
  return line.inputs.map((input) => inputChip(input, options));
}
