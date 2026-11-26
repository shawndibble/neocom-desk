import { useMemo, useState } from 'react';
import type { ImproveOption, ImproveResult } from '@/engine/fittings/improve';
import { optionKey, toggleTick } from '@/engine/fittings/improve';
import { tickMakeoverRows } from './improveMakeoverTicks';

const NO_TICKS: ReadonlyMap<string, ImproveOption> = new Map();
const NO_OPEN: ReadonlySet<string> = new Set();
const NO_ROWS: readonly ImproveOption[] = [];

export function useImproveSelection(
  result: ImproveResult | null,
  swapLabel: (option: ImproveOption) => string,
  makeoverRows: readonly ImproveOption[] = NO_ROWS
) {
  const [open, setOpen] = useState<{ result: ImproveResult | null; keys: ReadonlySet<string> }>({
    result: null,
    keys: new Set(),
  });
  const [ticks, setTicks] = useState<{
    result: ImproveResult | null;
    byModule: ReadonlyMap<string, ImproveOption>;
    replaced: ReadonlyMap<string, string>;
  }>({ result: null, byModule: new Map(), replaced: new Map() });
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
  const startTicks = useMemo<ReadonlyMap<string, ImproveOption>>(
    () =>
      makeoverRows.length === 0
        ? NO_TICKS
        : new Map(makeoverRows.map((row) => [optionKey(row), row] as const)),
    [makeoverRows]
  );
  const ticked = ticks.result === result ? ticks.byModule : startTicks;
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

  function toggleMakeover(rows: readonly ImproveOption[], checked: boolean) {
    const next = tickMakeoverRows(ticked, replaced, rows, checked, swapLabel);
    setTicked(next.byModule, next.replaced);
  }

  return {
    expanded,
    flip,
    ticked,
    replaced,
    hovered,
    setHover,
    setTicked,
    chosen,
    toggle,
    toggleMakeover,
  };
}

export type ImproveSelection = ReturnType<typeof useImproveSelection>;
