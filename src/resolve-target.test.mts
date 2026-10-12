import { beforeEach, expect, test, vi } from "vitest";

import { gh } from "./gh.mts";
import { resolveTarget } from "./resolve-target.mts";

vi.mock("./gh.mts", () => ({ gh: vi.fn() }));

const view = (nameWithOwner: string, branch: string | null) => ({
  nameWithOwner,
  defaultBranchRef: branch === null ? null : { name: branch },
});

beforeEach(() => {
  vi.mocked(gh).mockReset();
});

test("指定がなければカレントディレクトリのリポジトリとデフォルトブランチを使う", () => {
  vi.mocked(gh).mockReturnValue(view("current/repo", "trunk"));
  expect(resolveTarget()).toEqual({ repo: "current/repo", trunk: "trunk" });
  expect(gh).toHaveBeenCalledWith(["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]);
});
test("リポジトリの指定があればそのリポジトリのデフォルトブランチを使う", () => {
  vi.mocked(gh).mockReturnValue(view("other/repo", "trunk"));
  expect(resolveTarget("other/repo")).toEqual({
    repo: "other/repo",
    trunk: "trunk",
  });
  expect(gh).toHaveBeenCalledWith([
    "repo",
    "view",
    "other/repo",
    "--json",
    "nameWithOwner,defaultBranchRef",
  ]);
});
test("リポジトリ名は GitHub が返す表記を使う", () => {
  vi.mocked(gh).mockReturnValue(view("other/repo", "main"));
  expect(resolveTarget("Other/Repo").repo).toBe("other/repo");
});
test("宛先ブランチの指定はデフォルトブランチより優先する", () => {
  vi.mocked(gh).mockReturnValue(view("current/repo", "trunk"));
  expect(resolveTarget(undefined, "release")).toEqual({
    repo: "current/repo",
    trunk: "release",
  });
});
test("リポジトリと宛先ブランチの両方の指定があれば GitHub に問い合わせない", () => {
  expect(resolveTarget("other/repo", "release")).toEqual({
    repo: "other/repo",
    trunk: "release",
  });
  expect(gh).not.toHaveBeenCalled();
});
test("カレントディレクトリからリポジトリを特定できなければ --repo を案内する", () => {
  vi.mocked(gh).mockImplementation(() => {
    throw new Error("fatal: not a git repository");
  });
  expect(() => resolveTarget()).toThrow(
    "Cannot determine the repository of the current directory; use --repo OWNER/REPO: fatal: not a git repository",
  );
});
test("指定したリポジトリを取得できなければ gh のエラーをそのまま伝える", () => {
  vi.mocked(gh).mockImplementation(() => {
    throw new Error("Could not resolve to a Repository");
  });
  expect(() => resolveTarget("other/repo")).toThrow(/^Could not resolve to a Repository$/);
});
test("デフォルトブランチを取得できなければ --trunk を案内する", () => {
  vi.mocked(gh).mockReturnValue(view("current/repo", null));
  expect(() => resolveTarget()).toThrow(
    "Cannot determine the default branch of current/repo; use --trunk BRANCH",
  );
});
