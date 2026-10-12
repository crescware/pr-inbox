import { expect, test } from "vitest";

import { relativeTime } from "./relative-time.mts";

test("相対時間を m・h・d で表示し、単位の境界を切り替える", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  for (const [minutes, expected] of [
    [0, "0m"],
    [1, "1m"],
    [59, "59m"],
    [60, "1h"],
    [1439, "23h"],
    [1440, "1d"],
    [2880, "2d"],
    [-60, "-1h"],
  ] as const) {
    expect(
      relativeTime(new Date(now - minutes * 60_000).toISOString(), now),
    ).toBe(expected);
  }
  expect(relativeTime(null, now)).toBe("-");
  expect(relativeTime("invalid", now)).toBe("?");
});
