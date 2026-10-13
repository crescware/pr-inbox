import { expect, test } from "vitest";

import { instant } from "./instant.mts";

test.each([
  { value: "2026-01-10T03:00:00Z", expected: "2026-01-10T03:00:00Z" },
  { value: "2026-01-10T12:00:00+09:00", expected: "2026-01-10T03:00:00Z" },
])("ISO 8601 の日時を Temporal.Instant にする: $value → $expected", ({ value, expected }) => {
  expect(instant(value)?.toString()).toBe(expected);
});
test.each([
  { label: "null", value: null },
  { label: "undefined", value: undefined },
  { label: "空文字", value: "" },
  { label: "日時でない文字列", value: "invalid" },
])("空の値や解釈できない値は null にする: $label", ({ value }) => {
  expect(instant(value)).toBeNull();
});
