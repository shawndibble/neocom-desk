export function partitionByWeight(
  files: string[],
  weights: Record<string, number>,
  shardCount: number
): string[][];

export function parseListReporterLog(log: string): Record<string, number>;
