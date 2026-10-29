import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { pr, review } from "./src/fixtures.mts";
import type { PR } from "./src/types.mts";

type GhResult = { status: number; stdout: string; stderr?: string };
const repoView = (nameWithOwner: string, branch: string | null): GhResult => ({
  status: 0,
  stdout: JSON.stringify({
    nameWithOwner,
    defaultBranchRef: branch === null ? null : { name: branch },
  }),
});
/** gh を差し替えた子プロセスで main を実行し、gh に渡した引数も返す */
const runMain = (
  args: string[],
  prs: PR[] = [],
  view: GhResult = repoView("org/repo", "main"),
  reviewed: { number: number }[] = [],
): {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[][];
} => {
  const script = new URL("./index.mts", import.meta.url).href;
  const details = Object.fromEntries(prs.map((p) => ["p" + p.number, p.detail]));
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const calls = [];
process.on("exit", () => fs.writeSync(3, JSON.stringify(calls)));
childProcess.spawnSync = (command, args) => {
  if (command !== "gh") throw new Error("Unexpected command: " + command);
  calls.push(args);
  if (args[0] === "repo") return ${JSON.stringify(view)};
  if (args.includes("--search")) return { status: 0, stdout: ${JSON.stringify(JSON.stringify(reviewed))} };
  return { status: 0, stdout: JSON.stringify(args[0] === "pr"
    ? ${JSON.stringify(prs.map((p) => ({ ...p, detail: undefined })))}
    : { data: { repository: ${JSON.stringify(details)} } }) };
};
syncBuiltinESMExports();
const { main } = await import(${JSON.stringify(script)});
main(${JSON.stringify(args)});`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe", "pipe"] },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: JSON.parse(String(result.output[3])),
  };
};
test("通信中の取得対象を標準エラー出力に表示し、一覧には混ぜない", () => {
  const prs = Array.from({ length: 6 }, (_, i) => pr(i + 1, "main", "feature-" + (i + 1)));
  const result = runMain(["author"], prs);
  expect(result.status).toBe(0);
  expect(result.stderr.trim().split("\n")).toEqual([
    "Fetching open PRs...",
    "Fetching details: #1, #2, #3, #4, #5",
    "Fetching details: #6",
  ]);
  expect(result.stdout).toContain("\nStack\n");
  expect(result.stdout).toContain("\nPRs\n");
  expect(result.stdout).not.toContain("Fetching");
  expect(result.stdout.endsWith("\n\n")).toBe(true);
  expect(result.stdout.endsWith("\n\n\n")).toBe(false);
});
test("オプションがなければカレントディレクトリのリポジトリとデフォルトブランチを使う", () => {
  const result = runMain(["author"], [], repoView("current/repo", "trunk"));
  expect(result.status).toBe(0);
  expect(result.calls[0]).toEqual(["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]);
  expect(result.calls[1]?.slice(0, 4)).toEqual(["pr", "list", "--repo", "current/repo"]);
  expect(result.stdout.split("\n")[0]).toBe("current/repo / author");
  expect(result.stdout).toMatch(/PR\s+Title\s+Diff\s+trunk\s+Conflict/);
});
test("--repo と --trunk で指定したリポジトリと宛先ブランチで一覧を表示する", () => {
  const result = runMain(["--repo=other/repo", "--trunk=release", "author"]);
  expect(result.status).toBe(0);
  expect(result.calls.map((args) => args[0])).toEqual(["pr"]);
  expect(result.stdout.split("\n")[0]).toBe("other/repo / author");
  expect(result.stdout).toMatch(/PR\s+Title\s+Diff\s+release\s+Conflict/);
});
test("引数のユーザーが作者・レビュー依頼先・レビュー投稿者の PR を親とともに表示する", () => {
  const parent = pr(8, "main", "parent");
  const requested = pr(2, "parent", "requested");
  requested.reviewRequests = [{ login: "Selected-User" }];
  const own = pr(3, "main", "own");
  own.author.login = "selected-user";
  const reviewed = pr(4, "main", "reviewed");
  reviewed.detail.reviews.nodes = [review("APPROVED", "", undefined, "selected-user")];
  const closed = pr(5, "main", "closed");
  closed.reviewRequests = [{ login: "selected-user" }];
  closed.detail.state = "CLOSED";
  const unrelated = pr(6, "main", "unrelated");
  unrelated.reviewRequests = [{ login: "another-reviewer" }];
  const result = runMain(
    ["selected-user"],
    [requested, own, reviewed, closed, unrelated, parent],
    undefined,
    [{ number: 4 }],
  );
  expect(result.status).toBe(0);
  const [tree, list] = result.stdout.split("\nPRs\n");
  expect(tree).toContain("└─ #8* テスト\n   └─ #2* テスト");
  expect(list?.split("\n").flatMap((line) => line.match(/^[✓✗? ] (#\d+\*?)/)?.[1] ?? [])).toEqual([
    "#3",
    "#4*",
    "#8*",
    "#2*",
  ]);
  expect(result.stdout).toContain("* PR by another author");
  expect(result.stdout).not.toContain("#5");
  expect(result.stdout).not.toContain("#6");
});
test("詳細のレビュー履歴が省略されても、レビュー済み PR をツリーと一覧に残す", () => {
  const reviewed = pr();
  reviewed.detail.reviews.nodes = Array.from({ length: 100 }, () => review("COMMENTED"));
  reviewed.detail.reviews.pageInfo.hasPreviousPage = true;
  const result = runMain(["selected-user"], [reviewed], undefined, [{ number: 1 }]);
  expect(result.status).toBe(0);
  expect(result.stdout.match(/#1\*/g)).toHaveLength(2);
  expect(result.stdout).not.toContain("No open PRs");
});
test("引数が不正なら GitHub に問い合わせずに使い方を表示して終了する", () => {
  const script = fileURLToPath(new URL("./index.mts", import.meta.url));
  for (const args of [[], ["--ack"]]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: "/no-gh-available" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      "pr-inbox: Usage: pr-inbox [--repo OWNER/REPO] [--trunk BRANCH] <GitHub username>\n",
    );
  }
});
test("npm のコマンドのようにシンボリックリンク経由で起動しても実行する", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-inbox-"));
  try {
    const link = path.join(dir, "pr-inbox");
    symlinkSync(fileURLToPath(new URL("./index.mts", import.meta.url)), link);
    const result = spawnSync(process.execPath, [link], {
      encoding: "utf8",
      env: { ...process.env, PATH: "/no-gh-available" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pr-inbox: Usage: pr-inbox");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
