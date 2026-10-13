import { Temporal } from "temporal-polyfill-lite";

import { instant } from "./instant.mts";

export const latest = (values: (string | null | undefined)[]): string | null => {
  const valid = values.flatMap((value) => {
    const time = instant(value);
    return value && time ? [{ value, time }] : [];
  });
  return valid.sort((a, b) => Temporal.Instant.compare(b.time, a.time))[0]?.value ?? null;
};
