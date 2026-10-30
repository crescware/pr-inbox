import { clean, type CleanOptions } from "./clean.mts";
import { styled } from "./styled.mts";
import { width } from "./width.mts";

export const cell = (
  value: unknown,
  size: number,
  align: "left" | "right" = "left",
  color?: "green" | "red",
  options?: CleanOptions,
): string => {
  const text = clean(value, options);
  const padding = " ".repeat(Math.max(0, size - width(text)));
  const padded = align === "right" ? padding + text : text + padding;
  const style =
    color ?? (text === "✓" ? "green" : text === "-" ? "dim" : text === "?" ? "yellow" : "none");
  return styled(style, padded);
};
