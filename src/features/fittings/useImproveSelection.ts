/**
 * What the pilot has done to Improve's list: the rows ticked, the modules and
 * rows opened, and the row under the pointer or keyboard focus. Like the
 * result they were made in, each is dropped when a new search lands.
 */
import { useMemo, useState } from 'react';
import type { ImproveOption, ImproveResult } from '@/engine/fittings/improve';
import { toggleTick } from '@/engine/fittings/improveKeys';

const NO_TICKS: ReadonlyMap<string, ImproveOption> = new Map();
const NO_OPEN: ReadonlySet<string> = new Set();

export function useImproveSelection(
  result: ImproveResult | null,
  swapLabel: (option: ImproveOption) => string
) {
  // Modules whose other options, and rows whose other stats, are showing; like ticks, they belong to one result.
  const [open, setOpen] = useState<{ result: ImproveResult | null; keys: ReadonlySet<string> }>({
    result: null,
    keys: new Set(),
  });
  // Ticked rows, by key; at most one per fitted module (ticking another variation of it unticks the first).
  // Ticks belong to the result they were made in: a new search (a goal
  // change, an edit to the fit) starts with none.
  const [ticks, setTicks] = useState<{
    result: ImproveResult | null;
    byModule: ReadonlyMap<string, ImproveOption>;
    /** For a ticked row, the label of the pick it displaced. */
    replaced: ReadonlyMap<string, string>;
  }>({ result: null, byModule: new Map(), replaced: new Map() });
  // The row under the pointer or keyboard focus; like ticks, it belongs to the result it was made in.
  const [hovering, setHovering] = useState<{
    result: ImproveResult | null;
    option: ImproveOption | null;
  }>({ result: null, option: null });

  const expanded = open.result === result ? open.keys : NO_OPEN;
  const flip = (key: string) =>
    setOpen({
      result,
      keys: new Set(
        expanded.has(key) ? [...expanded].filter((k) => k !== key) : [...expanded, key]
      ),
    });
  const ticked = ticks.result === result ? ticks.byModule : NO_TICKS;
  const replaced = ticks.result === result ? ticks.replaced : new Map<string, string>();
  const hovered = hovering.result === result ? hovering.option : null;
  const setHover = (option: ImproveOption | null) => setHovering({ result, option });
  const setTicked = (
    byModule: ReadonlyMap<string, ImproveOption>,
    nextReplaced: ReadonlyMap<string, string> = new Map()
  ) => setTicks({ result, byModule, replaced: nextReplaced });
  const chosen = useMemo(() => [...ticked.values()], [ticked]);

  function toggle(option: ImproveOption) {
    const next = toggleTick(ticked, replaced, option, swapLabel);
    setTicked(next.byModule, next.replaced);
  }

  return { expanded, flip, ticked, replaced, hovered, setHover, setTicked, chosen, toggle };
}

/** The shape the row list reads: everything the pilot has ticked, opened or hovered. */
export type ImproveSelection = ReturnType<typeof useImproveSelection>;
