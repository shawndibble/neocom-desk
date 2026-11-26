export function eveTypeLabelKey(type: string): string {
  return `notifications.eveTypeName.${type}`;
}

type TranslateWithDefault = (key: string, options: { defaultValue: string }) => string;

export function eveTypeLabel(t: TranslateWithDefault, type: string): string {
  return t(eveTypeLabelKey(type), { defaultValue: humanizeEveType(type) });
}

export function humanizeEveType(type: string): string {
  return type
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim()
    .replace(/ Msg$/, '');
}
