import { expect, test } from "vitest";

import { reviewerNames } from "./reviewer-names.mts";

test("大文字小文字に関係なくアルファベット順に並べる", () => {
  expect(reviewerNames(["Zulu", "alpha", "Beta"])).toEqual(["alpha", "Beta", "Zulu"]);
});
test("大文字小文字だけが違う名前は一つにまとめ、後に出た表記を残す", () => {
  expect(reviewerNames(["reviewer-a", "Reviewer-A"])).toEqual(["Reviewer-A"]);
});
test("渡した配列は並べ替えない", () => {
  const names = ["b", "a"];
  reviewerNames(names);
  expect(names).toEqual(["b", "a"]);
});
