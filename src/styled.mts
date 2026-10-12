import { styleText } from "node:util";

export const styled = (
  format: Parameters<typeof styleText>[0] | "none",
  text: string,
): string => {
  return process.stdout.isTTY && format !== "none"
    ? styleText(format, text)
    : text;
};
