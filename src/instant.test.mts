import { Temporal } from "temporal-polyfill-lite";
import { expect, test } from "vitest";

import { instant } from "./instant.mts";

test("ISO 8601 の日時を Temporal.Instant にする", () => {
  expect(instant("2026-10-09T06:22:38Z")?.epochMilliseconds).toBe(
    Temporal.Instant.from("2026-10-09T06:22:38Z").epochMilliseconds,
  );
  expect(instant("2026-10-09T15:22:38+09:00")?.toString()).toBe("2026-10-09T06:22:38Z");
});
test("空の値や解釈できない値は null にする", () => {
  expect(instant(null)).toBeNull();
  expect(instant(undefined)).toBeNull();
  expect(instant("")).toBeNull();
  expect(instant("invalid")).toBeNull();
});
