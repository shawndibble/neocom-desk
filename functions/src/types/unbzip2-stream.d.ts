// unbzip2-stream ships no types (and no @types/unbzip2-stream package) — a
// minimal ambient declaration for the one export `publicContractsArchive.ts`
// uses.
declare module 'unbzip2-stream' {
  import type { Transform } from 'node:stream';

  function unbzip2Stream(): Transform;
  export default unbzip2Stream;
}
