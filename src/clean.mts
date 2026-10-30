export type CleanOptions = { preserveGraphemes?: boolean };

export const clean = (value: unknown, { preserveGraphemes = false }: CleanOptions = {}): string => {
  return String(value ?? "")
    .replaceAll(/[\r\n\t]+/g, " ")
    .replaceAll(
      // ZWNJ/ZWJ and emoji tag characters can be part of a grapheme cluster.
      preserveGraphemes
        ? /(?!\u200C|\u200D|[\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}]/gu
        : /[\p{Cc}\p{Cf}]/gu,
      "",
    )
    .replaceAll(/\s+/g, " ")
    .trim();
};
