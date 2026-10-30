/**
 * How Improve's rows are told apart and kept from colliding: a row's key, the
 * slots it changes, and what ticking one does to the ticks already made. Pure.
 */
import { conversionKey, type ImproveOption, type ImproveResult } from './improve';

type Candidate = ImproveOption['candidate'];

export const moveKey = (candidate: Candidate): string =>
  `${candidate.conversion ? `${conversionKey(candidate.conversion)}-` : ''}${candidate.fromTypeId ?? 'empty'}-${candidate.toTypeId}-${candidate.at[0].slot}${candidate.at[0].slotIndex}` +
  (candidate.pairedWith ? `+${moveKey(candidate.pairedWith)}` : '');

export const optionKey = (option: ImproveOption) => moveKey(option.candidate);

/** Every slot a suggestion changes, its paired downgrade's included: two ticked rows never share one. */
export function slotsOf(candidate: Candidate): string[] {
  const own = [...(candidate.conversion?.removes.flatMap((r) => r.at) ?? []), ...candidate.at].map(
    (at) => `${at.slot}${at.slotIndex}`
  );
  return candidate.pairedWith ? [...own, ...slotsOf(candidate.pairedWith)] : own;
}

/** One key for a whole set of options, however they are ordered. */
export const setKey = (options: readonly ImproveOption[]): string =>
  options.map(optionKey).sort().join('|');

/** The single best swap across both lists, or null when there is none. */
export function bestOption(result: ImproveResult): ImproveOption | null {
  return [...result.noDownside, ...result.tradeOffs].reduce<ImproveOption | null>(
    (top, option) => (top === null || option.score > top.score ? option : top),
    null
  );
}

/**
 * Ticks after toggling `option`: unticks it when ticked, otherwise ticks it and
 * unticks any pick sharing a slot, remembering the displaced picks' labels.
 */
export function toggleTick(
  ticked: ReadonlyMap<string, ImproveOption>,
  replaced: ReadonlyMap<string, string>,
  option: ImproveOption,
  labelOf: (option: ImproveOption) => string
): { byModule: Map<string, ImproveOption>; replaced: Map<string, string> } {
  const next = new Map(ticked);
  const nextReplaced = new Map(replaced);
  const key = optionKey(option);
  if (next.has(key)) {
    next.delete(key);
    nextReplaced.delete(key);
  } else {
    const taken = new Set(slotsOf(option.candidate));
    for (const [other, pick] of next)
      if (slotsOf(pick.candidate).some((slot) => taken.has(slot))) {
        next.delete(other);
        nextReplaced.delete(other);
        nextReplaced.set(key, [nextReplaced.get(key), labelOf(pick)].filter(Boolean).join(', '));
      }
    next.set(key, option);
  }
  return { byModule: next, replaced: nextReplaced };
}

/** The ticked set with `hovered` on top: it displaces a ticked row sharing a slot, as ticking it would. */
export function withHovered(
  chosen: readonly ImproveOption[],
  hovered: ImproveOption
): ImproveOption[] {
  const taken = new Set(slotsOf(hovered.candidate));
  return [
    ...chosen.filter((pick) => !slotsOf(pick.candidate).some((slot) => taken.has(slot))),
    hovered,
  ];
}
