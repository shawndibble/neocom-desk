/**
 * The app's icon vocabulary.
 *
 * One pack, one weight, imported per icon. Phosphor's `light` weight is the
 * only shortlisted set with a genuinely 1px-native face rather than a thinned
 * 2px one, which is what DESIGN.md §3's hairline rule needs — a 2px default
 * reads as a heavier line than every border on the page. Sizes follow the type
 * scale in `rem`, not `px`, so they grow with Settings' text-size control
 * alongside the text they label.
 *
 * Import icons FROM HERE, never from `@phosphor-icons/react` directly: this
 * module is what keeps the weight and the sizing consistent, and what makes
 * swapping the pack a single-file change. Add a re-export here when you need a
 * glyph the app doesn't have yet.
 */

import {
  Broadcast,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  ArrowsLeftRight,
  Bell,
  BellSlash,
  Buildings,
  CaretDoubleDown,
  CaretDoubleUp,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  CloudSlash,
  ChartLineUp,
  Check,
  CheckCircle,
  Clipboard,
  Copy,
  DotsThreeVertical,
  DownloadSimple,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Export as ExportIcon,
  Factory,
  FileText,
  Flag,
  Flask,
  Funnel,
  Gauge,
  GraduationCap,
  Hammer,
  Code,
  Info as InfoGlyph,
  LockKey,
  MagnifyingGlass,
  Moon,
  Package,
  PencilSimple,
  Planet,
  Plus,
  Prohibit,
  Queue,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  SignIn as SignInGlyph,
  Sliders,
  Stack,
  Star,
  Target,
  UsersThree,
  Wallet as WalletGlyph,
  Warning,
  WarningOctagon,
  X,
  type Icon as PhosphorIcon,
  type IconProps,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';

export type { IconProps };

/**
 * Every icon in the app renders at this weight. Exported so a one-off that
 * needs a Phosphor glyph not yet re-exported below can still match.
 */
export const ICON_WEIGHT = 'light' as const;

/** Sized in `rem` so icons scale with the root font-size like their labels do (DESIGN.md §2). */
export const ICON_SIZE = {
  /** 1rem — inline with `text-sm` body copy and inside dense rows. */
  sm: '1rem',
  /** 1.25rem — the default for toolbar and row controls. */
  md: '1.25rem',
  /** 1.5rem — navigation affordances that carry a whole row, e.g. breadcrumb back. */
  lg: '1.5rem',
} as const;

function withWeight(Glyph: PhosphorIcon): ComponentType<IconProps> {
  function Wrapped({ size = ICON_SIZE.md, weight = ICON_WEIGHT, ...rest }: IconProps) {
    return <Glyph size={size} weight={weight} {...rest} />;
  }
  Wrapped.displayName = `Icon(${Glyph.displayName ?? 'Glyph'})`;
  return Wrapped;
}

/** Steps back up one level in the Assets drill-down; also the generic "go back". */
export const Back = withWeight(CaretLeft);
/** A row you can descend into. */
export const Descend = withWeight(CaretRight);
/** A disclosure that is currently open. */
export const Expanded = withWeight(CaretDown);
/** A column that can be sorted but currently isn't. */
export const Sort = withWeight(CaretUpDown);
/** Ascending: a sorted-ascending column, or "move this row up". */
export const Ascending = withWeight(ArrowUp);
/** Descending: a sorted-descending column, or "move this row down". */
export const Descending = withWeight(ArrowDown);
/** Re-fetch from ESI. */
export const Refresh = withWeight(ArrowClockwise);
/** Puts a field back to the value it would have had if nobody had touched it. Deliberately not `Refresh`, which fetches new data — these sit two controls apart on the Industry panel. */
export const Revert = withWeight(ArrowCounterClockwise);
/** Download the current view as CSV. */
export const Download = withWeight(DownloadSimple);
/** Search / filter. */
export const Search = withWeight(MagnifyingGlass);
/** Multi-select mode. */
export const Select = withWeight(Check);
/** Pin — filled when pinned, outline when not (pass `weight="fill"`). */
export const Pin = withWeight(Star);
/** Search across every character on the account. */
export const AllCharacters = withWeight(UsersThree);
/** A container or a ship's bay — anything holding other assets. */
export const Container = withWeight(Package);
/** Route preference (shortest vs safest). */
export const Route = withWeight(ArrowsLeftRight);
/** Something is incomplete or unresolved — pairs with `warning` text, never used alone. */
export const Warn = withWeight(Warning);
/** Opens a longer explanation of the numbers on screen, e.g. a Build Plan's calculation breakdown. */
export const Info = withWeight(InfoGlyph);
/**
 * The Corp ops board's severity ladder, shaped as well as coloured (issue
 * #419) — `SEVERITY_TONE`'s four colours alone are not a signal for a
 * colorblind reader. `warning` reuses `Warn` rather than a fifth glyph; the
 * other three are their own icons so all four differ in outline, not only hue.
 */
export const SeverityCritical = withWeight(WarningOctagon);
/** Worth watching, not yet due. */
export const SeverityWatch = withWeight(Eye);
/** Nothing pending. */
export const SeverityClear = withWeight(CheckCircle);
/** Clear a field, dismiss a panel. */
export const Close = withWeight(X);
/** Edit a name in place — the rename affordance on a saved-plan row. */
export const Rename = withWeight(PencilSimple);
/** Copy a saved plan to a new one. */
export const Duplicate = withWeight(Copy);
/** Put text on the clipboard — the same glyph as `Duplicate`, named for the other sense of "copy". */
export const CopyToClipboard = withWeight(Copy);
/** Confirms an action that leaves nothing on screen to look at, e.g. a copy that went to the clipboard. */
export const Done = withWeight(Check);
/** Overflow menu. */
export const More = withWeight(DotsThreeVertical);
/** Send the plan queue to the clipboard or a CSV download (#224 icon-only toolbar). */
export const Export = withWeight(ExportIcon);
/** Pull the character's live skill queue into the plan (#224 icon-only toolbar). */
export const ImportQueue = withWeight(Queue);
/** Parse a pasted skill queue into the plan (#224 icon-only toolbar) — a plain clipboard, for "paste in". */
export const ImportClipboard = withWeight(Clipboard);
/** Tune remaps for the lowest total training time (#224 icon-only toolbar). */
export const OptimizeRemaps = withWeight(Sliders);
/** Drop a remap marker at the current end of the queue (#224 icon-only toolbar). */
export const AddMarker = withWeight(Flag);
/** Tune remaps against the plan's existing markers (#224 icon-only toolbar). */
export const OptimizeAtMarkers = withWeight(Target);
/** Open the mobile filter sheet — the one control a narrow filter row collapses to (`FilterBar`). */
export const Filter = withWeight(Funnel);
/** Reorder the queue by priority/attribute pair (#224 icon-only toolbar). */
export const SuggestReorder = withWeight(ArrowsDownUp);
/** A build plan material this character is better off manufacturing or growing than buying. */
export const Build = withWeight(Hammer);
/** The same verdict the other way: buying the material beats producing it. */
export const Buy = withWeight(ShoppingCart);
/** A build plan material this character is better off reacting than buying (issue #460) — its own glyph, not the manufacturing hammer or the planetary globe. */
export const Reaction = withWeight(Flask);
/** Promote a derived prereq row into a real Skill Plan entry (CONTEXT.md "Prereq Promotion"). */
export const AddToPlan = withWeight(Plus);
/** A row's browser-notification channel is currently on (issue #364). */
export const BrowserNotifyOn = withWeight(Bell);

/**
 * Marks a Notification Event the backend can schedule ahead of time, so it
 * arrives with the app closed. Deliberately not another bell: the Bell family
 * above already means "the browser-notification channel", and this is a
 * property of the event, not of a channel.
 */
export const ScheduledPush = withWeight(Broadcast);
/** A row's browser-notification channel is currently off (issue #364). */
export const BrowserNotifyOff = withWeight(BellSlash);
/** Hide a Notification Feed row's type from the feed (issue #364) — one-way from here, reversible in Settings. */
export const HideInFeed = withWeight(EyeSlash);
/** Open every collapsible group at once. */
export const ExpandAll = withWeight(CaretDoubleDown);
/** Close every collapsible group at once. */
export const CollapseAll = withWeight(CaretDoubleUp);

// The Login page's feature list (src/routes/Login.tsx) is the one caller for
// most of the section below — grouped here so a reader can see they're a set.
/** Skill training and progression. */
export const Skills = withWeight(GraduationCap);
/** Manufacturing build plans. */
export const Industry = withWeight(Factory);
/** Live order books. */
export const Market = withWeight(ChartLineUp);
/** Balance and open orders. */
export const Wallet = withWeight(WalletGlyph);
/** Colonies and extraction timers. */
export const Planetary = withWeight(Planet);
/** An extractor program's live telemetry — the one PI card with real-time data. */
export const Extraction = withWeight(Gauge);
/** Mail, calendar and contacts, grouped as one row. */
export const Social = withWeight(EnvelopeSimple);
/** Jump clones and implants. */
export const Clones = withWeight(Stack);
/** Contracts — courier, item exchange, auction. */
export const Contracts = withWeight(FileText);
/** Corporation-owned surfaces: ops board, wallet divisions, roster, corp assets. */
export const Corporation = withWeight(Buildings);
/** The Moon Mining Tax ledger. Its own glyph, not the industry factory — this is rent, not production. */
export const MoonMining = withWeight(Moon);
/**
 * The notification *feature* as a whole, as sold on the login page. Distinct
 * from `BrowserNotifyOn`/`BrowserNotifyOff`, which are the two states of one
 * row's toggle and must stay a pair.
 */
export const Notifications = withWeight(Bell);
/** Works with no connection: the installed PWA serving what it last fetched. */
export const Offline = withWeight(CloudSlash);
/** A character's own open market orders, as distinct from `Market`'s general price lookup. */
export const Orders = withWeight(Receipt);
/** Read-only access — the app never writes to the player's account. */
export const ReadOnly = withWeight(ShieldCheck);
/** Credentials that stay on the device. */
export const TokenPrivacy = withWeight(LockKey);
/** The project's source being public. */
export const OpenSource = withWeight(Code);
/** Start the EVE SSO round trip. Replaces the `▶` dingbat the login button used to draw (DESIGN.md §5). */
export const SignIn = withWeight(SignInGlyph);
/**
 * A contact this character has flagged to watch. Same glyph as
 * `SeverityWatch`, kept separate because that one is a notification severity
 * and this one is a per-contact flag — they are free to diverge.
 */
export const Watched = withWeight(Eye);
/** A contact this character has blocked. */
export const Blocked = withWeight(Prohibit);
