import { cell } from "./cell.mts";
import { clean } from "./clean.mts";
import { facts } from "./facts.mts";
import { indicator } from "./indicator.mts";
import { mergeOrder } from "./merge-order.mts";
import { parentOf } from "./parent-of.mts";
import { prNumber } from "./pr-number.mts";
import { relativeTime } from "./relative-time.mts";
import { reviewerNames } from "./reviewer-names.mts";
import { styled } from "./styled.mts";
import type { PR, Target } from "./types.mts";
import { width } from "./width.mts";

export const render = (
  all: PR[],
  author: string,
  target: Target,
  warnings: string[] = [],
  now = Date.now(),
): string => {
  const ordered = mergeOrder(all, author, target.trunk);
  const selectedAuthor = author.toLowerCase();
  const title = (pr: PR): string =>
    (pr.author.login.toLowerCase() !== selectedAuthor ? "[parent] " : "") + clean(pr.title);
  const roots = new Map<string, PR[]>();
  const children = new Map<number, PR[]>();
  for (const pr of ordered) {
    const parent = parentOf(ordered, pr, target.trunk);
    if (parent) {
      const siblings = children.get(parent.number) ?? [];
      siblings.push(pr);
      children.set(parent.number, siblings);
    } else {
      const siblings = roots.get(pr.baseRefName) ?? [];
      siblings.push(pr);
      roots.set(pr.baseRefName, siblings);
    }
  }
  const displayOrder: PR[] = [];
  const lines = [target.repo + " / " + author, "", styled("bold", "Stack"), ""];
  const draw = (siblings: PR[], prefix: string): void => {
    siblings.forEach((pr, index) => {
      const last = index === siblings.length - 1;
      lines.push(
        prefix +
          (last ? "└─ " : "├─ ") +
          prNumber(target.repo, pr.number) +
          " " +
          styled("dim", title(pr)),
      );
      displayOrder.push(pr);
      draw(children.get(pr.number) ?? [], prefix + (last ? "   " : "│  "));
    });
  };
  for (const [base, siblings] of roots) {
    lines.push(clean(base));
    draw(siblings, "");
  }
  if (!ordered.length) {
    lines.push("No open PRs");
  }
  lines.push("", styled("bold", "PRs"));
  const titleWidth = Math.max(width("Title"), ...displayOrder.map((pr) => width(title(pr))));
  const trunkWidth = width(clean(target.trunk));
  lines.push(
    "",
    styled(
      ["bold", "dim"],
      [
        cell("PR", 7),
        cell("Title", titleWidth),
        cell(target.trunk, trunkWidth),
        cell("Conflict", 8),
        cell("Approved", 8),
        cell("Fixed", 5),
        cell("Commit", 6, "right"),
        cell("Comment", 7, "right"),
        "Reviewer",
      ].join(" "),
    ),
  );
  const abbreviations = new Map<string, string[]>();
  const reviewers = (names: string[] | null): string => {
    if (names === null) {
      return "Unknown";
    }
    if (names.length < 2) {
      return names.join("") || "-";
    }
    return names
      .map((name) => {
        const short = [...name].slice(0, 5).join("");
        if (short !== name) {
          abbreviations.set(short, reviewerNames([...(abbreviations.get(short) ?? []), name]));
        }
        return short;
      })
      .join(", ");
  };
  displayOrder.forEach((pr) => {
    const f = facts(pr);
    const highlight =
      pr.baseRefName === target.trunk && f.approved === true && f.conflict === false
        ? "greenBright"
        : "none";
    lines.push(
      [
        styled(highlight, prNumber(target.repo, pr.number, 7)),
        styled(highlight, cell(title(pr), titleWidth)),
        indicator(pr.baseRefName === target.trunk, trunkWidth),
        indicator(f.conflict, 8, "red"),
        indicator(f.approved, 8),
        indicator(f.after === "不明" ? null : f.after === "あり", 5),
        cell(relativeTime(f.commitAt, now), 6, "right"),
        cell(relativeTime(f.commentAt, now), 7, "right"),
        cell(reviewers(f.reviewers), 0),
      ].join(" "),
    );
  });
  lines.push("");
  if (abbreviations.size) {
    lines.push(styled("bold", "Reviewers"), "");
    for (const short of reviewerNames([...abbreviations.keys()])) {
      lines.push(cell(short, 5) + "  " + (abbreviations.get(short) ?? []).join(", "));
    }
    lines.push("");
  }
  warnings.forEach((w) => lines.push("Warning: " + clean(w)));
  return lines.join("\n");
};
