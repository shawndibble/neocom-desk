/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub (#3878); the slice that implements this file removes it */
/**
 * The trip rail and its parts (issue #3878): a sticky column beside the
 * Hauling table that holds the Trip Plan's totals, the fill offer and Copy
 * multibuy, and swaps to a selected row's detail with a "‹ Trip" crumb. On a
 * panel too narrow for it, `HaulingTripBar` is the sticky bottom bar instead.
 * Presentational: the panel owns every value and handler.
 *
 * CONTRACT STUB — implemented in slice S3.
 */
import type { ReactNode } from 'react';
import type { TripPlan } from '@/engine/market/haulingPlan';
import type { HubJumps } from './useHubJumps';

export interface HaulingTripRailProps {
  /** The selected row's detail; null shows the trip. */
  detail: ReactNode | null;
  /** Leaves the detail for the trip (the "‹ Trip" crumb); does not clear the table's selection. */
  onBack: () => void;
  /** The trip view: `HaulingTripSummary` and `HaulingFillList`. */
  trip: ReactNode;
  /** Always shown under both views: free m³, profit, Copy multibuy and the table menu. */
  footer: ReactNode;
}

export function HaulingTripRail(_props: HaulingTripRailProps) {
  return null;
}

export interface HaulingTripSummaryProps {
  plan: TripPlan;
  /** False until the user has chosen a Cargo Space: no meter, no free m³, the cargo prompt instead. */
  cargoSet: boolean;
  /** "Amarr to Jita"; null with Any hub at an end. */
  laneLabel: string | null;
  jumps: HubJumps;
  /** The panel's `HaulingCargoControl`. */
  cargoControl: ReactNode;
  /** Cargo value (plan spend) once the ticked fill items are added; null with nothing ticked. */
  cargoValueAfterFill: number | null;
}

export function HaulingTripSummary(_props: HaulingTripSummaryProps) {
  return null;
}

export interface HaulingFillItem {
  typeId: number;
  name: string;
  /** The Hauling category it comes from ("Fuel Blocks"). */
  categoryName: string;
  quantity: number;
  volumeM3: number;
  cost: number;
  profit: number;
}

export type HaulingFillStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface HaulingFillListProps {
  /** Free m³ the fill is sized against. */
  freeM3: number;
  status: HaulingFillStatus;
  /** The scan's progress line while `loading`. */
  progressText?: string;
  /** Best profit per m³ first. Empty when ready means nothing else fits. */
  items: readonly HaulingFillItem[];
  ticked: ReadonlySet<number>;
  onToggle: (typeId: number, ticked: boolean) => void;
  /** Starts the on-demand scan (idle) or retries it (error). */
  onFind: () => void;
  /** Adds the ticked items to the Trip Plan. */
  onAdd: () => void;
  /** Totals of the ticked items. */
  tickedTotals: { count: number; volumeM3: number; cost: number; profit: number };
  /** The hold once the ticked items are added; null without a Cargo Space. */
  holdAfter: { usedM3: number; capacityM3: number } | null;
}

export function HaulingFillList(_props: HaulingFillListProps) {
  return null;
}

export interface HaulingTripBarProps {
  /** Null without a Cargo Space. */
  freeM3: number | null;
  profit: number;
  /** Opens the trip (summary + fill) as a sheet. */
  onOpenTrip: () => void;
  /** The panel's Copy multibuy button. */
  copyButton: ReactNode;
}

export function HaulingTripBar(_props: HaulingTripBarProps) {
  return null;
}
