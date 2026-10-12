import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "vitest";

import { pr, review, target } from "./fixtures.mts";
import { render } from "./render.mts";
import type { PR } from "./types.mts";

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
  other.title = "端末幅が狭くても絶対に省略しないとても長い日本語と English の件名".repeat(3);
  const output = render([other, leaf, child, sibling, parent], "author", target);
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
  first.detail.reviews.nodes = [review("COMMENTED", "指摘", "2026-09-29T12:00:00Z")];
  first.detail.commits.nodes[0].commit.committedDate = "2026-10-09T02:00:00Z";
  const second = pr(2);
  second.title = "Second";
  second.detail.reviews.nodes = [review("COMMENTED", "指摘", "2026-10-09T11:51:00Z")];
  second.detail.commits.nodes[0].commit.committedDate = "2026-10-09T11:59:00Z";
  const output = render([first, second], "author", target, [], Date.parse("2026-10-09T12:00:00Z"));
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
  const [header = "", ...rows] = output.split("\n").filter((line) => /^(?:PR\s|#\d+\s)/.test(line));
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
  expect(render([], "author", target, ["Fetch failed"])).toMatch(/\nWarning: Fetch failed$/);
});
test("対応ターミナルだけ色付けし、パイプ出力と NO_COLOR では色を付けない", () => {
  const script = fileURLToPath(new URL("./render.mts", import.meta.url));
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
      expect(result.stdout).toContain("\u001B]8;;\u001B\\ \u001B[2mテスト\u001B[22m");
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
          .find((line) => stripVTControlCharacters(line).startsWith("#" + number + " "));
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
  const rows = output.split("\n").filter((line) => /^#\d+\s/.test(line));
  expect(rows[0]).toMatch(/alpha, bravo$/);
  expect(rows[1]).toMatch(/single-reviewer$/);
  expect(rows[2]).toMatch(/alpha, delta$/);
  expect(output.split("\nReviewers\n\n")[1]).toBe(
    ["alpha  alpha-reviewer", "bravo  bravo-reviewer", "delta  delta-reviewer", ""].join("\n"),
  );
  expect(output.indexOf("\nReviewers\n")).toBeGreaterThan(output.indexOf("#3 "));
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
