import { expect, test } from "vitest";

import { pr } from "./fixtures.mts";
import { mergeOrder } from "./merge-order.mts";

test("PR 番号に関係なく親を先に並べ、独立した stack を分ける", () => {
  const parent = pr(4, "main", "parent");
  const child = pr(3, "parent", "child");
  const other = pr(51);
  expect(mergeOrder([child, other, parent], "author", "main").map((p) => p.number)).toEqual([
    4, 3, 51,
  ]);
});
test("main から release へのリリース PR を main 宛 PR の親にしない", () => {
  const release = pr(38, "release", "main");
  release.author.login = "another-author";
  expect(mergeOrder([pr(), release], "author", "main").map((p) => p.number)).toEqual([1]);
});
test("他の作者の親 PR は含めるが fork の同名ブランチは親にしない", () => {
  const parent = pr(2, "main", "parent");
  parent.author.login = "another-author";
  expect(mergeOrder([pr(1, "parent"), parent], "author", "main").map((p) => p.number)).toEqual([
    2, 1,
  ]);
  parent.isCrossRepository = true;
  expect(mergeOrder([pr(1, "parent"), parent], "author", "main").map((p) => p.number)).toEqual([1]);
});
test("stack が循環していたら merge 順を捏造せずエラーにする", () => {
  expect(() => mergeOrder([pr(1, "b", "a"), pr(2, "a", "b")], "author", "main")).toThrow(
    /Stack cycle/,
  );
});
test("指定した作者を大文字小文字に関係なく選び、他の作者は親だけを含める", () => {
  const parent = pr(2, "main", "parent");
  const child = pr(1, "parent", "child");
  child.author.login = "contributor";
  expect(mergeOrder([pr(3), child, parent], "Contributor", "main").map((p) => p.number)).toEqual([
    2, 1,
  ]);
  expect(mergeOrder([parent], "contributor", "main")).toEqual([]);
});
