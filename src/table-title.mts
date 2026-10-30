import { clean } from "./clean.mts";
import { width } from "./width.mts";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const maxWidth = 60;
const suffix = "...";

export const tableTitle = (value: string): string => {
  const text = clean(value, { preserveGraphemes: true });
  if (width(text) <= maxWidth) {
    return text;
  }
  const limit = maxWidth - width(suffix);
  let prefix = "";
  let used = 0;
  for (const { segment } of segmenter.segment(text)) {
    const size = width(segment);
    if (used + size > limit) {
      break;
    }
    prefix += segment;
    used += size;
  }
  return prefix + suffix;
};
