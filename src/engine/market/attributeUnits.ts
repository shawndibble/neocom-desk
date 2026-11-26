const LEGEND_REPAIRS: Readonly<Record<string, string>> = {
  '1=small 2=medium 3=l': '1=small 2=medium 3=large 4=X-Large',
};

const LEGEND_SHAPE = /(?:^|\s)-?\d+=/;

const LEGEND_MEMBERS = /(-?\d+)=(.*?)(?=\s+-?\d+=|$)/g;

export function isEnumUnit(unit: string | null | undefined): boolean {
  return unit != null && LEGEND_SHAPE.test(unit);
}

export function enumUnitLabel(unit: string | null | undefined, value: number): string | null {
  if (!isEnumUnit(unit) || unit == null) return null;
  for (const [, key, member] of (LEGEND_REPAIRS[unit] ?? unit).matchAll(LEGEND_MEMBERS)) {
    if (Number(key) !== value) continue;
    const label = member.trim();
    return label ? label[0].toUpperCase() + label.slice(1) : null;
  }
  return null;
}

export type IdReferenceKind = 'type' | 'group' | 'attribute';

const ID_REFERENCE_UNITS: Readonly<Record<string, IdReferenceKind>> = {
  typeID: 'type',
  groupID: 'group',
  attributeID: 'attribute',
};

export function idReferenceKind(unit: string | null | undefined): IdReferenceKind | null {
  return unit == null ? null : (ID_REFERENCE_UNITS[unit] ?? null);
}

export function looksLikeId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function unitRepeatsName(name: string, unit: string | null | undefined): boolean {
  if (!unit) return false;
  const word = unit.toLowerCase();
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes(word);
}
