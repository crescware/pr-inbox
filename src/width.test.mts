import { expect, test } from "vitest";

import { width } from "./width.mts";

test("半角文字と記号は幅1として数える", () => {
  expect(width("abc")).toBe(3);
  expect(width("✓")).toBe(1);
});
test("かな・漢字・ハングル・全角記号・絵文字は幅2として数える", () => {
  expect(width("テスト")).toBe(6);
  expect(width("漢字")).toBe(4);
  expect(width("한글")).toBe(4);
  expect(width("（）")).toBe(4);
  expect(width("😀")).toBe(2);
});
test("結合文字は幅0として数える", () => {
  expect(width("が")).toBe(2);
  expect(width("é")).toBe(1);
});
