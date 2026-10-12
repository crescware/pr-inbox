export const clean = (value: unknown): string => {
  return String(value ?? "")
    .replaceAll(/[\r\n\t]+/g, " ")
    .replaceAll(/[\p{Cc}\p{Cf}]/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();
};
