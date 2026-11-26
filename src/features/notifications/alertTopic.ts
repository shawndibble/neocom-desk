import { typeChipOfGroupKey } from './dangerAlert';

export type AlertTopic = NonNullable<ReturnType<typeof typeChipOfGroupKey>> | 'other';

export function alertTopic(groupKey: string): AlertTopic {
  return typeChipOfGroupKey(groupKey) ?? 'other';
}
