const SAFE = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.claude\//,
  /^\.husky\//,
  /^functions\//,
  /^rules-tests\//,
  /^firestore\.(rules|indexes\.json)$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
  /^\.github\/(?!workflows\/ci\.yml$)/,
  /^src\/.*\.test\.tsx?$/,
  /^(LICENSE|\.gitignore|\.prettierignore|\.prettierrc|\.out-of-scope|\.mcp\.json|\.env\.example)$/,
];

const BOOK_INPUTS = [
  /^functions\//,
  /^firestore\.(rules|indexes\.json)$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
];
const BOOK_SAFE = [
  ...SAFE.filter((pattern) => !BOOK_INPUTS.some((input) => input.source === pattern.source)),
  /^functions\/src\/.*\.test\.ts$/,
];

const needsRun = (changedFiles, safe) =>
  changedFiles.length === 0 ||
  changedFiles.some((file) => !safe.some((pattern) => pattern.test(file)));

export function needsE2e(changedFiles) {
  return needsRun(changedFiles, SAFE);
}

export function needsBookE2e(changedFiles) {
  return needsRun(changedFiles, BOOK_SAFE);
}

const BOOK_PR_INPUTS = [
  /^functions\//,
  /^firestore\.(rules|indexes\.json)$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
  /^playwright\.book\.config\.ts$/,
  /^scripts\/e2e-book\//,
  /^e2e\/(support\/taxBook|.*\.book\.spec\.ts$)/,
  /^src\/.*(tax|mining|moon|sync|db\/)/i,
];

export function needsBookE2eOnPr(changedFiles) {
  if (changedFiles.length === 0) return true;
  return (
    needsBookE2e(changedFiles) &&
    changedFiles.some(
      (file) =>
        BOOK_PR_INPUTS.some((pattern) => pattern.test(file)) &&
        !/^functions\/src\/.*\.test\.ts$/.test(file) &&
        !/^src\/.*\.test\.tsx?$/.test(file)
    )
  );
}
