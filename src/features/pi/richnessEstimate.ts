export type AssumedRate =
  | {
      kind: 'measured-own-colonies';
      unitsPerHour: number;
      sampleSize: number;
    }
  | { kind: 'no-measured-extraction' };
