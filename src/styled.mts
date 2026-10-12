import { styleText } from "node:util";

export const styled = (
  format: Parameters<typeof styleText>[0],
  text: string,
): string => {
  return process.stdout.isTTY ? styleText(format, text) : text;
};
