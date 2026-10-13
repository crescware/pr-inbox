import { expect, test } from "vitest";

import { relativeTime } from "./relative-time.mts";

/** 2026-10-13 10:17:43 JST */
const now = Date.parse("2026-10-13T01:17:43Z");
const tokyo = (value: string) => relativeTime(value, now, "Asia/Tokyo");

test("日付が変わっていれば、経過時間ではなく日付の差を d で表示する", () => {
  // 10/9 15:22 JST。経過は 3 日 18 時間 55 分だが、日付の差は 4 日
  expect(tokyo("2026-10-09T06:22:38Z")).toBe("4d");
  // 10/9 23:00 JST。経過は 3 日 11 時間 17 分だが、日付の差は 4 日
  expect(tokyo("2026-10-09T14:00:00Z")).toBe("4d");
});
test("24 時間未満でも、前日のコミットは 1d と表示する", () => {
  // 10/12 23:00 JST。経過は 11 時間 17 分
  expect(tokyo("2026-10-12T14:00:00Z")).toBe("1d");
});
test("同じ日なら経過時間を m・h で表示し、単位未満は切り捨てる", () => {
  for (const [minutes, expected] of [
    [0, "0m"],
    [1, "1m"],
    [59, "59m"],
    [60, "1h"],
    // 10/13 00:00 JST。経過は 10 時間 17 分
    [617, "10h"],
  ] as const) {
    expect(tokyo(new Date(now - minutes * 60_000).toISOString())).toBe(expected);
  }
});
test("未来の日時は負の値で表示する", () => {
  // 10/13 11:17 JST
  expect(tokyo("2026-10-13T02:17:43Z")).toBe("-1h");
  // 10/14 09:00 JST
  expect(tokyo("2026-10-14T00:00:00Z")).toBe("-1d");
});
test("日付は指定したタイムゾーンで判定する", () => {
  // JST では 10/13 05:00 で同じ日、UTC では 10/12 20:00 で前日
  expect(relativeTime("2026-10-12T20:00:00Z", now, "Asia/Tokyo")).toBe("5h");
  expect(relativeTime("2026-10-12T20:00:00Z", now, "UTC")).toBe("1d");
});
test("日時がなければ - を、解釈できなければ ? を表示する", () => {
  expect(relativeTime(null, now, "Asia/Tokyo")).toBe("-");
  expect(tokyo("invalid")).toBe("?");
});
