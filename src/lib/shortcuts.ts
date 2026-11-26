import type { NavigateFunction } from 'react-router-dom';
import { focusPageSearch } from './pageSearch';

export interface MarketAppraiseState {
  readonly appraiseText: string;
}

export interface FittingLoadState {
  readonly fittingLoadText: string;
}

export interface SkillPlanImportState {
  readonly skillPlanImportText: string;
}

export interface OptimizeQueueToastState {
  readonly optimizeQueueMessage: string;
}

export interface SurveyScanState {
  readonly surveyScanText: string;
}

export interface PilotListState {
  readonly pilotListText: string;
}

export interface IndustryFitImportState {
  readonly fitImportText: string;
}

export interface IndustryBlueprintListState {
  readonly blueprintListText: string;
}

export interface BlueprintPasteNoticeState {
  readonly blueprintPasteNotice: { readonly skipped: number; readonly reused: boolean };
}

export const KEYBOARD_OVERLAY_ATTRIBUTE = 'data-keyboard-overlay';

export const OVERLAY_SELECTOR = `dialog[open], [role="menu"], [role="listbox"], [role="dialog"], [${KEYBOARD_OVERLAY_ATTRIBUTE}]`;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true;
  }
  return (
    target.closest('[role="combobox"], [role="listbox"], [role="spinbutton"], [role="slider"]') !==
    null
  );
}

export type ChordEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export function isCommandPaletteShortcut(event: ChordEvent, apple: boolean): boolean {
  return isModChord(event, apple, 'k');
}

export function isModChord(
  event: ChordEvent,
  apple: boolean,
  key: string,
  options: { shift?: boolean } = {}
): boolean {
  const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey !== (options.shift ?? false)) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

export function modChordDisplayKey(
  apple: boolean,
  key: string,
  options: { shift?: boolean } = {}
): string {
  if (apple) return `${options.shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl ${options.shift ? 'Shift ' : ''}${key}`;
}

export function isAltChord(
  event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  code: string
): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === code;
}

export function altChordDisplayKey(apple: boolean, key: string): string {
  return apple ? `⌥${key}` : `Alt ${key}`;
}

export function commandPaletteDisplayKey(apple: boolean): string {
  return modChordDisplayKey(apple, 'K');
}

export function pasteDisplayKey(apple: boolean): string {
  return apple ? '⌘V' : 'Ctrl V';
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export interface ShortcutDef {
  readonly id: string;
  readonly key: string;
  readonly sequence?: true;
  readonly displayKey: string;
  readonly allowsShift?: true;
  readonly descriptionKey: string;
  readonly run?: (navigate: NavigateFunction) => void | boolean | Promise<void>;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'switch-character',
    key: 'c',
    displayKey: 'C',
    sequence: true,
    descriptionKey: 'shortcuts.switchCharacter',
    run: (navigate) => navigate('/characters'),
  },
  {
    id: 'go-to-overview',
    key: 'o',
    displayKey: 'O',
    sequence: true,
    descriptionKey: 'shortcuts.goToOverview',
    run: (navigate) => navigate('/overview'),
  },
  {
    id: 'go-to-market',
    key: 'm',
    displayKey: 'M',
    sequence: true,
    descriptionKey: 'shortcuts.goToMarket',
    run: (navigate) => navigate('/market'),
  },
  {
    id: 'go-to-industry',
    key: 'i',
    displayKey: 'I',
    sequence: true,
    descriptionKey: 'shortcuts.goToIndustry',
    run: (navigate) => navigate('/industry'),
  },
  {
    id: 'go-to-wallet',
    key: 'w',
    displayKey: 'W',
    sequence: true,
    descriptionKey: 'shortcuts.goToWallet',
    run: (navigate) => navigate('/wallet'),
  },
  {
    id: 'go-to-planetary-industry',
    key: 'p',
    displayKey: 'P',
    sequence: true,
    descriptionKey: 'shortcuts.goToPlanetaryIndustry',
    run: (navigate) => navigate('/planetary-industry'),
  },
  {
    id: 'go-to-alerts',
    key: 'a',
    displayKey: 'A',
    sequence: true,
    descriptionKey: 'shortcuts.goToAlerts',
    run: (navigate) => navigate('/alerts'),
  },
  {
    id: 'go-to-mining-tax',
    key: 't',
    displayKey: 'T',
    sequence: true,
    descriptionKey: 'shortcuts.goToMiningTax',
    run: (navigate) => navigate('/mining/tax'),
  },
  {
    id: 'open-settings',
    key: 's',
    displayKey: 'S',
    sequence: true,
    descriptionKey: 'shortcuts.openSettings',
    run: (navigate) => navigate('/settings'),
  },
  {
    id: 'focus-search',
    key: '/',
    displayKey: '/',
    allowsShift: true,
    descriptionKey: 'shortcuts.focusSearch',
    run: () => focusPageSearch(),
  },
  {
    id: 'show-shortcuts',
    key: '?',
    displayKey: '?',
    allowsShift: true,
    descriptionKey: 'shortcuts.showShortcuts',
    run: (navigate) => navigate('/help/shortcuts'),
  },
  {
    id: 'close',
    key: 'Escape',
    displayKey: 'Esc',
    descriptionKey: 'shortcuts.close',
  },
];
