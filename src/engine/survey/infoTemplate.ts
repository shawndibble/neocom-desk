/**
 * The pilot's Survey info templates: a name and any of the fields on a Survey's
 * Additional information panel (location, moon tax, notes), saved to fill the
 * next field in one pick. A template holds only the fields the pilot chose to
 * save, and applying one leaves the others as they are. Pure.
 */

import { clamp } from '../math';

export interface InfoLocation {
  /** Null for a place typed by hand, which has no waypoint. */
  id: number | null;
  name: string;
}

export interface InfoTax {
  name: string;
  pct: number;
}

/** What the panel shows right now; a blank field is null or empty. */
export interface InfoFields {
  location: InfoLocation | null;
  tax: InfoTax | null;
  notes: string;
}

/** The fields a template holds; a field it does not hold is absent. */
export interface InfoTemplate {
  id: string;
  name: string;
  location?: InfoLocation;
  tax?: InfoTax;
  notes?: string;
}

export type InfoTemplateFields = Pick<InfoTemplate, 'location' | 'tax' | 'notes'>;

export interface InfoInclude {
  location: boolean;
  tax: boolean;
  notes: boolean;
}

export const TEMPLATE_MAX = 30;
/** A name is a short label. */
export const TEMPLATE_NAME_MAX = 40;
/** The same cap a Survey's stored notes have. */
const NOTES_MAX = 1000;

function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, TEMPLATE_NAME_MAX).trim() : '';
}

function parseLocation(raw: unknown): InfoLocation | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { id, name } = raw as { id?: unknown; name?: unknown };
  if (typeof name !== 'string' || name.trim() === '') return undefined;
  if (id !== null && !(typeof id === 'number' && Number.isFinite(id))) return undefined;
  return { id, name };
}

function parseTax(raw: unknown): InfoTax | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { name, pct } = raw as { name?: unknown; pct?: unknown };
  if (typeof name !== 'string' || name.trim() === '') return undefined;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) return undefined;
  return { name, pct };
}

/** A stored or synced list, which another device or build may have written. */
export function parseInfoTemplates(raw: unknown): InfoTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InfoTemplate[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const name = cleanName(entry.name);
    if (typeof entry.id !== 'string' || entry.id === '' || name === '' || seen.has(entry.id))
      continue;
    seen.add(entry.id);
    const template: InfoTemplate = { id: entry.id, name };
    const location = parseLocation(entry.location);
    if (location) template.location = location;
    const tax = parseTax(entry.tax);
    if (tax) template.tax = tax;
    const notes = typeof entry.notes === 'string' ? entry.notes.trim().slice(0, NOTES_MAX) : '';
    if (notes !== '') template.notes = notes;
    out.push(template);
  }
  return out.slice(0, TEMPLATE_MAX);
}

/** `moon` is whether the Survey shows a moon ore: without one the tax row is not on the panel. */
interface Context {
  moon: boolean;
}

/** The fields a template holds, as the set to refresh it with; the tax only counts when the panel shows it. */
export function heldInclude(template: InfoTemplate, ctx: Context): InfoInclude {
  return {
    location: template.location !== undefined,
    tax: template.tax !== undefined && ctx.moon,
    notes: template.notes !== undefined,
  };
}

/** The fields to save: those the pilot included that are actually set. */
export function templateFields(current: InfoFields, include: InfoInclude): InfoTemplateFields {
  const fields: InfoTemplateFields = {};
  if (include.location && current.location) fields.location = current.location;
  if (include.tax && current.tax) fields.tax = current.tax;
  const notes = current.notes.trim();
  if (include.notes && notes !== '') fields.notes = notes;
  return fields;
}

/** The panel's fields after picking `template`: what it holds is set, the rest stays. */
export function applyTemplate(
  template: InfoTemplate,
  current: InfoFields,
  ctx: Context
): InfoFields {
  return {
    location: template.location ?? current.location,
    tax: ctx.moon && template.tax ? template.tax : current.tax,
    notes: template.notes ?? current.notes,
  };
}

/** Whether a field the template holds no longer matches the panel. */
export function isEdited(template: InfoTemplate, current: InfoFields, ctx: Context): boolean {
  const { location, tax, notes } = template;
  if (
    location &&
    (current.location?.id !== location.id || current.location.name !== location.name)
  ) {
    return true;
  }
  if (
    ctx.moon &&
    tax &&
    (current.tax?.pct !== tax.pct || current.tax.name.trim() !== tax.name.trim())
  ) {
    return true;
  }
  return notes !== undefined && current.notes.trim() !== notes;
}

/** What a template holds, for the one line under its name. */
export function templateSummary(template: InfoTemplate): {
  location: string | null;
  tax: InfoTax | null;
  hasNotes: boolean;
} {
  return {
    location: template.location?.name ?? null,
    tax: template.tax ?? null,
    hasNotes: template.notes !== undefined,
  };
}

/** The template a save under `name` would replace, if any (names match in any case). */
export function findTemplateByName(
  list: readonly InfoTemplate[],
  name: string
): InfoTemplate | undefined {
  const wanted = cleanName(name).toLowerCase();
  return wanted === '' ? undefined : list.find((t) => t.name.toLowerCase() === wanted);
}

interface SaveInput {
  /** Set to update that template; otherwise a template of the same name is replaced, or a new one added. */
  id?: string;
  name: string;
  fields: InfoTemplateFields;
}

export function saveTemplate(
  list: readonly InfoTemplate[],
  input: SaveInput,
  newId: () => string
): InfoTemplate[] {
  const name = cleanName(input.name);
  if (name === '') return [...list];
  const target = list.find((t) => t.id === input.id) ?? findTemplateByName(list, name);
  const saved: InfoTemplate = { id: target?.id ?? newId(), name, ...input.fields };
  if (target) return list.map((t) => (t === target ? saved : t));
  return [...list, saved].slice(-TEMPLATE_MAX);
}

export function renameTemplate(
  list: readonly InfoTemplate[],
  id: string,
  name: string
): InfoTemplate[] {
  const clean = cleanName(name);
  if (clean === '') return [...list];
  return list.map((t) => (t.id === id ? { ...t, name: clean } : t));
}

export function deleteTemplate(list: readonly InfoTemplate[], id: string): InfoTemplate[] {
  return list.filter((t) => t.id !== id);
}

/** Puts a deleted template back at its old place (the end when the list is shorter now). */
export function insertTemplate(
  list: readonly InfoTemplate[],
  template: InfoTemplate,
  index: number
): InfoTemplate[] {
  if (list.some((t) => t.id === template.id)) return [...list];
  const next = [...list];
  next.splice(clamp(index, 0, next.length), 0, template);
  return next.slice(0, TEMPLATE_MAX);
}
