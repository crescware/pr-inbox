import { cell } from "./cell.mts";
import { prLink } from "./pr-link.mts";

export const prNumber = (repo: string, number: number, size = 0): string => {
  const label = "#" + number;
  const padded = cell(label, size);
  return prLink(repo, number, label) + padded.slice(label.length);
};
