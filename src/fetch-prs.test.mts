import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { fetchPRs } from "./fetch-prs.mts";
import { pr, target } from "./fixtures.mts";
import { gh } from "./gh.mts";
import type { PR } from "./types.mts";

vi.mock("./gh.mts", () => ({ gh: vi.fn() }));

/** gh pr list と gh api graphql の応答を prs から作る */
const respond = (prs: PR[], graphql?: () => unknown) => {
  vi.mocked(gh).mockImplementation((args: string[]) => {
    if (args[0] === "pr") {
      const list = prs.map((p) => ({ ...p, detail: undefined }));
      return JSON.parse(JSON.stringify(list));
    }
    if (graphql) {
      return graphql();
    }
    const details = Object.fromEntries(
      prs.map((p) => ["p" + p.number, p.detail]),
    );
    return { data: { repository: details } };
  });
};
const progress = () =>
  vi.mocked(console.error).mock.calls.map(([message]) => message);

beforeEach(() => {
  vi.mocked(gh).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("対象リポジトリの Open PR を取得し、詳細を 5 件ずつ取得する", () => {
  const prs = Array.from({ length: 6 }, (_, i) =>
    pr(i + 1, "main", "feature-" + (i + 1)),
  );
  respond(prs);
  const result = fetchPRs(target, "author");
  expect(vi.mocked(gh).mock.calls[0]?.[0].slice(0, 4)).toEqual([
    "pr",
    "list",
    "--repo",
    "org/repo",
  ]);
  expect(gh).toHaveBeenCalledTimes(3);
  expect(progress()).toEqual([
    "Fetching open PRs...",
    "Fetching details: #1, #2, #3, #4, #5",
    "Fetching details: #6",
  ]);
  expect(result.prs.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(result.warnings).toEqual([]);
});
test("指定した作者の PR と、その親の PR だけ詳細を取得する", () => {
  const parent = pr(1, "main", "parent");
  parent.author.login = "another-author";
  const other = pr(2, "main", "other");
  other.author.login = "another-author";
  respond([parent, other, pr(3, "parent", "child")]);
  fetchPRs(target, "author");
  expect(progress()).toContain("Fetching details: #1, #3");
});
test("リポジトリ名はクエリに埋め込まず GraphQL の変数で渡す", () => {
  respond([pr()]);
  fetchPRs({ repo: "other/repo", trunk: "main" }, "author");
  const graphql = vi.mocked(gh).mock.calls[1]?.[0] ?? [];
  expect(graphql.slice(0, 6)).toEqual([
    "api",
    "graphql",
    "-f",
    "owner=other",
    "-f",
    "name=repo",
  ]);
  expect(graphql.find((arg) => arg.startsWith("query="))).not.toContain(
    "other",
  );
});
test("詳細のブランチ名で一覧の値を置き換え、Open でなくなった PR は除く", () => {
  const renamed = pr(1, "main", "feature");
  renamed.detail.headRefName = "renamed";
  const merged = pr(2, "main", "merged");
  merged.detail.state = "MERGED";
  respond([renamed, merged]);
  const result = fetchPRs(target, "author");
  expect(result.prs.map((p) => [p.number, p.headRefName])).toEqual([
    [1, "renamed"],
  ]);
});
test("詳細を取得できなかった PR は警告にし、詳細なしで残す", () => {
  respond([pr(1), pr(2, "main", "second")], () => {
    throw new Error("timeout");
  });
  const result = fetchPRs(target, "author");
  expect(result.warnings).toEqual(["Failed to fetch #1, #2: timeout"]);
  expect(result.prs.map((p) => p.detail)).toEqual([undefined, undefined]);
});
test("応答に詳細が欠けていれば警告にする", () => {
  const first = pr(1);
  respond([first, pr(2, "main", "second")], () => ({
    data: { repository: { p1: first.detail } },
  }));
  const result = fetchPRs(target, "author");
  expect(result.warnings).toEqual([
    "Failed to fetch #1, #2: Missing details for #2",
  ]);
});
test("Open PR が 500 件以上あると merge 順を決められないのでエラーにする", () => {
  respond(Array.from({ length: 500 }, (_, i) => pr(i + 1)));
  expect(() => fetchPRs(target, "author")).toThrow(
    "Cannot determine merge order with 500 or more open PRs",
  );
});
