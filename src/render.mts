import { Temporal } from "temporal-polyfill-lite";

import { cell } from "./cell.mts";
import { clean } from "./clean.mts";
import { facts } from "./facts.mts";
import { githubAccount } from "./github-account.mts";
import { indicator } from "./indicator.mts";
import { mergeOrder } from "./merge-order.mts";
import { parentOf } from "./parent-of.mts";
import { prLink } from "./pr-link.mts";
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
  now: Temporal.Instant = Temporal.Now.instant(),
  timeZone?: string,
): string => {
  const selectedAuthor = author.toLowerCase();
  const otherAuthor = (pr: PR): boolean => pr.author.login.toLowerCase() !== selectedAuthor;
  const numberLabel = (pr: PR): string => "#" + pr.number + (otherAuthor(pr) ? "*" : "");
  const displayNumber = (pr: PR, size = 0, highlight: "none" | "greenBright" = "none"): string =>
    styled(highlight, prNumber(target.repo, pr.number)) +
    (otherAuthor(pr) ? styled("green", "*") : "") +
    " ".repeat(Math.max(0, size - width(numberLabel(pr))));
  const groups = [
    { name: "Authored", ordered: mergeOrder(all, author, target.trunk, (pr) => !otherAuthor(pr)) },
    { name: "Reviewing", ordered: mergeOrder(all, author, target.trunk, otherAuthor) },
  ].filter((group) => group.ordered.length);
  const lines = [target.repo + " / " + author, ""];
  if (groups.some((group) => group.ordered.some(otherAuthor))) {
    lines.push(styled("green", "*") + " PR by another author", "");
  }
  const abbreviations = new Map<string, string[]>();
  const displayReviewer = (name: string, label = name): string =>
    styled(name.toLowerCase() === selectedAuthor ? "green" : "none", githubAccount(name, label));
  const reviewers = (names: string[] | null): string => {
    if (names === null) {
      return "Unknown";
    }
    if (names.length < 2) {
      return names.length ? displayReviewer(names[0] ?? "") : styled("dim", "-");
    }
    return names
      .map((name) => {
        const short = [...name].slice(0, 5).join("");
        if (short !== name) {
          abbreviations.set(short, reviewerNames([...(abbreviations.get(short) ?? []), name]));
        }
        return displayReviewer(name, short);
      })
      .join(", ");
  };
  const renderGroup = (ordered: PR[]): void => {
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
    lines.push(styled("bold", "Stack"), "");
    const draw = (siblings: PR[], prefix: string): void => {
      siblings.forEach((pr, index) => {
        const last = index === siblings.length - 1;
        lines.push(
          prefix +
            (last ? "└─ " : "├─ ") +
            displayNumber(pr) +
            " " +
            prLink(target.repo, pr.number, styled("dim", clean(pr.title))),
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
    const numberWidth = Math.max(7, ...displayOrder.map((pr) => width(numberLabel(pr))));
    const titleWidth = Math.max(
      width("Title"),
      ...displayOrder.map((pr) => width(clean(pr.title))),
    );
    const additionsWidth = Math.max(2, ...displayOrder.map((pr) => width("+" + pr.additions)));
    const deletionsWidth = Math.max(2, ...displayOrder.map((pr) => width("-" + pr.deletions)));
    const diffWidth = Math.max(width("Diff"), additionsWidth + 1 + deletionsWidth);
    const trunkWidth = width(clean(target.trunk));
    lines.push(
      "",
      styled(
        ["bold", "dim"],
        [
          cell("", 1),
          cell("PR", numberWidth),
          cell("Title", titleWidth),
          cell("Diff", diffWidth),
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
    displayOrder.forEach((pr) => {
      const f = facts(pr);
      const checks = { success: "✓", failure: "✗", pending: "?", none: "", unknown: "?" }[f.checks];
      const title = clean(pr.title);
      const additions = "+" + pr.additions;
      const deletions = "-" + pr.deletions;
      const highlight =
        !otherAuthor(pr) &&
        pr.baseRefName === target.trunk &&
        f.approved === true &&
        f.conflict === false
          ? "greenBright"
          : "none";
      lines.push(
        [
          cell(checks, 1, "left", f.checks === "failure" ? "red" : undefined),
          displayNumber(pr, numberWidth, highlight),
          prLink(target.repo, pr.number, styled(pr.isDraft ? "dim" : highlight, cell(title, 0))) +
            cell("", titleWidth - width(title)),
          " ".repeat(additionsWidth - width(additions)) +
            styled("green", additions) +
            " " +
            " ".repeat(deletionsWidth - width(deletions)) +
            styled("red", deletions) +
            " ".repeat(diffWidth - additionsWidth - 1 - deletionsWidth),
          indicator(pr.baseRefName === target.trunk, trunkWidth),
          indicator(f.conflict, 8, "red"),
          indicator(f.approved, 8),
          indicator(f.after === "不明" ? null : f.after === "あり", 5),
          cell(relativeTime(f.commitAt, now, timeZone), 6, "right"),
          cell(relativeTime(f.commentAt, now, timeZone), 7, "right"),
          reviewers(f.reviewers),
        ].join(" "),
      );
    });
    lines.push("");
  };
  if (!groups.length) {
    renderGroup([]);
  }
  for (const group of groups) {
    lines.push(styled("bold", group.name), "");
    renderGroup(group.ordered);
  }
  if (abbreviations.size) {
    lines.push(styled("bold", "Reviewers"), "");
    for (const short of reviewerNames([...abbreviations.keys()])) {
      const names = abbreviations.get(short) ?? [];
      lines.push(
        githubAccount(names[0] ?? short, short) +
          cell("", 5 - width(short)) +
          "  " +
          names.map((name) => githubAccount(name)).join(", "),
      );
    }
    lines.push("");
  }
  warnings.forEach((w) => lines.push("Warning: " + clean(w)));
  return lines.join("\n");
};
