export function sdeDataUrl(
  baseUrl: string,
  file: string,
  versions: Readonly<Record<string, string>> = __SDE_DATA_VERSIONS__
): string {
  const url = `${baseUrl}data/${file}`;
  const version = versions[file];
  return version ? `${url}?v=${version}` : url;
}
