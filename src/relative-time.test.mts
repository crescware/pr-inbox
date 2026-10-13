import { Temporal } from "temporal-polyfill-lite";
import { expect, test } from "vitest";

import { relativeTime } from "./relative-time.mts";

/**
 * テストの基準時刻。年月に特別な意味はなく、次の条件で選んだ。
 * - 年は、テストを書いた時点の 2026 年
 * - 日は、前後数日（6〜11 日）のテストデータが月をまたがない 10 日
 * - 時刻は、同じ日の 0:00 から 12 時間あり、同じ日の経過時間（m・h）を幅広く試せる正午。
 *   UTC では 3:00 になるので、東京では同じ日でも UTC では前日になる時刻（東京 5:00）を作れる
 */
const now = Temporal.Instant.from("2026-01-10T12:00:00+09:00");

test.each([
  // 経過は 3 日 21 時間
  { value: "2026-01-06T15:00:00+09:00", expected: "4d" },
  // 経過は 3 日 13 時間
  { value: "2026-01-06T23:00:00+09:00", expected: "4d" },
  // 経過は 13 時間
  { value: "2026-01-09T23:00:00+09:00", expected: "1d" },
])(
  "日付が変わっていれば、24 時間未満でも経過時間ではなく日付の差を d で表示する: $value → $expected",
  ({ value, expected }) => {
    expect(relativeTime(value, now, "Asia/Tokyo")).toBe(expected);
  },
);
test.each([
  { minutes: 0, expected: "0m" },
  { minutes: 1, expected: "1m" },
  { minutes: 59, expected: "59m" },
  { minutes: 60, expected: "1h" },
  { minutes: 719, expected: "11h" },
  { minutes: 720, expected: "12h" },
])(
  "同じ日なら経過時間を m・h で表示し、単位未満は切り捨てる: $minutes 分前 → $expected",
  ({ minutes, expected }) => {
    expect(relativeTime(now.subtract({ minutes }).toString(), now, "Asia/Tokyo")).toBe(expected);
  },
);
test.each([
  { value: "2026-01-10T13:00:00+09:00", expected: "-1h" },
  { value: "2026-01-11T09:00:00+09:00", expected: "-1d" },
])("未来の日時は負の値で表示する: $value → $expected", ({ value, expected }) => {
  expect(relativeTime(value, now, "Asia/Tokyo")).toBe(expected);
});
test.each([
  { timeZone: "Asia/Tokyo", expected: "7h" },
  { timeZone: "UTC", expected: "1d" },
])("日付は指定したタイムゾーンで判定する: $timeZone → $expected", ({ timeZone, expected }) => {
  // 東京では同じ日の 5:00、UTC では前日の 20:00
  expect(relativeTime("2026-01-10T05:00:00+09:00", now, timeZone)).toBe(expected);
});
test.each([
  { value: null, expected: "-" },
  { value: "invalid", expected: "?" },
])(
  "日時がなければ - を、解釈できなければ ? を表示する: $value → $expected",
  ({ value, expected }) => {
    expect(relativeTime(value, now, "Asia/Tokyo")).toBe(expected);
  },
);
