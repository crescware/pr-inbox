import { spawnSync } from "node:child_process";

import type { Detail, PR, Target } from "./types.mts";

export const target: Target = { repo: "org/repo", trunk: "main" };
export const empty = <T,>(
  nodes: T[] = [],
): { nodes: T[]; pageInfo: Detail["reviews"]["pageInfo"] } => ({
  nodes,
  pageInfo: {},
});
export const pr = (
  number = 1,
  base = "main",
  branch = "feature",
): PR & { detail: Detail } => ({
  number,
  title: "テスト",
  author: { login: "author" },
  baseRefName: base,
  headRefName: branch,
  reviewRequests: [],
  detail: {
    state: "OPEN",
    mergeable: "MERGEABLE",
    baseRefName: base,
    headRefName: branch,
    reviews: empty(),
    reviewThreads: empty(),
    comments: empty(),
    commits: empty([
      {
        commit: {
          committedDate: "2026-10-09T10:00:00Z",
          parents: { totalCount: 1 },
        },
      },
    ]),
  },
});
export const review = (
  state: string,
  body = "",
  submittedAt = "2026-10-09T09:00:00Z",
  login = "reviewer",
  typename = "User",
): Detail["reviews"]["nodes"][number] => ({
  author: { login, __typename: typename },
  state,
  body,
  submittedAt,
});
/** process.stdout.isTTY を一時的に差し替えて fn を実行する */
export const withStdoutTTY = <T,>(isTTY: boolean, fn: () => T): T => {
  const original = process.stdout.isTTY;
  process.stdout.isTTY = isTTY;
  try {
    return fn();
  } finally {
    process.stdout.isTTY = original;
  }
};
/** 色を出せる端末に見せかけた子プロセスで式を評価し、標準出力を返す */
export const inTerminal = (module: URL, expression: string): string => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { WriteStream } from "node:tty";
process.stdout.isTTY = true;
process.stdout.getColorDepth = WriteStream.prototype.getColorDepth;
const m = await import(${JSON.stringify(module.href)});
process.stdout.write(String(${expression}));`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        FORCE_COLOR: "1",
        NO_COLOR: undefined,
        NODE_DISABLE_COLORS: undefined,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout;
};
