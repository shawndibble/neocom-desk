/**
 * Parses the `text` blob an EVE Notification carries (issue #300), the
 * follow-up `eveNotificationText.ts` was written to expect.
 *
 * **Why not a YAML library.** The blob is YAML, but the slice of YAML these
 * payloads use is a flat `key: value` mapping plus nested blocks nothing here
 * renders — so the whole grammar this needs is "top-level scalars". Pulling in
 * a general parser to read a dozen keys would be a large runtime dependency
 * for a handful of lines, and would also hand a CCP-authored blob to a much
 * larger attack surface than a line split. Three quirks of the real payloads
 * drive the implementation:
 *
 * - Every structure payload writes its id as `structureID: &id001 1000000000001`
 *   — a YAML anchor, so that the sibling `structureShowInfoData` list can
 *   alias it back with `*id001`. The anchor name varies (`&notification_id001`
 *   shows up too). Dropping the anchor token is what makes eight of the
 *   rendered types work at all.
 * - Values carry colons (`structureLink: <a href="showinfo:35835//...">`), so
 *   the split is on the *first* colon only.
 * - Indentation is the only thing separating a nested map's keys from
 *   top-level ones (`oreVolumeByType:` then `  46300: 6022254.47`), so a
 *   leading space disqualifies a line.
 *
 * **Every field is optional, and unparseable input yields an empty payload
 * rather than an exception** (issue #300 AC2, inherited from #274's AC2): CCP
 * reshapes payloads and adds types without notice (esi/esi-issues#1380), so a
 * renderer that could throw on an unexpected blob would be worse than the
 * generic body it replaces. Nothing in here throws, and nothing in here has a
 * required field.
 */
import { parseInstant } from './esiInstant';

/** Epoch ms at 1601-01-01T00:00:00Z, the origin EVE's tick counts are measured from. */
const EVE_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** EVE's timestamps and durations are both counts of 100-nanosecond intervals. */
const TICKS_PER_MS = 10_000;

/**
 * Fields the notification renderers read, normalised to app-native names and
 * units. Deliberately a flat bag rather than a discriminated union per `type`:
 * a key means the same thing wherever it appears (`structureID` is always the
 * structure), and the handful of keys that are context-dependent — `charID` is
 * the aggressing pilot on an attack and the applicant on a corp application —
 * are read by the per-type renderer that knows which it is.
 */
export interface EveNotificationPayload {
  /** `structureID`. */
  structureId?: number;
  /** `structureName` when present, else the link text inside `structureLink`. */
  structureName?: string;
  /** `structureTypeID`. */
  structureTypeId?: number;
  /** `charID` — the aggressing pilot, or the applicant, depending on the type. */
  charId?: number;
  /** `corpID`. */
  corpId?: number;
  /** `corpName` — the aggressor's corporation, already spelled out by CCP. */
  corpName?: string;
  /** `allianceName` — likewise already spelled out, and absent for an unallied aggressor. */
  allianceName?: string;
  /** `declaredByID` — the war's aggressor. */
  declaredById?: number;
  /** `againstID` — the war's defender. */
  againstId?: number;
  /** `amount`, in ISK. */
  amount?: number;
  /** `dueDate`, converted from EVE ticks to epoch ms. */
  dueDateMs?: number;
  /**
   * `timeLeft`, a *duration* in EVE ticks, as ms. Callers add it to the
   * notification's own timestamp rather than reading the payload's sibling
   * `timestamp` key: the envelope timestamp is the instant ESI vouches for,
   * and on the one sample where both can be checked the two agree to within
   * half a minute.
   */
  timeLeftMs?: number;
  /** `daysUntilAbandon`. */
  daysUntilAbandon?: number;
  /** Link text of `warHQ` (`<b>Amamake - Test Structure Alpha</b>`). */
  warHqName?: string;
  /** `planetID` — the customs office's planet, on the two Orbital types. */
  planetId?: number;
  /** `aggressorID` — the attacking pilot, on the two Orbital types. */
  aggressorId?: number;
  /** `aggressorCorpID`. */
  aggressorCorpId?: number;
  /** `aggressorAllianceID` — absent for an unallied attacker. */
  aggressorAllianceId?: number;
  /** `reinforceExitTime`, converted from EVE ticks to epoch ms — an instant, not a duration. */
  reinforceExitMs?: number;
  /** `moonID` — the drilled moon, on the Moonmining types. */
  moonId?: number;
  /** Link text of `moonLink` (`<a href="showinfo:14//40161708">Dital II - Moon 1</a>`). */
  moonName?: string;
  /** `readyTime` — when the chunk arrives, from EVE ticks to epoch ms. */
  readyTimeMs?: number;
  /** `autoTime` — when an unfired chunk fractures on its own, from EVE ticks to epoch ms. */
  autoTimeMs?: number;
  /** `startedBy` — the character who started the extraction. */
  startedById?: number;
  /** `firedBy` — the character who fired the moon drill. */
  firedById?: number;
  /** `cancelledBy` — the character who cancelled the extraction; absent when CCP writes `null`. */
  cancelledById?: number;
  /**
   * `oreVolumeByType` — the chunk's ore, in m³ per ore type, on
   * MoonminingExtractionStarted and the drill types after it. The exact ore
   * a moon chunk estimate prefers over a survey (epic #4055, D13).
   * Unverified against live data, so read line by line: a malformed line is
   * dropped, the rest kept, and a block with no usable line is absent.
   */
  oreVolumes?: readonly MoonOreVolume[];
}

