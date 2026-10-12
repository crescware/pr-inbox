import { cell } from "./cell.mts";

export const indicator = (
  value: boolean | null,
  size: number,
  color: "green" | "red" = "green",
): string => {
  return cell(
    value === null ? "?" : value ? "✓" : "-",
    size,
    "right",
    value === true ? color : undefined,
  );
};
