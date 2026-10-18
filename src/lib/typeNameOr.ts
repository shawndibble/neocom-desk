type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** A type's name, or the "Unknown type #id" label when the name lookup missed. */
export function typeNameOr(t: Translate, name: string | undefined, typeId: number): string {
  return name ?? t('common.unknownType', { id: typeId });
}
