import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { Temporal } from "temporal-polyfill-lite";
import { expect, test } from "vitest";

import { inTerminal, pr, review, target, withStdoutTTY } from "./fixtures.mts";
import { render } from "./render.mts";
import type { PR } from "./types.mts";

const withoutColors = (output: string): string =>
  // eslint-disable-next-line no-control-regex -- Remove SGR colors while retaining OSC 8 links.
  output.replaceAll(/\u001B\[[\d;]*m/g, "");

const section = (output: string, name: "Authored" | "Reviewing"): string =>
  output.split("\n" + name + "\n")[1]?.split(/\n(?:Authored|Reviewing|Reviewers)\n/)[0] ?? "";
const tablePRs = (output: string): string[] =>
  output.split("\n").flatMap((line) => line.match(/^[✓✗? ] (#\d+\*?)/)?.[1] ?? []);
const treePRs = (output: string): string[] =>
  output.split("\n").flatMap((line) => line.match(/[├└]─ (#\d+\*?) /)?.[1] ?? []);

test("作成した PR とレビューする PR を別々のツリー・表で表示し、カラムを変えない", () => {
  const ownParent = pr(4, "main", "own-parent");
  ownParent.author.login = "Author";
  const ownChild = pr(2, "own-parent", "own-child");
  const reviewParent = pr(7, "main", "review-parent");
  reviewParent.author.login = "contributor";
  const requested = pr(3, "review-parent", "requested");
  requested.author.login = "contributor";
  requested.reviewRequests = [{ login: "AUTHOR" }];
  const reviewed = {
    ...pr(5, "main", "reviewed"),
    author: { login: "contributor" },
    reviewedBy: "Author",
    detail: undefined,
  };
  const unrelated = pr(99, "main", "unrelated");
  unrelated.author.login = "contributor";
  const output = render(
    [requested, ownChild, reviewed, reviewParent, ownParent, unrelated],
    "author",
    target,
  );
  const authored = section(output, "Authored");
  const reviewing = section(output, "Reviewing");
  expect(treePRs(authored)).toEqual(["#4", "#2"]);
  expect(tablePRs(authored)).toEqual(["#4", "#2"]);
  expect(treePRs(reviewing)).toEqual(["#5*", "#7*", "#3*"]);
  expect(tablePRs(reviewing)).toEqual(["#5*", "#7*", "#3*"]);
  expect(output.match(/\nStack\n/g)).toHaveLength(2);
  expect(output.match(/\nPRs\n/g)).toHaveLength(2);
  const columns = [
    "PR",
    "Title",
    "Diff",
    "main",
    "Conflict",
    "Approved",
    "Fixed",
    "Commit",
    "Comment",
    "Reviewer",
  ];
  for (const group of [authored, reviewing]) {
    const header = group.split("\n").find((line) => /^  PR\s/.test(line));
    expect(header?.trim().split(/\s+/)).toEqual(columns);
  }
  expect(output).not.toContain("#99");
});
test("両方の組に必要な親 PR はそれぞれのツリーと表に残し、無関係な子は加えない", () => {
  const parent = pr(10, "main", "parent");
  parent.author.login = "contributor";
  parent.reviewRequests = [{ login: "author" }];
  const own = pr(12, "parent", "own");
  own.reviewRequests = [{ login: "author" }];
  const requested = pr(14, "own", "requested");
  requested.author.login = "contributor";
  requested.reviewRequests = [{ login: "author" }];
  const unrelated = pr(15, "own", "unrelated");
  unrelated.author.login = "contributor";
  const output = render([requested, own, unrelated, parent], "author", target);
  const authored = section(output, "Authored");
  const reviewing = section(output, "Reviewing");
  expect(treePRs(authored)).toEqual(["#10*", "#12"]);
  expect(tablePRs(authored)).toEqual(["#10*", "#12"]);
  expect(treePRs(reviewing)).toEqual(["#10*", "#12", "#14*"]);
  expect(tablePRs(reviewing)).toEqual(["#10*", "#12", "#14*"]);
  expect(reviewing).toContain("└─ #10* テスト\n   └─ #12 テスト\n      └─ #14* テスト");
  expect(output.match(/\* PR by another author/g)).toHaveLength(1);
  expect(output).not.toContain("#15");
});
test("両方の表の略記を最後の一箇所にまとめ、同じ略記の別人もすべて載せる", () => {
  const own = pr(1, "main", "own");
  own.reviewRequests = [{ login: "review-alpha" }, { login: "helper-one" }];
  const requested = pr(2, "main", "requested");
  requested.author.login = "contributor";
  requested.reviewRequests = [{ login: "author" }, { login: "review-beta" }];
  const output = render([requested, own], "author", target, ["Example warning"]);
  expect(tablePRs(section(output, "Authored"))).toEqual(["#1"]);
  expect(tablePRs(section(output, "Reviewing"))).toEqual(["#2*"]);
  expect(output.match(/\nReviewers\n/g)).toHaveLength(1);
  expect(output.split("\nReviewers\n\n")[1]).toBe(
    [
      "autho  author",
      "helpe  helper-one",
      "revie  review-alpha, review-beta",
      "",
      "Warning: Example warning",
    ].join("\n"),
  );
  expect(output.indexOf("\nReviewers\n")).toBeGreaterThan(output.indexOf("  #2* "));
  const terminal = inTerminal(
    new URL("./render.mts", import.meta.url),
    `m.render(${JSON.stringify([requested, own])}, "author", ${JSON.stringify(target)}, ["Example warning"])`,
  );
  expect(stripVTControlCharacters(terminal)).toBe(output);
  expect(terminal).toContain(
    "\u001B[32m\u001B]8;;https://github.com/author\u001B\\autho\u001B]8;;\u001B\\\u001B[39m",
  );
});
test.each(["Authored", "Reviewing"] as const)(
  "%s だけの場合は対象のない組の表を増やさない",
  (name) => {
    const p = pr();
    if (name === "Reviewing") {
      p.author.login = "contributor";
      p.reviewRequests = [{ login: "author" }];
    }
    const output = render([p], "author", target);
    expect(output).toContain("\n" + name + "\n");
    expect(output).not.toContain("\n" + (name === "Authored" ? "Reviewing" : "Authored") + "\n");
    expect(output.match(/\nStack\n/g)).toHaveLength(1);
    expect(output.match(/\nPRs\n/g)).toHaveLength(1);
    expect(output).not.toContain("No open PRs");
  },
);
test("デフォルトが develop でも main・hotfix 宛の PR と stack を両方の組に表示する", () => {
  const ownMain = pr(1, "main", "own-hotfix");
  const reviewingMain = pr(2, "main", "review-hotfix");
  reviewingMain.author.login = "contributor";
  reviewingMain.reviewRequests = [{ login: "author" }];
  const ownDefault = pr(3, "develop", "own-default");
  const reviewingDefault = pr(4, "develop", "review-default");
  reviewingDefault.author.login = "contributor";
  reviewingDefault.reviewedBy = "author";
  const ownChild = pr(5, "own-hotfix", "own-child");
  const reviewingChild = pr(6, "review-hotfix", "review-child");
  reviewingChild.author.login = "contributor";
  reviewingChild.reviewRequests = [{ login: "author" }];
  const ownHotfix = pr(7, "hotfix", "own-patch");
  const reviewingHotfix = pr(8, "hotfix", "review-patch");
  reviewingHotfix.author.login = "contributor";
  reviewingHotfix.reviewRequests = [{ login: "author" }];
  const output = render(
    [
      ownMain,
      reviewingMain,
      ownDefault,
      reviewingDefault,
      ownChild,
      reviewingChild,
      ownHotfix,
      reviewingHotfix,
    ],
    "author",
    { ...target, trunk: "develop" },
  );
  const authored = section(output, "Authored");
  const reviewing = section(output, "Reviewing");
  expect(treePRs(authored)).toEqual(["#1", "#5", "#3", "#7"]);
  expect(tablePRs(authored)).toEqual(["#1", "#5", "#3", "#7"]);
  expect(treePRs(reviewing)).toEqual(["#2*", "#6*", "#4*", "#8*"]);
  expect(tablePRs(reviewing)).toEqual(["#2*", "#6*", "#4*", "#8*"]);
  expect(authored).toContain("\nmain\n└─ #1 テスト\n   └─ #5 テスト");
  expect(reviewing).toContain("\nmain\n└─ #2* テスト\n   └─ #6* テスト");
  for (const group of [authored, reviewing]) {
    expect(group).toContain("\ndevelop\n");
    expect(group).toContain("\nhotfix\n");
    expect(group).toMatch(/Title\s+Diff\s+develop\s+Conflict/);
  }
});

test("見出しなしのチェック結果・PR・Title の順で、成功・失敗・待機・なし・不明を表示する", () => {
  const prs: PR[] = ["SUCCESS", "FAILURE", "PENDING", null].map((state, index) => {
    const p = pr(index + 1);
    p.title = "Example";
    p.detail.headCommit = {
      nodes: [{ commit: { statusCheckRollup: state === null ? null : { state } } }],
    };
    return p;
  });
  prs.push({ ...pr(5), title: "Unknown", detail: undefined });
  const output = withStdoutTTY(false, () => render(prs, "author", target));
  const list = output.split("\nPRs\n")[1]?.trimEnd().split("\n").slice(1) ?? [];
  expect(list[0]).toMatch(/^  PR\s+Title\s+Diff\s+main\s+Conflict/);
  expect(list.slice(1).map((line) => line.slice(0, 4))).toEqual([
    "✓ #1",
    "✗ #2",
    "? #3",
    "  #4",
    "? #5",
  ]);
  expect(list[0]?.indexOf("PR")).toBe(2);
  expect(list[0]?.indexOf("Title")).toBe(list[1]?.indexOf("Example"));
  expect(output).not.toContain("Checks");
  expect(output).toContain("├─ #1 Example");
  expect(output).not.toContain("├─ ✓");

  const terminal = inTerminal(
    new URL("./render.mts", import.meta.url),
    `m.render(${JSON.stringify(prs)}, "author", ${JSON.stringify(target)})`,
  );
  expect(terminal).toContain("\u001B[32m✓\u001B[39m ");
  expect(terminal).toContain("\u001B[31m✗\u001B[39m ");
  expect(terminal).toContain("\u001B[33m?\u001B[39m ");
  expect(terminal).toContain("\n  \u001B]8;;https://github.com/org/repo/pull/4");
  expect(stripVTControlCharacters(terminal)).toBe(output);
});

test("main 宛と Approved を別々のチェックで表示する", () => {
  const root = pr(1);
  const child = pr(2, "feature", "child");
  root.detail.reviews.nodes = [review("APPROVED")];
  child.detail.reviews.nodes = [review("APPROVED")];
  const output = render([child, root], "author", target);
  const rows = output.split("\n").filter((line) => /^[✓✗? ] #\d+\s/.test(line));
  expect(rows[0]?.match(/✓/g)).toHaveLength(2);
  expect(rows[1]?.match(/✓/g)).toHaveLength(1);
  expect(output).not.toContain("main宛・Approved:");
});
test("他の作者の親 PR だけ番号に印を付け、タイトルと作者名を混ぜない", () => {
  const ancestor = pr(5, "main", "ancestor");
  ancestor.author.login = "another-author";
  const parent = pr(2, "ancestor", "parent");
  parent.author.login = "other-author";
  const child = pr(1, "parent", "child");
  child.author.login = "contributor";
  const root = pr(3, "main", "root");
  root.author.login = "contributor";
  parent.detail.reviews.nodes = [review("APPROVED")];
  root.detail.reviews.nodes = [review("APPROVED")];
  const output = render([child, parent, ancestor, root, pr(4)], "Contributor", target);
  expect(output.split("\n")[0]).toBe("org/repo / Contributor");
  const [tree, list] = output.split("\nPRs\n");
  expect(tree).toContain("└─ #5* テスト");
  expect(tree).toContain("   └─ #2* テスト");
  expect(tree).toContain("      └─ #1 テスト");
  const rows = list?.split("\n").filter((line) => /^[✓✗? ] #\d+\*?\s/.test(line));
  expect(rows?.find((line) => line.slice(2).startsWith("#5*"))).toMatch(/^[✓✗? ] #5\*\s+テスト/);
  expect(rows?.find((line) => line.slice(2).startsWith("#2*"))).toMatch(/^[✓✗? ] #2\*\s+テスト/);
  for (const number of [1, 3]) {
    expect(rows?.find((line) => line.slice(2).startsWith("#" + number + " "))).toMatch(
      /^[✓✗? ] #\d+\s+テスト/,
    );
  }
  expect(output.match(/#\d+\*/g)).toHaveLength(4);
  expect(output.match(/\* PR by another author/g)).toHaveLength(1);
  expect(output).not.toContain("[parent");
  expect(output).not.toContain("other-author");
  expect(output).not.toContain("another-author");
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
  other.title = "端末幅が狭くても絶対に省略しないとても長い日本語と English の件名".repeat(3);
  const output = render([other, leaf, child, sibling, parent], "author", target);
  const [tree, list] = output.split("\nPRs\n");
  expect(tree?.trimEnd()).toBe(
    [
      "org/repo / author",
      "",
      "Authored",
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
  expect(output).not.toContain("* PR by another author");
  expect(
    list
      ?.split("\n")
      .filter((line) => /^[✓✗? ] #\d+\s/.test(line))
      .map((line) => line.match(/#\d+/)?.[0]),
  ).toEqual(["#4", "#3", "#6", "#5", "#51"]);
});
test("対象 PR がなければ空のツリーと一覧を安全に表示する", () => {
  const output = render([], "author", target);
  expect(output).toContain("No open PRs");
  expect(output).toContain("\nPRs\n");
});
test("Approve とコメント後のコミットはチェック・ハイフン・取得不明で表示する", () => {
  const checked = pr(1);
  checked.detail.reviews.nodes = [review("APPROVED", "指摘")];
  const unchecked = pr(2);
  unchecked.detail.reviews.nodes = [review("COMMENTED", "指摘", "2026-10-09T11:00:00Z")];
  const noComments = pr(3);
  const unknown: PR = { ...pr(4), detail: undefined };
  const output = render(
    [checked, unchecked, noComments, unknown],
    "author",
    target,
    [],
    Temporal.Instant.from("2026-10-09T12:00:00Z"),
    "UTC",
  );
  const rows = output.split("\n").filter((line) => /^[✓✗? ] #\d+\s/.test(line));
  expect(output).toMatch(
    /PR\s+Title\s+Diff\s+main\s+Conflict\s+Approved\s+Fixed\s+Commit\s+Comment\s+Reviewer/,
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
  expect(rows[3]?.slice(2).match(/\?/g)).toHaveLength(3);
  expect(rows[1]).toMatch(/-\s+-\s+2h\s+1h/);
  expect(rows[2]).toMatch(/-\s+-\s+2h\s+-/);
});
test("時間の列を桁数に関係なく右詰めする", () => {
  const first = pr(1);
  first.title = "First";
  first.detail.reviews.nodes = [review("COMMENTED", "指摘", "2026-09-29T12:00:00Z")];
  first.detail.commits.nodes[0].commit.committedDate = "2026-10-09T02:00:00Z";
  const second = pr(2);
  second.title = "Second";
  second.detail.reviews.nodes = [review("COMMENTED", "指摘", "2026-10-09T11:51:00Z")];
  second.detail.commits.nodes[0].commit.committedDate = "2026-10-09T11:59:00Z";
  const output = render(
    [first, second],
    "author",
    target,
    [],
    Temporal.Instant.from("2026-10-09T12:00:00Z"),
    "UTC",
  );
  const [header = "", row1 = "", row2 = ""] = output
    .split("\n")
    .filter((line) => /^(?:  PR\s|[✓✗? ] #\d+\s)/.test(line));
  expect(row1.indexOf("10d") + 3).toBe(header.indexOf("Comment") + 7);
  expect(row2.indexOf("9m") + 2).toBe(header.indexOf("Comment") + 7);
  expect(row1.indexOf("10h") + 3).toBe(header.indexOf("Commit") + 6);
  expect(row2.indexOf("1m") + 2).toBe(header.indexOf("Commit") + 6);
});
test("追加行数と削除行数をそれぞれ右詰めする", () => {
  const large = pr(1);
  large.additions = 2014;
  large.deletions = 3205;
  const small = pr(2);
  small.additions = 65;
  small.deletions = 2;
  const rows = render([large, small], "author", target)
    .split("\n")
    .filter((line) => /^[✓✗? ] #\d+\s/.test(line));
  expect(rows[0]).toContain("+2014 -3205");
  expect(rows[1]).toContain("  +65    -2");
});
test("main・Conflict・Approved・Fixed の値を各列の右端に揃える", () => {
  const checked = pr(1);
  checked.author.login = "other-author";
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
    .filter((line) => /^(?:  PR\s|[✓✗? ] #\d+\*?\s)/.test(line));
  const columns = ["main", "Conflict", "Approved", "Fixed"].map(
    (label) => header.indexOf(label) + label.length - 1,
  );
  expect(columns.map((column) => rows[0]?.[column])).toEqual(["✓", "-", "✓", "✓"]);
  expect(columns.map((column) => rows[1]?.[column])).toEqual(["-", "-", "-", "-"]);
  expect(columns.map((column) => rows[2]?.[column])).toEqual(["✓", "?", "?", "?"]);
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
  expect(output).toContain("#1* 親のタイトル");
  expect(output).not.toContain("Not requested");
  expect(output).toContain("reviewer");
  expect(output).not.toContain("Reviewed");
  expect(output).toContain("Unknown");
  const withoutTitles = [parent, child, reviewed, unknown].reduce(
    (text, p) => text.replaceAll(p.title, ""),
    output,
  );
  expect(withoutTitles).not.toMatch(/[^\u0020-\u007E\n✓├─└│]/u);
  expect(output.trimEnd().split("\n").at(-1)).toMatch(/^\? #4\s/);
  expect(render([], "author", target, ["Fetch failed"])).toMatch(/\nWarning: Fetch failed$/);
});
test.each([
  {
    label: "指定した作者・Ready",
    login: "Author",
    isDraft: false,
    listTitle: "\u001B[92mParent title\u001B[39m",
  },
  {
    label: "指定した作者・Draft",
    login: "Author",
    isDraft: true,
    listTitle: "\u001B[2mParent title\u001B[22m",
  },
  {
    label: "他の作者・Ready",
    login: "other-author",
    isDraft: false,
    listTitle: "\u001B]8;;https://github.com/org/repo/pull/1\u001B\\Parent title\u001B]8;;\u001B\\",
  },
  {
    label: "他の作者・Draft",
    login: "other-author",
    isDraft: true,
    listTitle: "\u001B[2mParent title\u001B[22m",
  },
])(
  "スタックツリーのタイトルは作者・状態によらず薄色（$label）",
  ({ login, isDraft, listTitle }) => {
    const parent = pr(1, "main", "parent");
    parent.title = "Parent title";
    parent.author.login = login;
    parent.isDraft = isDraft;
    parent.detail.reviews.nodes = [review("APPROVED")];
    const child = pr(2, "parent", "child");
    child.title = "Child title";
    const output = inTerminal(
      new URL("./render.mts", import.meta.url),
      `m.render(${JSON.stringify([parent, child])}, "author", ${JSON.stringify(target)})`,
    );
    const lines = output.split("\n");
    const treeLine = lines.find((line) => stripVTControlCharacters(line).includes("─ #1"));
    const listLine = lines.find((line) => stripVTControlCharacters(line).slice(2).startsWith("#1"));
    expect(treeLine).toContain("\u001B[2mParent title\u001B[22m");
    expect(treeLine).not.toContain("\u001B[92m");
    expect(listLine).toContain(listTitle);
  },
);
test("ツリーと一覧の PR タイトルを番号と同じ PR へのリンクにし、空白で列を揃える", () => {
  const parent = pr(21, "main", "parent");
  parent.title = "  短い\n\t件名\u0007  ";
  const child = pr(22, "parent", "child");
  child.title = "省略しない長い日本語と English の件名".repeat(3);
  const prs = [child, parent];
  const destination = { ...target, repo: "example/project" };
  const now = Temporal.Instant.from("2026-10-09T12:00:00Z");
  const plain = withStdoutTTY(false, () => render(prs, "author", destination, [], now, "UTC"));
  const output = withStdoutTTY(true, () => render(prs, "author", destination, [], now, "UTC"));
  const [tree, list] = withoutColors(output).split("\nPRs\n");
  for (const [number, title] of [
    [21, "短い 件名"],
    [22, child.title],
  ] as const) {
    const start = "\u001B]8;;https://github.com/example/project/pull/" + number + "\u001B\\";
    const end = "\u001B]8;;\u001B\\";
    for (const view of [tree, list]) {
      expect(view?.split(start + "#" + number + end)).toHaveLength(2);
      expect(view?.split(start + title + end)).toHaveLength(2);
    }
  }
  expect(stripVTControlCharacters(output)).toBe(plain);
  expect(plain).not.toContain("\u001B");
});
test("対応ターミナルだけ色付けし、パイプ出力と NO_COLOR では色を付けない", () => {
  const script = fileURLToPath(new URL("./render.mts", import.meta.url));
  const draft = pr();
  draft.isDraft = true;
  draft.reviewRequests = [{ login: "Author" }];
  const missing = pr(3);
  missing.detail.commits.nodes = [];
  const approved = pr(4, "main", "approved");
  approved.author.login = "other-author";
  approved.detail.reviews.nodes = [review("APPROVED")];
  const child = pr(5, "approved", "child");
  child.detail.reviews.nodes = [review("APPROVED")];
  child.reviewRequests = [{ login: "Author" }, { login: "other-reviewer" }];
  const conflicting = pr(6, "main", "conflicting");
  conflicting.detail.reviews.nodes = [review("APPROVED")];
  conflicting.detail.mergeable = "CONFLICTING";
  const calculating = pr(7, "main", "calculating");
  calculating.detail.reviews.nodes = [review("APPROVED")];
  calculating.detail.mergeable = "UNKNOWN";
  const otherDraft = pr(8, "main", "other-draft");
  otherDraft.author.login = "other-author";
  otherDraft.isDraft = true;
  otherDraft.detail.reviews.nodes = [review("APPROVED")];
  const draftChild = pr(9, "other-draft", "draft-child");
  const ownApproved = pr(10, "main", "own-approved");
  ownApproved.author.login = "Author";
  ownApproved.detail.reviews.nodes = [review("APPROVED")];
  const prs: PR[] = [
    draft,
    { ...pr(2), detail: undefined },
    missing,
    approved,
    child,
    conflicting,
    calculating,
    otherDraft,
    draftChild,
    ownApproved,
  ];
  const now = Temporal.Instant.from("2026-10-09T12:00:00Z");
  const plain = render(prs, "author", target, [], now, "UTC");
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
import { Temporal } from "temporal-polyfill-lite";
import { render } from ${JSON.stringify(script)};
process.stdout.isTTY = ${isTTY};
process.stdout.getColorDepth = WriteStream.prototype.getColorDepth;
process.stdout.write(render(${JSON.stringify(prs)}, "author", ${JSON.stringify(target)}, [], Temporal.Instant.from(${JSON.stringify(now.toString())}), "UTC"));`,
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
        const titleLink =
          "\u001B]8;;https://github.com/org/repo/pull/" +
          p.number +
          "\u001B\\" +
          p.title +
          "\u001B]8;;\u001B\\";
        expect(withoutColors(result.stdout).split(titleLink)).toHaveLength(3);
      }
    }
    if (colored) {
      const treeLines = result.stdout
        .split("\n")
        .filter((line) => /[├└]─ #\d/.test(stripVTControlCharacters(line)));
      expect(treeLines).toHaveLength(prs.length);
      for (const treeLine of treeLines) {
        expect(treeLine).toContain("\u001B[2mテスト\u001B[22m");
        expect(treeLine).not.toContain("\u001B[92m");
      }
      expect(result.stdout).toContain("\u001B[32m");
      expect(result.stdout).toContain("\u001B[2m");
      expect(result.stdout).toContain("\u001B[33m");
      expect(result.stdout).toContain("\u001B[1mStack\u001B[22m\n\nmain\n");
      expect(result.stdout).toContain("\u001B[1mPRs\u001B[22m");
      expect(result.stdout).toContain("\u001B[1m\u001B[2m  PR ");
      expect(result.stdout).toContain(
        "\u001B]8;;https://github.com/org/repo/pull/1\u001B\\\u001B[2mテスト\u001B[22m\u001B]8;;\u001B\\",
      );
      const firstRow = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).slice(2).startsWith("#1 "));
      expect(firstRow).toContain("テスト");
      expect(firstRow).toContain("\u001B[2mテスト");
      expect(firstRow).toContain("\u001B[32m+123\u001B[39m \u001B[31m-456\u001B[39m");
      const row = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).slice(2).startsWith("#3 "));
      expect(row).toContain("\u001B[2m      -\u001B[22m");
      expect(row).toContain("\u001B[2m     -\u001B[22m");
      expect(row).toContain("\u001B[2m-\u001B[22m");
      const highlighted = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).slice(2).startsWith("#10 "));
      expect(highlighted?.split("\u001B[92m")).toHaveLength(3);
      expect(highlighted).toContain("\u001B[92mテスト");
      const otherReadyRow = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).slice(2).startsWith("#4*"));
      const otherDraftRow = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).slice(2).startsWith("#8*"));
      for (const otherRow of [otherReadyRow, otherDraftRow]) {
        expect(otherRow).toBeDefined();
        expect(otherRow).not.toContain("\u001B[92m");
        expect(otherRow).toContain("\u001B[32m*\u001B[39m");
      }
      expect(otherReadyRow).not.toContain("\u001B[2mテスト");
      expect(otherDraftRow).toContain("\u001B[2mテスト");
      const otherReadyTree = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).includes("─ #4* "));
      const otherDraftTree = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).includes("─ #8* "));
      expect(otherReadyTree).toContain(
        "\u001B[32m*\u001B[39m \u001B]8;;https://github.com/org/repo/pull/4\u001B\\\u001B[2mテスト\u001B[22m\u001B]8;;\u001B\\",
      );
      expect(otherReadyTree).not.toContain("\u001B[92m");
      expect(otherDraftTree).toContain(
        "\u001B[32m*\u001B[39m \u001B]8;;https://github.com/org/repo/pull/8\u001B\\\u001B[2mテスト\u001B[22m\u001B]8;;\u001B\\",
      );
      expect(result.stdout).toContain("\u001B[32m*\u001B[39m PR by another author");
      for (const number of [1, 2, 3, 5, 6, 7, 9]) {
        const normal = result.stdout.split("\n").find((line) =>
          stripVTControlCharacters(line)
            .slice(2)
            .startsWith("#" + number + " "),
        );
        expect(normal).toBeDefined();
        expect(normal).not.toContain("\u001B[92m");
      }
      const conflictRow = result.stdout
        .split("\n")
        .find((line) => stripVTControlCharacters(line).slice(2).startsWith("#6 "));
      expect(conflictRow).toContain("\u001B[31m       ✓\u001B[39m");
      expect(conflictRow?.split("\u001B[31m")).toHaveLength(3);
    }
  }
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
    .filter((line) => /^(?:  PR\s|[✓✗? ] #\d+\s)/.test(line));
  expect(header).toMatch(/Title\s+Diff\s+production\s+Conflict/);
  expect(row[header.indexOf("production") + "production".length - 1]).toBe("✓");
});
test("複数人の Reviewer だけ先頭5文字にし、対応表を一覧の下にまとめる", () => {
  const multiple = pr(1);
  multiple.reviewRequests = [{ login: "bravo-reviewer" }, { login: "alpha-reviewer" }];
  const single = pr(2);
  single.reviewRequests = [{ login: "single-reviewer" }];
  const repeated = pr(3);
  repeated.reviewRequests = [{ login: "alpha-reviewer" }, { login: "delta-reviewer" }];
  const output = render([multiple, single, repeated], "author", target);
  const rows = output.split("\n").filter((line) => /^[✓✗? ] #\d+\s/.test(line));
  expect(rows[0]).toMatch(/alpha, bravo$/);
  expect(rows[1]).toMatch(/single-reviewer$/);
  expect(rows[2]).toMatch(/alpha, delta$/);
  expect(output.split("\nReviewers\n\n")[1]).toBe(
    ["alpha  alpha-reviewer", "bravo  bravo-reviewer", "delta  delta-reviewer", ""].join("\n"),
  );
  expect(output.indexOf("\nReviewers\n")).toBeGreaterThan(output.indexOf("  #3 "));
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
test.each([
  { multiple: false, submitted: false, label: "Reviewer-alpha" },
  { multiple: true, submitted: false, label: "Revie" },
  { multiple: true, submitted: true, label: "Revie" },
])(
  "Reviewer 列の指定ユーザーだけ既存の緑色にする（複数: $multiple、投稿済み: $submitted）",
  ({ multiple, submitted, label }) => {
    const p = pr();
    const login = "Reviewer-alpha";
    p.reviewRequests = submitted ? [] : [{ login }];
    if (submitted) {
      p.detail.reviews.nodes = [review("APPROVED", "", undefined, login)];
    }
    if (multiple) {
      p.reviewRequests.push({ login: "Reviewer-beta" });
    }
    const output = inTerminal(
      new URL("./render.mts", import.meta.url),
      `m.render(${JSON.stringify([p])}, "reviewer-alpha", ${JSON.stringify(target)})`,
    );
    const row = output
      .split("\n")
      .find((line) => /^[✓✗? ] #1\*\s/.test(stripVTControlCharacters(line)));
    const link = (name: string, text: string) =>
      "\u001B]8;;https://github.com/" + name + "\u001B\\" + text + "\u001B]8;;\u001B\\";
    const expected = "\u001B[32m" + link(login, label) + "\u001B[39m";
    expect(
      row?.endsWith(multiple ? expected + ", " + link("Reviewer-beta", "Revie") : expected),
    ).toBe(true);
  },
);
test("端末では一覧と対応表のReviewer名をGitHubアカウントへのリンクにする", () => {
  const script = fileURLToPath(new URL("./render.mts", import.meta.url));
  const p = pr();
  p.reviewRequests = [{ login: "alpha-reviewer" }, { login: "bravo-reviewer" }];
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `process.stdout.isTTY = true;
process.stdout.write((await import(${JSON.stringify(script)})).render(${JSON.stringify([p])}, "author", ${JSON.stringify(target)}));`,
    ],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  expect(result.status).toBe(0);
  const link = (login: string, label: string) =>
    "\u001B]8;;https://github.com/" + login + "\u001B\\" + label + "\u001B]8;;\u001B\\";
  expect(result.stdout.split(link("alpha-reviewer", "alpha"))).toHaveLength(3);
  expect(result.stdout.split(link("bravo-reviewer", "bravo"))).toHaveLength(3);
  expect(result.stdout).toContain(link("alpha-reviewer", "alpha-reviewer"));
  expect(result.stdout).toContain(link("bravo-reviewer", "bravo-reviewer"));
});
