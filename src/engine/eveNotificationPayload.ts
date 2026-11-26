import { parseInstant } from './esiInstant';

const EVE_EPOCH_OFFSET_MS = 11_644_473_600_000;

const TICKS_PER_MS = 10_000;

export interface EveNotificationPayload {
  structureId?: number;
  structureName?: string;
  structureTypeId?: number;
  charId?: number;
  corpId?: number;
  corpName?: string;
  allianceName?: string;
  declaredById?: number;
  againstId?: number;
  amount?: number;
  dueDateMs?: number;
  timeLeftMs?: number;
  daysUntilAbandon?: number;
  warHqName?: string;
  planetId?: number;
  aggressorId?: number;
  aggressorCorpId?: number;
  aggressorAllianceId?: number;
  reinforceExitMs?: number;
  moonId?: number;
  moonName?: string;
  readyTimeMs?: number;
  autoTimeMs?: number;
  startedById?: number;
  firedById?: number;
  cancelledById?: number;
  oreVolumes?: readonly MoonOreVolume[];
}

export interface MoonOreVolume {
  typeId: number;
  volumeM3: number;
}

function unquote(value: string): string {
  const quoted =
    value.length >= 2 &&
    (value.startsWith('"') || value.startsWith("'")) &&
    value.endsWith(value[0]);
  return quoted ? value.slice(1, -1) : value;
}

function scalarLines(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  if (typeof text !== 'string') return fields;
  for (const line of text.split('\n')) {
    if (line.length === 0 || line.startsWith(' ') || line.startsWith('\t')) continue;
    if (line.startsWith('-')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (key.length === 0) continue;
    let value = line
      .slice(colon + 1)
      .trim()
      .replace(/\r$/, '');
    if (value.startsWith('&')) {
      const space = value.indexOf(' ');
      value = space === -1 ? '' : value.slice(space + 1).trim();
    }
    if (value.startsWith('*')) continue;
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
  return Number.isFinite(parsed) ? parsed : undefined;
}

const ORE_BLOCK_KEY = 'orevolumebytype';

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

function splitPair(text: string): [string, string] | null {
  const colon = text.indexOf(':');
  return colon <= 0 ? null : [text.slice(0, colon), text.slice(colon + 1)];
}

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
    if (/^\s/.test(lines[i])) continue;
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

function ticksToEpochMs(ticks: number | undefined): number | undefined {
  if (ticks === undefined || ticks <= 0) return undefined;
  return Math.round(ticks / TICKS_PER_MS - EVE_EPOCH_OFFSET_MS);
}

function ticksToDurationMs(ticks: number | undefined): number | undefined {
  if (ticks === undefined || ticks <= 0) return undefined;
  return Math.round(ticks / TICKS_PER_MS);
}

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

export function reinforcementExitMs(
  notificationTimestamp: string,
  payload: EveNotificationPayload
): number | undefined {
  if (payload.timeLeftMs === undefined) return undefined;
  const firedAtMs = parseInstant(notificationTimestamp);
  if (firedAtMs === null) return undefined;
  return firedAtMs + payload.timeLeftMs;
}

export function parseEveNotificationPayload(text: string): EveNotificationPayload {
  const fields = scalarLines(text);
  return {
    structureId: num(fields, 'structureid'),
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
