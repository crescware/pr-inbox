import { Temporal } from "temporal-polyfill-lite";

/**
 * 日付が変わっていれば日付の差を d で、同じ日なら経過時間を h・m で表す。
 * 日付は timeZone（省略時は実行環境のタイムゾーン）で判定する。
 */
export const relativeTime = (
  value: string | null,
  now: number,
  timeZone: string = Temporal.Now.timeZoneId(),
): string => {
  if (!value) {
    return "-";
  }
  let time: Temporal.Instant;
  try {
    time = Temporal.Instant.from(value);
  } catch {
    return "?";
  }
  const current = Temporal.Instant.fromEpochMilliseconds(now);
  const days = time
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .until(current.toZonedDateTimeISO(timeZone).toPlainDate()).days;
  if (days !== 0) {
    return days + "d";
  }
  const elapsed = time.until(current).total("minutes");
  const minutes = Math.floor(Math.abs(elapsed));
  const sign = elapsed < 0 && minutes > 0 ? "-" : "";
  return minutes < 60 ? sign + minutes + "m" : sign + Math.floor(minutes / 60) + "h";
};