/** One ore type's share of a moon chunk. */
export interface MoonOreVolume {
  typeId: number;
  /** m³, not units: moon ore is 10 m³ a unit. */
  volumeM3: number;
}

/** Drops a matching pair of surrounding quotes, leaving an unbalanced one alone. */
function unquote(value: string): string {
  const quoted =
    value.length >= 2 &&
    (value.startsWith('"') || value.startsWith("'")) &&
    value.endsWith(value[0]);
  return quoted ? value.slice(1, -1) : value;
}

/**
 * Top-level `key: value` scalars, keyed by lower-cased key. Lower-casing is
 * not cosmetic: CCP spells the same concept `solarsystemID` on the structure
 * types and `solarSystemID` on the moonmining ones, so matching case-sensitively
 * would silently miss half the payloads that carry a key.
 */
function scalarLines(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  // `text` is typed `string`, but it arrives from an ESI response body that
  // TypeScript cannot vouch for at runtime — a type CCP ships without the
  // field would make this a `.split` on `undefined`, i.e. the one throw the
  // whole module promises not to do.
  if (typeof text !== 'string') return fields;
  for (const line of text.split('\n')) {
    // A leading space means a nested map's key or a list continuation; a
    // leading `-` means a list item. Neither is a top-level scalar.
    if (line.length === 0 || line.startsWith(' ') || line.startsWith('\t')) continue;
    if (line.startsWith('-')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (key.length === 0) continue;
    // `\r` survives the split on CRLF payloads and would otherwise ride along
    // on every value.
    let value = line
      .slice(colon + 1)
      .trim()
      .replace(/\r$/, '');
    if (value.startsWith('&')) {
      // `&id001 1000000000001` — an anchor declaration wrapping the real value.
      const space = value.indexOf(' ');
      value = space === -1 ? '' : value.slice(space + 1).trim();
    }
    // `*id001` — an alias whose target this parser does not track. Ignoring it
    // is safer than recording the alias name as if it were the value.
    if (value.startsWith('*')) continue;
    // A structure name containing a colon, or starting with a character YAML
    // reserves, comes back quoted from any emitter — the quotes are syntax,
    // not part of the name.
    value = unquote(value);
    if (value.length === 0) continue;
    fields.set(key, value);
  }
  return fields;
}

function num(fields: Map<string, string>, key: string): number | undefined {
  const raw = fields.get(key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  // `Number('')` is 0 and `Number('.inf')` is NaN — neither is a value worth
  // rendering, and the empty case is exactly what a truncated payload looks
  // like.
  return Number.isFinite(parsed) ? parsed : undefined;
}

const ORE_BLOCK_KEY = 'orevolumebytype';

/** One `typeId: volume` pair, or null unless the id is a positive integer and the volume a positive finite number. */
function oreVolumePair(rawKey: string, rawValue: string): MoonOreVolume | null {
  const key = rawKey.trim();
  const value = rawValue.trim();
  if (!/^\d+$/.test(key) || value.length === 0) return null;
  const typeId = Number(key);
  const volumeM3 = Number(value);
  if (!Number.isSafeInteger(typeId) || typeId <= 0) return null;
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) return null;
  return { typeId, volumeM3 };
}

/** Splits `a: b` on the first colon, or null when there is none. */
function splitPair(text: string): [string, string] | null {
  const colon = text.indexOf(':');
  return colon <= 0 ? null : [text.slice(0, colon), text.slice(colon + 1)];
}

/**
 * The `oreVolumeByType` mapping, block style (`oreVolumeByType:` then
 * indented `46300: 6022254.47` lines, which is what the public samples show)
 * or flow style (`oreVolumeByType: {46300: 6022254.47}`, which a different
 * emitter would write). Only lines at the block's own first indent count, so
 * a deeper nested map is not mistaken for ore. Later duplicates of a type
 * replace earlier ones, keeping the first one's position.
 */
function oreVolumes(text: string): MoonOreVolume[] | undefined {
  if (typeof text !== 'string') return undefined;
  const byType = new Map<number, number>();
  const add = (pair: [string, string] | null) => {
    const ore = pair === null ? null : oreVolumePair(pair[0], pair[1]);
    if (ore !== null) byType.set(ore.typeId, ore.volumeM3);
  };
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  for (let i = 0; i < lines.length; i++) {
    const header = splitPair(lines[i]);
    if (header === null || header[0].trim().toLowerCase() !== ORE_BLOCK_KEY) continue;
    // A leading space means this is someone else's nested key, not the block.
    if (/^\s/.test(lines[i])) continue;
    // `&id001` — an anchor on the block itself, as CCP writes on structure ids.
    const inline = header[1].trim().replace(/^&\S+\s*/, '');
    if (inline.startsWith('{') && inline.endsWith('}')) {
      for (const entry of inline.slice(1, -1).split(',')) add(splitPair(entry));
      continue;
    }
    if (inline.length > 0) continue;
    let indent: string | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim().length === 0) continue;
      const leading = /^[ \t]*/.exec(line)?.[0] ?? '';
      if (leading.length === 0) break;
      indent ??= leading;
      if (leading !== indent) continue;
      add(splitPair(line));
    }
  }
  if (byType.size === 0) return undefined;
  return [...byType].map(([typeId, volumeM3]) => ({ typeId, volumeM3 }));
}

