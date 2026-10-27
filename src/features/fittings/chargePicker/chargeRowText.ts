import type { TFunction } from 'i18next';
import { formatCompactNumber } from '@/lib/compactNumber';
import { chargeScore, iskPerMinute, type ChargeChoice } from '@/engine/fittings/chargeChoice';
import { formatIskExact } from '../chargeFormat';

export const km = (metres: number) => Math.round(metres / 1000);

export function rangeText(t: TFunction, choice: ChargeChoice) {
  return choice.falloff > 0
    ? t('fittings.chargePicker.range', { optimal: km(choice.optimal), falloff: km(choice.falloff) })
    : t('fittings.chargePicker.rangeMissile', { optimal: km(choice.optimal) });
}

export function tierLabel(t: TFunction, choice: ChargeChoice): string {
  if (choice.tier === 'faction') return choice.faction ?? choice.name;
  return t(choice.tier === 'tech2' ? 'fittings.chargePicker.tech2' : 'fittings.chargePicker.tech1');
}

/** A loadable row's accessible name: its cells run together otherwise. */
export function rowLabel(
  t: TFunction,
  c: ChargeChoice,
  distance: number | null,
  extra: { pricey: boolean; worse: ChargeChoice | null }
): string {
  const label = t('fittings.chargePicker.rowLabel', {
    name: c.name,
    dps: Math.round(chargeScore(c, distance)),
    price:
      c.price === null
        ? t('fittings.chargePicker.noPrice')
        : t('fittings.chargePicker.isk', { isk: formatIskExact(c.price) }),
  });
  const perMin = iskPerMinute(c);
  const parts = [
    label,
    c.cargo > 0
      ? t('fittings.chargePicker.inCargo', { count: formatCompactNumber(c.cargo) })
      : null,
    perMin === null ? null : t('fittings.chargePicker.perMinute', { isk: formatIskExact(perMin) }),
    extra.pricey ? t('fittings.chargePicker.priceyLabel') : null,
    extra.worse ? t('fittings.chargePicker.worseThan', { name: tierLabel(t, extra.worse) }) : null,
  ].filter(Boolean);
  const lasts =
    c.price !== null && perMin === null ? `. ${t('fittings.chargePicker.lastsTitle')}` : '';
  const joined = `${parts.join(', ')}${lasts}`;
  return c.skillMissing ? `${joined}. ${t('fittings.chargePicker.needsSkill')}` : joined;
}

export function signedPct(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)}%`;
}
