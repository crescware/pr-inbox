/** timeZone での日付を、1970-01-01 からの日数で返す */
const calendarDay = (time: number, timeZone?: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(time);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
};

/**
 * 日付が変わっていれば日付の差を d で、同じ日なら経過時間を h・m で表す。
 * 日付は timeZone（省略時は実行環境のタイムゾーン）で判定する。
 */
export const relativeTime = (value: string | null, now: number, timeZone?: string): string => {
  if (!value) {
    return "-";
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return "?";
  }
  const days = calendarDay(now, timeZone) - calendarDay(time, timeZone);
  if (days !== 0) {
    return days + "d";
  }
  const elapsed = now - time;
  const minutes = Math.floor(Math.abs(elapsed) / 60_000);
  const sign = elapsed < 0 && minutes > 0 ? "-" : "";
  return minutes < 60 ? sign + minutes + "m" : sign + Math.floor(minutes / 60) + "h";
};
