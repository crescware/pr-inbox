import { expect, test } from "vitest";

import { clean } from "./clean.mts";

test("端末制御文字と文字方向制御文字を除去する", () => {
  expect(clean("a\u001B]bad\u0007‮b\n c")).toBe("a]badb c");
});
test("null と undefined は空文字にし、それ以外は文字列にする", () => {
  expect(clean(null)).toBe("");
  expect(clean(undefined)).toBe("");
  expect(clean(42)).toBe("42");
});
test("改行・タブ・連続する空白を一つにまとめ、前後の空白を除く", () => {
  expect(clean("  a\r\n\tb   c  ")).toBe("a b c");
});
