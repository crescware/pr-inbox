import { expect, test } from "vitest";

import { withStdoutTTY } from "./fixtures.mts";
import { prNumber } from "./pr-number.mts";

test("端末でなければリンクを付けずに番号を表示幅まで埋める", () => {
  expect(withStdoutTTY(false, () => prNumber("org/repo", 12, 5))).toBe("#12  ");
});
test("端末では番号だけを PR へのリンクにし、埋めた空白はリンクに含めない", () => {
  expect(withStdoutTTY(true, () => prNumber("org/repo", 12, 5))).toBe(
    "\u001B]8;;https://github.com/org/repo/pull/12\u001B\\#12\u001B]8;;\u001B\\  ",
  );
});