/** EVE tick count (100ns since 1601) as epoch ms, or undefined if it is not a real instant. */
function ticksToEpochMs(ticks: number | undefined): number | undefined {
  if (ticks === undefined || ticks <= 0) return undefined;
  return Math.round(ticks / TICKS_PER_MS - EVE_EPOCH_OFFSET_MS);
}

/** EVE tick count read as a duration, in ms. */
function ticksToDurationMs(ticks: number | undefined): number | undefined {
  if (ticks === undefined || ticks <= 0) return undefined;
  return Math.round(ticks / TICKS_PER_MS);
}

/**
 * Text of an EVE in-game link (`<a href="showinfo:...">Amamake - Alpha</a>`,
 * `<b>...</b>`). Regex rather than DOM parsing because `src/engine` stays pure
 * — and because the markup CCP emits here is a single flat element, not a
 * document.
 */
function linkText(markup: string | undefined): string | undefined {
  if (markup === undefined) return undefined;
  const stripped = markup
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return stripped.length === 0 ? undefined : stripped;
}

/**
 * Round 36: a reinforcement timer is the notification's own envelope
 * timestamp plus the payload's `timeLeft` duration, not the payload's
 * sibling `timestamp` key — the envelope is the instant ESI vouches for, and
 * only that one is a field CCP can't silently repurpose. `eveNotificationText.ts`'s
 * `timerEnd` and `engine/projection.ts`'s reinforcement-exit Projection both
 * call this, so the rule is derived once.
 */
export function reinforcementExitMs(
  notificationTimestamp: string,
  payload: EveNotificationPayload
): number | undefined {
  if (payload.timeLeftMs === undefined) return undefined;
  const firedAtMs = parseInstant(notificationTimestamp);
  if (firedAtMs === null) return undefined;
  return firedAtMs + payload.timeLeftMs;
}

/** Parses one EVE Notification's `text` payload. Never throws; every field may be absent. */
export function parseEveNotificationPayload(text: string): EveNotificationPayload {
  const fields = scalarLines(text);
  return {
    structureId: num(fields, 'structureid'),
    // The plain `structureName` beats the link because it is the same name
    // without markup to strip; the link is the only carrier on
    // StructureImpendingAbandonmentAssetsAtRisk.
    structureName: fields.get('structurename') ?? linkText(fields.get('structurelink')),
    structureTypeId: num(fields, 'structuretypeid'),
    charId: num(fields, 'charid'),
    corpId: num(fields, 'corpid'),
    corpName: fields.get('corpname'),
    allianceName: fields.get('alliancename'),
    declaredById: num(fields, 'declaredbyid'),
    againstId: num(fields, 'againstid'),
    amount: num(fields, 'amount'),
    dueDateMs: ticksToEpochMs(num(fields, 'duedate')),
    timeLeftMs: ticksToDurationMs(num(fields, 'timeleft')),
    daysUntilAbandon: num(fields, 'daysuntilabandon'),
    warHqName: linkText(fields.get('warhq')),
    planetId: num(fields, 'planetid'),
    aggressorId: num(fields, 'aggressorid'),
    aggressorCorpId: num(fields, 'aggressorcorpid'),
    aggressorAllianceId: num(fields, 'aggressorallianceid'),
    reinforceExitMs: ticksToEpochMs(num(fields, 'reinforceexittime')),
    moonId: num(fields, 'moonid'),
    moonName: linkText(fields.get('moonlink')),
    readyTimeMs: ticksToEpochMs(num(fields, 'readytime')),
    autoTimeMs: ticksToEpochMs(num(fields, 'autotime')),
    startedById: num(fields, 'startedby'),
    firedById: num(fields, 'firedby'),
    cancelledById: num(fields, 'cancelledby'),
    oreVolumes: oreVolumes(text),
  };
}
