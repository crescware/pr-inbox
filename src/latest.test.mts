import { expect, test } from "vitest";

import { latest } from "./latest.mts";

test("最も新しい日時を返す", () => {
  const values = [
    "2026-10-09T10:00:00Z",
    "2026-10-09T12:00:00Z",
    "2026-10-09T11:00:00Z",
  ];
  expect(latest(values)).toBe("2026-10-09T12:00:00Z");
});
test("null・undefined・解釈できない日時は無視する", () => {
  const values = [null, "invalid", undefined, "2026-10-09T10:00:00Z"];
  expect(latest(values)).toBe("2026-10-09T10:00:00Z");
});
test("有効な日時がなければ null を返す", () => {
  expect(latest([])).toBeNull();
  expect(latest([null, "invalid"])).toBeNull();
});
