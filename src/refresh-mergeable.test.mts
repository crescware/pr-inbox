import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { pr, target } from "./fixtures.mts";
import { gh } from "./gh.mts";
import { refreshMergeable } from "./refresh-mergeable.mts";
import { sleep } from "./sleep.mts";
import type { Detail } from "./types.mts";

vi.mock("./gh.mts", () => ({ gh: vi.fn() }));
vi.mock("./sleep.mts", () => ({ sleep: vi.fn() }));

/** 問い合わせ 1 回ごとに、PR 番号と mergeable の組を返す */
const respond = (...answers: Record<number, Detail["mergeable"]>[]) => {
  for (const answer of answers) {
    const repository = Object.fromEntries(
      Object.entries(answer).map(([number, mergeable]) => ["p" + number, { mergeable }]),
    );
    vi.mocked(gh).mockReturnValueOnce({ data: { repository } });
  }
};
const unknown = (number: number) => {
  const p = pr(number, "main", "feature-" + number);
  p.detail.mergeable = "UNKNOWN";
  return p;
};
const query = (call: number) =>
  vi.mocked(gh).mock.calls[call]?.[0].find((arg) => arg.startsWith("query=")) ?? "";

beforeEach(() => {
  vi.mocked(gh).mockReset();
  vi.mocked(sleep).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("UNKNOWN の PR がなければ待たずに問い合わせもしない", () => {
  expect(refreshMergeable(target, [pr(1)])).toEqual([]);
  expect(sleep).not.toHaveBeenCalled();
  expect(gh).not.toHaveBeenCalled();
});
test("UNKNOWN の PR だけを 2 秒待ってから問い合わせ直し、判定を反映する", () => {
  const known = pr(1);
  const pending = unknown(2);
  respond({ 2: "CONFLICTING" });
  expect(refreshMergeable(target, [known, pending])).toEqual([]);
  expect(sleep).toHaveBeenCalledWith(2000);
  expect(gh).toHaveBeenCalledTimes(1);
  expect(query(0)).toContain("p2:pullRequest(number:2){mergeable}");
  expect(query(0)).not.toContain("number:1");
  expect(pending.detail.mergeable).toBe("CONFLICTING");
});
test("判定が出なかった PR だけを次に問い合わせ、3 回で打ち切って UNKNOWN のまま残す", () => {
  const first = unknown(1);
  const second = unknown(2);
  respond({ 1: "MERGEABLE", 2: "UNKNOWN" }, { 2: "UNKNOWN" }, { 2: "UNKNOWN" });
  expect(refreshMergeable(target, [first, second])).toEqual([]);
  expect(sleep).toHaveBeenCalledTimes(3);
  expect(gh).toHaveBeenCalledTimes(3);
  expect(query(1)).not.toContain("number:1");
  expect(first.detail.mergeable).toBe("MERGEABLE");
  expect(second.detail.mergeable).toBe("UNKNOWN");
});
test("待っている PR を標準エラー出力に表示する", () => {
  respond({ 1: "UNKNOWN", 2: "MERGEABLE" }, { 1: "MERGEABLE" });
  refreshMergeable(target, [unknown(1), unknown(2)]);
  expect(vi.mocked(console.error).mock.calls.map(([message]) => message)).toEqual([
    "Waiting for mergeability: #1, #2",
    "Waiting for mergeability: #1",
  ]);
});
test("リポジトリ名はクエリに埋め込まず GraphQL の変数で渡す", () => {
  respond({ 1: "MERGEABLE" });
  refreshMergeable({ repo: "other/repo", trunk: "main" }, [unknown(1)]);
  expect(vi.mocked(gh).mock.calls[0]?.[0].slice(0, 6)).toEqual([
    "api",
    "graphql",
    "-f",
    "owner=other",
    "-f",
    "name=repo",
  ]);
  expect(query(0)).not.toContain("other");
});
test("問い合わせに失敗したら警告を返し、UNKNOWN のまま残す", () => {
  const pending = unknown(1);
  vi.mocked(gh).mockImplementation(() => {
    throw new Error("timeout");
  });
  expect(refreshMergeable(target, [pending])).toEqual([
    "Failed to fetch mergeability of #1: timeout",
  ]);
  expect(gh).toHaveBeenCalledTimes(1);
  expect(pending.detail.mergeable).toBe("UNKNOWN");
});
test("詳細を取得できなかった PR は対象にしない", () => {
  expect(refreshMergeable(target, [{ ...pr(1), detail: undefined }])).toEqual([]);
  expect(gh).not.toHaveBeenCalled();
});
