export const relativeTime = (value: string | null, now: number): string => {
  if (!value) {
    return "-";
  }
  const elapsed = now - Date.parse(value);
  if (!Number.isFinite(elapsed)) {
    return "?";
  }
  const minutes = Math.floor(Math.abs(elapsed) / 60_000);
  const sign = elapsed < 0 && minutes > 0 ? "-" : "";
  if (minutes < 60) {
    return sign + minutes + "m";
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? sign + hours + "h" : sign + Math.floor(hours / 24) + "d";
};
