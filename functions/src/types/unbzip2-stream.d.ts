declare module 'unbzip2-stream' {
  import type { Transform } from 'node:stream';

  function unbzip2Stream(): Transform;
  export default unbzip2Stream;
}
