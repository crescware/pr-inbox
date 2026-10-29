import { expect, test } from "vitest";

import { pr, review } from "./fixtures.mts";
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
test("指定ユーザーがレビュー依頼先の PR を大文字小文字に関係なく含める", () => {
  const requested = pr(1, "main", "requested");
  requested.reviewRequests = [{ login: "Selected-User" }];
  const other = pr(2, "main", "other");
  other.reviewRequests = [{ login: "another-reviewer" }];
  const team = pr(3, "main", "team");
  team.reviewRequests = [{ slug: "selected-user", name: "Selected-User" }];
  expect(
    mergeOrder([other, team, requested], "selected-user", "main").map((p) => p.number),
  ).toEqual([1]);
});
test.each(["COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"])(
  "指定ユーザーが %s のレビューを投稿済みの PR は依頼がなくても含める",
  (state) => {
    const reviewed = pr();
    reviewed.detail.reviews.nodes = [review(state, "", undefined, "Selected-User")];
    expect(mergeOrder([reviewed], "selected-user", "main").map((p) => p.number)).toEqual([1]);
  },
);
test("検索でレビュー済みと確認した PR は詳細がなくても指定ユーザーの対象に含める", () => {
  const reviewed = { ...pr(), detail: undefined, reviewedBy: "Selected-User" };
  expect(mergeOrder([reviewed], "selected-user", "main").map((p) => p.number)).toEqual([1]);
  expect(mergeOrder([reviewed], "another-reviewer", "main")).toEqual([]);
});
test("下書き・削除済みユーザー・別ユーザーのレビューだけでは PR を含めない", () => {
  const other = pr();
  other.detail.reviews.nodes = [
    review("PENDING", "", undefined, "selected-user"),
    { ...review("APPROVED"), author: null },
    review("COMMENTED", "", undefined, "another-reviewer"),
  ];
  expect(mergeOrder([other], "selected-user", "main")).toEqual([]);
});
test("レビュー対象の祖先を含め、作者・依頼先・投稿者が重複しても一度だけ並べる", () => {
  const ancestor = pr(8, "main", "ancestor");
  const parent = pr(5, "ancestor", "parent");
  parent.reviewRequests = [{ login: "selected-user" }];
  parent.detail.reviews.nodes = [review("APPROVED", "", undefined, "selected-user")];
  const own = pr(2, "parent", "own");
  own.author.login = "selected-user";
  own.reviewRequests = [{ login: "selected-user" }];
  const unrelatedChild = pr(3, "parent", "unrelated-child");
  expect(
    mergeOrder([own, unrelatedChild, parent, ancestor], "selected-user", "main").map(
      (p) => p.number,
    ),
  ).toEqual([8, 5, 2]);
  expect(
    mergeOrder([unrelatedChild, parent, ancestor], "selected-user", "main").map((p) => p.number),
  ).toEqual([8, 5]);
});
