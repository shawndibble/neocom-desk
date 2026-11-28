import { appSourceFiles, ratchet } from '@/test/sourceRatchet';

ratchet(
  'a bare overflow-x-auto wrapper around a table instead of TableScroll',
  appSourceFiles()
    .filter(
      ({ path, source }) =>
        !path.startsWith('src/components/ui/') &&
        /className=["{][^>]*\boverflow-x-auto\b[^>]*>\s*<(DataTable|table)\b/.test(source)
    )
    .map(({ path }) => path),
  ['src/mockups/corpTaxBookMember.tsx']
);
