import { expect, test } from "vitest";

import { pr } from "./fixtures.mts";
import { parentOf } from "./parent-of.mts";

test("宛先ブランチ宛の PR には親がない", () => {
  const p = pr(1, "main", "feature");
  const release = pr(2, "release", "main");
  expect(parentOf([p, release], p, "main")).toBeUndefined();
});
test("宛先のブランチを head にする PR を親として返す", () => {
  const parent = pr(1, "main", "parent");
  const child = pr(2, "parent", "child");
  expect(parentOf([parent, child], child, "main")).toBe(parent);
});
test("fork の同名ブランチは親にしない", () => {
  const parent = pr(1, "main", "parent");
  parent.isCrossRepository = true;
  const child = pr(2, "parent", "child");
  expect(parentOf([parent, child], child, "main")).toBeUndefined();
});
test("親の候補が複数あれば推測せずエラーにする", () => {
  const child = pr(3, "parent", "child");
  const candidates = [pr(1, "main", "parent"), pr(2, "main", "parent")];
  expect(() => parentOf([...candidates, child], child, "main")).toThrow("Ambiguous parent PR: #3");
});
