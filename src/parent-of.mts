import type { PR } from "./types.mts";

export const parentOf = (all: PR[], pr: PR, trunk: string): PR | undefined => {
  if (pr.baseRefName === trunk) {
    return undefined;
  }
  const matches = all.filter(
    (p) => !p.isCrossRepository && p.headRefName === pr.baseRefName,
  );
  if (matches.length > 1) {
    throw new Error("Ambiguous parent PR: #" + pr.number);
  }
  return matches[0];
};
