import { clean } from "./clean.mts";
import { gh } from "./gh.mts";
import type { Target } from "./types.mts";

export const resolveTarget = (repo?: string, trunk?: string): Target => {
  if (repo && trunk) {
    return { repo, trunk };
  }
  let view: {
    nameWithOwner: string;
    defaultBranchRef: { name: string } | null;
  };
  try {
    view = gh([
      "repo",
      "view",
      ...(repo ? [repo] : []),
      "--json",
      "nameWithOwner,defaultBranchRef",
    ]);
  } catch (error) {
    if (repo) {
      throw error;
    }
    throw new Error(
      "Cannot determine the repository of the current directory; use --repo OWNER/REPO: " +
        clean(error instanceof Error ? error.message : error),
    );
  }
  const branch = trunk ?? view.defaultBranchRef?.name;
  if (!branch) {
    throw new Error(
      "Cannot determine the default branch of " + view.nameWithOwner + "; use --trunk BRANCH",
    );
  }
  return { repo: view.nameWithOwner, trunk: branch };
};
