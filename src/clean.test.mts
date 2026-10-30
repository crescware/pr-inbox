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
test("指定した場合だけ書記素の結合文字を保ち、端末・文字方向制御文字は除去する", () => {
  const text = "  👩‍💻\n\t👍🏽 🇯🇵 é  \u001B\u0007\u202E\u200B";
  expect(clean(text, { preserveGraphemes: true })).toBe("👩‍💻 👍🏽 🇯🇵 é");
  expect(clean(text)).toBe("👩💻 👍🏽 🇯🇵 é");
});
test("書記素を保つ場合はZWNJと絵文字のタグ文字も除去しない", () => {
  const flag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
  const text = "a\u200Cb " + flag;
  expect(clean(text, { preserveGraphemes: true })).toBe(text);
});
