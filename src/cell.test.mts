import { expect, test } from "vitest";

import { cell } from "./cell.mts";
import { inTerminal, withStdoutTTY } from "./fixtures.mts";

const module = new URL("./cell.mts", import.meta.url);

test("表示幅に合わせて左揃えなら右に、右揃えなら左に空白を詰める", () => {
  withStdoutTTY(false, () => {
    expect(cell("ab", 4)).toBe("ab  ");
    expect(cell("テスト", 8)).toBe("テスト  ");
    expect(cell("ab", 4, "right")).toBe("  ab");
  });
});
test("幅を超える値は切り詰めない", () => {
  expect(withStdoutTTY(false, () => cell("abcdef", 3))).toBe("abcdef");
});
test("値から制御文字と改行を除いて表示する", () => {
  expect(withStdoutTTY(false, () => cell("a\n\u001Bb", 0))).toBe("a b");
});
test("書記素を保持する指定でも整形と幅による空白埋めを行う", () => {
  expect(
    withStdoutTTY(false, () =>
      cell(" 👩‍💻\n\u001B", 4, "left", undefined, { preserveGraphemes: true }),
    ),
  ).toBe("👩‍💻  ");
});
test("端末では ✓ を緑、- を薄色、? を黄にし、色の指定があればそれを優先する", () => {
  const output = inTerminal(
    module,
    'JSON.stringify([m.cell("✓", 1), m.cell("-", 1), m.cell("?", 1), m.cell("✓", 1, "left", "red"), m.cell("text", 4)])',
  );
  expect(JSON.parse(output)).toEqual([
    "\u001B[32m✓\u001B[39m",
    "\u001B[2m-\u001B[22m",
    "\u001B[33m?\u001B[39m",
    "\u001B[31m✓\u001B[39m",
    "text",
  ]);
});
