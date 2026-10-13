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
const tokyo = (value: string) => relativeTime(value, now, "Asia/Tokyo");

test("日付が変わっていれば、経過時間ではなく日付の差を d で表示する", () => {
  // 経過は 3 日 21 時間だが、日付の差は 4 日
  expect(tokyo("2026-01-06T15:00:00+09:00")).toBe("4d");
  expect(tokyo("2026-01-06T23:00:00+09:00")).toBe("4d");
});
test("24 時間未満でも、前日のコミットは 1d と表示する", () => {
  expect(tokyo("2026-01-09T23:00:00+09:00")).toBe("1d");
});
test("同じ日なら経過時間を m・h で表示し、単位未満は切り捨てる", () => {
  for (const [minutes, expected] of [
    [0, "0m"],
    [1, "1m"],
    [59, "59m"],
    [60, "1h"],
    [719, "11h"],
  ] as const) {
    expect(tokyo(now.subtract({ minutes }).toString())).toBe(expected);
  }
  expect(tokyo("2026-01-10T00:00:00+09:00")).toBe("12h");
});
test("未来の日時は負の値で表示する", () => {
  expect(tokyo("2026-01-10T13:00:00+09:00")).toBe("-1h");
  expect(tokyo("2026-01-11T09:00:00+09:00")).toBe("-1d");
});
test("日付は指定したタイムゾーンで判定する", () => {
  // 東京では同じ日の 5:00、UTC では前日の 20:00
  expect(relativeTime("2026-01-10T05:00:00+09:00", now, "Asia/Tokyo")).toBe("7h");
  expect(relativeTime("2026-01-10T05:00:00+09:00", now, "UTC")).toBe("1d");
});
test("日時がなければ - を、解釈できなければ ? を表示する", () => {
  expect(relativeTime(null, now, "Asia/Tokyo")).toBe("-");
  expect(tokyo("invalid")).toBe("?");
});
