import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "vitest";

import {
  clean,
  facts,
  mergeOrder,
  relativeTime,
  render,
  type Detail,
  type PR,
  type Target,
} from "./index.mts";

const target: Target = { repo: "org/repo", trunk: "main" };
const empty = <T>(
  nodes: T[] = [],
): { nodes: T[]; pageInfo: Detail["reviews"]["pageInfo"] } => ({
  nodes,
  pageInfo: {},
});
const pr = (
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
const review = (
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
): {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[][];
} => {
  const script = new URL("./index.mts", import.meta.url).href;
  const details = Object.fromEntries(
    prs.map((p) => ["p" + p.number, p.detail]),
  );
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
  return { status: 0, stdout: JSON.stringify(args[0] === "pr"
    ? ${JSON.stringify(prs)}
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
test("Bot と PR 作者の Approve は集計しない", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("APPROVED", "", undefined, "review-bot", "Bot"),
    review("APPROVED", "", undefined, "author"),
  ];
  expect(facts(p).approved).toBe(false);
});
test("コンフリクトあり・なし・計算中・取得不明を区別する", () => {
  const p = pr();
  for (const [state, expected] of [
    ["MERGEABLE", false],
    ["CONFLICTING", true],
    ["UNKNOWN", null],
  ] as const) {
    p.detail.mergeable = state;
    expect(facts(p).conflict).toBe(expected);
  }
  expect(facts({ ...p, detail: undefined }).conflict).toBeNull();
});
test("コメントは Approve を取り消さず、変更要求と承認の取り消しは反映する", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("APPROVED"),
    review("COMMENTED", "補足", "2026-10-09T09:30:00Z"),
  ];
  expect(facts(p).approved).toBe(true);
  for (const state of ["DISMISSED", "CHANGES_REQUESTED"]) {
    p.detail.reviews.nodes[1] = review(state, "", "2026-10-09T09:30:00Z");
    expect(facts(p).approved).toBe(false);
  }
});
test("レビュー依頼先とレビューした人を併記し、どちらもなければハイフンを表示する", () => {
  const p = pr();
  expect(facts(p).reviewers).toEqual([]);
  p.detail.reviews.nodes = [review("COMMENTED")];
  expect(facts(p).reviewers).toEqual(["reviewer"]);
  p.reviewRequests = [{ login: "reviewer-b" }, { login: "reviewer-a" }];
  expect(facts(p).reviewers).toEqual(["reviewer", "reviewer-a", "reviewer-b"]);
});
test("レビュー依頼がコメントや承認に変わっても Reviewer から消さない", () => {
  const p = pr();
  p.reviewRequests = [{ login: "reviewer-b" }, { login: "reviewer-a" }];
  expect(facts(p).reviewers).toEqual(["reviewer-a", "reviewer-b"]);
  p.reviewRequests = [{ login: "reviewer-b" }];
  p.detail.reviews.nodes = [
    review("COMMENTED", "指摘", undefined, "reviewer-a"),
  ];
  expect(facts(p).reviewers).toEqual(["reviewer-a", "reviewer-b"]);
  p.detail.reviews.nodes.push(review("APPROVED", "", undefined, "Reviewer-A"));
  expect(facts(p).reviewers).toEqual(["Reviewer-A", "reviewer-b"]);
});
test("レビューした作者・Bot・下書きの投稿者は Reviewer に加えない", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("APPROVED", "", undefined, "author"),
    review("COMMENTED", "指摘", undefined, "review-bot", "Bot"),
    review("PENDING", "下書き", undefined, "reviewer"),
  ];
  expect(facts(p).reviewers).toEqual([]);
});
test("Reviewer を大文字小文字に関係なくアルファベット順に表示する", () => {
  const p = pr();
  p.reviewRequests = [
    { login: "Zulu" },
    { slug: "team-a" },
    { login: "alpha" },
    { name: "review-group" },
    { login: "Beta" },
  ];
  expect(facts(p).reviewers).toEqual([
    "alpha",
    "Beta",
    "review-group",
    "team-a",
    "Zulu",
  ]);
  expect(p.reviewRequests[0]?.login).toBe("Zulu");
});
test("最新コメントより後のコミットを検出する", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  expect(facts(p).after).toBe("あり");
  expect(facts(p).commentAt).toBe("2026-10-09T09:00:00Z");
});
test("レビュー本文より新しいスレッド返信を最新コメントとして扱う", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T11:00:00Z",
          state: "SUBMITTED",
        },
      ]),
    },
  ];
  expect(facts(p).after).toBe("なし");
});
test("コメントを下書きした時刻ではなく公開した時刻で比較する", () => {
  const p = pr();
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T08:00:00Z",
          state: "SUBMITTED",
          pullRequestReview: { submittedAt: "2026-10-09T11:00:00Z" },
        },
      ]),
    },
  ];
  expect(facts(p).after).toBe("なし");
});
test("PR 作者の返信・Bot のコメント・未公開の下書きは比較対象に含めない", () => {
  const p = pr();
  p.detail.comments.nodes = [
    {
      author: { login: "author", __typename: "User" },
      createdAt: "2026-10-09T12:00:00Z",
    },
    {
      author: { login: "review-bot", __typename: "Bot" },
      createdAt: "2026-10-09T12:00:00Z",
    },
  ];
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T12:00:00Z",
          state: "PENDING",
        },
      ]),
    },
  ];
  expect(facts(p).after).toBe("コメントなし");
});
test("HEAD の日時が古くてもコメント後のコミットが他にあれば検出する", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.commits.nodes.push({
    commit: {
      committedDate: "2026-10-09T08:00:00Z",
      parents: { totalCount: 1 },
    },
  });
  expect(facts(p).after).toBe("あり");
});
test("コメントとコミットが同時刻ならコメント後とは扱わない", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("COMMENTED", "指摘", "2026-10-09T10:00:00Z"),
  ];
  expect(facts(p).after).toBe("なし");
});
test("コメント後にマージコミットだけが増えてもチェックしない", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.commits.nodes[0].commit.committedDate = "2026-10-09T08:00:00Z";
  for (const totalCount of [2, 3]) {
    p.detail.commits.nodes.push({
      commit: {
        committedDate: "2026-10-09T11:00:00Z",
        parents: { totalCount },
      },
    });
  }
  expect(facts(p).after).toBe("なし");
  expect(facts(p).commitAt).toBe("2026-10-09T08:00:00Z");
});
test("親がゼロまたは一つのコミットは比較対象に含める", () => {
  for (const totalCount of [0, 1]) {
    const p = pr();
    p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
    p.detail.commits.nodes[0].commit.parents.totalCount = totalCount;
    expect(facts(p).after).toBe("あり");
  }
});
test("取得範囲内がすべてマージコミットで履歴に続きがあれば不明とする", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.commits.nodes[0].commit.parents.totalCount = 2;
  expect(facts(p).after).toBe("なし");
  expect(facts(p).commitAt).toBeNull();
  p.detail.commits.pageInfo.hasPreviousPage = true;
  expect(facts(p).after).toBe("不明");
});
test("未取得または取得範囲が不完全な情報を断定しない", () => {
  const p = pr();
  p.detail.reviews.pageInfo.hasPreviousPage = true;
  expect(facts(p).approved).toBeNull();
  expect(facts(p).after).toBe("不明");
  expect(facts({ ...p, detail: undefined }).reviewers).toBeNull();
});
test("PR 番号に関係なく親を先に並べ、独立した stack を分ける", () => {
  const parent = pr(4, "main", "parent");
  const child = pr(3, "parent", "child");
  const other = pr(51);
  expect(
    mergeOrder([child, other, parent], "author", "main").map((p) => p.number),
  ).toEqual([4, 3, 51]);
});
test("main から release へのリリース PR を main 宛 PR の親にしない", () => {
  const release = pr(38, "release", "main");
  release.author.login = "another-author";
  expect(
    mergeOrder([pr(), release], "author", "main").map((p) => p.number),
  ).toEqual([1]);
});
test("他の作者の親 PR は含めるが fork の同名ブランチは親にしない", () => {
  const parent = pr(2, "main", "parent");
  parent.author.login = "another-author";
  expect(
    mergeOrder([pr(1, "parent"), parent], "author", "main").map(
      (p) => p.number,
    ),
  ).toEqual([2, 1]);
  parent.isCrossRepository = true;
  expect(
    mergeOrder([pr(1, "parent"), parent], "author", "main").map(
      (p) => p.number,
    ),
  ).toEqual([1]);
});
test("stack が循環していたら merge 順を捏造せずエラーにする", () => {
  expect(() =>
    mergeOrder([pr(1, "b", "a"), pr(2, "a", "b")], "author", "main"),
  ).toThrow(/Stack cycle/);
});
test("main 宛と Approved を別々のチェックで表示する", () => {
  const root = pr(1);
  const child = pr(2, "feature", "child");
  root.detail.reviews.nodes = [review("APPROVED")];
  child.detail.reviews.nodes = [review("APPROVED")];
  const output = render([child, root], "author", target);
  const rows = output.split("\n").filter((line) => /^#\d+\s/.test(line));
  expect(rows[0]?.match(/✓/g)).toHaveLength(2);
  expect(rows[1]?.match(/✓/g)).toHaveLength(1);
  expect(output).not.toContain("main宛・Approved:");
});
test("指定した作者を大文字小文字に関係なく選び、他の作者は親だけを含める", () => {
  const parent = pr(2, "main", "parent");
  const child = pr(1, "parent", "child");
  child.author.login = "contributor";
  expect(
    mergeOrder([pr(3), child, parent], "Contributor", "main").map(
      (p) => p.number,
    ),
  ).toEqual([2, 1]);
  expect(mergeOrder([parent], "contributor", "main")).toEqual([]);
});
test("指定した作者をヘッダーに表示し、他の作者の親 PR は明示する", () => {
  const parent = pr(2, "main", "parent");
  const child = pr(1, "parent", "child");
  child.author.login = "contributor";
  const root = pr(3, "main", "root");
  root.author.login = "contributor";
  parent.detail.reviews.nodes = [review("APPROVED")];
  root.detail.reviews.nodes = [review("APPROVED")];
  const output = render([child, parent, root, pr(4)], "Contributor", target);
  expect(output.split("\n")[0]).toBe("org/repo / Contributor");
  expect(output.match(/\[parent\]/g)).toHaveLength(2);
  expect(output).not.toContain("#4");
});
test("分岐と階層をツリー表示し、一覧も同じ順序で件名を全文表示する", () => {
  const parent = pr(4, "main", "parent");
  parent.title = "親の件名";
  const child = pr(3, "parent", "child");
  child.title = "子の件名";
  const sibling = pr(5, "parent", "sibling");
  sibling.title = "兄弟の件名";
  const leaf = pr(6, "child", "leaf");
  leaf.title = "孫の件名";
  const other = pr(51, "main", "other");
  other.title =
    "端末幅が狭くても絶対に省略しないとても長い日本語と English の件名".repeat(
      3,
    );
  const output = render(
    [other, leaf, child, sibling, parent],
    "author",
    target,
  );
  const [tree, list] = output.split("\nPRs\n");
  expect(tree?.trimEnd()).toBe(
    [
      "org/repo / author",
      "",
      "Stack",
      "",
      "main",
      "├─ #4 親の件名",
      "│  ├─ #3 子の件名",
      "│  │  └─ #6 孫の件名",
      "│  └─ #5 兄弟の件名",
      "└─ #51 " + other.title,
    ].join("\n"),
  );
  expect(list).toBeDefined();
  expect(list).toContain(other.title);
  expect(output).not.toContain("…");
  expect(output).not.toContain("宛先");
  expect(
    list
      ?.split("\n")
      .filter((line) => /^#\d+\s/.test(line))
      .map((line) => line.match(/#\d+/)?.[0]),
  ).toEqual(["#4", "#3", "#6", "#5", "#51"]);
});
test("対象 PR がなければ空のツリーと一覧を安全に表示する", () => {
  const output = render([], "author", target);
  expect(output).toContain("No open PRs");
  expect(output).toContain("\nPRs\n");
});
test("相対時間を m・h・d で表示し、単位の境界を切り替える", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  for (const [minutes, expected] of [
    [0, "0m"],
    [1, "1m"],
    [59, "59m"],
    [60, "1h"],
    [1439, "23h"],
    [1440, "1d"],
    [2880, "2d"],
    [-60, "-1h"],
  ] as const) {
    expect(
      relativeTime(new Date(now - minutes * 60_000).toISOString(), now),
    ).toBe(expected);
  }
  expect(relativeTime(null, now)).toBe("-");
  expect(relativeTime("invalid", now)).toBe("?");
});
test("Approve とコメント後のコミットはチェック・ハイフン・取得不明で表示する", () => {
  const checked = pr(1);
  checked.detail.reviews.nodes = [review("APPROVED", "指摘")];
  const unchecked = pr(2);
  unchecked.detail.reviews.nodes = [
    review("COMMENTED", "指摘", "2026-10-09T11:00:00Z"),
  ];
  const noComments = pr(3);
  const unknown: PR = { ...pr(4), detail: undefined };
  const output = render(
    [checked, unchecked, noComments, unknown],
    "author",
    target,
    [],
    Date.parse("2026-10-09T12:00:00Z"),
  );
  const rows = output.split("\n").filter((line) => /^#\d+\s/.test(line));
  expect(output).toMatch(
    /PR\s+Title\s+main\s+Conflict\s+Approved\s+Fixed\s+Commit\s+Comment\s+Reviewer/,
  );
  expect(output).not.toMatch(/^順\s/m);
  expect(output).not.toContain("コメント後commit");
  expect(rows[0]?.match(/✓/g)).toHaveLength(3);
  expect(rows[0]).toContain("3h");
  expect(rows[0]).toContain("2h");
  expect(rows[0]).not.toMatch(/ago|時間前|日前|分前/);
  expect(output.trimEnd().split("\n").at(-1)).toBe(rows.at(-1));
  expect(rows[1]?.match(/✓/g)).toHaveLength(1);
  expect(rows[2]?.match(/✓/g)).toHaveLength(1);
  expect(rows[1]).not.toMatch(/あり|なし/);
  expect(rows[2]).not.toMatch(/あり|なし/);
  expect(rows[3]?.match(/\?/g)).toHaveLength(3);
  expect(rows[1]).toMatch(/-\s+-\s+2h\s+1h/);
  expect(rows[2]).toMatch(/-\s+-\s+2h\s+-/);
});
test("時間の列を桁数に関係なく右詰めする", () => {
  const first = pr(1);
  first.title = "First";
  first.detail.reviews.nodes = [
    review("COMMENTED", "指摘", "2026-09-29T12:00:00Z"),
  ];
  first.detail.commits.nodes[0].commit.committedDate = "2026-10-09T02:00:00Z";
  const second = pr(2);
  second.title = "Second";
  second.detail.reviews.nodes = [
    review("COMMENTED", "指摘", "2026-10-09T11:51:00Z"),
  ];
  second.detail.commits.nodes[0].commit.committedDate = "2026-10-09T11:59:00Z";
  const output = render(
    [first, second],
    "author",
    target,
    [],
    Date.parse("2026-10-09T12:00:00Z"),
  );
  const [header = "", row1 = "", row2 = ""] = output
    .split("\n")
    .filter((line) => /^(?:PR\s|#\d+\s)/.test(line));
  expect(row1.indexOf("10d") + 3).toBe(header.indexOf("Comment") + 7);
  expect(row2.indexOf("9m") + 2).toBe(header.indexOf("Comment") + 7);
  expect(row1.indexOf("10h") + 3).toBe(header.indexOf("Commit") + 6);
  expect(row2.indexOf("1m") + 2).toBe(header.indexOf("Commit") + 6);
});
test("main・Conflict・Approved・Fixed の値を各列の右端に揃える", () => {
  const checked = pr(1);
  checked.title = "Checked";
  checked.detail.reviews.nodes = [review("APPROVED", "指摘")];
  const unchecked = pr(2, "feature", "child");
  unchecked.title = "Unchecked";
  const unknown: PR = {
    ...pr(3, "main", "unknown"),
    title: "Unknown",
    detail: undefined,
  };
  const output = render([checked, unchecked, unknown], "author", target);
  const [header = "", ...rows] = output
    .split("\n")
    .filter((line) => /^(?:PR\s|#\d+\s)/.test(line));
  const columns = ["main", "Conflict", "Approved", "Fixed"].map(
    (label) => header.indexOf(label) + label.length - 1,
  );
  expect(columns.map((column) => rows[0]?.[column])).toEqual([
    "✓",
    "-",
    "✓",
    "✓",
  ]);
  expect(columns.map((column) => rows[1]?.[column])).toEqual([
    "-",
    "-",
    "-",
    "-",
  ]);
  expect(columns.map((column) => rows[2]?.[column])).toEqual([
    "✓",
    "?",
    "?",
    "?",
  ]);
});
test("PR タイトル以外は英語で表示し、表の下に摘要を出さない", () => {
  const parent = pr(1, "main", "parent");
  parent.title = "親のタイトル";
  parent.author.login = "contributor";
  const child = pr(2, "parent", "child");
  child.title = "子のタイトル";
  const reviewed = pr(3);
  reviewed.title = "レビュー済みのタイトル";
  reviewed.detail.reviews.nodes = [review("COMMENTED")];
  const unknown: PR = { ...pr(4), title: "不明のタイトル", detail: undefined };
  const output = render([child, parent, reviewed, unknown], "author", target);
  expect(output).toContain("[parent] 親のタイトル");
  expect(output).not.toContain("Not requested");
  expect(output).toContain("reviewer");
  expect(output).not.toContain("Reviewed");
  expect(output).toContain("Unknown");
  const withoutTitles = [parent, child, reviewed, unknown].reduce(
    (text, p) => text.replaceAll(p.title, ""),
    output,
  );
  expect(withoutTitles).not.toMatch(/[^\u0020-\u007E\n✓├─└│]/u);
  expect(output.trimEnd().split("\n").at(-1)).toMatch(/^#4\s/);
  expect(render([], "author", target, ["Fetch failed"])).toMatch(
    /\nWarning: Fetch failed$/,
  );
});
test("対応ターミナルだけ色付けし、パイプ出力と NO_COLOR では色を付けない", () => {
  const script = fileURLToPath(new URL("./index.mts", import.meta.url));
  const missing = pr(3);
  missing.detail.commits.nodes = [];
  const approved = pr(4, "main", "approved");
  approved.detail.reviews.nodes = [review("APPROVED")];
  const child = pr(5, "approved", "child");
  child.detail.reviews.nodes = [review("APPROVED")];
  const conflicting = pr(6, "main", "conflicting");
  conflicting.detail.reviews.nodes = [review("APPROVED")];
  conflicting.detail.mergeable = "CONFLICTING";
  const calculating = pr(7, "main", "calculating");
  calculating.detail.reviews.nodes = [review("APPROVED")];
  calculating.detail.mergeable = "UNKNOWN";
  const prs: PR[] = [
    pr(),
    { ...pr(2), detail: undefined },
    missing,
    approved,
    child,
    conflicting,
    calculating,
  ];
  const now = Date.parse("2026-10-09T12:00:00Z");
  const plain = render(prs, "author", target, [], now);
  for (const [isTTY, forceColor, noColor, colored] of [
    [true, "1", undefined, true],
    [false, "1", undefined, false],
    [true, undefined, "1", false],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { WriteStream } from "node:tty";
import { render } from ${JSON.stringify(script)};
process.stdout.isTTY = ${isTTY};
process.stdout.getColorDepth = WriteStream.prototype.getColorDepth;
process.stdout.write(render(${JSON.stringify(prs)}, "author", ${JSON.stringify(target)}, [], ${now}));`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          FORCE_COLOR: forceColor,
          NO_COLOR: noColor,
          NODE_DISABLE_COLORS: undefined,
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.includes("\u001B[")).toBe(colored);
    expect(result.stdout.includes("\u001B]8;;")).toBe(isTTY);
    expect(stripVTControlCharacters(result.stdout)).toBe(plain);
    if (isTTY) {
      for (const p of prs) {
        const link =
          "\u001B]8;;https://github.com/org/repo/pull/" +
          p.number +
          "\u001B\\#" +
          p.number +
          "\u001B]8;;\u001B\\";
        expect(result.stdout.split(link)).toHaveLength(3);
      }
    }
    if (colored) {
      expect(result.stdout).toContain("\u001B[32m");
      expect(result.stdout).toContain("\u001B[2m");
      expect(result.stdout).toContain("\u001B[33m");
      expect(result.stdout).toContain("\u001B[1mStack\u001B[22m\n\nmain\n");
      expect(result.stdout).toContain("\u001B[1mPRs\u001B[22m");
      expect(result.stdout).toContain("\u001B[1m\u001B[2mPR ");
      expect(result.stdout).toContain(
        "\u001B]8;;\u001B\\ \u001B[2mテスト\u001B[22m",
      );
      const firstRow = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).startsWith("#1 "));
      expect(firstRow).toContain("テスト");
      expect(firstRow).not.toContain("\u001B[2mテスト");
      const row = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).startsWith("#3 "));
      expect(row).toContain("\u001B[2m      -\u001B[22m");
      expect(row).toContain("\u001B[2m     -\u001B[22m");
      expect(row).toContain("\u001B[2m-\u001B[22m");
      const highlighted = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).startsWith("#4 "));
      expect(highlighted?.split("\u001B[92m")).toHaveLength(3);
      expect(highlighted).toContain("\u001B[92mテスト");
      for (const number of [1, 2, 3, 5, 6, 7]) {
        const normal = result.stdout
          .split("\n")
          .find((line) =>
            stripVTControlCharacters(line).startsWith("#" + number + " "),
          );
        expect(normal).toBeDefined();
        expect(normal).not.toContain("\u001B[92m");
      }
      const conflictRow = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).startsWith("#6 "));
      expect(conflictRow).toContain("\u001B[31m       ✓\u001B[39m");
      expect(conflictRow?.split("\u001B[31m")).toHaveLength(2);
    }
  }
});
test("通信中の取得対象を標準エラー出力に表示し、一覧には混ぜない", () => {
  const prs = Array.from({ length: 6 }, (_, i) =>
    pr(i + 1, "main", "feature-" + (i + 1)),
  );
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
  expect(result.calls[0]).toEqual([
    "repo",
    "view",
    "--json",
    "nameWithOwner,defaultBranchRef",
  ]);
  expect(result.calls[1]?.slice(0, 4)).toEqual([
    "pr",
    "list",
    "--repo",
    "current/repo",
  ]);
  expect(result.stdout.split("\n")[0]).toBe("current/repo / author");
  expect(result.stdout).toMatch(/PR\s+Title\s+trunk\s+Conflict/);
});
test("--repo を指定するとそのリポジトリのデフォルトブランチを使う", () => {
  const result = runMain(
    ["--repo", "other/repo", "author"],
    [],
    repoView("other/repo", "trunk"),
  );
  expect(result.status).toBe(0);
  expect(result.calls[0]).toEqual([
    "repo",
    "view",
    "other/repo",
    "--json",
    "nameWithOwner,defaultBranchRef",
  ]);
  expect(result.calls[1]?.slice(0, 4)).toEqual([
    "pr",
    "list",
    "--repo",
    "other/repo",
  ]);
  expect(result.stdout).toMatch(/PR\s+Title\s+trunk\s+Conflict/);
});
test("--trunk を指定するとデフォルトブランチより優先する", () => {
  const result = runMain(
    ["--trunk", "release", "author"],
    [],
    repoView("current/repo", "trunk"),
  );
  expect(result.status).toBe(0);
  expect(result.calls[0]?.slice(0, 3)).toEqual(["repo", "view", "--json"]);
  expect(result.stdout.split("\n")[0]).toBe("current/repo / author");
  expect(result.stdout).toMatch(/PR\s+Title\s+release\s+Conflict/);
});
test("--repo と --trunk を両方指定すると GitHub にリポジトリ情報を問い合わせない", () => {
  const result = runMain(["--repo=other/repo", "--trunk=release", "author"]);
  expect(result.status).toBe(0);
  expect(result.calls.map((args) => args[0])).toEqual(["pr"]);
  expect(result.stdout.split("\n")[0]).toBe("other/repo / author");
  expect(result.stdout).toMatch(/PR\s+Title\s+release\s+Conflict/);
});
test("カレントディレクトリからリポジトリを特定できなければ --repo を案内する", () => {
  const result = runMain(["author"], [], {
    status: 1,
    stdout: "",
    stderr: "fatal: not a git repository",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "use --repo OWNER/REPO: fatal: not a git repository",
  );
  expect(result.calls).toHaveLength(1);
});
test("デフォルトブランチを取得できなければ --trunk を案内する", () => {
  const result = runMain(["author"], [], repoView("current/repo", null));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Cannot determine the default branch of current/repo; use --trunk BRANCH",
  );
  expect(result.calls).toHaveLength(1);
});
test("リポジトリ名はクエリに埋め込まず GraphQL の変数で渡す", () => {
  const result = runMain(
    ["--repo", "other/repo", "--trunk", "main", "author"],
    [pr()],
  );
  expect(result.status).toBe(0);
  const graphql = result.calls.find((args) => args[0] === "api") ?? [];
  expect(graphql.slice(2, 6)).toEqual(["-f", "owner=other", "-f", "name=repo"]);
  expect(graphql.find((arg) => arg.startsWith("query="))).not.toContain(
    "other",
  );
});
test("宛先ブランチの列はブランチ名を見出しにし、値を見出しの右端に揃える", () => {
  const p = pr(1, "production");
  p.title = "Production";
  const output = render([p], "author", {
    repo: "org/repo",
    trunk: "production",
  });
  const [header = "", row = ""] = output
    .split("\n")
    .filter((line) => /^(?:PR\s|#\d+\s)/.test(line));
  expect(header).toMatch(/Title\s+production\s+Conflict/);
  expect(row[header.indexOf("production") + "production".length - 1]).toBe(
    "✓",
  );
});
test("複数人の Reviewer だけ先頭5文字にし、対応表を一覧の下にまとめる", () => {
  const multiple = pr(1);
  multiple.reviewRequests = [
    { login: "bravo-reviewer" },
    { login: "alpha-reviewer" },
  ];
  const single = pr(2);
  single.reviewRequests = [{ login: "single-reviewer" }];
  const repeated = pr(3);
  repeated.reviewRequests = [
    { login: "alpha-reviewer" },
    { login: "delta-reviewer" },
  ];
  const output = render([multiple, single, repeated], "author", target);
  const rows = output.split("\n").filter((line) => /^#\d+\s/.test(line));
  expect(rows[0]).toMatch(/alpha, bravo$/);
  expect(rows[1]).toMatch(/single-reviewer$/);
  expect(rows[2]).toMatch(/alpha, delta$/);
  expect(output.split("\nReviewers\n\n")[1]).toBe(
    [
      "alpha  alpha-reviewer",
      "bravo  bravo-reviewer",
      "delta  delta-reviewer",
      "",
    ].join("\n"),
  );
  expect(output.indexOf("\nReviewers\n")).toBeGreaterThan(
    output.indexOf("#3 "),
  );
});
test("1人だけの場合と5文字以下の名前だけの場合は対応表を出さない", () => {
  const single = pr(1);
  single.reviewRequests = [{ login: "single-reviewer" }];
  const short = pr(2);
  short.reviewRequests = [{ login: "beta" }, { login: "alpha" }];
  const output = render([single, short], "author", target);
  expect(output).not.toContain("\nReviewers\n");
  expect(output).toMatch(/alpha, beta\n$/);
});
test("先頭5文字が同じ Reviewer は対応表で全員を併記する", () => {
  const p = pr();
  p.reviewRequests = [{ login: "reviewer-b" }, { login: "reviewer-a" }];
  const output = render([p], "author", target);
  expect(output).toContain("revie, revie\n");
  expect(output).toContain("revie  reviewer-a, reviewer-b\n");
});
test("ユーザー名を一つ必須とし、未知のオプション・不正な名前やリポジトリは GitHub 取得前に拒否する", () => {
  const script = fileURLToPath(new URL("./index.mts", import.meta.url));
  for (const args of [
    [],
    ["--ack"],
    ["--ack", "1"],
    ["author", "contributor"],
    ["bad/name"],
    ["--repo"],
    ["--repo", "author"],
    ["--repo", "invalid", "author"],
    ["--repo", "a/b/c", "author"],
    ["--trunk", "", "author"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: "/no-gh-available" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Usage: node index.mts [--repo OWNER/REPO] [--trunk BRANCH] <GitHub username>",
    );
  }
});
test("端末制御文字と文字方向制御文字を除去する", () => {
  expect(clean("a\u001B]bad\u0007\u202Eb\n c")).toBe("a]badb c");
});
