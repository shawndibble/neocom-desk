const SAFE = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.claude\//,
  /^\.out-of-scope\//,
  /^(LICENSE|\.gitignore|\.prettierignore)$/,
];

export function needsTests(changedFiles) {
  if (changedFiles.length === 0) return true;
  return changedFiles.some((file) => !SAFE.some((pattern) => pattern.test(file)));
}
