import { cell } from "./cell.mts";

export const prNumber = (repo: string, number: number, size = 0): string => {
  const label = "#" + number;
  const padded = cell(label, size);
  return process.stdout.isTTY
    ? "\u001B]8;;https://github.com/" +
        repo +
        "/pull/" +
        number +
        "\u001B\\" +
        label +
        "\u001B]8;;\u001B\\" +
        padded.slice(label.length)
    : padded;
};
