import { Temporal } from "temporal-polyfill-lite";

/** ISO 8601 の日時を Temporal.Instant にする。空や解釈できない値は null */
export const instant = (value: string | null | undefined): Temporal.Instant | null => {
  if (!value) {
    return null;
  }
  try {
    return Temporal.Instant.from(value);
  } catch {
    return null;
  }
};
